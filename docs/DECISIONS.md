# TokenSentry Architecture Decisions

This document records the major architectural decisions behind TokenSentry V1.

The purpose is to explain why the system is designed the way it is, rather than documenting every implementation detail.

---

# ADR-001: TokenSentry is a Gateway/Governance Layer

## Decision

TokenSentry operates as an infrastructure layer between AI clients/agents and LLM providers.

```text
AI Client / Agent
        │
        ▼
   TokenSentry
        │
        ▼
   LLM Provider
```

## Reason

Applications should not independently implement provider governance such as:

- Authentication
- Rate limiting
- Budget controls
- Model policies
- Provider handling
- Usage accounting

A gateway creates a centralized enforcement boundary.

---

# ADR-002: Keep V1 Deterministic

## Decision

V1 uses deterministic policy-based decisions.

## Reason

Governance infrastructure should be predictable.

For the same:

```text
Request
+
Configuration
+
Current system state
```

the gateway should produce a predictable decision.

An AI model is therefore not required to make the primary V1 governance decisions.

---

# ADR-003: Use a Single Gateway Service

## Decision

V1 is implemented as a single gateway application rather than multiple microservices.

## Reason

Splitting authentication, budgets, routing, accounting, and agent controls into independent services would introduce:

- Network calls
- Deployment complexity
- More failure modes
- Distributed debugging
- More infrastructure

The V1 workload does not justify that complexity.

The internal modules remain separated in code without requiring separate deployments.

---

# ADR-004: PostgreSQL for Persistent Data

## Decision

Use PostgreSQL as the primary durable database.

## Reason

PostgreSQL provides:

- Transactions
- Strong consistency
- Mature tooling
- Relational queries
- Simple operational model

There is no V1 requirement for a specialized analytical database.

---

# ADR-005: Valkey for Fast Shared State

## Decision

Use Valkey for high-frequency transient/shared state.

## Reason

Rate limiting, budget coordination, and Agent Guard require fast atomic state operations.

Valkey provides:

- Atomic operations
- Lua scripting
- Low latency
- Shared state across gateway instances

PostgreSQL remains the durable data store.

---

# ADR-006: Atomic Rate Limiting

## Decision

Rate limiting uses atomic Valkey operations rather than a read-then-write sequence.

## Reason

A naive implementation could behave incorrectly under concurrent requests:

```text
Request A ──► read = 9
Request B ──► read = 9

Request A ──► write = 10
Request B ──► write = 10
```

Atomic operations avoid this race.

---

# ADR-007: Budget Reservation Before Provider Execution

## Decision

Budget is reserved before the provider request is sent.

## Reason

If budget were only checked after provider execution, multiple concurrent requests could exceed the configured spending limit.

The reservation model provides:

```text
Check
  ↓
Reserve
  ↓
Execute
  ↓
Reconcile
```

Failed provider requests release their reservation.

---

# ADR-008: Normalize Provider Errors

## Decision

Provider-specific failures are mapped to internal error categories.

Examples:

```text
PROVIDER_AUTH
PROVIDER_RATE_LIMIT
PROVIDER_BAD_REQUEST
PROVIDER_UNAVAILABLE
PROVIDER_TIMEOUT
PROVIDER_NETWORK
PROVIDER_ERROR
```

## Reason

The rest of TokenSentry should not depend on provider-specific exception structures.

This also gives clients more stable error semantics.

---

# ADR-009: Explicit Model Metadata in V1

## Decision

V1 uses an explicit model metadata layer for deterministic model governance and routing.

## Reason

V1 does not require dynamic synchronization with an external coding agent's model registry.

An explicit registry keeps:

- Supported models
- Provider mapping
- Tier
- Capabilities
- Cost information

predictable and version-controlled.

Dynamic model discovery can be introduced later if it becomes necessary.

---

# ADR-010: Reject Unknown Models

## Decision

Unknown models are rejected.

## Reason

Silently falling back from an unknown model can bypass governance assumptions.

For example:

```text
Requested: unknown-model
        │
        ▼
Silent fallback
        │
        ▼
Unexpected model execution
```

The safer V1 behavior is:

```text
Unknown model
      │
      ▼
Reject
```

---

# ADR-011: No Dynamic Model Synchronization in V1

## Decision

V1 does not implement event-driven model-registry synchronization.

## Reason

Dynamic synchronization introduces:

- Event infrastructure
- Cache invalidation
- Synchronization failures
- Additional state management
- Provider/agent coupling

The V1 objective does not require it.

---

# ADR-012: Provider Credentials Stay Server-Side

## Decision

Clients communicate with TokenSentry rather than directly receiving provider credentials.

## Reason

This allows TokenSentry to act as the centralized governance boundary.

```text
Client
  │ TokenSentry credential
  ▼
TokenSentry
  │ Provider credential
  ▼
Provider
```

Provider credentials should never be exposed to untrusted clients.

---

# ADR-013: No Kafka/Event Bus in V1

## Decision

V1 does not require Kafka or another distributed event bus.

## Reason

The core gateway path is synchronous.

Introducing an event bus would add substantial operational complexity without solving a V1 requirement.

---

# ADR-014: No ClickHouse in V1

## Decision

V1 does not require ClickHouse or another dedicated analytics database.

## Reason

V1 usage and audit requirements do not justify a separate analytical infrastructure layer.

If analytics volume grows significantly, an analytical datastore can be evaluated later.

---

# ADR-015: No Kubernetes Requirement

## Decision

V1 does not require Kubernetes.

## Reason

A lightweight gateway can initially run using Docker Compose on a VM.

Kubernetes should be introduced only when requirements such as:

- Large-scale orchestration
- Automated scheduling
- Multi-service deployment
- High availability requirements

justify the additional complexity.

---

# ADR-016: NGINX as Edge Reverse Proxy

## Decision

NGINX can provide the external HTTP/TLS boundary.

## Reason

NGINX provides a simple and mature edge layer for:

- TLS termination
- Reverse proxying
- Connection management
- Request handling

It keeps the gateway focused on application-level governance.

---

# ADR-017: Streaming is Treated Differently

## Decision

Streaming requests are not expected to provide the same failure semantics as ordinary request/response calls.

## Reason

Once an HTTP stream starts, the status code has already been sent.

Therefore a later provider failure cannot change a previously delivered HTTP 200 status.

This is documented behavior rather than something V1 attempts to hide with complex infrastructure.

---

# ADR-018: Avoid Premature Observability Infrastructure

## Decision

V1 relies primarily on application logs, metrics already present in the application, and health checks.

## Reason

A dedicated telemetry pipeline would add infrastructure that is not necessary for the initial system.

The architecture can evolve if operational requirements grow.

---

# ADR-019: Keep Agent Guard Inside the Gateway

## Decision

Agent Guard is implemented as part of TokenSentry rather than as a separate service.

## Reason

Agent Guard needs access to request state and gateway decisions.

Keeping it inside the gateway:

- Reduces latency
- Avoids network calls
- Simplifies state management
- Keeps enforcement close to the request path

---

# ADR-020: V1 Feature Freeze

## Decision

Once the core gateway path is functional, V1 should be stabilized rather than continuously expanded.

## Reason

The primary risk after functional completion is architectural drift.

The final V1 effort should focus on:

- Tests
- Security hardening
- Deployment verification
- Documentation
- Bug fixes

rather than adding unrelated infrastructure.

---

# Summary

TokenSentry V1 intentionally chooses:

```text
Fastify
+
PostgreSQL
+
Valkey
+
NGINX
+
Provider adapters
```

instead of:

```text
Microservices
+
Kafka
+
ClickHouse
+
Kubernetes
+
Complex telemetry
+
Dynamic model synchronization
```

The principle is simple:

> **Use the smallest architecture that correctly solves the V1 governance problem.**

More infrastructure should be introduced only when a concrete requirement justifies it.