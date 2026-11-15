# Ndakala Advisory LLP — Onboarding End-to-End Verification Report

**Target Environment:** `https://ndakalahr.duckdns.org` (Contabo VPS `158.220.93.237`, PostgreSQL 16 + `ndakala_hr-app`)  
**Verified Commit:** `dfd814a` (`main`)  
**Verification Date:** `2026-11-15`  
**Verified UAT Record (Retained Live):** `Amina Ochieng` (`NDA-2026-0005` / `amina.ochieng.uat3@ndakalaadvisory.co.ke`)  
**Overall Outcome:** **PASS** (`16/16` Vitest suites / `173/173` tests passed; `6/6` live multi-user UI stages passed including PDF uploads & signed download; PostgreSQL end-state confirmed)

---

## 1. Executive Summary

An end-to-end audit and live multi-user UI test were executed against the onboarding workflow documented in `ONBOARDING_GUIDANCE.md`. Initial code inspection uncovered **6 functional defects** that prevented the documented UI journey from completing cleanly across roles and file uploads. All 6 defects were resolved in commit `dfd814a`, verified via `173` automated Vitest tests, deployed to `https://ndakalahr.duckdns.org`, and executed end-to-end across **ICT Admin**, **HR Lead**, **New Joiner (`employee`)**, and **Line Manager** sessions.

---

## 2. Audit Findings & Implemented Fixes (`dfd814a`)

| # | Area | Finding Before Fix | Resolution Implemented | Source File |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Employee Drawer Document Upload** | Frontend sent `multipart/form-data` (`FormData`) to `POST /api/v1/documents/upload`, whereas the backend only accepts JSON (`{ fileName, mimeType, category, securityClassification, fileBase64 }`), causing HTTP `400 VALIDATION_ERROR`. `ONBOARDING_EVIDENCE` was also missing from the drawer selector. | Replaced `FormData` upload with `readFileAsBase64` + shared `uploadAndAttachEmployeeDocument` helper posting base64 JSON; added `ONBOARDING_EVIDENCE` to document type options. | `frontend/src/views/WorkforceDirectoryView.jsx` |
| **2** | **Evidence-Required Onboarding Tasks** | *"Collect signed employment contract"* and *"Record induction completion"* require `evidenceDocumentId`, yet the UI `Complete` button sent none, had no `Start` (`IN_PROGRESS`) button, and offered no document picker or inline file upload. | Added `Start` (`IN_PROGRESS`), `Evidence Required` badges, due dates, an attached-document selector (`detailEmployee.documents`), and an inline **Upload Evidence & Complete** input on evidence-required tasks while keeping the active drawer tab open. | `frontend/src/views/WorkforceDirectoryView.jsx` |
| **3** | **Directory Onboarding Status & Filtering** | `EMPLOYEE_LIST_SELECT` omitted `onboardingCompletedAt` and `onboardingTasks`, keeping directory rows stuck at `Triggered` (except when `status === 'PROBATION'`). Filtering `'Onboarding Status'` checked `r.status` instead of `r.onboardingStatus`, and drawer actions did not refresh parent state. | Added `onboardingCompletedAt` and `onboardingTasks` (`id`, `status`, `ownerType`) to `EMPLOYEE_LIST_SELECT`, computed `Triggered` -> `In Progress` -> `Completed` from live task/completion state, fixed filter mapping, and triggered `onRefreshAll()` after drawer mutations. | `src/modules/employees/masking.ts`, `frontend/src/views/WorkforceDirectoryView.jsx` |
| **4** | **Manager Assignment & User Auto-Linking** | The **Add Candidate** modal lacked **Reporting Manager** (`managerId`) and **ICT Access Profile** (`ictAccessProfile`) selectors, and `createEmployee` only set `userId` (and `EMPLOYEE` task `assignedUserId`) when `input.userId` was explicitly passed. | Added `managerId` and `ictAccessProfile` dropdowns to **Add Candidate**, added **Portal Login Provisioning** (`POST /api/v1/users` + `roles.manage`) under **ICT Provisioning**, and auto-linked matching `User` accounts by `workEmail` in `createEmployee`. | `src/modules/employees/service.ts`, `frontend/src/views/WorkforceDirectoryView.jsx` |
| **5** | **Employee Self-Service Checklist Visibility** | A newly logged-in `employee` had no UI panel showing their `OnboardingTask`s (`Employee completes permitted personal details`) in **My Space**. | Added `GET /api/v1/onboarding-tasks/mine`, broadened `PATCH /api/v1/onboarding-tasks/:taskId` ownership checks (`isSelfEmployeeTask` / `isLineManagerTask`), and added **My Onboarding Checklist** + **My Pending Tasks** quick actions in **My Space**. | `src/modules/employees/routes.ts`, `frontend/src/views/MyWorkspaceView.jsx` |
| **6** | **ICT Admin Ticket & Onboarding Task Sync** | `ict_admin` holds `ict.access.fulfil` (not `employees.view`), and marking a `JOINER` ticket `COMPLETED` in `PATCH /api/v1/ict-requests/:id` left the employee's `ICT` onboarding task `PENDING`. Also `handleConfirmProbation` ignored `decisionReason` input. | Auto-landed `ict_admin` onto **ICT Provisioning**, updated `PATCH /api/v1/ict-requests/:id` in a transaction to mark open `ICT` onboarding tasks `COMPLETED` and stamp `onboardingCompletedAt` when `remaining === 0`, and wired `decisionReason` through `handleConfirmProbation`. | `src/modules/employees/routes.ts`, `frontend/src/App.jsx` |

---

## 3. Build, Test & Production Deployment Checks

| Verification Check | Command / Scope | Observed Result |
| :--- | :--- | :--- |
| **Schema & Build** | `npx prisma generate`, `npm run build` (`tsc -p tsconfig.json`), `npm run build:frontend` (Tailwind CSS + esbuild) | **PASS** — clean build inside `ndakala-hr-builder` |
| **Automated Test Suite** | `npx vitest run` against pushed SQLite schema including new multi-role E2E case in `tests/employee_lifecycle.test.ts` | **PASS** — **16/16** files passed, **173/173** tests passed, **0** skipped |
| **VPS Health & DB Probes** | `curl -fsS http://127.0.0.1:3006/api/v1/health` and `/api/v1/ready` on `158.220.93.237` | **PASS** — `{"status":"UP"}` and `{"status":"READY","database":"CONNECTED"}` |

---

## 4. Live Multi-User UI Execution Log (`https://ndakalahr.duckdns.org`)

| Stage | Signed-In Actor | UI Actions Verified | Outcome |
| :--- | :--- | :--- | :--- |
| **1. Portal Login Provisioning** | `ict.admin@ndakalaadvisory.co.ke` (`ict_admin`) | Opened **Onboarding → ICT Provisioning**; created user `Amina Ochieng` (`amina.ochieng.uat3@ndakalaadvisory.co.ke`) with role `employee` and signed out cleanly. | **PASS** |
| **2a. Hire & Draft Resilience** | `hr.lead@ndakalaadvisory.co.ke` (`head_of_hr`) | Filled **Add Candidate** (Manager = `Audit Manager`, Profile = `STANDARD_OFFICE_365`, Category = `PERMANENT`); clicked **Save Draft**, closed/reopened modal to verify field restoration, submitted hire -> `NDA-2026-0005` appeared with **`Triggered`**. | **PASS** |
| **2b. Contract Upload & Evidence Tasks** | `hr.lead@ndakalaadvisory.co.ke` (`head_of_hr`) | Initially paused on 60s IDE `browser_upload` permission timeout; once allowed, uploaded `signed-contract.pdf` (`CONTRACT`), verified signed **Download** token (`HTTP 200`), started *"Collect signed employment contract"* (**`In Progress`**), linked `signed-contract.pdf` and completed it, and uploaded `induction-attendance.pdf` (`ONBOARDING_EVIDENCE`) via **Upload Evidence & Complete** on *"Record induction completion"*. | **PASS** |
| **3. New Joiner Self-Service** | `amina.ochieng.uat3@ndakalaadvisory.co.ke` (`employee`) | Verified *"Employee completes permitted personal details"* in **My Space → My Onboarding Checklist**; updated Preferred Name (`Amina O.`) + Personal Email via **Edit Personal Details → Save Changes**; started and completed her onboarding task. | **PASS** |
| **4. Line Manager Review** | `line.manager@ndakalaadvisory.co.ke` (`line_manager`) | Located `Amina Ochieng` in reporting-scoped **Onboarding** directory; completed *"Assign probation objectives"*; saved Probation Objectives (`OBJECTIVES_SET`); submitted Ndakala 6-Values Evaluation (`Recommend CONFIRM`, `ASSESSED`). | **PASS** |
| **5. ICT Ticket Fulfillment** | `ict.admin@ndakalaadvisory.co.ke` (`ict_admin`) | Opened **Onboarding → ICT Provisioning**; clicked **Start** (`IN_PROGRESS`) and **Fulfil Ticket** (`COMPLETED`) on `NDA-2026-0005` `JOINER` request -> automatically completed ICT onboarding task and stamped `onboardingCompletedAt`. | **PASS** |
| **6. HR Verification & Probation Confirmation** | `hr.lead@ndakalaadvisory.co.ke` (`head_of_hr`) | Verified `5/5` onboarding tasks `COMPLETED`; approved Amina's `PERSONAL` self-service change request (`APPLIED`); recorded Final Probation Decision **`CONFIRMED`** (`DECIDED`); confirmed **Employee Information** row displays Onboarding Status **`Completed`** and Lifecycle Status **`ACTIVE`**. | **PASS** |

### Network & Observation Notes
- **Browser Host Facts (`4d244911-a0db-4351-b523-14271e880233`)**: Visited origin `https://ndakalahr.duckdns.org`, blocked origins `none`, clean logout state confirmed.
- **Non-blocking `403`s Observed on Restricted Roles**: When `ict_admin` loads `WorkforceDirectoryView`, background catalog fetches (`/api/v1/positions`, `/locations`, `/grades`, `/employee-categories`, `/onboarding-templates`) return expected RBAC `403`s because `ict_admin` lacks `structure.view`/`onboarding.manage`; the UI catches these silently and defaults onto **ICT Provisioning**. Zero HTTP `5xx` errors occurred across the entire run.

---

## 5. Verified Production PostgreSQL End-State (`NDA-2026-0005`)

Queried directly from `ndakala_hr-db` via `ndakala_hr-app` after Stage 6 completion:

```json
{
  "empNo": "NDA-2026-0005",
  "status": "ACTIVE",
  "preferredName": "Amina O.",
  "userIdLinked": true,
  "managerIdLinked": true,
  "onboardingCompletedAt": "2026-11-15T13:11:03.686Z",
  "tasks": [
    { "title": "Employee completes permitted personal details", "owner": "EMPLOYEE", "status": "COMPLETED", "hasEvidence": false },
    { "title": "Assign probation objectives", "owner": "MANAGER", "status": "COMPLETED", "hasEvidence": false },
    { "title": "Record ICT provisioning status for joiner request", "owner": "ICT", "status": "COMPLETED", "hasEvidence": false },
    { "title": "Collect signed employment contract", "owner": "HR", "status": "COMPLETED", "hasEvidence": true },
    { "title": "Record induction completion", "owner": "HR", "status": "COMPLETED", "hasEvidence": true }
  ],
  "ict": [
    { "type": "JOINER", "status": "COMPLETED" }
  ],
  "probation": [
    { "status": "DECIDED", "decision": "CONFIRMED" }
  ],
  "docs": [
    { "type": "CONTRACT", "file": "signed-contract.pdf" },
    { "type": "ONBOARDING_EVIDENCE", "file": "induction-attendance.pdf" }
  ],
  "changes": [
    { "type": "PERSONAL", "status": "APPLIED" }
  ]
}
```
