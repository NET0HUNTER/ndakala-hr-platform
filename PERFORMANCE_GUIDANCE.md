# Ndakala HR Platform — Performance, OKRs & PIP Guidance

**Module Scope:** Performance Management, OKRs / 6-Objective SMART Goal Sheets, Self & Manager Appraisals, 360° Peer Feedback, HR Moderation, Partner Approval, Configurable Annual Composite Formulas, Development Plans & Performance Improvement Plans (PIPs)  
**Target Roles:** Employee, Line Manager, HR Lead (`head_of_hr`), Operations Director (`operations_director`), Managing Partner (`managing_partner`)  

---

## 1. Module Architecture & Navigation

Access via the left Sidebar:
- **Performance** (`performance`): Opens *Getting Started*, *My Appraisals & Goals* (operational workspace), or *Performance Settings* (HR / Executive configuration).
- **OKR** (`okr`): Opens directly into **Objectives & 6-Objective SMART Goal Sheets** under the operational workspace.

Inside **My Appraisals & Goals**, five synchronized operational tabs govern the entire lifecycle:
1. **Goal Sheets & OKRs:** Draft 6-objective weighted SMART goal sheets (`= 100%`), submit for Maker-Checker manager approval, and issue documented amendments (`v2+` while preserving prior versions as `SUPERSEDED`).
2. **Appraisals & 360 Peer Review:** Submit self-assessments (requiring ≥2 strengths and ≥2 improvement areas), execute manager 1–6 ratings and formal 1:1 meeting agreements, gather identity-protected 360° peer feedback, apply HR moderation, and grant Managing Partner final sign-off.
3. **Cycles & Annual Formula:** Create annual/quarterly review cycles, run side-by-side formula simulations (`SIMPLE_AVERAGE`, `QUARTERLY_WEIGHTED`, `ANNUAL_ONLY`, `HYBRID_SPLIT`), propose a composite model (`head_of_hr` / `operations_director`), and activate via Maker-Checker (`managing_partner` approval).
4. **PIPs (Capability Process):** Initiate 1–3 month structured capability PIPs with SMART targets and automatic monthly check-in slots (`Month 1..N`), capture employee acknowledgment or documented refusal-to-sign, log monthly review evidence, and authorize human-decided outcomes (`CLEARANCE`, `FURTHER_REVIEW`, `REFERRAL_TO_FAIR_HEARING`).
5. **Development Actions:** Record employee development items linked to appraisals/training programmes and mark actions completed with verifiable evidence.

---

## 2. Role Responsibilities & Maker-Checker Matrix

| Workflow Stage | Authorized Roles | Maker-Checker & Privacy Invariants |
| :--- | :--- | :--- |
| **Draft & Submit 6-Objective Goal Sheet** | Employee (for self), Line Manager, HR, Executive | Weighted objectives must sum to exactly **100%**; exceeding cycle guideline count issues a non-blocking warning. |
| **Approve / Amend Goal Sheet** | Line Manager, HR Lead, COO, Managing Partner (`objectives.approve`) | **Maker-Checker:** Staff member cannot approve their own goal sheet; amendments create Version `N+1` and mark prior sheet `SUPERSEDED`. |
| **Submit Self-Appraisal** | Employee (`appraisal.view_self`) | Requires active reporting manager, **≥ 2 strengths**, and **≥ 2 improvement areas**. |
| **Manager Rating & 1:1 Review Meeting** | Line Manager, HR, Executive (`appraisal.manage_team`) | **Maker-Checker:** Employee cannot rate themselves. Rating **1 (*Too Early to Assess*)** is strictly non-numeric and excluded from cycle averages. |
| **Request 360° Peer Feedback** | Line Manager, HR, Executive (`peer_feedback.request`) | Assigned peer receives task under **My Assigned 360 Peer Reviews**; **Privacy:** Reviewee sees `[ANONYMISED / IDENTITY PROTECTED FROM REVIEWEE]`, while HR & Executive retain full auditability. |
| **HR Moderation** | HR Lead, COO, Managing Partner (`appraisal.moderate`) | Distribution guidance (`5 / 10 / 70 / 10 / 5`) is advisory unless explicitly marked mandatory. |
| **Partner Final Sign-Off** | Managing Partner, COO (`appraisal.approve`) | Freezes `ratingConfigurationSnapshot` at completion. |
| **Propose & Approve Annual Formula** | Proposal: `performance.cycle.manage`; Approval: `appraisal.approve` (`managing_partner` / `operations_director`) | **Guardrail D-21:** Unapproved cycles return `annualCompositeScore: null`. **Maker-Checker:** Proposer cannot approve their own formula proposal. |
| **Initiate PIP & Log Check-Ins** | Initiate: `pip.initiate`; Check-ins: `pip.view_team`; Ack/Refusal: `pip.view_self` | Duration strictly capped at **1–3 months**. Isolated from disciplinary misconduct (`isCapabilityProcess = true`). Refusal to sign records reason without halting PIP. |
| **Authorize PIP Outcome** | HR Lead, COO, Managing Partner (`pip.decide`) | Strictly human-authorized (`CLEARANCE`, `FURTHER_REVIEW`, `REFERRAL_TO_FAIR_HEARING`); never auto-terminates or auto-alters salary. |

---

## 3. Standard Rating Scale (1–6)

| Code | Label | Included in Numeric Averages? |
| :---: | :--- | :---: |
| **1** | Too Early to Assess | **No** (`isNumericScore = false`) |
| **2** | Unsatisfactory / Needs Significant Improvement | Yes |
| **3** | Developing / Partially Meets Expectations | Yes |
| **4** | Good / Fully Meets Expectations | Yes |
| **5** | Very Good / Exceeds Expectations | Yes |
| **6** | Outstanding / Far Exceeds Expectations | Yes |
