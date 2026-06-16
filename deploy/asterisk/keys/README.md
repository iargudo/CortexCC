# TLS keys (local only)

Este directorio se monta en el contenedor como `/etc/asterisk/keys`.

- No se versionan llaves/certificados (ver `.gitignore`).
- Para desarrollo local puedes generar un certificado self-signed para `localhost` y guardarlo como:
  - `asterisk.key`
  - `asterisk.pem`

Ejemplo (OpenSSL):

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout asterisk.key \
  -out asterisk.pem \
  -days 365 \
  -subj "/CN=localhost"
```

Luego visita `https://localhost:<ASTERISK_WSS_PORT>/ws` en el navegador y acepta el certificado para permitir `wss://`.

