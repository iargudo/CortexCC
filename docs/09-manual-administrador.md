# Manual del administrador — CortexCC

Guía **funcional** para quien administra la operación del contact center: configuración del negocio, usuarios, colas, canales y reglas de atención. No requiere conocimientos técnicos.

> Para instalación de servidores, bases de datos o telefonía a nivel infraestructura, ver [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md) (documento para el equipo de TI).

---

## 1. ¿Qué es CortexCC?

CortexCC es el **centro de atención omnicanal** de tu empresa. Permite que agentes, supervisores y administradores gestionen en un solo lugar las conversaciones que llegan por:

- WhatsApp
- Correo electrónico
- Microsoft Teams
- Voz (llamadas telefónicas)
- Webchat

Como administrador, tu trabajo es **dejar lista la operación** para que los agentes puedan atender clientes de forma ordenada, medible y con las reglas correctas de enrutamiento.

---

## 2. Perfiles en la operación

| Perfil | Responsabilidad | ¿Qué hace en el día a día? |
|---|---|---|
| **Administrador** | Configurar la plataforma | Usuarios, colas, canales, SLA, integraciones |
| **Supervisor** | Monitorear y dirigir la operación | Asignar casos, ver colas en vivo, evaluar calidad |
| **Agente** | Atender al cliente | Responder conversaciones, llamar, cerrar casos |

El administrador tiene acceso a todo el menú **Configuración** en la barra lateral. Los supervisores ven el tablero operativo y calidad, pero no modifican la estructura base del sistema.

---

## 3. Acceso al sistema

1. Abre la **URL de tu empresa** que te entregó el equipo de TI (por ejemplo `https://soporte.tuempresa.com` o el subdominio asignado). No hay selector de empresa en el login: la plataforma identifica tu organización automáticamente por la dirección web.
2. Inicia sesión con tu **correo y contraseña** (solo esos dos campos).
3. En la barra superior verás el **nombre de tu organización** (tenant).
4. Verifica que en el menú lateral aparezca la sección **Configuración** con: Colas, Canales, Equipos, Skills, Roles, Usuarios, Integraciones y General.

Si ves «Dominio no configurado», la URL no está registrada en la plataforma — contacta al equipo de TI.

Si no ves Configuración, tu cuenta no tiene rol de administrador. Solicita el cambio a quien gestione usuarios en tu organización.

---

## 4. Orden recomendado de configuración

Configura en este orden la primera vez. Cada paso depende del anterior.

```
1. General        → Reglas de cierre, tiempos de servicio, horarios
2. Equipos        → Áreas operativas (Soporte, Ventas, Cobranza…)
3. Skills         → Capacidades de los agentes (idiomas, temas)
4. Colas          → Dónde entran las conversaciones y cómo se distribuyen
5. Usuarios       → Cuentas de agentes y supervisores
6. Roles          → Permisos (si necesitas perfiles personalizados)
7. Canales        → WhatsApp, email, voz, etc.
8. Integraciones  → CRM, bots, apps embebidas en el inbox
9. Prueba         → Simular un mensaje o llamada y validar el flujo completo
```

---

## 5. Configuración → General

Ruta: **Configuración → General**

Aquí defines las **reglas operativas** que usan agentes y supervisores al cerrar casos y medir el servicio.

### 5.1 Disposiciones

Son los **motivos de cierre** de una conversación. El agente debe elegir una al resolver un caso.

**Ejemplos útiles:**

| Nombre | Categoría | ¿Requiere nota? |
|---|---|---|
| Resuelto satisfactorio | resuelto | No |
| Requiere seguimiento | seguimiento | Sí |
| Cliente no respondió | no_resuelto | No |
| Fuera de alcance / spam | spam | No |

**Buena práctica:** Mantén la lista corta (5–10 opciones). Demasiadas disposiciones confunden al agente y ensucian los reportes.

### 5.2 Políticas de SLA

El SLA (Acuerdo de Nivel de Servicio) define **cuánto tiempo** puede pasar antes de que el sistema marque un retraso.

Configura por política:

- **Primera respuesta:** tiempo máximo para que un agente conteste por primera vez.
- **Resolución:** tiempo máximo para cerrar el caso.
- **Umbral de advertencia:** porcentaje del SLA en el que el supervisor recibe alerta (por ejemplo, al 80 %).

**Ejemplo:** Primera respuesta en 2 minutos, resolución en 15 minutos, advertencia al 70 %.

### 5.3 Respuestas rápidas

Mensajes predefinidos que el agente inserta escribiendo un **código corto** (por ejemplo `/saludo`).

| Shortcode | Uso |
|---|---|
| `/saludo` | Bienvenida estándar |
| `/horarios` | Horario de atención |
| `/espera` | Pedir al cliente que aguarde |
| `/despedida` | Cierre cordial |

Puedes crear respuestas por canal o categoría (ventas, soporte, cobranza).

### 5.4 Horarios de operación

Define **cuándo está abierto** el contact center:

- Zona horaria de la empresa
- Horario por día de la semana (lunes a domingo)
- Días sin atención (sábado/domingo vacíos, por ejemplo)

Esto sirve para que las reglas de enrutamiento y reportes reflejen la operación real.

---

## 6. Configuración → Equipos

Ruta: **Configuración → Equipos**

Un **equipo** es un grupo de personas que atienden un tipo de trabajo: Soporte técnico, Ventas, Cobranza, etc.

**Pasos:**

1. Crear equipo con nombre y descripción.
2. Asignar **miembros** (agentes y supervisores del equipo).
3. Vincular el equipo a una o más **colas** (en el paso siguiente).

**Ejemplo de estructura:**

| Equipo | Miembros típicos | Cola asociada |
|---|---|---|
| Soporte | 8 agentes + 1 supervisor | Cola General |
| Ventas | 5 agentes + 1 supervisor | Cola Ventas |
| Cobranza | 6 agentes + 1 supervisor | Cola Cobranza |

---

## 7. Configuración → Skills

Ruta: **Configuración → Skills**

Un **skill** es una capacidad del agente: idioma, tema o especialización.

**Ejemplos:**

| Skill | Categoría | Uso |
|---|---|---|
| ventas | tema | Casos comerciales |
| cobranza | tema | Morosidad y pagos |
| ingles | idioma | Clientes en inglés |
| soporte_tecnico | técnico | Incidencias técnicas |

Los skills se usan cuando una cola tiene estrategia **Por habilidades (SKILL_BASED)**: el sistema prioriza al agente que mejor coincide con lo que requiere el caso.

> La asignación de skills y nivel de dominio (1–10) por agente puede requerir apoyo del equipo de implementación en la puesta en marcha inicial.

---

## 8. Configuración → Colas

Ruta: **Configuración → Colas**

La **cola** es el corazón de la operación: es el lugar donde **esperan** las conversaciones hasta que un agente las toma.

### 8.1 Datos de cada cola

| Campo | Qué significa | Recomendación |
|---|---|---|
| **Nombre** | Identificador visible | Corto y claro: "General", "VIP", "Cobranza" |
| **Descripción** | Para el equipo | Opcional, útil en operaciones grandes |
| **Equipo** | Quién atiende esta cola | Siempre asignar un equipo |
| **Estrategia de enrutamiento** | Cómo se elige al agente | Ver tabla abajo |
| **Tiempo máximo en espera** | Segundos antes de considerar abandono crítico | 300 s (5 min) es un buen punto de partida |
| **Activa** | Si recibe conversaciones nuevas | Desactivar solo en mantenimiento |

### 8.2 Estrategias de enrutamiento

| Estrategia | Comportamiento | Cuándo usarla |
|---|---|---|
| **Menos ocupado (LEAST_BUSY)** | Va al agente con menos casos activos | Cola general, operación estándar |
| **Round Robin** | Rota equitativamente entre agentes | Equipos homogéneos, carga similar |
| **Por habilidades (SKILL_BASED)** | Prioriza quien tiene el skill adecuado | Soporte especializado, idiomas |
| **Por prioridad (PRIORITY_BASED)** | Usa puntaje de prioridad del agente | Operaciones con niveles de seniority |
| **Mayor tiempo libre (LONGEST_IDLE)** | Al agente que más tiempo lleva sin atender | Evitar que algunos agentes queden inactivos |

### 8.3 Vincular canales a colas

Cada conversación entrante debe caer en **una cola**. Al configurar canales (WhatsApp, email, voz…), asegúrate de que apunten a la cola correcta. Si un canal no está vinculado a ninguna cola, los casos pueden quedar sin destino.

**Ejemplo:**

- WhatsApp comercial → Cola Ventas
- Email soporte@empresa.com → Cola Soporte
- Llamadas entrantes → Cola General

---

## 9. Configuración → Usuarios

Ruta: **Configuración → Usuarios**

Aquí das de alta a las personas que usarán el sistema.

### 9.1 Crear un usuario

1. Clic en **Nuevo usuario**.
2. Completar: correo, nombre, apellido, contraseña inicial (mínimo 8 caracteres).
3. Elegir **rol**: agente, supervisor o admin.
4. Guardar y comunicar al usuario sus credenciales (idealmente obligar cambio de contraseña en el primer acceso).

### 9.2 Editar un usuario

Puedes modificar:

- Nombre y correo
- Rol
- **Máximo de conversaciones concurrentes:** cuántos casos puede atender a la vez (típico: 3–5 para chat, 1 para voz intensiva)
- Estado inicial (ONLINE, OFFLINE, etc.)

### 9.3 Buenas prácticas de usuarios

- Un correo por persona; no compartir cuentas.
- Un supervisor por cada 8–12 agentes como referencia.
- Mantener solo una cuenta **admin** por área de TI/operaciones.
- Dar de baja o desactivar usuarios que ya no trabajan en el centro.

---

## 10. Configuración → Roles

Ruta: **Configuración → Roles**

Los roles controlan **qué módulos ve** cada persona:

| Permiso | Módulo |
|---|---|
| Bandeja | Inbox (atender conversaciones) |
| Dashboard | Indicadores en tiempo real |
| Supervisor | Tablero de supervisión y colas en vivo |
| Calidad | Evaluaciones QA |
| Reportes | Analítica y exportación |
| Contactos | CRM operativo |
| Configuración | Todo el menú de administración |

**Roles predefinidos:**

| Rol | Acceso típico |
|---|---|
| **admin** | Todo |
| **supervisor** | Operación + calidad + reportes; sin configuración |
| **agent** | Inbox, contactos, dashboard |

Solo crea roles personalizados si tu operación necesita perfiles intermedios (por ejemplo, un "backoffice" que solo ve contactos y reportes).

---

## 11. Configuración → Canales

Ruta: **Configuración → Canales**

Un **canal** es cada vía por la que el cliente se comunica contigo. Debes crear y configurar solo los que tu empresa utilizará.

### 11.1 WhatsApp

**Qué necesitas antes de configurar:**

- Cuenta con un proveedor de WhatsApp Business (UltraMsg, Twilio o 360dialog)
- Número de WhatsApp habilitado para API
- Credenciales que te entrega el proveedor

**Pasos en CortexCC:**

1. Crear canal tipo **WhatsApp**.
2. Elegir proveedor e ingresar credenciales.
3. Pulsar **Probar configuración** hasta ver resultado exitoso.
4. Pedir al equipo de TI que registre en el proveedor la URL de recepción de mensajes que muestra CortexCC.
5. Activar el canal y vincularlo a una cola.
6. Enviar un mensaje de prueba desde un teléfono y verificar que aparece en el Inbox.

### 11.2 Correo electrónico

**Qué necesitas:**

- Cuenta de correo de atención (ej. `soporte@empresa.com`)
- Datos de servidor de envío (SMTP) y de lectura (IMAP), normalmente los proporciona TI

**Pasos:**

1. Crear canal tipo **Email**.
2. Completar datos de envío y recepción.
3. Definir remitente visible (nombre y correo que verá el cliente).
4. Probar configuración.
5. Enviar un correo de prueba al buzón configurado y confirmar que llega al Inbox como hilo de correo.

### 11.3 Voz (llamadas telefónicas)

**Qué necesitas:**

- Central telefónica (PBX) de la empresa integrada con CortexCC
- Número entrante y, si aplica, línea saliente para devolver llamadas

La configuración técnica del PBX la realiza el equipo de TI. Como administrador funcional debes:

1. Crear canal tipo **Voz**.
2. Confirmar con TI que la prueba de conexión es exitosa.
3. Vincular el canal a la cola de llamadas.
4. Verificar que un agente puede recibir y realizar llamadas desde el softphone del navegador.

### 11.4 Webchat

Para el chat embebido en tu sitio web:

1. Crear canal **Webchat**.
2. Personalizar mensaje de bienvenida y apariencia.
3. Copiar el código de embebido y entregarlo al equipo web de tu empresa.
4. Probar enviando un mensaje desde la página.

### 11.5 Microsoft Teams

Si atiendes por Teams:

1. Crear canal **Teams**.
2. Coordinar con TI los datos de la aplicación en Microsoft Entra ID (Tenant, Client ID).
3. Probar y activar.

### 11.6 Estado del canal

| Estado | Significado |
|---|---|
| **Activo** | Recibe y envía conversaciones |
| **Inactivo** | Pausado temporalmente |
| **Error** | Revisar credenciales o conexión con TI |

Siempre usa **Probar configuración** antes de activar un canal en producción.

---

## 12. Configuración → Integraciones

Ruta: **Configuración → Integraciones**

Conecta CortexCC con otros sistemas de tu empresa.

### 12.1 Escalamiento desde bots o CRM

Cuando un chatbot, IVR o sistema externo necesita **pasar el caso a un humano**, envía el escalamiento a CortexCC. El administrador debe:

1. Coordinar con TI la clave de integración segura.
2. Definir a qué **cola** caerán esos casos.
3. Validar que el contacto llega al Inbox con el contexto del sistema origen (motivo, datos del cliente).

### 12.2 Apps embebidas en el Inbox

Puedes mostrar información de un CRM u otro sistema **en el panel lateral** mientras el agente atiende:

| Modo | Qué hace |
|---|---|
| **Snapshot** | Muestra datos de solo lectura |
| **Embed** | Abre la aplicación externa en un marco dentro de CortexCC |
| **Actions** | Permite ejecutar acciones (consultar saldo, crear ticket, etc.) |

Configura cada app con su URL y reglas de visibilidad (global, por canal, por cola o por rol).

---

## 13. Telefonía para agentes (softphone)

Los agentes atienden llamadas desde el **icono de teléfono** en la barra superior del sistema, sin instalar un programa aparte (usa el navegador).

### 13.1 Qué debe hacer el administrador

1. Configurar el **host del central telefónica (Asterisk)** en **Configuración → Telefonía** (`/settings/telephony`). Un solo host alimenta el softphone de agentes (WSS) y la plataforma de llamadas (ARI).
2. Confirmar con TI que cada agente tiene **extensión y contraseña** asignadas (rango típico 7001–7099).
3. Comunicar a los agentes que al iniciar sesión deben ver el indicador de teléfono en **verde** (conectado).
4. Si el indicador está en rojo, el agente debe avisar a TI o al administrador.

### 13.2 Indicadores del softphone

| Color | Significado |
|---|---|
| Verde | Conectado, puede recibir y hacer llamadas |
| Amarillo | Conectando |
| Rojo | Error de conexión; revisar con TI |

### 13.3 Capacidad concurrente

En usuarios con mucha carga de voz, considera **máximo 1 conversación concurrente** para evitar que el agente reciba dos llamadas a la vez.

---

## 14. Marcador y campañas salientes

Ruta: **Marcador** (menú principal)

Permite campañas de **llamadas salientes** a listas de contactos.

| Modo | Comportamiento |
|---|---|
| **Preview** | El agente ve el contacto y decide cuándo llamar |
| **Progresivo** | El sistema marca automáticamente cuando el agente está disponible |
| **Predictivo** | Marca varias líneas y conecta al agente cuando alguien contesta |

**Pasos para una campaña:**

1. Crear campaña con nombre y modo.
2. Seleccionar canal de voz.
3. Cargar lista de contactos (teléfonos).
4. Asignar agentes participantes.
5. Iniciar campaña y monitorear resultados (contactados, no contesta, ocupado, etc.).

Los agentes deben estar en estado **Disponible (ONLINE)** y con el softphone conectado para campañas progresivas o predictivas.

---

## 15. Cómo fluye una conversación (vista del administrador)

Entender este ciclo te ayuda a configurar bien colas y SLA.

```
Cliente escribe o llama
        ↓
Entra por un CANAL (WhatsApp, email, voz…)
        ↓
Se crea o actualiza el CONTACTO en el CRM
        ↓
La conversación va a la COLA configurada (estado: En espera)
        ↓
El sistema ASIGNA un agente según la estrategia de la cola
        ↓
El agente ACEPTA y atiende (estado: Activa)
        ↓
Puede transferir, pausar o agregar notas internas
        ↓
El agente CIERRA con una DISPOSICIÓN (estado: Resuelta)
        ↓
Opcional: el supervisor EVALÚA calidad en el módulo Calidad
```

### Estados que verás en reportes

| Estado | Significado para la operación |
|---|---|
| En espera | Nadie lo ha tomado aún |
| Asignada | Ya tiene agente pero no lo aceptó |
| Activa | En atención |
| En pausa | El agente la puso en hold |
| Cierre / Wrap-up | Registrando disposición |
| Resuelta | Caso cerrado |
| Abandonada | El cliente se fue antes de ser atendido |
| Transferida | Pasó a otro agente o cola |

---

## 16. Contactos (CRM operativo)

Ruta: **Contactos**

Aunque no es solo del administrador, debes conocerlo para definir procesos:

- **Alta manual** de clientes
- **Importación masiva** desde archivo CSV
- **Exportación** para campañas o análisis
- **Fusión** de duplicados (mismo cliente con dos registros)
- **Historial** de todas las conversaciones pasadas por contacto
- **Etiquetas** (VIP, mora, empresa…) para segmentar

Recomendación: define con el equipo qué campos son obligatorios (teléfono, correo, identificación) según el canal principal.

---

## 17. Supervisión y calidad (lo que debes habilitar)

El administrador configura; el **supervisor** opera. Asegúrate de que haya al menos un supervisor con permisos para:

### 17.1 Colas en vivo

Ver en tiempo real cuántos casos esperan, cuántos están activos y cuántos agentes hay conectados por cola.

### 17.2 Panel de supervisor

- Estado de cada agente (disponible, ocupado, ausente)
- Carga de trabajo (casos activos vs. máximo)
- Asignación manual de casos urgentes
- Transferencias forzadas

### 17.3 Calidad (QA)

Tras cerrar un caso, puede quedar pendiente de evaluación. El supervisor puntúa:

- Saludo y presentación
- Empatía y tono
- Resolución del problema
- Cierre y despedida

Los puntajes alimentan los reportes de calidad por agente.

---

## 18. Reportes y dashboard

### Dashboard (todos los roles con permiso)

Vista rápida del día: agentes conectados, casos en espera, SLA, volumen por canal.

### Reportes (supervisor y admin)

| Pestaña | Qué analiza |
|---|---|
| **Volumen** | Cantidad de conversaciones por día y hora |
| **Productividad** | Casos atendidos y resueltos por agente |
| **SLA** | Cumplimiento de tiempos por cola |

Usa estos reportes en reuniones operativas semanales para ajustar dotación, colas y SLA.

---

## 19. Tareas recurrentes del administrador

### Diario

- Revisar que los canales estén en estado **Activo**
- Verificar agentes con problemas de acceso o softphone
- Atender solicitudes de nuevos usuarios o cambios de rol

### Semanal

- Revisar reportes de SLA y abandono
- Ajustar respuestas rápidas según preguntas frecuentes nuevas
- Revisar colas con tiempos de espera altos

### Mensual

- Auditar usuarios activos (dar de baja los que ya no operan)
- Revisar disposiciones y políticas de SLA
- Coordinar con TI rotación de credenciales de canales si aplica

### Ante cambios de operación

| Cambio | Qué actualizar |
|---|---|
| Nuevo producto o línea de negocio | Cola + equipo + skills |
| Nuevo número de WhatsApp | Canal WhatsApp + webhook con TI |
| Nuevo horario de atención | Horarios en General |
| Campaña saliente | Marcador + lista de contactos |

---

## 20. Checklist de puesta en marcha (administrador)

Marca cada ítem antes de abrir la operación a agentes reales:

- [ ] Disposiciones de cierre definidas
- [ ] Al menos una política de SLA activa
- [ ] Horario de operación configurado
- [ ] Equipos creados con miembros asignados
- [ ] Colas creadas, activas y con estrategia definida
- [ ] Usuarios de agentes y supervisores creados
- [ ] Canales necesarios probados y activos
- [ ] Cada canal vinculado a la cola correcta
- [ ] Prueba de mensaje entrante (WhatsApp o email) visible en Inbox
- [ ] Prueba de llamada con softphone conectado
- [ ] Supervisores capacitados en Colas en vivo y asignación manual
- [ ] Agentes capacitados en Inbox, disposiciones y respuestas rápidas

---

## 21. Problemas frecuentes (sin tecnicismos)

| Síntoma | Qué revisar | Acción |
|---|---|---|
| El agente no ve conversaciones nuevas | Estado del agente | Debe estar **Disponible (ONLINE)** |
| Los mensajes de WhatsApp no llegan | Canal WhatsApp | Verificar estado del canal; escalar a TI si dice Error |
| El correo no aparece en el Inbox | Canal Email | Probar configuración; confirmar buzón con TI |
| El teléfono no conecta (rojo) | Softphone | Escalar a TI (extensión, central telefónica) |
| Casos que nadie recibe | Cola | Confirmar cola activa, agentes en equipo y canal vinculado |
| Agente saturado | Usuario | Reducir máximo de concurrentes o redistribuir colas |
| SLA siempre en rojo | Política SLA | Los tiempos pueden ser muy agresivos para tu dotación real |
| Supervisor no ve configuración | Rol | Es normal; solo admin configura la plataforma |

---

## 22. Glosario

| Término | Definición sencilla |
|---|---|
| **Conversación** | Hilo de atención con un cliente (mensajes o llamada) |
| **Contacto** | Ficha del cliente en el CRM |
| **Cola** | Fila virtual donde esperan los casos |
| **Canal** | Medio de entrada: WhatsApp, email, voz, etc. |
| **Disposición** | Motivo por el que se cerró un caso |
| **SLA** | Tiempo máximo acordado para responder o resolver |
| **Skill** | Habilidad del agente (idioma, tema, especialización) |
| **Inbox** | Bandeja donde el agente atiende |
| **Softphone** | Teléfono virtual en el navegador |
| **Escalamiento** | Caso que un bot o sistema externo pasa a un humano |
| **QA / Calidad** | Evaluación de cómo atendió el agente |

---

## Referencias

- Visión del producto: [01-vision-funcional.md](./01-vision-funcional.md)
- Documentación funcional completa: [DOCUMENTACION_FUNCIONAL.md](./DOCUMENTACION_FUNCIONAL.md)
- Instalación técnica (equipo de TI): [08-manual-configuracion-cliente-nuevo.md](./08-manual-configuracion-cliente-nuevo.md)
