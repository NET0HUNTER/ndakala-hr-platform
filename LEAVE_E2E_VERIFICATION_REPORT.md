# Leave & Absence Management — End-to-End Verification Report

**Environment:** Production (`https://ndakalahr.duckdns.org`) & Builder Container (`ndakala-hr-builder:latest`)  
**Commits Verified:**
- `8691f28` — `feat(leave): add evidence uploads, return/resubmit, balance stats, manager scoping & absence review`
- `fbdac19` — `fix(leave): expose sanitized relieving-officers list for employee leave handover` *(currently deployed on VPS)*  

**Production Health (post-`fbdac19`):**
- `/api/v1/health`: `{"status":"UP","service":"Ndakala HR Platform","version":"1.0.0"}`
- `/api/v1/ready`: `{"status":"READY","database":"CONNECTED"}`

---

## 1. Executive Summary

The complete **Leave & Absence Management** workflow (guidance, engineering fixes, automated integration tests, live multi-role browser E2E execution, and PostgreSQL ledger/database inspection) is **verified and live**.

During live browser execution (`employee.one@ndakalaadvisory.co.ke`), interactive E2E testing uncovered a real RBAC gap where the Leave Request modal called `GET /api/v1/employees?limit=100` (`403 Forbidden` for self-service employees), leaving the Relieving Officer dropdown empty and blocking leave requests of 5+ working days. We resolved this in commit `fbdac19` by introducing a scoped handover endpoint (`GET /api/v1/leave/relieving-officers`) gated to `leave.request` and guarding `/api/v1/employees?limit=100` in `App.jsx` behind directory-view permissions, then re-verified live in the browser with **zero HTTP 403 errors** and full approval of 5-day Annual Leave **`LV-2027-0001`**.

> [!IMPORTANT]
> **Live Browser File-Picker Caveat:** Automated browser file-picker upload of `medical-certificate.pdf` in the Sick Leave flow encountered the Antigravity sandbox gate (`UPLOAD_NEEDS_PERMISSION` on `browser_upload:https://ndakalahr.duckdns.org:medical-certificate.pdf`). The permission gate was respected without bypass. Consequently, zero `SICK` requests with live UI-uploaded attachments exist in production PostgreSQL, while the full PDF upload -> SICK submit -> signed token -> `HTTP 200` download pipeline is verified in `tests/leave_management.test.ts`.

---

## 2. Automated Build & Regression Test Results (Post-`fbdac19`)

| Check | Scope / Condition | Result | Notes |
|---|---|---|---|
| TypeScript & Frontend Build | `npx prisma generate && npm run build && npm run build:frontend` (`tsc`, Tailwind, `esbuild`) | **PASS** (0 errors) | Deployed cleanly in Docker image `ndakala-hr-platform:latest` |
| Leave Management Suite | `tests/leave_management.test.ts` on isolated clean SQLite DB | **18 / 18 PASS** | Includes SICK evidence upload + signed HR download, `RETURN` -> Resubmit -> `APPROVE`, Absence review (`EXCUSED`), and sanitized `/leave/relieving-officers` |
| Full Vitest Suite | All 16 test files on isolated clean SQLite DB (`file:/tmp/vitest_clean.db`) | **15 / 16 files PASS** (**175 / 176 tests PASS**, 1 fail) | Single failure is unrelated pre-existing overlap in `tests/timetracker_integration.test.ts:129` (`409` instead of `201` on `2026-12-01..2026-12-31` period creation) |

---

## 3. Code Changes Delivered in This Flow

1. **Backend Leave Service & Routes (`src/modules/leave/service.ts`, `src/modules/leave/routes.ts`)**
   - Enforced `leaveType.requiresEvidence` + valid `DocumentRecord` check in `submitLeaveRequest`.
   - Added `resubmitLeaveRequest` and `POST /api/v1/leave/requests/:id/resubmit` to revise `RETURNED_FOR_EDIT` requests back to `PENDING_APPROVAL` with fresh working-day calculation and reservation.
   - Added `POST /api/v1/leave/evidence` (base64 PDF/image storage into `DocumentRecord` + `EmployeeDocument` with `MEDICAL_RESTRICTED` vs `HR_EMPLOYEE_MANAGER` classification).
   - Added `POST /api/v1/leave/requests/:id/evidence-token` generating short-lived signed download tokens with strict medical privacy checks.
   - Fixed `GET /api/v1/leave/requests` so non-HR Line Managers receive `{ in: [myEmpId, ...reportingLine] }` rather than self-only records.
   - Added `POST /api/v1/absences/:id/review` (`EXCUSED | INVESTIGATION_REQUIRED | RETROSPECTIVE_LEAVE_REQUESTED`) and reporting-line scoping on `GET /api/v1/absences`.
   - Added `GET /api/v1/leave/types?includeInactive=true` support for Maker-Checker drafts.
   - Added `GET /api/v1/leave/relieving-officers` (`auth: { permission: 'leave.request' }`) returning sanitized colleague names/departments/titles for >= 5-day handover selection without directory PII exposure.

2. **Frontend SPA (`frontend/src/App.jsx`, `frontend/src/utils/api.js`, `frontend/src/views/modals/LeaveRequestModal.jsx`, `frontend/src/views/TaskInboxView.jsx`, `frontend/src/views/MyWorkspaceView.jsx`, `frontend/src/views/GovernanceView.jsx`)**
   - Normalized legacy `'leave'` route keys to `'inbox'`.
   - Added `computeLeaveBalanceStats` & `readFileAsBase64` helpers and replaced mismatched balance/request property references across Leave views.
   - Upgraded `LeaveRequestModal.jsx`: live leave types, working-day preview with single-day `Half-Day` (`MORNING`/`AFTERNOON`) calculation, `/api/v1/leave/relieving-officers` colleague dropdown, base64 **Supporting Evidence** upload, and **Revise & Resubmit** edit mode.
   - Upgraded `TaskInboxView.jsx`: HR/Manager employee balance & ledger inspection selector, **Team** sub-tab scoping, **Absences** (`Excuse` / `Convert to Leave`), **Return** (`RETURNED_FOR_EDIT`) + **Edit & Resubmit** + signed **Evidence Download**, **Holidays** (`sourceReference`), **Shift & Schedules** (weekday names), **Reconcile Balances**, **Monthly Accrual**, and **Maker-Checker Leave Type Draft -> Activate** workflow.
   - Permission-gated `/api/v1/employees?limit=100` in `App.jsx` behind `employees.view` / `employees.view_team` with fallback employee ID resolution from `leaveBalances` / `leaveRequests`.

---

## 4. Live Browser UI E2E Verification (`https://ndakalahr.duckdns.org`)

Host-verified origin: `https://ndakalahr.duckdns.org` (`blocked_origins: none`).

| Role | Flow Exercised Live in UI | Observed Outcome |
|---|---|---|
| `employee.one@ndakalaadvisory.co.ke` | My Space -> Leave Tracker navigation, Half-Day calculation (`0.5` toggle), `SICK` modal evidence prompt | **PASS** (zero HTTP `403` errors after `fbdac19`; browser upload of PDF hit host sandbox `UPLOAD_NEEDS_PERMISSION` prompt) |
| `employee.one@ndakalaadvisory.co.ke` | Submit `ANNUAL` (`2026-11-26..2026-11-27`) -> Withdraw | **PASS** — Created `LV-2026-0001` (`PENDING_APPROVAL`) -> transitioned to `WITHDRAWN` |
| `employee.one@ndakalaadvisory.co.ke` ↔ `line.manager@ndakalaadvisory.co.ke` | Submit `ANNUAL` (`2026-12-07..2026-12-10`) -> Manager Return -> Employee Edit & Resubmit -> Manager Approve | **PASS** — `LV-2026-0002`: `PENDING_APPROVAL` -> `RETURNED_FOR_EDIT` -> `PENDING_APPROVAL` -> `APPROVED` |
| `employee.one@ndakalaadvisory.co.ke` -> `line.manager@ndakalaadvisory.co.ke` | 5-Day `ANNUAL` with Relieving Officer (`2027-01-11..2027-01-15`, Reliever: `HR Lead`) -> Manager Approve | **PASS** — `/api/v1/leave/relieving-officers` returned HTTP `200`; created & approved `LV-2027-0001` (`APPROVED`) |
| `employee.one@ndakalaadvisory.co.ke` -> `hr.lead@ndakalaadvisory.co.ke` | Log Unexpected Absence (`2026-11-18`, `MEDICAL_APPOINTMENT`, `PHONE`) -> HR Excuse | **PASS** — `RECORDED` -> `EXCUSED` |
| `hr.lead@ndakalaadvisory.co.ke` | Cancel Approved `LV-2026-0002`, inspect balance reversal, add Holiday (`UAT Boxing Observation`), add Schedule (`UAT_4DAY`), run Monthly Accrual, Reconcile (`Diff: 0d`), post `+1` manual adjustment, Export Leave CSV, draft Custom Leave Type (`UAT_SABBATICAL`) | **PASS** |
| `managing.partner@ndakalaadvisory.co.ke` | Activate pending Maker-Checker Leave Type Draft (`UAT_SABBATICAL`) | **PASS** — `isActive` transitioned `DRAFT` -> `ACTIVE` |

---

## 5. Production PostgreSQL End-State Verification (`ndakala_hr-db`)

Direct `psql` queries after all live UI tests confirmed every state change is persisted accurately:

- **`LeaveRequest`**:
  - `LV-2026-0001` (`employee.one`, `ANNUAL`, `2026-11-26..2026-11-27`, `2` days, handover=`t`): **`WITHDRAWN`**
  - `LV-2026-0002` (`employee.one`, `ANNUAL`, `2026-12-07..2026-12-10`, `4` days, handover=`t`): **`CANCELLED`**
  - `LV-2027-0001` (`employee.one`, `ANNUAL`, `2027-01-11..2027-01-15`, `5` days, handover=`t`): **`APPROVED`**
- **`LeaveReservation`**: `COMMITTED_TO_LEDGER = 2`, `RELEASED = 2`
- **`LeaveLedgerEntry` (`employee.one` — `ANNUAL`)**:
  - `2026`: `OPENING_BALANCE (+21, bal=21)` -> `LEAVE_TAKEN (-4, bal=17)` -> `REVERSAL (+4, bal=21)` -> `ACCRUAL (+1.75, bal=22.75)` -> `ADJUSTMENT (+1, bal=23.75)`
  - `2027`: `OPENING_BALANCE (+21, bal=21)` -> `LEAVE_TAKEN (-5, bal=16)`
- **`LeaveBalance` (`employee.one` — `ANNUAL`)**:
  - `2026`: `entitlementDays=21`, `accruedDays=1.75`, `takenDays=4`, `adjustedDays=5` (`+4` reversal + `+1` manual), `pendingReservedDays=0`, `closingBalanceDays=23.75` (`RECONCILED`, Diff `0d`)
  - `2027`: `entitlementDays=21`, `takenDays=5`, `pendingReservedDays=0`, `closingBalanceDays=16`
- **`AbsenceRecord`**: `2026-11-18` (`MEDICAL_APPOINTMENT`, `PHONE`) -> **`EXCUSED`**
- **`PublicHoliday`**: `2026-12-28` — **`UAT Boxing Observation`**
- **`WorkSchedule`**: **`UAT_4DAY`** (`UAT Four-Day Schedule`, `8h`, `isActive=t`)
- **`LeaveType`**: **`UAT_SABBATICAL`** (`UAT Sabbatical Leave`, `10d`, `isActive=t`)

---

## 6. Related Deliverables

- Guidance Guide: [LEAVE_GUIDANCE.md](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/LEAVE_GUIDANCE.md)
- E2E Verification Plan: [LEAVE_E2E_VERIFICATION_PLAN.md](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/LEAVE_E2E_VERIFICATION_PLAN.md)
