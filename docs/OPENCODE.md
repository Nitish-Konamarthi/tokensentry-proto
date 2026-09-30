# TokenSentry — OpenAI-Compatible Gateway for Coding Agents
Drop-in proxy. No custom SDK required.

## Endpoint
POST https://api.tokensentry.ai/v1/proxy
Compatible with OpenAI SDK, Anthropic SDK (with base URL override), and any agent that sends POST with messages, model, stream, temperature, max_tokens.

## Authentication
Authorization: Bearer ts_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
Generate keys from dashboard (/dashboard/api-keys).

## Minimal OpenCode / Agent Config
OPENAI_API_BASE=https://api.tokensentry.ai/v1/proxy
ANTHROPIC_API_KEY=ts_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

## Streaming
stream: true returns text/event-stream. Errors handled gracefully (no leaks).
