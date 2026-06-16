#!/usr/bin/env bash
#
# Provisiona Asterisk (PBX) en Azure: RG dedicado + VM + Docker + integración CortexCC
#
# Requisitos: az CLI, docker (solo empaquetado local), ssh, scp, tar, openssl, curl, jq
# Config: deploy/azure/.env (ver .env.example — sección Asterisk)
#
# Uso:
#   ./deploy/azure/deploy-azure-asterisk-vm.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
CONFIG_FILE="$SCRIPT_DIR/.azure-config"
ASTERISK_SRC_DIR="$ROOT_DIR/deploy/asterisk"
SSH_DIR="$SCRIPT_DIR/.ssh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${PURPLE}[STEP]${NC} $1"; }

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_err "Comando requerido no encontrado: $cmd"
    exit 1
  fi
}

resource_exists() {
  local resource_type="$1"
  local resource_name="$2"
  local resource_group="$3"

  case "$resource_type" in
    resourcegroup)
      az group show --name "$resource_name" >/dev/null 2>&1
      ;;
    vm)
      az vm show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    nsg)
      az network nsg show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    publicip)
      az network public-ip show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_err "No existe $ENV_FILE"
    log_info "Copia deploy/azure/.env.example a deploy/azure/.env"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  local required=(
    LOCATION
    RESOURCE_GROUP
    BACKEND_WEBAPP_NAME
    FRONTEND_WEBAPP_NAME
    API_PREFIX
    ASTERISK_RESOURCE_GROUP
    ASTERISK_VM_NAME
    ASTERISK_PUBLIC_IP_NAME
    ASTERISK_NSG_NAME
    ASTERISK_NIC_NAME
    ASTERISK_VNET_NAME
    ASTERISK_SUBNET_NAME
  )

  local v
  for v in "${required[@]}"; do
    if [[ -z "${!v:-}" ]]; then
      log_err "Falta variable requerida en .env: $v"
      exit 1
    fi
  done

  API_PREFIX="${API_PREFIX:-/api}"
  BACKEND_URL="https://${BACKEND_WEBAPP_NAME}.azurewebsites.net"
  FRONTEND_URL="https://${FRONTEND_WEBAPP_NAME}.azurewebsites.net"

  ASTERISK_VM_SIZE="${ASTERISK_VM_SIZE:-Standard_B2s}"
  ASTERISK_ADMIN_USER="${ASTERISK_ADMIN_USER:-azureuser}"
  ASTERISK_SIP_PORT="${ASTERISK_SIP_PORT:-5060}"
  ASTERISK_RTP_START="${ASTERISK_RTP_START:-10000}"
  ASTERISK_RTP_END="${ASTERISK_RTP_END:-10100}"
  ASTERISK_ARI_PUBLIC_PORT="${ASTERISK_ARI_PUBLIC_PORT:-8074}"
  ASTERISK_WSS_PORT="${ASTERISK_WSS_PORT:-8089}"
  ASTERISK_TZ="${ASTERISK_TZ:-America/Guayaquil}"
  ASTERISK_ARI_APP="${ASTERISK_ARI_APP:-cortexcc}"
  ASTERISK_ARI_USERNAME="${ASTERISK_ARI_USERNAME:-cortexcc}"
  ASTERISK_ARI_PASSWORD="${ASTERISK_ARI_PASSWORD:-Admin123!}"
  ASTERISK_FQDN="${ASTERISK_FQDN:-}"
  MANAGE_ASTERISK_VM="${MANAGE_ASTERISK_VM:-true}"
  INTEGRATE_CORTEXCC="${INTEGRATE_CORTEXCC:-true}"
  ASTERISK_RESTRICT_ARI_TO_BACKEND="${ASTERISK_RESTRICT_ARI_TO_BACKEND:-true}"
  CREATE_VOICE_CHANNEL="${CREATE_VOICE_CHANNEL:-true}"
  VOICE_CHANNEL_NAME="${VOICE_CHANNEL_NAME:-Telefonía PBX}"
  CORTEXCC_DEPLOY_JWT="${CORTEXCC_DEPLOY_JWT:-}"

  SSH_KEY_PATH="${ASTERISK_SSH_KEY_PATH:-$SSH_DIR/${ASTERISK_VM_NAME}_rsa}"
  SSH_PUB_KEY_PATH="${SSH_KEY_PATH}.pub"
}

check_dependencies() {
  log_step "Verificando dependencias"
  require_command az
  require_command ssh
  require_command scp
  require_command tar
  require_command openssl
  require_command curl
  require_command jq
  require_command sed
  if [[ ! -d "$ASTERISK_SRC_DIR" ]]; then
    log_err "No existe $ASTERISK_SRC_DIR"
    exit 1
  fi
  log_ok "Dependencias OK"
}

ensure_azure_session() {
  log_step "Verificando sesión Azure"
  if ! az account show >/dev/null 2>&1; then
    log_err "No hay sesión activa. Ejecuta: az login"
    exit 1
  fi
  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    if [[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
      az account set --subscription "$AZURE_SUBSCRIPTION_ID" >/dev/null
    fi
    log_ok "Contexto Azure cargado desde .azure-config"
  fi
}

register_azure_providers() {
  log_step "Registrando providers de Azure"
  local providers=(Microsoft.Compute Microsoft.Network)
  local provider state
  for provider in "${providers[@]}"; do
    state="$(az provider show --namespace "$provider" --query registrationState -o tsv 2>/dev/null || echo NotRegistered)"
    if [[ "$state" == "Registered" ]]; then
      log_ok "$provider ya registrado"
      continue
    fi
    log_info "Registrando $provider..."
    az provider register --namespace "$provider" --wait >/dev/null
    log_ok "$provider registrado"
  done
}

ensure_ssh_key() {
  log_step "Asegurando clave SSH para la VM"
  mkdir -p "$SSH_DIR"
  chmod 700 "$SSH_DIR"
  if [[ ! -f "$SSH_KEY_PATH" ]]; then
    log_info "Generando clave SSH: $SSH_KEY_PATH"
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_PATH" -N "" -C "cortexcc-asterisk-deploy"
  fi
  chmod 600 "$SSH_KEY_PATH"
  chmod 644 "$SSH_PUB_KEY_PATH"
  log_ok "Clave SSH lista"
}

ensure_asterisk_resource_group() {
  if ! resource_exists resourcegroup "$ASTERISK_RESOURCE_GROUP"; then
    log_info "Creando Resource Group dedicado PBX: $ASTERISK_RESOURCE_GROUP"
    az group create --name "$ASTERISK_RESOURCE_GROUP" --location "$LOCATION" >/dev/null
  fi
  log_ok "Resource Group PBX: $ASTERISK_RESOURCE_GROUP"
}

ensure_network() {
  log_step "Asegurando red Azure para Asterisk"

  if ! az network vnet show --name "$ASTERISK_VNET_NAME" --resource-group "$ASTERISK_RESOURCE_GROUP" >/dev/null 2>&1; then
    log_info "Creando VNet: $ASTERISK_VNET_NAME"
    az network vnet create \
      --resource-group "$ASTERISK_RESOURCE_GROUP" \
      --name "$ASTERISK_VNET_NAME" \
      --address-prefix 10.50.0.0/16 \
      --subnet-name "$ASTERISK_SUBNET_NAME" \
      --subnet-prefix 10.50.1.0/24 >/dev/null
  fi
  log_ok "VNet: $ASTERISK_VNET_NAME"

  if ! resource_exists nsg "$ASTERISK_NSG_NAME" "$ASTERISK_RESOURCE_GROUP"; then
    log_info "Creando NSG: $ASTERISK_NSG_NAME"
    az network nsg create \
      --resource-group "$ASTERISK_RESOURCE_GROUP" \
      --name "$ASTERISK_NSG_NAME" \
      --location "$LOCATION" >/dev/null
  fi
  log_ok "NSG: $ASTERISK_NSG_NAME"

  ensure_nsg_rule "allow-ssh" 100 Tcp 22 "*"
  ensure_nsg_rule "allow-sip" 110 Udp "$ASTERISK_SIP_PORT" "*"
  ensure_nsg_rule "allow-wss" 120 Tcp "$ASTERISK_WSS_PORT" "*"
  ensure_nsg_rule "allow-rtp" 130 Udp "${ASTERISK_RTP_START}-${ASTERISK_RTP_END}" "*"

  if [[ "$ASTERISK_RESTRICT_ARI_TO_BACKEND" != "true" ]]; then
    ensure_nsg_rule "allow-ari" 140 Tcp "$ASTERISK_ARI_PUBLIC_PORT" "*"
  fi

  if ! resource_exists publicip "$ASTERISK_PUBLIC_IP_NAME" "$ASTERISK_RESOURCE_GROUP"; then
    log_info "Creando IP pública estática: $ASTERISK_PUBLIC_IP_NAME"
    az network public-ip create \
      --resource-group "$ASTERISK_RESOURCE_GROUP" \
      --name "$ASTERISK_PUBLIC_IP_NAME" \
      --location "$LOCATION" \
      --sku Standard \
      --allocation-method Static >/dev/null
  fi
  ASTERISK_PUBLIC_IP="$(az network public-ip show \
    --resource-group "$ASTERISK_RESOURCE_GROUP" \
    --name "$ASTERISK_PUBLIC_IP_NAME" \
    --query ipAddress -o tsv)"
  log_ok "IP pública PBX: $ASTERISK_PUBLIC_IP"

  if ! az network nic show --name "$ASTERISK_NIC_NAME" --resource-group "$ASTERISK_RESOURCE_GROUP" >/dev/null 2>&1; then
    log_info "Creando NIC: $ASTERISK_NIC_NAME"
    az network nic create \
      --resource-group "$ASTERISK_RESOURCE_GROUP" \
      --name "$ASTERISK_NIC_NAME" \
      --location "$LOCATION" \
      --vnet-name "$ASTERISK_VNET_NAME" \
      --subnet "$ASTERISK_SUBNET_NAME" \
      --network-security-group "$ASTERISK_NSG_NAME" \
      --public-ip-address "$ASTERISK_PUBLIC_IP_NAME" >/dev/null
  fi
  log_ok "NIC: $ASTERISK_NIC_NAME"
}

ensure_nsg_rule() {
  local rule_name="$1"
  local priority="$2"
  local protocol="$3"
  local port_range="$4"
  local source_prefix="$5"

  if az network nsg rule show \
    --resource-group "$ASTERISK_RESOURCE_GROUP" \
    --nsg-name "$ASTERISK_NSG_NAME" \
    --name "$rule_name" >/dev/null 2>&1; then
    return 0
  fi

  az network nsg rule create \
    --resource-group "$ASTERISK_RESOURCE_GROUP" \
    --nsg-name "$ASTERISK_NSG_NAME" \
    --name "$rule_name" \
    --priority "$priority" \
    --direction Inbound \
    --access Allow \
    --protocol "$protocol" \
    --source-address-prefixes "$source_prefix" \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges "$port_range" >/dev/null
}

restrict_ari_to_backend() {
  if [[ "$ASTERISK_RESTRICT_ARI_TO_BACKEND" != "true" ]]; then
    log_info "ARI abierto a cualquier origen (ASTERISK_RESTRICT_ARI_TO_BACKEND=false)"
    return 0
  fi

  log_step "Restringiendo ARI (:$ASTERISK_ARI_PUBLIC_PORT) a IPs salientes del backend"

  local outbound_ips
  outbound_ips="$(az webapp show \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "outboundIpAddresses" -o tsv 2>/dev/null || true)"

  if [[ -z "$outbound_ips" ]]; then
    log_warn "No se obtuvieron outbound IPs del backend; ARI quedará sin regla dedicada"
    ensure_nsg_rule "allow-ari" 140 Tcp "$ASTERISK_ARI_PUBLIC_PORT" "*"
    return 0
  fi

  local ip priority=200
  IFS=',' read -ra IP_LIST <<< "$outbound_ips"
  for ip in "${IP_LIST[@]}"; do
    ip="$(echo "$ip" | tr -d '[:space:]')"
    [[ -z "$ip" ]] && continue
    local rule_name="allow-ari-backend-${ip//./-}"
    ensure_nsg_rule "$rule_name" "$priority" Tcp "$ASTERISK_ARI_PUBLIC_PORT" "$ip/32"
    priority=$((priority + 1))
    if [[ $priority -gt 400 ]]; then
      log_warn "Demasiadas IPs salientes; algunas no tendrán regla NSG dedicada"
      break
    fi
  done
  log_ok "Reglas ARI creadas para backend App Service"
}

ensure_vm() {
  log_step "Asegurando VM Asterisk: $ASTERISK_VM_NAME"

  if resource_exists vm "$ASTERISK_VM_NAME" "$ASTERISK_RESOURCE_GROUP"; then
    log_ok "VM existente: $ASTERISK_VM_NAME"
    return 0
  fi

  if [[ "$MANAGE_ASTERISK_VM" != "true" ]]; then
    log_err "VM no existe y MANAGE_ASTERISK_VM=false"
    exit 1
  fi

  log_info "Creando VM Ubuntu 22.04 ($ASTERISK_VM_SIZE)"
  az vm create \
    --resource-group "$ASTERISK_RESOURCE_GROUP" \
    --name "$ASTERISK_VM_NAME" \
    --location "$LOCATION" \
    --size "$ASTERISK_VM_SIZE" \
    --nics "$ASTERISK_NIC_NAME" \
    --image Ubuntu2204 \
    --admin-username "$ASTERISK_ADMIN_USER" \
    --ssh-key-values "$(cat "$SSH_PUB_KEY_PATH")" \
    --os-disk-size-gb 64 \
    --storage-sku Standard_LRS >/dev/null

  log_ok "VM creada: $ASTERISK_VM_NAME"
}

wait_for_ssh() {
  log_step "Esperando SSH en la VM"
  local max_attempts=30
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    if ssh -i "$SSH_KEY_PATH" \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=10 \
      "${ASTERISK_ADMIN_USER}@${ASTERISK_PUBLIC_IP}" "echo ok" >/dev/null 2>&1; then
      log_ok "SSH disponible"
      return 0
    fi
    log_info "SSH no listo ($attempt/$max_attempts)..."
    sleep 10
    attempt=$((attempt + 1))
  done
  log_err "No se pudo conectar por SSH a ${ASTERISK_PUBLIC_IP}"
  exit 1
}

prepare_asterisk_bundle() {
  log_step "Preparando bundle Asterisk para la VM"

  local advertise_host="$ASTERISK_PUBLIC_IP"
  if [[ -n "$ASTERISK_FQDN" ]]; then
    advertise_host="$ASTERISK_FQDN"
  fi

  local bundle_dir
  bundle_dir="$(mktemp -d)"
  local bundle_root="$bundle_dir/asterisk"
  cp -R "$ASTERISK_SRC_DIR/." "$bundle_root/"

  mkdir -p "$bundle_root/keys"
  touch "$bundle_root/keys/.gitkeep"

  cat > "$bundle_root/.env" <<EOF
ASTERISK_SIP_PORT=${ASTERISK_SIP_PORT}
ASTERISK_RTP_START=${ASTERISK_RTP_START}
ASTERISK_RTP_END=${ASTERISK_RTP_END}
ASTERISK_ARI_PUBLIC_PORT=${ASTERISK_ARI_PUBLIC_PORT}
ASTERISK_WSS_PORT=${ASTERISK_WSS_PORT}
ASTERISK_TZ=${ASTERISK_TZ}
TRUNK_HOST=${TRUNK_HOST:-sip.carrier.example.com}
TRUNK_USER=${TRUNK_USER:-}
TRUNK_PASS=${TRUNK_PASS:-}
EOF

  sed -i.bak \
    -e "s/^external_signaling_address=.*/external_signaling_address=${advertise_host}/" \
    -e "s/^external_media_address=.*/external_media_address=${advertise_host}/" \
    -e "s/^media_address=.*/media_address=${advertise_host}/" \
    -e "s/^local_net=.*/; local_net disabled for cloud deploy/" \
    "$bundle_root/conf/pjsip.conf"
  rm -f "$bundle_root/conf/pjsip.conf.bak"

  BUNDLE_DIR="$bundle_dir"
  BUNDLE_TAR="$bundle_dir/asterisk-bundle.tar.gz"
  tar -czf "$BUNDLE_TAR" -C "$bundle_dir" asterisk
  log_ok "Bundle listo: $BUNDLE_TAR (advertise_host=$advertise_host)"
}

deploy_asterisk_to_vm() {
  log_step "Desplegando Asterisk en la VM vía SSH"

  local advertise_host="$ASTERISK_PUBLIC_IP"
  if [[ -n "$ASTERISK_FQDN" ]]; then
    advertise_host="$ASTERISK_FQDN"
  fi

  scp -i "$SSH_KEY_PATH" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "$BUNDLE_TAR" "${ASTERISK_ADMIN_USER}@${ASTERISK_PUBLIC_IP}:/tmp/asterisk-bundle.tar.gz"

  ssh -i "$SSH_KEY_PATH" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "${ASTERISK_ADMIN_USER}@${ASTERISK_PUBLIC_IP}" bash -s <<REMOTE
set -euo pipefail
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-plugin openssl curl >/dev/null
sudo systemctl enable docker >/dev/null
sudo systemctl start docker
sudo usermod -aG docker "$ASTERISK_ADMIN_USER" || true

sudo rm -rf /opt/cortexcc/asterisk
sudo mkdir -p /opt/cortexcc
sudo tar -xzf /tmp/asterisk-bundle.tar.gz -C /opt/cortexcc
sudo chown -R "$ASTERISK_ADMIN_USER":"$ASTERISK_ADMIN_USER" /opt/cortexcc/asterisk

cd /opt/cortexcc/asterisk
mkdir -p keys
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout keys/asterisk.key \
  -out keys/asterisk.pem \
  -days 365 \
  -subj "/CN=${advertise_host}" >/dev/null 2>&1

sudo docker compose -f docker-compose.asterisk.yml --env-file .env pull
sudo docker compose -f docker-compose.asterisk.yml --env-file .env up -d

sleep 5
sudo docker compose -f docker-compose.asterisk.yml ps
REMOTE

  log_ok "Asterisk desplegado en /opt/cortexcc/asterisk"
}

build_voice_channel_config_json() {
  local ari_url="http://${ASTERISK_PUBLIC_IP}:${ASTERISK_ARI_PUBLIC_PORT}"
  local wss_host="$ASTERISK_PUBLIC_IP"
  if [[ -n "$ASTERISK_FQDN" ]]; then
    wss_host="$ASTERISK_FQDN"
  fi

  ASTERISK_ARI_URL="$ari_url"
  ASTERISK_WSS_URL="wss://${wss_host}:${ASTERISK_WSS_PORT}/ws"

  jq -n \
    --arg ariBaseUrl "$ari_url" \
    --arg ariApp "$ASTERISK_ARI_APP" \
    --arg ariUsername "$ASTERISK_ARI_USERNAME" \
    --arg ariPassword "$ASTERISK_ARI_PASSWORD" \
    '{
      provider: "asterisk_ari",
      ariBaseUrl: $ariBaseUrl,
      ariApp: $ariApp,
      ariUsername: $ariUsername,
      ariPassword: $ariPassword,
      extensionField: "endpoint",
      callerIdField: "channel.caller.number",
      dialedNumberField: "channel.dialplan.exten",
      pollFallbackSec: 15,
      outboundTrunkEndpoint: "PJSIP/carrier-trunk",
      outboundContext: "outbound-trunk",
      agentEndpointTemplate: "PJSIP/{extension}",
      ringTimeoutSec: 30,
      mohClass: "default",
      recordingEnabled: false
    }'
}

integrate_cortexcc_appsettings() {
  if [[ "$INTEGRATE_CORTEXCC" != "true" ]]; then
    log_info "INTEGRATE_CORTEXCC=false; omitiendo App Settings"
    return 0
  fi

  log_step "Integrando referencias Asterisk en App Service backend (CortexCC)"

  az webapp config appsettings set \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      ASTERISK_ARI_BASE_URL="$ASTERISK_ARI_URL" \
      ASTERISK_WSS_URL="$ASTERISK_WSS_URL" \
      ASTERISK_PUBLIC_IP="$ASTERISK_PUBLIC_IP" \
      ASTERISK_FQDN="${ASTERISK_FQDN:-}" \
      >/dev/null

  log_ok "App Settings backend: ASTERISK_ARI_BASE_URL, ASTERISK_WSS_URL"
}

integrate_cortexcc_voice_channel() {
  if [[ "$INTEGRATE_CORTEXCC" != "true" ]]; then
    return 0
  fi

  if [[ -z "$CORTEXCC_DEPLOY_JWT" ]]; then
    log_warn "CORTEXCC_DEPLOY_JWT vacío: configura el canal VOICE manualmente en Settings → Canales"
    log_info "ARI URL sugerida: $ASTERISK_ARI_URL"
    log_info "WSS sugerido: $ASTERISK_WSS_URL"
    return 0
  fi

  log_step "Actualizando canal VOICE en CortexCC vía API"

  local voice_config api_base channels_json channel_id
  voice_config="$(build_voice_channel_config_json)"
  api_base="${BACKEND_URL}${API_PREFIX}"

  channels_json="$(curl -fsS \
    -H "Authorization: Bearer ${CORTEXCC_DEPLOY_JWT}" \
    "${api_base}/settings/channels" 2>/dev/null || echo "[]")"

  channel_id="$(echo "$channels_json" | jq -r '.[] | select(.type=="VOICE") | .id' | head -n1)"

  if [[ -n "$channel_id" && "$channel_id" != "null" ]]; then
    curl -fsS -X PUT \
      -H "Authorization: Bearer ${CORTEXCC_DEPLOY_JWT}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --argjson config "$voice_config" '{config: $config}')" \
      "${api_base}/settings/channels/${channel_id}" >/dev/null
    log_ok "Canal VOICE actualizado: $channel_id"
    return 0
  fi

  if [[ "$CREATE_VOICE_CHANNEL" != "true" ]]; then
    log_warn "No hay canal VOICE y CREATE_VOICE_CHANNEL=false"
    return 0
  fi

  curl -fsS -X POST \
    -H "Authorization: Bearer ${CORTEXCC_DEPLOY_JWT}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg name "$VOICE_CHANNEL_NAME" \
      --argjson config "$voice_config" \
      '{name: $name, type: "VOICE", status: "active", config: $config}')" \
    "${api_base}/settings/channels" >/dev/null

  log_ok "Canal VOICE creado: $VOICE_CHANNEL_NAME"
}

verify_asterisk() {
  log_step "Verificando Asterisk"
  local health_url="http://${ASTERISK_PUBLIC_IP}:${ASTERISK_ARI_PUBLIC_PORT}/ari/api-docs/resources.json"
  if curl -fsS -m 15 -u "${ASTERISK_ARI_USERNAME}:${ASTERISK_ARI_PASSWORD}" "$health_url" >/dev/null 2>&1; then
    log_ok "ARI responde: $health_url"
  else
    log_warn "ARI aún no responde (contenedor iniciando o NSG): $health_url"
  fi
}

print_summary() {
  local wss_host="$ASTERISK_PUBLIC_IP"
  if [[ -n "$ASTERISK_FQDN" ]]; then
    wss_host="$ASTERISK_FQDN"
  fi

  echo ""
  echo "========================================"
  echo " Asterisk Azure — Deployment finalizado"
  echo "========================================"
  echo "RG PBX:        $ASTERISK_RESOURCE_GROUP"
  echo "RG CortexCC:   $RESOURCE_GROUP"
  echo "VM:            $ASTERISK_VM_NAME"
  echo "IP pública:    $ASTERISK_PUBLIC_IP"
  [[ -n "$ASTERISK_FQDN" ]] && echo "FQDN:          $ASTERISK_FQDN"
  echo "ARI:           $ASTERISK_ARI_URL"
  echo "WSS softphone: wss://${wss_host}:${ASTERISK_WSS_PORT}/ws"
  echo "SSH:           ssh -i $SSH_KEY_PATH ${ASTERISK_ADMIN_USER}@${ASTERISK_PUBLIC_IP}"
  echo ""
  echo "CortexCC backend:  $BACKEND_URL"
  echo "CortexCC frontend: $FRONTEND_URL"
  echo ""
  echo "Próximos pasos:"
  echo "  1. Settings → Canales → Voz: probar conexión ARI (si no usaste CORTEXCC_DEPLOY_JWT)"
  echo "  2. Softphone: sip_server=wss://${wss_host}:${ASTERISK_WSS_PORT}/ws"
  echo "  3. Exportar extensiones: GET ${BACKEND_URL}${API_PREFIX}/settings/softphone/endpoints/export?format=pjsip"
  echo "  4. Trunk: editar TRUNK_* en la VM (/opt/cortexcc/asterisk/.env) y reiniciar compose"
  echo "========================================"
}

cleanup_bundle() {
  if [[ -n "${BUNDLE_DIR:-}" && -d "${BUNDLE_DIR:-}" ]]; then
    rm -rf "$BUNDLE_DIR"
  fi
}

main() {
  trap cleanup_bundle EXIT

  echo "========================================"
  echo " CortexCC — Azure Asterisk VM Deploy"
  echo "========================================"
  echo ""

  load_env
  check_dependencies
  ensure_azure_session
  register_azure_providers
  ensure_ssh_key
  ensure_asterisk_resource_group
  ensure_network
  restrict_ari_to_backend
  ensure_vm
  wait_for_ssh
  prepare_asterisk_bundle
  build_voice_channel_config_json
  deploy_asterisk_to_vm
  integrate_cortexcc_appsettings
  integrate_cortexcc_voice_channel
  verify_asterisk
  print_summary
}

main "$@"
