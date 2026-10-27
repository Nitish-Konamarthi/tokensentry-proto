# TokenSentry V1 Architecture

TokenSentry is a single Fastify application that enforces policy between clients and configured model providers. It does not host models or execute customer agent workflows.

## Runtime components

- API: Node.js 22+, TypeScript, Fastify
- Durable storage: PostgreSQL via Drizzle and postgres.js
- Shared transient state and atomic controls: Valkey via ioredis
- Web applications: Next.js dashboard and project website
- Single-host deployment files: Docker Compose and NGINX under infrastructure/

## Proxy request path

~~~text
HTTP request
  -> API-key authentication and request rate limit
  -> request normalization and model catalog validation
  -> organization model policy and deterministic model routing
  -> atomic organization budget reservation in Valkey
  -> Agent Guard checks when agent/session identifiers are supplied
  -> configured provider adapter
  -> usage reconciliation, analytics, and audit recording
  -> HTTP response with x-call-id
~~~

The order and failure semantics are implemented in api/src/routes/proxy.ts and api/src/intelligence/decision-engine/DecisionEngine.ts. Invalid or unpriced models are rejected. Budget coordination fails closed when Valkey is unavailable. Provider errors release reservations where applicable.

## Model catalog and routing

The supported catalog is defined in version-controlled source. V1 does not synchronize model metadata from external registries. Routing is deterministic and uses the request, catalog, organization policy, and current upstream information.

## Provider adapters

Provider-specific request formats, response parsing, streaming, and error handling are implemented in API provider modules. Provider credentials are configured server-side. Clients use TokenSentry API keys.

## Budget and rate controls

Valkey performs shared atomic rate-limit and budget operations. PostgreSQL stores durable organizations, policies, keys, audit records, and usage data. V1 budget policy is organization-level; team and user budget enforcement is not implemented.

## Agent Guard

Agent Guard evaluates gateway-visible request/session signals and maintains transient state in Valkey with durable records in PostgreSQL. It is part of the API process. It does not execute tools or manage an agent's internal workflow.

## Streaming

The gateway streams supported provider responses. Once response headers have been sent, a later provider failure cannot change the HTTP status. This behavior is inherent to HTTP streaming.

## Boundaries

V1 includes the gateway, dashboard, website, provider adapters, PostgreSQL schema, Valkey controls, and single-host deployment configuration. It does not include an agent runtime, semantic cache, model-training system, or separate governance services.