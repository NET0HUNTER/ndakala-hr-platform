# Ndakala Advisory LLP — Leave & Absence End-to-End Verification Plan

**Target Environment:** `https://ndakalahr.duckdns.org` (Production VPS `158.220.93.237`, PostgreSQL 16)  
**Reference Guidance:** `LEAVE_GUIDANCE.md`

---

## 1. Pre-Fix Code Audit Findings

1. **Line Manager Leave Listing Blind Spot (`src/modules/leave/routes.ts`)**: `GET /api/v1/leave/requests` without `?teamOnly=true` returned only `myEmpId` for non-HR managers, preventing `line_manager` from seeing subordinates' pending requests in **Leave Tracker** or **My Space** approvals.
2. **Broken Balance Display Fields (`TaskInboxView.jsx`, `LeaveRequestModal.jsx`)**: UI read non-existent `availableDays`, `entitledDays`, and `usedDays` instead of `closingBalanceDays - pendingReservedDays`, `entitlementDays + accruedDays + carriedForwardDays + adjustedDays`, and `takenDays`.
3. **Broken Navigation Route Key (`MyWorkspaceView.jsx`, `GovernanceView.jsx`)**: `"Open Leave Module →"` and `"Open Approvals →"` called `setActiveTab('leave', ...)`, which matched no view because Leave Tracker mounts on `'inbox'`.
4. **Missing Leave Evidence Upload/Download & Half-Day Controls (`src/modules/leave/routes.ts`, `service.ts`, `LeaveRequestModal.jsx`, `TaskInboxView.jsx`)**: Added `POST /api/v1/leave/evidence` (`leave.request`), `POST /api/v1/leave/requests/:id/evidence-token`, `requiresEvidence` validation, and modal evidence file upload + half-day controls.
5. **Missing `RETURNED_FOR_EDIT` -> Edit & Resubmit Flow (`routes.ts`, `service.ts`, `TaskInboxView.jsx`, `App.jsx`)**: Added Return (`RETURN`) button and `POST /api/v1/leave/requests/:id/resubmit` + Edit & Resubmit UI action.
6. **Broken Admin Controls in `TaskInboxView.jsx`**: Fixed **Add Holiday** (`sourceReference`), **Add Schedule** (full weekday names), **Reconcile Balances** (`employeeId`), **Monthly Accrual** (`asOf`), **Maker-Checker Leave Type Draft -> Activate**, **HR/Manager Employee Inspector**, and **My Space** employee name/day-count rendering.
7. **Broken Unexpected Absence Review (`routes.ts`, `GovernanceView.jsx`, `TaskInboxView.jsx`)**: Added `POST /api/v1/absences/:id/review` (`EXCUSED`, `INVESTIGATION_REQUIRED`, `RETROSPECTIVE_LEAVE_REQUESTED`), surfaced **Absences** register in `TaskInboxView.jsx`, and fixed `GovernanceView.jsx` status gating.

---

## 2. Live Multi-Role Browser UI E2E Matrix (`https://ndakalahr.duckdns.org`)

- **L1 (`employee.one`)**: Half-day & working-day calculator preview, **Sick Leave** with real `medical-certificate.pdf` upload (`POST /leave/evidence`).
- **L2 (`employee.one`)**: Navigation shortcut `My Space -> Open Leave Module`, `5+`-day Annual Leave with Relieving Officer, plus temporary request Withdraw.
- **L3 (`line.manager`)**: Team Leave Requests review (`RETURN` on Annual Leave, `APPROVE` on Sick Leave).
- **L4 (`employee.one` -> `line.manager`)**: Resubmit `RETURNED_FOR_EDIT` Annual Leave -> `Approve` -> verify real balance decrement.
- **L5 (`employee.one` & `hr.lead`)**: Unexpected Absence log -> HR Review (`EXCUSED`), signed evidence download (`HTTP 200`), Holiday, Work Schedule, Monthly Accrual, Adjustment, Balance Reconciliation, Cancel Leave (ledger reversal), and Export Leave CSV.
- **L6 (`hr.lead` & `managing.partner`)**: Maker-Checker Custom Leave Type Draft -> Activate.
