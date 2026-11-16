# Verification Report: Unified Files Hub & App-Only Microsoft 365 Integration

**Date:** 2026-11-16
**Live Environment:** `https://ndakalahr.duckdns.org` (Host `158.220.93.237`, PostgreSQL `ndakala_hr-db`)
**Implemented Modules:** Zoho-Parity Unified Files Hub, AES-256-GCM Encrypted Vault, 22 Real Company Policy PDFs, App-Only Microsoft 365 Client (`Sites.Selected`, `Mail.Send`, `Calendars.ReadWrite`), Cold Storage Archival Job (`6`-month configurable default), and Zero-Trust Inline Document Viewer.

---

## 1. Automated Verification (`Vitest`)

- **Command:** `npx vitest run --hookTimeout=120000 --no-file-parallelism` inside `ndakala-hr-builder:latest` against fresh Prisma Client + TypeScript `tsc` build
- **Result:** **`17 passed (17)` test files | `190 passed (190)` tests | `0 failed` | `0 skipped`**
- **New Suite (`tests/files_m365_integration.test.ts` — 5/5 passed):**
  1. Verifies binary `AES-256-GCM` encryption on disk (`NDKENC01` header in `secure_storage/`) and clean decrypted streaming via `GET /api/v1/files/:id/inline?token=...` with `Content-Disposition: inline` and `Cache-Control: no-store`.
  2. Verifies all 22 `POL-NDA-*` policies seeded (`20 PUBLISHED`, `2 DRAFT`), hierarchical folders, and native React `Company Handbook Template` -> backend `%PDF-1.4` compilation.
  3. Verifies Filter Drawer queries (`fileName`, `fileFormat`, etc.), Bulk actions (`COPY`, `DELETE`), `PrivacyLegalHold` active deletion block (`409 Conflict`), and filtered CSV Export (`POST /api/v1/files/export`).
  4. Verifies shared-mailbox login isolation: `POST /api/v1/auth/m365/break-glass` rejects standard staff (`403 Forbidden`).
  5. Verifies Mock Microsoft Graph HTTP flow: App-Only `client_credentials` token acquisition, SharePoint dual-write upload, `noreply@ndakalaadvisory.co.ke` link-only email with empty `attachments` and zero PII, non-blocking leave approval `showAs: "free"` All-Day shared department calendar event (confirming `mailboxSettings` is never accessed), and 6-month cold archival purge + transparent SharePoint fallback streaming.

---

## 2. Live PostgreSQL Production Check (`ndakala_hr-db`)

Verified directly inside live production container `ndakala_hr-app` against `ndakala_hr`:
- Retained test employee `NDA-2026-0005` (`Amina Ochieng`, status `ACTIVE`).
- `PolicyVersion` grouped for `POL-NDA-*`: **`20` `PUBLISHED`**, **`2` `DRAFT`** (`Access Control draft.pdf`, `Data Backup Policy draft.pdf`).
- `DocumentFolder`:
  - `Compliance & Risk Governance` (`ORG`, `3` documents)
  - `HR & Employment Policies` (`ORG`, `11` documents)
  - `IT, Cybersecurity & Data Privacy` (`ORG`, `8` documents)
  - `HR Forms & Templates` (`ORG`)
- `HrTemplate`:
  - `TPL-ADDR-PROOF-001` (`Address Proof & Employment Confirmation Form`)
  - `TPL-CERT-SERVICE-001` (`Certificate of Service Form`)
  - `TPL-HANDBOOK-001` (`Company Handbook Template`)
- `/api/v1/health`: `{"status":"UP","service":"Ndakala HR Platform","version":"1.0.0"}`
- `/api/v1/ready`: `{"status":"READY","database":"CONNECTED"}`

---

## 3. Live Browser UI E2E Verification (`https://ndakalahr.duckdns.org`)

Executed via live Chromium browser verification logged in as `hr.lead@ndakalaadvisory.co.ke`:
1. **Files Hub (`More -> Files`):** Verified `Shared with Me`, `Shared with My Role`, `Manage`, `Organization Files`, `Employee Files`, and `HR Forms & Templates` tabs + `"AES-256 Vault + App-Only SharePoint Proxy"` security indicator.
2. **Organization Files & 22 Policy PDFs:** Verified 25 files listed (all 22 Ndakala Advisory policy PDFs + 3 existing documents), `Folders (4)` modal counts & folder filtering chip, multi-facet `Filter` drawer (`Whistle` match -> `Reset`), `"Preview Inline"` opening `DATA PRIVACY POLICY.pdf` in Zero-Trust Inline Stream `<iframe>` with `"Word Online Editing Disabled"`, and `"Export organization file ?"` confirmation modal.
3. **HR Forms & Templates:** Verified `Company Handbook Template` + description matching Zoho reference, submitted native React form (`Fill Form & Compile PDF` -> `Compile to PDF & Preview Inline`), and verified compiled PDF rendered inline.
4. **Policies Tab (`GovernanceView`):** Verified `POL-NDA-01`..`POL-NDA-22` visible (including 2 `DRAFT` policies) and tested inline `Preview PDF` directly from Policies.
5. **Admin M365 Configuration (`Settings -> Manage Account & Organization -> Integrations, SIEM & Bank EFT`):** Verified App-Only M365 fields (`Tenant ID`, `Client ID`, `Client Secret`, `SharePoint HR Site URL`, `noreply@ndakalaadvisory.co.ke`) and Cold Storage Archive Retention (`6` months + `Run Cold Archive Sweep Now`) rendered cleanly with zero console errors.
