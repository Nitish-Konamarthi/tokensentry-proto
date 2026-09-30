# TokenSentry Infrastructure

Docker Compose, NGINX, and OTel configs for production deployment.

## Services

| Service | Image | Role |
|---------|-------|------|
| nginx | 1.27-alpine | Reverse proxy (3 vhosts) |
| certbot | v2.9 | SSL auto-renewal (12h) |
| api | Dockerfile (../api) | Fastify AI governance API |
| dashboard | Dockerfile (../dashboard) | Next.js admin dashboard |
| postgres | 16-alpine | Primary database |
| valkey | 8-alpine | Cache, rate limits, agent state |
| pgbackup | 16-alpine | Daily pg_dump (7-day retention) |
| otel-collector | 0.115 | OpenTelemetry pipeline |

## Directory

```
nginx/
├── nginx.conf           # Master config
└── conf.d/
    ├── api.conf         # api.tokensentry.ai
    ├── dashboard.conf   # app.tokensentry.ai
    └── landing.conf     # tokensentry.ai
otel/                    # OTel collector config
scripts/                 # backup.sh
```

## Quick Start

```bash
openssl dhparam -out nginx/ssl/dhparam.pem 2048
cp .env.example .env   # Edit secrets
docker compose up -d
```

## CI/CD

- `.github/workflows/ci.yml` — Validates NGINX + Docker Compose configs
- `.github/workflows/deploy.yml` — Deploys to VPS via SSH
