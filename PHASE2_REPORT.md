# Phase 2 — Separate Model Identity from Upstream

## Changes
- Created `services/model-routes.ts`: defines `ModelRoute` interface and `MODEL_ROUTES` array.
- Added routes for direct providers (`anthropic`, `openai`, `gemini`) and upstream routes (`openrouter`).
- Modified `model-metadata.ts`: kept descriptors (`MODEL_REGISTRY`) intact but noted that routes are the new execution layer.
- Updated `provider-router.ts`: added `resolveUpstream()` method that selects routes by priority; `resolveProvider()` falls back to routes.
- Updated `provider-router.ts` health check to support upstream health (`openrouter`).
- Updated `types/index.ts`: `ProviderType` includes `'openrouter'`.
- Updated `intelligence/request-context.ts`: `RoutingDecision` now includes `upstream` and `upstreamModel`.
- Updated `DecisionEngine`: uses `resolveUpstream()`; records upstream/model info in routing decision; cost calculation handles upstream models.
- Updated `tests/unit/decision-engine-v1.test.ts`: added `resolveUpstream` mock.

## Tests / Verification
- `npm test`: PASS (15 files, 113 tests)
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Architecture Notes
- `model -> route(s) -> upstream` is now the primary architecture.
- `MODEL_REGISTRY` remains as the descriptor layer (canonical identity) but routes control execution.
- Aliases are preserved (e.g., `claude-sonnet-4-6-alias` mapped to `anthropic/claude-sonnet-4-6` route).
- Usage/accounting (`DecisionEngine`) now distinguishes `requestedModel` (`finalModel`), `approvedModel`, `provider` (upstream/provider), `upstream`, and `upstreamModel` via routing decision.
- Multiple routes per model possible: direct (`anthropic`) and upstream (`openrouter`).

## Remaining Work / Next Phase
Phase 3 will remove the authoritative `MODEL_REGISTRY` dependency and replace it with a `ModelCatalogService` that queries external sources (`Models.dev`, `OpenCode`) and maintains a local projection.
