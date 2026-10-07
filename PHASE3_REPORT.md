# Phase 3 — Remove Authoritative MODEL_REGISTRY

## Changes
- Created `services/model-catalog-service.ts`: `ModelCatalogService` maintains a local operational projection (`CatalogProjection`) derived from `CatalogSource`.
- Updated `catalog-source.ts`: `RegistryCatalogSource` now documented as operational descriptor layer, not authoritative registry.
- Added `catalog-sources/models-dev-source.ts`: `ModelsDevCatalogSource` interface (returns empty for V1; supports future sync).
- Added `catalog-sources/open-code-source.ts`: `OpenCodeCatalogSource` interface (uses supported public mechanisms; does not scrape private DBs).
- Updated `provider-router.ts`: removed direct `MODEL_REGISTRY` import; uses routes (`MODEL_ROUTES`) for upstream resolution.
- Updated `services/model-metadata.ts`: `MODEL_REGISTRY` remains for descriptor lookup but is no longer authoritative for routing.
- Updated `services/router.ts`: uses `modelCatalogService.listSupported()` instead of `Object.keys(MODEL_REGISTRY)` for permitted models.
- Updated `services/provider-scoring.ts`: removed direct `MODEL_REGISTRY` import.
- Updated `intelligence/decision-engine/DecisionEngine.ts`: uses `resolveUpstream()` from routes; cost calculation uses `getModelMetadata()` (descriptor layer) not registry directly.

## Tests / Verification
- `npm test`: PASS (15 files, 113 tests)
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Architecture Notes
- TokenSentry does NOT maintain an authoritative global model registry.
- `MODEL_REGISTRY` is an operational descriptor projection derived from `CatalogSource` and `ModelRoute`.
- New models can become available by adding a new `CatalogSource` (e.g., `ModelsDevCatalogSource`) and calling `modelCatalogService.refresh()`.
- No persistent database table was added for model registry; projection lives in memory/Valkey (future).
- Catalog failure does not make gateway unavailable; request-time lookup uses cached projection.

## Remaining Work / Next Phase
Phase 4 will implement periodic refresh, manual refresh, and cache expiration for `ModelsDevCatalogSource` and `OpenCodeCatalogSource`, and update documentation.
