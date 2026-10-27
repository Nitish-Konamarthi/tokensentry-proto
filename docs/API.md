# TokenSentry API

The API accepts TokenSentry API keys in the Authorization bearer header. Provider credentials are configured on the API server.

## Proxy

POST /v1/proxy

The request body supports model, messages, optional system text, stream, max_tokens, and temperature. Each message has role user, assistant, or system and string content. This is a supported subset of the OpenAI chat-completions request shape; provider SDKs are not guaranteed to work unchanged.

~~~json
{
  "model": "anthropic/claude-haiku-4-5",
  "messages": [
    { "role": "user", "content": "Explain distributed systems." }
  ],
  "max_tokens": 256
}
~~~

The checked-in model catalog is authoritative. Unknown models and models without known prices are rejected. Organization model policy and budget checks are applied before provider execution. Successful non-streaming responses use an OpenAI-style choices and usage envelope. The x-call-id response header is present for proxy responses; successful non-streaming responses also include _ts.call_id.

A provider may be selected or changed by the configured deterministic routing policy. The response model field reports the selected model. Actual provider usage is used when available; otherwise accounting uses the gateway's estimate. The _ts.saved_usd value is a catalog-based estimate comparing requested and selected models, not a provider-billed savings amount.

## Governance and failures

Requests pass through authentication, rate limiting, budget reservation, model policy and routing, Agent Guard, provider execution, and accounting. Budget enforcement fails closed if Valkey is unavailable. Provider failures release applicable reservations.

Streaming is supported by the provider adapters. After response headers are sent, a later provider failure cannot change the HTTP status.

## Health

- GET /health/live reports that the process is running.
- GET /health/ready checks PostgreSQL and Valkey and returns 503 when either required dependency is unavailable.

## Other implemented API areas

The API also exposes budget policy, API key, analytics, Agent Guard, audit log, provider credential status, organization settings, and member listing/removal routes. Route implementations are under api/src/routes. The OpenAPI file documents the core health, proxy, budget, API-key, and analytics routes; it is not yet a complete specification of all registered administration routes.

POST /v1/invitations is present but returns 501 because V1 has no identity-provider invitation integration.

See api/openapi.yaml for the documented core route contracts.
