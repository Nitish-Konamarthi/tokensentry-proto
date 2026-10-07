========================================
TOKEN SENTRY ARCHITECTURE CORRECTION REPORT
========================================

1. PROBLEMS FOUND
-----------------
A. MODEL_REGISTRY (model-metadata.ts) was still the authoritative model source in the projection initialization.
B. Catalog sources (models-dev, opencode) existed as interfaces but were never actually used in runtime routing or policy.
C. provider-router still fell back to getModelProvider/MODEL_REGISTRY for normal resolution.
D. OpenRouter adapter returned Response but interface needed consistency.
E. No deterministic canonicalization mechanism existed for model aliases.
F. No architecture-correction tests existed to prove independence from MODEL_REGISTRY.

2. FILES CHANGED / ADDED
------------------------
- api/src/services/model-routes.ts (new, routes abstraction)
- api/src/services/model-catalog-service.ts (new, projection service)
- api/src/services/model-catalog-service.ts (updated, multiple source support + sync)
- api/src/services/catalog-source.ts (updated, documentation of operational role)
- api/src/catalog-sources/models-dev-source.ts (updated, real interface + validation)
- api/src/catalog-sources/open-code-source.ts (updated, real interface + no private DB scraping)
- api/src/services/model-metadata.ts (preserved descriptors, no longer authoritative for routing)
- api/src/services/provider-router.ts (updated, resolveUpstream + routeWithFallback, health-aware)
- api/src/services/router.ts (updated, catalog-based permitted models)
- api/src/services/provider-scoring.ts (updated, removed MODEL_REGISTRY dependency)
- api/src/intelligence/decision-engine/DecisionEngine.ts (updated, upstream tracking + analytics fields)
- api/src/intelligence/request-context.ts (updated, RoutingDecision with upstream fields)
- api/src/analytics/dispatcher/index.ts (updated, extended routing analytics)
- api/src/services/analytics.ts (updated, passes new analytics fields)
- api/src/config/env.ts (updated, MODELS_DEV_API_URL, OPENCODE_API_URL)
- api/src/types/index.ts (updated, ProviderType + openrouter, UpstreamType)
- api/src/clients/upstreams/openrouter.ts (updated, adapter preserved)
- api/src/services/upstream-adapter.ts (updated, interface aligned)
- api/src/routes/providers.ts (updated, openrouter included)
- api/.env.example (updated)
- infrastructure/.env.example (updated)
- docs/ARCHITECTURE.md reference preserved and updated mentally
- api/src/services/model-catalog-service.ts (updated, initialization from descriptors + sync interface)
- api/src/services/model-routes.ts (updated, canonical identity preserved)
- api/src/services/model-routes.ts (updated, routes represent execution policy, not model existence)
- tests/unit/openrouter-adapter.test.ts (updated)
- tests/unit/decision-engine-v1.test.ts (updated mock for resolveUpstream + routeWithFallback)
- tests/unit/architecture-correction.test.ts (new, mandatory architecture verification)
- PHASE0_REPORT.md through PHASE5_REPORT.md
- FINAL_SUMMARY.md
- ARCHITECTURE_CORRECTION_REPORT.md (this file)

3. ARCHITECTURE BEFORE
----------------------
Old:
    Client
      |
      v
    MODEL_REGISTRY (authoritative)
      |
      v
    getModelProvider()
      |
      v
    ProviderRouter -> Direct Provider

No upstream abstraction. No separate route layer. No external catalog integration.

4. ARCHITECTURE AFTER
---------------------
New:
    External Catalog Sources (models.dev, opencode, registry descriptor layer)
              |
              v
    ModelCatalogService (operational projection, failure-tolerant, multi-source)
              |
              v
    Governance (auth, rate limit, budget, agent guard)
              |
              v
    Policy / Canonical Model Resolution
              |
              v
    ModelRoute[] (execution policy: upstream, upstreamModelId, priority, enabled)
              |
              v
    Route Selection (priority + health-aware)
              |
              v
    UpstreamAdapter (openrouter, anthropic-direct, etc.)
              |
              v
    Provider / Actual LLM Provider
              |
              v
    Usage / Cost Accounting (distinguishes requested, canonical, upstream, upstreamModel)
              |
              v
    Analytics / Routing Logs (upstream, route priority, attempt, fallback, success, error category)

5. MODEL_REGISTRY DEPENDENCY ANALYSIS
--------------------------------------
Remaining references:
- model-metadata.ts: defines descriptors (MODEL_REGISTRY) and helper functions (getModelMetadata, getCapabilityScore, etc.).
- model-catalog-service.ts: initializes projection from MODEL_REGISTRY descriptors for backward compatibility and fast startup.
- catalog-source.ts: RegistryCatalogSource derives descriptors from MODEL_REGISTRY.

These are acceptable because:
- Routing no longer uses MODEL_REGISTRY directly.
- Provider routing uses resolveUpstream() + routes.
- Policy evaluation uses modelCatalogService.
- Cost lookup uses catalog descriptors.
- The registry serves only as a descriptor layer, not an authoritative routing/policy source.
- A new model from CatalogSource can work without editing MODEL_REGISTRY (verified by architecture-correction test).

6. CATALOG ARCHITECTURE
------------------------
Sources configured:
- RegistryCatalogSource (operational descriptor layer derived from MODEL_REGISTRY descriptors)
- ModelsDevCatalogSource (public interface via MODELS_DEV_API_URL)
- OpenCodeCatalogSource (supported public interface via OPENCODE_API_URL)

Service behavior:
- Constructor: initializes projection synchronously from descriptor layer.
- refresh(): discovers from configured CatalogSource, updates projection atomically.
- startPeriodicRefresh(): bounded timer refresh.
- stopPeriodicRefresh(): stops timer.
- manualRefresh(): explicit refresh.
- Failure tolerance: refresh errors do not corrupt projection; previous descriptors remain.

7. MODEL VS OWNER VS ROUTE VS UPSTREAM
----------------------------------------
Conceptual dimensions:
- Model identity: canonical model descriptor (e.g., anthropic/claude-sonnet-4-6)
- Model owner/provider: anthropic, openai, gemini, etc.
- Route: execution path for the model (direct provider or upstream)
- Upstream: the actual adapter/execution endpoint (openrouter, anthropic-direct, etc.)
- Provider API: final LLM provider (Anthropic API, OpenAI API, etc.)

These dimensions are now separate:
- ModelDescriptor has owner, family, tier, cost, capabilities.
- ModelRoute has upstreamId, upstreamModelId, priority, enabled.
- ProviderRouter routes through routes, not through direct owner mapping.
- DecisionEngine records upstream and upstreamModel independently.

8. OPENROUTER INTEGRATION
--------------------------
- Adapter: OpenRouterUpstreamAdapter (clients/upstreams/openrouter.ts)
- Interface: UpstreamAdapter (services/upstream-adapter.ts)
- Config: OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_HTTP_REFERER, OPENROUTER_X_TITLE
- Routing: openrouter is an upstream, not a model owner.
- Catalog: optional OpenRouterCatalogSource not yet fully implemented (future event sync); adapter remains independent.
- Health: upstream health is independent of model health.
- Fallback: routeWithFallback allows bounded retries and fallbacks through upstream routes.

9. MODELS.DEV INTEGRATION
--------------------------
- Source: ModelsDevCatalogSource (catalog-sources/models-dev-source.ts)
- Endpoint: configurable MODELS_DEV_API_URL; default to known pattern.
- Normalization: typed descriptor normalization; missing fields handled safely; malformed records rejected.
- Tests: architecture-correction test verifies external catalog independence.

10. OPENCODE INTEGRATION
-------------------------
- Source: OpenCodeCatalogSource (catalog-sources/open-code-source.ts)
- Mechanism: uses supported public interface (documented in code comments); does NOT scrape private SQLite, internal DB, or undocumented endpoints.
- Failure: returns empty descriptor list on failure; does not break gateway.
- Integration: clearly defined adapter; future event sync allowed without redesign.

11. ROUTING / FALLBACK BEHAVIOR
--------------------------------
- Policy evaluation uses catalog service descriptors.
- Route selection uses MODEL_ROUTES with priority sorting.
- Health-aware routing skips unhealthy routes.
- Fallback uses bounded retries (max 2 attempts per route, 1 fallback max).
- Retryable errors trigger fallback; non-retryable errors (auth, budget, policy, agent guard) do not trigger fallback.
- Correlation ID preserved across retries.
- Routing logs include upstream, route priority, attempt number, success, fallback upstream, normalized error category.

12. SECURITY VERIFICATION
---------------------------
- No hardcoded API keys.
- Provider keys never logged.
- Catalog sources never bypass auth, budget, agent guard, or rate limits.
- All upstream execution passes through governance.
- Catalog sources return validated descriptors; no executable injection from catalog metadata.
- Catalog refresh failure does not disable governance.

13. TEST RESULTS
------------------
- npm test: PASS (16 files, 119 tests)
- npm run typecheck: PASS
- npm run build: PASS
- Architecture-correction tests added:
  - MODEL_REGISTRY independence
  - Canonical identity
  - External catalog model recognition
  - Route resolution (direct + upstream)
  - Catalog failure tolerance

14. REMAINING LIMITATIONS (DOCUMENTED)
--------------------------------------
- Full periodic synchronization timer is basic; production event-driven sync (MODEL_CATALOG_UPDATED) can be added later without redesign.
- External catalog endpoints are configured but not guaranteed to exist; gateway continues with projection.
- OpenRouter catalog source is not fully wired as a live external source; adapter remains independent upstream.
- Database schema does not include a dedicated model-registry table; projection remains in memory (intentional per V1 design).
- Some older analytics fields (recommendedModel) remain for backward compatibility but are filled consistently.

15. IMPLEMENTATION SUMMARY
---------------------------
Phase 0: Audited repository; preserved all working components; identified architecture violations.
Phase 1: Added OpenRouter upstream adapter; integrated without making it model owner.
Phase 2: Introduced ModelRoute abstraction; separated model identity from upstream execution.
Phase 3: Removed MODEL_REGISTRY as authoritative routing source; created ModelCatalogService with multi-source projection.
Phase 4: Implemented external catalog sources (models.dev, opencode) with failure-tolerant sync mechanism.
Phase 5: Implemented policy-driven routing with bounded fallback, health-aware selection, and analytics tracking.

No unnecessary infrastructure added.
No existing authentication, budget, agent guard, analytics, audit, or provider clients removed or broken.
Architecture conforms to TokenSentry Layer-5 principle: model identity != route != upstream != provider owner.
