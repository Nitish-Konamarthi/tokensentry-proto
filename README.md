# TokenSentry

**TokenSentry is a lightweight AI gateway and governance layer for applications and coding agents.**

It sits between an AI client/agent and LLM providers and enforces policies around:

- Authentication
- Rate limiting
- Budget control
- Model governance
- Provider routing
- Agent safety
- Usage and cost accounting
- Audit and analytics

TokenSentry is designed as a **simple, deterministic Layer-5 AI infrastructure component** rather than a full AI platform.

---

## Architecture

```text
┌──────────────────────────────┐
│       AI Client / Agent      │
│                              │
│  Coding Agent / Application  │
└──────────────┬───────────────┘
               │
               │ OpenAI-compatible request
               ▼
┌──────────────────────────────┐
│          TokenSentry         │
│                              │
│  ┌────────────────────────┐  │
│  │ Authentication         │  │
│  ├────────────────────────┤  │
│  │ Rate Limiting          │  │
│  ├────────────────────────┤  │
│  │ Budget Enforcement     │  │
│  ├────────────────────────┤  │
│  │ Model Policy / Router  │  │
│  ├────────────────────────┤  │
│  │ Agent Guard            │  │
│  ├────────────────────────┤  │
│  │ Provider Adapter       │  │
│  ├────────────────────────┤  │
│  │ Usage / Cost Tracking  │  │
│  └────────────────────────┘  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       LLM Providers          │
│                              │
│ OpenAI │ Anthropic │ Gemini  │
│ Groq   │ ...                 │
└──────────────────────────────┘
```

### Request flow

A normal request follows this pipeline:

```text
Client
  │
  ▼
Authentication
  │
  ▼
Rate Limit
  │
  ▼
Budget Check / Reservation
  │
  ▼
Model Policy
  │
  ▼
Model Router
  │
  ▼
Agent Guard
  │
  ▼
Provider
  │
  ▼
Usage & Cost Accounting
  │
  ▼
Analytics / Audit
  │
  ▼
Client
```

The goal is to make the enforcement decisions **before the request reaches the model provider** while keeping provider communication behind a common gateway interface.

---

# Why TokenSentry?

AI applications increasingly depend on multiple LLM providers and increasingly autonomous agents.

Without a governance layer, an application may have to independently implement:

- API authentication
- Request limits
- Spending limits
- Model restrictions
- Provider failover
- Agent behavior controls
- Usage tracking
- Cost calculation
- Audit information

This leads to duplicated infrastructure and inconsistent enforcement.

TokenSentry centralizes these controls into one gateway.

For example:

```text
Application
     │
     │ "Use this model"
     ▼
 TokenSentry
     │
     ├── Is the client authenticated?
     ├── Is the request within rate limits?
     ├── Is the organization within budget?
     ├── Is this model allowed?
     ├── Should another model be selected?
     ├── Is the agent behaving abnormally?
     │
     ▼
   Provider
```

---

# V1 Features

## Authentication

TokenSentry provides API-key based authentication for clients accessing the gateway.

Requests are authenticated before protected gateway functionality is executed.

Authentication failures are rejected without forwarding the request to an LLM provider.

---

## Rate Limiting

TokenSentry provides request-based rate limiting backed by Valkey.

The implementation uses atomic operations so concurrent requests cannot incorrectly bypass the configured limit.

Conceptually:

```text
Request
   │
   ▼
Rate Limit Key
   │
   ├── Within limit ──────► Continue
   │
   └── Limit exceeded ────► Reject
```

---

## Budget Enforcement

TokenSentry supports budget enforcement before provider execution.

The gateway follows a reservation/reconciliation model:

```text
Request
   │
   ▼
Estimate Cost
   │
   ▼
Reserve Budget
   │
   ├── Reservation fails ──► Reject request
   │
   ▼
Call Provider
   │
   ├── Provider succeeds
   │       │
   │       ▼
   │   Reconcile actual cost
   │
   └── Provider fails
           │
           ▼
      Release reservation
```

This prevents multiple concurrent requests from independently spending beyond the configured budget.

Budget state is stored using Valkey and atomic Lua operations.

---

## Model Governance

TokenSentry does not blindly forward every model identifier.

The gateway maintains a deterministic model metadata layer used for policy and routing decisions.

Model information includes concepts such as:

- Provider
- Model family
- Tier
- Capability score
- Coding capability
- Reasoning capability
- Vision capability
- Cost information

Unknown models are rejected rather than silently falling back to another model.

Example:

```text
Requested model
      │
      ▼
Is model known?
   │       │
  No      Yes
   │       │
   ▼       ▼
Reject   Apply policy
             │
             ▼
          Route
```

This prevents accidental use of unsupported or ungoverned models.

---

# Model Routing

TokenSentry can apply policy-based model routing.

Routing decisions can consider:

- Requested model
- Model tier
- Capability
- Provider availability
- Policy constraints
- Cost characteristics

The V1 router is intentionally **deterministic**.

It does not attempt to make autonomous AI decisions about which model should be used.

---

# Multi-Provider Support

TokenSentry provides a common provider abstraction.

Current provider integrations include:

- OpenAI
- Anthropic
- Google Gemini
- Groq

The gateway translates provider-specific failures into stable internal error categories.

Examples include:

```text
PROVIDER_AUTH
PROVIDER_RATE_LIMIT
PROVIDER_BAD_REQUEST
PROVIDER_UNAVAILABLE
PROVIDER_TIMEOUT
PROVIDER_NETWORK
PROVIDER_ERROR
```

This prevents every client from having to understand the error semantics of every provider.

---

# Agent Guard

TokenSentry includes an agent-safety layer for detecting abnormal request behavior.

The guard tracks state associated with agent execution and can evaluate signals such as:

- Request frequency
- Token growth
- Retry behavior
- Tool-call activity
- Provider switching
- Recursive behavior
- Budget utilization

Example:

```text
Agent
  │
  ├── Normal request
  ├── Tool call
  ├── Tool call
  ├── Retry
  ├── Retry
  ├── Retry
  └── Abnormal growth
          │
          ▼
     Agent Guard
          │
          ▼
       Block
```

The purpose is not to replace an agent's own safety mechanisms.

Instead, TokenSentry provides an infrastructure-level enforcement boundary outside the agent.

---

# Usage & Cost Accounting

TokenSentry records provider usage and calculates associated costs where provider usage information is available.

This provides a common accounting layer across providers with different APIs and pricing structures.

The gateway associates usage with the request/call identifier so that activity can be correlated across the request lifecycle.

---

# Request Correlation

Every proxied request receives a unique call identifier.

Example:

```text
Client
  │
  │ Request
  ▼
TokenSentry
  │
  │ callId = UUID
  ├──────────────► Provider
  │
  ├──────────────► Usage
  │
  ├──────────────► Analytics
  │
  └──────────────► Audit
```

The identifier is also returned to clients through:

```text
x-call-id
```

This makes debugging and request tracing easier without requiring a distributed tracing platform.

---

# Error Handling

TokenSentry converts internal failures into stable HTTP/API responses.

For example:

```text
Provider unavailable
        │
        ▼
ProviderUnavailableError
        │
        ▼
HTTP 502
        │
        ▼
PROVIDER_UNAVAILABLE
```

The goal is to prevent internal implementation details from leaking to clients while still providing actionable error information.

---

# Technology Stack

TokenSentry V1 intentionally uses a small infrastructure footprint.

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP Framework | Fastify |
| Database | PostgreSQL |
| State / Atomic Controls | Valkey |
| Reverse Proxy | NGINX |
| Containerization | Docker / Docker Compose |
| Testing | Vitest |
| API Style | OpenAI-compatible gateway |

The architecture intentionally avoids unnecessary distributed infrastructure for V1.

There is no requirement for:

- Kafka
- ClickHouse
- Kubernetes
- Dedicated telemetry collectors
- Vector databases
- Multiple microservices
- Complex event buses

The goal is to keep the gateway understandable, deployable, and maintainable.

---

# Project Structure

The repository is organized around the gateway and its supporting components.

```text
tokensentry-proto/
│
├── api/
│   ├── src/
│   │   ├── auth/
│   │   ├── budget/
│   │   ├── providers/
│   │   ├── routing/
│   │   ├── agent-guard/
│   │   ├── analytics/
│   │   ├── middleware/
│   │   └── ...
│   │
│   └── tests/
│
├── dashboard/
│
├── website/
│
├── docs/
│
├── docker-compose.yml
├── package.json
└── README.md
```

The exact implementation structure may evolve as the project develops.

---

# Running TokenSentry Locally

## Prerequisites

Install:

- Node.js
- npm
- Docker
- Docker Compose
- Git

Clone the repository:

```bash
git clone https://github.com/Nitish-Konamarthi/tokensentry-proto.git
cd tokensentry-proto
```

Install dependencies for the API:

```bash
cd api
npm install
```

---

## Environment Configuration

Create the required environment configuration from the project's example environment file.

```bash
cp .env.example .env
```

Configure the required values for:

- Database
- Valkey
- TokenSentry authentication
- Provider credentials
- Gateway configuration

**Do not commit real API keys or secrets to Git.**

Provider credentials should remain in the deployment environment rather than being exposed to clients.

---

# Start Infrastructure

The project can use Docker Compose for local infrastructure.

From the repository root:

```bash
docker compose up -d
```

This provides the supporting infrastructure required by the gateway.

Verify the running containers:

```bash
docker compose ps
```

---

# Start the API

From the API directory:

```bash
npm run dev
```

The development server should start using the configured host and port.

---

# Basic Request Flow

TokenSentry exposes a proxy endpoint for model requests.

Example:

```http
POST /v1/proxy
```

A typical request contains the target model and the provider-compatible request payload.

Conceptually:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "Explain distributed systems."
    }
  ]
}
```

The client communicates with TokenSentry rather than directly communicating with the model provider.

```text
Client
  │
  │ POST /v1/proxy
  ▼
TokenSentry
  │
  │ policy enforcement
  ▼
LLM Provider
```

---

# Health Checks

TokenSentry exposes health/readiness functionality for deployment and operational checks.

These endpoints can be used by local development environments, reverse proxies, or deployment infrastructure to determine whether the service is available.

---

# Testing

Run the API test suite with:

```bash
npm test
```

The test suite covers important V1 behavior including areas such as:

- Authentication
- Rate limiting
- Budget enforcement
- Model validation
- Provider failures
- Routing
- Agent Guard
- Accounting
- Proxy behavior
- Security-related behavior

Tests should be treated as behavioral verification of the implemented V1 gateway rather than as a guarantee of production readiness.

---

# Security Model

TokenSentry is intended to be deployed as a trusted gateway between clients and model providers.

Important principles include:

### 1. Clients do not need direct provider access

Instead of:

```text
Client ─────────► OpenAI
Client ─────────► Anthropic
Client ─────────► Gemini
```

the intended architecture is:

```text
Client
   │
   ▼
TokenSentry
   │
   ├────► OpenAI
   ├────► Anthropic
   ├────► Gemini
   └────► Groq
```

This allows centralized enforcement.

### 2. Provider credentials remain server-side

Provider credentials must never be exposed to browser clients or other untrusted consumers.

### 3. Rate and budget controls are enforced server-side

Clients cannot be trusted to enforce their own spending or request limits.

### 4. Proxy headers must be configured correctly

If TokenSentry is deployed behind a reverse proxy or load balancer, trusted proxy configuration must be restricted to infrastructure that is actually trusted.

Incorrect proxy configuration can allow client-controlled forwarding headers to influence IP-based controls.

---

# Deployment Architecture

A simple deployment can look like:

```text
                  Internet
                     │
                     ▼
                  NGINX
                     │
                     ▼
              TokenSentry API
                │          │
                │          │
                ▼          ▼
           PostgreSQL    Valkey
                │
                │
                ▼
          LLM Providers
```

For a small deployment, these components can run on a single VM/server.

The architecture can later be distributed if actual traffic and reliability requirements justify it.

---

# Streaming

TokenSentry supports streaming and non-streaming provider responses.

For streaming requests, the response begins before the entire provider operation has completed.

Therefore, once the HTTP stream has started, the client may already have received a successful HTTP status even if the provider subsequently fails during streaming.

This is a normal property of HTTP streaming and should be considered when designing client-side error handling.

---

# Design Principles

TokenSentry V1 follows several principles.

## Keep the gateway deterministic

The gateway should make predictable policy decisions.

```text
Input
  +
Policy
  =
Deterministic Decision
```

V1 does not require an AI model to decide whether another AI model should be allowed to run.

---

## Keep infrastructure small

Every infrastructure component introduces:

- Operational complexity
- Failure modes
- Maintenance cost
- Deployment requirements

Therefore V1 intentionally uses a small stack.

---

## Enforce policies before provider execution

The gateway should reject requests before spending provider resources whenever possible.

```text
Authenticate
     ↓
Rate Limit
     ↓
Budget
     ↓
Model Policy
     ↓
Agent Guard
     ↓
Provider
```

---

## Separate provider-specific behavior

The rest of the gateway should not need to understand the implementation details of every LLM provider.

Provider adapters isolate provider-specific APIs and errors.

---

## Fail safely

Examples:

```text
Unknown model
     ↓
Reject

Budget unavailable
     ↓
Fail closed

Provider unavailable
     ↓
Stable provider error

Rate limit exceeded
     ↓
Reject
```

The gateway should prefer controlled failure over silently bypassing governance.

---

# What TokenSentry Is Not

TokenSentry V1 is **not** intended to be:

- An LLM itself
- An AI agent framework
- A model-training platform
- A vector database
- A prompt-management platform
- A full observability platform
- A Kubernetes-based AI platform
- A replacement for model providers

It is an **AI gateway and governance layer**.

---

# V1 Scope

The V1 objective is:

> Provide a lightweight gateway that can sit between an AI client/agent and model providers and enforce authentication, traffic, spending, model, provider, and agent-level policies.

The core V1 path is:

```text
Authenticate
    ↓
Rate Limit
    ↓
Budget
    ↓
Model Governance
    ↓
Routing
    ↓
Agent Guard
    ↓
Provider
    ↓
Accounting
    ↓
Audit
```

This is the primary product boundary.

---

# Current Limitations

TokenSentry V1 intentionally has limitations.

### Single-gateway simplicity

The initial architecture is designed for a relatively small deployment rather than a globally distributed gateway.

### Deterministic routing

Routing is policy-based rather than AI-driven.

### Provider-dependent usage data

Cost accounting depends on usage information returned by the provider.

### Streaming failure semantics

Failures occurring after a stream has started cannot change an HTTP status that has already been sent.

### Limited distributed infrastructure

V1 does not attempt to solve large-scale distributed coordination, global rate limiting, or multi-region deployment.

These limitations are intentional rather than hidden assumptions.

---

# Future Work

Potential future work may include:

- More provider integrations
- More sophisticated routing policies
- Improved analytics
- More comprehensive integration testing
- Multi-region deployment
- Distributed gateway deployment
- Advanced agent behavior policies
- Dynamic provider/model metadata synchronization
- More sophisticated observability

These are **future capabilities and are not part of the V1 implementation**.

---

# Project Status

**TokenSentry V1: Functionally complete**

The current implementation covers the primary V1 gateway path:

```text
Client
  ↓
Authentication
  ↓
Rate Limiting
  ↓
Budget Enforcement
  ↓
Model Governance
  ↓
Routing
  ↓
Agent Guard
  ↓
Provider Integration
  ↓
Usage / Cost Accounting
  ↓
Analytics / Audit
```

Remaining work should focus primarily on:

- Verification
- Test strengthening
- Documentation consistency
- Deployment validation
- Security hardening

rather than expanding the V1 feature set.

---

# Development Philosophy

TokenSentry is intentionally built around a simple idea:

> **AI applications need an infrastructure boundary between the application/agent and the model provider.**

Instead of allowing every application to independently implement:

```text
Authentication
Rate Limits
Budgets
Model Policies
Provider Handling
Agent Controls
Cost Tracking
```

TokenSentry centralizes those concerns:

```text
                 AI Applications
                       │
                       ▼
              ┌─────────────────┐
              │   TokenSentry   │
              │                 │
              │ Auth            │
              │ Rate Limits     │
              │ Budget          │
              │ Model Policy    │
              │ Routing         │
              │ Agent Guard     │
              │ Accounting      │
              └────────┬────────┘
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          OpenAI   Anthropic   Gemini
```

The project deliberately prioritizes **clear boundaries, deterministic behavior, and operational simplicity** over adding infrastructure for its own sake.

---

# License

See the repository license for the applicable terms.

---

## Repository

**GitHub:**  
https://github.com/Nitish-Konamarthi/tokensentry-proto

---

## Summary

TokenSentry is a lightweight **Layer-5 AI gateway and governance system**.

It provides a controlled boundary between AI clients/agents and LLM providers, allowing organizations to enforce:

```text
Authentication
      +
Rate Limiting
      +
Budget Control
      +
Model Governance
      +
Provider Routing
      +
Agent Safety
      +
Usage / Cost Accounting
      +
Auditability
```

The V1 architecture intentionally remains small:

```text
Fastify
   +
PostgreSQL
   +
Valkey
   +
NGINX
   +
LLM Providers
```

The objective is not to build another AI platform.

The objective is to build a **reliable policy enforcement layer for AI traffic**.