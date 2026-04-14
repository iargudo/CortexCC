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

## Alcance

La documentacion esta alineada al codigo actual de:

- `backend/`
- `frontend/`
- `deploy/asterisk/`
- `deploy/aws/`

## Convenciones

- Los endpoints se expresan relativos al prefijo `API_PREFIX` (por defecto `/api`).
- Los nombres de tablas corresponden a los mapeos reales en `backend/prisma/schema.prisma`.
- Las referencias de telefonia contemplan las extensiones internas configuradas en Asterisk: `1000`, `6001`, `7001`, `8001`.
