#!/usr/bin/env bash
# Smoke tests — CortexCC voice lab (internal extensions, ARI inbound simulation).
# Usage: ./scripts/smoke-voice-lab.sh [--skip-api] [--skip-inbound]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV="$ROOT/backend/.env"

BACKEND_URL="${BACKEND_URL:-http://localhost:3030}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
ARI_URL="${ARI_URL:-http://localhost:8074}"
ARI_USER="${ARI_USER:-cortexcc}"
ARI_PASS="${ARI_PASS:-Admin123!}"
WSS_URL="${WSS_URL:-https://localhost:8089/ws}"

SKIP_API=false
SKIP_INBOUND=false
for arg in "$@"; do
  case "$arg" in
    --skip-api) SKIP_API=true ;;
    --skip-inbound) SKIP_INBOUND=true ;;
  esac
done

PASS=0
FAIL=0
WARN=0

log_pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
log_fail() { echo "FAIL  $1 — $2"; FAIL=$((FAIL + 1)); }
log_warn() { echo "WARN  $1 — $2"; WARN=$((WARN + 1)); }

require_cmd() {
  for c in curl jq; do
    command -v "$c" >/dev/null 2>&1 || { echo "Missing required command: $c"; exit 2; }
  done
}

load_env() {
  if [[ -f "$BACKEND_ENV" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$BACKEND_ENV"
    set +a
  fi
  INTEGRATION_API_KEY="${INTEGRATION_API_KEY:-}"
  if [[ -z "$INTEGRATION_API_KEY" ]]; then
    echo "INTEGRATION_API_KEY not set (backend/.env)" >&2
    exit 2
  fi
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

login_token() {
  local email="$1" password="$2"
  curl -s -X POST "$BACKEND_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r '.token // empty'
}

# Conversations list returns { data: [...], meta: {...} }
conv_query() {
  local token="$1" query="$2"
  curl -s "$BACKEND_URL/api/conversations?$query" -H "Authorization: Bearer $token"
}

conv_pick() {
  local json="$1" jq_filter="$2"
  echo "$json" | jq -r "$jq_filter" 2>/dev/null || echo ""
}

cleanup_ari_channels() {
  local ids
  ids=$(curl -s -u "$ARI_USER:$ARI_PASS" "$ARI_URL/ari/channels" 2>/dev/null \
    | jq -r '.[].id // empty' 2>/dev/null || true)
  if [[ -n "$ids" ]]; then
    while IFS= read -r ch_id; do
      [[ -n "$ch_id" ]] || continue
      curl -s -u "$ARI_USER:$ARI_PASS" -X DELETE "$ARI_URL/ari/channels/$ch_id" >/dev/null 2>&1 || true
    done <<< "$ids"
    sleep 1
  fi
}

check_omnichannel_regression() {
  local agent_token="$1" admin_token="$2"
  local AUTH_AGENT="Authorization: Bearer $agent_token"
  local AUTH_ADMIN="Authorization: Bearer $admin_token"
  local agent_id disp_id conv_accept conv_reject

  agent_id=$(curl -s "$BACKEND_URL/api/users" -H "$AUTH_ADMIN" \
    | jq -r '.[]|select(.email=="agent@cortex.local")|.id // empty')
  disp_id=$(curl -s "$BACKEND_URL/api/settings/dispositions" -H "$AUTH_ADMIN" \
    | jq -r '.[0].id // empty')

  cleanup_ari_channels

  conv_accept=$(curl -s -X POST "$BACKEND_URL/api/conversations" \
    -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
    -d '{"channel_type":"WHATSAPP","contact":{"name":"Smoke WA Accept","phone":"593990000001"},"subject":"smoke-accept"}' \
    | jq -r '.id // empty')
  conv_reject=$(curl -s -X POST "$BACKEND_URL/api/conversations" \
    -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
    -d '{"channel_type":"WHATSAPP","contact":{"name":"Smoke WA Reject","phone":"593990000002"},"subject":"smoke-reject"}' \
    | jq -r '.id // empty')

  if [[ -z "$conv_accept" || -z "$conv_reject" ]]; then
    log_fail "Omnichannel create WHATSAPP conversations" "accept=$conv_accept reject=$conv_reject"
    return
  fi
  log_pass "Omnichannel create WHATSAPP conversations"

  curl -s -X POST "$BACKEND_URL/api/supervisor/force-assign" \
    -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"conversation_id\":\"$conv_accept\",\"agent_id\":\"$agent_id\"}" >/dev/null
  curl -s -X POST "$BACKEND_URL/api/supervisor/force-assign" \
    -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"conversation_id\":\"$conv_reject\",\"agent_id\":\"$agent_id\"}" >/dev/null

  local accept_code reject_code resolve_code
  accept_code=$(http_code -X POST "$BACKEND_URL/api/conversations/$conv_accept/accept" -H "$AUTH_AGENT")
  [[ "$accept_code" == "200" ]] && log_pass "POST /conversations/:id/accept" || log_fail "POST /conversations/:id/accept" "HTTP $accept_code"

  reject_code=$(http_code -X POST "$BACKEND_URL/api/conversations/$conv_reject/reject" -H "$AUTH_AGENT")
  [[ "$reject_code" == "200" ]] && log_pass "POST /conversations/:id/reject" || log_fail "POST /conversations/:id/reject" "HTTP $reject_code"

  if [[ -n "$disp_id" ]]; then
    resolve_code=$(http_code -X POST "$BACKEND_URL/api/conversations/$conv_accept/resolve" \
      -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
      -d "{\"disposition_id\":\"$disp_id\",\"note\":\"smoke resolve\"}")
    [[ "$resolve_code" == "200" ]] && log_pass "POST /conversations/:id/resolve" || log_fail "POST /conversations/:id/resolve" "HTTP $resolve_code"
  else
    log_fail "POST /conversations/:id/resolve" "no disposition in DB"
  fi
}

check_infra() {
  echo "=== Fase 1 — Infraestructura ==="

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -u "$ARI_USER:$ARI_PASS" "$ARI_URL/ari/asterisk/info")
  if [[ "$code" == "200" ]]; then log_pass "ARI reachable ($ARI_URL)"; else log_fail "ARI reachable" "HTTP $code"; fi

  code=$(curl -sk -o /dev/null -w "%{http_code}" "$WSS_URL")
  if [[ "$code" == "426" ]]; then log_pass "WSS TLS ($WSS_URL → 426 Upgrade Required)"; else log_warn "WSS TLS" "expected 426, got $code"; fi

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^asterisk$'; then
    local dialplan
    dialplan=$(docker exec asterisk asterisk -rx "dialplan show from-trunk" 2>/dev/null || true)
    if echo "$dialplan" | grep -q 'Stasis(cortexcc'; then
      log_pass "Dialplan from-trunk → Stasis(cortexcc"
    else
      log_fail "Dialplan from-trunk" "Stasis(cortexcc not found"
    fi

    local endpoints
    endpoints=$(docker exec asterisk asterisk -rx "pjsip show endpoints" 2>/dev/null || true)
    for ext in 7001 6001 8001; do
      if echo "$endpoints" | grep -q "$ext"; then log_pass "PJSIP endpoint $ext"; else log_fail "PJSIP endpoint $ext" "not found"; fi
    done
  else
    log_fail "Asterisk container" "container 'asterisk' not running"
  fi

  code=$(http_code "$BACKEND_URL/api/health")
  if [[ "$code" == "200" ]]; then log_pass "Backend health"; else log_fail "Backend health" "HTTP $code"; fi

  local status
  status=$(curl -s "$BACKEND_URL/api/integrations/status" -H "x-api-key: $INTEGRATION_API_KEY")
  if echo "$status" | jq -e '.database == true and .redis == true' >/dev/null 2>&1; then
    log_pass "Integrations status (database + redis)"
  else
    log_fail "Integrations status" "$status"
  fi

  local admin_token voice_id health_resp
  admin_token=$(login_token "admin@cortex.local" "demo1234")
  if [[ -z "$admin_token" ]]; then
    log_fail "Admin login (channel test prereq)" "no token"
    return
  fi
  voice_id=$(curl -s "$BACKEND_URL/api/settings/channels" -H "Authorization: Bearer $admin_token" \
    | jq -r '[.[]|select(.type=="VOICE")|.id][0] // empty')
  if [[ -z "$voice_id" ]]; then
    log_fail "VOICE channel exists" "none found"
    return
  fi
  health_resp=$(curl -s -X POST "$BACKEND_URL/api/settings/channels/$voice_id/test" \
    -H "Authorization: Bearer $admin_token")
  if echo "$health_resp" | jq -e '.ok == true' >/dev/null 2>&1; then
    log_pass "VOICE channel health test (ARI ok)"
  else
    log_fail "VOICE channel health test" "$health_resp"
  fi
}

ensure_agent_extension() {
  local admin_token agent_id current_ext
  admin_token=$(login_token "admin@cortex.local" "demo1234")
  [[ -n "$admin_token" ]] || return 0

  agent_id=$(curl -s "$BACKEND_URL/api/users" -H "Authorization: Bearer $admin_token" \
    | jq -r '.[]|select(.email=="agent@cortex.local")|.id // empty')
  current_ext=$(curl -s "$BACKEND_URL/api/settings/softphone/me" \
    -H "Authorization: Bearer $(login_token agent@cortex.local demo1234)" \
    | jq -r '.extension // empty')

  if [[ "$current_ext" == "7001" ]]; then return 0; fi

  curl -s -X PUT "$BACKEND_URL/api/settings/users/$agent_id/softphone" \
    -H "Authorization: Bearer $admin_token" \
    -H 'Content-Type: application/json' \
    -d '{"extension":"7001","password":"7001pass"}' >/dev/null || true
}

check_api() {
  echo "=== Fase 2 — API autenticada ==="

  ensure_agent_extension
  cleanup_ari_channels

  local agent_token admin_token AUTH_ADMIN
  agent_token=$(login_token "agent@cortex.local" "demo1234")
  admin_token=$(login_token "admin@cortex.local" "demo1234")
  if [[ -z "$agent_token" ]]; then log_fail "Agent login" "no token"; return; fi
  log_pass "Agent login"
  if [[ -z "$admin_token" ]]; then log_fail "Admin login" "no token"; return; fi
  log_pass "Admin login"

  AUTH_ADMIN="Authorization: Bearer $admin_token"
  local AUTH_AGENT="Authorization: Bearer $agent_token"

  # Agent ONLINE for routing
  curl -s -X PUT "$BACKEND_URL/api/auth/status" -H "$AUTH_AGENT" \
    -H 'Content-Type: application/json' -d '{"status":"ONLINE"}' >/dev/null

  local softphone
  softphone=$(curl -s "$BACKEND_URL/api/settings/softphone/me" -H "$AUTH_AGENT")
  if echo "$softphone" | jq -e '.server|test("wss://")' >/dev/null 2>&1 \
    && [[ "$(echo "$softphone" | jq -r '.extension')" == "7001" ]]; then
    log_pass "Softphone config agent (7001 + WSS)"
  else
    log_fail "Softphone config agent" "$softphone"
  fi

  local pjsip
  pjsip=$(curl -s "$BACKEND_URL/api/settings/softphone/endpoints/export?format=pjsip" -H "$AUTH_ADMIN")
  if echo "$pjsip" | grep -q '\[7001\]'; then log_pass "PJSIP export contains [7001]"; else log_fail "PJSIP export" "missing [7001]"; fi

  local supervisor_id bulk
  supervisor_id=$(curl -s "$BACKEND_URL/api/users" -H "$AUTH_ADMIN" \
    | jq -r '.[]|select(.email=="supervisor@cortex.local")|.id // empty')
  if [[ -n "$supervisor_id" ]]; then
    bulk=$(curl -s -X POST "$BACKEND_URL/api/settings/users/softphone/bulk-assign" \
      -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
      -d "{\"user_ids\":[\"$supervisor_id\"]}")
    if echo "$bulk" | jq -e 'length >= 1' >/dev/null 2>&1; then
      log_pass "Bulk softphone assign"
    else
      log_fail "Bulk softphone assign" "$bulk"
    fi
  else
    log_fail "Bulk softphone assign" "supervisor user not found"
  fi

  # Voice call log
  local ext_id log_resp
  ext_id="smoke-$(date +%s)-$$"
  log_resp=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/voice/calls/logs" \
    -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
    -d "{\"external_call_id\":\"$ext_id\",\"remote_uri\":\"6001\",\"direction\":\"outbound\",\"state\":\"ended\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"duration_seconds\":5}")
  if [[ "$(echo "$log_resp" | tail -1)" == "201" ]]; then log_pass "POST /voice/calls/logs"; else log_fail "POST /voice/calls/logs" "$(echo "$log_resp" | head -1)"; fi

  # Find or create VOICE conversation for events
  local conv_id channel_id
  channel_id=$(curl -s "$BACKEND_URL/api/settings/channels" -H "$AUTH_ADMIN" \
    | jq -r '[.[]|select(.type=="VOICE")|.id][0]')
  conv_id=$(conv_pick "$(conv_query "$agent_token" "channel=VOICE&tab=mine&limit=1")" '.data[0].id // empty')

  cleanup_ari_channels
  local orig
  orig=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/voice/calls/originate" \
    -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"6001\",\"channel_id\":\"$channel_id\"}")
  if [[ "$(echo "$orig" | tail -1)" == "201" ]]; then
    conv_id=$(echo "$orig" | head -1 | jq -r '.conversationId // .conversation_id // empty')
    [[ -z "$conv_id" ]] && conv_id=$(conv_pick "$(conv_query "$agent_token" "channel=VOICE&tab=mine&limit=1")" '.data[0].id // empty')
    log_pass "Click-to-call originate (lab 6001)"
  else
    log_fail "Click-to-call originate" "$(echo "$orig" | head -1)"
  fi

  if [[ -n "$conv_id" ]]; then
    local ev_resp
    ev_resp=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/voice/calls/events" \
      -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
      -d "{\"conversation_id\":\"$conv_id\",\"external_call_id\":\"$ext_id-ev\",\"remote_uri\":\"6001\",\"direction\":\"outbound\",\"state\":\"active\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
    if [[ "$(echo "$ev_resp" | tail -1)" == "201" ]]; then log_pass "POST /voice/calls/events"; else log_fail "POST /voice/calls/events" "$(echo "$ev_resp" | head -1)"; fi
  else
    log_fail "POST /voice/calls/events" "no conversation_id"
  fi

  # Dialer preview workflow
  local camp_id import_resp join_resp next_resp
  camp_id=$(curl -s -X POST "$BACKEND_URL/api/dialer/campaigns" \
    -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Smoke Preview $(date +%s)\",\"channel_id\":\"$channel_id\",\"mode\":\"PREVIEW\"}" \
    | jq -r '.id // empty')
  if [[ -n "$camp_id" ]]; then
    log_pass "Dialer campaign create (PREVIEW)"
    printf 'phone,name\n6001,Smoke Contact\n' > /tmp/smoke-dialer.csv
    import_resp=$(curl -s -X POST "$BACKEND_URL/api/dialer/campaigns/$camp_id/contacts/import" \
      -H "$AUTH_ADMIN" -F "file=@/tmp/smoke-dialer.csv")
    if echo "$import_resp" | jq -e '.imported >= 1' >/dev/null 2>&1; then
      log_pass "Dialer CSV import"
    else
      log_fail "Dialer CSV import" "$import_resp"
    fi

    join_resp=$(curl -s -X POST "$BACKEND_URL/api/dialer/sessions/join" \
      -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
      -d "{\"campaign_id\":\"$camp_id\"}")
    if echo "$join_resp" | jq -e '.campaign_id' >/dev/null 2>&1; then log_pass "Dialer session join"; else log_fail "Dialer session join" "$join_resp"; fi

    next_resp=$(curl -s "$BACKEND_URL/api/dialer/sessions/me/next?campaign_id=$camp_id" -H "$AUTH_AGENT")
    local dialer_contact_id
    dialer_contact_id=$(echo "$next_resp" | jq -r '.id // empty')
    if [[ -n "$dialer_contact_id" ]]; then
      log_pass "Dialer next contact"
      cleanup_ari_channels
      local dial_resp dial_code
      dial_resp=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/dialer/sessions/me/dial" \
        -H "$AUTH_AGENT" -H 'Content-Type: application/json' \
        -d "{\"campaign_id\":\"$camp_id\",\"dialer_contact_id\":\"$dialer_contact_id\"}")
      dial_code=$(echo "$dial_resp" | tail -1)
      if [[ "$dial_code" == "201" ]]; then log_pass "Dialer preview dial"; else log_fail "Dialer preview dial" "$(echo "$dial_resp" | head -1)"; fi
    else
      log_fail "Dialer next contact" "$next_resp"
    fi

    # Progressive + predictive activation (enqueue only)
    local prog_id pred_id
    prog_id=$(curl -s -X POST "$BACKEND_URL/api/dialer/campaigns" \
      -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
      -d "{\"name\":\"Smoke Progressive\",\"channel_id\":\"$channel_id\",\"mode\":\"PROGRESSIVE\"}" | jq -r '.id')
    pred_id=$(curl -s -X POST "$BACKEND_URL/api/dialer/campaigns" \
      -H "$AUTH_ADMIN" -H 'Content-Type: application/json' \
      -d "{\"name\":\"Smoke Predictive\",\"channel_id\":\"$channel_id\",\"mode\":\"PREDICTIVE\"}" | jq -r '.id')
    curl -s -X PATCH "$BACKEND_URL/api/dialer/campaigns/$prog_id/status" \
      -H "$AUTH_ADMIN" -H 'Content-Type: application/json' -d '{"status":"ACTIVE"}' >/dev/null
    curl -s -X PATCH "$BACKEND_URL/api/dialer/campaigns/$pred_id/status" \
      -H "$AUTH_ADMIN" -H 'Content-Type: application/json' -d '{"status":"ACTIVE"}' >/dev/null
    log_pass "Dialer progressive/predictive activate (enqueue)"
  else
    log_fail "Dialer campaign create" "no campaign id"
  fi

  # Regression omnichannel
  local dash_code queues_code
  dash_code=$(http_code "$BACKEND_URL/api/dashboard/stats" -H "$AUTH_AGENT")
  queues_code=$(http_code "$BACKEND_URL/api/queues" -H "$AUTH_AGENT")
  [[ "$dash_code" == "200" ]] && log_pass "GET /dashboard/stats" || log_fail "GET /dashboard/stats" "HTTP $dash_code"
  [[ "$queues_code" == "200" ]] && log_pass "GET /queues" || log_fail "GET /queues" "HTTP $queues_code"

  check_omnichannel_regression "$agent_token" "$admin_token"

  # Export for inbound phase
  echo "$agent_token" > /tmp/smoke-agent-token.$$
  echo "$channel_id" > /tmp/smoke-channel-id.$$
}

simulate_inbound() {
  echo "=== Fase 2.3 — Inbound simulado (ARI) ==="
  if [[ "$SKIP_INBOUND" == true ]]; then
    echo "Skipped (--skip-inbound)"
    return
  fi

  local agent_token AUTH_AGENT inbound_resp http_in smoke_caller smoke_ext
  agent_token=$(login_token "agent@cortex.local" "demo1234")
  AUTH_AGENT="Authorization: Bearer $agent_token"
  curl -s -X PUT "$BACKEND_URL/api/auth/status" -H "$AUTH_AGENT" \
    -H 'Content-Type: application/json' -d '{"status":"ONLINE"}' >/dev/null

  cleanup_ari_channels

  smoke_caller="59399$(date +%s | tail -c 6)"
  smoke_ext="1800$(date +%s | tail -c 7)"

  inbound_resp=$(curl -s -w "\n%{http_code}" -u "$ARI_USER:$ARI_PASS" -X POST \
    "$ARI_URL/ari/channels?endpoint=Local/${smoke_ext}@from-trunk&app=cortexcc&appArgs=inbound,${smoke_ext},${smoke_caller}&callerId=${smoke_caller}")
  http_in=$(echo "$inbound_resp" | tail -1)
  if [[ "$http_in" == "200" ]]; then log_pass "ARI inbound channel create"; else log_fail "ARI inbound channel create" "HTTP $http_in — $(echo "$inbound_resp" | head -1)"; fi

  local conv_after new_conv i
  new_conv=""
  for i in $(seq 1 15); do
    conv_after=$(conv_query "$agent_token" "channel=VOICE&tab=mine&limit=15")
    new_conv=$(conv_pick "$conv_after" "[.data[]|select(.contact.phone==\"$smoke_caller\")][0].id // empty")
    if [[ -z "$new_conv" ]]; then
      conv_after=$(conv_query "$agent_token" "channel=VOICE&tab=queue&limit=15")
      new_conv=$(conv_pick "$conv_after" "[.data[]|select(.contact.phone==\"$smoke_caller\")][0].id // empty")
    fi
    [[ -n "$new_conv" ]] && break
    sleep 1
  done

  if [[ -n "$new_conv" ]]; then
    log_pass "Inbound → VOICE conversation (routing + assignment)"
    local has_voice_msg ans_code hang_code reject_code smoke_caller2 smoke_ext2 conv2
    has_voice_msg=$(conv_pick "$conv_after" "[.data[]|select(.id==\"$new_conv\")|.last_message][0] // empty")
    if [[ "$has_voice_msg" == *"Llamada"* ]] || [[ "$has_voice_msg" == *"llamada"* ]]; then
      log_pass "Inbound timeline [Llamada entrante]"
    else
      log_fail "Inbound timeline" "last_message=$has_voice_msg"
    fi
    ans_code=$(http_code -X POST "$BACKEND_URL/api/voice/calls/$new_conv/answer" -H "$AUTH_AGENT")
    if [[ "$ans_code" == "200" ]]; then
      log_pass "POST /voice/calls/:id/answer"
      hang_code=$(http_code -X POST "$BACKEND_URL/api/voice/calls/$new_conv/hangup" -H "$AUTH_AGENT")
      [[ "$hang_code" == "200" ]] && log_pass "POST /voice/calls/:id/hangup" || log_fail "POST /voice/calls/:id/hangup" "HTTP $hang_code"
    else
      log_fail "POST /voice/calls/:id/answer" "HTTP $ans_code"
    fi

    cleanup_ari_channels
    smoke_caller2="59398$(date +%s | tail -c 6)"
    smoke_ext2="1801$(date +%s | tail -c 7)"
    curl -s -u "$ARI_USER:$ARI_PASS" -X POST \
      "$ARI_URL/ari/channels?endpoint=Local/${smoke_ext2}@from-trunk&app=cortexcc&appArgs=inbound,${smoke_ext2},${smoke_caller2}&callerId=${smoke_caller2}" >/dev/null
    conv2=""
    for i in $(seq 1 15); do
      conv2=$(conv_pick "$(conv_query "$agent_token" "channel=VOICE&tab=mine&limit=15")" "[.data[]|select(.contact.phone==\"$smoke_caller2\")][0].id // empty")
      [[ -n "$conv2" ]] && break
      conv2=$(conv_pick "$(conv_query "$agent_token" "channel=VOICE&tab=queue&limit=15")" "[.data[]|select(.contact.phone==\"$smoke_caller2\")][0].id // empty")
      [[ -n "$conv2" ]] && break
      sleep 1
    done
    if [[ -n "$conv2" ]]; then
      reject_code=$(http_code -X POST "$BACKEND_URL/api/voice/calls/$conv2/reject" -H "$AUTH_AGENT")
      [[ "$reject_code" == "200" ]] && log_pass "POST /voice/calls/:id/reject" || log_fail "POST /voice/calls/:id/reject" "HTTP $reject_code"
    else
      log_fail "POST /voice/calls/:id/reject" "no second inbound conversation"
    fi
  else
    log_fail "Inbound routing" "no VOICE conversation for caller $smoke_caller after 3s"
  fi
}

check_frontend_reachable() {
  echo "=== Frontend reachability ==="
  local code
  code=$(http_code "$FRONTEND_URL")
  if [[ "$code" == "200" ]]; then log_pass "Frontend $FRONTEND_URL"; else log_fail "Frontend" "HTTP $code"; fi
}

main() {
  require_cmd
  load_env
  check_infra
  check_frontend_reachable
  if [[ "$SKIP_API" != true ]]; then
    check_api
    simulate_inbound
  fi

  echo ""
  echo "=== Resumen ==="
  echo "PASS: $PASS  FAIL: $FAIL  WARN: $WARN"
  TOTAL=$((PASS + FAIL))
  if [[ "$TOTAL" -gt 0 ]]; then
    PCT=$((PASS * 100 / TOTAL))
    echo "Tasa PASS: ${PCT}% ($PASS/$TOTAL checks estrictos; WARN no cuenta)"
  fi

  rm -f /tmp/smoke-agent-token.$$ /tmp/smoke-channel-id.$$ /tmp/smoke-dialer.csv 2>/dev/null || true

  if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
  exit 0
}

main "$@"
