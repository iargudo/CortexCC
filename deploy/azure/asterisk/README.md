# Asterisk en Azure (PBX dedicado)

VM Linux separada del App Service de CortexCC, en un **Resource Group dedicado**.

## Script automatizado

Desde la raíz del repo (tras `az login` y con `deploy/azure/.env` configurado):

```bash
./deploy/azure/deploy-azure-asterisk-vm.sh
```

### Qué hace el script

1. Crea RG dedicado `ASTERISK_RESOURCE_GROUP` (ej. `rg-cortexcc-pbx-stg-001`)
2. Red: VNet, NSG, IP pública estática, NIC, VM Ubuntu 22.04
3. NSG: SIP UDP 5060, WSS 8089, RTP 10000–10100, SSH 22
4. ARI `:8074` restringido a **outbound IPs** del backend App Service (si `ASTERISK_RESTRICT_ARI_TO_BACKEND=true`)
5. Copia `deploy/asterisk/` a la VM, parchea `pjsip.conf` con IP/FQDN, genera TLS y levanta Docker Compose
6. Integración CortexCC:
   - App Settings en backend: `ASTERISK_ARI_BASE_URL`, `ASTERISK_WSS_URL`, `ASTERISK_PUBLIC_IP`
   - Si `CORTEXCC_DEPLOY_JWT` está definido: crea o actualiza el canal **VOICE** vía API

### Orden recomendado de despliegue

```bash
# 1) CortexCC (App Service + Redis + ACR)
./deploy/azure/deploy-azure-prd-cortexcc.sh

# 2) Asterisk PBX (VM dedicada)
./deploy/azure/deploy-azure-asterisk-vm.sh
```

### JWT para integración automática del canal VOICE

Obtén un token admin (usuario con permiso `settings`):

```bash
curl -s -X POST "https://app-back-cortexcc-stg-001.azurewebsites.net/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"..."}' | jq -r .access_token
```

Pégalo en `.env` como `CORTEXCC_DEPLOY_JWT=...` antes de ejecutar el script de Asterisk.

## Convención de nombres

Alineada con `deploy-azure-prd-cortexcc.sh`:

| CortexCC (RG principal) | Asterisk (RG dedicado) |
|-------------------------|-------------------------|
| `rg-cortexcc-stg-001` | `rg-cortexcc-pbx-stg-001` |
| `app-back-cortexcc-stg-001` | `vm-asterisk-cortexcc-stg-001` |
| `app-front-cortexcc-stg-001` | `pip-asterisk-cortexcc-stg-001` |

## Despliegue manual (alternativa)

```bash
cd deploy/asterisk
cp .env.example .env
# Editar external_* en conf/pjsip.conf y credenciales trunk
docker compose -f docker-compose.asterisk.yml --env-file .env up -d
```

## Post-despliegue

Exportar extensiones desde CortexCC:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://<api>/api/settings/softphone/endpoints/export?format=pjsip" \
  > conf/pjsip_agents.conf
```

Softphone web (org settings):

```
sip_server=wss://<pbx-fqdn-o-ip>:8089/ws
sip_realm=<pbx-fqdn-o-ip>
```

## Smoke test

1. Agente registrado en softphone (extensión 700x)
2. Llamada interna entre extensiones
3. Inbound simulado vía Stasis
4. Outbound click-to-call desde contacto
5. Settings → Canales → Voz → **Probar conexión ARI**

## Runbook incidentes

| Síntoma | Acción |
|---------|--------|
| Sin audio | Verificar `external_media_address`, RTP en NSG |
| WSS falla | Certificado TLS válido en `:8089` (prod: Let's Encrypt) |
| ARI desconectado | `ENABLE_JOBS=true`, credenciales `cortexcc`, NSG 8074 desde backend |
| Trunk caído | `docker exec asterisk asterisk -rx "pjsip show registrations"` |
