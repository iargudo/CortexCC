# Asterisk en Azure (PBX dedicado)

Configuración en `deploy/azure/config/asterisk.stg|prd`. Integración con `deploy/azure/config/cortexcc.stg|prd` del mismo ambiente.

```bash
./deploy/azure/asterisk/deploy-asterisk-vm.sh stg
./deploy/azure/asterisk/deploy-asterisk-vm.sh prd
```

Orden: primero CortexCC, luego Asterisk.

Ver [../README.md](../README.md) para la estructura completa.
