# TokenSentry — Agent Workspace Instructions

Only keep what an agent would miss. Read `PROJECT_STATE.md` for full maturity details before large changes.

## Project Purpose
Enterprise AI Gateway and Governance Platform. Drop-in proxy that saves 50-80% on AI API costs via budget enforcement, model routing, agent monitoring, and analytics. 4 packages + infrastructure.

## Packages (do NOT cross-modify blindly)
- `api/` — Fastify 5 server. Core proxy (`POST /v1/proxy`), budget enforcement (Valkey Lua), agent guard (7-factor scoring), analytics.
- `dashboard/` — Next.js 14 App Router. Auth0 login. 6 live pages, 5 demo/static (providers, team, audit-log, settings, advisor).
- `website/` — Next.js 14 marketing site. References unimplemented features (semantic cache, prompt optimizer) — do NOT assume they work.
- `shared-types/` — TypeBox schemas. Must rebuild (`npm run build`) before API/dashboard consume changes.
- `infrastructure/` — Docker Compose, NGINX, PostgreSQL 16, Valkey 8, OpenTelemetry.

## Verified Commands (run exactly)
- `api/`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`, `npm run dev`, `npm run db:migrate`
- `dashboard/`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run dev -p 3001`
- `website/`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run dev -p 3000`
- `shared-types/`: `npm ci`, `npm run build`, `npm run typecheck`
- Root/test: `docker compose up -d` (needs `.env` from `.env.example`)

Test prerequisites: PostgreSQL 16 + Valkey 8 running. Integration tests (`tests/integration/health.test.ts`) require live DB. Only 57 tests exist — coverage thresholds: lines 70%, branches 60%.

## Architecture (verified from `api/src/app.ts`, `PROJECT_STATE.md`)
- Routes (`routes/*.ts`) → Services (`services/*.ts`) → Repositories (`repositories/*.ts`) → DB (Drizzle ORM, `sql/drizzle/` migrations).
- Auth: `middleware/auth.ts` (Bearer `ts_` + HMAC). `optionalAuth` silently swallows errors — do NOT trust it for security checks.
- Rate limit: Custom Valkey sliding window (`services/rate-limiter.ts`), NOT `@fastify/rate-limit` plugin. Race possible between `multi().exec()` and `pexpire()`.
- Budget: Atomic Valkey Lua (`services/budget.ts`). Per-org daily/monthly counters (`budget:monthly:{orgId}:{yyyyMm}`).
- Agent Guard: 7-factor risk score (`agent-guard.ts`). Blocked sessions stored in Valkey (`agent:blocked:{sessionId}`).
- Provider clients (`clients/providers/*.ts`): Anthropic/OpenAI/Gemini use SDK-style adapters; Groq partial (no cost table, no streaming).

## Critical Constraints (verified from `analysis.md`, code)
- `trustProxy: true` is set without strict proxy validation — `request.socket.remoteAddress` is spoofable. `extractClientIp` must sanitize `X-Forwarded-For`.
- Security headers disabled (`contentSecurityPolicy: false`, `hsts: false`).
- `optionalAuth` ignores all errors — hidden failures likely.
- Rate limiter uses separate `pexpire` after `exec()` — small race window.
- Unimplemented marketing features exist as env flags: `ENABLE_SEMANTIC_CACHE` (0%), `ENABLE_PROMPT_OPTIMIZER` (0%). Code contains placeholders (`services/cache.ts`, `optimizer/smol-local-optimizer.ts`).
- Dashboard pages (providers, team, audit-log, settings, advisor) use demo/static data — wire to live API before showing real data.
- No ClickHouse, pgvector, Supabase Vault, Resend email, or real-time analytics spans implemented.
- No git history (`PROJECT_STATE.md`: "No git history").

## Coding Conventions
- TypeScript strict (`tsconfig.json`). ESM (`"type": "module"` in shared-types). Path aliases (`@/*`) used in API.
- Validation: Double layer — TypeBox (`validators/proxy.ts`) + Zod (`config/env.ts`). Keep aligned.
- Logging: Pino (`lib/logger.ts`). Redact sensitive info (API keys, payload fragments) before logging.
- DB migrations: Drizzle Kit (`drizzle.config.ts`). Schema at `api/src/db/schema.ts`. Migration SQL at `sql/01-postgres-schema.sql`.
- Shared types: `shared-types/src/` (TypeBox). Rebuild before API/dashboard changes.

## Git Safety Rules
- No remote configured. Initialize with `git init` before creating branches.
- Do NOT delete existing files (`docs/README.md`, `analysis.md`, `PROJECT_STATE.md`, `structure.txt`).
- Do NOT rewrite application code unless explicitly instructed. Preserve `api/src/app.ts` architecture (routes → plugins → hooks → error handler order matters).
- Preserve `PROJECT_STATE.md` and `CHANGELOG.md` format.

## When to Read Additional Docs (in this order)
1. `PROJECT_STATE.md` — maturity percentages, missing features, known flaws.
2. `analysis.md` — line-level flaws (auth middleware, rate limiter race, provider gaps).
3. `api/README.md` — architecture principles (no Kubernetes, no Kafka, run on one VPS initially).
4. `docs/README.md` — points to `docs/architecture.md` (stub; external file missing).
5. `infrastructure/DEPLOYMENT_GUIDE.md` and `PRODUCTION_CHECKLIST.md` — only if deploying.
6. `openapi.yaml` — spec may not match all routes; sync before changing endpoints.

## Verification Workflow (before finishing)
Always run in order for `api/` changes:
1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build` (only after tests pass)
For `dashboard/`/`website/`: `npm run lint` → `npm run typecheck` → `npm run build`.
For `shared-types/`: `npm run build` → `npm run typecheck`.
Do NOT skip typecheck — ESM + strict mode catches import errors.
