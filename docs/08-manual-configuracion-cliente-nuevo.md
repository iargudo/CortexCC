# Manual de configuración — Cliente nuevo (desde cero)

Guía paso a paso para desplegar y dejar operativo **CortexCC** (contact center omnicanal) en un entorno nuevo. Orientada al **equipo de TI / implementación**.

> **Manual funcional para el administrador de la operación (sin tecnicismos):** [09-manual-administrador.md](./09-manual-administrador.md)

> Documentos relacionados: [07-despliegue-operacion.md](./07-despliegue-operacion.md), [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md), [04-frontend-modulos-flujos.md](./04-frontend-modulos-flujos.md).

---

## 1. Visión general

CortexCC es **multi-tenant database-per-tenant**: un despliegue de backend y frontend atiende varias empresas; cada empresa tiene su propia base PostgreSQL. Una base **Master** registra tenants, dominios y credenciales.

| Componente | Función | Puerto fijo |
|---|---|---|
| **PostgreSQL Master** | Registro de tenants (`cortexcc_master`) | 5432 |
| **PostgreSQL tenant** | Una BD por empresa (esquema de negocio) | 5432 |
| **Redis** | Colas BullMQ + tiempo real | 6379 |
| **Backend** | API REST + Socket.IO + workers | **3037** |
| **Frontend** | SPA React único; N dominios en prod | **8087** |
| **Asterisk** (opcional pero recomendado) | Telefonía SIP/WebRTC | SIP 5060, WSS 8089, ARI público 8074* |

\* El puerto ARI público se configura con `ASTERISK_ARI_PUBLIC_PORT` en `deploy/asterisk/.env` (por defecto `8074`, mapeado al `8088` interno del contenedor).

```mermaid
flowchart LR
  subgraph urls [URLs clientes]
    U1[cliente-a.app.com]
    U2[ventas.clienteb.com]
  end
  subgraph clientes [Canales]
    WA[WhatsApp]
    EM[Email]
    VO[Voz SIP]
  end
  subgraph cortex [Un despliegue CortexCC]
    FE[Frontend :8087]
    BE[Backend :3037]
    Master[(Master DB)]
    T1[(BD tenant A)]
    T2[(BD tenant B)]
    RD[(Redis)]
  end
  subgraph pbx [Asterisk]
    AST[PBX Docker]
  end
  U1 --> FE
  U2 --> FE
  FE -->|X-Tenant-Key| BE
  WA --> BE
  EM --> BE
  VO --> AST
  AST --> BE
  BE --> Master
  BE --> T1
  BE --> T2
  BE --> RD
```

---

## 2. Requisitos previos

### Software

- **Node.js 20+** y npm
- **PostgreSQL 15+**
- **Redis 7+**
- **Docker** (solo para Asterisk)
- **Git**

### Infraestructura mínima recomendada (producción)

- **App**: 2 vCPU, 4 GB RAM (backend + frontend)
- **PBX Asterisk**: VM separada, 2 vCPU, 4 GB RAM, IP pública estática
- **Base de datos**: PostgreSQL gestionado (RDS, Azure Database, etc.)
- **Redis**: instancia dedicada (Azure Cache, ElastiCache, etc.)

### Puertos a abrir en firewall

| Puerto | Protocolo | Uso |
|---|---|---|
| 3037 | TCP | API backend |
| 8087 | TCP | Frontend |
| 5060 | UDP | SIP |
| 8089 | TCP | WebRTC (WSS) |
| 8074 | TCP | ARI (restringir a IP del backend) |
| 10000–10100 | UDP | RTP (audio) |

---

## 3. Fase 1 — Bases de datos y Redis

### 3.1 Crear bases PostgreSQL

**Master** (registro de tenants):

```sql
CREATE USER cortexcontact WITH PASSWORD 'tu_password_seguro';
CREATE DATABASE cortexcc_master OWNER cortexcontact;
```

**BD del primer tenant** (datos de negocio de la empresa):

```sql
CREATE DATABASE cortexcontact OWNER cortexcontact;
-- o un nombre por cliente: cortexcontact_clientea
```

Cada tenant adicional requiere su propia BD vacía antes de migrar.

### 3.2 Verificar Redis

Redis debe estar accesible. Ejemplo local:

```
redis://localhost:6379/2
```

El sufijo `/2` es el número de base de datos lógica de Redis.

---

## 4. Fase 2 — Backend

### 4.1 Clonar e instalar

```bash
cd backend
cp .env.example .env
npm install
```

### 4.2 Configurar `backend/.env`

Variables **obligatorias** para un cliente nuevo:

| Variable | Qué poner |
|---|---|
| `MASTER_DATABASE_URL` | `postgresql://USER:PASS@HOST:5432/cortexcc_master` |
| `DATABASE_URL` | BD del tenant local (scripts): `postgresql://USER:PASS@HOST:5432/cortexcontact` |
| `REDIS_URL` | URL de Redis (ej. `redis://host:6379/2`) |
| `JWT_SECRET` | Mínimo 32 caracteres (generar aleatorio) |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | TTL access y refresh (ej. `15m`, `30d`) |
| `CORS_ORIGIN` | URL del frontend (ej. `http://IP:8087`) |
| `SOCKETIO_CORS_ORIGIN` | Igual que `CORS_ORIGIN` |
| `INTEGRATION_API_KEY` | Clave para sistemas externos (`x-api-key`) |
| `ENABLE_JOBS` | `true` (workers de routing, email, outbound) |

### 4.3 Bootstrap multi-tenant y migraciones

**Primera instalación (tenant local de desarrollo):**

```bash
npm run prisma:generate
SEED_LOCAL_TENANT=true npm run setup:master   # crea Master + registra tenant local
npm run migrate:tenant                         # esquema en BD del tenant
npm run seed:tenant                            # opcional: datos demo
```

**Tenant adicional (producción o staging):**

Panel de plataforma: `{frontend}/platform/tenants` → «Nuevo tenant» (crea BD, migra esquema, admin y registro en Master).

O API autenticada: `POST /api/platform/tenants` con body JSON (`key`, `name`, `admin_email`, `admin_password`, etc.).

**Alternativa manual** (solo si no puedes usar el panel):

```bash
# 1. Crear BD vacía en PostgreSQL
# 2. Migrar
TENANT_DB_HOST=HOST TENANT_DB_USER=USER TENANT_DB_PASSWORD=PASS TENANT_DB_NAME=cortexcontact_clientea \
  npm run migrate:tenant
# 3. Seed opcional
TENANT_DB_*=... npm run seed:tenant
# 4. INSERT en Master (ver SQL abajo)
```

```sql
INSERT INTO tenants (id, tenant_key, display_name, subdomain, database_host, database_port,
  database_user, database_password, database_name, is_active)
VALUES (
  gen_random_uuid()::text, 'cliente-a', 'Cliente A S.A.', 'cliente-a',
  'HOST', 5432, 'USER', 'PASS', 'cortexcontact_clientea', true
);
```

**Datos iniciales del tenant:**

- **Producción:** admin email/password en el formulario del panel `/platform`, o crear admin vía SQL tras migrate.
- **Demo/staging:** activar «Seed demo» en el panel, o `npm run seed:tenant` manual.

Usuarios del seed (cambiar contraseñas en producción):

| Email | Rol | Contraseña |
|---|---|---|
| `admin@cortex.local` | admin | `demo1234` |
| `supervisor@cortex.local` | supervisor | `demo1234` |
| `agent@cortex.local` | agente | `demo1234` |

### 4.4 Arrancar

```bash
npm run dev          # desarrollo
# o en producción:
npm run build && npm start
```

Si `ENABLE_JOBS=false`, levantar el worker aparte:

```bash
npm run worker
```

### 4.5 Validar

```bash
curl http://localhost:3037/api/health
curl "http://localhost:3037/api/tenants/resolve?host=cliente-a.tuplataforma.com"
curl -X POST http://localhost:3037/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Key: local" \
  -d '{"email":"admin@cortex.local","password":"demo1234"}'
```

- `/health` → `ok: true`
- `/tenants/resolve` → `{ key, name }` (sin header)
- Login sin `X-Tenant-Key` → 400

---

## 5. Fase 3 — Frontend

### 5.1 Configurar

```bash
cd frontend
cp .env.example .env
npm install
```

Editar `frontend/.env`:

**Desarrollo en la misma máquina (`localhost`):**

```env
VITE_API_URL=http://localhost:3037/api
VITE_WS_URL=http://localhost:3037
VITE_SOCKET_PATH=/socket.io
VITE_TENANT_KEY=local
VITE_TENANT_NAME=Desarrollo Local
```

**Desarrollo en LAN (acceso por IP desde otras PCs):**

```bash
./scripts/set-lan-ip.sh    # desde la raíz del repo; ver docs/05-telefonia-asterisk-softphone.md
```

Equivalente manual en `frontend/.env` + `backend/.env` + BD + Asterisk (HTTPS obligatorio para softphone):

```env
VITE_API_URL=https://<IP-LAN>:8087/api
VITE_WS_URL=https://<IP-LAN>:8087
VITE_SOCKET_PATH=/socket.io
```

Además: registrar `<IP-LAN>` en `tenants.custom_domain` (Master). Guía completa: [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md#pruebas-en-lan-desarrollo).

**Producción** (build o preview con dominio propio):

```env
VITE_API_URL=https://<dominio-backend>/api
VITE_WS_URL=https://<dominio-backend>
VITE_SOCKET_PATH=/socket.io
```

**Producción:** no definir `VITE_TENANT_KEY`. Cada cliente accede por su URL (`cliente-a.tuplataforma.com` o dominio custom); el frontend resuelve el tenant por hostname. Un solo build/despliegue sirve a todos los dominios (DNS → mismo origin).

### 5.2 Arrancar

```bash
npm run dev          # desarrollo (puerto 8087)
# o producción:
npm run build && npm run preview
```

### 5.3 Validar

1. Abrir la URL del frontend (`http://localhost:8087` en la misma máquina, o `https://<IP-LAN>:8087` en LAN)
2. Login con el usuario admin
3. Confirmar que no hay errores CORS en la consola del navegador

---

## 6. Fase 4 — Asterisk (telefonía)

Asterisk va en un host **separado** del backend (recomendado en producción). Ver también [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md).

### 6.1 Levantar PBX

```bash
cd deploy/asterisk
cp .env.example .env
```

Editar `deploy/asterisk/.env`:

```env
ASTERISK_SIP_PORT=5060
ASTERISK_RTP_START=10000
ASTERISK_RTP_END=10100
ASTERISK_ARI_PUBLIC_PORT=8074
ASTERISK_WSS_PORT=8089
TRUNK_HOST=sip.tu-carrier.com    # si hay trunk saliente
TRUNK_USER=
TRUNK_PASS=
```

### 6.2 Certificado TLS para WebRTC

```bash
cd deploy/asterisk/keys
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout asterisk.key \
  -out asterisk.pem \
  -days 365 \
  -subj "/CN=pbx.tuempresa.com"
```

En producción usa un certificado válido (Let's Encrypt) con el FQDN del PBX.

### 6.3 Ajustar red en `conf/pjsip.conf`

Cambiar estas direcciones por la **IP pública o FQDN real** del servidor Asterisk:

- `external_signaling_address`
- `external_media_address`
- `media_address`
- `local_net`

Si quedan en `localhost`, las llamadas conectan pero **no hay audio**.

### 6.4 Levantar contenedor

```bash
docker compose -f docker-compose.asterisk.yml --env-file .env up -d
```

### 6.5 Credenciales ARI (para el canal VOICE)

En `deploy/asterisk/conf/ari.conf`:

- Usuario: `cortexcc`
- Password: `Admin123!` (cambiar en producción)
- App Stasis: `cortexcc`

---

## 7. Fase 5 — Despliegue en cloud (elegir una opción)

### Opción A — Azure App Service + ACR

```bash
cp deploy/azure/config/cortexcc.stg.example deploy/azure/config/cortexcc.stg
cp deploy/azure/config/asterisk.stg.example deploy/azure/config/asterisk.stg
./deploy/azure/cortexcc/deploy-cortexcc.sh stg
```

**Produccion:**

```bash
cp deploy/azure/config/cortexcc.prd.example deploy/azure/config/cortexcc.prd
cp deploy/azure/config/asterisk.prd.example deploy/azure/config/asterisk.prd
./deploy/azure/cortexcc/deploy-cortexcc.sh prd
```

El script:

- Crea Redis (si `MANAGE_REDIS=true`)
- Construye imágenes Docker de backend y frontend
- Despliega en App Service (puertos 3037 y 8087)
- Habilita WebSockets para Socket.IO

Asterisk en Azure: ver `deploy/azure/asterisk/README.md` (VM dedicada).

---

## 8. Fase 6 — Configuración en la UI (administrador)

Iniciar sesión como **admin** y seguir este orden.

### 8.1 Configuración general (`/settings/general`)

| Pestaña | Qué configurar |
|---|---|
| **Disposiciones** | Motivos de cierre (ej. "Resuelto", "Seguimiento", "No contactado") |
| **SLA** | Tiempos de primera respuesta y resolución por política |
| **Respuestas rápidas** | Shortcodes (`/saludo`, `/horarios`, etc.) |
| **Horarios** | Zona horaria y calendario semanal de operación |

También vía API `PUT /api/settings/general` (empresa, timezone, idioma) o **`PUT /api/settings/telephony`** (recomendado para voz):

- `pbx_host` — IP o FQDN del Asterisk (fuente de verdad)
- `pbx_wss_port` — puerto WSS softphone (default `8089`)
- `pbx_ari_port` — puerto ARI backend (default `8074`)
- `sip_server` — derivado: `wss://{pbx_host}:{pbx_wss_port}/ws`
- `sip_realm` — derivado: igual que `pbx_host`
- `sip_extension_range_start` / `sip_extension_range_end` — rango de extensiones (ej. 7001–7099)

### 8.2 Equipos (`/settings/teams`)

1. Crear equipos operativos (ej. "Soporte", "Ventas", "Cobranza")
2. Asignar líder y miembros

### 8.3 Skills (`/settings/skills`)

1. Crear habilidades (ej. `ventas`, `cobranza`, `soporte_tecnico`, `ingles`)
2. Categorizar: tema, idioma, técnico

### 8.4 Colas (`/settings/queues`)

Por cada cola de atención:

| Campo | Valor típico |
|---|---|
| Nombre | "General", "Ventas", "Soporte" |
| Equipo | Equipo responsable |
| Estrategia | `LEAST_BUSY`, `ROUND_ROBIN`, `SKILL_BASED`, etc. |
| Max wait | Segundos máximos en cola (ej. 300) |
| Canales vinculados | WhatsApp, Voz, Email, etc. |
| Skills requeridos | Si usas `SKILL_BASED` |

### 8.5 Usuarios y roles

1. **Roles** (`/settings/roles`): revisar permisos de `admin`, `supervisor`, `agent`
2. **Usuarios**: crear cuentas reales del cliente
3. Asignar rol, equipo y skills a cada agente

### 8.6 Canales (`/settings/channels`)

Crear y configurar cada canal que el cliente usará.

#### WhatsApp

Proveedores soportados: **UltraMsg**, **Twilio**, **360dialog**.

1. Crear canal tipo `WHATSAPP`
2. Completar credenciales del proveedor
3. Pulsar **Probar configuración**
4. Configurar webhook en el proveedor apuntando a (el `tenantKey` aparece al copiar desde Configuración → Canales):

```
POST https://<tu-api>/api/webhooks/<tenantKey>/whatsapp/<channelId>
```

Ejemplo: `POST https://api.tuplataforma.com/api/webhooks/cliente-a/whatsapp/uuid-del-canal`

5. Vincular el canal a una o más colas

#### Email

1. Crear canal tipo `EMAIL`
2. Configurar **SMTP** (envío) e **IMAP** (recepción/polling)
3. Definir `fromEmail`, `fromName`
4. Ajustar `pollIntervalSec` (intervalo de lectura IMAP)
5. Probar y activar

#### Voz

1. Ir a **Configuración → Telefonía** (`/settings/telephony`)
2. Definir **host PBX** (IP o FQDN) y puertos WSS/ARI
3. Configurar credenciales ARI (deben coincidir con `ari.conf`):

| Campo | Ejemplo |
|---|---|
| Host PBX | `pbx.tuempresa.com` |
| Puerto ARI | `8074` → deriva `ariBaseUrl` |
| `ariApp` | `cortexcc` |
| `ariUsername` | `cortexcc` |
| `ariPassword` | (password de `ari.conf`) |
| `outboundTrunkEndpoint` | `PJSIP/carrier-trunk` |
| `defaultCallerId` | Número o nombre del cliente |

4. Probar conexión ARI desde la misma pantalla
5. Confirmar que existe canal `VOICE` activo (se crea en **Configuración → Canales** si no existe)
6. Vincular canal de voz a cola de atención

#### Webchat / Teams

- **Webchat**: configurar widget, colores y mensaje de bienvenida
- **Teams**: Tenant ID, Client ID y credenciales OAuth

---

## 9. Fase 7 — Softphone (extensiones de agentes)

### 9.1 Asignar extensiones en CortexCC

Por cada agente que usará telefonía:

1. En administración de usuarios, asignar extensión SIP (rango 7001–7099)
2. O asignación masiva vía API:

```
POST /api/settings/users/softphone/bulk-assign
{ "userIds": ["uuid1", "uuid2"] }
```

### 9.2 Exportar endpoints a Asterisk

```bash
curl -H "Authorization: Bearer $TOKEN_ADMIN" \
  "https://<api>/api/settings/softphone/endpoints/export?format=pjsip" \
  > deploy/asterisk/conf/pjsip_agents.conf
```

O con el script:

```bash
./deploy/asterisk/scripts/generate-agent-endpoints.sh endpoints.json
```

Reiniciar Asterisk tras actualizar `pjsip_agents.conf`.

### 9.3 Agente en el navegador

1. El agente inicia sesión
2. El widget de softphone (cabecera) se registra automáticamente con su extensión
3. Si el certificado es self-signed: abrir `https://pbx:8089/ws` y aceptar el certificado
4. Probar llamada interna entre dos agentes

---

## 10. Fase 8 — Integraciones externas

### 10.1 Escalamiento desde bots/IVR/CRM

Configurar en el sistema externo:

```
POST https://<api>/api/integrations/escalate
Header: X-Tenant-Key: <tenant_key>
Header: x-api-key: <INTEGRATION_API_KEY>
Header: x-api-key: <INTEGRATION_API_KEY>
Header: X-Tenant-Key: <tenant_key>
```

Body mínimo:

```json
{
  "source_system": "agenthub",
  "channel_type": "WHATSAPP",
  "contact": { "phone": "+5939XXXXXXXX", "name": "Cliente" },
  "escalation_reason": "Cliente solicita agente humano",
  "preferred_queue": "General"
}
```

### 10.2 Apps embebidas (`/settings/integrations`)

Configurar apps externas (CRM, ERP) con:

- Modo: `SNAPSHOT`, `EMBED` o `ACTIONS`
- Auth: `API_KEY`, `JWT`, `OAUTH2`
- Bindings por canal, cola o rol

### 10.3 CortexAgentHub (si aplica)

La URL de este API **no** va en `backend/.env` de Cortex CC. Configúrala en el proyecto **CortexAgentHub** (variable `CORTEX_CC_API_BASE_URL`, ej. `https://api.tuempresa.com`) y usa en Cortex CC la misma `INTEGRATION_API_KEY` en el endpoint de escalamiento (`x-api-key`).

La zona horaria de negocio se define por tenant en la BD (`queues.timezone`, etc.), no con una variable de entorno global.

---

## 11. Checklist de validación final

### Infraestructura

- [ ] `GET /api/health` → `ok: true`
- [ ] `GET /api/tenants/resolve?host=<dominio-cliente>` → `{ key, name }`
- [ ] Peticiones sin `X-Tenant-Key` → 400
- [ ] Login y refresh token funcionan (con `X-Tenant-Key`)
- [ ] Socket.IO conecta (sin errores en consola del navegador)
- [ ] Redis activo (`ENABLE_JOBS=true` o worker separado)

### Operación básica

- [ ] Admin accede a todos los módulos de Settings
- [ ] Agente ve Inbox y puede cambiar estado (ONLINE/BUSY/AWAY)
- [ ] Cola asigna conversaciones automáticamente
- [ ] Supervisor ve Live Board y colas en vivo

### Canales

- [ ] WhatsApp: mensaje entrante crea conversación en Inbox
- [ ] Email: correo entrante aparece como hilo
- [ ] Respuesta saliente se entrega al contacto

### Voz

- [ ] Agente registrado en softphone (indicador verde)
- [ ] Llamada interna con audio bidireccional
- [ ] Llamada entrante abre widget automáticamente
- [ ] Historial en `voice_calls`

### Seguridad (producción)

- [ ] Cambiar contraseñas del seed
- [ ] Rotar `JWT_SECRET`, `INTEGRATION_API_KEY`
- [ ] Cambiar password ARI de Asterisk
- [ ] Certificado TLS válido en WSS (no self-signed)
- [ ] Restringir puerto ARI (8074 por defecto) solo a IP del backend
- [ ] No commitear archivos `.env`

---

## 12. Alta de un tenant adicional (producción)

Cuando agregas una **nueva empresa** a una plataforma ya desplegada, usa el **panel de plataforma** en `{frontend}/platform/tenants`.

### Opción A — Panel / API (recomendado)

1. Login en `/platform/login` con usuario platform admin.
2. «Nuevo tenant»: key, nombre, subdominio/dominio, admin del tenant (o seed demo en staging).
3. El backend crea la BD, aplica migraciones y registra en Master.

API equivalente: `POST /api/platform/tenants` (Bearer token de platform admin).

### Opción B — Pasos manuales

| Paso | Acción |
|---|---|
| 1 | Crear BD vacía en PostgreSQL |
| 2 | `TENANT_DB_*=... npm run migrate:tenant` |
| 3 | `npm run seed:tenant` (opcional) o crear admin en backoffice |
| 4 | INSERT en Master (`tenants`) con `subdomain` y/o `custom_domain` + credenciales BD |
| 5 | DNS: apuntar hostname del cliente al despliegue frontend existente |
| 6 | Verificar login vía URL del cliente |

### Después del alta

| Paso | Acción |
|---|---|
| 1 | DNS al frontend compartido |
| 2 | `curl "<API>/tenants/resolve?host=<dominio-cliente>"` → `{ key, name }` |
| 3 | Login del admin en la URL del cliente |
| 4 | Configuración en Settings (equipos, colas, canales, voz) — secciones 6–10 de este manual |

**Importante:** migrar la BD del tenant **antes** de registrarlo en Master (el panel/API lo garantiza). En cada release con cambio de esquema: `npm run migrate:all-tenants` antes del deploy.

---

## 13. Orden recomendado (resumen ejecutivo)

```
1. PostgreSQL Master + BD tenant + Redis
2. Backend (.env → setup:master → migrate:tenant → health)
3. Frontend (.env + VITE_TENANT_KEY en dev → login admin)
4. Settings: general → equipos → skills → colas → usuarios
5. Canales (WhatsApp/Email/Voz según necesidad)
6. Asterisk + extensiones de agentes
7. Integraciones externas
8. Prueba end-to-end con agente real
```

---

## 14. Troubleshooting rápido

| Problema | Causa probable | Solución |
|---|---|---|
| CORS en login | `CORS_ORIGIN` incorrecto | Igualar al URL exacto del frontend (incl. `https://` en LAN) |
| Sin asignaciones | Redis caído o `ENABLE_JOBS=false` | Verificar Redis y workers |
| Softphone no registra | Certificado WSS o credenciales | Aceptar cert en `https://<host>:8089` / revisar extensión |
| Softphone conecta pero no llama | Frontend en HTTP por IP LAN | Usar `https://<IP-LAN>:8087`; el micrófono requiere contexto seguro |
| Llamada sin audio | IPs en `pjsip.conf` | Poner IP LAN real + abrir RTP 10000–10100 |
| WhatsApp no entra | Webhook mal configurado | URL: `/webhooks/<tenantKey>/whatsapp/<channelId>` |
| Login 400 | Falta tenant | En dev localhost: `VITE_TENANT_KEY`; en LAN/prod: `custom_domain` + DNS |
| IP LAN cambió / varios sitios desalineados | `.env`, BD, Asterisk con IPs distintas | `./scripts/set-lan-ip.sh` y reiniciar backend + frontend |
| Dominio no configurado | Host no en Master | `./scripts/set-lan-ip.sh` o editar tenant en `/platform/tenants` |
| Alta de tenant falla a mitad | BD creada pero no en Master | Corregir error y reintentar desde panel (o borrar BD huérfana y crear de nuevo) |
| ARI desconectado | Firewall o credenciales | Abrir 8074, revisar `ari.conf` |

---

## Referencias en el repositorio

- Despliegue técnico: [07-despliegue-operacion.md](./07-despliegue-operacion.md)
- Telefonía: [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md)
- Azure + Asterisk: `deploy/azure/asterisk/README.md`
- Multi-tenant: [ESTANDAR_ARQUITECTURA_MULTITENANT.md](./ESTANDAR_ARQUITECTURA_MULTITENANT.md)
- Alta de tenant: panel `/platform/tenants`
- Funcional: [01-vision-funcional.md](./01-vision-funcional.md), [DOCUMENTACION_FUNCIONAL.md](./DOCUMENTACION_FUNCIONAL.md)
