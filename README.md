 <div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:07111F,40:142B4A,100:2563EB&text=TokenSentry&fontSize=52&fontColor=FFFFFF&fontAlignY=38&desc=The%20Governance%20Layer%20for%20AI%20Requests&descAlignY=59&descSize=17" width="100%" alt="TokenSentry — The Governance Layer for AI Requests" />

<h3>One Gateway. Multiple Providers. Enforceable AI Governance.</h3>

<p>
  <a href="https://github.com/Nitish-Konamarthi/tokensentry-proto">
    <img src="https://img.shields.io/badge/Repository-GitHub-181717?style=for-the-badge&logo=github" alt="GitHub repository"/>
  </a>
  <a href="https://tokensentry-ai.vercel.app">
    <img src="https://img.shields.io/badge/Project%20Website-Live-2563EB?style=for-the-badge&logo=vercel&logoColor=white" alt="Project website"/>
  </a>
  <a href="https://github.com/Nitish-Konamarthi/tokensentry-proto/actions">
    <img src="https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions"/>
  </a>
  <a href="https://github.com/Nitish-Konamarthi/tokensentry-proto/blob/main/api/LICENSE">
    <img src="https://img.shields.io/badge/API%20License-Apache--2.0-blue?style=for-the-badge" alt="API Apache 2.0 licence"/>
  </a>
</p>

<p>
  <b>TypeScript</b> · <b>Fastify</b> · <b>PostgreSQL</b> · <b>Valkey</b> · <b>Next.js</b> · <b>Docker</b>
</p>

<p><i>Built to make AI model access observable, governable and more predictable for developers and organizations.</i></p>

</div>

---

## 1. What is TokenSentry?

**TokenSentry is a self-hosted LLM gateway and governance control plane that sits between AI applications, coding agents and model providers.**

As applications increasingly depend on multiple LLM providers and models, controlling AI infrastructure becomes more complicated than simply choosing an API endpoint.

Teams need to answer questions such as:

- Which models are applications allowed to use?
- How can model selection follow organizational policies?
- How can AI expenditure be controlled before requests reach a provider?
- How can API credentials be managed without exposing provider secrets to clients?
- How can agent sessions be monitored for unusual request patterns?
- How can usage, model selection and request activity be audited?
- What should happen when an upstream provider or an infrastructure dependency becomes unavailable?

TokenSentry brings these responsibilities into a centralized gateway.

Instead of allowing each application to independently implement authentication, routing, budgeting and governance, clients send supported requests through TokenSentry. The gateway evaluates the request, applies configured policies, selects a permitted model and upstream, reserves the estimated budget, executes the request and records its outcome.

The result is a centralized enforcement point for AI access and operational governance.

### The design objective

```text
Without TokenSentry

AI Application
     |
     +------> Provider A
     |
     +------> Provider B
     |
     +------> Provider C

Each application manages its own:
- Provider credentials
- Model selection
- Request limits
- Spending controls
- Usage tracking
- Governance logic


With TokenSentry

AI Applications / Coding Agents
             |
             v
       TokenSentry
       LLM Gateway
             |
      Policy Evaluation
             |
      Model Routing
             |
      Budget Enforcement
             |
      Agent Guard
             |
      Provider Adapters
             |
      Configured Providers
             |
      Usage & Audit Records
```

TokenSentry is designed to centralize these controls while keeping provider-specific communication behind a consistent API boundary.

---

## 2. Project Scope and Current Implementation

TokenSentry V1 is implemented as a modular monolith.

The API, governance services, routing logic, provider adapters and persistence components operate within one Fastify application. This keeps the request execution path relatively simple and avoids introducing unnecessary network boundaries between internal services.

The repository also contains a separate administration dashboard, project website, shared-types package and infrastructure configuration.

| Component | Responsibility | Implementation |
|---|---|---|
| API Gateway | Request entry, validation and orchestration | Fastify + TypeScript |
| Authentication | API-key verification and access scopes | API middleware |
| Decision Engine | Governance and routing orchestration | TypeScript |
| Model Catalogue | Supported model metadata and pricing | Version-controlled catalogue |
| Router | Organization-aware model selection | Deterministic policy evaluation |
| Budget Service | Organization-level budget reservation and reconciliation | Valkey + PostgreSQL |
| Agent Guard | Agent-session monitoring and enforcement | Valkey + PostgreSQL |
| Provider Router | Upstream execution and route fallback | Provider adapters |
| Analytics | Usage and spending records | PostgreSQL |
| Audit | Governance and administrative event history | PostgreSQL |
| Dashboard | Administrative management and analytics | Next.js |
| Website | Project overview and documentation entry point | Next.js |
| Infrastructure | Local and single-host deployment templates | Docker Compose + NGINX |

### Repository structure

```text
tokensentry-proto/
│
├── api/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── intelligence/
│   │   │   ├── analyzer/
│   │   │   ├── decision-engine/
│   │   │   └── request-context.ts
│   │   ├── services/
│   │   ├── clients/
│   │   │   ├── providers/
│   │   │   └── upstreams/
│   │   ├── repositories/
│   │   ├── db/
│   │   ├── validators/
│   │   ├── types/
│   │   └── scripts/
│   │
│   ├── sql/
│   │   └── drizzle/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── e2e/
│   │   └── smoke/
│   ├── openapi.yaml
│   ├── Dockerfile
│   └── package.json
│
├── dashboard/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── website/
│   └── package.json
│
├── shared-types/
│   └── package.json
│
├── infrastructure/
│   ├── nginx/
│   ├── scripts/
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
├── docs/
│   ├── architecture.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── DECISIONS.md
│
├── .github/
│   └── workflows/
│
├── AGENTS.md
└── README.md
```

**Note:** The shared-types package exists in the repository, but its definitions are not currently imported by the API or dashboard. It should not yet be described as an enforced shared API contract.

---

## 3. System Architecture

### High-level architecture

```mermaid
flowchart TB
    subgraph Clients["AI Applications and Coding Agents"]
        A["Application / SDK"]
        B["Coding Agent"]
        C["Automation Workflow"]
    end

    subgraph Gateway["TokenSentry API — Fastify"]
        D["API Key Authentication"]
        E["Request Validation"]
        F["Request Context"]
        G["Decision Engine"]
        H["Model Catalogue & Policy"]
        I["Provider Router"]
        J["Usage & Audit"]
    end

    subgraph State["State and Persistence"]
        K[("PostgreSQL")]
        L[("Valkey")]
    end

    subgraph Providers["Configured Upstream Providers"]
        M["Anthropic"]
        N["OpenAI"]
        O["Google Gemini"]
        P["Groq"]
        Q["OpenRouter"]
    end

    subgraph Console["Management Applications"]
        R["Next.js Dashboard"]
        S["Next.js Website"]
    end

    A --> D
    B --> D
    C --> D

    D --> E --> F --> G
    G --> H
    G <--> K
    G <--> L
    G --> I

    I --> M
    I --> N
    I --> O
    I --> P
    I --> Q

    I --> J
    J --> K

    R --> Gateway
    S -.-> Gateway
```

### Architectural responsibilities

**API layer**

The Fastify API provides the external interface. It handles request validation, middleware execution, request identification, response handling and route registration.

**Intelligence and decision layer**

The decision engine coordinates normalization, request analysis, model catalogue validation, organization policy evaluation, budget checks and provider execution.

**Service layer**

Business logic is separated into services responsible for routing, budgets, Agent Guard, provider execution, model catalogue management, analytics and credential management.

**Repository layer**

Database access is separated from the business services through repositories. PostgreSQL stores durable application entities and governance records.

**State layer**

Valkey handles short-lived shared state and atomic operations needed for rate limiting, budget reservations and agent-session tracking.

**Provider layer**

Provider adapters translate the gateway's supported request shape into provider-specific requests and normalize the upstream execution boundary.

**Presentation layer**

The dashboard communicates with the API for administrative operations, while the website provides a public project overview.

---

## 4. The Request Lifecycle — From Client to Provider

The most important part of TokenSentry is the request execution pipeline.

The main proxy endpoint is:

```http
POST /v1/proxy
```

The API accepts a supported subset of the OpenAI chat-completions request shape.

### Request flow

```mermaid
flowchart TD
    A["Incoming AI request"] --> B["API key authentication"]
    B --> C{"Authorized?"}
    C -->|No| X["401 Unauthorized"]
    C -->|Yes| D["Scope and rate-limit checks"]
    D --> E["Validate request payload"]
    E --> F["Create request context"]
    F --> G{"Agent session blocked?"}
    G -->|Yes| Y["Reject agent session"]
    G -->|No| H["Normalize request and estimate tokens"]
    H --> I["Validate model catalogue and pricing"]
    I --> J["Load organization model policy"]
    J --> K["Select permitted model"]
    K --> L["Estimate final route cost"]
    L --> M["Atomic budget reservation in Valkey"]
    M --> N{"Budget approved?"}
    N -->|No| Z["Reject request"]
    N -->|Yes| O["Execute provider request"]
    O --> P["Process response / stream"]
    P --> Q["Reconcile usage and reservation"]
    Q --> R["Record analytics and audit data"]
    R --> S["Return response with call ID"]
```

### Step 1 — Authentication and authorization

Each proxy request must carry a TokenSentry API key through the authorization header.

```http
Authorization: Bearer YOUR_TOKENSENTRY_API_KEY
```

The authentication middleware validates the key and creates an authenticated request context.

The request context contains trusted identity and organizational attributes such as:

- Organization ID.
- Team and user attribution.
- API-key identity.
- Assigned role.
- Permission scopes.

Identity attribution is derived from the authenticated API key rather than caller-controlled organization or user headers.

The proxy route also requires the appropriate proxy scope.

### Step 2 — Request validation and normalization

The gateway validates incoming requests using its request schemas.

The current proxy contract supports:

- Model identifier.
- Messages with supported roles.
- Optional system instructions.
- Maximum output tokens.
- Temperature.
- Streaming selection.

The decision engine normalizes request data and calculates a deterministic request hash for request identification and analysis.

### Step 3 — Request context construction

TokenSentry constructs a request context that carries the information required throughout the governance pipeline.

This avoids independently reconstructing identity, request metadata and policy inputs at every service boundary.

For requests containing agent and session identifiers, TokenSentry also evaluates the current session's enforcement state.

### Step 4 — Model catalogue validation

Before execution, TokenSentry checks whether the requested model exists in its version-controlled model catalogue.

The catalogue provides the metadata needed for model support, ownership, tier and pricing decisions.

Unsupported models are rejected.

Models with unknown or unavailable pricing are also rejected rather than being executed without a reliable cost estimate.

This is a deliberate fail-closed governance decision.

### Step 5 — Organization policy evaluation

The router evaluates the requested model against the organization's configured policy.

Policy evaluation considers:

- Explicitly permitted models.
- Supported model tiers.
- Requested model metadata.
- Whether the requested model is allowed.

When the requested model is not permitted, the router can select an appropriate permitted alternative according to its deterministic selection logic and configured priority.

V1 uses policy-based decision logic rather than calling another LLM to decide whether a request should be allowed.

### Step 6 — Budget reservation

Once the final model is selected, TokenSentry estimates the request cost using the model catalogue and estimated token usage.

The budget service then checks the organization's spending policy and attempts an atomic reservation in Valkey.

Reservations are tracked using the request identifier to prevent duplicate reservation handling.

The reservation operation uses a Lua script to coordinate spending updates atomically.

V1 supports organization-level budget enforcement. Team-level and individual-user budget enforcement are not implemented.

If budget infrastructure becomes unavailable, the gateway blocks the request instead of silently allowing an ungoverned execution.

Typical outcomes:

| Condition | Behaviour |
|---|---|
| Budget approved | Continue to provider execution |
| Budget exceeded | Reject with HTTP 402 |
| Budget enforcement unavailable | Reject with HTTP 503 |
| Unknown model pricing | Reject before execution |

### Step 7 — Provider execution

After governance checks pass, the provider router executes the selected request through the appropriate adapter.

The implementation contains integrations for:

- Anthropic direct API.
- OpenAI direct API.
- Google Gemini.
- Groq.
- OpenRouter.

Provider credentials are configured on the API server and are not supplied by client applications in proxy requests.

Each adapter handles the provider-specific request and response boundary.

### Step 8 — Usage reconciliation and analytics

After provider execution, the gateway processes available usage information and reconciles the reservation against the resulting cost.

Where provider-reported usage is available, it is used for accounting. Otherwise, the implementation uses its estimate.

The gateway records call information including relevant organization attribution, model, provider, token counts, duration, status and usage cost.

These records support the analytics endpoints and management dashboard.

### Step 9 — Response delivery

The gateway returns the result using the supported response contract.

Proxy responses include a request correlation identifier:

```http
x-call-id: <request-id>
```

For successful non-streaming responses, the gateway also exposes the call identifier in its `_ts` response metadata.

This provides a consistent identifier for troubleshooting and traceability across the request lifecycle.

---

## 5. Deterministic Model Routing

TokenSentry separates model policy evaluation from provider execution.

The router works with the supported model catalogue, organization policy and request characteristics to determine an approved model before invoking the provider router.

### Routing inputs

- Requested model.
- Estimated input context.
- Requested output-token limit.
- Organization's allowed-model policy.
- Maximum permitted model tier.
- Configured routing priority.

### Routing objectives

The routing implementation supports policy-driven model selection and cost-oriented selection logic.

The architecture allows the gateway to make routing decisions before consuming provider resources.

An important design boundary is that the model catalogue is version-controlled. V1 does not claim automatic synchronization with every external model registry.

### Why deterministic governance?

For an infrastructure gateway, enforcement should be understandable and reproducible.

A policy decision should not depend on asking another probabilistic model whether a request satisfies a spending or access rule.

The core governance path therefore uses explicit policies, catalogue metadata and application logic.

This makes its decisions easier to inspect, test and audit.

---

## 6. Agent Guard — Agent Session Governance

AI coding agents can produce highly variable request patterns.

Repeated retries, excessive tool activity, recursive execution and rapid token consumption can cause operational and cost problems.

Agent Guard is TokenSentry's session-monitoring and enforcement component.

It evaluates signals observable at the gateway boundary rather than attempting to inspect an agent's private internal reasoning.

### Session identification

Clients can attach agent and session identifiers to proxy requests using:

```http
x-ts-agent-id: your-agent-id
x-ts-session-id: your-session-id
```

These identifiers allow TokenSentry to associate requests with an agent session.

### Signals monitored

The current implementation tracks or evaluates:

| Signal | Purpose |
|---|---|
| Request frequency | Identify unusually high request rates |
| Token growth | Identify rapid increases in token consumption |
| Retry patterns | Detect repeated retry behaviour |
| Tool activity | Observe tool-related message activity |
| Provider switching | Track provider changes during a session |
| Recursive depth | Evaluate available session-depth signals |
| Budget utilization | Include spending pressure in risk evaluation |

### Risk evaluation

The guard service calculates a risk score from multiple factors and uses configured thresholds to determine a corresponding action.

The conceptual response levels are:

- **Allow:** Continue normal request processing.
- **Warn:** Record or surface elevated risk.
- **Block:** Prevent further execution for a blocked session.

The gateway checks persisted termination state and transient block state when a session is evaluated.

### Session persistence and enforcement

Valkey maintains transient session statistics and activity windows.

PostgreSQL stores durable agent-session records and guard events where required.

Administrators can inspect sessions, retrieve guard events and terminate sessions through the management API.

Termination is organization-scoped and requires administrative authorization.

**Important boundary:** Agent Guard does not execute tools, modify agent plans or control an agent's internal workflow. It enforces policies using signals visible to TokenSentry through incoming requests.

---

## 7. Budget Management and Cost Governance

Cost governance is not treated as a reporting-only feature.

TokenSentry performs a reservation check before provider execution.

### Budget enforcement design

```mermaid
sequenceDiagram
    participant Client
    participant API as TokenSentry API
    participant Budget as Budget Service
    participant DB as PostgreSQL
    participant VK as Valkey
    participant Provider

    Client->>API: POST /v1/proxy
    API->>Budget: Check organization policy
    Budget->>DB: Read budget limits
    DB-->>Budget: Monthly / daily limits
    Budget->>VK: Atomic reservation
    VK-->>Budget: Approved / rejected

    alt Reservation approved
        Budget-->>API: Continue
        API->>Provider: Execute model request
        Provider-->>API: Response and available usage
        API->>Budget: Reconcile reservation
        Budget->>VK: Adjust reserved amount
        API-->>Client: Model response
    else Reservation rejected or unavailable
        Budget-->>API: Block request
        API-->>Client: Governance error
    end
```

Valkey is used for shared counter updates and reservations, while PostgreSQL stores the durable budget policy.

Reservation reconciliation adjusts the reserved amount using the available final usage information.

The implementation includes protection against duplicate reservation identifiers and a reservation release path for applicable failed provider executions.

### Scope of V1

- Organization-level monthly budget.
- Optional organization-level daily budget.
- Atomic reservation and reconciliation.
- Fail-closed behaviour when reservation infrastructure is unavailable.

Team and individual-user budgets are not yet implemented.

---

## 8. Provider Abstraction and Streaming

TokenSentry provides a gateway-level request format for supported model calls.

Provider-specific details are isolated behind adapter modules.

### Provider boundary

```mermaid
flowchart TB
    A["TokenSentry Proxy Request"] --> B["Provider Router"]
    B --> C{"Selected Upstream"}
    C --> D["Anthropic Adapter"]
    C --> E["OpenAI Adapter"]
    C --> F["Gemini Adapter"]
    C --> G["Groq Adapter"]
    C --> H["OpenRouter Adapter"]

    D --> I["Provider Response"]
    E --> I
    F --> I
    G --> I
    H --> I

    I --> J["Usage / Error Processing"]
    J --> K["Gateway Response"]
```

This separation makes it possible to evolve provider-specific behaviour without placing all communication logic inside the main proxy route.

### Fallback execution

The provider-router implementation contains route-candidate execution and fallback handling.

It tracks execution attempts, upstream health and normalized error categories.

A failed or unhealthy candidate can be skipped in favour of another configured candidate when an eligible fallback route exists.

Fallback is conditional on the configured route candidates; it is not a guarantee that every provider failure can be recovered.

### Streaming

The proxy supports streaming through its provider execution path.

Streaming responses are handled separately from ordinary JSON responses.

One important HTTP limitation is documented in the architecture: once response headers have been sent, a later upstream failure cannot change the original HTTP status code.

This behaviour is accounted for in the gateway's streaming design.

---

## 9. Storage and State Management

TokenSentry deliberately separates durable data from operational transient state.

| Responsibility | PostgreSQL | Valkey |
|---|---|---|
| Organization records | Primary | — |
| API-key records | Primary | — |
| Budget policies | Primary | — |
| Usage and audit history | Primary | — |
| Agent guard events | Primary | — |
| Budget counters | — | Primary operational state |
| Atomic budget reservations | — | Primary operational state |
| Rate-limit counters | — | Primary operational state |
| Active agent-session state | Durable records where required | Transient session tracking |
| Recent token and activity windows | Durable event records where recorded | Time-window state |

### Why this separation?

PostgreSQL provides relational persistence for application records and administrative data.

Valkey provides fast shared state and atomic operations for controls that need to be evaluated on the request path.

The architecture keeps the gateway's request and policy responsibilities inside the API application while delegating state operations to the appropriate storage systems.

---

## 10. Administration Dashboard

The separate Next.js dashboard provides an administrative interface for TokenSentry.

It is designed to manage and inspect the gateway rather than duplicate its enforcement logic.

### Implemented dashboard areas

| Area | Responsibility |
|---|---|
| Overview | Organization and budget overview |
| Spending analytics | Usage and spending visualizations |
| Model analytics | Model distribution and cost breakdown |
| Budget management | Organization budget policy |
| API keys | Key creation, listing and revocation |
| Agent Guard | Active sessions and guard activity |
| Providers | Provider credential configuration status |
| Members | Team member listing and removal |
| Audit logs | Administrative event history |
| Organization settings | Organization configuration |

### Authentication boundary

The dashboard uses Auth0 for user authentication and communicates with the TokenSentry API using a server-side API key.

Sensitive API credentials are intended to remain on the server rather than being exposed through public frontend environment variables.

### Known dashboard limitations

V1 does not yet implement team invitations, billing, organization deletion or budget-counter reset.

---

## 11. API Reference

The main model-proxy endpoint is:

```http
POST /v1/proxy
Authorization: Bearer YOUR_TOKENSENTRY_API_KEY
Content-Type: application/json
```

### Example request

```json
{
  "model": "anthropic/claude-haiku-4-5",
  "messages": [
    {
      "role": "user",
      "content": "Explain how a distributed rate limiter works."
    }
  ],
  "max_tokens": 512,
  "temperature": 0.2,
  "stream": false
}
```

The example model must also be supported by the current catalogue and permitted by the organization's policy. Provider credentials and model availability must be configured.

### Main API areas

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/proxy` | Governed LLM request execution |
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | Database and Valkey readiness |
| GET | `/v1/analytics/spend` | Spending analytics |
| GET | `/v1/analytics/models` | Model usage distribution |
| GET | `/v1/agents` | Agent-session listing |
| GET | `/v1/agents/guard-events` | Agent Guard event history |
| POST | `/v1/agents/:sessionId/terminate` | Administrative session termination |
| GET | `/v1/api-keys` | API-key listing |
| POST | `/v1/api-keys` | API-key creation |
| DELETE | `/v1/api-keys/:keyId` | API-key revocation |
| GET | `/v1/audit-logs` | Audit log retrieval |
| GET | `/v1/budgets` | Budget information |
| PUT | `/v1/budgets` | Budget policy update |
| GET | `/v1/providers` | Provider configuration status |

The OpenAPI specification documents the core route contracts. Additional registered administrative routes are described in the source and relevant documentation; the OpenAPI file is not yet a complete specification of every route.

**Detailed API documentation:** [`api/openapi.yaml`](api/openapi.yaml) · [`docs/API.md`](docs/API.md)

---

## 12. Technology Stack

| Layer | Technologies |
|---|---|
| Primary language | TypeScript |
| Runtime | Node.js 22+ |
| API framework | Fastify 5 |
| Validation | TypeBox, Zod |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Cache and state | Valkey, ioredis |
| Provider integrations | Anthropic, OpenAI, Gemini, Groq, OpenRouter |
| Dashboard | Next.js, React |
| Website | Next.js |
| Authentication | API-key authentication, Auth0 dashboard authentication |
| Infrastructure | Docker, Docker Compose, NGINX |
| CI/CD | GitHub Actions |
| Testing | Vitest, Fastify injection and integration tests |

---

## 13. Local Development

### Prerequisites

- Node.js 22 or later.
- npm.
- Docker with Docker Compose.
- PostgreSQL and Valkey, or the provided development Compose configuration.
- Provider credentials for actual model execution.
- Auth0 configuration for dashboard authentication.

### Clone the repository

```bash
git clone https://github.com/Nitish-Konamarthi/tokensentry-proto.git

cd tokensentry-proto
```

### Start local infrastructure

Copy the example environment file:

**PowerShell**

```powershell
Copy-Item infrastructure/.env.example infrastructure/.env
```

**Linux / macOS**

```bash
cp infrastructure/.env.example infrastructure/.env
```

Start PostgreSQL and Valkey using the development override:

```bash
docker compose \
  --env-file infrastructure/.env \
  -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.dev.yml \
  up -d postgres valkey
```

### Configure the API

Copy the API environment template.

**PowerShell**

```powershell
Copy-Item api/.env.example api/.env
```

**Linux / macOS**

```bash
cp api/.env.example api/.env
```

Configure the required database URL, Valkey URL, API key pepper and other necessary environment values.

Install dependencies:

```bash
cd api
npm ci
```

Run migrations:

```bash
npm run db:migrate
```

Start the development server:

```bash
npm run dev
```

### Bootstrap the initial organization

TokenSentry includes an explicit bootstrap command for creating the first organization, initial owner membership, budget and API key.

Run it only against an appropriately configured empty database:

```bash
npm run db:bootstrap
```

The bootstrap operation requires explicit confirmation. It refuses to create initial records when the database already contains an organization.

The generated owner API key is displayed once. Store it securely.

### Start the dashboard

In a separate terminal:

```bash
cd dashboard
npm ci
npm run dev
```

Configure the Auth0 settings, API URL and server-side dashboard API key using the dashboard environment template.

### Start the website

In another terminal:

```bash
cd website
npm ci
npm run dev
```

Refer to the individual component README files and `.env.example` files for component-specific configuration.

---

## 14. Testing and Engineering Quality

Testing is an important part of the TokenSentry implementation.

The API test structure separates different levels of verification.

```text
api/tests/
│
├── unit/
│   ├── authentication
│   ├── routing
│   ├── budgeting
│   ├── agent-guard
│   ├── accounting
│   ├── provider adapters
│   └── validation
│
├── integration/
│   ├── health
│   └── proxy pipeline
│
├── e2e/
│   └── authentication and governance
│
└── smoke/
    └── OpenAI-compatible request checks
```

### Run API checks

```bash
cd api

npm run typecheck
npm test
npm run build
```

Run coverage:

```bash
npm run test:coverage
```

### Continuous integration

The repository contains two GitHub Actions workflows.

**Application CI**

`.github/workflows/ci.yml`

The workflow includes:

- Node.js 22 setup.
- Dependency installation using `npm ci`.
- Type checking and builds for API, dashboard, website and shared-types.
- API tests using PostgreSQL and Valkey service containers.

**Infrastructure CI**

`.github/workflows/infrastructure-ci.yml`

The workflow includes:

- Docker Compose configuration validation.
- Development Compose override validation.
- NGINX configuration syntax checks.
- Shell script analysis using ShellCheck, currently configured as a non-blocking step.

GitHub Actions definitions are present in the repository. Check the [Actions page](https://github.com/Nitish-Konamarthi/tokensentry-proto/actions) for the latest workflow execution results.

---

## 15. Deployment Architecture

TokenSentry includes deployment configuration for both prototype hosting and a more complete single-host deployment.

### Vercel-based prototype

The documented prototype configuration uses:

| Component | Service |
|---|---|
| API | Vercel |
| Database | Neon PostgreSQL |
| Shared state | Upstash Redis / Valkey-compatible service |
| Website | Vercel |
| Dashboard | Next.js deployment configuration |

The Vercel API prototype requires compatible runtime support, configured secrets, database migrations and bootstrap of the first organization.

**Important:** The website being publicly accessible does not imply that every component of the complete gateway stack is production deployed.

### Docker Compose deployment template

The repository also contains a single-host deployment configuration built around:

- Fastify API container.
- Next.js dashboard.
- Next.js website.
- PostgreSQL.
- Valkey.
- NGINX reverse proxy.
- TLS certificate configuration.
- Backup container and operational scripts.

The deployment guide describes the required domain names, TLS setup, provider credentials, authentication configuration and infrastructure dependencies.

### Production readiness

The current free-tier prototype is intended for development and demonstration workloads.

Before a production deployment, the following must be independently verified:

- Persistent database and cache infrastructure.
- Reliable atomic state operations.
- TLS and secrets management.
- Provider credential security.
- Backup restoration and disaster recovery.
- Monitoring and operational alerting.
- Concurrency and failure-path testing.
- Streaming behaviour under upstream failures.

A checked-in deployment template is not the same thing as a production-certified service.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 16. Security and Governance Considerations

Security is part of the gateway's primary responsibility.

The current implementation includes:

- API-key authentication.
- Proxy-scope enforcement.
- Administrative authorization for privileged operations.
- Server-side provider credential configuration.
- Request schema validation.
- Organization-scoped administrative operations.
- Rate limiting.
- Budget enforcement.
- Request correlation IDs.
- Audit event recording.
- Fail-closed behaviour for unavailable budget checks.
- Model pricing validation before provider execution.

### Security boundaries

TokenSentry's governance decisions are based on information available to the gateway.

Agent Guard does not inspect private source-code repositories, hidden chain-of-thought, local developer environments or tools that are never represented in gateway-visible request data.

Provider credentials must never be committed to the repository or exposed to browser-side code.

For vulnerability reports, use GitHub's private vulnerability reporting where enabled, or contact the maintainer through the public GitHub profile.

---

## 17. Architectural Decisions and Trade-offs

Some important decisions behind TokenSentry V1:

| Decision | Reason |
|---|---|
| Modular monolith | Keeps the governance request path straightforward while maintaining internal separation of concerns |
| PostgreSQL for durable records | Provides relational persistence for organizations, policies, keys, usage and audit data |
| Valkey for shared controls | Supports low-latency shared state and atomic operations |
| Deterministic policy evaluation | Makes governance decisions explicit and reproducible |
| Version-controlled model catalogue | Avoids relying on unknown or unpriced models |
| Provider adapter abstraction | Keeps provider-specific communication outside the primary request orchestration |
| Reservation before execution | Prevents knowingly executing requests that exceed available budget |
| Explicit streaming semantics | Accounts for HTTP status limitations after response headers are sent |

These decisions are documented in [`docs/DECISIONS.md`](docs/DECISIONS.md).

---

## 18. Current Scope and Known Limitations

TokenSentry V1 is an evolving infrastructure project. The following distinctions are important for understanding its current capabilities.

| Area | Current V1 scope |
|---|---|
| Gateway architecture | Implemented as one Fastify application |
| Provider adapters | Anthropic, OpenAI, Gemini, Groq and OpenRouter |
| Model catalogue | Version-controlled metadata |
| Model routing | Deterministic policy-driven routing |
| Budget enforcement | Organization-level monthly and optional daily budgets |
| Agent Guard | Gateway-visible session monitoring and enforcement |
| Usage accounting | PostgreSQL-backed usage records |
| Streaming | Supported by provider execution paths |
| Dashboard | Core administrative and analytics functionality |
| Shared types | Package exists; not yet an enforced shared contract |
| Team/user budgets | Not implemented |
| External model registry synchronization | Not implemented |
| Identity-provider invitations | Not implemented |
| Billing | Not implemented |
| Production certification | Not claimed |

The API is not an agent runtime, does not execute customer tools, does not host model weights and does not claim to implement a universal semantic cache.

These boundaries are intentional documentation of the actual V1 implementation, not claims about future functionality.

---

## 19. Project Documentation

| Resource | Description |
|---|---|
| [Architecture](docs/architecture.md) | Runtime components, data flow and system boundaries |
| [API documentation](docs/API.md) | Supported API request and response behaviour |
| [OpenAPI specification](api/openapi.yaml) | Documented API contracts |
| [Deployment guide](docs/DEPLOYMENT.md) | Local, prototype and Docker deployment |
| [Architecture decisions](docs/DECISIONS.md) | Engineering trade-offs and design rationale |
| [Development guidelines](AGENTS.md) | Repository-level development instructions |
| [API component README](api/README.md) | API setup and development |
| [Dashboard README](dashboard/README.md) | Dashboard architecture and configuration |
| [Website README](website/README.md) | Project website development |
| [Shared-types README](shared-types/README.md) | Type definitions and package boundaries |

---

## 20. Roadmap

The project will continue to evolve around reliability, governance and developer experience.

Potential next areas of development include:

- Broader automated integration and contract testing.
- Repeatable gateway overhead and throughput benchmarks.
- Improved provider-health evaluation and failure observability.
- More comprehensive API and event documentation.
- Stronger contributor onboarding and release automation.
- Expanded organization-level governance controls.
- Further hardening of backup, recovery and operational procedures.
- Better compatibility testing with coding agents and developer tools.

Roadmap items describe intended work, not features that are already available.

---

## 21. Contributing

TokenSentry is maintained as an evolving engineering project. Technical feedback, bug reports, architecture discussions and improvements are welcome.

A useful contribution should:

1. Explain the problem it addresses.
2. Describe its proposed implementation.
3. Include appropriate tests where behaviour changes.
4. Preserve the gateway's security and governance boundaries.
5. Update documentation when API contracts or architectural behaviour change.

Before submitting a pull request, run the relevant package checks and tests.

See [GitHub Issues](https://github.com/Nitish-Konamarthi/tokensentry-proto/issues) for current discussions and potential improvement areas.

---

## 22. Maintainer

**Created and maintained by Konamarthi Nitish Veera Venkatesh.**

TokenSentry is an independent engineering project focused on AI infrastructure, backend architecture, model governance and developer tooling.

- **GitHub:** [Nitish-Konamarthi](https://github.com/Nitish-Konamarthi)
- **Project website:** [tokensentry-ai.vercel.app](https://tokensentry-ai.vercel.app)
- **Repository:** [tokensentry-proto](https://github.com/Nitish-Konamarthi/tokensentry-proto)

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=115&color=0:2563EB,50:142B4A,100:07111F&section=footer" width="100%" alt="TokenSentry"/>

<b>Govern the request. Understand the system. Own the infrastructure.</b>

<p><sub>TokenSentry — An independent AI infrastructure engineering project.</sub></p>

</div>
