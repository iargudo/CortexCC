# Telefonia: Asterisk y softphone

## Objetivo

Habilitar comunicacion bidireccional entre:

- Asistente IA (`1000`)
- Softphone SIP UDP (`6001`)
- Softphone WebRTC (CortexCC, `7001`)
- Softphone movil/desktop SIP UDP (`8001`)

## Topologia actual

Archivos de referencia:

- `deploy/asterisk/docker-compose.asterisk.yml`
- `deploy/asterisk/.env.example`
- `deploy/asterisk/conf/pjsip.conf`
- `deploy/asterisk/conf/extensions.conf`
- `deploy/asterisk/conf/http.conf`
- `deploy/asterisk/conf/ari.conf`
- `deploy/asterisk/conf/rtp.conf`
- `deploy/asterisk/keys/README.md` (certificados TLS locales)

## Levantar Asterisk en Docker (local)

Desde la raíz del repo:

```bash
cd deploy/asterisk
cp .env.example .env
docker compose -f docker-compose.asterisk.yml --env-file .env up -d
```

Notas:

- Si usas certificado self-signed en WSS, abre `https://<host-asterisk>:8089` en el navegador y acepta el certificado **antes** de conectar el softphone.
- Ajusta en `conf/pjsip.conf` los campos `external_signaling_address`, `external_media_address`, `media_address` y `local_net` para que coincidan con tu LAN/IP real (evita audio de un solo lado / SDP con IPs incorrectas).

## Modelo de configuracion unificada (PBX)

CortexCC trata **un solo host Asterisk** como fuente de verdad y deriva dos interfaces:

| Capa | Consumidor | Protocolo | Puerto por defecto | Persistencia |
|------|------------|-----------|-------------------|--------------|
| **Agentes (softphone)** | Frontend SIP.js | WSS/SIP | 8089 | `organization_settings` (`pbx_host`, `sip_server`, `sip_realm`) |
| **Plataforma (contact center)** | Backend ARI | HTTP/Stasis | 8074 | `channels.config` del canal `VOICE` (`ariBaseUrl` derivado) |

### Pantalla unificada

**Configuración → Telefonía** (`/settings/telephony`) centraliza:

- Host PBX (`pbx_host`) y puertos WSS/ARI
- Parámetros compartidos del softphone (STUN, rango de extensiones, display name)
- Credenciales ARI y parámetros operativos del canal VOICE

API:

- `GET /api/settings/telephony` — vista unificada + validación cruzada
- `PUT /api/settings/telephony` — guarda org + sincroniza `ariBaseUrl` en canal VOICE

Al guardar se derivan automáticamente:

```text
sip_server  = wss://{pbx_host}:{pbx_wss_port}/ws
sip_realm   = {pbx_host}
ariBaseUrl  = http://{pbx_host}:{pbx_ari_port}
```

La validación advierte si falta canal VOICE, si está inactivo, o si `sip_server` y `ariBaseUrl` apuntan a hosts distintos.

### Dónde sigue viviendo cada dato

- **Widget softphone del agente** (extensión/contraseña personal): sigue en `/settings/softphone/me` por usuario.
- **Canal VOICE** en **Configuración → Canales**: credenciales ARI avanzadas; la URL ARI es de solo lectura si `pbx_host` está definido.

## Pruebas en LAN (desarrollo)

Para probar desde **otra máquina en la red local** (no solo `localhost`):

### Script automático (recomendado)

Desde la raíz del repo, con backend accesible en `:3037` y `psql` disponible:

```bash
./scripts/set-lan-ip.sh                  # detecta IP LAN (en0 / en1)
./scripts/set-lan-ip.sh 192.168.86.76    # IP explícita
./scripts/set-lan-ip.sh --dry-run        # solo muestra cambios
TENANT_KEY=local ./scripts/set-lan-ip.sh
```

El script actualiza en un solo paso:

| Destino | Qué escribe |
|---------|-------------|
| `frontend/.env` | `VITE_API_URL`, `VITE_WS_URL` → `https://<IP>:8087` |
| `backend/.env` | `CORS_ORIGIN`, `SOCKETIO_CORS_ORIGIN` |
| Master DB | `tenants.custom_domain` |
| Tenant DB | `organization_settings.pbx_host`, `sip_server`, `sip_realm` + `channels` VOICE `ariBaseUrl` |
| `deploy/asterisk/conf/pjsip.conf` | `external_*`, `local_net`, `media_address` |
| `pjsip_agents.conf` | vía `sync-agent-endpoints.sh` + reload PJSIP |

Después **reinicia backend y frontend** y pide a los agentes **cerrar sesión y volver a entrar** (recargan config del softphone).

Accede siempre por **`https://<IP>:8087`** (no `http://`).

### Configuración manual (referencia)

Si prefieres hacerlo a mano o entender cada pieza:

#### 1. Tenant y acceso web

En la base **Master**, registra la IP LAN del host como dominio del tenant:

```sql
UPDATE tenants
SET custom_domain = '192.168.x.x'
WHERE tenant_key = 'local';
```

En `backend/.env`:

```env
CORS_ORIGIN=https://192.168.x.x:8087
SOCKETIO_CORS_ORIGIN=https://192.168.x.x:8087
```

> `VITE_TENANT_KEY` solo aplica en `localhost` / `127.0.0.1`. Desde IP LAN el frontend resuelve el tenant con `GET /api/tenants/resolve?host=192.168.x.x`.

#### 2. Frontend con HTTPS (obligatorio para llamadas WebRTC)

El softphone necesita **micrófono** (`getUserMedia`). Los navegadores solo lo permiten en **contexto seguro**: `https://`, `http://localhost` o `http://127.0.0.1`. Si accedes por `http://192.168.x.x:8087`, el registro SIP puede funcionar pero **al marcar no pasa nada** (no llega INVITE a Asterisk).

En desarrollo, Vite sirve HTTPS en el puerto **8087** reutilizando los certificados de `deploy/asterisk/keys/` y hace proxy de `/api` y `/socket.io` al backend en `3037` (ver `frontend/vite.config.ts`).

En `frontend/.env` (ejemplo LAN):

```env
VITE_API_URL=https://192.168.x.x:8087/api
VITE_WS_URL=https://192.168.x.x:8087
VITE_SOCKET_PATH=/socket.io
```

Accede siempre por **`https://192.168.x.x:8087`** (acepta el certificado self-signed en el navegador).

#### 3. Softphone y PBX (organización + Asterisk)

Preferible vía **Configuración → Telefonía** (o API `PUT /settings/telephony`):

```text
pbx_host       = 192.168.x.x
pbx_wss_port   = 8089
pbx_ari_port   = 8074
```

Se derivan:

```text
sip_server = wss://192.168.x.x:8089/ws
sip_realm  = 192.168.x.x
ariBaseUrl = http://192.168.x.x:8074
```

Alternativa manual en `organization_settings`:

```text
sip_server = wss://192.168.x.x:8089/ws
sip_realm  = 192.168.x.x
```

En `deploy/asterisk/conf/pjsip.conf`:

```ini
external_signaling_address=192.168.x.x
external_media_address=192.168.x.x
local_net=192.168.x.0/24
```

Regenera endpoints WebRTC y recarga PJSIP:

```bash
deploy/asterisk/scripts/sync-agent-endpoints.sh
# o manualmente:
docker exec asterisk asterisk -rx "module reload res_pjsip.so"
```

#### 4. Firewall del host

Abrir entrante hacia la máquina que corre Asterisk y el frontend:

| Puerto | Protocolo | Uso |
|--------|-----------|-----|
| 8087 | TCP | Frontend (HTTPS en dev LAN) |
| 3037 | TCP | Backend API (si no usas proxy Vite) |
| 8089 | TCP | WebRTC WSS (Asterisk) |
| 10000–10100 | UDP | RTP (audio) |

#### 5. Prueba entre dos PCs

1. PC A: login agente con extensión (ej. `7001`), conectar softphone.
2. PC B: login otro agente (ej. `7002`), conectar softphone.
3. En A: marcar `7002` → **Llamar** → conceder permiso de micrófono.
4. En B: contestar desde el softphone.

Las llamadas entre extensiones usan el dialplan interno (`Dial(PJSIP/${EXTEN})`); no requieren trunk PSTN.

## Puertos publicados (contenedor Asterisk)

- SIP UDP: `5060/udp` (mapeado por `ASTERISK_SIP_PORT`)
- RTP: rango configurable `ASTERISK_RTP_START`-`ASTERISK_RTP_END` UDP
- ARI HTTP: `8088/tcp` (mapeado por `ASTERISK_ARI_PUBLIC_PORT`)
- WSS SIP: `8089/tcp` (mapeado por `ASTERISK_WSS_PORT`)

## Dialplan interno

Contexto `from-internal`:

- `1000` -> `Stasis(cortexcc,ai)` para IA.
- Patrón `_X.` -> si la extensión tiene ≤4 dígitos, `Dial(PJSIP/${EXTEN})` (llamadas internas entre agentes).
- Patrón `_X.` con más de 4 dígitos -> `Stasis(cortexcc,outbound,...)` (saliente vía backend).
- Patrón `_+X.` -> saliente E.164 vía Stasis.

Las extensiones WebRTC de agentes (`7001`–`7099`) se generan en `conf/pjsip_agents.conf` desde la API (`/settings/softphone/endpoints/export?format=pjsip`).

## Extensiones configuradas

### Extensiones WebRTC de agentes (7001–7099)

- Asignadas por usuario en CortexCC (`/settings/softphone` o bulk-assign).
- Exportadas a `conf/pjsip_agents.conf` con `sync-agent-endpoints.sh`.
- Transporte: `transport-wss`; parámetros WebRTC: `webrtc=yes`, `media_encryption=dtls`, `ice_support=yes`.
- Uso: widget softphone del frontend (SIP.js).

### Extension 6001 / 8001 (SIP UDP, laboratorio)

Extensiones fijas en `pjsip.conf` para pruebas con softphones SIP clásicos (Zoiper, etc.).

## Consideraciones de red y audio

### Direcciones externas SIP/RTP

En `pjsip.conf`, `transport-udp` define:

- `external_signaling_address`
- `external_media_address`

Deben apuntar a IP/FQDN realmente alcanzable por clientes externos a Docker. Si se deja localhost/loopback, se producen llamadas sin audio.

### From header y realm

En endpoints WebRTC exportados, `from_domain` coincide con `sip_realm` de la organización (IP o FQDN del PBX). El cliente SIP.js usa `sip:{extension}@{realm}`.

### Contactos WebRTC inestables

Para extension `7001`:

- `max_contacts=1`
- `remove_existing=yes`
- `remove_unavailable=yes`
- `qualify_frequency=0`

Solo debe haber **una pestaña/navegador registrado por extensión**. Si abres varias sesiones con la misma extensión, Asterisk puede llamar a un contacto viejo y la UI no mostrará la llamada en la pestaña visible.

Esto reduce flapping de registro en navegador.

## Configuracion de cliente softphone web

Valores derivados del host PBX (configurados en **Configuración → Telefonía**, persistidos en `organization_settings` y cargados en `/settings/softphone/me`):

- `server`: `wss://<host-asterisk>:8089/ws` (derivado de `pbx_host`)
- `realm`: IP o FQDN del PBX (igual que `pbx_host`)
- `extension` / `password`: asignados al usuario agente
- STUN recomendado: `stun:stun.l.google.com:19302`

En **localhost** puede usarse `wss://localhost:8089/ws` y `realm=localhost`. En **LAN por IP**, usa la IP real en ambos campos (ver sección [Pruebas en LAN](#pruebas-en-lan-desarrollo)).

## Configuracion recomendada Zoiper (8001)

- User / username: `8001`
- Password: `8001pass`
- Domain / host: IP o FQDN del host con Asterisk
- Transport: `UDP`
- Port: `5060`
- Auth username: `8001`
- Outbound proxy: vacio (solo si tu red lo requiere)

Prueba basica:

1. Registrar `8001` en Zoiper.
2. Llamar `6001` y `7001`.
3. Contestar desde destino y validar audio bidireccional.
4. Llamar `1000` para validar entrada a IA.

## Integracion con backend CortexCC

- El frontend reporta estados de llamada en `POST /api/voice/calls/logs`.
- El backend guarda historial en tabla `voice_calls`.
- Este historial es independiente de conversaciones omnicanal.

## Checklist de troubleshooting

1. Verificar extensiones registradas (`docker exec asterisk asterisk -rx "pjsip show endpoints"`).
2. Confirmar que INVITE llega al destino (`docker logs asterisk` o `pjsip set logger on`).
3. Validar IP anunciada en SDP (no debe ser loopback interna incorrecta).
4. Confirmar rango RTP abierto en firewall/security group.
5. Revisar certificados TLS si falla WSS (aceptar cert en `https://<host>:8089`).
6. **Marcar y no pasa nada:** comprobar que la URL del frontend es **HTTPS** (no `http://192.168.x.x`); sin contexto seguro el micrófono queda bloqueado y no se envía INVITE.
7. **Dominio no configurado en LAN:** registrar IP en `tenants.custom_domain` y alinear `CORS_ORIGIN`.
8. Probar llamada cruzada entre dos extensiones WebRTC (`7001` ↔ `7002`).
