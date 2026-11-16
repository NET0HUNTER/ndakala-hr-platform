# Flow 6: Governance, Compliance, Document Vault & Employee Relations — Operational & Architectural Guidance

**Modules:** `src/modules/governance/`, `src/modules/er/`, `src/modules/documents/`, `src/modules/workspace/`  
**Frontend:** `frontend/src/views/GovernanceView.jsx`, `frontend/src/views/modals/WhistleblowerModal.jsx`  

---

## 1. Domain Capabilities Covered in `GovernanceView.jsx`

1. **Policies & Acknowledgements (`admin` / `policies`):**
   - Policy Register (`PolicyDocument` / `PolicyVersion`) enforces **Maker-Checker** publishing: the policy author (`createdById`) cannot publish their own draft version (`POST /api/v1/governance/policies/versions/:versionId/publish` throws `403` on self-approval).
   - Publishing supersedes any prior `PUBLISHED` version, sets `isImmutable = true`, and fans out version-bound `PENDING` `PolicyAcknowledgement` rows across `ACTIVE`, `PROBATION`, and `ONBOARDING` employees.
   - Employees acknowledge (`POST /governance/policies/acknowledgements/:id/acknowledge`) or refuse (`POST /governance/policies/acknowledgements/:id/refuse` with `{ refusalReason }`) exact policy versions while preserving historical acknowledgements across upgrades.
2. **Training Administration & Security Comms (`admin` / `training`):**
   - HR/Operations (`training.manage`) manage `TrainingProgramme`, assign programmes (`POST /governance/training/assign` with `{ programmeId, employeeId, dueDate }`), record security communications (`POST /governance/training/security-comms`), and log phishing simulations (auto-assigning remedial cyber training when credentials are submitted).
   - Assignees mark assigned training complete (`POST /governance/training/assignments/:id/complete` with `scorePercent`, `passed`).
3. **Secure Document Vault (`admin` / `documents`):**
   - Uploads Base64 payloads via `POST /api/v1/documents/upload` (`category`: `POLICY | ORGANISATION | COMPLIANCE`, `securityClassification`: `PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED`) with SHA-256 verification & AES-256 encrypted storage.
   - Downloads require minting a 5-minute signed token (`POST /api/v1/documents/:id/token`, `documents.download`), then fetching `GET /api/v1/documents/download?token=...`.
4. **Confidential Employee Relations & Whistleblowing (`admin` / `er` & `WhistleblowerModal`):**
   - **Mandatory Case-Level Isolation:** `GET /api/v1/er/cases` and `GET /api/v1/er/cases/:id` enforce strict per-case authorization (`managing_partner`, assigned `primaryHandlerId`, `assignedInvestigatorId`, or active `ErCaseAccess` rows); uninvolved HR staff or managers cannot enumerate confidential cases (`CaseAccessDenied`).
   - Supports formal **Intake** (`POST /er/cases`), **Grant Access** (`POST /er/cases/:id/access`), **Conflict Declaration & Reassignment** (`POST /er/cases/:id/conflict` revoking conflicting access), **Hearings** (`POST /er/cases/:id/hearings`), **Evidence Upload** (`POST /er/cases/:id/evidence`), **Formal Decision** (`POST /er/cases/:id/decision` -> `OUTCOME_PENDING`), **Appeal Submission** (`POST /er/cases/:id/appeal`), **Appeal Review** (`POST /er/cases/:id/appeal/review`, restricted to designated `appealOfficerId` -> closes case), and **Case Closure** (`POST /er/cases/:id/close`).
   - **Anonymous Whistleblowing:** Public unauthenticated intake (`POST /er/cases/whistleblower/anonymous`) encrypts optional contact details, issues a `WB-YYYY-...` tracking token, enables anti-retaliation monitoring, and supports public timeline lookup (`GET /er/cases/whistleblower/track/:token`).
5. **HR Letters, Travel & Per Diem, Engagement Surveys, Action Tasks (`hrletters`, `travel`, `engagement`, `tasks`):**
   - Scoped self-service submission (`DRAFT`/`SUBMITTED`) and HR/Admin review (`APPROVED` / `REJECTED` / `REIMBURSED`), custom saved list views, anonymous pulse survey responses (`hasResponded` duplicate prevention), and assignable operational tasks.

---

## 2. Role Permissions Matrix (`src/core/permissions/catalog.ts`)

| Role | Governance, Docs & ER Permissions | Restricted Actions |
| :--- | :--- | :--- |
| **`employee`** | `policy.view_self`, `training.view_self`, `documents.view`, `er.intake` | Cannot draft/publish policies (`policy.manage`), manage training/phishing (`training.manage`), upload/download docs without permission, view ER cases not assigned, publish surveys, or approve HR letters/travel |
| **`line_manager`** | `policy.view_self`, `training.view_self`, `documents.view`, `er.intake`, `survey.manage` | Same administrative restrictions as Employee for policy publishing, training assignment, ER handling, and travel/letter approvals |
| **`head_of_hr`** (`hr.lead`) | `policy.view_self`, `policy.manage`, `training.view_self`, `training.manage`, `documents.view`, `documents.upload`, `documents.download`, `er.intake`, `er.case.handle`, `survey.manage` | **Maker-Checker:** Cannot publish own policy draft (`createdById === approverId`); **ER:** Lacks `er.case.appeal` and can only view/handle cases explicitly assigned to them |
| **`operations_director`** | Same + `er.case.appeal`, `documents.view`, `documents.download`, `policy.manage`, `training.manage`, `er.case.handle` | **Maker-Checker:** Cannot publish own policy draft; non-assigned ER cases blocked (`CaseAccessDenied`) |
| **`managing_partner`** | Full access across all `governance`, `documents`, `er`, `workforce` permissions + org-wide ER oversight (`assertCaseAccess` executive bypass) | Must respect appeal officer designation & audit trail immutability |
