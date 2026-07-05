#!/bin/sh
set -e

cd /app

log() {
  echo "[entrypoint] $*"
}

if [ -n "${MASTER_DATABASE_URL:-}" ]; then
  log "Running migrate-all-tenants..."
  if ! node dist/bootstrap/migrateAllTenants.js 2>&1; then
    log "ERROR: migrate-all-tenants failed."
    exit 1
  fi
else
  log "WARN: MASTER_DATABASE_URL not set; skipping tenant migrations"
fi

log "Starting application..."
exec "$@"
