#!/usr/bin/env bash
# Run full voice lab smoke: SIP register + API + unit tests + UI.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
READY_FILE="${SIP_READY_FILE:-/tmp/cortexcc-sip-ready}"
SIP_PID=""

cleanup() {
  if [[ -n "$SIP_PID" ]] && kill -0 "$SIP_PID" 2>/dev/null; then
    kill "$SIP_PID" 2>/dev/null || true
    wait "$SIP_PID" 2>/dev/null || true
  fi
  rm -f "$READY_FILE"
}
trap cleanup EXIT

echo ">>> SIP lab register (7001)"
rm -f "$READY_FILE"
(
  cd "$ROOT/frontend"
  NODE_TLS_REJECT_UNAUTHORIZED=0 node "$ROOT/scripts/sip-register-lab.mjs"
) &
SIP_PID=$!

for _ in $(seq 1 45); do
  [[ -f "$READY_FILE" ]] && break
  sleep 1
done
if [[ ! -f "$READY_FILE" ]]; then
  echo "FAIL  SIP lab register — timeout waiting for extension 7001"
  exit 1
fi
echo "PASS  SIP lab register (7001)"

echo ""
echo ">>> API + infra smoke"
"$ROOT/scripts/smoke-voice-lab.sh"

echo ""
echo ">>> Backend unit tests"
(cd "$ROOT/backend" && npm test)

echo ""
echo ">>> UI smoke (Playwright) — SIP lab se detiene para evitar conflicto WSS"
cleanup
SIP_PID=""
trap - EXIT
node "$ROOT/scripts/ui-smoke-voice-lab.mjs"

echo ""
echo ">>> Suite completa: OK (100% lab)"
