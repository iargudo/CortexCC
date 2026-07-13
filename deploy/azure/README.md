# Deploy Azure — CortexCC

```
deploy/azure/
├── azure.example           → copiar a azure.stg / azure.prd
├── config/
│   ├── cortexcc.stg.example → cortexcc.stg
│   ├── cortexcc.prd.example → cortexcc.prd
│   ├── asterisk.stg.example → asterisk.stg
│   └── asterisk.prd.example → asterisk.prd
├── cortexcc/deploy-cortexcc.sh [stg|prd]
└── asterisk/deploy-asterisk-vm.sh [stg|prd]
```

Sin archivos `.env` en esta carpeta: la configuración vive en `config/` con nombres `cortexcc.stg`, `asterisk.prd`, etc.

## Inicio rápido

```bash
az login
cp deploy/azure/azure.example deploy/azure/azure.stg

cp deploy/azure/config/cortexcc.stg.example deploy/azure/config/cortexcc.stg
./deploy/azure/cortexcc/deploy-cortexcc.sh stg

cp deploy/azure/config/asterisk.stg.example deploy/azure/config/asterisk.stg
./deploy/azure/asterisk/deploy-asterisk-vm.sh stg
```

Producción: mismos archivos con sufijo `.prd` y argumento `prd`.

### Bootstrap del primer tenant

Con `RUN_SETUP_MASTER=true` y `BOOTSTRAP_TENANT=true` en `config/cortexcc.*`, el deploy ejecuta `setup:master` + `bootstrap:tenant` (env) antes de publicar Docker. **Alta de tenants adicionales:** panel `{FRONTEND_URL}/platform/tenants`.

Con `RUN_SETUP_PLATFORM_ADMIN=true` (activo por defecto si `RUN_SETUP_MASTER=true`), también ejecuta `setup:platform-admin` y deja listo el panel en `{FRONTEND_URL}/platform/login`. Variables: `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`. Opcional: `PLATFORM_JWT_SECRET` en App Settings del backend.

Variables tenant: `TENANT_KEY`, `TENANT_NAME`, `TENANT_ADMIN_EMAIL`, `TENANT_ADMIN_PASSWORD` (o `TENANT_SEED=true` solo en stg). Si `DATABASE_URL` apunta a una BD existente, se usa como BD del tenant con `--skip-db-create`.

Puertos fijos: backend `3037`, frontend `8087`.
