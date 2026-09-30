# TokenSentry Deployment Guide

## Prerequisites

- VPS: 4 GB RAM, 2 vCPU, 50 GB SSD
- Domains: `api.tokensentry.ai`, `app.tokensentry.ai`, `tokensentry.ai`
- 6 GitHub repos: `api`, `dashboard`, `website`, `shared-types`, `infrastructure`, `docs`

## Server Setup

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
usermod -aG docker $USER
```

```bash
mkdir -p /opt/tokensentry

# Clone repos
cd /opt/tokensentry
git clone git@github.com:tokensentry-ai/api.git
git clone git@github.com:tokensentry-ai/dashboard.git
git clone git@github.com:tokensentry-ai/website.git
git clone git@github.com:tokensentry-ai/infrastructure.git

# Create .env
cp infrastructure/.env.example .env
nano .env  # Fill in secrets
```

## SSL Setup

```bash
openssl dhparam -out infrastructure/nginx/ssl/dhparam.pem 2048

cd /opt/tokensentry
docker compose -f infrastructure/docker-compose.yml up -d nginx

docker compose -f infrastructure/docker-compose.yml run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d api.tokensentry.ai -d app.tokensentry.ai \
  -d tokensentry.ai -d www.tokensentry.ai \
  --email admin@tokensentry.ai --agree-tos --non-interactive

docker compose -f infrastructure/docker-compose.yml restart nginx
```

## Start Services

```bash
docker compose -f infrastructure/docker-compose.yml up -d
curl https://api.tokensentry.ai/health/ready
```

## Monitoring

OTel collector exposes Prometheus metrics on port `8889` (localhost only):

```bash
curl http://localhost:8889/metrics | head -20
```

To forward traces/metrics/logs to an external backend (Grafana Cloud, SigNoz, etc.):
```bash
# In .env, set:
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.grafana.net:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic base64_credentials
OTEL_INSECURE=false
```

## Daily Operations

```bash
# Logs
docker compose logs --tail=50 -f api

# Backup
docker compose exec pgbackup /usr/local/bin/backup.sh

# Update
cd /opt/tokensentry
for repo in api dashboard infrastructure; do
  cd $repo && git pull && cd ..
done
docker compose -f infrastructure/docker-compose.yml pull api dashboard
docker compose -f infrastructure/docker-compose.yml up -d --no-deps api dashboard nginx
```

## Directory Structure

```
/opt/tokensentry/
├── .env                    # Shared secrets
├── api/                    # Fastify API
├── dashboard/              # Next.js Dashboard
├── website/                # Marketing site
├── infrastructure/
│   ├── docker-compose.yml  # All services
│   ├── nginx/              # Reverse proxy configs
│   ├── otel/               # OpenTelemetry config
│   ├── scripts/            # Backup scripts
│   └── .env.example        # Template
└── docs/                   # Architecture docs
```
