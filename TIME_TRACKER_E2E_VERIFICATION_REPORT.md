# Ndakala HR Platform — Time Tracker, Shifts & Attendance E2E Verification Report

**Target Environment:** `https://ndakalahr.duckdns.org` (Production VPS Docker Compose + PostgreSQL 16)  
**Deployed Revision:** Commit `9b9a4b2`  
**Verification Date:** `2026-11-15`  
**Overall Result:** **PASSED** — Full 4-Stage Multi-Role UI + API + PostgreSQL End-to-End Flow Verified  

---

## 1. Executive Summary

The **Time Tracker, Shifts & Attendance** workflow (Flow 3) was audited across backend services, RBAC policy gates, Prisma schema/Postgres persistence, automated integration tests, and the live multi-role React frontend on `https://ndakalahr.duckdns.org`.

Before live UAT, six defects identified during static audit were resolved in commit `9b9a4b2` (verified via Docker production build and full Vitest regression suite: `16/16` test files, `177/177` tests passing). Live browser verification across **Managing Partner**, **Employee (`employee.one`)**, and **Line Manager (`line.manager`)** subsequently exercised shift creation & assignment, attendance check-in/check-out & My Space rendering, live stopwatch timer, manual billable/non-billable/deleted logs, RBAC financial rate masking, manager approval/rejection workflows, executive profitability KPIs & capacity utilization, SHA-256 period lock, `HTTP 409 Conflict` lock guard enforcement, and audited period reopen. Every UI action was corroborated directly against PostgreSQL rows and `AuditLog` records.

---

## 2. Pre-UAT Defects Fixed (Commit `9b9a4b2`)

| File | Fix Applied | Verification |
| :--- | :--- | :--- |
| [service.ts](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/src/modules/timetracker/service.ts) | Enriched `listTimeLogs()` by batch-loading `Employee` (`firstName`, `lastName`, `employeeNumber`), supporting staff search, and returning `employeeName` & `employeeNumber`. | Automated Vitest + Live Staff column |
| [TimeTrackerView.jsx](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/frontend/src/views/TimeTrackerView.jsx) | Added permission checks (`timetracker.approve`, `timetracker.rates.view`, `timetracker.rates.manage`, `timetracker.projects.manage`, `timetracker.periods.manage`); fixed Project Health badge (`prj.metrics?.health \|\| prj.health`); added `Staff` column, inline Approve/Reject controls, and `rejectionReason`; masked `null` cost/margin KPIs as `'Restricted (RBAC)'` / `'Restricted'` instead of `KES 0.00`; gated Client/Project/Rate/Period forms; defaulted `workDate` to today; surfaced SHA-256 locked snapshot metadata. | Frontend build + Live RBAC & KPI UAT |
| [GovernanceView.jsx](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/frontend/src/views/GovernanceView.jsx) | Wired `filterPeriod` (`This Week` / `This Month` / `All Dates`) in `filteredQuickLogs` and gated `+ Add Project` / `+ Add Job / Phase` links to `timetracker.projects.manage`. | Frontend build + Live UI |
| [MyWorkspaceView.jsx](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/frontend/src/views/MyWorkspaceView.jsx) | Updated Attendance Overview punch list to render `workDate`, `clockInAt` -> `clockOutAt` (`Checked In` when active), and formatted `totalSecs` duration instead of undefined `punchType` / `punchedAt`. | Live Stage 2 My Space Attendance check |
| [timetracker_integration.test.ts](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/tests/timetracker_integration.test.ts) | Added idempotent cleanup for stale period fixtures and added test verifying `employeeName` enrichment and cost-rate masking for non-finance employees. | Vitest (`7/7` in suite, `177/177` overall) |

---

## 3. Automated Build & Test Gate

- **TypeScript + Prisma + Frontend Bundle:** `npx prisma generate && npx prisma db push --skip-generate && npm run build && npm run build:frontend` completed with **0 errors**.
- **Full Vitest Regression Suite:** **`16 passed (16)`** test files, **`177 passed (177)`** tests (including `tests/timetracker_integration.test.ts`: `7 tests`).
- **Production Deployment (`https://ndakalahr.duckdns.org`):** VPS checked out at commit `9b9a4b2`; health endpoints confirmed `{"status":"UP","service":"Ndakala HR Platform","version":"1.0.0"}` and `{"status":"READY","database":"CONNECTED"}`.

---

## 4. Live Multi-Role E2E Execution Summary

Browser verification ran against `https://ndakalahr.duckdns.org` (`BROWSER_HOST_FACTS`: `visited_origins: https://ndakalahr.duckdns.org`, `blocked_origins: none`, final screenshot [final_step_141.png](file:///C:/Users/Yankees/.gemini/antigravity/brain/c6c345a9-43ed-4ff7-8df8-cf8bfa3aa667/browser_evidence/e63764f3-4bb0-43f5-963b-417c2f73e14c/final_step_141.png)).

### Stage 1 — Executive Setup & Rate Cards (`managing.partner@ndakalaadvisory.co.ke`)
- **Shift Schedule Roster:** Created **UAT Advisory Day Shift** (`UAT-DAY`, `08:30`–`17:30`), then assigned **Advisory Associate** (`employee.one`).
- **Clients, Projects & Gantt:** Registered client **UAT Capital Group** (`CLI-UAT-01`, Financial Services, `ops@uatcapital.ke`), created project **UAT Compliance Audit** (`PRJ-UAT-01`, Budget `500,000 KES`), verified dynamic health badge **On Track (<75%) (0%)**, created **Phase 1: Fieldwork**, and updated progress to `40%`.
- **Rate Cards:** Saved cost/billing cards for **Advisory Associate** (`2,500 / 6,500 KES/h`, **61.5%** spread) and **Audit Manager** (`3,500 / 8,500 KES/h`, **58.8%** spread).

### Stage 2 — Employee Attendance, Live Timer & RBAC Masking (`employee.one@ndakalaadvisory.co.ke`)
- **Attendance Punch & My Space:** Clocked in (`2026-11-15`), confirmed active session appeared in **My Space -> Overview -> Attendance** (`"2026-11-15 07:50 PM → Checked In Active"`), and later clocked out with elapsed duration **`00:03:39`**.
- **Live Stopwatch Timer:** Started stopwatch against `PRJ-UAT-01` / **Phase 1: Fieldwork**, stopped & saved **`0.25h`** entry (`"UAT live stopwatch session"`).
- **Manual Logs & Delete:** Logged **`4.00h`** billable (`"UAT ISO Control Walkthrough"`), **`1.50h`** non-billable (`"Internal Prep Sync"`), and **`0.50h`** temporary entry (`"Temp Entry For Delete Check"`) which was subsequently deleted and verified removed.
- **RBAC Masking & Read-Only Gating:** Verified **Projects & Gantt** withheld Client/Project creation forms; **Rate Cards** displayed `"Restricted (RBAC): Cost & billing rates are hidden for this role."` with `"Restricted"` gross margin; **Profitability KPIs** displayed `"Restricted (RBAC)"` for Labor Cost & Gross Profit Margin %.

### Stage 3 — Line Manager Review (`line.manager@ndakalaadvisory.co.ke`)
- Opened **Time Tracker -> Approvals**, verified `Staff` column displayed **Advisory Associate**.
- **Approved** the `4.00h` billable entry (`"UAT ISO Control Walkthrough"`).
- **Rejected** the `1.50h` non-billable entry (`"Internal Prep Sync"`) with audit reason `"Clarify deliverable & phase allocation"`.
- Verified master table showed `4.00h` **`APPROVED`**, `1.50h` **`REJECTED`** (with reason), and `0.25h` **`PENDING`**.

### Stage 4 — Executive KPIs, SHA-256 Lock & 409 Guard (`managing.partner@ndakalaadvisory.co.ke`)
- **Profitability KPIs (Nov 2026):** Observed **`4.25 hrs`** logged (`4.25h` billable, omitted `1.50h` rejected), **Billability `100%`**, **Labor Cost `KES 10,625.00`**, **Billable Revenue `KES 27,625.00`**, **Non-Billable Leakage `KES 0.00`**, and **Gross Profit Margin `61.54%`**.
- **Capacity Utilization (Nov 2026):** Observed 21 Mon–Fri days (`168h` expected); **Advisory Associate (`SEED-0003`)** at `4.25h` (`2.5%` utilization, `100%` billability).
- **Period Close & SHA-256 Snapshot:** Opened **December 2026** (`2026-12-01` to `2026-12-31`), logged `5.00h` billable (`"December Advisory Close Test"`, `KES 32,500.00`), and locked period generating SHA-256 digest `1f6a4ccac8901675307f4c4c54122343f36d8d86ebdb7edbe25f4d02cd374a21`.
- **Immutable Period Lock Guard (`HTTP 409`):** Attempted `2.0h` log on `2026-12-10` while locked -> received **`409 Conflict`** (`code: "PERIOD_LOCKED"`, `"Financial period \"December 2026\" (2026-12-01 to 2026-12-31) is permanently LOCKED."`) with red error banner in UI.
- **Audited Reopen & Sign-out:** Reopened **December 2026** with audit reason `"Audit adjustment verified by Managing Partner"` and signed out cleanly.

---

## 5. PostgreSQL Production Persistence Audit

Direct inspection of `ndakala_hr-db` (`psql -U ndakala_hr -d ndakala_hr`) confirmed all state changes persisted accurately and baseline employee `NDA-2026-0005` remained intact:

| Table | Verified Production Records |
| :--- | :--- |
| `PolicyConfiguration` | `WS_SHIFTS_CATALOG` (v2, `ACTIVE`): includes `"UAT-DAY"` (`UAT Advisory Day Shift`, `08:30`–`17:30`, `assignedEmployeeIds: ["66f60110-3e98-4127-836d-7eee3ef1e736"]`) alongside `"GEN-DAY"`. |
| `TimeClient` | `c5398f4c-cfbe-4676-a1a8-d3b2f3d11dcc` \| `CLI-UAT-01` \| `UAT Capital Group` \| `Financial Services` \| `ops@uatcapital.ke` \| `isActive = t`. |
| `TimeProject` | `9ee83562-2f5c-4906-9087-71467e477e38` \| `PRJ-UAT-01` \| `UAT Compliance Audit` \| Budget `500000` KES \| `ACTIVE`. |
| `TimePhase` | `8d4ff2c6-ba4e-410d-aa9f-7e21913d56e6` \| `Phase 1: Fieldwork` \| `progressPct = 40` \| `2026-11-01`–`2026-12-31`. |
| `TimeRateCard` | 2 active cards: `66f60110...` (`2500 / 6500 KES`) and `4464ae38...` (`3500 / 8500 KES`). |
| `TimeLog` | **4 retained rows** (temporary `0.50h` deleted): `0.25h` `PENDING` (`UAT live stopwatch session`); `4h` `APPROVED` (`UAT ISO Control Walkthrough`); `1.5h` `REJECTED` (`Internal Prep Sync`, reason: `Clarify deliverable & phase allocation`); `5h` `APPROVED` (`2026-12-10`, `December Advisory Close Test`). Snapshotted rates: `2500 / 6500`. |
| `TimePeriodClose` | `November 2026` (`OPEN`); `December 2026` (`OPEN` post-reopen, preserving `snapshotChecksum = 1f6a4ccac8901675307f4c4c54122343f36d8d86ebdb7edbe25f4d02cd374a21` and `snapshotJson` showing `entriesLocked: 1`, `grossProfitMarginPct: 61.54`). |
| `AttendancePunch` | `bed71f3e-dc4b-47ca-9999-098c923645ea` \| `workDate = 2026-11-15` \| `clockInAt = 16:50:32.264` \| `clockOutAt = 16:54:11.275` \| `totalSecs = 219` \| `source = WEB`. |
| `AuditLog` | Recorded complete trail: `WORKSPACE_SHIFT_CREATED`, `WORKSPACE_SHIFT_UPDATED`, `TIME_CLIENT_CREATED`, `TIME_PROJECT_CREATED`, `TIME_RATE_CARD_UPDATED` (x2), `ATTENDANCE_CLOCK_IN`, `TIME_LOG_CREATED` (x5), `TIME_LOG_DELETED`, `ATTENDANCE_CLOCK_OUT`, `TIME_LOGS_APPROVE`, `TIME_LOGS_REJECT`, `TIME_PERIOD_OPENED`, `TIME_PERIOD_LOCKED`, `TIME_PERIOD_REOPENED`. |
| `Employee` | Retained baseline verified: `NDA-2026-0005 \| Amina Ochieng \| ACTIVE`. |
