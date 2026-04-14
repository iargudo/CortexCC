#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$AWS_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$AWS_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Copy deploy/aws/.env.example to deploy/aws/.env and fill values."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required_vars=(
  AWS_REGION STACK_NAME INSTANCE_TYPE AMI_ID KEY_NAME
  GIT_URL GIT_REF BACKEND_PORT FRONTEND_PORT DATABASE_URL REDIS_URL
)

for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing required variable: $v"
    exit 1
  fi
done

if [[ "$BACKEND_PORT" != "3030" || "$FRONTEND_PORT" != "8080" ]]; then
  echo "Ports are fixed by project rules: BACKEND_PORT=3030 and FRONTEND_PORT=8080"
  exit 1
fi

for cmd in aws ssh scp curl; do
  command -v "$cmd" >/dev/null || { echo "Missing command: $cmd"; exit 1; }
done

MY_IP_CIDR="$(curl -s https://checkip.amazonaws.com | tr -d '\n')/32"
KEY_PATH="$AWS_DIR/${KEY_NAME}.pem"

echo "Resolving default VPC/Subnet..."
VPC_ID="$(aws ec2 describe-vpcs --region "$AWS_REGION" \
  --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SUBNET_ID="$(aws ec2 describe-subnets --region "$AWS_REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "Creating key pair $KEY_NAME..."
  aws ec2 create-key-pair --region "$AWS_REGION" --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text > "$KEY_PATH"
  chmod 400 "$KEY_PATH"
else
  echo "Using existing key file: $KEY_PATH"
fi

echo "Creating security group..."
SG_ID="$(aws ec2 create-security-group --region "$AWS_REGION" \
  --group-name "${STACK_NAME}-sg-$(date +%s)" \
  --description "CortexCC SG" --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)"

aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP_CIDR,Description=SSH}]"
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=3030,ToPort=3030,IpRanges=[{CidrIp=0.0.0.0/0,Description=Backend}]"
aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=8080,ToPort=8080,IpRanges=[{CidrIp=0.0.0.0/0,Description=Frontend}]"

echo "Launching EC2 instance..."
INSTANCE_ID="$(aws ec2 run-instances --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":40,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${STACK_NAME}-ec2}]" \
  --query 'Instances[0].InstanceId' --output text)"

aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
PUBLIC_IP="$(aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
echo "EC2 running at: $PUBLIC_IP"

echo "Waiting for SSH..."
for _ in {1..60}; do
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY_PATH" ubuntu@"$PUBLIC_IP" "echo ok" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

echo "Provisioning runtime..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@"$PUBLIC_IP" <<'EOF'
set -euo pipefail
sudo apt-get update
sudo apt-get install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
EOF

echo "Deploying CortexCC..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@"$PUBLIC_IP" bash <<EOF
set -euo pipefail
rm -rf ~/CortexCC
git clone --branch "$GIT_REF" "$GIT_URL" ~/CortexCC

cd ~/CortexCC/backend
npm ci
npm run build
cat > .env <<'ENVEOF'
NODE_ENV=production
PRISMA_LOG_QUERIES=${PRISMA_LOG_QUERIES}
PORT=${BACKEND_PORT}
API_PREFIX=${API_PREFIX}
CORS_ORIGIN=${CORS_ORIGIN}
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
QUEUE_CONCURRENCY=${QUEUE_CONCURRENCY}
ENABLE_JOBS=${ENABLE_JOBS}
SOCKETIO_PATH=${SOCKETIO_PATH}
SOCKETIO_CORS_ORIGIN=${SOCKETIO_CORS_ORIGIN}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN}
JWT_REFRESH_EXPIRES_IN=${JWT_REFRESH_EXPIRES_IN}
INTEGRATION_API_KEY=${INTEGRATION_API_KEY}
AGENTHUB_PUBLIC_URL=${AGENTHUB_PUBLIC_URL}
CORTEX_CC_API_BASE_URL=${CORTEX_CC_API_BASE_URL}
BUSINESS_TIMEZONE=${BUSINESS_TIMEZONE}
STORAGE_PROVIDER=${STORAGE_PROVIDER}
AZURE_STORAGE_CONNECTION_STRING=${AZURE_STORAGE_CONNECTION_STRING}
AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER}
CHANNEL_CONFIG_ENCRYPTION_KEY=${CHANNEL_CONFIG_ENCRYPTION_KEY}
ENVEOF
npx prisma generate
npx prisma db push
pm2 start npm --name cortexcc-backend -- start

cd ~/CortexCC/frontend
npm ci
cat > .env <<'ENVEOF'
VITE_API_URL=${VITE_API_URL}
VITE_WS_URL=${VITE_WS_URL}
VITE_SOCKET_PATH=${VITE_SOCKET_PATH}
ENVEOF
npm run build
pm2 start npm --name cortexcc-frontend -- run preview -- --host 0.0.0.0 --port ${FRONTEND_PORT}
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -n 1 | bash
EOF

echo "Deployment complete."
echo "Frontend: http://$PUBLIC_IP:${FRONTEND_PORT}"
echo "Backend:  http://$PUBLIC_IP:${BACKEND_PORT}${API_PREFIX}/health"
