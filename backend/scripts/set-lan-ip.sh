#!/usr/bin/env bash
# Alinea la IP LAN del Mac/host en todos los puntos necesarios para pruebas en red local:
#   - frontend/.env (VITE_API_URL, VITE_WS_URL → HTTPS :8080)
#   - backend/.env (CORS_ORIGIN, SOCKETIO_CORS_ORIGIN)
#   - Master DB (tenants.custom_domain)
#   - Tenant DB (organization_settings.pbx_host, sip_server, sip_realm + channels VOICE ariBaseUrl)
#   - deploy/asterisk/conf/pjsip.conf (NAT + media_address)
#   - deploy/asterisk/conf/pjsip_agents.conf (vía sync-agent-endpoints.sh)
#
# Usage:
#   ./scripts/set-lan-ip.sh                    # auto-detect IP (en0, luego en1)
#   ./scripts/set-lan-ip.sh 192.168.86.76    # IP explícita
#   TENANT_KEY=demo ./scripts/set-lan-ip.sh
#   ./scripts/set-lan-ip.sh --dry-run
#   ./scripts/set-lan-ip.sh --skip-asterisk
#
# Requisitos: backend/.env con MASTER_DATABASE_URL y DATABASE_URL; psql; jq+curl si sync endpoints.
# Tras ejecutar: reinicia backend y frontend (npm run dev).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
BACKEND_ENV="$ROOT_DIR/backend/.env"
PJSIP_CONF="$ROOT_DIR/deploy/asterisk/conf/pjsip.conf"
SYNC_SCRIPT="$ROOT_DIR/deploy/asterisk/scripts/sync-agent-endpoints.sh"

TENANT_KEY="${TENANT_KEY:-local}"
DRY_RUN=false
SKIP_ASTERISK=false
LAN_IP=""

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --skip-asterisk) SKIP_ASTERISK=true; shift ;;
    -*)
      echo "ERROR: opción desconocida: $1" >&2
      usage 1
      ;;
    *)
      if [[ -z "$LAN_IP" ]]; then
        LAN_IP="$1"
      else
        echo "ERROR: demasiados argumentos" >&2
        usage 1
      fi
      shift
      ;;
  esac
done

is_valid_ipv4() {
  local ip="$1"
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local o1 o2 o3 o4
  IFS='.' read -r o1 o2 o3 o4 <<<"$ip"
  for o in "$o1" "$o2" "$o3" "$o4"; do
    [[ "$o" -le 255 ]] || return 1
  done
  return 0
}

detect_lan_ip() {
  local ip=""
  for iface in en0 en1; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

lan_net_from_ip() {
  local ip="$1"
  local a b c _d
  IFS='.' read -r a b c _d <<<"$ip"
  echo "${a}.${b}.${c}.0/24"
}

set_env_var() {
  local key="$1" val="$2" file="$3"
  if [[ ! -f "$file" ]]; then
    echo "WARN: no existe $file — omitido" >&2
    return 0
  fi
  if $DRY_RUN; then
    echo "[dry-run] $file → ${key}=${val}"
    return 0
  fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$val" >>"$file"
  fi
  echo "OK $file → ${key}=${val}"
}

replace_pjsip_line() {
  local pattern="$1" replacement="$2" file="$3"
  if $DRY_RUN; then
    echo "[dry-run] $file → $replacement"
    return 0
  fi
  sed -i '' "s|^${pattern}=.*|${replacement}|" "$file"
}

load_backend_env() {
  if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "ERROR: falta $BACKEND_ENV" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a
  source "$BACKEND_ENV"
  set +a
  if [[ -z "${MASTER_DATABASE_URL:-}" || -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: MASTER_DATABASE_URL y DATABASE_URL deben estar en backend/.env" >&2
    exit 1
  fi
}

run_psql() {
  local url="$1" sql="$2"
  if $DRY_RUN; then
    echo "[dry-run] psql ($url) ← $sql"
    return 0
  fi
  psql "$url" -v ON_ERROR_STOP=1 -c "$sql"
}

if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(detect_lan_ip)" || {
    echo "ERROR: no se pudo detectar IP LAN. Pásala como argumento: ./scripts/set-lan-ip.sh 192.168.x.x" >&2
    exit 1
  }
  echo "IP LAN detectada: $LAN_IP"
fi

if ! is_valid_ipv4 "$LAN_IP"; then
  echo "ERROR: IP inválida: $LAN_IP" >&2
  exit 1
fi

LAN_NET="$(lan_net_from_ip "$LAN_IP")"
FRONTEND_ORIGIN="https://${LAN_IP}:8080"
SIP_WSS="wss://${LAN_IP}:8089/ws"
ARI_BASE="http://${LAN_IP}:8074"

echo ""
echo "=== CortexCC — set-lan-ip ==="
echo "IP:          $LAN_IP"
echo "LAN net:     $LAN_NET"
echo "Tenant:      $TENANT_KEY"
echo "Frontend:    $FRONTEND_ORIGIN"
echo "Softphone:   $SIP_WSS"
echo ""

# 1. frontend/.env
set_env_var "VITE_API_URL" "${FRONTEND_ORIGIN}/api" "$FRONTEND_ENV"
set_env_var "VITE_WS_URL" "$FRONTEND_ORIGIN" "$FRONTEND_ENV"

# 2. backend/.env
set_env_var "CORS_ORIGIN" "$FRONTEND_ORIGIN" "$BACKEND_ENV"
set_env_var "SOCKETIO_CORS_ORIGIN" "$FRONTEND_ORIGIN" "$BACKEND_ENV"

# 3. pjsip.conf
if [[ -f "$PJSIP_CONF" ]]; then
  replace_pjsip_line "external_signaling_address" "external_signaling_address=${LAN_IP}" "$PJSIP_CONF"
  replace_pjsip_line "external_media_address" "external_media_address=${LAN_IP}" "$PJSIP_CONF"
  replace_pjsip_line "local_net" "local_net=${LAN_NET}" "$PJSIP_CONF"
  if ! $DRY_RUN; then
    sed -i '' "s|^media_address=.*|media_address=${LAN_IP}|g" "$PJSIP_CONF"
    echo "OK $PJSIP_CONF → external_*, local_net, media_address"
  else
    echo "[dry-run] $PJSIP_CONF → media_address=${LAN_IP} (todas las ocurrencias)"
  fi
else
  echo "WARN: no existe $PJSIP_CONF" >&2
fi

# 4–5. PostgreSQL
if command -v psql >/dev/null 2>&1; then
  load_backend_env
  run_psql "$MASTER_DATABASE_URL" \
    "UPDATE tenants SET custom_domain = '${LAN_IP}' WHERE tenant_key = '${TENANT_KEY}';"
  if ! $DRY_RUN; then
    echo "OK Master → tenants.custom_domain = ${LAN_IP} (tenant_key=${TENANT_KEY})"
  fi
  run_psql "$DATABASE_URL" \
    "UPDATE organization_settings SET
      pbx_host = '${LAN_IP}',
      pbx_wss_port = 8089,
      pbx_ari_port = 8074,
      sip_server = '${SIP_WSS}',
      sip_realm = '${LAN_IP}'
    WHERE id = 'default';"
  if ! $DRY_RUN; then
    echo "OK Tenant → organization_settings pbx_host / sip_server / sip_realm"
  fi
  run_psql "$DATABASE_URL" \
    "UPDATE channels SET config = jsonb_set(config::jsonb, '{ariBaseUrl}', '\"${ARI_BASE}\"'::jsonb)
     WHERE type = 'VOICE';"
  if ! $DRY_RUN; then
    echo "OK Tenant → channels VOICE ariBaseUrl = ${ARI_BASE}"
  fi
else
  echo "WARN: psql no encontrado — omitidas actualizaciones de BD" >&2
fi

# 6. Regenerar pjsip_agents.conf + reload PJSIP
if ! $SKIP_ASTERISK && [[ -x "$SYNC_SCRIPT" ]]; then
  if $DRY_RUN; then
    echo "[dry-run] BACKEND_URL=http://127.0.0.1:3030 TENANT_KEY=${TENANT_KEY} $SYNC_SCRIPT"
  else
    if BACKEND_URL="http://127.0.0.1:3030" TENANT_KEY="$TENANT_KEY" "$SYNC_SCRIPT"; then
      echo "OK sync-agent-endpoints + reload PJSIP"
    else
      echo "WARN: sync-agent-endpoints falló (¿backend en :3030?). Ejecuta manualmente cuando el API esté arriba." >&2
    fi
  fi
elif $SKIP_ASTERISK; then
  echo "SKIP asterisk (--skip-asterisk)"
else
  echo "WARN: no se encontró $SYNC_SCRIPT ejecutable" >&2
fi

echo ""
echo "=== Listo ==="
echo "Accede desde otras PCs: ${FRONTEND_ORIGIN}"
echo "Acepta el certificado en: https://${LAN_IP}:8089 (WSS Asterisk)"
echo ""
if ! $DRY_RUN; then
  echo "Reinicia servicios en esta máquina:"
  echo "  cd backend && npm run dev"
  echo "  cd frontend && npm run dev"
  echo ""
  echo "Los agentes deben cerrar sesión y volver a entrar para recargar config del softphone."
fi
