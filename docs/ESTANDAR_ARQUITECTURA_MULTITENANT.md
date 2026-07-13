# Guía de desarrollo multi-tenant (para implementación con IA)

**Audiencia:** Agentes de IA y desarrolladores que implementan multi-tenant por primera vez.  
**Referencia completa:** `docs/ESTANDAR_ARQUITECTURA_MULTITENANT.md`  
**Implementación de ejemplo (NestJS + TypeORM + SQL Server):** `backend/src/infrastructure/multitenancy/`

> Esta guía es **agnóstica a ORM y motor de base de datos**. Los ejemplos de código usan pseudocódigo o TypeScript genérico. Adapta nombres y APIs a tu stack (TypeORM, Prisma, Hibernate, EF Core, SQLAlchemy, etc.) y a tu BD (PostgreSQL, MySQL, SQL Server, etc.).

---

## 1. Qué debes construir (resumen)

El sistema da servicio a **varias empresas** con **un solo backend, un solo frontend y un solo despliegue de frontend**.

- Cada empresa (tenant) = **1 base de datos propia** (datos totalmente separados).
- Una base **Master** guarda el registro de empresas, credenciales de conexión y dominios.
- Cada petición HTTP lleva el header **`X-Tenant-Key`**.
- **No uses columna `TenantId`** en tablas de negocio. El aislamiento es por base de datos.
- **No hay selector de empresa en el login.** El tenant se resuelve automáticamente:
  - **Producción:** por `window.location.hostname`.
  - **Desarrollo:** por variables de entorno (`VITE_TENANT_KEY` / equivalente).

```
Producción:
  https://cliente-a.tuplataforma.com/login
       → resolve(host) → tenantKey "cliente-a"
       → login solo user/password
       → X-Tenant-Key: cliente-a en cada request

Desarrollo:
  http://localhost:5173/login
       → TENANT_KEY=local (variable de entorno)
       → login solo user/password
       → X-Tenant-Key: local en cada request
```

Un único frontend atiende todos los dominios. Cada cliente entra por **su URL** y no ve que otros existen.

---

## 2. Reglas que no puedes violar

| # | Regla |
|---|-------|
| 1 | Toda petición HTTP lleva `X-Tenant-Key`, **excepto** `GET /api/tenants/resolve` |
| 2 | Sin header → `400 Bad Request` |
| 3 | Login y refresh **también** requieren `X-Tenant-Key` |
| 4 | El JWT incluye `tenantKey` y debe coincidir con el header en cada request |
| 5 | La capa de persistencia **nunca** recibe el tenant como parámetro; usa el contexto de la petición |
| 6 | **No** agregar `TenantId` a tablas de negocio |
| 7 | El frontend resuelve el tenant **antes** del login y lo envía en **todas** las llamadas API |
| 8 | **No** mostrar listado ni selector de empresas en el login |
| 9 | **No** exponer listado público de todos los tenants en producción |
| 10 | Un solo frontend; N dominios apuntan al mismo despliegue |
| 11 | **Cada cambio de esquema se migra en todas las BDs tenant** registradas en Master (`IsActive = 1`) |
| 12 | La base Master **no** recibe migraciones de negocio; solo su propia tabla de registro |

---

## 3. Resolución de tenant (frontend)

### 3.1 Producción — por hostname

Al cargar la app (antes del login):

```
GET /api/tenants/resolve?host=<window.location.hostname>
→ { key: "cliente-a", name: "Cliente A S.A." }
→ guardar en almacenamiento local (localStorage o equivalente)
```

| URL de entrada | Campo en Master | tenantKey |
|----------------|-----------------|-----------|
| `cliente-a.tuplataforma.com` | `subdomain = 'cliente-a'` | `cliente-a` |
| `ventas.clientec.com` | `custom_domain = 'ventas.clientec.com'` | `clientec` |

Todos los dominios apuntan al **mismo** despliegue frontend.

Si `resolve` retorna 404 → pantalla de error ("Dominio no configurado").

### 3.2 Desarrollo — variables de entorno

En el archivo de entorno local del frontend:

```env
VITE_TENANT_KEY=local
VITE_TENANT_NAME=Desarrollo Local
```

Lógica al arrancar:

```
si hostname es localhost o 127.0.0.1:
    tenantKey = env.TENANT_KEY        # obligatorio
    tenantName = env.TENANT_NAME ?? tenantKey
    guardar en tenantStorage
si no:
    tenant = api.resolve(hostname)
    guardar en tenantStorage
```

Para probar otro tenant en local: cambia `TENANT_KEY` y reinicia el servidor de desarrollo.

**Acceso por IP LAN** (otra máquina en la red): ejecutar `./scripts/set-lan-ip.sh` desde la raíz del repo (actualiza `custom_domain`, `.env`, softphone y Asterisk). No usar `VITE_TENANT_KEY`. El softphone WebRTC requiere **HTTPS** (`https://<IP>:8087` en dev). Ver `docs/05-telefonia-asterisk-softphone.md`.

### 3.3 Login — solo credenciales

El formulario tiene **solo dos campos**: usuario y contraseña.

El tenant ya está en `tenantStorage`. El cliente HTTP añade `X-Tenant-Key` en cada petición.

---

## 4. Backend — componentes obligatorios

Independientemente del ORM o lenguaje, implementa estas piezas:

### 4.1 Tabla `Tenants` (solo en base Master)

| Columna | Tipo lógico | Descripción |
|---------|-------------|-------------|
| `tenant_key` | string, unique | Identificador interno (ej. `cliente-a`) |
| `display_name` | string | Nombre visible |
| `subdomain` | string, nullable, unique | ej. `cliente-a` → `cliente-a.tuplataforma.com` |
| `custom_domain` | string, nullable, unique | ej. `ventas.clientec.com` |
| `database_host` | string | Host de la BD del tenant |
| `database_port` | int | Puerto |
| `database_user` | string | Usuario |
| `database_password` | string | Contraseña (cifrar at-rest en prod) |
| `database_name` | string | Nombre de la BD del tenant |
| `is_active` | boolean | `false` = tenant deshabilitado |

Reglas:
- `subdomain` y/o `custom_domain` únicos entre tenants activos.
- Al menos uno de los dos campos de dominio debe existir para acceso web.
- La fila completa es el mapa **dominio → tenantKey → conexión BD**.

### 4.2 Modelo de registro (`Tenant`)

Entidad/modelo ORM mapeado a la tabla anterior. Accesible **solo** desde la conexión Master.

### 4.3 Contexto de tenant por petición

Mecanismo de contexto acotado a la petición:

| Runtime | Mecanismo |
|---------|-----------|
| Node.js | `AsyncLocalStorage` |
| Java / Spring | `ThreadLocal` o scope de request |
| .NET | `AsyncLocal<T>` o `HttpContext.Items` |
| Python | `contextvars.ContextVar` |
| Go | `context.Context` |

API mínima: `getCurrentTenantKey()` → string.

### 4.4 Connection Manager

Responsabilidades (independientes del ORM):

```
ensureConnection(tenantKey):
  1. Si ya hay pool/sesión activa → reutilizar
  2. SELECT en Master WHERE tenant_key = ? AND is_active = true
  3. Abrir pool/conexión con database_host, database_user, database_name...
  4. Cachear config y conexión en memoria

getConnection()           → conexión del tenant del contexto actual
getRepository / getDb()   → acceso a datos sobre esa conexión
getTenantInfo(key)        → { key, name }
resolveByHost(host)       → { key, name } | null
```

Lógica de `resolveByHost(host)`:
1. Buscar por `custom_domain = host` (match exacto).
2. Si no, extraer subdominio y buscar por `subdomain`.
3. Solo tenants con `is_active = true`.

### 4.5 Middleware de tenant

Ejecutar **antes** de autenticación y controladores:

```
si GET /tenants/resolve:
    continuar sin exigir header

si no hay header X-Tenant-Key:
    responder 400

ensureConnection(header)
establecer contexto de tenant
continuar
```

### 4.6 Controlador de tenants

| Método | Ruta | Header | Respuesta |
|--------|------|--------|-----------|
| GET | `/tenants/resolve?host=` | No | `{ key, name }` o 404 |
| GET | `/tenants/current` | Sí | `{ key, name }` o null |

**No implementar** listado público de todos los tenants.

### 4.7 Dos conexiones a base de datos

| Conexión | Cuándo | Qué accede |
|----------|--------|------------|
| **Master (fija)** | Al arrancar la app | Solo tabla `Tenants` |
| **Tenant (dinámica)** | Por petición, según `X-Tenant-Key` | Esquema completo de negocio |

En runtime: **`synchronize` / auto-DDL desactivado**. El esquema se gestiona con migraciones (sección 10).

### 4.8 Capa de persistencia

Los repositorios/DAOs obtienen la conexión del Connection Manager, **no** de la conexión default de la app:

```
class CustomersRepository:
  get db():
    return connectionManager.getConnection().for(Customer)
```

El código de negocio **no menciona tenants**.

### 4.9 Autenticación

**Login:** middleware ya conectó a la BD del header → validar credenciales en **esa** BD → JWT con `tenantKey` → respuesta incluye `tenantKey` y `tenantName`.

**Peticiones autenticadas:** validar que `jwt.tenantKey === header X-Tenant-Key`.

---

## 5. Contrato API

### Headers

```
X-Tenant-Key: <tenant_key>
Authorization: Bearer <token>   ← rutas autenticadas
```

### Endpoints

```
GET  /api/tenants/resolve?host=...  → { key, name } | 404  (sin header)
GET  /api/tenants/current           → { key, name }         (con header)
POST /api/auth/login                → AuthResponse          (con header)
POST /api/auth/refresh              → tokens                (con header)
GET  /api/auth/me                   → perfil                (con ambos)
```

### Respuesta de login (campos multi-tenant obligatorios)

```json
{
  "employeeId": "...",
  "userName": "...",
  "roles": [],
  "permissions": [],
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 1800 },
  "tenantKey": "cliente-a",
  "tenantName": "Cliente A S.A."
}
```

### Payload JWT

```json
{
  "sub": "employee-id",
  "userName": "...",
  "roles": [],
  "permissions": [],
  "tenantKey": "cliente-a"
}
```

---

## 6. Frontend web

| Pieza | Responsabilidad |
|-------|-----------------|
| `tenantStorage` | Persistir `tenantKey` y `tenantName` (localStorage o equivalente) |
| `resolveTenant()` | Boot: env en localhost, `resolve(host)` en producción |
| Interceptor HTTP | Añadir `X-Tenant-Key` en **todas** las peticiones |
| Login | Solo usuario + contraseña |
| Topbar | Mostrar `tenantName`; logout limpia tenant + tokens |

Para cambiar de empresa el usuario entra por **otra URL** (otro dominio).

---

## 7. Infraestructura — un frontend, N dominios

```
cliente-a.app.com ──┐
cliente-b.app.com ──┼──► Frontend (1 despliegue) ──► Backend (1 despliegue)
ventas.clientec.com ┘                                      │
                                                           ▼
                                                    Motor de BD
                                                    ├── Master (Tenants)
                                                    ├── BD tenant A
                                                    └── BD tenant B
```

Alta de cliente nuevo:
1. Crear BD del tenant + aplicar esquema/migraciones + seeds.
2. Registrar fila en Master con dominio y credenciales.

En CortexCC, el paso 1–4 se automatiza desde el panel `/platform/tenants` o la API `/api/platform/tenants`.
2. Insertar fila en `Tenants` (dominio + credenciales).
3. Registrar hostname en el despliegue frontend + DNS.
4. **No** crear nuevo despliegue de frontend.

---

## 8. Variables de entorno

### Backend (runtime)

```env
MASTER_DATABASE_HOST=...
MASTER_DATABASE_PORT=...
MASTER_DATABASE_USER=...
MASTER_DATABASE_PASSWORD=...
MASTER_DATABASE_NAME=...        # base Master

JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
# PLATFORM_JWT_SECRET=...   # opcional; panel /platform
```

### Frontend — desarrollo

```env
API_URL=http://localhost:4083/api
TENANT_KEY=local                 # prefijo según bundler (ej. VITE_TENANT_KEY)
TENANT_NAME=Desarrollo Local
```

### Frontend — producción

Solo `API_URL`. El tenant se resuelve por hostname; **no** definir `TENANT_KEY`.

### Scripts CLI — un tenant concreto

Variables para apuntar migraciones/seeds a **una** BD tenant:

```env
TENANT_DB_HOST=...
TENANT_DB_PORT=...
TENANT_DB_USER=...
TENANT_DB_PASSWORD=...
TENANT_DB_NAME=...
```

### Scripts CLI — Master

```env
MASTER_DATABASE_HOST=...
MASTER_DATABASE_NAME=...
# usadas por setup-master y migrate-all-tenants
```

---

## 9. Esquema y migraciones (agnóstico a ORM)

### 9.1 Principio multi-tenant

| Base | ¿Recibe migraciones de negocio? |
|------|--------------------------------|
| **Master** | **No.** Solo script inicial de tabla `Tenants` |
| **Cada BD tenant** | **Sí.** Todas deben tener el **mismo esquema** |

Cada vez que añades o modificas el esquema (nueva tabla, columna, índice), ese cambio debe aplicarse en **cada BD tenant** listada en Master con `is_active = true`.

### 9.2 Herramienta de migraciones

Usa la herramienta estándar de tu stack. Ejemplos:

| Stack | Herramienta típica |
|-------|-------------------|
| Node + TypeORM | migraciones TypeORM (`MigrationInterface`) |
| Node + Prisma | `prisma migrate` |
| Java + Spring | Flyway o Liquibase |
| .NET | EF Core Migrations |
| Python | Alembic |
| Ruby | ActiveRecord migrations |
| Go | golang-migrate, goose |

La guía **no** prescribe cuál usar. Lo importante es el **patrón de ejecución**.

### 9.3 Reglas de migración

| # | Regla |
|---|-------|
| 1 | En runtime: **auto-sync / synchronize desactivado** |
| 2 | Los cambios de esquema son **scripts versionados** (up/down o equivalente) |
| 3 | Cada BD tenant mantiene su propia tabla de control (`migrations`, `flyway_schema_history`, `_prisma_migrations`, etc.) |
| 4 | Tras un release con cambios de esquema: ejecutar migraciones en **todos** los tenants activos |
| 5 | Alta de tenant nuevo: crear BD vacía → aplicar **todo** el historial de migraciones → seeds → registrar en Master |
| 6 | Desplegar código nuevo **sin** migrar deja tenants con esquema desactualizado → errores en runtime |

### 9.4 Scripts que debes implementar

Cuatro scripts CLI en CortexCC (tres de migración + uno de alta):

#### A) `setup-master`

- Crea la base Master (si no existe).
- Crea la tabla `Tenants`.
- Opcionalmente inserta el primer tenant.
- **No** usa el sistema de migraciones de negocio.

#### B) `migrate-tenant`

- Conecta a **una** BD tenant (variables `TENANT_DB_*`).
- Ejecuta migraciones pendientes con la herramienta de tu ORM.
- Idempotente: solo aplica lo que falta según la tabla de control.

#### C) `migrate-all-tenants`

- Conecta a la **Master**.
- `SELECT tenant_key, database_host, database_port, database_user, database_password, database_name FROM Tenants WHERE is_active = true`
- Por **cada fila**: invoca `migrate-tenant` con esas credenciales.
- Si **uno falla**: reportar cuál y salir con error (no silenciar).

#### D) Alta de tenant (CortexCC)

- Orquesta el **alta completa** de un tenant nuevo (panel `/platform`, API o bootstrap de deploy).
- Valida `tenant_key`, `subdomain` y `custom_domain` contra conflictos en Master.
- `CREATE DATABASE` (salvo BD ya existente).
- Invoca `migrate-tenant` en la BD nueva.
- Opcional: seed demo o admin de producción.
- **Registra en Master al final** (después del migrate).
- **Servicio:** `backend/src/services/platform/tenantProvisioning.service.ts`.
- **Deploy (primer tenant):** `npm run bootstrap:tenant` con `TENANT_*` en env.

Pseudocódigo:

```
tenants = master.query("SELECT ... FROM Tenants WHERE is_active = 1")
failures = []

for tenant in tenants:
    try:
        run_migrate_tenant(
            host=tenant.database_host,
            port=tenant.database_port,
            user=tenant.database_user,
            password=tenant.database_password,
            name=tenant.database_name,
        )
        log("OK:", tenant.tenant_key)
    except error:
        log("FAIL:", tenant.tenant_key, error)
        failures.append(tenant.tenant_key)

if failures:
    exit(1)
```

### 9.5 Flujo según tipo de BD

**BD tenant nueva (vacía):**

```
Opción automatizada (CortexCC):
  Panel /platform/tenants  o  POST /api/platform/tenants
  (primer deploy: BOOTSTRAP_TENANT=true en config Azure)

Opción manual:
1. Crear BD en el servidor
2. migrate-tenant          → aplica todas las migraciones desde cero
3. seed                    → datos iniciales (permisos, catálogos, admin)
4. INSERT en Tenants       → subdomain/custom_domain + credenciales
```

**BD tenant existente (release con cambio de esquema):**

```
1. Compilar/build del proyecto (si tu ORM lo requiere)
2. migrate-tenant en local → probar contra un tenant de dev
3. migrate-all-tenants     → aplicar en todos los tenants activos
4. Desplegar backend/frontend
```

**Solo en desarrollo — bootstrap alternativo (opcional):**

Algunos equipos usan un script de "sync schema from models" **una sola vez** en BD vacía (equivalente a `synchronize: true`). En producción **siempre** migraciones versionadas. Si usas este atajo en dev, documenta que es exclusivo de BD nuevas y nunca en prod.

### 9.6 Integración en CI/CD

El pipeline de deploy **debe** incluir `migrate-all-tenants` **antes** de levantar la nueva versión del backend:

```
build → test → migrate-all-tenants → deploy backend → deploy frontend
```

Si un tenant falla la migración, **no desplegar** hasta corregir.

### 9.7 Alta de tenant nuevo en producción (orden)

| Paso | Acción |
|------|--------|
| 1 | Panel `/platform` o crear BD vacía manualmente |
| 2 | `migrate-tenant` (incluido en el alta automatizada) |
| 3 | Seeds iniciales o admin del tenant |
| 4 | Registro en Master (incluido en el alta automatizada) |
| 5 | Registrar hostname en frontend + DNS |
| 6 | Verificar login vía URL del cliente |

No registrar en Master antes de que la BD tenga el esquema migrado.

---

## 10. Orden de implementación

```
BACKEND
 1. Tabla Tenants en Master (setup-master) con subdomain/custom_domain
 2. Conexión Master fija + Connection Manager dinámico
 3. Contexto de tenant por petición
 4. Middleware de tenant (excepción: /tenants/resolve)
 5. Controlador: resolve + current
 6. Persistencia usa Connection Manager
 7. JWT con tenantKey
 8. Scripts: setup-master, bootstrap-tenant, migrate-tenant, migrate-all-tenants
 9. Verificar con curl (sección 11)

FRONTEND
10. tenantStorage
11. resolveTenant() en boot
12. Interceptor X-Tenant-Key
13. Login solo user/password
14. tenantName en topbar + clear en logout

INFRA
15. Un despliegue frontend + N hostnames/DNS
16. CI/CD con migrate-all-tenants antes del deploy
```

---

## 11. Verificación (curl)

```bash
# Resolver tenant por hostname
curl "http://localhost:4083/api/tenants/resolve?host=cliente-a.tuplataforma.com"

# Login
curl -X POST http://localhost:4083/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Key: local" \
  -d '{"userName":"admin","password":"***","deviceId":"test","deviceType":"web"}'

# Sin header → 400
curl http://localhost:4083/api/customers
```

Verificación de migraciones:

```bash
# Un tenant
TENANT_DB_NAME=AppDB_Local ./scripts/migrate-tenant

# Todos los tenants activos en Master
./scripts/migrate-all-tenants
```

---

## 12. Errores que debes evitar

| Error | Corrección |
|-------|------------|
| Selector de empresa en login | Resolver tenant antes del login (hostname / env) |
| Listado público de todos los tenants | Solo `/tenants/resolve?host=` |
| Un despliegue frontend por cliente | Un despliegue + N dominios |
| Migrar solo la BD local | `migrate-all-tenants` antes de cada release |
| Registrar tenant en Master sin migrar su BD | Migrar primero, registrar después |
| Desplegar backend sin migrar todos los tenants | CI/CD: migrate-all-tenants → deploy |
| Auto-sync en producción | Migraciones versionadas; sync solo dev opcional en BD vacía |
| Olvidar build antes de migrar | Seguir requisitos de tu ORM (compilar si aplica) |
| Poner `TenantId` en tablas de negocio | Aislar por BD |
| Un pool/conexión compartido entre tenants | Un pool por `tenantKey` |
| Resolver tenant solo desde JWT | Header + validar JWT contra header |

---

## 13. Checklist final

**Backend**
- [ ] Tabla Tenants con subdomain, custom_domain y credenciales BD
- [ ] `GET /tenants/resolve?host=` sin header
- [ ] Sin listado público de tenants
- [ ] Middleware + Connection Manager + contexto por petición
- [ ] JWT con tenantKey validado contra header
- [ ] Scripts: setup-master, bootstrap-tenant, migrate-tenant, migrate-all-tenants

**Frontend**
- [ ] resolveTenant() en boot (env dev / hostname prod)
- [ ] Login solo user/password
- [ ] Interceptor X-Tenant-Key
- [ ] tenantName en UI; logout limpia tenant

**Migraciones**
- [ ] Auto-sync desactivado en runtime
- [ ] migrate-tenant probado en al menos un tenant local
- [ ] migrate-all-tenants ejecutado sin fallos antes del deploy
- [ ] Nuevo tenant: BD migrada **antes** de INSERT en Master

**Infraestructura**
- [ ] Un despliegue frontend, N hostnames
- [ ] CI/CD incluye migrate-all-tenants

---

## 14. Referencia CortexCC (Node.js + Prisma + PostgreSQL)

Implementación concreta en este repositorio:

| Concepto genérico | En CortexCC |
|-------------------|-------------|
| ORM | Prisma |
| Motor BD | PostgreSQL |
| setup-master | `backend/scripts/setup-master.ts` → `npm run setup:master` |
| bootstrap-tenant | `backend/scripts/bootstrap-tenant-env.ts` → deploy con `TENANT_*` |
| Alta operativa | Panel `/platform/tenants` + `tenantProvisioning.service.ts` |
| migrate-tenant | `backend/scripts/migrate-tenant.ts` → `npm run migrate:tenant` |
| migrate-all-tenants | `backend/scripts/migrate-all-tenants.ts` → `npm run migrate:all-tenants` |
| Seed tenant | `backend/prisma/seed.ts` → `npm run seed:tenant` |
| Connection Manager | `backend/src/lib/tenantConnectionManager.ts` |
| Middleware | `backend/src/middleware/tenant.ts` |
| Tabla control migraciones | `_prisma_migrations` (Prisma) |

---

## 15. Referencia CortexSales (NestJS + TypeORM + SQL Server)

Implementación concreta del patrón anterior. **No copies literalmente** si tu stack es distinto; usa la sección 9 para el mecanismo agnóstico.

| Concepto genérico | En CortexSales |
|-------------------|----------------|
| ORM | TypeORM (`@nestjs/typeorm`) |
| Motor BD | SQL Server (`mssql`) |
| setup-master | `backend/scripts/setup-master-db.js` |
| migrate-tenant | `backend/scripts/run-migrations.js` → `npm run migration:run` |
| migrate-all-tenants | `backend/scripts/run-migrations-all-tenants.js` → `npm run migration:run:all-tenants` |
| Bootstrap BD vacía (solo dev) | `backend/scripts/sync-schema.js` (`synchronize: true`, una vez) |
| Migraciones | `backend/src/database/migrations/*.ts` → compiladas a `dist/` |
| Connection Manager | `tenant-connection.manager.ts` |
| Middleware | `tenant.middleware.ts` |
| Tabla control migraciones | `migrations` (TypeORM) |

Requisito TypeORM: `npm run build` antes de `migration:run`, porque lee migraciones desde `dist/`.

Deploy Azure: `scripts/deploy-azure.sh` ejecuta setup-master y migrate-all-tenants antes del deploy.

---

## 16. Cuándo leer el estándar completo

Usa `ESTANDAR_ARQUITECTURA_MULTITENANT.md` para:

- Migrar un sistema existente (single-tenant o columna TenantId)
- Procedimientos operativos detallados y seguridad
- Backups y despliegue en Azure
- Adaptaciones avanzadas por stack

Para **implementar desde cero**, esta guía es suficiente.
