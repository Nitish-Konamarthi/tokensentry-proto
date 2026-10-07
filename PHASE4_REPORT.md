# Phase 4 — Models.dev / OpenCode Catalog Integration

## Changes
- Implemented `catalog-sources/models-dev-source.ts`: `ModelsDevCatalogSource` retrieves from public `MODELS_DEV_API_URL`, normalizes to `ModelDescriptor`, hides `models.dev`-specific structures.
- Implemented `catalog-sources/open-code-source.ts`: `OpenCodeCatalogSource` uses supported public interfaces; does NOT scrape private DBs, internal SQLite, or undocumented endpoints.
- Updated `services/model-catalog-service.ts`: added `startPeriodicRefresh()`, `stopPeriodicRefresh()`, `manualRefresh()`; uses `setInterval` with bounded retries; failure-tolerant (external catalog down does not block requests).
- Updated `config/env.ts`: added `MODELS_DEV_API_URL`, `OPENCODE_API_URL`.
- Updated `.env.example`: added variables.
- Updated documentation (`docs/ARCHITECTURE.md` reference) to clarify external catalog sources.

## Tests / Verification
- `npm test`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Architecture Notes
- External catalog sources (`models.dev`, `opencode`) are optional; gateway continues with cached projection if unavailable.
- Request-time lookup uses local projection (`CatalogProjection`), not live external calls.
- `manualRefresh()` and `startPeriodicRefresh()` allow future event-driven synchronization (`MODEL_CATALOG_UPDATED`) without redesign.
- Catalog metadata does NOT bypass governance (auth, budget, agent guard, rate limits remain before upstream execution).

## Remaining Work / Next Phase
Phase 5 will implement policy-driven multi-upstream routing with priority, health-based selection, bounded retries, and fallback behavior.
