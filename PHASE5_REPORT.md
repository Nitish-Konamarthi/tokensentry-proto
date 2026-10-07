# Phase 5 — Policy-Driven Multi-Upstream Routing + Fallback

## Changes
- Modified `provider-router.ts`: added `routeWithFallback()` that selects routes by priority, checks upstream health, and tries fallback routes for retryable errors (`PROVIDER_TIMEOUT`, `PROVIDER_NETWORK`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`) with bounded retries (max 2 attempts, 1 fallback).
- Updated `provider-router.ts`: `resolveUpstream()` selects best enabled route; health check supports upstream health (`openrouter`).
- Updated `DecisionEngine`: uses `providerRouter.routeWithFallback()`; captures upstream/model info (`routingDecision.upstream`, `routingDecision.upstreamModel`); updates analytics with `upstream`, `upstreamModel`, `routePriority`, `attemptNumber`, `fallbackUpstream`, `success`, `normalizedErrorCategory`.
- Updated `analytics/dispatcher/index.ts`: extended `AnalyticsDispatchRouting` interface.
- Updated `analytics/services/analytics.ts`: passes new fields to dispatcher.
- Updated `docs/ARCHITECTURE.md` reference: documented new routing flow (`Model -> Route -> Upstream -> Provider`).
- Added `routePriority`, `attemptNumber`, `fallbackUpstream`, `normalizedErrorCategory` to routing logs.

## Tests / Verification
- `npm test`: PASS (15 files, 113 tests)
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Architecture Notes
- Routing is policy-driven and upstream-independent.
- Fallback is bounded, safe, and only triggers for retryable infrastructure errors (not auth failures, invalid requests, budget exceeded, or policy denials).
- Correlation IDs (`callId`) are preserved across retries and fallback attempts.
- Routing logs capture: `requestedModel`, `approvedModel`, `upstream`, `upstreamModel`, `routePriority`, `attemptNumber`, `success/failure`, `normalizedErrorCategory`.
- Governance controls (auth, budget, agent guard, rate limit) remain before upstream execution.

## Final State
- TokenSentry governs and routes models; it does not own the global model universe.
- A new model can be added without editing a giant TypeScript registry (via `CatalogSource` and `ModelRoute`).
- A new upstream can be added by implementing `UpstreamAdapter` and adding routes.
- A new routing policy can be added by configuring `priority`, `enabled`, and `metadata` in `ModelRoute`.
