# TokenSentry V1 - Low-Cost / Free-Tier Deployment

Target: one stateless API service + managed PostgreSQL + managed Valkey + static frontend.
No Kubernetes, Kafka, ClickHouse, OpenTelemetry collector, Prometheus/Grafana, background workers, dedicated NGINX required.

## Architecture (Verified)
Client -> TokenSentry API (Fastify 5) -> Auth + Rate Limit + Budget (Valkey Lua) + Agent Guard (Valkey) -> Provider Router -> Provider Fetch -> Usage Accounting (PostgreSQL) + Audit (PostgreSQL) + Real-time Valkey counters
Dashboard (Next.js) -> Auth0 login -> Live API hooks (polling every 30s)
No LLM/SLM inside request path. No semantic cache. No prompt optimizer. No ClickHouse.

## Required Environment Variables (.env)
NODE_ENV, PORT, HOST, API_KEY_PEPPER, DATABASE_URL, VALKEY_URL, AUTH0_DOMAIN, AUTH0_AUDIENCE, ANTHROPIC_API_KEY (or OPENAI/GEMINI/GROQ), ENCRYPTION_KEY, TRUSTED_PROXY_CIDRS
Agent Guard thresholds: AGENT_GUARD_MAX_RPS, AGENT_GUARD_RETRY_RATIO, AGENT_GUARD_TOOL_RATIO, AGENT_GUARD_RECURSIVE_DEPTH_LIMIT, AGENT_GUARD_SESSION_TTL_SECONDS, AGENT_GUARD_BLOCK_TTL_SECONDS
Rate limit: RATE_LIMIT_PROXY_ORG (default 500)

## Startup Commands
npm ci
npm run db:migrate
npm run dev  (dev)
docker compose up -d  (production)

## Migration
npm run db:migrate  (Drizzle Kit)
npm run db:seed  (optional demo data)
DB schema: sql/01-postgres-schema.sql (10 tables)
Migration meta: sql/drizzle/

## Health / Readiness
GET /health/live -> { status, uptime, timestamp }
GET /health/ready -> DB + Valkey health checks (503 if DB down)

## Graceful Shutdown
SIGTERM / SIGINT handlers in api/src/index.ts: close Fastify, closePg (5s timeout), closeValkey.
No ungraceful exits in production mode.

## Free-Tier Limitations (Documented)
- Single instance only (docker-compose supports multi-service but not multi-replica; no Kubernetes).
- Analytics aggregated in PostgreSQL + Valkey counters (not ClickHouse). Real-time spans not implemented.
- Dashboard pages: providers, team, audit-log, settings use live API; advisor uses demo/static data.
- No email notifications (Resend not implemented).
- Security headers enabled (CSP configured, HSTS enabled via `helmet`). `TRUSTED_PROXY_CIDRS` defines trusted proxies; `trustProxy` defaults to `false` when empty.
- Provider clients use native fetch with typed error classification (`ProviderRequestError`). Provider errors distinguish: `PROVIDER_AUTH`, `PROVIDER_RATE_LIMIT`, `PROVIDER_BAD_REQUEST`, `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_NETWORK`, `PROVIDER_ERROR`. Retries applied to 5xx/timeout/network only (not 400/401/403/404/405/422/429).
- Budget enforcement: organization-level only in V1 (`budget:monthly:{orgId}:{yyyyMm}`, `budget:daily:{orgId}:{date}`). Atomic Valkey Lua reserves estimated cost; releases on provider failure; reconciles actual - estimated after success.
- Integration tests: `tests/integration/health.test.ts` (4 tests). Unit tests: 117 behavioral and integration tests across 12 files.
