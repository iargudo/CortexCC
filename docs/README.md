# Documentacion de CortexCC

Este directorio centraliza la documentacion funcional y tecnica del proyecto CortexCC.

## Contenido

- `01-vision-funcional.md`: descripcion funcional del producto, perfiles y flujos de negocio.
- `02-arquitectura-tecnica.md`: arquitectura de alto nivel, componentes, capas y flujo de datos.
- `03-backend-api-servicios.md`: API REST, modulos backend, seguridad y procesamiento asyncrono.
- `04-frontend-modulos-flujos.md`: estructura del frontend, pantallas, estado y experiencia operativa.
- `05-telefonia-asterisk-softphone.md`: integracion SIP/WebRTC, extensiones, dialplan y troubleshooting.
- `06-modelo-datos-prisma.md`: modelo de datos real en Prisma y relaciones principales.
- `07-despliegue-operacion.md`: despliegue local y AWS CLI, validaciones operativas y checklist.
- `08-manual-configuracion-cliente-nuevo.md`: guia paso a paso para configurar CortexCC desde cero en un cliente nuevo (infraestructura, UI, canales, voz e integraciones).
- `09-manual-administrador.md`: manual funcional para el administrador de la operacion (colas, usuarios, canales, SLA, integraciones; sin contenido tecnico).
- `ESTANDAR_ARQUITECTURA_MULTITENANT.md`: estandar completo de arquitectura multi-tenant (database-per-tenant, Master DB, `X-Tenant-Key`, migraciones).

## Arquitectura multi-tenant

CortexCC opera en modo **multi-tenant database-per-tenant**:

- Una **base Master** (`cortexcc_master`) registra empresas, dominios y credenciales de conexion.
- Cada **empresa (tenant)** tiene su **propia base PostgreSQL** con el esquema de negocio completo.
- El frontend es **unico**; cada cliente entra por su URL (subdominio o dominio custom).
- Toda peticion API lleva el header `X-Tenant-Key` (excepto `GET /api/tenants/resolve` y `GET /api/health`).

Referencia tecnica: [ESTANDAR_ARQUITECTURA_MULTITENANT.md](./ESTANDAR_ARQUITECTURA_MULTITENANT.md).

## Guia rapida para un cliente nuevo

**Administrador de la operacion (funcional):** [09-manual-administrador.md](./09-manual-administrador.md)

**Equipo de TI / despliegue (tecnico):** [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md)

Si vas a desplegar por primera vez, sigue el orden de `08-manual-configuracion-cliente-nuevo.md`:

1. PostgreSQL Master + BD del primer tenant + Redis
2. `setup:master` + `migrate:tenant` + registro del tenant en Master
3. Backend + frontend (un despliegue, N dominios en produccion)
4. Configuracion administrativa (colas, usuarios, canales)
5. Asterisk + softphone
6. Integraciones externas
7. Checklist de validacion

**Alta de tenant adicional:** crear BD vacia → `migrate:tenant` → `seed:tenant` → INSERT en Master → DNS. Ver seccion correspondiente en `08-manual-configuracion-cliente-nuevo.md`.

## Alcance

La documentacion esta alineada al codigo actual de:

- `backend/`
- `frontend/`
- `deploy/asterisk/`
- `deploy/aws/`
- `deploy/azure/`

## Scripts de desarrollo (`scripts/`)

| Script | Uso |
|--------|-----|
| `set-lan-ip.sh` | Alinea la IP LAN del Mac en `.env`, BD (tenant + softphone), `pjsip.conf` y agentes WebRTC. Ver [05-telefonia-asterisk-softphone.md](./05-telefonia-asterisk-softphone.md#pruebas-en-lan-desarrollo). |
| `run-smoke-voice-lab.sh` / `smoke-voice-lab.sh` | Pruebas de voz automatizadas en laboratorio. |

## Convenciones

- Los endpoints se expresan relativos al prefijo `API_PREFIX` (por defecto `/api`).
- Los nombres de tablas corresponden a los mapeos reales en `backend/prisma/schema.prisma`.
- Las referencias de telefonia contemplan las extensiones internas configuradas en Asterisk: `1000`, `6001`, `7001`, `8001`.
