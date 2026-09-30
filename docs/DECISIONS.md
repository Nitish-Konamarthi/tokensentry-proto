# Key Decisions — Verified from Code

Only decisions an agent would miss without reading `analysis.md`, `api/README.md`, and `PROJECT_STATE.md`.

1. **Single VPS, no Kubernetes/Kafka/ClickHouse** (`api/README.md`). Do NOT introduce microservices or event sourcing.
2. **Custom Valkey rate limiter** (`services/rate-limiter.ts`), NOT `@fastify/rate-limit` plugin, despite plugin being installed. Race exists.
3. **Atomic budget via Lua** (`services/budget.ts`). Monthly (`budget:monthly:{orgId}:{yyyyMm}`) + daily (`budget:daily:{orgId}:{date}`) counters.
4. **Agent Guard: 7-factor scoring** (`agent-guard.ts`). Blocked sessions in Valkey (`agent:blocked:{sessionId}`). Integration tests missing.
5. **Dashboard: 5 pages demo/static** (providers, team, audit-log, settings, advisor). Wire to live API before showing real data.
6. **Website references unimplemented features** (semantic cache, prompt optimizer). Do NOT implement from marketing copy alone.
7. **No git history** (`PROJECT_STATE.md`). Initialize with `git init` before branching.
8. **TypeScript strict + ESM** (`tsconfig.json`). Shared-types builds before consumption.
9. **Security headers disabled** (`api/src/app.ts`). Re-enable only with explicit instruction.
10. **Verification order matters**: `typecheck` → `lint` → `test` → `build`. Integration tests need PostgreSQL 16 + Valkey 8.
