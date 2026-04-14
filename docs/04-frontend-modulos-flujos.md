# Frontend: modulos y flujos

## Base tecnica frontend

- React + TypeScript.
- UI modular por paginas y componentes reutilizables.
- Integracion de softphone SIP/WebRTC en la interfaz principal.

## Estructura general

Entradas y layout:

- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/AppLayout.tsx`
- `frontend/src/components/AppSidebar.tsx`
- `frontend/src/components/HeaderBar.tsx`

Paginas funcionales:

- `InboxPage`
- `DashboardPage`
- `QueuesLivePage`
- `SupervisorPage`
- `ContactsPage`
- `QualityPage`
- `ReportsPage`
- `ProfilePage`
- `Settings*`

## Modulos funcionales clave

### Inbox omnicanal

Componentes principales:

- `components/inbox/ConversationList.tsx`
- `components/inbox/ChatArea.tsx`
- `components/inbox/EmailThreadView.tsx`
- `components/inbox/ContextPanel.tsx`
- dialogos `AssignDialog`, `TransferDialog`, `ResolveDialog`

Capacidades:

- Visualizacion de conversaciones por estado/canal.
- Envio de mensajes y notas internas.
- Contexto del contacto y de escalamiento.
- Acciones de ciclo de vida (accept, hold, resume, transfer, resolve).

### Contactos

- `pages/ContactsPage.tsx`
- `components/contacts/ContactDetailDrawer.tsx`

Incluye gestion basica CRM, timeline y notas.

### Supervisor y operaciones en vivo

- `pages/SupervisorPage.tsx`
- `components/supervisor/SupervisorMonitorDialog.tsx`
- `pages/QueuesLivePage.tsx`

Incluye monitoreo de agentes, carga de colas y asignacion.

### Calidad y reporteria

- `pages/QualityPage.tsx`
- `pages/ReportsPage.tsx`
- `pages/DashboardPage.tsx`

## Softphone web

Archivos relevantes:

- `hooks/useSipPhone.ts`
- `components/softphone/SoftphoneWidget.tsx`
- `components/softphone/SoftphoneConfig.tsx`

Comportamiento destacado:

- Registro SIP (WSS) para extension del agente.
- Llamadas entrantes/salientes con control de estado.
- Autoapertura del widget ante llamada entrante en ringing (desde `HeaderBar`).
- Reporte de eventos de llamada hacia backend en `/voice/calls/logs`.
- Soporte de audio para estados tempranos/establecidos para mejorar reproducibilidad de media.

## Flujos de UI relevantes

## Flujo A: Login -> operacion

1. Usuario autentica.
2. Se obtiene perfil/rol y permisos.
3. Se habilitan modulos segun RBAC.
4. Se inicializa vista principal y datos de bandeja.

## Flujo B: Conversacion entrante

1. Llegan notificaciones realtime.
2. Lista de conversaciones se actualiza.
3. Agente abre hilo y atiende.
4. Puede escalar, transferir o resolver.

## Flujo C: Llamada de voz

1. Usuario registra extension en softphone.
2. Lanza o recibe llamada.
3. Gestiona mute/hold/hangup y visualiza estado.
4. Historial de llamada queda trazado en backend.

## Configuracion frontend por entorno

Variables comunes (`frontend/.env`):

- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_SOCKET_PATH`

La UI depende de que backend y WebSocket esten accesibles con CORS compatible.
