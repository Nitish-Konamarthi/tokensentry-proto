# Phase 0 — Baseline + Audit Report

## Baseline Verification
- npm run typecheck: PASS
- npm run build: PASS
- npm test: PASS (14 files, 106 tests)

## Key Architecture Observations (Actual Repository)

### Provider Abstraction
- Provider clients: `api/src/clients/providers/{anthropic,openai,gemini,groq}.ts`
- Provider router service: `api/src/services/provider-router.ts`
- Provider resolution: `getModelProvider()` reads `MODEL_REGISTRY` (static TypeScript object in `model-metadata.ts`)
- Provider health: Valkey-based (`providerHealth`) and `providerRouter.checkProviderHealth()`
- Provider credentials: `provider-credentials.ts` maps `ProviderType` to env variables (`ANTHROPIC_API_KEY`, etc.) and Valkey encrypted keys

### Model Registry
- `MODEL_REGISTRY` in `api/src/services/model-metadata.ts` is the authoritative model source of truth.
- `model-metadata.ts` exports: `getModelMetadata`, `getModelProvider`, `isKnownModel`, `getBestPermittedModel`, `getAllowedModels`, `MODEL_COSTS`, `MODEL_TIERS`
- `catalog-source.ts` (`RegistryCatalogSource`) derives descriptors directly from `MODEL_REGISTRY`
- `model-catalog.ts` defines `ModelDescriptor` and `CatalogSource` interface (already exists but only used by registry source)

### Routing / Governance
- `router.ts` (`RouterService`) uses `MODEL_REGISTRY` for policy evaluation and model selection.
- `provider-router.ts` resolves provider directly from model (`resolveProvider`).
- `provider-scoring.ts` depends on `MODEL_REGISTRY` for costs/capabilities.
- `DecisionEngine` (`intelligence/decision-engine/DecisionEngine.ts`) uses `providerRouter.resolveProvider(finalModel)` and passes `provider` through analytics/routing.

### Types
- `ProviderType = 'anthropic' | 'openai' | 'gemini' | 'groq'` (`types/index.ts`)
- No upstream/adapter abstraction exists yet.

### Database Schema
- `db/schema.ts` uses Drizzle ORM (PostgreSQL).
- Tables: `organizations`, `teams`, `apiKeys`, `budgets`, `usageLogs`, `routingLogs`, `auditLogs`, `providerHealth`, `agentSessions`, `agentGuardEvents`
- No model registry table exists (models are hardcoded in TypeScript).

### Configuration
- `config/env.ts` validates env variables; no `OPENROUTER_API_KEY` or `OPENROUTER_BASE_URL`.
- `.env.example` exists in `api/` and `infrastructure/`.

### Tests
- `tests/unit/` includes `proxy-v1.test.ts`, `router-v1-deterministic.test.ts`, `router.test.ts`, `decision-engine-v1.test.ts`, etc.
- Mock patterns use `vi.mock()` extensively.

## Implementation Plan (Adapted to Actual Repo)

### Phase 1 — OpenRouter Upstream
1. Introduce upstream adapter interface (`UpstreamAdapter`) in `services/upstream-adapter.ts`.
2. Create `clients/upstreams/openrouter.ts` adapter: OpenAI-compatible chat, authorization via `OPENROUTER_API_KEY`, base URL from env (`OPENROUTER_BASE_URL`).
3. Update `types/index.ts`: add `UpstreamType` (`'openrouter' | 'anthropic' | ...`) or keep upstream separate from provider. Prefer separate upstream identity.
4. Update `provider-credentials.ts`: add openrouter key lookup.
5. Update `provider-router.ts` or create `upstream-router.ts` to support upstream routing.
6. Update `.env.example`, `infrastructure/.env.example`, `docs/DEPLOYMENT.md`.
7. Add unit tests (`tests/unit/openrouter-adapter.test.ts`).
8. Ensure `npm test`, `npm run typecheck`, `npm run build` pass.

### Phase 2 — Separate Model Identity from Upstream
1. Refactor `model-metadata.ts`: split `MODEL_REGISTRY` into `ModelDescriptor` (canonical identity) and separate `ModelRoute` definitions.
2. Introduce `services/model-routes.ts`: `interface ModelRoute { modelId: string; upstreamId: string; upstreamModelId: string; priority: number; enabled: boolean; }`
3. Modify `provider-router.ts` to resolve routes instead of direct provider mapping.
4. Preserve aliases explicitly (e.g., `claude-sonnet-4-6` -> canonical `anthropic/claude-sonnet-4-6`).
5. Update `router.ts` (`RouterService`) to work with routes.
6. Update usage/accounting (`DecisionEngine`) to record `requestedModel`, `canonicalModel`, `upstream`, `upstreamModel`.

### Phase 3 — Remove Authoritative MODEL_REGISTRY
1. Create `services/model-catalog-service.ts`: query `CatalogSource`, normalize, maintain projection/cache.
2. Modify `catalog-source.ts`: add external sources (`models.dev`, `openrouter`) in addition to `RegistryCatalogSource`.
3. Replace `MODEL_REGISTRY` usage in `provider-router.ts`, `router.ts`, `provider-scoring.ts`, `catalog-source.ts` with catalog service/projection.
4. Do NOT create a new persistent database table for model registry; rely on operational projection (local snapshot + Valkey cache if needed).
5. Ensure new models can be added without editing `MODEL_REGISTRY`.

### Phase 4 — Models.dev / OpenCode Catalog Integration
1. Implement `catalog-sources/models-dev-source.ts`: retrieve from public Models.dev interface.
2. Implement `catalog-sources/open-code-source.ts`: supported mechanism (e.g., OpenCode plugin/config interface or Models.dev projection).
3. Implement sync mechanism (`periodic refresh`, `manual refresh`, `cache expiration`, `failure tolerance`).
4. Ensure request-time lookup uses local projection, not live external call.
5. Update documentation (`docs/ARCHITECTURE.md`, `docs/API.md`).

### Phase 5 — Policy-Driven Multi-Upstream Routing + Fallback
1. Refactor router (`router.ts`, `provider-router.ts`) toward policy-driven selection using routes (`priority`, `enabled`, `health`).
2. Implement fallback logic for retryable errors (`timeout`, `5xx`, `network`, `temporary unavailable`) with bounded retries.
3. Add retry/fallback tracking to usage/accounting (`DecisionEngine`).
4. Update routing logs (`routingLogs`) to capture upstream, fallback, attempt number.
5. Ensure governance (auth, budget, agent guard, rate limit) remains before upstream execution.
6. Update docs.

## Security / Safety Notes
- Never hardcode API keys.
- Never log provider keys (existing `provider-fetch.ts` does not log keys; maintain this).
- Catalog metadata must not bypass governance (`DecisionEngine` checks model before routing).
- All upstream execution remains behind gateway governance.
- Tests must not depend on real external credentials.

## Cross-Cutting Updates
- `api/.env.example`
- `infrastructure/.env.example`
- `api/src/config/env.ts` (add openrouter variables)
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DEPLOYMENT.md`
- `CHANGELOG.md`

## Next Step
Proceed to Phase 1 (OpenRouter upstream adapter) using this plan.
