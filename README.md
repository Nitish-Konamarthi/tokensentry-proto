# TokenSentry

TokenSentry V1 is a self-hosted AI gateway that applies request authentication, rate limits, organization budgets, model policy, provider routing, Agent Guard checks, usage accounting, and audit logging before returning model responses.

The gateway is implemented as one Fastify/TypeScript API backed by PostgreSQL and Valkey. The Next.js dashboard manages and displays the gateway data. The website is a project overview.

## Request flow

~~~text
Client -> TokenSentry API -> authentication and rate limit
       -> budget and model policy -> provider routing and Agent Guard
       -> provider -> usage accounting and audit
~~~

The gateway exposes POST /v1/proxy. Requests use the supported subset of the OpenAI chat-completions shape. The model catalog is version-controlled; unknown or unpriced models are rejected. Provider keys stay on the API server.

## Repository

- api/ - Fastify gateway, PostgreSQL and Valkey clients, provider adapters, migrations, and API tests
- dashboard/ - Next.js administration dashboard
- website/ - Next.js project overview site
- shared-types/ - TypeScript schema/type package; currently not imported by API or dashboard source
- infrastructure/ - Docker Compose, NGINX, and operational scripts
- docs/ - Architecture, API, deployment, and decision records

## Local development

Use Node.js 22 or newer and npm. The development Compose file only adds local ports to the main service definitions. Copy the infrastructure environment template and start the database services with both Compose files, then configure the API and dashboard from their own .env.example files.

~~~powershell
Copy-Item infrastructure/.env.example infrastructure/.env
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml up -d postgres valkey
cd api
npm ci
npm run db:migrate
npm run dev
~~~

Run API typecheck and tests from api/:

~~~powershell
npm run typecheck
npm test
~~~

The dashboard and website have separate package manifests and can be run with their own npm ci and npm run dev commands.

## Documentation

- Architecture: docs/architecture.md
- API: docs/API.md
- Deployment: docs/DEPLOYMENT.md
- Architecture decisions: docs/DECISIONS.md

V1 behavior and readiness are described by the implementation and verification results; this README does not claim production readiness.
