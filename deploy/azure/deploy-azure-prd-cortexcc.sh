#!/usr/bin/env bash
#
# Deploy de CortexCC (Contact Center) a Azure App Service + ACR + Redis
# Adaptado desde deploy-azure-prd-cortexcrm.sh y deploy-azure.sh (AgentHub)
#
# Requisitos: az CLI, docker, curl, openssl, sesion az login
# Config: deploy/azure/.env (ver .env.example)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
CONFIG_FILE="$SCRIPT_DIR/.azure-config"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

REDIS_RESOURCE_GROUP=""

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
  local resource_group="${3:-}"

  case "$resource_type" in
    acr)
      az acr show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    webapp)
      az webapp show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    appserviceplan)
      az appservice plan show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    resourcegroup)
      az group show --name "$resource_name" >/dev/null 2>&1
      ;;
    redis)
      az redis show --name "$resource_name" --resource-group "$resource_group" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

find_redis_resource_group() {
  local redis_name="$1"
  if resource_exists redis "$redis_name" "$RESOURCE_GROUP"; then
    echo "$RESOURCE_GROUP"
    return 0
  fi
  az redis list --query "[?name=='$redis_name'].resourceGroup | [0]" -o tsv 2>/dev/null || true
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

  MANAGE_REDIS="${MANAGE_REDIS:-true}"
  SKIP_REDIS_CREATE="${SKIP_REDIS_CREATE:-false}"
  REDIS_SKU="${REDIS_SKU:-Basic}"
  REDIS_VM_SIZE="${REDIS_VM_SIZE:-c0}"
  REDIS_DB="${REDIS_DB:-2}"

  local required=(
    RESOURCE_GROUP LOCATION APP_SERVICE_PLAN
    BACKEND_WEBAPP_NAME FRONTEND_WEBAPP_NAME ACR_NAME
    DATABASE_URL MASTER_DATABASE_URL INTEGRATION_API_KEY
  )

  if [[ "$MANAGE_REDIS" == "true" ]]; then
    if [[ -z "${REDIS_NAME:-}" ]]; then
      log_err "Con MANAGE_REDIS=true debes definir REDIS_NAME en .env"
      exit 1
    fi
  elif [[ -z "${REDIS_URL:-}" ]]; then
    log_err "Con MANAGE_REDIS=false debes definir REDIS_URL en .env"
    exit 1
  fi

  local v
  for v in "${required[@]}"; do
    if [[ -z "${!v:-}" ]]; then
      log_err "Falta variable requerida en .env: $v"
      exit 1
    fi
  done

  BACKEND_PORT="${BACKEND_PORT:-3030}"
  FRONTEND_PORT="${FRONTEND_PORT:-8080}"
  API_PREFIX="${API_PREFIX:-/api}"
  APP_SERVICE_SKU="${APP_SERVICE_SKU:-B1}"
  RUN_PRISMA_SEED="${RUN_PRISMA_SEED:-false}"
  QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY:-5}"
  ENABLE_JOBS="${ENABLE_JOBS:-true}"
  SOCKETIO_PATH="${SOCKETIO_PATH:-/socket.io}"
  JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-15m}"
  JWT_REFRESH_EXPIRES_IN="${JWT_REFRESH_EXPIRES_IN:-30d}"
  BUSINESS_TIMEZONE="${BUSINESS_TIMEZONE:-America/Guayaquil}"
  PRISMA_LOG_QUERIES="${PRISMA_LOG_QUERIES:-false}"
  STORAGE_PROVIDER="${STORAGE_PROVIDER:-local}"

  if [[ "$BACKEND_PORT" != "3030" || "$FRONTEND_PORT" != "8080" ]]; then
    log_err "Puertos fijos del proyecto: BACKEND_PORT=3030 y FRONTEND_PORT=8080"
    exit 1
  fi

  BACKEND_URL="https://${BACKEND_WEBAPP_NAME}.azurewebsites.net"
  FRONTEND_URL="https://${FRONTEND_WEBAPP_NAME}.azurewebsites.net"

  if [[ -z "${JWT_SECRET:-}" ]]; then
    JWT_SECRET="$(openssl rand -base64 32)"
    log_warn "JWT_SECRET generado para este deploy (guardalo si necesitas persistencia)"
  fi
  if [[ -z "${JWT_REFRESH_SECRET:-}" ]]; then
    JWT_REFRESH_SECRET="$(openssl rand -base64 32)"
    log_warn "JWT_REFRESH_SECRET generado para este deploy"
  fi
}

validate_local_project_ports() {
  log_step "Validando puertos locales del proyecto (3030 / 8080)"

  if [[ -f "$BACKEND_DIR/.env" ]]; then
    local backend_port
    backend_port="$(awk -F= '/^PORT=/{print $2; exit}' "$BACKEND_DIR/.env" | tr -d '[:space:]')"
    if [[ -n "$backend_port" && "$backend_port" != "3030" ]]; then
      log_err "backend/.env tiene PORT=$backend_port; debe ser 3030"
      exit 1
    fi
  fi

  if [[ -f "$FRONTEND_DIR/.env" ]]; then
    local vite_url
    vite_url="$(awk -F= '/^VITE_API_URL=/{print $2; exit}' "$FRONTEND_DIR/.env" | tr -d '[:space:]')"
    if [[ -n "$vite_url" && "$vite_url" != *":3030"* ]]; then
      log_warn "frontend/.env VITE_API_URL no apunta al puerto 3030: $vite_url"
    fi
  fi

  log_ok "Puertos del proyecto validados"
}

check_dependencies() {
  log_step "Verificando dependencias"
  require_command az
  require_command curl
  require_command docker
  require_command openssl
  require_command awk
  if ! docker buildx version >/dev/null 2>&1; then
    log_warn "docker buildx no disponible; se usara build clasico con --platform"
  fi
  log_ok "Dependencias OK"
}

ensure_azure_session() {
  log_step "Verificando sesion Azure"

  if ! az account show >/dev/null 2>&1; then
    log_err "No hay sesion activa. Ejecuta: az login"
    exit 1
  fi

  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    if [[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
      az account set --subscription "$AZURE_SUBSCRIPTION_ID" >/dev/null
    fi
    log_info "Suscripcion: ${AZURE_SUBSCRIPTION_NAME:-actual}"
    log_ok "Contexto Azure cargado desde .azure-config"
  else
    log_warn "No existe .azure-config; se usa la suscripcion activa de az login"
  fi
}

register_azure_providers() {
  log_step "Registrando providers de Azure"

  local providers=(
    Microsoft.Cache
    Microsoft.Web
    Microsoft.ContainerRegistry
  )

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

ensure_resource_group() {
  if ! resource_exists resourcegroup "$RESOURCE_GROUP"; then
    log_info "Creando Resource Group: $RESOURCE_GROUP"
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null
  fi
  log_ok "Resource Group: $RESOURCE_GROUP"
}

wait_redis_ready() {
  local redis_rg="$1"
  local max_attempts=30
  local attempt=1
  local state=""

  while [[ $attempt -le $max_attempts ]]; do
    state="$(az redis show --name "$REDIS_NAME" --resource-group "$redis_rg" --query provisioningState -o tsv 2>/dev/null || echo Unknown)"
    if [[ "$state" == "Succeeded" ]]; then
      log_ok "Redis listo: $REDIS_NAME"
      return 0
    fi
    if [[ "$state" == "Failed" ]]; then
      log_err "Redis fallo al aprovisionarse: $REDIS_NAME"
      exit 1
    fi
    log_info "Redis estado: $state ($attempt/$max_attempts)"
    sleep 10
    attempt=$((attempt + 1))
  done

  log_warn "Redis tardo mas de lo esperado; continuando..."
}

ensure_redis_cache() {
  if [[ "$MANAGE_REDIS" != "true" ]]; then
    log_info "MANAGE_REDIS=false; se usa REDIS_URL del .env"
    return 0
  fi

  log_step "Asegurando Azure Cache for Redis: $REDIS_NAME"

  REDIS_RESOURCE_GROUP="$(find_redis_resource_group "$REDIS_NAME")"
  if [[ -n "$REDIS_RESOURCE_GROUP" ]]; then
    log_ok "Redis existente: $REDIS_NAME (RG: $REDIS_RESOURCE_GROUP)"
    wait_redis_ready "$REDIS_RESOURCE_GROUP"
    return 0
  fi

  if [[ "$SKIP_REDIS_CREATE" == "true" ]]; then
    log_err "Redis '$REDIS_NAME' no existe y SKIP_REDIS_CREATE=true"
    exit 1
  fi

  log_info "Creando Azure Cache for Redis: $REDIS_NAME"
  local create_output create_exit
  create_output="$(az redis create \
    --name "$REDIS_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku "$REDIS_SKU" \
    --vm-size "$REDIS_VM_SIZE" 2>&1)" || create_exit=$?
  create_exit="${create_exit:-0}"

  if [[ $create_exit -ne 0 ]]; then
    if echo "$create_output" | grep -qiE 'NameNotAvailable|already in use|already exists'; then
      REDIS_RESOURCE_GROUP="$(find_redis_resource_group "$REDIS_NAME")"
      if [[ -n "$REDIS_RESOURCE_GROUP" ]]; then
        log_warn "Redis ya existe en otro RG: $REDIS_RESOURCE_GROUP"
        wait_redis_ready "$REDIS_RESOURCE_GROUP"
        return 0
      fi
    fi
    log_err "Error al crear Redis: $create_output"
    exit 1
  fi

  REDIS_RESOURCE_GROUP="$RESOURCE_GROUP"
  log_ok "Redis creado: $REDIS_NAME"
  wait_redis_ready "$REDIS_RESOURCE_GROUP"
}

resolve_redis_url() {
  if [[ "$MANAGE_REDIS" != "true" ]]; then
    log_ok "REDIS_URL manual: ${REDIS_URL%%@*}@***"
    return 0
  fi

  log_step "Resolviendo REDIS_URL desde Azure Cache for Redis"

  REDIS_RESOURCE_GROUP="$(find_redis_resource_group "$REDIS_NAME")"
  if [[ -z "$REDIS_RESOURCE_GROUP" ]]; then
    log_err "No se encontro Redis: $REDIS_NAME"
    exit 1
  fi

  local redis_host redis_ssl_port redis_password
  local max_attempts=5
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    redis_host="$(az redis show --name "$REDIS_NAME" --resource-group "$REDIS_RESOURCE_GROUP" --query hostName -o tsv 2>/dev/null || true)"
    redis_ssl_port="$(az redis show --name "$REDIS_NAME" --resource-group "$REDIS_RESOURCE_GROUP" --query sslPort -o tsv 2>/dev/null || true)"
    redis_password="$(az redis list-keys --name "$REDIS_NAME" --resource-group "$REDIS_RESOURCE_GROUP" --query primaryKey -o tsv 2>/dev/null || true)"

    if [[ -n "$redis_host" && -n "$redis_ssl_port" && -n "$redis_password" ]]; then
      REDIS_URL="rediss://:${redis_password}@${redis_host}:${redis_ssl_port}/${REDIS_DB}"
      log_ok "REDIS_URL configurada (SSL puerto $redis_ssl_port, DB $REDIS_DB)"
      log_info "Redis host: $redis_host"
      if [[ "$REDIS_RESOURCE_GROUP" != "$RESOURCE_GROUP" ]]; then
        log_warn "Redis esta en RG '$REDIS_RESOURCE_GROUP', no en '$RESOURCE_GROUP'"
      fi
      return 0
    fi

    log_warn "Esperando credenciales de Redis ($attempt/$max_attempts)..."
    sleep 10
    attempt=$((attempt + 1))
  done

  log_err "No se pudo obtener host/puerto/password de Redis"
  exit 1
}

resolve_webapp_runtime() {
  # Placeholder hasta asignar imagen Docker; debe existir en la suscripcion/región
  local preferred="${AZURE_WEBAPP_RUNTIME:-NODE:22-lts}"
  local runtime
  for runtime in "$preferred" NODE:22-lts NODE:24-lts; do
    if az webapp list-runtimes --os-type linux -o tsv 2>/dev/null | grep -qx "$runtime"; then
      AZURE_WEBAPP_RUNTIME="$runtime"
      log_info "Runtime Web App (placeholder): $AZURE_WEBAPP_RUNTIME"
      return 0
    fi
  done
  log_err "No hay runtime NODE soportado. Ejecuta: az webapp list-runtimes --os-type linux"
  exit 1
}

ensure_app_services() {
  log_step "Asegurando App Service Plan y Web Apps"
  resolve_webapp_runtime

  if ! resource_exists appserviceplan "$APP_SERVICE_PLAN" "$RESOURCE_GROUP"; then
    log_info "Creando App Service Plan: $APP_SERVICE_PLAN"
    az appservice plan create \
      --name "$APP_SERVICE_PLAN" \
      --resource-group "$RESOURCE_GROUP" \
      --location "$LOCATION" \
      --is-linux \
      --sku "$APP_SERVICE_SKU" >/dev/null
  fi
  log_ok "App Service Plan: $APP_SERVICE_PLAN"

  if ! resource_exists webapp "$BACKEND_WEBAPP_NAME" "$RESOURCE_GROUP"; then
    log_info "Creando WebApp backend: $BACKEND_WEBAPP_NAME"
    az webapp create \
      --name "$BACKEND_WEBAPP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --plan "$APP_SERVICE_PLAN" \
      --runtime "$AZURE_WEBAPP_RUNTIME" >/dev/null
  fi
  log_ok "Backend WebApp: $BACKEND_WEBAPP_NAME"

  if ! resource_exists webapp "$FRONTEND_WEBAPP_NAME" "$RESOURCE_GROUP"; then
    log_info "Creando WebApp frontend: $FRONTEND_WEBAPP_NAME"
    az webapp create \
      --name "$FRONTEND_WEBAPP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --plan "$APP_SERVICE_PLAN" \
      --runtime "$AZURE_WEBAPP_RUNTIME" >/dev/null
  fi
  log_ok "Frontend WebApp: $FRONTEND_WEBAPP_NAME"
}

configure_backend_websockets() {
  log_step "Habilitando WebSockets en backend (Socket.IO)"

  az webapp config set \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --web-sockets-enabled true >/dev/null

  log_ok "WebSockets habilitados en $BACKEND_WEBAPP_NAME"
}

ensure_acr() {
  log_step "Asegurando Azure Container Registry"

  if ! resource_exists acr "$ACR_NAME" "$RESOURCE_GROUP"; then
    log_info "Creando ACR: $ACR_NAME"
    az acr create \
      --name "$ACR_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --location "$LOCATION" \
      --sku Basic \
      --admin-enabled true >/dev/null
  fi

  ACR_LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)"
  BACKEND_IMAGE="${ACR_LOGIN_SERVER}/cortexcc-backend:latest"
  FRONTEND_IMAGE="${ACR_LOGIN_SERVER}/cortexcc-frontend:latest"
  log_ok "ACR: $ACR_LOGIN_SERVER"
}

configure_backend_appsettings() {
  log_step "Configurando App Settings del backend"

  az webapp config appsettings set \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      NODE_ENV="production" \
      PORT="$BACKEND_PORT" \
      WEBSITES_PORT="$BACKEND_PORT" \
      API_PREFIX="$API_PREFIX" \
      CORS_ORIGIN="$FRONTEND_URL" \
      MASTER_DATABASE_URL="$MASTER_DATABASE_URL" \
      DATABASE_URL="$DATABASE_URL" \
      REDIS_URL="$REDIS_URL" \
      QUEUE_CONCURRENCY="$QUEUE_CONCURRENCY" \
      ENABLE_JOBS="$ENABLE_JOBS" \
      SOCKETIO_PATH="$SOCKETIO_PATH" \
      SOCKETIO_CORS_ORIGIN="$FRONTEND_URL" \
      JWT_SECRET="$JWT_SECRET" \
      JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
      JWT_EXPIRES_IN="$JWT_EXPIRES_IN" \
      JWT_REFRESH_EXPIRES_IN="$JWT_REFRESH_EXPIRES_IN" \
      INTEGRATION_API_KEY="$INTEGRATION_API_KEY" \
      BUSINESS_TIMEZONE="$BUSINESS_TIMEZONE" \
      PRISMA_LOG_QUERIES="$PRISMA_LOG_QUERIES" \
      RUN_PRISMA_SEED="$RUN_PRISMA_SEED" \
      STORAGE_PROVIDER="$STORAGE_PROVIDER" \
      SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
      WEBSITE_NODE_DEFAULT_VERSION="~20" \
      WEBSITE_RUN_FROM_PACKAGE="0" \
      WEBSITES_CONTAINER_START_TIME_LIMIT="1800" \
      NPM_CONFIG_PLATFORM="linux" \
      NPM_CONFIG_ARCH="x64" \
      AGENTHUB_PUBLIC_URL="${AGENTHUB_PUBLIC_URL:-}" \
      CORTEX_CC_API_BASE_URL="${CORTEX_CC_API_BASE_URL:-$BACKEND_URL}" \
      AZURE_STORAGE_CONNECTION_STRING="${AZURE_STORAGE_CONNECTION_STRING:-}" \
      AZURE_STORAGE_CONTAINER="${AZURE_STORAGE_CONTAINER:-attachments}" \
      CHANNEL_CONFIG_ENCRYPTION_KEY="${CHANNEL_CONFIG_ENCRYPTION_KEY:-}" \
      >/dev/null

  log_ok "App Settings backend configurados (REDIS_URL aplicada)"
}

configure_frontend_appsettings() {
  log_step "Configurando App Settings del frontend"

  az webapp config appsettings set \
    --name "$FRONTEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      NODE_ENV="production" \
      WEBSITES_PORT="$FRONTEND_PORT" \
      APP_PORT="$FRONTEND_PORT" \
      >/dev/null

  log_ok "App Settings frontend configurados"
}

acr_docker_login() {
  local max_attempts=3
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    if az acr login --name "$ACR_NAME" >/dev/null 2>&1; then
      log_ok "Docker autenticado en ACR: $ACR_LOGIN_SERVER"
      return 0
    fi
    log_warn "ACR login intento $attempt/$max_attempts fallo; reintentando en 5s..."
    sleep 5
    attempt=$((attempt + 1))
  done

  log_warn "az acr login fallo tras $max_attempts intentos; usando credenciales admin del ACR"
  local acr_user acr_pass
  acr_user="$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "username" -o tsv)"
  acr_pass="$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" -o tsv)"

  if [[ -z "$acr_user" || -z "$acr_pass" ]]; then
    log_err "No se pudo autenticar Docker en ACR ($ACR_LOGIN_SERVER)"
    exit 1
  fi

  if ! echo "$acr_pass" | docker login "$ACR_LOGIN_SERVER" -u "$acr_user" --password-stdin >/dev/null 2>&1; then
    log_err "docker login fallo para $ACR_LOGIN_SERVER (revisa red/VPN/firewall)"
    exit 1
  fi
  log_ok "Docker autenticado en ACR via credenciales admin"
}

docker_build_push() {
  local image="$1"
  local dockerfile="$2"
  local context="$3"
  shift 3
  local -a build_args=("$@")

  log_info "Build: $image"
  if docker buildx version >/dev/null 2>&1; then
    docker buildx build \
      --platform linux/amd64 \
      "${build_args[@]}" \
      -t "$image" \
      -f "$dockerfile" \
      --load \
      "$context"
  else
    DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build \
      "${build_args[@]}" \
      -t "$image" \
      -f "$dockerfile" \
      "$context"
  fi
  docker push "$image"
}

assign_container_image() {
  local webapp="$1"
  local image="$2"

  local acr_user acr_pass
  acr_user="$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "username" -o tsv)"
  acr_pass="$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" -o tsv)"

  az webapp config container set \
    --name "$webapp" \
    --resource-group "$RESOURCE_GROUP" \
    --container-image-name "$image" \
    --container-registry-url "https://${ACR_LOGIN_SERVER}" \
    --container-registry-user "$acr_user" \
    --container-registry-password "$acr_pass" >/dev/null

  az webapp restart --name "$webapp" --resource-group "$RESOURCE_GROUP" >/dev/null
}

deploy_backend_docker() {
  log_step "Desplegando backend (Docker -> ACR -> WebApp)"

  if [[ ! -f "$BACKEND_DIR/Dockerfile" ]]; then
    log_err "Falta $BACKEND_DIR/Dockerfile"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    log_err "Docker no esta en ejecucion"
    exit 1
  fi

  docker_build_push "$BACKEND_IMAGE" "$BACKEND_DIR/Dockerfile" "$BACKEND_DIR" \
    --build-arg "APP_PORT=$BACKEND_PORT"

  assign_container_image "$BACKEND_WEBAPP_NAME" "$BACKEND_IMAGE"
  log_ok "Backend desplegado: $BACKEND_IMAGE"
}

deploy_frontend_docker() {
  log_step "Desplegando frontend (Docker -> ACR -> WebApp)"

  if [[ ! -f "$FRONTEND_DIR/Dockerfile" ]]; then
    log_err "Falta $FRONTEND_DIR/Dockerfile"
    exit 1
  fi

  local vite_api_url="${BACKEND_URL}${API_PREFIX}"
  local vite_ws_url="$BACKEND_URL"

  docker_build_push "$FRONTEND_IMAGE" "$FRONTEND_DIR/Dockerfile" "$FRONTEND_DIR" \
    --build-arg "APP_PORT=$FRONTEND_PORT" \
    --build-arg "VITE_API_URL=$vite_api_url" \
    --build-arg "VITE_WS_URL=$vite_ws_url" \
    --build-arg "VITE_SOCKET_PATH=$SOCKETIO_PATH"

  assign_container_image "$FRONTEND_WEBAPP_NAME" "$FRONTEND_IMAGE"

  log_ok "Frontend desplegado: $FRONTEND_IMAGE"
}

configure_backend_platform_cors() {
  log_step "Configurando CORS de plataforma Azure (con credentials)"

  az webapp cors delete \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1 || true

  az webapp cors add \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --allowed-origins "$FRONTEND_URL" >/dev/null

  az webapp cors update \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --support-credentials true >/dev/null 2>&1 \
    || az webapp config set \
      --name "$BACKEND_WEBAPP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --generic-configurations '{"cors":{"supportCredentials":true}}' >/dev/null 2>&1 || true

  log_ok "CORS plataforma: $FRONTEND_URL (supportCredentials)"
}

finalize_backend_cors() {
  log_step "Ajustando CORS del backend con URL del frontend"

  configure_backend_platform_cors

  az webapp config appsettings set \
    --name "$BACKEND_WEBAPP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      CORS_ORIGIN="$FRONTEND_URL" \
      SOCKETIO_CORS_ORIGIN="$FRONTEND_URL" \
      CORTEX_CC_API_BASE_URL="$BACKEND_URL" \
      REDIS_URL="$REDIS_URL" \
      >/dev/null

  az webapp restart --name "$BACKEND_WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null
  log_ok "CORS, Redis y URLs finales aplicados"
}

verify_deployment() {
  log_step "Verificando despliegue"

  local health_url="${BACKEND_URL}${API_PREFIX}/health"
  if curl -fsS -m 30 "$health_url" >/dev/null 2>&1; then
    log_ok "Backend health: $health_url"
  else
    log_warn "Backend aun iniciando (migraciones o cold start): $health_url"
  fi

  if curl -fsS -m 30 -I "$FRONTEND_URL" >/dev/null 2>&1; then
    log_ok "Frontend: $FRONTEND_URL"
  else
    log_warn "Frontend aun iniciando: $FRONTEND_URL"
  fi

  if [[ "$MANAGE_REDIS" == "true" && -n "${REDIS_RESOURCE_GROUP:-}" ]]; then
    local redis_state
    redis_state="$(az redis show --name "$REDIS_NAME" --resource-group "$REDIS_RESOURCE_GROUP" --query provisioningState -o tsv 2>/dev/null || echo Unknown)"
    if [[ "$redis_state" == "Succeeded" ]]; then
      log_ok "Redis: $REDIS_NAME ($redis_state)"
    else
      log_warn "Redis: $REDIS_NAME ($redis_state)"
    fi
  fi
}

main() {
  echo "========================================"
  echo " CortexCC — Azure Deployment"
  echo "========================================"
  echo ""

  load_env
  check_dependencies
  validate_local_project_ports
  ensure_azure_session
  ensure_resource_group
  register_azure_providers
  ensure_redis_cache
  resolve_redis_url
  ensure_app_services
  configure_backend_websockets
  ensure_acr
  configure_backend_appsettings
  configure_frontend_appsettings
  acr_docker_login
  deploy_backend_docker
  deploy_frontend_docker
  finalize_backend_cors
  verify_deployment

  echo ""
  echo "========================================"
  echo " Deployment finalizado"
  echo "========================================"
  echo "Backend:  $BACKEND_URL"
  echo "Health:   ${BACKEND_URL}${API_PREFIX}/health"
  echo "Frontend: $FRONTEND_URL"
  if [[ "$MANAGE_REDIS" == "true" ]]; then
    echo "Redis:    $REDIS_NAME (${REDIS_RESOURCE_GROUP:-$RESOURCE_GROUP})"
    echo "REDIS_URL: rediss://:***@... (configurada en App Settings)"
  fi
  echo "========================================"
}

main "$@"
