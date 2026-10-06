# TokenSentry Architecture — Agent Reference

Real structure verified from `api/src/app.ts` and package configs.

## Packages
- `api/` — Fastify 5 (proxy, budget, auth, analytics, agent-guard)
- `dashboard/` — Next.js 14 App Router (Auth0, live data for 6 pages, demo/static for 5)
- `website/` — Next.js 14 marketing (references unimplemented features)
- `shared-types/` — TypeBox schemas (`build` before consumption)
- `infrastructure/` — Docker Compose (PostgreSQL 16, Valkey 8, NGINX). V1 excludes: OpenTelemetry collector, Stripe, ClickHouse, pgvector, semantic cache backend.

## Request Flow (API)
```
Client POST /v1/proxy
→ NGINX (SSL, rate limit, proxy validation)
→ Fastify (helmet/cors/sensible)
→ Auth middleware (`requireApiKey` / HMAC)
→ Rate limiter (Valkey sliding window — custom, not `@fastify/rate-limit`)
→ Budget check (Valkey Lua — atomic)
→ Agent Guard (7-factor risk score)
→ Provider router (Anthropic/OpenAI/Gemini/Groq)
→ Response streamed/non-streamed + analytics
```

## Key Design Decisions (verified)
- Routes → Services → Repositories → DB. Do NOT bypass repositories in routes.
- Double validation: TypeBox (`validators/proxy.ts`) + Zod (`config/env.ts`). Keep aligned.
- Shared types must rebuild (`npm run build`) before API/dashboard use changes.
- No Kubernetes, Kafka, ClickHouse. Single VPS deployment via Docker Compose.

## Security Notes (verified fixes)
- `trustProxy`: configured from `TRUSTED_PROXY_CIDRS`; defaults to `false` when empty (not `true`).
- `extractClientIp`: single parser used by auth middleware and rate limiter; sanitizes `X-Forwarded-For` using `TRUSTED_PROXY_CIDRS`.
- Security headers enabled (`CSP` configured, `HSTS` enabled via `helmet`).
- `optionalAuth`: logs failures silently but does not expose errors to clients.
- Rate limiter: atomic Valkey Lua (`eval` with `INCR` + `PEXPIRE` combined) — no separate `pexpire()` race.
- Provider errors: typed (`ProviderRequestError`) with safe responses (`{ error, message, call_id }`); no provider response bodies or keys exposed.

## Data Storage
- PostgreSQL 16 (10 tables: organizations, api_keys, budgets, usage_logs, etc.) — persistent.
- Valkey 8 (cache/state) — rate limits, budget counters, agent state, auth cache. Not persistent.

## Testing
- 57 tests across 5 files (4 unit, 1 integration). Integration requires live DB + Valkey.
- Coverage: lines 70%, branches 60%.
