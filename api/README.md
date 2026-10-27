# TokenSentry API

The API is the V1 Fastify gateway. It authenticates TokenSentry API keys, applies rate limits and organization budgets, checks model policy, routes to configured providers, runs Agent Guard checks, and records usage and audit data.

## Local development

Requires Node.js 22+, PostgreSQL, Valkey, and the environment values in .env.example.

~~~powershell
npm ci
npm run db:migrate
npm run dev
~~~

Useful checks:

~~~powershell
npm run typecheck
npm test
npm run build
~~~

The API listens on port 3000 by default. Health endpoints are GET /health/live and GET /health/ready. The main proxy endpoint is POST /v1/proxy.

Provider credentials are configured on the API server. Clients authenticate with a TokenSentry API key. See the API contract in ../docs/API.md and deployment guide in ../docs/DEPLOYMENT.md.