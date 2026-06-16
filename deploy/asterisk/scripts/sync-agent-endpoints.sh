#!/usr/bin/env bash
# Sync CortexCC softphone endpoints -> deploy/asterisk/conf/pjsip_agents.conf
# and reload PJSIP in the local Asterisk container.
#
# Usage:
#   ./sync-agent-endpoints.sh
#   ADMIN_TOKEN=<jwt> ./sync-agent-endpoints.sh
#   BACKEND_URL=http://localhost:3030 ADMIN_EMAIL=admin@cortex.local ./sync-agent-endpoints.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASTERISK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONF_FILE="$ASTERISK_DIR/conf/pjsip_agents.conf"

BACKEND_URL="${BACKEND_URL:-http://localhost:3030}"
API_PREFIX="${API_PREFIX:-/api}"
TENANT_KEY="${TENANT_KEY:-local}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@cortex.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-demo1234}"
ASTERISK_CONTAINER="${ASTERISK_CONTAINER:-asterisk}"

CURL_TENANT=(-H "X-Tenant-Key: $TENANT_KEY")

login_token() {
  curl -sf -X POST "$BACKEND_URL${API_PREFIX}/auth/login" \
    "${CURL_TENANT[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | jq -r '.token // empty'
}

token="${ADMIN_TOKEN:-}"
if [[ -z "$token" ]]; then
  token="$(login_token)"
fi
if [[ -z "$token" ]]; then
  echo "ERROR: could not obtain admin token (set ADMIN_TOKEN or check BACKEND_URL/credentials)" >&2
  exit 1
fi

body="$(curl -sf "${CURL_TENANT[@]}" -H "Authorization: Bearer $token" \
  "$BACKEND_URL${API_PREFIX}/settings/softphone/endpoints/export?format=pjsip")"

if [[ -z "${body//[[:space:]]/}" ]]; then
  echo "WARN: export returned no endpoints — writing empty agents file" >&2
fi

tmp="$(mktemp)"
{
  cat <<EOF
; AUTO-GENERATED — do not edit manually.
; Source: ${BACKEND_URL}${API_PREFIX}/settings/softphone/endpoints/export?format=pjsip
; Regenerate: deploy/asterisk/scripts/sync-agent-endpoints.sh
; Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)

EOF
  printf '%s\n' "$body"
} >"$tmp"
mv "$tmp" "$CONF_FILE"

echo "Wrote $CONF_FILE"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$ASTERISK_CONTAINER"; then
  docker exec "$ASTERISK_CONTAINER" asterisk -rx "module reload res_pjsip.so" >/dev/null
  echo "Reloaded PJSIP in container $ASTERISK_CONTAINER"
else
  echo "WARN: container '$ASTERISK_CONTAINER' not running — restart Asterisk to apply changes"
fi
