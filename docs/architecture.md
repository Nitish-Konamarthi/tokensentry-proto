# TokenSentry Architecture

## 1. Overview

TokenSentry is a lightweight AI gateway and governance layer positioned between AI clients/agents and LLM providers.

```text
AI Client / Agent
       │
       ▼
   TokenSentry
       │
       ▼
LLM Provider
```

The gateway provides centralized enforcement for:

- Authentication
- Rate limiting
- Budget control
- Model governance
- Provider routing
- Agent safety
- Usage and cost accounting
- Audit/analytics

The V1 architecture is intentionally deterministic and lightweight.

---

# 2. System Architecture

```text
                    ┌─────────────────────┐
                    │   AI Client / Agent │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     TokenSentry     │
                    │                     │
                    │ Authentication      │
                    │ Rate Limiting       │
                    │ Budget Enforcement  │
                    │ Model Governance    │
                    │ Model Routing       │
                    │ Agent Guard         │
                    │ Provider Adapter    │
                    │ Usage / Cost        │
                    │ Analytics / Audit   │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
          OpenAI           Anthropic          Gemini
             │
             └───────────────┬─────────────────┘
                             ▼
                            Groq
```

---

# 3. Request Lifecycle

A request entering the proxy follows this logical pipeline:

```text
Request
   │
   ▼
Authentication
   │
   ▼
Rate Limit
   │
   ▼
Budget Reservation
   │
   ▼
Model Validation / Policy
   │
   ▼
Model Routing
   │
   ▼
Agent Guard
   │
   ▼
Provider Request
   │
   ▼
Usage / Cost Accounting
   │
   ▼
Analytics / Audit
   │
   ▼
Response
```

The ordering is important.

Governance checks should occur before provider execution whenever possible.

---

# 4. Authentication

Authentication establishes whether the client is authorized to use the gateway.

```text
Client
  │
  │ API key
  ▼
TokenSentry
  │
  ├── Valid ──────► Continue
  │
  └── Invalid ────► Reject
```

Provider credentials remain server-side.

Clients should not receive provider API keys.

---

# 5. Rate Limiting

Rate limiting protects the gateway and controls request frequency.

TokenSentry uses Valkey for shared request state.

The V1 implementation uses atomic operations/Lua scripting to avoid race conditions between concurrent requests.

Conceptually:

```text
Request
   │
   ▼
Rate-limit key
   │
   ▼
Atomic counter
   │
   ├── Within limit ──► Continue
   │
   └── Exceeded ──────► Reject
```

---

# 6. Budget Enforcement

Budget enforcement prevents requests from exceeding configured spending limits.

The V1 implementation uses reservation and reconciliation.

```text
Request
   │
   ▼
Estimate cost
   │
   ▼
Reserve budget
   │
   ├── Failed ──────► Reject
   │
   ▼
Provider call
   │
   ├── Success
   │     │
   │     ▼
   │  Reconcile actual usage
   │
   └── Failure
         │
         ▼
     Release reservation
```

Valkey atomic operations are used for budget state updates.

---

# 7. Model Governance

TokenSentry validates requested models before provider execution.

The V1 model metadata layer contains information used for deterministic governance and routing.

Examples include:

- Provider
- Family
- Tier
- Capability score
- Coding capability
- Reasoning capability
- Vision capability
- Cost information

Unknown models are rejected.

```text
Requested model
      │
      ▼
Known?
  │       │
 No      Yes
  │       │
  ▼       ▼
Reject   Policy
           │
           ▼
        Routing
```

V1 intentionally does not depend on dynamic model-registry synchronization.

---

# 8. Model Routing

The router determines the provider/model combination according to configured policy.

Routing may consider:

- Requested model
- Model tier
- Capability
- Provider availability
- Cost
- Policy constraints

V1 routing is deterministic.

There is no AI-powered routing decision in the V1 request path.

---

# 9. Provider Layer

Provider-specific logic is isolated behind provider adapters.

Current integrations include:

- OpenAI
- Anthropic
- Google Gemini
- Groq

The gateway converts provider-specific failures into normalized internal error types.

```text
Provider
   │
   ├── Authentication failure
   ├── Rate limit
   ├── Bad request
   ├── Timeout
   ├── Network failure
   └── Availability failure
             │
             ▼
     Normalized error
```

This prevents the rest of the gateway from being tightly coupled to provider-specific error formats.

---

# 10. Agent Guard

Agent Guard provides infrastructure-level protection against abnormal agent behavior.

It tracks signals such as:

- Request frequency
- Token growth
- Retry behavior
- Tool-call activity
- Provider switching
- Recursive behavior
- Budget utilization

The guard maintains state using Valkey.

```text
Agent activity
      │
      ▼
Agent Guard
      │
      ├── Normal ──► Continue
      │
      └── Abnormal ─► Block
```

Agent Guard is not intended to replace application-level agent safety.

It is an additional enforcement boundary.

---

# 11. Usage and Cost Accounting

After provider execution, TokenSentry processes available usage information.

The accounting layer can associate:

```text
Call ID
Model
Provider
Input tokens
Output tokens
Total tokens
Cost
```

with the request.

This creates a common accounting abstraction across different providers.

---

# 12. Request Correlation

Every proxied request receives a unique call ID.

```text
Client
  │
  ▼
TokenSentry
  │
  │ callId
  ├────► Provider
  ├────► Accounting
  ├────► Analytics
  └────► Audit
```

The call ID is returned to the client through:

```text
x-call-id
```

This provides request correlation without requiring a full distributed tracing stack.

---

# 13. Data Stores

## PostgreSQL

PostgreSQL stores persistent application data.

It is the durable database layer.

## Valkey

Valkey is used for fast, shared state such as:

- Rate limits
- Budget state
- Agent Guard state
- Other short-lived coordination state

This separation keeps durable data and high-frequency state operations distinct.

---

# 14. Deployment Architecture

A simple deployment can run the major components together:

```text
Internet
   │
   ▼
 NGINX
   │
   ▼
TokenSentry API
   │
   ├──────────────► PostgreSQL
   │
   └──────────────► Valkey
   │
   ▼
LLM Providers
```

V1 does not require Kubernetes, Kafka, ClickHouse, or a distributed event bus.

---

# 15. Failure Handling

TokenSentry follows a controlled failure model.

Examples:

```text
Unknown model
    │
    ▼
Reject request

Budget unavailable
    │
    ▼
Fail closed

Rate limit exceeded
    │
    ▼
Reject request

Provider unavailable
    │
    ▼
Stable provider error
```

The gateway should not silently bypass governance controls when an enforcement dependency is unavailable.

---

# 16. Streaming

Streaming requests have different failure semantics from ordinary requests.

Once the HTTP response begins, the status code has already been sent.

Therefore:

```text
Provider
   │
   │ stream starts
   ▼
TokenSentry
   │
   │ HTTP 200 already sent
   ▼
Client
   │
   │ later provider failure
   ▼
stream terminates
```

The gateway can record the logical provider failure, but it cannot retroactively change an HTTP status already delivered to the client.

This is an inherent property of HTTP streaming.

---

# 17. Architectural Boundaries

TokenSentry V1 owns:

```text
Gateway
Authentication
Traffic controls
Budget controls
Model governance
Routing
Agent guard
Provider abstraction
Accounting
Audit
```

TokenSentry does not own:

```text
Model training
LLM inference
Agent framework
Application business logic
Vector database
Prompt-management platform
Kubernetes orchestration
```

---

# 18. V1 Design Goal

The V1 architecture optimizes for:

- Simplicity
- Deterministic behavior
- Clear boundaries
- Low operational overhead
- Easy local deployment
- Understandable code
- Centralized governance

The architecture should only become more distributed when real requirements justify the additional complexity.