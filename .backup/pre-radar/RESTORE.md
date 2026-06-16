# Respaldo pre-radar del cliente

Copia del historial por conversación (tarjetas + mensajes anidados) **antes** del cambio a "Radar del cliente" (feed plano).

Fecha de referencia: implementación radar en contexto base del inbox.

## Restaurar versión anterior

Desde la raíz del repo:

```bash
cp .backup/pre-radar/frontend/src/components/contacts/ContactInteractionHistory.tsx frontend/src/components/contacts/
cp .backup/pre-radar/frontend/src/components/inbox/ContextPanel.tsx frontend/src/components/inbox/
cp .backup/pre-radar/frontend/src/lib/contactInteractions.ts frontend/src/lib/
cp .backup/pre-radar/backend/src/services/contact.service.ts backend/src/services/
cp .backup/pre-radar/backend/src/routes/api.ts backend/src/routes/
rm -f frontend/src/components/contacts/ContactActivityRadar.tsx
rm -f frontend/src/lib/contactActivityFeed.ts
```

Luego reinicia backend y frontend.

## Qué incluye este backup

- `ContactInteractionHistory.tsx` — historial compacto al final del panel con 3 mensajes por conversación
- `ContextPanel.tsx` — integración del historial al final
- `contactInteractions.ts` — tipos del endpoint `/interactions`
- `contact.service.ts` — `getContactInteractions` con mensajes recientes
- `api.ts` — ruta `/contacts/:id/interactions`

## Versión nueva (radar)

- `ContactActivityRadar.tsx` + `/contacts/:id/activity-feed`
- Feed plano bajo el contacto, excluye conversación actual
- Drawer sigue usando `ContactInteractionHistory` (modo full)
