# Vision funcional

## Objetivo del producto

CortexCC es un contact center omnicanal para gestionar conversaciones de clientes en una sola operacion, con enrutamiento inteligente, supervision en tiempo real, control de calidad e integracion de voz SIP/WebRTC.

## Perfiles y responsabilidades

- **Agente**: atiende conversaciones, usa respuestas rapidas, registra notas internas, transfiere y resuelve casos.
- **Supervisor**: monitorea colas y agentes, realiza asignaciones forzadas, revisa carga operativa y audita atencion.
- **Administrador**: configura canales, colas, equipos, roles/permisos, politicas SLA e integraciones.

## Capacidades funcionales principales

### 1) Bandeja omnicanal

- Vista unificada para conversaciones de WhatsApp, Email, Teams, Voz y Webchat.
- Filtros por tab operativo (mias, cola, todas), canal, estado y busqueda global.
- Diferenciacion de experiencia por canal:
  - chat para mensajeria/voz,
  - hilo para correo.

### 2) Ciclo de vida de conversacion

- Estados soportados:
  - `WAITING`
  - `ASSIGNED`
  - `ACTIVE`
  - `ON_HOLD`
  - `WRAP_UP`
  - `RESOLVED`
  - `ABANDONED`
  - `TRANSFERRED`
- Acciones operativas: aceptar, rechazar, pausar, reanudar, transferir y resolver.
- Resolucion con disposicion y notas de cierre.

### 3) Gestion de contactos (CRM operativo)

- Alta, edicion, eliminacion, importacion y exportacion.
- Timeline historico por contacto y notas internas.
- Etiquetado para segmentacion y contexto de atencion.

### 4) Enrutamiento y asignacion

- Asignacion automatica por estrategia de cola.
- Asignacion manual a agente/supervisor.
- Transferencias con razon y traza.
- Vista en vivo de colas para priorizacion.

### 5) Supervision y calidad

- Monitoreo de tablero operativo en tiempo real.
- Vista de productividad, SLA y tendencias.
- Evaluaciones de calidad por rubrica (saludo, empatia, resolucion, cierre).

### 6) Telefonia integrada

- Softphone web embebido para registro SIP, llamadas entrantes/salientes e historial.
- Extension de IA (`1000`) via ARI/Stasis.
- Llamadas internas entre extensiones de agentes (`6001`, `7001`, `8001`).
- Historial de llamadas separado en `voice_calls` (sin mezclar con conversaciones).

## Flujos funcionales criticos

## Flujo A: Escalamiento externo -> atencion humana

1. Un sistema externo invoca integracion (AgentHub/Collect/Voice transfer).
2. Se crea o actualiza contacto y conversacion con contexto de escalamiento.
3. La conversacion entra a cola segun reglas.
4. El motor asigna o un supervisor asigna manualmente.
5. El agente atiende, documenta y resuelve.

## Flujo B: Llamada interna SIP/WebRTC

1. El usuario registra su extension en softphone.
2. Marca extension destino.
3. El PBX enruta por dialplan `from-internal`.
4. Se establece audio bidireccional via RTP/WebRTC.
5. El frontend registra eventos de llamada en `voice_calls`.

## Flujo C: Atencion email

1. Ingreso por webhook/inbound.
2. Visualizacion como hilo con asunto y metadatos.
3. Respuesta con editor y plantillas.
4. Persistencia de mensaje saliente y tracking operativo.

## KPI funcionales soportados

- Conversaciones en espera y activas.
- Tiempo promedio de espera.
- Cumplimiento SLA.
- Productividad por agente.
- Tendencia de volumen por franja horaria.
- Puntaje de calidad y CSAT.

## Reglas funcionales relevantes

- La operacion aplica RBAC por permisos.
- Los eventos de voz pueden existir sin `conversation_id` (historial independiente).
- Las integraciones externas usan API key dedicada.
- La configuracion de canal puede validarse y probarse desde settings.
