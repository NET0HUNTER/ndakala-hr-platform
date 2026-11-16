# Flow 6: Governance, Compliance, Document Vault & Employee Relations — Static Audit & E2E Verification Plan

## 1. Static Code Audit Findings (To Fix Before Live E2E)

| # | Area | Verified Defect | Target Fix |
| :---: | :--- | :--- | :--- |
| **F6-1** | **Training Assignment & Completion Payloads (`GovernanceView.jsx`, `App.jsx`)** | `GovernanceView.jsx:2633` sends `{ programmeId, employeeIds: [assignEmpId] }`, whereas `POST /api/v1/governance/training/assign` requires `{ programmeId, employeeId, dueDate }`. `GovernanceView.jsx:2652` and `App.jsx:575` send `{ scorePct: 100 }` instead of `{ scorePercent: 100, passed: true }`. Inline training/comms submits lack error handling (`try/catch`). | Fix `assign` payload to pass single `employeeId` + configurable `assignDueDate` input; fix `complete` payload to `{ scorePercent: 100, passed: true }`; wrap handlers cleanly in `try/catch` with `onShowToast`. |
| **F6-2** | **Policy Refusal, Missing Remind Endpoint & Maker-Checker UI (`GovernanceView.jsx`, `governance/routes.ts`)** | `GovernanceView.jsx:2554` sends `{ reason }` instead of `{ refusalReason }`. Line `2516` calls non-existent `POST /governance/policies/versions/:versionId/remind` (404). `Publish` button shows even when `latestVer.createdById === currentUser?.id` (self-publish 403) and lacks **New Version** creation UI. | Fix refusal payload to `{ refusalReason }` with inline reason input; implement `POST /governance/policies/versions/:versionId/remind` (logging reminder dispatch & count for `PENDING` acknowledgements); guard self-publish Maker-Checker cleanly in UI (`Maker-Checker: Author Cannot Self-Publish`) + add **+ New Version** draft action. |
| **F6-3** | **Document Vault Download Endpoint & Method Mismatch (`GovernanceView.jsx`)** | `GovernanceView.jsx:2746` calls `apiGet('/api/v1/documents/:id/download-token')`, whereas `documents/routes.ts:105` registers `POST /api/v1/documents/:id/token` (404 every download). Document upload also lacks UI controls to pick `category` and `securityClassification`. | Change token call to `apiPost('/api/v1/documents/' + d.id + '/token', {})` and add category/classification selects for `documents.upload`. |
| **F6-4** | **ER Case Close Route Missing, Handler Assignment & Appeals Hydration (`er/routes.ts`, `er/service.ts`, `GovernanceView.jsx`)** | `GovernanceView.jsx:2838` calls non-existent `POST /api/v1/er/cases/:id/close` (404). `er/routes.ts` `GET /er/cases` omits `appeals` / `hearings` / `decisions` relations so `c.appeals?.[0]?.id` is always undefined. `er/service.ts:createCase` leaves `primaryHandlerId` null when omitted, hiding newly created cases from non-partner handlers (`GET /er/cases`). `Submit Appeal` in `GovernanceView.jsx` defaults `appealOfficerId` to appellant/currentUser instead of selecting an authorized Appeal Officer (`operations_director` / `managing_partner`). | Add `POST /er/cases/:id/close` (`er.case.handle` + `assertCaseAccess`, auditing `ER_CASE_CLOSED`), include `appeals` / `hearings` / `decisions` in `GET /er/cases`, default creator (`er.case.handle`) or selected handler as `HANDLER` in `createCase`, add **Record Decision** modal mode + Appeal Officer selector & case detail inspection in `GovernanceView.jsx`. |
| **F6-5** | **RBAC Gating & Zero Noisy 403s (`GovernanceView.jsx`, `App.jsx`)** | `GovernanceView.jsx:312` calls `/governance/training/phishing-records` (`training.manage`) unconditionally on mount, causing 403s for employees/managers; write forms (`policies`, `training`, `documents`, `er`, `travel`, `engagement`, `hrletters`) are un-gated in UI. | Gate `phishing-records` fetch behind `canManageTraining`; derive fine-grained permission flags (`canManagePolicy`, `canManageTraining`, `canUploadDocs`, `canDownloadDocs`, `canIntakeEr`, `canHandleEr`, `canAppealEr`, `canManageSurveys`, `isHrOrAdmin`) and hide/disable unauthorized buttons cleanly. |

---

## 2. Multi-Role Live Browser Verification Matrix (`https://ndakalahr.duckdns.org`)

All accounts authenticate with `Ndakala@Secure2026!`. Production employee `NDA-2026-0005` (`Amina Ochieng`, `ACTIVE`) must remain intact.

1. **Stage 1 (`employee.one@ndakalaadvisory.co.ke` — `employee`)**:
   - Open **HR Letters**: Submit an Address Proof request (`Opening a Bank Account`, no address change, `SUBMITTED`); verify **Approve/Reject** buttons do NOT appear for `employee.one`.
   - Open **Travel**: Submit a Mombasa advisory travel request (`FLIGHT`, `2` days, `KES 45,000`); confirm `SUBMITTED` row renders with `Cancel` only (no `Approve`/`Reject`).
   - Open **Files -> Policies / Training / Document Vault / ER Cases**: Verify employee CANNOT see **Draft Policy**, **Publish**, **Create Programme**, **Assign Staff**, **Upload Document**, or ER **Hearing / Close Case** controls; verify zero noisy 403s in console/network.
   - Click **Anonymous Whistleblower Portal**: Submit an anonymous whistleblower disclosure (`Alleged conflict in vendor tender`), capture generated `trackingToken` (`WB-2026-...`), and test **Track Status** returning `OPEN` + `INTAKE` timeline. Sign out cleanly.
2. **Stage 2 (`hr.lead@ndakalaadvisory.co.ke` — `head_of_hr`)**:
   - **HR Letters**: Approve `employee.one`'s submitted Address Proof request (`APPROVED`).
   - **Travel**: Approve `employee.one`'s travel request (`APPROVED`), then click **Mark Reimbursed** (`REIMBURSED`).
   - **Employee Engagement**: Publish a pulse survey (`Q4 Advisory Workplace Pulse`), then respond to it once (`5 - Strongly Engaged`) and verify `✓ Submitted`.
   - **Policies**: Draft new policy `POL-AI-2026` (`Artificial Intelligence Governance Policy`, `INFORMATION_SECURITY`), verify Maker-Checker UI badge **`Maker-Checker: Author Cannot Self-Publish`** shows instead of **Publish**.
   - **Training**: Create programme `TRN-AML-2026` (`AML & Ethics Compliance 2026`), assign to `employee.one` (`Advisory Associate`) with due date `2026-12-15`, and log a Security Communication bulletin.
   - **Document Vault**: Upload a small `.txt` / `.pdf` compliance document (`compliance-charter.txt`) and click **Signed Download** (`POST /documents/:id/token` -> `200`, file downloaded).
   - **ER Cases**: Open formal ER case (`GRIEVANCE` — `"Project Workload Escalation Review"` with `HR Lead` as handler), schedule **Hearing** (`HEARING`), record formal **Decision** (`OUTCOME_PENDING`). Sign out cleanly.
3. **Stage 3 (`operations.director@ndakalaadvisory.co.ke` — `operations_director`)**:
   - **Policies**: Publish `hr.lead`'s `POL-AI-2026` v1.0 (`PUBLISHED`, immutable, fans out `PENDING` acknowledgements).
   - **ER Cases**: Verify `operations.director` CANNOT see `hr.lead`'s assigned grievance case (case-level isolation enforced: neither `primaryHandlerId` nor `managing_partner`!). Sign out cleanly.
4. **Stage 4 (`employee.one@ndakalaadvisory.co.ke` -> `managing.partner@ndakalaadvisory.co.ke`)**:
   - `employee.one`:
     - **Files -> Policies -> My Policy Acknowledgements**: Acknowledge `POL-AI-2026` v1.0 (`ACKNOWLEDGED`).
     - **Files -> Training**: Mark `TRN-AML-2026` complete (`COMPLETED`).
     - **Engagement**: Respond to `Q4 Advisory Workplace Pulse` (`4 - Satisfied`) -> verify response count increments to `2`.
     - Sign out cleanly.
   - `managing.partner`:
     - **Files -> ER Cases**: Verify executive oversight sees both the anonymous whistleblower case (`ER-WB-2026-...`) and `hr.lead`'s grievance case (`ER-GRIEV-2026-...`, `OUTCOME_PENDING`).
     - Test **Submit Appeal** targeting `managing.partner` as Appeal Officer -> `APPEAL` -> **Review Appeal** (`UPHELD`) -> verify case status closes cleanly (`CLOSED`).
     - Sign out cleanly (`Signed out cleanly.`).

## 3. PostgreSQL End-State Verification (`ndakala_hr-db`)

Verify `PolicyDocument` (`4`), `PolicyVersion` (`4`), `PolicyAcknowledgement` (for `POL-AI-2026` v1.0 across active staff with `employee.one = ACKNOWLEDGED`), `TrainingProgramme` (`6`), `TrainingAssignment` (`COMPLETED` for `employee.one`), `SecurityCommunicationLog` (`1`), `DocumentRecord` (`4` + `DOCUMENT_DOWNLOAD` audit log), `HrLetterRequest` (`APPROVED`), `PolicyConfiguration` (`WS_TRAVEL_REQUESTS`, `WS_ENGAGEMENT_SURVEYS`), `ErCase` (`2`: 1 `WHISTLEBLOWING`, 1 `GRIEVANCE` `CLOSED`), `ErCaseDecision`, `ErAppeal` (`UPHELD`), `AuditLog`, and `NDA-2026-0005` (`ACTIVE`).
