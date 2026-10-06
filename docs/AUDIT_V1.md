# TokenSentry V1 — Source-Verified Audit & Plan

Verified against actual source (`api/src/*`, `tests/*`, `shared-types/src/*`).

---

## 1. Actual Repository Map (verified)

- `api/src/app.ts`: Fastify 5 factory. Routes registered: health, proxy, budgets, api-keys, analytics, agent-guard, audit-logs, providers, settings, team.
- `api/src/routes/proxy.ts`: `POST /v1/proxy`. Delegates to `decisionEngine.decide()`.
- `api/src/intelligence/decision-engine/DecisionEngine.ts`: Orchestrates budget (`budgetService`), agent guard (`agentGuardService`), routing (`routerService`), provider (`providerRouter`), analytics (`analyticsService`).
- `api/src/services/budget.ts`: Atomic Valkey Lua (`BUDGET_CHECK_SCRIPT`, `BUDGET_RELEASE_SCRIPT`). **Fixed**: releases reservation on provider failure; fails closed on Valkey error; enforces organization-level budgets only.
- `api/src/services/auth.ts`: HMAC hash + Valkey cache (300s) + PG query.
- `api/src/services/agent-guard.ts`: 7-factor scoring (`computeRiskScore`). Lua `LUA_RECORD_TURN`. **Fixed**: retry incremented exactly once in `evaluate`, not duplicated in `recordTurn`.
- `api/src/middleware/auth.ts`: `requireApiKey` (Bearer `ts_` + HMAC). `optionalAuth` logs failures but does not block.
- `api/src/middleware/rate-limit.ts`: Custom Valkey sliding window (`eval` with atomic Lua — `INCR` + `PEXPIRE` combined). **Verified**: atomic, no separate `pexpire` race.
- `tests/unit/`: 12 test files (161 tests). `tests/integration/health.test.ts` — integration tests.

---

## 2. V1 Components — Verified Status

| Component | Source Evidence | V1 Status |
|---|---|---|
| API-key auth | `auth.ts` + `services/auth.ts` | Working |
| Rate limit | `rate-limiter.ts` (atomic Lua) | Working |
| Budget enforcement | `budget.ts` (Lua) | Working — org-level only; releases on provider failure |
| Agent Guard | `agent-guard.ts` (7 factors, Lua) | Working — retry count consistent; blocked/session state consistent |
| Health checks | `routes/health.ts` | Working — live (200, no dependency check); ready (200 ok / 503 degraded) |
| Provider clients (Anthropic/OpenAI/Gemini/Groq) | `clients/providers/*.ts` | Working — typed errors preserved (`ProviderRequestError`) |
| Streaming proxy | `routes/proxy.ts` (`streamHandler`) | Working — attempts usage parsing from stream chunks |
| Audit/repo insertion | `repositories/*.ts` | Exists |
| Basic dashboard | `dashboard/app/` (6 live, 5 demo/static) | Partial |

---

## 3. Fixed Issues (Verified)

| Component | Fix | Source Evidence |
|---|---|---|
| Provider error classification | `provider-fetch.ts`: `ProviderRequestError` with typed codes; provider adapters throw typed errors; `DecisionEngine` maps to safe error responses | `provider-fetch.ts`, `clients/providers/*.ts`, `DecisionEngine.ts` |
| Budget reservation/release | Added `releaseReservation()` in `budgetService`; `DecisionEngine` releases on provider failure; `recordActualCost()` reconciles difference | `services/budget.ts`, `DecisionEngine.ts` |
| Provider usage accounting | `parseProviderResponse()` handles Anthropic, OpenAI, Gemini, Groq; `calculateProviderCost()` uses actual usage for all providers when available | `DecisionEngine.ts` |
| Streaming accounting | Stream handler attempts usage parsing; uses `usageEstimated: true` when unavailable; budget reconciled when usage found | `DecisionEngine.ts` |
| Agent Guard retry count | Removed duplicate `hincrby` in `recordTurn`; `evaluate` increments exactly once per retry (`incrementRetry`) | `services/agent-guard.ts` |
| Agent Guard state consistency | `DecisionEngine` updates `agentGuardRepo.upsertSession` with `terminated` status on block; blocked session check also updates PostgreSQL | `DecisionEngine.ts` |
| Call ID propagation | `proxy.ts` generates `callId`; `DecisionEngine` passes `callId` to analytics (`recordCall`) and routing (`recordRouting`) | `routes/proxy.ts`, `DecisionEngine.ts`, `services/analytics.ts` |
| Provider credential architecture | `provider-credentials.ts`: checks organization-specific Valkey keys (`provider:keys:{orgId}`) first, then falls back to environment variables; never exposes keys in responses/logs | `services/provider-credentials.ts`, `routes/providers.ts` |
| Trusted proxy/IP | `extractClientIp()` is the single source; uses `TRUSTED_PROXY_CIDRS`; `app.ts`: `trustProxy` set to `false` when no CIDRs configured (not `true`) | `lib/ip.ts`, `app.ts` |
| Budget scope | `budgetService.checkAndDeduct()` accepts only `orgId`; comments document org-level enforcement only | `services/budget.ts` |

---

## 4. Security Verification (Fixed)

- `optionalAuth`: logs failures but does not expose errors to clients.
- `trustProxy`: configured from `TRUSTED_PROXY_CIDRS`; defaults to `false` when empty.
- `extractClientIp`: single parser used by auth middleware and rate limiter.
- Security headers: CSP and HSTS enabled (`helmet` plugin configured in `app.ts`).
- Provider errors: safe structured responses (`{ error, message, call_id }`); no provider response bodies, keys, or stack traces exposed.
- Budget: fail-closed (`approved: false` on Valkey error).
- Rate limiter: atomic Lua (`eval` with `INCR` and `PEXPIRE` combined in single script).

---

## 5. Verification Commands

```
api/: npm run typecheck → npm run lint → npm test → npm run build
dashboard/: npm run lint → npm run typecheck → npm run build
website/: npm run lint → npm run typecheck → npm run build
shared-types/: npm run build → npm run typecheck
```

Prerequisites: PostgreSQL 16 + Valkey 8 running (`infrastructure/docker-compose.yml`).
