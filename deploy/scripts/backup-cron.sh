#!/usr/bin/env bash
set -euo pipefail

# Daily online backup of Ndakala HR PostgreSQL 16 database and encrypted document vault
BACKUP_DIR="/var/backups/ndakala_hr"
APP_DIR="/opt/ndakala_hr"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DB_DUMP="${BACKUP_DIR}/ndakala_hr_db_${TIMESTAMP}.dump"
VAULT_ARCHIVE="${BACKUP_DIR}/ndakala_hr_vault_${TIMESTAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

if [ -f "${APP_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${APP_DIR}/.env"
  set +a
fi

PG_USER="${POSTGRES_USER:-ndakala_hr}"
PG_DB="${POSTGRES_DB:-ndakala_hr}"

docker exec ndakala_hr-db pg_dump -U "${PG_USER}" -Fc "${PG_DB}" > "${DB_DUMP}"
tar -czf "${VAULT_ARCHIVE}" -C "${APP_DIR}" secure_storage

chmod 600 "${DB_DUMP}" "${VAULT_ARCHIVE}"

# Retain 14 days of PostgreSQL dumps and vault archives
find "${BACKUP_DIR}" -type f \( -name "ndakala_hr_db_*.dump" -o -name "ndakala_hr_vault_*.tar.gz" \) -mtime +14 -delete
echo "[$(date -Iseconds)] Backup completed: ${DB_DUMP}, ${VAULT_ARCHIVE}"
