# TokenSentry — Agent Instructions

## 1. Project Identity

TokenSentry is a lightweight AI gateway and governance layer.

The primary V1 request path is:

```text
AI Client / Coding Agent
        ↓
TokenSentry Gateway
        ↓
Authentication
        ↓
Rate Limiting
        ↓
Budget Enforcement
        ↓
Model Policy / Routing
        ↓
Agent Guard
        ↓
Provider Adapter
        ↓
LLM Provider
        ↓
Usage / Cost Accounting
        ↓
Audit / Analytics
```

TokenSentry is a gateway/governance layer, not an AI model provider, coding agent, model host, or general-purpose AI platform.

---

# 2. Repository Structure

This is a monorepo.

```text
tokensentry-proto/
├── api/                 # Fastify gateway/API
├── dashboard/           # Next.js administration dashboard
├── website/             # Marketing website
├── shared-types/        # Shared TypeScript types
├── infrastructure/      # Docker Compose, NGINX, deployment scripts
├── docs/                # Product and architecture documentation
├── .opencode/           # OpenCode development-agent configuration
├── AGENTS.md            # Instructions for coding agents
├── CHANGELOG.md         # Release history
└── README.md            # Primary repository entry point
```

Do not assume these components are separate Git repositories.

---

# 3. V1 Architecture

V1 intentionally uses a small architecture:

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

V1 does NOT require:

- Kubernetes
- Kafka
- ClickHouse
- OpenTelemetry collector infrastructure
- Background worker infrastructure
- Microservices
- Event-driven model synchronization
- Dynamic model registry synchronization
- Vector databases
- Semantic caching
- Prompt optimization infrastructure
- Distributed orchestration

Do not introduce these technologies unless the user explicitly requests them or a concrete requirement demonstrates that they are necessary.

---

# 4. Core V1 Principles

### Deterministic governance

Governance decisions should be predictable.

The same:

```text
Request
+
Configuration
+
Current system state
```

should produce a deterministic governance decision.

Do not introduce an LLM into the primary V1 enforcement path.

### Single gateway

Authentication, rate limiting, budget enforcement, routing, Agent Guard, provider execution, and accounting remain inside the gateway application.

Do not split these into separate services without an explicit architectural requirement.

### Provider abstraction

Provider-specific behavior belongs behind provider adapters.

Supported provider behavior must not leak unnecessary provider-specific implementation details into the rest of the gateway.

### Server-side provider credentials

Provider credentials remain server-side.

Clients authenticate with TokenSentry rather than receiving provider API keys.

### Fail closed for governance

Security and spending controls should fail closed where appropriate.

Unknown models, invalid authentication, exceeded budgets, and blocked Agent Guard conditions must not silently bypass governance.

---

# 5. Model Registry

V1 intentionally uses an explicit, version-controlled model metadata layer.

The registry contains information required for deterministic governance/routing such as:

- Model identifier
- Provider
- Model family
- Tier
- Capability information
- Cost information
- Supported capabilities

Do NOT implement dynamic synchronization with a coding agent's model registry in V1.

Do NOT add:

- Event-driven model synchronization
- Kafka-based model synchronization
- Polling workers
- External registry synchronization
- Automatic provider discovery

unless explicitly requested.

Unknown models must be rejected rather than silently mapped to another model.

---

# 6. TokenSentry API

The main V1 proxy endpoint is:

```text
POST /v1/proxy
```

The gateway should preserve a clear separation between:

```text
Client request
→ governance
→ provider execution
→ accounting
```

Each proxied request should have a correlation/call ID.

The `x-call-id` response header is part of the current gateway behavior.

Do not casually change API error semantics or response contracts.

If an API contract changes, update:

```text
api/openapi.yaml
docs/API.md
relevant tests
```

together.

---

# 7. Budget Enforcement

Budget enforcement follows:

```text
Estimate
   ↓
Reserve
   ↓
Provider execution
   ↓
Reconcile actual usage
```

Failed provider requests must release their reservation where applicable.

Budget enforcement uses Valkey atomic operations/Lua where required for concurrency safety.

Do not replace this with a naive read-then-write implementation.

---

# 8. Rate Limiting

Rate limiting uses Valkey atomic operations.

Do not replace atomic rate-limit operations with:

```text
GET
→ modify locally
→ SET
```

because concurrent requests can race.

Preserve the existing atomic behavior unless there is a demonstrated correctness problem.

---

# 9. Agent Guard

Agent Guard is part of the gateway.

It monitors gateway-visible agent behavior such as:

- Request frequency
- Token growth
- Retries
- Tool activity
- Provider thrashing
- Recursive/depth behavior
- Budget utilization

Do not turn Agent Guard into a separate microservice.

Do not add background workers unless a concrete requirement requires them.

---

# 10. Streaming

Streaming requests have different failure semantics from ordinary request/response calls.

Once the HTTP response has started:

```text
HTTP status = already sent
```

Therefore a later provider failure cannot change the original HTTP status.

Do not introduce complex infrastructure solely to hide this inherent streaming behavior.

Document the behavior and test it where appropriate.

---

# 11. Database

PostgreSQL is the durable data store.

Drizzle ORM is used for database access/schema management.

Important database files include:

```text
api/src/db/
api/sql/
api/drizzle.config.ts
api/src/scripts/migrate.ts
api/src/scripts/seed.ts
```

Do not replace PostgreSQL with another database for V1.

Do not introduce ClickHouse for V1 analytics.

---

# 12. Valkey

Valkey is used for high-frequency/shared transient state such as:

- Rate limiting
- Budget coordination
- Agent Guard state
- Other short-lived gateway state

Do not introduce another cache/state system unless there is a concrete requirement.

---

# 13. Infrastructure

The intended V1 deployment model is:

```text
Internet
   ↓
NGINX
   ↓
TokenSentry API
   ↓
PostgreSQL
Valkey
LLM Providers
```

V1 can run as a lightweight Docker Compose deployment.

Do not assume Kubernetes is required.

Do not add distributed infrastructure without a demonstrated need.

Infrastructure configuration lives under:

```text
infrastructure/
```

Do not duplicate deployment configuration elsewhere.

---

# 14. Documentation Hierarchy

Use the following documentation hierarchy:

```text
README.md
    ↓
High-level project overview and quick start

docs/ARCHITECTURE.md
    ↓
How the system works

docs/API.md
    ↓
How clients interact with the API

docs/DEPLOYMENT.md
    ↓
How the current system is deployed

docs/DECISIONS.md
    ↓
Why major architectural decisions were made

CHANGELOG.md
    ↓
Release history
```

Do not create another README merely to repeat information already covered by the canonical documentation.

Do not create duplicate deployment guides.

Do not maintain multiple conflicting architecture descriptions.

When documentation conflicts with the implementation, verify the implementation first and update the stale documentation.

---

# 15. Documentation Accuracy

Never invent implementation status.

Do not claim that TokenSentry has:

- OpenTelemetry infrastructure
- Kafka
- ClickHouse
- Kubernetes
- Dynamic model synchronization
- Background workers
- Vector databases
- Semantic caching
- Prompt optimization

unless the implementation actually exists.

Documentation must describe the current repository, not an aspirational architecture.

If a feature is planned but not implemented, clearly label it as planned/future work.

---

# 16. Dependency Rules

Before adding a dependency:

1. Check whether the functionality can be implemented with the existing stack.
2. Check whether an existing dependency already provides the functionality.
3. Determine whether the dependency is required by V1.
4. Avoid dependencies that introduce unnecessary runtime infrastructure.
5. Prefer small, well-maintained libraries.

Do not add dependencies merely for:

- Architecture fashion
- Premature scalability
- Advanced observability
- AI experimentation unrelated to V1
- Replacing simple existing code

Do not remove an existing dependency merely because it appears unfamiliar.

First verify its imports/usages and package scripts.

---

# 17. Generated Files

Generated artifacts must not be committed.

Examples:

```text
node_modules/
.next/
dist/
coverage/
*.tsbuildinfo
*.log
```

Repository-wide generated artifacts should be protected by the root `.gitignore`.

Environment files containing secrets must never be committed.

Safe templates such as:

```text
.env.example
```

may be committed.

The repository inspection artifact:

```text
structure.txt
```

must not be committed.

---

# 18. Temporary Debugging Files

Do not leave temporary debugging scripts in the repository.

Examples:

```text
debug-*.js
debug-*.mjs
debug-*.cjs
scratch-*
tmp-*
```

If a debugging script becomes a legitimate reusable tool, move it into an appropriate documented tooling location and give it a clear purpose.

Otherwise delete it after debugging.

---

# 19. Do Not Delete Blindly

Before deleting a file:

1. Search for imports/references.
2. Check package scripts.
3. Check Docker configuration.
4. Check CI workflows.
5. Check documentation references.
6. Check whether the file is generated or source-controlled intentionally.

Never delete source files merely because they look unused.

Never delete configuration files without checking how they are consumed.

---

# 20. Git Hygiene

Keep source code and intentional configuration in Git.

Do not commit:

```text
node_modules/
.next/
dist/
coverage/
logs/
.env
private keys
generated certificates
local caches
temporary debugging output
filesystem inspection dumps
```

Use `.gitignore` as a safety mechanism, but remember:

> `.gitignore` does not remove files that are already tracked.

If a generated file was previously committed, remove it from Git tracking explicitly.

---

# 21. Testing

For changes under `api/`, use the API's available verification commands.

Typical checks include:

```bash
cd api
npm run typecheck
npm run lint
npm test
npm run build
```

Run the narrowest relevant test first when debugging, then run the broader suite.

Do not claim tests pass unless they were actually executed successfully.

Do not use stale test-count claims in documentation or commit messages.

Integration tests may require PostgreSQL and Valkey.

---

# 22. API Changes

When changing API behavior:

1. Update implementation.
2. Update affected tests.
3. Update `api/openapi.yaml` if the public contract changes.
4. Update `docs/API.md`.
5. Verify the gateway end-to-end where practical.

Do not silently change public error codes, authentication behavior, or request/response schemas.

---

# 23. Security

Treat the following as security-sensitive:

- API keys
- Provider credentials
- Authentication tokens
- JWT verification
- Encryption keys
- API key hashing/peppering
- Trusted proxy configuration
- Client IP handling
- Budget enforcement
- Rate-limit enforcement

Never log secrets.

Never commit secrets.

Do not weaken authentication or governance controls to make a test pass.

---

# 24. Trusted Proxy / Client IP

Client IP information can be security-sensitive because it affects controls such as rate limiting.

Do not blindly trust:

```text
X-Forwarded-For
X-Real-IP
```

unless the request came through a configured trusted proxy.

Changes to trusted proxy behavior must include appropriate security tests.

---

# 25. CI/CD

CI/CD should verify the current repository structure.

Do not create workflows that assume the old multi-repository architecture.

Do not add infrastructure deployment steps for services that do not exist.

If a workflow references a service, directory, or generated artifact, verify that it exists in the current repository.

---

# 26. OpenCode / Agent Configuration

`.opencode/` contains development-agent configuration.

It is not part of the TokenSentry runtime.

Do not import `.opencode` code into the production API.

Do not confuse agent instructions with product architecture.

Keep agent-specific behavior under:

```text
.opencode/
```

and project-wide engineering rules under:

```text
AGENTS.md
```

---

# 27. V1 Feature Freeze

TokenSentry V1 is in stabilization mode.

Do not expand V1 with unrelated infrastructure.

Priority order:

```text
1. Correctness
2. Security
3. Tests
4. Deployment verification
5. Documentation accuracy
6. Bug fixes
7. Cleanup
```

Do not add major architectural features unless explicitly requested.

Examples of features that should remain outside the V1 freeze:

```text
Kafka
ClickHouse
Kubernetes
Dynamic model synchronization
Semantic cache
Prompt optimization
Vector database
Distributed workers
Complex telemetry pipelines
AI-based governance decisions
```

---

# 28. Change Discipline

Before implementing a requested change:

1. Understand the existing implementation.
2. Identify the smallest correct change.
3. Search for dependent code/tests/docs.
4. Implement the change.
5. Run relevant verification.
6. Update documentation if behavior changed.
7. Remove temporary artifacts.
8. Review the final diff.

Prefer:

```text
small correct change
```

over:

```text
large architectural rewrite
```

---

# 29. Final Verification

Before declaring work complete:

```text
[ ] Source compiles/typechecks
[ ] Relevant tests pass
[ ] No secrets were introduced
[ ] No generated artifacts were added
[ ] No temporary debugging files remain
[ ] API contracts remain synchronized
[ ] Documentation reflects actual implementation
[ ] No unnecessary dependency was introduced
[ ] No unnecessary infrastructure was introduced
[ ] Git diff contains only intentional changes
```

The final response should clearly distinguish:

```text
implemented
tested
not tested
known limitation
future work
```

Never claim production readiness based solely on code inspection.

---

# 30. Core Engineering Principle

TokenSentry V1 follows one primary rule:

> **Use the smallest architecture that correctly solves the AI governance problem.**

Correctness and clarity are more important than architectural complexity.

Do not optimize for theoretical scale before there is a demonstrated requirement for it.