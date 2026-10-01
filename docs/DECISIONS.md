# Key Decisions — Verified from Code

Only decisions an agent would miss without reading `api/README.md` and source code.

1. **Single VPS, no Kubernetes/Kafka/ClickHouse** (`api/README.md`). Do NOT introduce microservices or event sourcing.
2. **Custom Valkey rate limiter** (`services/rate-limiter.ts`), NOT `@fastify/rate-limit` plugin, despite plugin being installed. Race exists.
3. **Atomic budget via Lua** (`services/budget.ts`). Monthly (`budget:monthly:{orgId}:{yyyyMm}`) + daily (`budget:daily:{orgId}:{date}`) counters.
4. **Agent Guard: 7-factor scoring** (`agent-guard.ts`). Blocked sessions in Valkey (`agent:blocked:{sessionId}`). Integration tests missing.
5. **Dashboard: 5 pages demo/static** (providers, team, audit-log, settings, advisor). Wire to live API before showing real data.
6. **No git history**. Initialize with `git init` before branching.
7. **TypeScript strict + ESM** (`tsconfig.json`). Shared-types builds before consumption.
8. **Security headers disabled** (`api/src/app.ts`). Re-enable only with explicit instruction.
9. **Verification order matters**: `typecheck` → `lint` → `test` → `build`. Integration tests need PostgreSQL 16 + Valkey 8.
10. **V1 exclusions (verified)**: Stripe billing, prompt optimizer, semantic/exact cache, ClickHouse, pgvector, Kafka, Kubernetes, OpenTelemetry collector, background workers, AI complexity classifier, Supabase Vault, Resend email. Files deleted; keep existing abstractions.
