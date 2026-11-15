# Time Tracker, Shifts & Attendance — End-to-End Verification Plan

## 1. Pre-Execution Codebase Audit Findings

Static code inspection across `src/modules/timetracker/`, `src/modules/workspace/routes.ts`, `frontend/src/views/TimeTrackerView.jsx`, `frontend/src/views/GovernanceView.jsx`, `frontend/src/views/MyWorkspaceView.jsx`, and `tests/timetracker_integration.test.ts` surfaced five concrete issues blocking accurate live end-to-end UI execution:

1. **Missing Project Health Badges (`TimeTrackerView.jsx`):** Project health cards read `prj.health`, while `GET /api/v1/timetracker/projects` returns `prj.metrics.health` — causing `ON_TRACK` / `WATCH` / `ATTENTION` / `OVER_BUDGET` / `NO_BUDGET` burn-rate pills never to render.
2. **Missing Employee Identity on Time Logs (`service.ts` & `GovernanceView.jsx`):** `TimeTrackerService.listTimeLogs()` does not join `employee` (`firstName`, `lastName`, `employeeNumber`), so `GovernanceView` renders `"Staff"` on every row and `TimeTrackerView` Approvals Queue omits staff attribution.
3. **RBAC UI Gaps & Null Cost Misdisplay (`TimeTrackerView.jsx` & `GovernanceView.jsx`):**
   - `Profitability KPIs` passes masked `null` labor cost & margin into `fmtKes(null)` (`KES 0.00`) instead of displaying `"Restricted (RBAC)"`.
   - Unauthorized employees see project/rate/period mutation forms (and `+ Add Project` / `+ Add Job / Phase`) without permission gating, triggering avoidable `403` errors on submit.
   - `Approvals Queue` lacks quick per-row `Approve` / `Reject` actions alongside batch selection.
4. **Filter Drawer Period Bug & Workspace Punch Schema Mismatch (`GovernanceView.jsx` & `MyWorkspaceView.jsx`):**
   - `GovernanceView`'s `filterPeriod` (`This Week` / `This Month` / `All Dates`) is ignored by `filteredQuickLogs`.
   - `MyWorkspaceView` Attendance Overview reads legacy `p.punchType` / `p.punchedAt` / `p.date` fields instead of `AttendancePunch`'s actual `workDate`, `clockInAt`, `clockOutAt`, and `totalSecs`.
5. **Non-Idempotent Integration Test (`tests/timetracker_integration.test.ts`):** `closes an open period...` fails with `409` on repeated runs against persistent `prisma/dev.db` (`December 2026 Test Close` overlap) unless stale test period records are cleared in `beforeAll`. Also production PostgreSQL (`ndakala_hr-db`) currently has `0` seeded `TimeClient` / `TimeProject` records (since `SEED_SAMPLE_DATA` is disabled in prod), meaning Managing Partner / HR setup of client + project + phase is a mandatory first step of the live E2E flow.

---

## 2. Planned Remediation & Test Additions

1. **`src/modules/timetracker/service.ts`**: Join `employee: { select: { id, firstName, lastName, employeeNumber } }` in `listTimeLogs()` and include `employeeName` / `employeeNumber`.
2. **`frontend/src/views/TimeTrackerView.jsx`**:
   - Compute permission flags from `currentUser?.permissions` (`timetracker.approve`, `timetracker.projects.manage`, `timetracker.rates.view`, `timetracker.rates.manage`, `timetracker.periods.manage`).
   - Fix `prj.metrics?.health || prj.health` badge rendering and show project hours/billability/revenue metrics.
   - Display `employeeName` column in logs & approvals, add quick single-row Approve/Reject in Approvals Queue, render `"Restricted (RBAC)"` when `totalLaborCostKes == null`, gate mutation forms cleanly by permission, default `workDate` to today (`new Date().toISOString().slice(0, 10)`), and surface locked period KPI snapshots cleanly.
3. **`frontend/src/views/GovernanceView.jsx`**:
   - Wire `filterPeriod` (`This Week` / `This Month` / `All Dates`) inside `filteredQuickLogs`.
   - Gate `+ Add Project` & `+ Add Job / Phase` quick links to `timetracker.projects.manage`.
4. **`frontend/src/views/MyWorkspaceView.jsx`**:
   - Fix Attendance mini-table to render `workDate`, `clockInAt` -> `clockOutAt`, and formatted `totalSecs` duration cleanly.
5. **`tests/timetracker_integration.test.ts`**:
   - Clean up `'December 2026 Test Close'` (`timeLog` + `timePeriodClose`) in `beforeAll` and add a check verifying `listTimeLogs` returns `employeeName` & proper RBAC cost masking for non-rate employees.

---

## 3. Multi-Role Live Verification Matrix (`https://ndakalahr.duckdns.org`)

| Stage | Actor | Actions to Verify Live in UI | Expected Outcome |
|---|---|---|---|
| **1. Setup & Roster** | `managing.partner@ndakalaadvisory.co.ke` | Create Shift (`UAT Day Shift`), Client (`CLI-UAT-01`), Project (`PRJ-UAT-01`, budget KES 500,000), Phase (`Phase 1: Fieldwork`), Set Rate Cards for `employee.one` & `line.manager`, verify/adjust progress % | Persisted in DB; Project Health badge `On Track` visible; zero console errors |
| **2. Attendance & Time Capture** | `employee.one@ndakalaadvisory.co.ke` | Check In on **Attendance & Absences** (and inspect on **My Space -> Attendance**), start & stop live Timer (`0.25h`), submit two manual `TimeLog` entries (`Billable 4h` + `Non-Billable 1.5h` on Nov 2026, plus a throwaway `0.5h` pending log to `Delete`), verify cost rates & partner forms are RBAC-masked/gated, then Check Out | Punches & elapsed time recorded; `0.5h` deleted; cost rate & margin display `Restricted (RBAC)`; zero `403` errors |
| **3. Manager Review** | `line.manager@ndakalaadvisory.co.ke` | Open **Time Tracker -> Approvals**, **Approve** the `4h` Billable log, and test **Reject** validation + reject `0.25h`/`1.5h` with mandatory reason | Logs transition to `APPROVED` and `REJECTED` (`rejectionReason` persisted) |
| **4. Period Lock & Reopen** | `managing.partner@ndakalaadvisory.co.ke` | Inspect **Profitability KPIs & Utilization %**, open a dedicated December 2026 period (`2026-12-01..2026-12-31`), log `5h` on `2026-12-10`, verify closing without `autoApprove` fails cleanly while `PENDING` exists, **Close & SHA-256 Lock** with `autoApprove`, confirm `employee.one` cannot log inside `2026-12-10` (`409 PERIOD_LOCKED`), then **Reopen Period** with audit justification `>= 5` chars | SHA-256 digest sealed (`LOCKED`), `409` enforced on locked date, then reopened cleanly to `OPEN` |

---

## 4. PostgreSQL End-State Checks

Verify directly against production `ndakala_hr-db`:
- `TimeClient`, `TimeProject`, `TimePhase`, `TimeRateCard`
- `TimeLog` (`APPROVED`, `REJECTED`, `LOCKED`/`APPROVED` post-reopen, `costRateSnap`, `billingRateSnap`)
- `TimePeriodClose` (`snapshotChecksum` SHA-256, `status`)
- `AttendancePunch` (`clockInAt`, `clockOutAt`, `totalSecs`)
- `AuditLog` (`ATTENDANCE_CLOCK_IN`, `ATTENDANCE_CLOCK_OUT`, `TIME_LOG_*`, `TIME_PERIOD_*`, `TIME_RATE_CARD_UPDATED`)
