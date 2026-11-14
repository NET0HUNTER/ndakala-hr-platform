# Production Hosting & Deployment Plan: Ndakala HR & People Operations Platform

## 1. Executive Summary & Hardening Baseline
The **Ndakala HR & People Operations Platform** has completed demo-credential sanitization, RBAC verification, PostgreSQL 16 production containerization, DuckDNS DNS cutover (`158.220.93.237`), and multi-tenant VPS hardening for deployment to **Contabo VPS (`158.220.93.237`)**.

### Database Architecture Decision: Why SQLite Is Retained for Tests While PostgreSQL 16 Powers Production
- **Why SQLite (`prisma/schema.prisma`) exists in this repo**: SQLite allows the 16 Vitest integration suites (`172` automated tests) to spin up zero-dependency, isolated ephemeral test databases inside `ndakala-hr-test` in seconds without requiring a live Postgres daemon in CI or unit runs.
- **Why Production MUST run PostgreSQL 16 (`prisma/schema.postgresql.prisma` + `ndakala_hr-db`)**:
  1. **Concurrency & Multi-Worker Writes**: Concurrent HR, leave approvals, payroll batching, and audit-log writes hit `SQLITE_BUSY` file locks under SQLite; PostgreSQL uses row-level MVCC locking cleanly.
  2. **ACID Durability & Financial Integrity**: Kenya PAYE/NSSF/SHIF/AHL payroll runs and leave ledger deductions benefit from strict transactional guarantees and WAL crash recovery.
  3. **Zero-Downtime Online Backups**: `pg_dump -Fc` inside `ndakala_hr-db` takes consistent hot backups without stopping the application or risking half-flushed file copies.
  4. **Private Network Isolation**: `postgres:16-alpine` (`ndakala_hr-db`) runs exclusively inside the internal `ndakala-hr-net` Docker bridge with **no host port `5432` published**, preventing conflicts with host PostgreSQL or sibling tenant databases.

### Pre-Deployment Hardening Applied
1. **Demo Credentials & Quick Role Switchers Removed**:
   - Stripped the `Sign in using Workspace Role` quick-picker (`WORKSPACE_PERSONAS`) and hardcoded demo credentials from [LoginView.jsx](frontend/src/views/LoginView.jsx).
   - Removed the in-app `Switch Authenticated Role` demo switcher (`WORKSPACE_ROLES` and `onSwitchWorkspaceRole`) from [Header.jsx](frontend/src/components/Header.jsx) and [App.jsx](frontend/src/App.jsx).
   - Replaced hardcoded fallback identities with live authenticated session claims (`Authenticated Access Profile` displaying assigned RBAC roles and granted permission count).
2. **Demo & Personal Fallback Data Removed**:
   - Eliminated hardcoded personal placeholder strings from [MyWorkspaceView.jsx](frontend/src/views/MyWorkspaceView.jsx), [Header.jsx](frontend/src/components/Header.jsx), and [IntegrationsSecurityView.jsx](frontend/src/views/IntegrationsSecurityView.jsx).
   - Gated sample Time Tracker clients, projects, and sample logs in [src/seed.ts](src/seed.ts) behind `NODE_ENV === 'test' || SEED_SAMPLE_DATA === 'true'` so production bootstraps only statutory rules, Kenya 2026 gazetted holidays, baseline leave types, pay groups, policies, and open current financial periods.
   - Added `INITIAL_ADMIN_PASSWORD` environment variable support in [src/seed.ts](src/seed.ts) for clean bootstrap password injection on first deploy.
3. **RBAC Enforcement Verified (Backend & UI)**:
   - Restricted `/api/v1/payroll/simulate`, `/api/v1/payroll/runs/:id`, and `/api/v1/payroll/periods/:id/runs` to users holding payroll permissions (`payroll.prepare`, `payroll.approve`, `payroll.config.manage`, or `payroll.reports.view`).
   - Enforced strict ownership checks on `/api/v1/payroll/salaries/employee/:employeeId` unless privileged payroll/HR permissions are held.
   - Scoped Quick Add (`Add Candidate / Employee`), Settings Gear (`Organization Settings`), and Compensation/Payroll views ([PayrollView.jsx](frontend/src/views/PayrollView.jsx)) by RBAC roles and permissions.

---

## 2. Target VPS Environment & Multi-Tenant Safety

| Parameter | Production Value | Notes |
|---|---|---|
| **VPS Provider & IP** | Contabo VPS `158.220.93.237` | Ubuntu 24.04 LTS |
| **SSH Access** | `ssh -p 2222 sysadmin@158.220.93.237` | Ed25519 key authentication |
| **Deployment Directory** | `/opt/ndakala_hr` | Cloned from GitHub `main` branch |
| **Domain / DNS / TLS** | `https://ndakalahr.duckdns.org` | DuckDNS A-record pointed to `158.220.93.237` + Let's Encrypt TLS 1.2/1.3 |
| **Web Host Port Binding** | `127.0.0.1:3006` -> Container `4000` | Loopback-only binding (no `0.0.0.0`) |
| **Database Engine** | PostgreSQL 16 (`ndakala_hr-db`) | Private on `ndakala-hr-net` (`ndakala_hr-db:5432`), **zero host port published** |
| **Prohibited Host Ports** | Never bind `4000` or `5432` to host | Port `4000` is Retail ERP API; host DB ports reserved for sibling tenants |
| **Persistent Volumes** | `./postgres_data`, `./prisma`, `./secure_storage` | Survives image rebuilds & container restarts |

### Multi-Tenant Coexistence Matrix (6 Live Applications on `158.220.93.237`)
1. **Ndakala HR & People Operations Platform** — `https://ndakalahr.duckdns.org` -> `127.0.0.1:3006` (PostgreSQL `ndakala_hr-db` internal only)
2. **Ndakala Timesheet App** — `https://ndakalatimesheetapp.duckdns.org` -> Existing sibling tenant port
3. **Retail ERP** — `https://retailerp.duckdns.org` -> Existing sibling tenant (occupies host port `4000`)
4. **Jollof Crib POS** — `https://jollofcrib-pos.duckdns.org` -> Existing sibling tenant port
5. **Hannings DMS** — `https://hanningsdms.duckdns.org` -> Existing sibling tenant port
6. **ICPAK License (`ICPAK LICENSE`)** — Existing sibling tenant application & database on the same VPS host

> **CRITICAL ISOLATION RULE**: Never bind `0.0.0.0:3006`, `4000:4000`, or `5432:5432` in [docker-compose.yml](docker-compose.yml), and never modify sibling Nginx configs, systemd services, or databases belonging to **ICPAK LICENSE**, **Retail ERP**, **Ndakala Timesheet**, **Jollof Crib POS**, or **Hannings DMS**.

---

## 3. Repository & Deployment Artifacts Included

- [prisma/schema.postgresql.prisma](prisma/schema.postgresql.prisma) — PostgreSQL 16 Prisma schema selected automatically at runtime when `DATABASE_URL` starts with `postgres://` or `postgresql://`.
- [docker-entrypoint.sh](docker-entrypoint.sh) — Smart runtime entrypoint pushing the PostgreSQL schema, running idempotent production seeding, and launching Node.
- [docker-compose.yml](docker-compose.yml) — Multi-service stack (`ndakala_hr-db` Postgres 16 with healthcheck + `ndakala_hr-app` bound to `127.0.0.1:3006:4000`).
- [deploy/nginx/ndakalahr.conf](deploy/nginx/ndakalahr.conf) — HTTP->HTTPS redirect, TLS 1.2/1.3, security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`), `50M` upload limit, and reverse proxy to `http://127.0.0.1:3006`.
- [deploy/scripts/setup-vps.sh](deploy/scripts/setup-vps.sh) — Automated bootstrap script (port checks for `3006`/`4000`/`5432`, 256-bit `.env` generation, Postgres + App startup, Nginx/Certbot TLS activation, cron setup).
- [deploy/scripts/backup-cron.sh](deploy/scripts/backup-cron.sh) — Daily `03:30 AM` online `pg_dump -Fc` + encrypted document vault (`secure_storage`) archive with `chmod 600` and 14-day retention.
- [.env.example](.env.example) — Template of required environment variables (never commit `.env` or raw `DUCKDNS_TOKEN`).

---

## 4. Step-by-Step Production Deployment Runbook

### Phase A: Clone Repository & Initialize Environment on VPS
```bash
ssh -p 2222 sysadmin@158.220.93.237

sudo mkdir -p /opt/ndakala_hr /var/backups/ndakala_hr
sudo chown -R sysadmin:sysadmin /opt/ndakala_hr
git clone https://github.com/NET0HUNTER/ndakala-hr-platform.git /opt/ndakala_hr
cd /opt/ndakala_hr
```

Verify port `3006` is free and neither `4000` (Retail ERP) nor sibling `ICPAK LICENSE` / host ports are conflicted:
```bash
ss -tulpn | grep -E ":3006 |:4000 |:5432 "
```

### Phase B: Generate Cryptographic & PostgreSQL Secrets (`/opt/ndakala_hr/.env`)
```bash
cd /opt/ndakala_hr
PG_PASS="$(openssl rand -hex 24)"
cat <<EOF > .env
PORT=4000
NODE_ENV=production
POSTGRES_USER=ndakala_hr
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=ndakala_hr
DATABASE_URL=postgresql://ndakala_hr:${PG_PASS}@ndakala_hr-db:5432/ndakala_hr?schema=public
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)
IDENTIFIER_HASH_SECRET=$(openssl rand -hex 32)
DOWNLOAD_TOKEN_SECRET=$(openssl rand -hex 32)
INITIAL_ADMIN_PASSWORD=$(openssl rand -base64 18)
DUCKDNS_TOKEN=
EMPLOYEE_NUMBER_PREFIX=NDA
LIFECYCLE_JOB_INTERVAL_MINUTES=60
EOF
chmod 600 .env
```
> Record `INITIAL_ADMIN_PASSWORD` securely in your password vault, authenticate as `managing.partner@ndakalaadvisory.co.ke` after launch, and immediately update passwords / enable TOTP MFA for all active staff accounts. Never commit `.env` or store your DuckDNS token in tracked files.

### Phase C: Build & Start PostgreSQL 16 + App Containers
```bash
cd /opt/ndakala_hr
sudo docker compose up -d --build
```
The stack:
1. Starts `ndakala_hr-db` (`postgres:16-alpine`) and waits for `pg_isready` healthcheck.
2. Runs [docker-entrypoint.sh](docker-entrypoint.sh): pushes `prisma/schema.postgresql.prisma`, runs `node dist/src/seed.js` (idempotent production & Kenya 2026 statutory baseline), and starts `node dist/src/server.js` mapped strictly to `127.0.0.1:3006`.

Verify local loopback probes before configuring Nginx:
```bash
curl -I http://127.0.0.1:3006/api/v1/health   # Expect HTTP/1.1 200 OK
curl -I http://127.0.0.1:3006/api/v1/ready    # Expect HTTP/1.1 200 OK (PostgreSQL CONNECTED)
sudo ss -tulpn | grep -E ":3006 |:5432 "       # Must show 127.0.0.1:3006 ONLY; zero public 5432 from ndakala_hr-db
```

### Phase D: Host Nginx Reverse Proxy & Let's Encrypt SSL
```bash
sudo cp /opt/ndakala_hr/deploy/nginx/ndakalahr.conf /etc/nginx/sites-available/ndakalahr.conf
sudo certbot certonly --nginx -d ndakalahr.duckdns.org --non-interactive --agree-tos -m admin@ndakalaadvisory.co.ke
sudo ln -sf /etc/nginx/sites-available/ndakalahr.conf /etc/nginx/sites-enabled/ndakalahr.conf
sudo nginx -t && sudo systemctl reload nginx
```
> Ensure `ndakalahr.duckdns.org` resolves to `158.220.93.237` (already updated via DuckDNS API) before running Certbot HTTP-01 validation.

### Phase E: Configure Automated 03:30 AM Daily Online PostgreSQL & Vault Backup Cron
```bash
sudo mkdir -p /var/backups/ndakala_hr
chmod +x /opt/ndakala_hr/deploy/scripts/backup-cron.sh
sudo crontab -e
```
Add:
```cron
# Daily online pg_dump & vault backup for Ndakala HR at 03:30 AM
30 3 * * * /opt/ndakala_hr/deploy/scripts/backup-cron.sh >> /var/log/ndakala_hr_backup.log 2>&1
```
Run a test backup immediately to verify `pg_dump` and archive permissions:
```bash
sudo /opt/ndakala_hr/deploy/scripts/backup-cron.sh
ls -lh /var/backups/ndakala_hr/
```

---

## 5. Post-Deploy Verification & Sibling Tenant Smoke Matrix

Execute all checks immediately after Nginx reload:

1. **Ndakala HR Endpoints (PostgreSQL-backed)**:
   ```bash
   curl -I https://ndakalahr.duckdns.org/api/v1/health   # HTTP 200 OK
   curl -I https://ndakalahr.duckdns.org/api/v1/ready    # HTTP 200 OK (database CONNECTED)
   curl -I https://ndakalahr.duckdns.org/                 # HTTP 200 OK (SPA LoginView without demo role buttons)
   ```
2. **Sibling Applications Non-Regression Checks (All 5 Existing Tenants)**:
   ```bash
   curl -I https://ndakalatimesheetapp.duckdns.org        # HTTP 200 OK
   curl -I https://retailerp.duckdns.org                  # HTTP 200 OK
   curl -I https://jollofcrib-pos.duckdns.org             # HTTP 200 OK
   curl -I https://hanningsdms.duckdns.org                # HTTP 200 OK
   # Verify ICPAK LICENSE health/status endpoint & container/service status remain undisturbed
   ```
3. **Browser & RBAC Go-Live Checklist**:
   - Open `https://ndakalahr.duckdns.org` in a clean browser window -> confirm standard 2-step email/password login (`Sign in using Workspace Role` absent).
   - Sign in as `managing.partner@ndakalaadvisory.co.ke` -> verify `Authenticated Access Profile` in Header shows real RBAC roles & permission count, enroll TOTP MFA, change default bootstrap password, and deactivate unused test accounts or provision real employee accounts under `People & Directory` / `Files -> Governance & Audit`.
   - Confirm an `employee` session receives HTTP `403` on `/api/v1/payroll/simulate` and `/api/v1/users`, and sees only scoped Employee Self-Service controls.

---

## 6. Rollback Procedure
If an issue occurs during upgrade or migration:
```bash
cd /opt/ndakala_hr
sudo docker compose down
# Restore PostgreSQL custom dump & vault if database rollback is required
sudo docker compose up -d hr-db
cat /var/backups/ndakala_hr/<latest_db_dump>.dump | docker exec -i ndakala_hr-db pg_restore -U ndakala_hr -d ndakala_hr --clean --if-exists
tar -xzf /var/backups/ndakala_hr/<latest_vault>.tar.gz -C /opt/ndakala_hr
git checkout <previous_stable_commit>
sudo docker compose up -d --build
```
