# Phase 1 — OpenRouter Upstream

## Changes
- Added `UpstreamAdapter` interface (`api/src/services/upstream-adapter.ts`).
- Implemented `OpenRouterUpstreamAdapter` (`api/src/clients/upstreams/openrouter.ts`).
- Updated `types/index.ts`: added `'openrouter'` to `ProviderType` and `UpstreamType`.
- Updated `config/env.ts`: added `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`.
- Updated `provider-credentials.ts`: added `openrouter` key lookup.
- Updated `provider-router.ts`: added `openrouter` case using adapter; health check uses adapter health.
- Updated `DecisionEngine`: added `openrouter` parsing for response and streaming usage; updated cost calculation.
- Updated `routes/providers.ts`: included `openrouter` in health and keys endpoints.
- Updated `.env.example` and `infrastructure/.env.example`.
- Added `tests/unit/openrouter-adapter.test.ts`.

## Tests / Verification
- `npm test`: PASS (15 files, 113 tests)
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Architecture Notes
- OpenRouter adapter uses `OPENROUTER_API_KEY` and configurable `OPENROUTER_BASE_URL`.
- Adapter preserves correlation IDs through standard OpenAI-compatible request/response.
- Adapter avoids leaking credentials (authorization header is constructed locally, never logged).
- Adapter supports streaming (`stream?: boolean`) and handles timeouts/retryable errors via existing `provider-fetch` infrastructure.
- OpenRouter is treated as an upstream adapter, not the owner of the models it exposes. No changes to `MODEL_REGISTRY`.

## Remaining Work / Next Phase
Phase 2 will introduce `ModelRoute` abstraction to fully separate model identity from upstream execution, replacing direct provider mapping with route selection (priority, enabled, upstream/model mapping).
