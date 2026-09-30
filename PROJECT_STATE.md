# TokenSentry Project State

**Generated:** 2026-06-25  
**Git Commit:** No git history (unversioned working tree)  
**Repositories:** 6 (api, dashboard, website, shared-types, infrastructure, docs)  
**Repository Status:** Local only — no remote configured

---

# 1. Executive Summary

**Current Maturity:** Pre-MVP / Alpha. Core architecture is structurally sound and well-designed. The proxy layer, budget enforcement, routing, analytics, and agent guard are implemented with production-quality code. The dashboard has live API integration for most pages, with a few still on demo data. The website is a static marketing site.

**MVP Completion:** ~75%

| Area | Completion | Notes |
|------|-----------|-------|
| AI Proxy (core) | 90% | Streaming + non-streaming, 4 providers |
| Budget Enforcement | 85% | Atomic Valkey Lua, per-org/daily/monthly |
| Model Routing | 80% | Policy-based, cost-aware fallback |
| Agent Guard | 85% | Valkey-backed risk scoring, 7 factors |
| Analytics Pipeline | 70% | Real-time counters + DB aggregation |
| Auth (API key) | 90% | HMAC hashing, Valkey cache, Auth0 JWT |
| Dashboard | 65% | 11 routes, 6 live API, 5 demo data |
| Website | 90% | 2 pages, complete marketing content |
| Stripe Integration | 75% | Checkout, portal, webhooks implemented |
| Billing/Payments | 50% | Stripe connected, no invoicing yet |
| Semantic Cache | 0% | Flag in env, NOT implemented |
| Prompt Optimizer | 0% | Flag in env, NOT implemented |
| Email (Resend) | 0% | Config exists, NOT implemented |
| Supabase Vault | 0% | Config exists, NOT implemented |
| CI/CD | 80% | GitHub Actions workflows in place |
| Docker Deployment | 90% | Full docker-compose, multi-stage builds |
| NGINX Configuration | 95% | 3 vhosts, SSL, rate limiting, caching |
| OpenTelemetry | 70% | Collector configured, API instrumentation partial |
| Tests | 60% | 57 tests across 5 files, coverage thresholds set |
| Documentation | 50% | Inline docs good, external docs placeholder |

**Major Strengths:**
- Clean, modular architecture with clear separation of concerns (routes -> services -> repositories -> DB)
- Atomic budget enforcement using Valkey Lua scripts (prevents race conditions)
- Comprehensive Agent Guard with 7 risk factors evaluated in real-time
- Production-grade NGINX configuration with SSL, rate limiting, caching, and security headers
- Full Docker Compose deployment with health checks, backups, and OpenTelemetry
- Shared types package used across API and Dashboard
- Drizzle ORM with full TypeScript schema and relations
- TypeBox and Zod double validation layer

**Major Weaknesses:**
- **Semantic cache and prompt optimizer are NOT implemented** (both are marketing features listed on the website)
- **Supabase Vault integration for customer API keys is NOT implemented** -- currently using platform keys only
- **Email notifications (Resend) are NOT implemented** -- alert thresholds exist but no delivery
- **Dashboard provider, team, audit-log, settings, and advisor pages use demo/static data** -- not wired to live API
- **Planned features referenced in code (exact cache, pgvector, ClickHouse) are not implemented**
- **No integration tests for proxy/budget/auth flows** -- only unit tests exist
- **Observability is minimal** -- only Sentry init exists, no custom spans/metrics
- **No rate limiting on Valkey operations** -- could be abused by high-volume orgs
- **Dashboard layout defines 11 nav items but some routes show "coming soon" content**
- **Website references features (semantic cache, prompt optimization) that don't exist yet**

**Overall Architecture:**
Monorepo with 6 packages. The API is a Fastify 5 server acting as a reverse AI proxy with budget enforcement, model routing, analytics, and agent behavior monitoring. The Dashboard is a Next.js 14 app (App Router) with Auth0 authentication. The Website is a static Next.js marketing site. All services are deployed via Docker Compose behind an NGINX reverse proxy, with PostgreSQL 16 (persistence), Valkey 8 (cache/state), and OpenTelemetry (observability).

---

# 2. Repository Overview

## `api/` -- TokenSentry API (Fastify 5)

| Attribute | Value |
|-----------|-------|
| **Purpose** | AI governance proxy -- routes, budgets, analytics, agent guard |
| **Technologies** | Node 22, TypeScript (strict), Fastify 5, Drizzle ORM, PostgreSQL 16, Valkey 8 (ioredis), Zod, TypeBox, jose, Pino, Stripe |
| **Completeness** | ~80% |
| **Missing** | Semantic cache (ENABLE_SEMANTIC_CACHE flag), prompt optimizer (ENABLE_PROMPT_OPTIMIZER flag), Supabase Vault for customer keys, Resend email, OpenTelemetry custom instrumentation, ClickHouse analytics, pgvector |

**Packages (package.json):**
- `@tokensentry/api` -- v1.0.0
- `@tokensentry/shared-types` -- workspace dependency
- Key deps: fastify 5, drizzle-orm 0.45, ioredis 5, jose 5, pino 9, stripe 17, zod 3, @sinclair/typebox 0.33
- Dev: vitest 4, tsx 4, typescript 5.7

**Scripts:** dev, build, start, typecheck, lint, test, test:watch, test:coverage, db:generate, db:migrate, db:seed, db:studio

**Test count:** 57 tests across 5 files (4 unit, 1 integration)

---

## `dashboard/` -- Next.js Admin Dashboard

| Attribute | Value |
|-----------|-------|
| **Purpose** | Admin UI for budget management, analytics, API keys, agent monitoring |
| **Technologies** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 3, shadcn/ui, TanStack Query 5, Recharts, Auth0 Next.js SDK, lucide-react, date-fns, next-themes |
| **Completeness** | ~65% |
| **Missing** | Live data wiring for providers, team, audit-log, settings, advisor pages (all demo data); analytics cost page may be incomplete |

---

## `website/` -- Marketing Website

| Attribute | Value |
|-----------|-------|
| **Purpose** | Public-facing landing page and pricing |
| **Technologies** | Next.js 14 (App Router), React 18, TypeScript, static export |
| **Completeness** | ~90% |
| **Missing** | Google Analytics (env var defined, not wired), blog/docs pages |

---

## `shared-types/` -- Shared TypeScript Package

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shared types, schemas, and validators for API and Dashboard |
| **Technologies** | TypeScript 5.7, @sinclair/typebox 0.33 |
| **Completeness** | ~95% |
| **Missing** | Some API response types may not be fully aligned with actual route responses |

---

## `infrastructure/` -- Deployment Infrastructure

| Attribute | Value |
|-----------|-------|
| **Purpose** | Docker Compose, NGINX, OTel, scripts |
| **Technologies** | Docker, NGINX 1.27, certbot, OpenTelemetry Collector 0.115 |
| **Completeness** | ~90% |
| **Missing** | DH param file is not committed (generated via start.sh), ssl/ directory is empty |

---

## `docs/` -- Documentation

| Attribute | Value |
|-----------|-------|
| **Purpose** | Architecture documentation |
| **Completeness** | ~10% |
| **Missing** | architecture.md references an external file that doesn't exist locally |

---

# 3. Folder Structure

```
tokensentry-ai/
├── api/                              # Fastify AI Governance API
│   ├── .env.example                  # Environment variable template (50 vars)
│   ├── .github/workflows/
│   │   └── ci.yml                    # CI: typecheck + test (PG + Valkey services)
│   ├── .gitignore
│   ├── Dockerfile                    # Multi-stage: deps -> builder -> runner -> dev
│   ├── LICENSE
│   ├── README.md
│   ├── drizzle.config.ts             # Drizzle Kit config (PostgreSQL, ./sql/drizzle)
│   ├── openapi.yaml                  # OpenAPI 3.0 spec (395 lines)
│   ├── package.json
│   ├── tsconfig.json                 # NodeNext, strict, path alias @/*
│   ├── vitest.config.ts              # Coverage thresholds: lines 70%, branches 60%
│   ├── sql/
│   │   ├── 01-postgres-schema.sql    # Full PostgreSQL schema (10 tables, triggers, indexes)
│   │   ├── 03-seed.ts                # Programmatic seed script
│   │   └── drizzle/                  # Drizzle migration output (empty/placeholder)
│   ├── src/
│   │   ├── app.ts                    # Fastify app factory (plugins, hooks, route registration)
│   │   ├── index.ts                  # Entry point (graceful shutdown, signal handlers)
│   │   ├── instrumentation.ts        # Sentry init (production only)
│   │   ├── config/
│   │   │   └── env.ts                # Zod-validated env (30+ vars)
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle DB client (postgres driver, 5 max connections)
│   │   │   └── schema.ts             # 10 tables + relations (Drizzle ORM)
│   │   ├── lib/
│   │   │   ├── crypto.ts             # HMAC key hashing, AES-256-GCM encrypt/decrypt, SHA-256 prompt hash
│   │   │   ├── ip.ts                 # Client IP extraction with CIDR-based proxy trust
│   │   │   └── logger.ts             # Pino logger (pretty in dev, JSON in prod)
│   │   ├── types/
│   │   │   └── index.ts              # AuthContext, BudgetResult, ProxyRequest, RateLimitConfig
│   │   ├── validators/
│   │   │   └── proxy.ts              # TypeBox request/response schemas for proxy
│   │   ├── middleware/
│   │   │   ├── auth.ts               # requireApiKey (bearer token), optionalAuth
│   │   │   ├── rate-limit.ts         # Valkey-backed sliding window rate limit
│   │   │   └── error-handler.ts      # Global error handler + 404 handler
│   │   ├── clients/
│   │   │   ├── postgres.ts           # PG client (20 max connections, health check)
│   │   │   ├── valkey.ts             # Valkey/ioredis client + ValkeyKeys constants
│   │   │   ├── stripe.ts             # Stripe client (singleton)
│   │   │   └── providers/
│   │   │       ├── anthropic.ts       # Anthropic Claude API adapter + cost table
│   │   │       ├── openai.ts          # OpenAI API adapter + cost table
│   │   │       ├── gemini.ts          # Google Gemini API adapter + cost table
│   │   │       └── groq.ts            # Groq API adapter (no cost table)
│   │   ├── services/
│   │   │   ├── auth.ts               # API key auth (HMAC + Valkey cache + PG) + JWT auth (Auth0 JWKS)
│   │   │   ├── budget.ts             # Atomic Valkey Lua budget check/deduct/record
│   │   │   ├── router.ts             # Model routing (policy-based, cost-aware)
│   │   │   ├── provider-router.ts    # Provider dispatch + health checks
│   │   │   ├── analytics.ts          # Call recording + real-time spend counters
│   │   │   ├── rate-limiter.ts       # Sliding window rate limiter (Valkey MULTI/INCR/PTTL)
│   │   │   ├── agent-guard.ts        # Agent session monitoring (7-factor risk scoring)
│   │   │   └── stripe.ts             # Stripe checkout, portal, webhook handlers
│   │   ├── repositories/
│   │   │   ├── api-key.ts            # CRUD for API keys
│   │   │   ├── budget.ts             # Budget policy CRUD + org/team policy lookup
│   │   │   ├── usage-log.ts          # Usage log insert + aggregation queries
│   │   │   ├── routing-log.ts        # Routing decision log insert
│   │   │   ├── org.ts                # Org/team/member CRUD
│   │   │   ├── audit-log.ts          # Audit log insert + filtered queries
│   │   │   └── agent-guard.ts        # Agent session + guard event persistence
│   │   ├── routes/
│   │   │   ├── health.ts             # GET /health/live, GET /health/ready
│   │   │   ├── proxy.ts              # POST /v1/proxy (core AI proxy, 349 lines)
│   │   │   ├── budgets.ts            # GET/POST /v1/budgets, GET /v1/budgets/spend
│   │   │   ├── api-keys.ts           # GET/POST/DELETE /v1/api-keys
│   │   │   ├── analytics.ts          # GET /v1/analytics/spend, /v1/analytics/models
│   │   │   ├── agent-guard.ts        # GET /v1/agents, POST /v1/agents/:id/terminate, GET /v1/agents/guard-events
│   │   │   ├── stripe.ts             # POST /v1/stripe/create-checkout/create-portal/webhook
│   │   │   ├── audit-logs.ts         # GET /v1/audit-logs
│   │   │   ├── providers.ts          # GET /v1/providers/health, PUT /v1/providers/keys
│   │   │   ├── settings.ts           # GET/PUT /v1/settings
│   │   │   ├── team.ts               # GET /v1/members, POST /v1/invitations, DELETE /v1/members/:id
│   │   │   └── advisor.ts            # POST /v1/advisor/query (AI budget advisor)
│   │   └── scripts/
│   │       ├── migrate.ts            # Drizzle migration runner
│   │       └── seed.ts               # DB seed (demo org + key)
│   └── tests/
│       ├── setup.ts                  # Test env vars
│       ├── unit/
│       │   ├── router.test.ts        # 5 tests
│       │   ├── crypto.test.ts        # 8 tests
│       │   ├── budget.test.ts        # 3 tests
│       │   └── agent-guard.test.ts   # 29 tests
│       └── integration/
│           └── health.test.ts        # 4 tests
│
├── dashboard/                        # Next.js Admin Dashboard
│   ├── .env.example
│   ├── Dockerfile
│   ├── middleware.ts                 # Auth0 session check
│   ├── next.config.mjs
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Redirects / -> /dashboard
│   │   ├── login/page.tsx
│   │   ├── api/auth/[auth0]/route.ts
│   │   └── dashboard/
│   │       ├── layout.tsx            # Sidebar nav (10 items)
│   │       ├── page.tsx              # Overview
│   │       ├── analytics/page.tsx
│   │       ├── analytics/cost/page.tsx
│   │       ├── budgets/page.tsx
│   │       ├── api-keys/page.tsx
│   │       ├── agent-guard/page.tsx
│   │       ├── providers/page.tsx     # Demo data
│   │       ├── team/page.tsx          # Demo data
│   │       ├── audit-log/page.tsx     # Demo data
│   │       ├── settings/page.tsx      # Demo data
│   │       └── advisor/page.tsx       # Demo data
│   ├── components/
│   │   ├── providers.tsx, budget-bar.tsx, data-table.tsx
│   │   ├── metric-card.tsx, page-header.tsx
│   │   ├── charts/spend-chart.tsx, charts/model-chart.tsx
│   │   └── ui/ (badge, button, card, input, progress, select, skeleton, switch, table, tabs, separator)
│   └── lib/
│       ├── api-client.ts, hooks.ts, types.ts, utils.ts
│
├── website/                          # Marketing Website
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Hero, features, stats, how-it-works, pricing, FAQ, footer
│   │   └── pricing/page.tsx
│   └── components/
│       ├── hero.tsx, how-it-works.tsx, pricing-table.tsx
│
├── shared-types/
│   └── src/
│       ├── index.ts, api.ts, models.ts, validation.ts
│
├── infrastructure/
│   ├── docker-compose.yml            # 9 services
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/api.conf, dashboard.conf, landing.conf
│   ├── otel/otel-collector.yml
│   ├── scripts/start.sh, backup.sh
│   └── .github/workflows/ci.yml, deploy.yml
│
├── docs/README.md, architecture.md
└── CHANGELOG.md
```

---

# 4. Technology Stack

## Backend
| Technology | Usage | Status |
|-----------|-------|--------|
| **Node.js 22** | Runtime | Active |
| **TypeScript 5.7** | Language (strict mode) | Active |
| **Fastify 5** | HTTP framework | Active |
| **Fastify Helmet** | Security headers | Active |
| **Fastify CORS** | Cross-origin support | Active |
| **Fastify Sensible** | HTTP utilities | Active |
| **Fastify Compress** | Compression | Listed in deps, not registered |
| **Fastify Rate Limit** | Rate limiting | Listed in deps, custom impl used |

## Frontend
| Technology | Usage | Status |
|-----------|-------|--------|
| **Next.js 14** (App Router) | Dashboard + Website | Active |
| **React 18** | UI | Active |
| **TypeScript 5.7** | Language | Active |
| **Tailwind CSS 3** | Styling (both projects) | Active |
| **shadcn/ui** | UI primitives (dashboard) | Active |
| **TanStack Query 5** | Data fetching (dashboard) | Active |
| **Recharts 2** | Charts (dashboard) | Active |
| **Auth0 Next.js SDK** | Authentication (dashboard) | Active |
| **next-themes** | Dark mode (dashboard) | Active |
| **lucide-react** | Icons (dashboard) | Active |
| **date-fns** | Dates (dashboard) | Active |

## Database
| Technology | Usage | Status |
|-----------|-------|--------|
| **PostgreSQL 16** | Primary database | Active |
| **Drizzle ORM 0.45** | Database ORM | Active |
| **postgres** (npm) | PG driver | Active |
| **Drizzle Kit 0.31** | Migrations | Active |

## Cache / State
| Technology | Usage | Status |
|-----------|-------|--------|
| **Valkey 8** (Redis-compatible) | Cache, rate limits, budget counters, agent state | Active |
| **ioredis 5** | Redis client | Active |

## Authentication
| Technology | Usage | Status |
|-----------|-------|--------|
| **API Key (HMAC-SHA256)** | Machine-to-machine auth | Active |
| **Auth0** | Dashboard user auth | Active |
| **jose** | JWT verification | Active |

## AI Providers
| Provider | Models | Status |
|----------|--------|--------|
| **Anthropic** | claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6 | Active |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, o3, o4-mini | Active |
| **Gemini** | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | Active |
| **Groq** | llama, mixtral models | Active (no cost table, no response parser, no streaming) |

## Validation
| Technology | Usage | Status |
|-----------|-------|--------|
| **Zod 3** | Environment variable validation | Active |
| **@sinclair/typebox 0.33** | Request/response schema validation | Active |

## Payments
| Technology | Usage | Status |
|-----------|-------|--------|
| **Stripe 17** | Subscription billing | Active (checkout, portal, webhooks) |

## Observability
| Technology | Usage | Status |
|-----------|-------|--------|
| **Pino 9** | Structured logging | Active |
| **Sentry** | Error tracking | Active (optional init) |
| **OpenTelemetry** | Traces, metrics, logs | Active (collector configured) |
| **Prometheus** | Metrics exposition | Active (OTel exporter) |

## Testing
| Technology | Usage | Status |
|-----------|-------|--------|
| **Vitest 4** | Test runner | Active |
| **@vitest/coverage-v8** | Code coverage | Active (thresholds: lines 70%, functions 70%, branches 60%, statements 70%) |

## CI/CD
| Technology | Usage | Status |
|-----------|-------|--------|
| **GitHub Actions** | CI + Deploy | Active |
| **appleboy/ssh-action** | SSH deploy | Active |

## Deployment
| Technology | Usage | Status |
|-----------|-------|--------|
| **Docker** | Containerization | Active |
| **Docker Compose** | Multi-service orchestration | Active |
| **NGINX 1.27** | Reverse proxy | Active |
| **certbot** | SSL auto-renewal | Active |

## Security
| Technology | Usage | Status |
|-----------|-------|--------|
| **AES-256-GCM** | Customer provider key encryption | Active |
| **HMAC-SHA256** | API key hashing | Active |
| **Helmet** | HTTP security headers | Active |
| **CORS** | Origin validation | Active |
| **IP-based CIDR filtering** | Trusted proxy validation | Active |
| **Stripe webhook IP whitelist** | NGINX-level IP restriction | Active |

## Planned / Not Implemented
| Technology | Usage | Status |
|-----------|-------|--------|
| **Supabase Vault** | Encrypted customer API key storage | Not implemented |
| **Resend** | Email notifications | Not implemented |
| **pgvector** | Semantic cache | Not implemented |
| **ClickHouse** | Analytics backend | Referenced in comments / website |
| **Semantic Cache (Tier 1)** | pgvector similarity cache | Flag exists, code not implemented |
| **Prompt Optimizer** | Token stripping optimization | Flag exists, code not implemented |
| **Slack notifications** | Alert delivery | Referenced in website pricing table |

---

# 5. Architecture

## High-Level Architecture Diagram

```
+----------------------------------------------------------------------+
|                          DNS / CDN                                   |
|              tokensentry.ai  app.tokensentry.ai  api.tokensentry.ai  |
+----------------------------------+-----------------------------------+
                                   |
+----------------------------------v-----------------------------------+
|                         NGINX (Reverse Proxy)                        |
|  +--------------+  +--------------+  +--------------+  +----------+  |
|  | SSL Term.    |  | Rate Limiting|  | Auth (proxy) |  | Analytics|  |
|  | TLS 1.2/1.3  |  | 5 zones      |  | API key      |  | Cache    |  |
|  | HSTS preload |  | burst/nodelay|  | validation   |  | 30s TTL  |  |
|  +--------------+  +--------------+  +--------------+  +----------+  |
|  +----------------------------------------------------------------+  |
|  | Security Headers: X-Frame-Options, CSP, XSS, Referrer-Policy   |  |
|  | Permissions-Policy, COOP, CORP, X-Content-Type-Options        |  |
|  +----------------------------------------------------------------+  |
+----------------------------------+-----------------------------------+
                                   |
        +-----------------------------+------------------+
        |                             |                  |
+-------v--------+          +---------v-------+    +-----v------------+
|  api:3000      |          |  dashboard:3001  |    |  website:3000    |
|  Fastify 5     |          |  Next.js 14      |    |  Next.js 14      |
|                |          |                  |    |  (Marketing)     |
|  +----------+  |          |  +----------+   |    +---------+--------+
|  |Health    |  |          |  |Auth0     |   |
|  |Routes    |  |          |  |Login     |   |
|  +----------+  |          |  +----------+   |
|  |Proxy     |  |          |  |Dashboard |   |
|  |/v1/proxy |  |          |  |Pages (11)|   |
|  +----------+  |          |  +----------+   |
|  |Budget API|  |          |  |TanStack  |   |
|  |/v1/budgets|  |          |  |Query     |   |
|  +----------+  |          |  +----------+   |
|  |Analytics |  |          |  |Recharts  |   |
|  |/v1/anal. |  |          |  +----------+   |
|  +----------+  |          +------------------+
|  |Auth/Keys |  |
|  |Agent     |  |
|  |Stripe    |  |
|  |Settings  |  |
|  |Teams     |  |
|  |Advisor   |  |
|  +----------+  |
+-------+--------+
        |
        +---------------------------+-----------------------+
                                    |
+-----------------------------------v-----------------------+
|                  Internal Network (172.20.0.0/16)          |
|                                                           |
|  +--------------+    +--------------+    +----------------+|
|  | PostgreSQL 16|    | Valkey 8     |    | OTel Collector ||
|  | Primary DB   |    | Cache/State  |    | v0.115         ||
|  | 10 tables    |    | Budget ctrs  |    |                ||
|  | Drizzle ORM  |    | Rate limits  |    | Traces->Backend||
|  | pgbackup     |    | Agent state  |    | Metrics->Prom  ||
|  | (daily dump) |    | Auth cache   |    | Logs->Backend  ||
|  +--------------+    +--------------+    +----------------+|
|                                                           |
|  +-----------------------------------------------------+  |
|  |           AI Provider API Calls (outbound)          |  |
|  |  Anthropic -- OpenAI -- Gemini -- Groq              |  |
|  +-----------------------------------------------------+  |
+-----------------------------------------------------------+
```

## Request Flow (Proxy Call)

1. Client POST /v1/proxy with Bearer token + optional agent/session headers
2. NGINX terminates SSL, applies rate limit (100r/s org, burst 200)
3. Auth Middleware validates API key via HMAC-SHA256, checks Valkey cache, then PG
4. Rate Limit Middleware applies org-level sliding window (default 500 req/min)
5. Agent Guard pre-check: if session blocked in Valkey -> 429
6. Cost estimation from message length (len/4)
7. Budget check via atomic Valkey Lua script (monthly + daily counters)
   - If denied -> 402 BUDGET_EXCEEDED
   - If utilization > 75% -> suggests Haiku fallback
8. Model routing: checks org policy allowlist, falls back to highest allowed tier
9. Agent Guard evaluation (post-budget): 7 risk factors scored 0-100
   - <=40 allow, 41-70 warn, >70 block -> 429 AGENT_BLOCKED
10. Provider selection based on model prefix (claude->Anthropic, gpt->OpenAI, etc.)
11. Provider health check in Valkey (5 min cooldown on error)
12. Streaming: pipe response as text/event-stream
13. Non-streaming: parse response, adjust budget, record analytics, return result

## Authentication Flow

- **API Key Auth:** HMAC-SHA256 hash with pepper -> Valkey cache (300s) -> PG query (api_keys + organizations + org_members) -> AuthContext
- **JWT Auth (Dashboard):** Auth0 login -> Fetch JWKS -> jwtVerify -> Check Valkey blacklist

## Provider Routing

- resolveProvider(model): claude* -> anthropic, gpt*/o3*/o4* -> openai, gemini* -> gemini, llama*/mixtral* -> groq
- Health check via Valkey key provider:health:{provider}
- Error marks provider unhealthy for 5 minutes

## Budget Flow

- Atomic Lua script on Valkey keys budget:monthly:{orgId}:{yyyyMm} and budget:daily:{orgId}:{date}
- Compares spend + cost against limits, INCRBYFLOAT + EXPIRE if approved
- 3 levels: org, team (not used), user (not used)

## Analytics Flow

- recordCall -> INSERT usage_logs + INCRBYFLOAT realtime Valkey counter (2d TTL)
- Time series: SELECT DATE(created_at), SUM(cost_micros), COUNT(*) GROUP BY DATE

## Deployment Flow

- 9 Docker services: nginx, certbot, api, dashboard, website, postgres, valkey, pgbackup, otel-collector
- Internal network 172.20.0.0/16, services only exposed through NGINX
- CI/CD via GitHub Actions: SSH to VPS, git pull, docker compose up -d --no-deps

---

# 6. API Analysis

| Method | Path | Purpose | Auth | Status | Missing |
|--------|------|---------|------|--------|---------|
| GET | /health/live | Liveness probe | None | Complete | -- |
| GET | /health/ready | Readiness probe | None | Complete | -- |
| POST | /v1/proxy | AI proxy | API Key | Complete | Semantic cache, prompt optimizer, Supabase Vault |
| GET | /v1/budgets | Budget policy + spend | API Key | Complete | Per-team budget |
| POST | /v1/budgets | Create/update budget | API Key | Complete | Team-level |
| GET | /v1/budgets/spend | Spend time series | API Key | Complete | -- |
| GET | /v1/api-keys | List API keys | API Key | Complete | Pagination |
| POST | /v1/api-keys | Create API key | API Key | Complete | -- |
| DELETE | /v1/api-keys/:keyId | Revoke API key | API Key | Complete | -- |
| GET | /v1/analytics/spend | Spend analytics | API Key | Complete | -- |
| GET | /v1/analytics/models | Model distribution | API Key | Complete | -- |
| GET | /v1/agents | List agent sessions | API Key | Complete | -- |
| POST | /v1/agents/:id/terminate | Terminate agent | API Key | Complete | -- |
| GET | /v1/agents/guard-events | List guard events | API Key | Complete | Pagination |
| POST | /v1/stripe/create-checkout-session | Stripe checkout | API Key | Complete | -- |
| POST | /v1/stripe/create-portal-session | Billing portal | API Key | Complete | -- |
| POST | /v1/stripe/webhook | Stripe webhook | IP whitelist | Complete | Usage-based billing |
| GET | /v1/audit-logs | List audit logs | API Key | Complete | Pagination, date filter |
| GET | /v1/providers/health | Provider health | API Key | Complete | Real health checks |
| PUT | /v1/providers/keys | Store provider keys | API Key | Complete | Supabase Vault |
| GET | /v1/settings | Get org settings | API Key | Complete | -- |
| PUT | /v1/settings | Update org settings | API Key | Complete | -- |
| GET | /v1/members | List team members | API Key | Complete | -- |
| POST | /v1/invitations | Invite member | API Key | Complete | Email delivery |
| DELETE | /v1/members/:id | Remove member | API Key | Complete | -- |
| POST | /v1/advisor/query | Budget advisor Q&A | API Key | Complete | Real data context |

---

# 7. Database

## Tables (10)

| Table | Key Columns | Key Indexes |
|-------|------------|-------------|
| **organizations** | id UUID PK, slug UNIQUE, plan, stripe_customer_id UNIQUE, model_policy JSONB | slug, stripe_customer_id |
| **teams** | id UUID PK, org_id FK, name, slug | UNIQUE(org_id, slug) |
| **org_members** | id UUID PK, org_id FK, user_id, role | UNIQUE(org_id, user_id) |
| **api_keys** | id UUID PK, org_id FK, key_hash UNIQUE CHAR(64), key_prefix CHAR(16), scopes TEXT[], revoked_at | org_id, active_hash (partial) |
| **budgets** | id UUID PK, org_id FK, monthly_limit_micros DECIMAL(16,4), daily_limit_micros, alert_at_80/95 | org_id |
| **usage_logs** | id UUID PK, org_id+team_id FKs, call_id, model, provider, input/output_tokens, cost_micros | (org_id, created_at), (org_id, model), (org_id, provider) |
| **routing_logs** | id UUID PK, org_id FK, requested/approved_model, overridden | (org_id, created_at) |
| **audit_logs** | id UUID PK, org_id FK, action, resource, details JSONB | (org_id, created_at) |
| **provider_health** | id UUID PK, provider TEXT UNIQUE, status, error_count, avg_latency_ms | UNIQUE(provider) |
| **agent_sessions** | id UUID PK, org_id FK, session_id UNIQUE, status, loop_detected, risk_score | (org_id, agent_id), status |
| **agent_guard_events** | id UUID PK, org_id FK, session_id, score, action, factors JSONB | (org_id, created_at) |

**Relationships:** organizations 1:N teams, org_members, api_keys, budgets, usage_logs, audit_logs

**Triggers:** update_updated_at() on organizations and budgets

**Missing Indexes:** agent_sessions(org_id, status), agent_guard_events(session_id)

**Potential Improvements:** Partition usage_logs by month, add updated_at triggers on teams/org_members, add composite index (org_id, model, created_at)

---

# 8. Valkey

## Key Namespace

| Key Pattern | Purpose | TTL | Used By |
|------------|---------|-----|---------|
| budget:monthly:{orgId}:{yyyyMm} | Monthly spend counter | 30d | Budget service |
| budget:daily:{orgId}:{date} | Daily spend counter | 24h | Budget service |
| budget:team:{teamId}:{yyyyMm} | Team counter | -- | Not used |
| budget:user:{userId}:{yyyyMm} | User counter | -- | Not used |
| ratelimit:{key}:{window} | Sliding window rate limit | Dynamic | Rate limiter |
| auth:key:{hashPrefix} | Auth context cache | 300s | Auth service |
| auth:blacklist:{jti} | JWT blacklist | -- | Auth service |
| provider:health:{provider} | Provider health | 300s | Provider router |
| realtime:spend:{orgId}:{date} | Real-time spend | 2d | Analytics service |
| agent:session:{sessionId} | Session metadata (hash) | 900s | Agent guard |
| agent:stats:{sessionId} | Session statistics (hash) | 900s | Agent guard |
| agent:timeline:{sessionId} | Request timeline (sorted set) | 900s | Agent guard |
| agent:tools:{sessionId} | Tools used (set) | 900s | Agent guard |
| agent:providers:{sessionId} | Providers used (set) | 900s | Agent guard |
| agent:blocked:{sessionId} | Blocked flag | 120s | Agent guard |
| agent:tokens:{sessionId} | Token history (sorted set) | 900s | Agent guard |
| session:{sessionId} | Session cache | -- | Not used |
| cache:exact:{orgId}:{hash} | Exact prompt cache | -- | Not implemented |
| provider:keys:{orgId} | Encrypted provider keys (hash) | Permanent | Provider routes |

## Missing
- Semantic cache (Tier 1): Not implemented, requires pgvector
- Exact prompt cache (Tier 0): Key defined, code not implemented
- Team/user budget counters: Keys defined, not wired
- Cluster/Sentinel: Not configured

---

# 9. NGINX

## Master Config (nginx.conf)

| Feature | Status |
|---------|--------|
| Worker connections | 4096 |
| Gzip | JSON, JS, CSS, HTML, SVG, API |
| Rate limit zones | 5: proxy (100r/s), api (300r/s), auth (10r/m), advisor (10r/m), global (50r/s) |
| Connection limiting | Per IP (100), per org (1000) |
| Proxy cache | Analytics: 2GB, 30s valid |
| Security headers | X-Frame-Options, CSP, HSTS 2y preload, COOP, CORP, Permissions-Policy |
| Upstream pools | api:3000 (keepalive 64), dashboard:3001 (keepalive 16) |
| JSON access log | Structured with request_time, upstream_response_time, cache_status |

## Virtual Hosts

| Domain | Config Highlights |
|--------|------------------|
| **api.tokensentry.ai** | SSL/TLS 1.2/1.3, OCSP stapling, proxy buffering off for streaming, analytics cache (30s), Stripe webhook IP whitelist (22 IPs), malicious path blocking |
| **app.tokensentry.ai** | SSL, static asset caching (365d immutable), gzip static |
| **tokensentry.ai** | SSL, WebSocket support, custom 502/503 error page |

## Missing
- No rate limiting on dashboard/website vhosts
- No WebSocket upgrade headers on /v1/proxy streaming path
- No cache purge mechanism

---

# 10. AI Layer

## Prompt Optimization

**Status: NOT IMPLEMENTED**

ENABLE_PROMPT_OPTIMIZER flag exists (default false), but no code references it. No token stripping, deduplication, or instruction consolidation exists. Website claims "Strips 30-70% of tokens" -- aspirational.

## Model Routing

**Status: IMPLEMENTED (basic)**

| Feature | Status |
|---------|--------|
| Policy allowlisting | Complete |
| Tier-based fallback | Complete (Haiku -> Sonnet -> Opus) |
| Cost estimation | Complete (hardcoded cost tables) |
| Savings calc | Complete |
| Complexity classification | Placeholder (returns 'unknown') |
| Budget-aware fallback | Complete (Haiku at >75% utilization) |

## Provider Adapters

| Adapter | Status | Gaps |
|---------|--------|------|
| **Anthropic** | Complete | -- |
| **OpenAI** | Complete | -- |
| **Gemini** | Complete | -- |
| **Groq** | Partial | No cost table, no response parser, no streaming support |

## Future Improvements
- Implement prompt optimizer
- Implement semantic cache (pgvector)
- Add AI-based complexity classification
- Add Groq cost table and response parser
- Latency-aware routing
- Provider fallback chain
