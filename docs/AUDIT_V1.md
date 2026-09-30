# TokenSentry V1 — Source-Verified Audit & Plan (Read-Only Original; Updated Post-Build)

Verified against actual source (`api/src/*`, `tests/*`, `shared-types/src/*`). `analysis.md` and `PROJECT_STATE.md` referenced but treated as secondary.

---

## 1. Actual Repository Map (verified)

- `api/src/app.ts`: Fastify 5 factory. Routes registered: health, proxy, budgets, api-keys, analytics, agent-guard, audit-logs, providers, settings, team. **V1 excludes**: stripe (`routes/stripe.ts`), advisor (`routes/advisor.ts`) — removed from `app.ts`.
- `api/src/routes/proxy.ts`: `POST /v1/proxy`. Delegates to `decisionEngine.decide()`.
- `api/src/intelligence/decision-engine/DecisionEngine.ts`: Orchestrates budget (`budgetService`), agent guard (`agentGuardService`), routing (`routerService`), provider (`providerRouter`), analytics (`analyticsService`). **V1 excludes exact cache** (`getExactCache` removed) and skips optimizer (`env.ENABLE_PROMPT_OPTIMIZER` false by default).
- `api/src/services/budget.ts`: Atomic Valkey Lua (`BUDGET_CHECK_SCRIPT`). **Verified**: fails open on Valkey error (line 78-88 in original); V1 must fix.
- `api/src/services/auth.ts`: HMAC hash + Valkey cache (300s) + PG query.
- `api/src/services/agent-guard.ts`: 7-factor scoring (`computeRiskScore`, lines 137-223). Lua `LUA_RECORD_TURN` (lines 37-105).
- `api/src/middleware/auth.ts`: `requireApiKey` (Bearer `ts_` + HMAC). `optionalAuth` (swallows errors silently — verified flaw).
- `api/src/middleware/rate-limit.ts`: Custom Valkey sliding window (`multi().incr().pttl().exec()` then `pexpire()` — race verified).
- `tests/unit/`: 4 files (`router`, `crypto`, `budget`, `agent-guard`) — 45 tests. `tests/integration/health.test.ts` — 4 tests.

---

## 2. V1 Components — Verified Status

| Component | Source Evidence | V1 Status |
|---|---|---|
| API-key auth | `auth.ts` + `services/auth.ts` | Working |
| Rate limit | `rate-limiter.ts` | Working (race exists) |
| Budget enforcement | `budget.ts` (Lua) | Working (fails open — must fix) |
| Agent Guard | `agent-guard.ts` (7 factors, Lua) | Working |
| Health checks | `routes/health.ts` | Working |
| Provider clients (OpenAI) | `clients/providers/openai.ts` (native fetch) | Working |
| Streaming proxy | `routes/proxy.ts` (`streamHandler`) | Working |
| Audit/repo insertion | `repositories/audit-log.ts`, `repositories/usage-log.ts` | Exists |
| Basic dashboard | `dashboard/app/` (6 live, 5 demo/static) | Partial |

---

## 3. Broken Components (Verified)

| Component | Source Lines | Severity |
|---|---|---|
| `optionalAuth` swallows errors | `middleware/auth.ts:47-50` | Critical |
| Auth/rate-limit IP spoofing | `auth.ts:29`, `rate-limit.ts:9` (`remoteAddress`) | Critical |
| Budget fails open | `services/budget.ts:78-88` | Critical |
| Rate limiter race | `services/rate-limiter.ts:21-23` | High |
| Proxy error suppression | `routes/proxy.ts:63-69` (empty catch) | High |
| Health `ready` logic | `routes/health.ts:16-20` | Low |

---

## 4. Security Vulnerabilities (Verified)

- `optionalAuth` ignores errors (`auth.ts:47-50`).
- `trustProxy: true` unvalidated; `extractClientIp` exists but middleware uses `remoteAddress` directly.
- Security headers disabled (`CSP: false`, `hsts: false`).
- Budget fails open on Valkey error.
- Rate limiter race allows concurrent bypass.

---

## 5. Unnecessary Components — Disabled / Removed for V1 (Verified Changes)

| Component | Source Evidence | V1 Action Taken |
|---|---|---|
| Stripe billing | `routes/stripe.ts`, `services/stripe.ts` | **Disabled**: removed from `app.ts` routes |
| Advisor AI Q&A | `routes/advisor.ts` (Anthropic Q&A) | **Disabled**: removed from `app.ts` routes |
| Exact / semantic cache | `services/cache.ts`, `DecisionEngine.ts` `getExactCache` / `setExactCache` | **Disabled**: calls removed from `DecisionEngine` |
| Prompt optimizer | `intelligence/optimizer/index.ts`, `smol-local-optimizer.ts` | **Disabled**: `ENABLE_PROMPT_OPTIMIZER` remains `false`; `DecisionEngine` checks flag |
| ClickHouse analytics | Not implemented; referenced in docs/website | **Removed references** in docs/website |
| OpenTelemetry collector | `infrastructure/docker-compose.yml` (`otel-collector` service) | **Disabled**: service removed from compose |
| Supabase Vault | `.env.example` references (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) | **Cleaned**: variables removed from `.env.example` |
| Resend email | `.env.example` (`RESEND_API_KEY`, `EMAIL_FROM`) | **Cleaned**: variables removed |
| AI complexity classifier | `intelligence/analyzer/index.ts` (`complexity: 'unknown'`) | **Documented**: placeholder remains; no classifier implemented |

---

## 6. Changes Made (Post-Audit, Build Mode)

1. `api/.env.example`: Removed Stripe, Vault, Email, feature flags cleaned; kept flags false.
2. `website/app/page.tsx`: Removed false marketing claims (semantic cache, prompt optimizer, AI classifier, ClickHouse, Supabase Vault); updated feature list and FAQ.
3. `api/src/app.ts`: Removed `stripeRoutes` and `advisorRoutes` imports/registrations.
4. `api/src/intelligence/decision-engine/DecisionEngine.ts`: Removed `getExactCache` and `setExactCache` calls; removed import.
5. `docs/ARCHITECTURE.md`: Updated infrastructure note (excludes OTel collector, Stripe, etc.).
6. `docs/DECISIONS.md`: Added V1 exclusions entry.
7. `docs/ROADMAP.md`: Updated Not Implemented section with V1 exclusions.
8. `docs/AUDIT_V1.md`: Created (full audit summary).

---

## 7. Intentionally Left for Later (P0 / P1 / P2)

- **P0 (security/fix)**: Fix `optionalAuth` error swallowing; fix auth/rate-limit `remoteAddress` spoofing; fix budget fails open (`budgetService.checkAndDeduct` error path); fix rate limiter race (`pexpire` in multi or Lua); fix health `ready` logic; verify proxy stream error handling.
- **P1 (reliability/tests)**: Integration tests for proxy, auth, budget, agent-guard, rate limit; provider retry/backoff; shared-types rebuild enforcement; dashboard live API wiring verification.
- **P2 (deferred)**: Stripe billing route/service (files preserved); prompt optimizer (`optimizer/*` files preserved); exact/semantic cache (`services/cache.ts` preserved); OpenTelemetry spans (`instrumentation.ts` preserved); ClickHouse, pgvector, Kafka, Kubernetes, background workers, advisor Q&A, AI classifier.

---

## 8. Verification Commands (Run Before Any Future Changes)

```
api/: npm run typecheck → npm run lint → npm test → npm run build
dashboard/: npm run lint → npm run typecheck → npm run build
website/: npm run lint → npm run typecheck → npm run build
shared-types/: npm run build → npm run typecheck
```

Prerequisites: PostgreSQL 16 + Valkey 8 running (`infrastructure/docker-compose.yml`).
