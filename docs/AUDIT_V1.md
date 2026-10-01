# TokenSentry V1 — Source-Verified Audit & Plan

Verified against actual source (`api/src/*`, `tests/*`, `shared-types/src/*`).

---

## 1. Actual Repository Map (verified)

- `api/src/app.ts`: Fastify 5 factory. Routes registered: health, proxy, budgets, api-keys, analytics, agent-guard, audit-logs, providers, settings, team.
- `api/src/routes/proxy.ts`: `POST /v1/proxy`. Delegates to `decisionEngine.decide()`.
- `api/src/intelligence/decision-engine/DecisionEngine.ts`: Orchestrates budget (`budgetService`), agent guard (`agentGuardService`), routing (`routerService`), provider (`providerRouter`), analytics (`analyticsService`).
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

## 5. V1 Exclusions (Disabled / Removed)

| Component | V1 Action |
|---|---|
| Stripe billing | Removed: files deleted (`routes/stripe.ts`, `services/stripe.ts`, `clients/stripe.ts`) |
| Advisor AI Q&A | Removed: files deleted (`routes/advisor.ts`, dashboard advisor page) |
| Exact / semantic cache | Removed: files deleted (`services/cache.ts`, optimizer/analyzer intelligence) |
| Prompt optimizer | Removed: files deleted (`services/prompt.ts`, `intelligence/optimizer/*`) |
| ClickHouse analytics | Never implemented; references removed from docs/website |
| OpenTelemetry collector | Removed: `infrastructure/otel/` deleted |
| Supabase Vault | Removed: variables removed from `.env.example` |
| Resend email | Removed: variables removed from `.env.example` |
| AI complexity classifier | Never implemented; placeholder removed |

---

## 6. Verification Commands (Run Before Any Future Changes)

```
api/: npm run typecheck → npm run lint → npm test → npm run build
dashboard/: npm run lint → npm run typecheck → npm run build
website/: npm run lint → npm run typecheck → npm run build
shared-types/: npm run build → npm run typecheck
```

Prerequisites: PostgreSQL 16 + Valkey 8 running (`infrastructure/docker-compose.yml`).
