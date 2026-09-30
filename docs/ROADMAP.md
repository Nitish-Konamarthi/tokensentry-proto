# Roadmap — Verified from PROJECT_STATE.md

Maturity: ~75% MVP. Do NOT treat 0% items as implemented.

## Completed (~75-95%)
- AI Proxy (90%): streaming + non-streaming, 4 providers (Groq partial — no cost table, no streaming)
- Auth API key (90%): HMAC hashing, Valkey cache
- Agent Guard (85%): 7-factor scoring, Valkey-backed
- Budget (85%): Atomic Lua, per-org daily/monthly
- NGINX (95%), Docker (90%), Shared types (95%)

## In Progress / Partial
- Model Routing (80%): policy allowlisting, cost-aware fallback, tier-based fallback
- Analytics (70%): real-time counters + PG aggregation. ClickHouse NOT implemented.
- Stripe (75%): checkout, portal, webhook. Invoicing NOT implemented.
- Observability (70%): Sentry init only. No custom spans for budget/proxy/agent-guard.
- Dashboard (65%): 6 live API pages, 5 demo/static (providers, team, audit-log, settings, advisor)
- Tests (60%): 57 tests, 1 integration file (`tests/integration/health.test.ts`). No integration tests for proxy/budget/auth.

## Not Implemented (0%) — V1 explicitly excludes these
- Prompt Optimizer (`ENABLE_PROMPT_OPTIMIZER` remains `false`)
- Semantic / Exact Cache (`ENABLE_SEMANTIC_CACHE` remains `false`)
- ClickHouse analytics backend
- Stripe billing (routes/services exist but disabled in V1 deployment)
- OpenTelemetry custom spans (only Sentry init active)
- Supabase Vault, Resend email, pgvector, Kafka, Kubernetes, background workers
- AI-based complexity classification (placeholder `unknown`)
- Advisor AI Q&A (`routes/advisor.ts` disabled in V1 `app.ts`)

## Security Gaps (verified)
- Auth middleware (`optionalAuth` swallows errors; `remoteAddress` spoofable)
- Rate limiter race (`pexpire` after `exec()`)
- Security headers disabled (`CSP: false`, `hsts: false`)

Next steps (verified from `analysis.md`): fix auth/rate-limit security, complete dashboard data wiring, add integration tests for proxy/budget/auth, initialize git/version control, complete docs.
