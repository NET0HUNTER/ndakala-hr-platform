FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma SQLite engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and configurations for building TypeScript & Frontend SPA
COPY tsconfig.json tailwind.config.js build-frontend.mjs vitest.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY tests ./tests
COPY frontend ./frontend
COPY public ./public
COPY assets ./assets

# Generate Prisma Client, compile TypeScript & bundle Frontend SPA
RUN npx prisma generate && npm run build && npm run build:frontend

# Runtime Stage
FROM node:20-slim

WORKDIR /app

# Install OpenSSL for Prisma engines
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package configurations and built artifacts
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets ./assets
COPY secure_storage ./secure_storage

RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh && ./node_modules/.bin/prisma generate --schema=prisma/schema.postgresql.prisma

# Environment defaults
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL="file:/app/prisma/dev.db"

# Expose port
EXPOSE 4000

# Execute schema push, idempotent seed check, and start production server
CMD ["./docker-entrypoint.sh"]
