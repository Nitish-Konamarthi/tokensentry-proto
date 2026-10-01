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
- Security headers disabled by default (CSP: false, HSTS: false) — re-enable explicitly for HTTPS.
- Provider clients use native fetch (no SDK-level retry abstraction beyond provider-fetch wrapper: max 2 retries, 10s timeout, 4xx non-retryable).
- Integration tests require live PostgreSQL + Valkey (tests/integration/health.test.ts has 4 tests). Only 57 total tests exist.
