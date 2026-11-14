#!/bin/sh
set -e

if echo "$DATABASE_URL" | grep -qE '^postgres(ql)?://'; then
  echo "[entrypoint] Using PostgreSQL schema (prisma/schema.postgresql.prisma)..."
  ./node_modules/.bin/prisma db push --schema=prisma/schema.postgresql.prisma --skip-generate --accept-data-loss
else
  echo "[entrypoint] Using SQLite schema (prisma/schema.prisma)..."
  ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma
  ./node_modules/.bin/prisma db push --schema=prisma/schema.prisma --skip-generate
fi

echo "[entrypoint] Running idempotent production seed..."
node dist/src/seed.js

echo "[entrypoint] Starting Ndakala HR & People Operations server..."
exec node dist/src/server.js
