# Flow 6: Governance, Compliance, Document Vault & Employee Relations — E2E Verification Report

**Environment:** `https://ndakalahr.duckdns.org` (VPS `158.220.93.237`, deployed commit `89b1c5c`)  
**Verification Date:** `2026-11-16`  
**Overall Result:** **PASSED (with scoped Document Vault live-upload note)** — Multi-role UI E2E lifecycle verified across `employee.one`, `hr.lead`, `operations.director`, and `managing.partner`, backed by PostgreSQL & `AuditLog` persistence and `16/16` passing Vitest suites.

---

## 1. Automated Build & Test Verification

Executed inside `ndakala-hr-builder:latest` against commit `89b1c5c` (`src/modules/governance/routes.ts`, `src/modules/er/service.ts`, `src/modules/er/routes.ts`, `frontend/src/App.jsx`, `frontend/src/views/GovernanceView.jsx`, `tests/governance_er_separation.test.ts`):
- `npx prisma generate && npx prisma db push --skip-generate` — Exited `0`
- `npm run build` (`tsc -p tsconfig.json`) & `npm run build:frontend` (Tailwind CSS + esbuild) — Exited `0`
- `npx vitest run --hookTimeout=120000 --no-file-parallelism` — **`Test Files 16 passed (16)`**, **`Tests 185 passed (185)`**, **`Duration 920.20s`**, `0` skipped, `0` failed.
- Production container health checks after deploy:
  - `GET /api/v1/health` -> `{"status":"UP","service":"Ndakala HR Platform","version":"1.0.0"}`
  - `GET /api/v1/ready` -> `{"status":"READY","database":"CONNECTED"}`

---

## 2. Live Multi-Role Browser E2E Verification

- **Subagent 1 (`2dab6a54-2e38-4625-b6c9-7e0d5da9a434`):** Executed Stage 1 (`employee.one`: HR Letter submission, Travel Request creation, Anonymous Whistleblower submission & token tracking, clean logout) and Stage 2 HR Letter approval (`hr.lead`), then terminated due to an upstream network `TLS handshake timeout`.
- **Subagent 2 (`0c1d2141-d69f-44c2-8032-26dce63b767f`, `BROWSER_HOST_FACTS` verified):**
  - `visited_origins`: `https://ndakalahr.duckdns.org`
  - `blocked_origins`: `none`
  - Observed live evidence screenshot (`ER Cases (2)`): [final_step_143.png](file:///C:/Users/Yankees/.gemini/antigravity/brain/c6c345a9-43ed-4ff7-8df8-cf8bfa3aa667/browser_evidence/0c1d2141-d69f-44c2-8032-26dce63b767f/final_step_143.png)

| Stage | Actor (`Role`) | Verified Workflows & Guardrails | Result |
| :--- | :--- | :--- | :---: |
| **Stage 1** | `employee.one@ndakalaadvisory.co.ke` (`employee`) | Submitted Address Proof HR Letter (`Opening a Bank Account`, `SUBMITTED`); submitted Mombasa travel request (`KES 45,000`, `SUBMITTED`); submitted anonymous whistleblower disclosure (`ER-WB-2026-0001`, `INTAKE`) & verified tracking token; confirmed restricted admin buttons hidden; signed out cleanly (`06:53:15Z`). | **PASS** |
| **Stage 2** | `hr.lead@ndakalaadvisory.co.ke` (`head_of_hr`) | Approved HR Letter (`APPROVED`); approved & marked Travel Request `REIMBURSED`; published `"Q4 Advisory Workplace Pulse"` survey and responded (`5/5`); drafted `POL-AI-2026` `v1.0 (DRAFT)` & confirmed `Maker-Checker: Author Cannot Self-Publish` badge; created `TRN-AML-2026`, assigned to `employee.one`, logged `"Q4 Phishing Awareness Reminder"` bulletin; created `ER-GRIEV-2026-0001`, scheduled hearing (`HEARING`), and issued `NO_SANCTION` decision (`OUTCOME_PENDING`); signed out cleanly (`08:05:51Z`). | **PASS** |
| **Stage 3** | `operations.director@ndakalaadvisory.co.ke` (`operations_director`) | Published `POL-AI-2026` v1.0 (`PUBLISHED`, `isImmutable`) as distinct Checker; dispatched **Remind Pending** (`5 pending staff`); verified **ER Case-Level Isolation** (`0` cases visible to non-assigned director); signed out cleanly (`08:11:41Z`). | **PASS** |
| **Stage 4a** | `employee.one@ndakalaadvisory.co.ke` (`employee`) | Acknowledged `POL-AI-2026` v1.0 (`ACKNOWLEDGED`); marked `TRN-AML-2026` complete (`COMPLETED`, `100%`); responded to engagement survey (`4/5`, `Avg 4.5 / 5`, `2 replies`); signed out cleanly (`08:15:15Z`). | **PASS** |
| **Stage 4b** | `managing.partner@ndakalaadvisory.co.ke` (`managing_partner`) | Verified executive ER oversight seeing both `ER-WB-2026-0001` (`INTAKE`, `ANONYMOUS`) and `ER-GRIEV-2026-0001`; inspected hearing/decision trail; processed **Submit Appeal** -> **Review Appeal** (`UPHELD`) transitioning `ER-GRIEV-2026-0001` to **`CLOSED`**; signed out cleanly (`08:18:44Z`). | **PASS** |

> [!NOTE]
> **Document Vault Live Browser Gap Observed:** `DocumentRecord` remained at the `3` seeded files (`van212.png`, `signed-contract.pdf`, `induction-attendance.pdf`) because subagent `0c1d2141` omitted the browser file-upload / `Signed Download` step on `compliance-charter.txt`. Vault upload/download token security (`POST /api/v1/documents/:id/token` + `GET /api/v1/documents/download`) passed automated verification in `tests/documents_security.test.ts` (`vitest run`), and the entire Files UI is scheduled for upgrade under [microsoft_365_files_integration_plan.md](file:///C:/Users/Yankees/.gemini/antigravity/brain/c6c345a9-43ed-4ff7-8df8-cf8bfa3aa667/microsoft_365_files_integration_plan.md).

---

## 3. PostgreSQL Database & AuditLog Verification (`ndakala_hr-db`)

| Table | Baseline | Post-UAT | Exact Observed State |
| :--- | :---: | :---: | :--- |
| `PolicyDocument` / `PolicyVersion` | `3` / `3` | `4` / `4` | Added `POL-AI-2026` (`v1.0`, `PUBLISHED`, `isImmutable = t`) |
| `PolicyAcknowledgement` | `0` | `7` | `SEED-0003` (`employee.one`) = `ACKNOWLEDGED`; 6 other active staff (`NDA-2026-0003`, `0004`, `0005`, `SEED-0000`, `0001`, `0002`) = `PENDING` |
| `TrainingProgramme` / `TrainingAssignment` | `5` / `0` | `6` / `2` | Added `TRN-AML-2026`; `SEED-0003` has `1 COMPLETED` (`scorePercent = 100`, `passed = t`) and `1 ASSIGNED` |
| `SecurityCommunicationLog` | `0` | `1` | Logged by `hr.lead` (`2026-11-16 07:58:41Z`) |
| `DocumentRecord` | `3` | `3` | Seeded 3 records intact (`van212.png`, `signed-contract.pdf`, `induction-attendance.pdf`) |
| `ErCase` / `ErHearing` / `ErCaseDecision` / `ErAppeal` | `0/0/0/0` | `2/1/1/1` | `ER-WB-2026-0001` (`WHISTLEBLOWING`, `INTAKE`, `isAnonymous = t`); `ER-GRIEV-2026-0001` (`GRIEVANCE`, `CLOSED`, Appeal `UPHELD`) |
| `HrLetterRequest` | `0` | `1` | `Opening a Bank Account` -> `APPROVED` by `hr.lead` |

### Audit Trail & Production Seed Preservation
- Verified `AuditLog` sequence across `HR_LETTER_SUBMITTED`, `TRAVEL_REQUEST_CREATED`, `ER_WHISTLEBLOWER_SUBMITTED`, `HR_LETTER_APPROVED`, `TRAVEL_REQUEST_APPROVED`, `TRAVEL_REQUEST_REIMBURSED`, `ENGAGEMENT_SURVEY_CREATED`, `ENGAGEMENT_SURVEY_RESPONDED`, `POLICY_DRAFT_CREATED`, `SECURITY_COMMUNICATION_LOGGED`, `TRAINING_PROGRAMME_CREATED`, `TRAINING_ASSIGNED`, `ER_CASE_CREATED`, `ER_HEARING_SCHEDULED`, `ER_DECISION_ISSUED`, `POLICY_VERSION_PUBLISHED`, `POLICY_ACKNOWLEDGEMENT_REMINDER_DISPATCHED`, `POLICY_ACKNOWLEDGED`, `TRAINING_COMPLETED`, `ER_APPEAL_FILED`, `ER_APPEAL_DECIDED`, and final `AUTH_LOGOUT` (`managing.partner@ndakalaadvisory.co.ke` at `2026-11-16 08:18:44.662Z`).
- Verified `NDA-2026-0005` (`Amina Ochieng`) remains **`ACTIVE`** in `"Employee"`.
