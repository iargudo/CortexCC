# CortexCC en AWS (AWS CLI)

Despliegue de **CortexCC** (backend + frontend) en EC2 usando comandos `aws cli`.  
Este flujo es separado del despliegue de Asterisk.

## 1) Variables base

```bash
export AWS_REGION="us-east-1"
export STACK_NAME="cortexcc"
export INSTANCE_TYPE="t3.large"
export AMI_ID="ami-xxxxxxxxxxxxxxxxx"   # Ubuntu 22.04 LTS de tu region
export KEY_NAME="cortexcc-key"
export MY_IP_CIDR="$(curl -s https://checkip.amazonaws.com | tr -d '\n')/32"
```

## 2) Red (VPC/Subnet por defecto)

```bash
export VPC_ID="$(aws ec2 describe-vpcs \
  --region "$AWS_REGION" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"

export SUBNET_ID="$(aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)"
```

## 3) Key pair + Security Group

```bash
aws ec2 create-key-pair \
  --region "$AWS_REGION" \
  --key-name "$KEY_NAME" \
  --query 'KeyMaterial' --output text > "${KEY_NAME}.pem"
chmod 400 "${KEY_NAME}.pem"
```

```bash
export SG_ID="$(aws ec2 create-security-group \
  --region "$AWS_REGION" \
  --group-name "${STACK_NAME}-sg" \
  --description "CortexCC SG" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)"
```

```bash
# SSH
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP_CIDR,Description=SSH}]"

# Frontend (NO cambiar puerto)
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions 'IpProtocol=tcp,FromPort=8080,ToPort=8080,IpRanges=[{CidrIp=0.0.0.0/0,Description=Frontend}]'

# Backend API (NO cambiar puerto)
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions 'IpProtocol=tcp,FromPort=3030,ToPort=3030,IpRanges=[{CidrIp=0.0.0.0/0,Description=Backend API}]'
```

## 4) Lanzar EC2

```bash
export INSTANCE_ID="$(aws ec2 run-instances \
  --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":40,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${STACK_NAME}-ec2}]" \
  --query 'Instances[0].InstanceId' --output text)"
```

```bash
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
export PUBLIC_IP="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
echo "EC2 lista en: $PUBLIC_IP"
```

## 5) Provisionar SO y runtime

```bash
ssh -i "${KEY_NAME}.pem" ubuntu@"$PUBLIC_IP" <<'EOF'
set -euo pipefail
sudo apt-get update
sudo apt-get install -y git curl build-essential nginx

# Node 20 + npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2
EOF
```

## 6) Publicar CortexCC en la EC2

> Ajusta `GIT_URL` a tu repositorio.

```bash
export GIT_URL="https://github.com/tu-org/cortexcc.git"

ssh -i "${KEY_NAME}.pem" ubuntu@"$PUBLIC_IP" <<EOF
set -euo pipefail

rm -rf ~/CortexCC
git clone "$GIT_URL" ~/CortexCC
cd ~/CortexCC

# Backend
cd backend
npm ci
npm run build

# IMPORTANTE: mantener PORT=3030
cat > .env <<'ENVEOF'
NODE_ENV=production
PRISMA_LOG_QUERIES=false
PORT=3030
API_PREFIX=/api
CORS_ORIGIN=http://PUBLIC_IP:8080
DATABASE_URL=postgresql://USER:PASSWORD@RDS_HOST:5432/cortexcc
REDIS_URL=redis://REDIS_HOST:6379/2
QUEUE_CONCURRENCY=5
ENABLE_JOBS=true
SOCKETIO_PATH=/socket.io
SOCKETIO_CORS_ORIGIN=http://PUBLIC_IP:8080
JWT_SECRET=CHANGE_ME_MIN_32
JWT_REFRESH_SECRET=CHANGE_ME_MIN_32
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
INTEGRATION_API_KEY=CHANGE_ME
AGENTHUB_PUBLIC_URL=http://PUBLIC_IP:3100
CORTEX_CC_API_BASE_URL=http://PUBLIC_IP:3030
BUSINESS_TIMEZONE=America/Guayaquil
STORAGE_PROVIDER=local
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=attachments
CHANNEL_CONFIG_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
ENVEOF
sed -i "s/PUBLIC_IP/$PUBLIC_IP/g" .env

npx prisma generate
npx prisma db push
pm2 start npm --name cortexcc-backend -- start

# Frontend
cd ~/CortexCC/frontend
npm ci

# IMPORTANTE: mantener frontend en 8080
cat > .env <<'ENVEOF'
VITE_API_URL=http://PUBLIC_IP:3030/api
VITE_WS_URL=http://PUBLIC_IP:3030
VITE_SOCKET_PATH=/socket.io
ENVEOF
sed -i "s/PUBLIC_IP/$PUBLIC_IP/g" .env

npm run build
pm2 start npm --name cortexcc-frontend -- run preview -- --host 0.0.0.0 --port 8080

pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -n 1 | bash
EOF
```

## 7) Validacion

```bash
curl "http://$PUBLIC_IP:3030/api/health"
curl -I "http://$PUBLIC_IP:8080"
```

## 8) Operacion basica

```bash
ssh -i "${KEY_NAME}.pem" ubuntu@"$PUBLIC_IP" "pm2 status"
ssh -i "${KEY_NAME}.pem" ubuntu@"$PUBLIC_IP" "pm2 logs cortexcc-backend --lines 100"
ssh -i "${KEY_NAME}.pem" ubuntu@"$PUBLIC_IP" "pm2 logs cortexcc-frontend --lines 100"
```

## 9) Notas importantes

- Este despliegue mantiene puertos:
  - backend `3030`
  - frontend `8080`
- Para produccion real:
  - usa RDS/ElastiCache privados en misma VPC.
  - usa HTTPS con ALB + ACM delante de `8080/3030`.
  - rota secretos fuera de `.env` (SSM Parameter Store / Secrets Manager).
