#!/bin/sh
set -e

echo "================================================"
echo "  FindMe - Self-Hosted Location Sharing"
echo "================================================"
echo ""

# Ensure DATABASE_URL points to the writable data volume (use env var if set, otherwise default)
export DATABASE_URL="${DATABASE_URL:-file:/app/data/findme.db}"

# Migrate legacy database filename (dev.db → findme.db) for existing installations
DB_PATH="${DATABASE_URL#file:}"
if [ "$DB_PATH" = "/app/data/findme.db" ] && [ ! -f "/app/data/findme.db" ] && [ -f "/app/data/dev.db" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Migrating database: dev.db → findme.db"
  mv /app/data/dev.db /app/data/findme.db
  [ -f /app/data/dev.db-journal ] && mv /app/data/dev.db-journal /app/data/findme.db-journal
  [ -f /app/data/dev.db-wal ] && mv /app/data/dev.db-wal /app/data/findme.db-wal
  [ -f /app/data/dev.db-shm ] && mv /app/data/dev.db-shm /app/data/findme.db-shm
fi

# Auto-generate secrets if not provided by the user.
# Generated secrets are persisted to the data volume so they survive container restarts.
SECRETS_FILE="/app/data/.secrets"

generate_or_load_secret() {
  var_name="$1"
  eval current_val="\$$var_name"

  # If the user explicitly set it, use theirs — don't touch it
  if [ -n "$current_val" ]; then
    return
  fi

  # Try to load a previously generated secret from the data volume
  if [ -f "$SECRETS_FILE" ]; then
    saved_val=$(grep "^${var_name}=" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$saved_val" ]; then
      export "$var_name=$saved_val"
      return
    fi
  fi

  # Generate a new random secret and persist it
  new_val=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 44)
  echo "${var_name}=${new_val}" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  export "$var_name=$new_val"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] INF [startup] Generated ${var_name} (saved to data volume)"
}

generate_or_load_secret NEXTAUTH_SECRET
generate_or_load_secret JWT_SECRET

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
