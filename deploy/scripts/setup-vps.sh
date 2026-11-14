#!/usr/bin/env bash
set -euo pipefail

# Ndakala HR & People Operations Platform — Contabo VPS Setup & Deployment Script
# Target: Ubuntu 24.04 LTS | Host Port: 127.0.0.1:3006 -> Container: 4000 | DB: PostgreSQL 16 (internal only) | Domain: ndakalahr.duckdns.org

APP_DIR="/opt/ndakala_hr"
BACKUP_DIR="/var/backups/ndakala_hr"
DOMAIN="ndakalahr.duckdns.org"
CERT_EMAIL="admin@ndakalaadvisory.co.ke"

echo "=== [1/6] Checking multi-tenant port safety (127.0.0.1:3006, 4000 & 5432) ==="
if ss -tulpn | grep -q ":3006 "; then
  echo "INFO: Port 3006 is currently listening (likely existing ndakala_hr container)."
fi
if ss -tulpn | grep -q ":4000 "; then
  echo "INFO: Host port 4000 is active (Retail ERP API) — keeping Ndakala HR strictly on 127.0.0.1:3006."
fi
if ss -tulpn | grep -q ":5432 "; then
  echo "INFO: Host port 5432 is active (sibling DB service) — ndakala_hr-db stays private on ndakala-hr-net (zero host port published)."
fi

echo "=== [2/6] Ensuring directories & persistent volumes ==="
mkdir -p "${APP_DIR}/postgres_data" "${APP_DIR}/prisma" "${APP_DIR}/secure_storage" "${BACKUP_DIR}"
cd "${APP_DIR}"

echo "=== [3/6] Generating 256-bit cryptographic & PostgreSQL secrets (.env) if missing ==="
if [ ! -f "${APP_DIR}/.env" ]; then
  PG_PASS="$(openssl rand -hex 24)"
  cat <<EOF > "${APP_DIR}/.env"
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
DUCKDNS_TOKEN=${DUCKDNS_TOKEN:-}
EMPLOYEE_NUMBER_PREFIX=NDA
LIFECYCLE_JOB_INTERVAL_MINUTES=60
EOF
  chmod 600 "${APP_DIR}/.env"
  echo "Generated ${APP_DIR}/.env with 600 permissions."
  echo "IMPORTANT: Record INITIAL_ADMIN_PASSWORD from .env before first sign-in and rotate passwords immediately."
else
  echo "Using existing ${APP_DIR}/.env (chmod 600 enforced)."
  chmod 600 "${APP_DIR}/.env"
fi

echo "=== [4/6] Building & starting PostgreSQL 16 + App containers (127.0.0.1:3006:4000) ==="
sudo docker compose up -d --build

echo "Waiting for local health probe..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3006/api/v1/health" > /dev/null; then
    echo "Health check OK on http://127.0.0.1:3006/api/v1/health"
    break
  fi
  sleep 2
done
curl -I "http://127.0.0.1:3006/api/v1/ready"

echo "=== [5/6] Configuring Nginx reverse proxy & Let's Encrypt TLS ==="
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  sudo certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERT_EMAIL}"
fi
sudo cp "${APP_DIR}/deploy/nginx/ndakalahr.conf" /etc/nginx/sites-available/ndakalahr.conf
sudo ln -sf /etc/nginx/sites-available/ndakalahr.conf /etc/nginx/sites-enabled/ndakalahr.conf
sudo nginx -t && sudo systemctl reload nginx

echo "=== [6/6] Installing daily 03:30 AM PostgreSQL + Document Vault backup cron ==="
chmod +x "${APP_DIR}/deploy/scripts/backup-cron.sh"
CRON_LINE="30 3 * * * ${APP_DIR}/deploy/scripts/backup-cron.sh >> /var/log/ndakala_hr_backup.log 2>&1"
(sudo crontab -l 2>/dev/null | grep -v "ndakala_hr" || true; echo "${CRON_LINE}") | sudo crontab -

echo "=== Deployment complete! Verify https://${DOMAIN}/api/v1/health ==="
curl -I "https://${DOMAIN}/api/v1/health"
