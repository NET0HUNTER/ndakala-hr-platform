# Flow 5: Payroll & Compensation — Operational & Architectural Guidance

**Module:** `src/modules/payroll/` (`engine.ts`, `service.ts`, `routes.ts`, `types.ts`)  
**Frontend:** `frontend/src/views/PayrollView.jsx`, `frontend/src/views/modals/PayslipModal.jsx`  
**Framework:** Kenya Statutory Framework 2026 (`KENYA_STATUTORY_2026`, `version: 2026.1`)  

---

## 1. Purpose & Domain Architecture

The Payroll & Compensation module administers effective-dated employee remuneration packages (`EmployeeSalaryAssignment`), pay groups (`PayrollPayGroup`), salary components (`PayrollComponent`), database-configured Kenyan statutory rule sets (`StatutoryRuleSet` / `StatutoryRule`), monthly payroll run lifecycles (`PayrollPeriod` / `PayrollRun`), itemized payslips (`PayrollSlip` / `PayrollLineItem`), variance reconciliation (`PayrollReconciliationReport`), masked EFT bank schedules (`BankScheduleExport`), and an in-memory what-if tax simulator (`/api/v1/payroll/simulate`).

---

## 2. Kenya Statutory Framework 2026 (`KENYA_STATUTORY_2026`)

| Code | Statutory Rule | Algorithm (`priority`) | Seeded Parameters (`src/seed.ts`) | Tax Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **`NSSF`** | National Social Security Fund (Year 4) | `TIERED_PENSION_CAPS` (`10`) | LEL `9,000`, UEL `108,000`, 6% EE / 6% ER (`tier1Max = 540`, `tier2Max = 5,940`, `totalMax = 6,480`) | `deductibleFromTaxablePay = true` |
| **`AHL`** | Affordable Housing Levy | `PERCENTAGE_OF_GROSS` (`20`) | `1.5%` Employee + `1.5%` Employer match on Gross | `deductibleFromTaxablePay = true` |
| **`SHIF`** | Social Health Insurance Fund | `PERCENTAGE_OF_GROSS` (`30`) | `2.75%` Employee (`employerRate = 0`, `minAmount = 300`) | `reliefPercentage = 0.15` (max KES `5,000`/mo via Insurance Relief) |
| **`PAYE`** | Individual Income Tax | `TIERED_BRACKETS` (`40`) | 5 bands: `10%` (`0–24,000`), `25%` (`24,000–32,333.33`), `30%` (`32,333.33–500,000`), `32.5%` (`500,000–800,000`), `35%` (`>800,000`); Personal Relief `2,400`/mo + 15% Insurance Relief (max `5,000`/mo) | Applied to `taxablePay = max(0, grossPay - NSSF_EE - AHL_EE)` |
| **`NITA`** | National Industrial Training Authority Levy | `FIXED_PER_EMPLOYEE` (`50`) | Flat `50` KES (`payer = EMPLOYER`) | Employer-only operational cost (`employeeAmount = 0`) |

---

## 3. Roles & Permission Matrix (`src/core/permissions/catalog.ts`)

| Role | Granted Payroll Permissions | Restricted Actions |
| :--- | :--- | :--- |
| **`employee` / `line_manager`** | `payroll.view_self` | Cannot view org runs, configure salaries, approve/lock runs, export EFTs, or view other employees' payslips |
| **`payroll_officer`** | `payroll.view_self`, `payroll.prepare`, `payroll.export`, `payroll.adjust`, `payroll.reports.view`, `payroll.config.manage` | Cannot review (`payroll.review`), executive-approve (`payroll.approve`), or lock (`payroll.lock`) |
| **`head_of_hr`** (`hr.lead`) | `payroll.view_self`, `payroll.review`, `payroll.reports.view`, `payroll.config.manage` | Cannot prepare/calculate/submit runs (`payroll.prepare`), approve (`payroll.approve`), lock (`payroll.lock`), export EFT (`payroll.export`), or adjust (`payroll.adjust`) |
| **`operations_director`** | All 9 payroll permissions (`view_self` through `config.manage`) | **Maker-Checker:** Cannot approve a `PayrollRun` or activate a `StatutoryRuleSet` that they themselves initiated/proposed |
| **`managing_partner`** | All 9 payroll permissions (`view_self` through `config.manage`) | **Maker-Checker:** Must be a distinct user from `preparerId` / `proposedById` to approve/activate |

---

## 4. Core Lifecycles & Governance Invariants

1. **Compensation Setup Wizard (Org Config):** Stored via `/api/v1/workspace/ui-config` (`key: 'PAYROLL_WIZARD'`), configuring base currency (`KES`), number format, applicability, and statutory defaults (`Overview -> 1 Salary Currencies -> 2 Applicability -> 3 Complete Setup -> Enable`).
2. **Effective-Dated Salary Assignment:** Assigning a package (`POST /api/v1/payroll/salaries/assign`) supersedes any previous `APPROVED` assignment (`status = 'SUPERSEDED'`, `endDate = effectiveDate`) and stores component JSON (`BASIC`, `HOUSE_ALLW`, `COMMUTER_ALLW`, etc.) plus `totalGrossSalary`.
3. **Payroll Run State Machine & Maker-Checker:**
   - `DRAFT` (`POST /payroll/periods/:id/runs`) -> `CALCULATED` (`POST /payroll/runs/:id/calculate`) -> `UNDER_REVIEW` (`POST /payroll/runs/:id/submit`) -> `APPROVED` (`POST /payroll/runs/:id/approve`) -> `LOCKED` (`POST /payroll/runs/:id/lock`).
   - **Maker-Checker (`approveRun`):** Rejects with `400 ValidationError` if `run.preparerId === actorId`.
   - **SHA-256 Lock & Immutability:** `lockRun` freezes totals and `ruleSetSnapshot` into a 64-char hex `auditHash` and marks the parent `PayrollPeriod` as `LOCKED`. `calculateRun` rejects `400` on `LOCKED` runs.
   - **Traceable Adjustment:** `POST /payroll/runs/:id/adjust` creates a child `ADJUSTMENT` run (`DRAFT`) linked only to a `LOCKED` parent run.
4. **Statutory Rule Set Maker-Checker:** Creating a draft `StatutoryRuleSet` records `proposedById`; `POST /payroll/rule-sets/:id/activate` supersedes the prior active set and rejects `400` if `proposedById === actorId`.
5. **PII Masking & EFT Bank Export:** Payslips store `accountNumberMasked` (`****1234`), `kraPinMasked`, `nssfNumberMasked`, `shifNumberMasked`. `POST /payroll/runs/:id/export-bank` logs `PAYROLL_BANK_SCHEDULE_EXPORTED` with SHA-256 `fileChecksum` and manual-upload-only notice.
6. **Upstream HR Integration (`calculateRun`):**
   - Mid-month joiner pro-rata factor calculated from active employment agreement `startDate` (`daysWorked / 22`).
   - Unpaid leave deductions derived from `LeaveLedgerEntry` (`entryType = 'LEAVE_TAKEN'`, `!leaveType.isPaid`) within the period dates.
