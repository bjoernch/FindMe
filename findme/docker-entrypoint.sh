#!/bin/sh
set -e

echo "================================================"
echo "  FindMe - Self-Hosted Location Sharing"
echo "================================================"
echo ""

# Ensure DATABASE_URL points to the writable data volume
export DATABASE_URL="file:/app/data/dev.db"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Database: $DATABASE_URL"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Public URL: ${FINDME_PUBLIC_URL:-not set}"

# Show config summary (mask secrets)
if [ -n "$SMTP_HOST" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] SMTP: $SMTP_HOST:${SMTP_PORT:-587}"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] SMTP: not configured (email disabled)"
fi

# Run Prisma migrations
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Running database migrations..."
if node node_modules/prisma/build/index.js migrate deploy 2>&1; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Migrations applied successfully"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WRN [startup] Migration exited with warnings (may already be up to date)"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Starting FindMe server on port ${PORT:-3000}..."
echo ""
exec "$@"
