# TokenSentry Deployment

## Overview

TokenSentry V1 is designed to run as a lightweight gateway backed by PostgreSQL and Valkey.

A simple deployment looks like:

```text
                    Internet
                       │
                       ▼
                     NGINX
                       │
                       ▼
                TokenSentry API
                 │          │
                 ▼          ▼
            PostgreSQL     Valkey
                 │
                 ▼
             Providers
```

The architecture is intentionally small and does not require Kubernetes or a distributed infrastructure stack.

---

# Prerequisites

A deployment requires:

- Linux server or equivalent environment
- Docker
- Docker Compose
- Network access to required LLM providers
- PostgreSQL
- Valkey
- Provider credentials
- TokenSentry configuration

---

# Environment Configuration

TokenSentry configuration is supplied through environment variables.

Typical configuration categories include:

```text
Application
Database
Valkey
Authentication
Provider credentials
Rate limits
Budget policies
Trusted proxy configuration
```

Use the repository's `.env.example` as the source of truth for variable names.

Do not copy production secrets into Git.

---

# Docker Deployment

From the repository root:

```bash
docker compose up -d
```

Verify the services:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

To inspect API logs specifically:

```bash
docker compose logs -f api
```

The exact service name should match the current `docker-compose.yml`.

---

# Database

PostgreSQL stores persistent TokenSentry data.

Before starting the application in a fresh environment:

1. Start PostgreSQL.
2. Configure the database connection.
3. Run the application's database initialization/migration process.
4. Start TokenSentry.

Database migrations should be applied using the project's current migration tooling.

---

# Valkey

Valkey provides shared fast state for controls such as:

- Rate limiting
- Budget enforcement
- Agent Guard
- Other transient gateway state

Valkey should be reachable by the TokenSentry API service.

---

# Reverse Proxy

NGINX can sit in front of TokenSentry:

```text
Internet
   │
   ▼
 NGINX
   │
   ▼
TokenSentry
```

The reverse proxy should:

- Terminate TLS
- Forward requests to TokenSentry
- Preserve required request headers
- Apply appropriate connection/request limits
- Restrict access to internal TokenSentry ports where appropriate

---

# TLS

Production deployments should terminate HTTPS at the public edge.

The recommended flow is:

```text
Client
  │
  │ HTTPS
  ▼
NGINX
  │
  │ HTTP/internal HTTPS
  ▼
TokenSentry
```

Never expose production API credentials through an unencrypted public connection.

---

# Trusted Proxy Configuration

When TokenSentry is behind NGINX or another reverse proxy, configure trusted proxy ranges explicitly.

The gateway must distinguish between:

```text
Trusted infrastructure headers
```

and:

```text
Client-controlled headers
```

Incorrect trusted-proxy configuration can affect IP-based controls such as rate limiting.

Only networks that are genuinely trusted should be configured as trusted proxies.

---

# Provider Credentials

Provider credentials must remain server-side.

Examples include credentials for:

```text
OpenAI
Anthropic
Google
Groq
```

Clients should authenticate with TokenSentry rather than receiving provider credentials.

The intended architecture is:

```text
Client
   │
   │ TokenSentry credential
   ▼
TokenSentry
   │
   │ Provider credential
   ▼
Provider
```

---

# Production Checklist

Before exposing TokenSentry publicly:

- [ ] HTTPS enabled
- [ ] Production secrets configured securely
- [ ] Provider credentials stored server-side
- [ ] Database configured
- [ ] Valkey configured
- [ ] Trusted proxy ranges explicitly configured
- [ ] Default development credentials removed
- [ ] Debug/development settings disabled
- [ ] Rate limits configured
- [ ] Budgets configured
- [ ] Health checks verified
- [ ] Provider connectivity verified
- [ ] Database migrations applied
- [ ] Logs verified
- [ ] Backup strategy established for persistent data
- [ ] Firewall rules reviewed

---

# Operational Verification

After deployment, verify:

```text
NGINX
  │
  ▼
TokenSentry
  │
  ├── PostgreSQL
  │
  ├── Valkey
  │
  └── Provider
```

A useful validation sequence is:

1. Check service health.
2. Authenticate with a valid TokenSentry credential.
3. Send a valid proxy request.
4. Verify provider execution.
5. Verify the returned call ID.
6. Verify usage/accounting.
7. Test rate limiting.
8. Test budget enforcement.
9. Test an invalid model.
10. Test provider failure handling.

---

# Scaling

V1 can begin as a single gateway instance:

```text
             ┌─────────────┐
Internet ───►│ TokenSentry │
             └──────┬──────┘
                    │
             ┌──────┴──────┐
             ▼             ▼
        PostgreSQL       Valkey
```

If actual traffic requires horizontal scaling:

```text
                  NGINX / LB
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          Gateway   Gateway   Gateway
             │         │         │
             └─────────┼─────────┘
                       │
                 Shared state
                 PostgreSQL
                    Valkey
```

The gateway should only be distributed when there is a concrete availability or throughput requirement.

---

# Backups

PostgreSQL contains persistent application data and should have an appropriate backup strategy in production.

Valkey state should be treated according to the semantics of each stored value. Not all gateway state necessarily has the same durability requirements as PostgreSQL data.

---

# Monitoring

V1 intentionally does not require a complex observability stack.

Start with:

- Application logs
- Container logs
- Health checks
- Provider error rates
- Request counts
- Budget usage
- Database health
- Valkey health

Additional observability infrastructure can be introduced when operational requirements justify it.

---

# Deployment Philosophy

TokenSentry V1 should be deployed as simply as possible.

The recommended progression is:

```text
Local Docker Compose
        ↓
Single production VM
        ↓
Horizontal gateway scaling
        ↓
More advanced infrastructure
```

Do not introduce distributed infrastructure before the workload requires it.