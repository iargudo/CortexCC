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
- `deploy/asterisk/conf/pjsip.conf`
- `deploy/asterisk/conf/extensions.conf`
- `deploy/asterisk/conf/http.conf`
- `deploy/asterisk/conf/ari.conf`
- `deploy/asterisk/conf/rtp.conf`

## Puertos publicados (contenedor Asterisk)

- SIP UDP: `5060/udp` (mapeado por `ASTERISK_SIP_PORT`)
- RTP: rango configurable `ASTERISK_RTP_START`-`ASTERISK_RTP_END` UDP
- ARI HTTP: `8088/tcp` (mapeado por `ASTERISK_ARI_PUBLIC_PORT`)
- WSS SIP: `8089/tcp` (mapeado por `ASTERISK_WSS_PORT`)

## Dialplan interno

Contexto `from-internal`:

- `1000` -> `Stasis(ai-assistant)` para IA.
- `6001` -> `Dial(PJSIP/6001,30)`.
- `7001` -> `Dial(PJSIP/7001,30)`.
- `8001` -> `Dial(PJSIP/8001,30)`.

Esto permite llamadas directas entre extensiones y hacia la IA.

## Extensiones configuradas

### Extension 6001 (SIP UDP)

- Usuario: `6001`
- Password: `6001pass`
- Transporte: `transport-udp`
- Uso esperado: softphone SIP tradicional (desktop/hardware).

### Extension 7001 (WebRTC via WSS)

- Usuario: `7001`
- Password: `7001pass`
- Transporte: `transport-wss`
- Parametros WebRTC: `webrtc=yes`, `media_encryption=dtls`, `ice_support=yes`, `rtcp_mux=yes`.
- Uso esperado: widget softphone del frontend.

### Extension 8001 (SIP UDP)

- Usuario: `8001`
- Password: `8001pass`
- Transporte: `transport-udp`
- Uso esperado: app VoIP movil o softphone desktop.

## Consideraciones de red y audio

### Direcciones externas SIP/RTP

En `pjsip.conf`, `transport-udp` define:

- `external_signaling_address`
- `external_media_address`

Deben apuntar a IP/FQDN realmente alcanzable por clientes externos a Docker. Si se deja localhost/loopback, se producen llamadas sin audio.

### From header compatible con SIP.js

Se usa `from_user` y `from_domain=localhost` por extension para evitar errores de parseo del header `From` en clientes WebRTC.

### Contactos WebRTC inestables

Para extension `7001`:

- `max_contacts=5`
- `remove_existing=no`
- `remove_unavailable=no`
- `qualify_frequency=0`

Esto reduce flapping de registro en navegador.

## Configuracion de cliente softphone web (7001)

Valores tipicos:

- `server`: `wss://<host-asterisk>:8089/ws`
- `realm`: `localhost`
- `extension`: `7001`
- `password`: `7001pass`
- `displayName`: nombre visible del agente
- STUN recomendado: `stun:stun.l.google.com:19302`

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

1. Verificar extensiones registradas (`pjsip show contacts` en CLI de Asterisk).
2. Confirmar que INVITE llega al destino correcto.
3. Validar IP anunciada en SDP (no debe ser loopback interna incorrecta).
4. Confirmar rango RTP abierto en firewall/security group.
5. Revisar certificados TLS si falla WSS.
6. Probar llamada cruzada `6001 <-> 7001`, `7001 <-> 8001`, `6001 <-> 8001`.
