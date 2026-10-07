# TokenSentry API

## Overview

TokenSentry exposes an HTTP API for AI clients and agents.

The primary V1 operation is the proxy endpoint:

```text
POST /v1/proxy
```

Clients send model requests to TokenSentry instead of directly communicating with an LLM provider.

```text
Client
   │
   │ HTTP request
   ▼
TokenSentry
   │
   ▼
LLM Provider
```

---

# Authentication

Protected endpoints require a valid TokenSentry API key.

The client should send the key using the configured authentication mechanism.

Example:

```bash
curl http://localhost:3000/v1/proxy \
  -H "Authorization: Bearer <TOKEN_SENTRY_API_KEY>" \
  -H "Content-Type: application/json"
```

Do not expose provider API keys to clients.

---

# Proxy Request

## Endpoint

```text
POST /v1/proxy
```

The proxy accepts an OpenAI-compatible model request and applies TokenSentry governance before forwarding it to the selected provider.

Example:

```bash
curl http://localhost:3000/v1/proxy \
  -H "Authorization: Bearer <TOKEN_SENTRY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "Explain distributed systems in simple terms."
      }
    ]
  }'
```

The exact supported request fields depend on the provider/model adapter.

---

# Request Processing

A proxy request goes through:

```text
Authentication
      ↓
Rate Limit
      ↓
Budget
      ↓
Model Policy
      ↓
Routing
      ↓
Agent Guard
      ↓
Provider
      ↓
Usage / Cost
```

A request that fails a governance check is rejected before provider execution.

---

# Call ID

Each proxied request receives a unique call identifier.

The response contains:

```text
x-call-id
```

Example:

```text
x-call-id: 8e7c2f3e-...
```

Use this identifier when correlating client activity with gateway logs and accounting information.

---

# Error Responses

TokenSentry normalizes important gateway and provider errors.

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

A typical error response follows the gateway's structured error format.

Clients should use the returned error code rather than depending on provider-specific error strings.

---

# Health Endpoints

TokenSentry provides health/readiness endpoints for operational checks.

These can be used by:

- NGINX
- Docker
- Deployment infrastructure
- Monitoring systems
- Operators

The exact endpoint paths should be verified against the current API route definitions before integrating them into external infrastructure.

---

# Streaming

Streaming requests are supported where the selected provider adapter supports streaming.

Example:

```bash
curl -N http://localhost:3000/v1/proxy \
  -H "Authorization: Bearer <TOKEN_SENTRY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Explain TCP."
      }
    ]
  }'
```

Because streaming responses begin before the complete provider operation finishes, provider failures occurring after streaming starts cannot change an HTTP status already sent to the client.

---

# Client Architecture

The intended integration is:

```text
Application / Agent
        │
        │ TokenSentry API
        ▼
   TokenSentry
        │
        ▼
    LLM Provider
```

The application should not need to implement separate gateway controls for every provider.

---

# API Design Principle

TokenSentry should expose stable gateway semantics while keeping provider-specific behavior behind the provider layer.

The client should therefore primarily reason about:

```text
Authentication
Rate limits
Budget
Model policy
Gateway errors
```

rather than individual provider implementation details.