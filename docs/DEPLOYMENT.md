# TokenSentry V1 Deployment

This guide describes the checked-in deployment configuration and its limits. It does not claim production readiness.

## Runtime requirements

The API requires:

- Node.js 22 or the API Docker image
- PostgreSQL
- Valkey or a compatible Redis service that supports the commands and Lua scripts used by the API
- At least one configured provider credential to execute model requests
- API_KEY_PEPPER of at least 32 characters
- Auth0 settings for the dashboard

The dashboard also requires Auth0 configuration and a server-side TokenSentry API key. The website has no runtime secrets.

## Local API development

Copy infrastructure/.env.example to infrastructure/.env and api/.env.example to api/.env. Set the required values. The development Compose file is an override for the main Compose file, so use both files to start only PostgreSQL and Valkey:

~~~powershell
docker compose --env-file infrastructure/.env -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml up -d postgres valkey
~~~

From api/, install dependencies, apply the database migrations, and start the API:

~~~powershell
npm ci
npm run db:migrate
npm run dev
~~~

The development compose file starts only PostgreSQL and Valkey. It does not start the API or web applications.

## Docker Compose deployment template

The full stack definition is infrastructure/docker-compose.yml. Run Compose from the infrastructure/ directory so its relative paths and .env file resolve correctly:

~~~powershell
cd infrastructure
Copy-Item .env.example .env
docker compose config
docker compose up --build -d
~~~

The template targets a single Linux host with DNS names api.tokensentry.ai, app.tokensentry.ai, and tokensentry.ai. It expects initial TLS certificates for those names, valid Auth0 settings, provider credentials, and database secrets. The start script checks for certificates before it starts the stack and generates the NGINX Diffie-Hellman parameter file if needed. The certbot container attempts renewal of existing certificates; after a renewal, reload NGINX so it serves the renewed certificate. The template does not obtain the initial certificates.

The PostgreSQL backup container writes daily dumps to a separate local Docker volume and retains seven days. This is local host storage, not an off-host backup. Copy backups to a separate storage location before relying on them for recovery.

The API image is built from api/Dockerfile. The dashboard and website use standalone Next.js Docker output. PostgreSQL and Valkey are internal services in the Compose network.

## Health checks

- GET /health/live reports process liveness.
- GET /health/ready checks PostgreSQL and Valkey and returns 503 if either is unavailable.

## Vercel, Neon, and Upstash prototype setup

For the Vercel API project, set `DATABASE_URL` to Neon's pooled connection string and `VALKEY_URL` to Upstash's TLS Redis connection string. Set `API_KEY_PEPPER` to a private value of at least 32 characters and configure an OpenRouter key if you want to send model requests.

Run schema migrations from a trusted local terminal using Neon's direct (unpooled) connection string:

~~~powershell
cd api
$env:DATABASE_URL = Read-Host "Paste Neon direct connection string"
npm run db:migrate
Remove-Item Env:DATABASE_URL
~~~

After migrations, bootstrap the first organization and owner API key with the same `API_KEY_PEPPER` configured in Vercel:

~~~powershell
$env:DATABASE_URL = Read-Host "Paste Neon direct connection string"
$securePepper = Read-Host "Paste the API_KEY_PEPPER configured in Vercel" -AsSecureString
$env:API_KEY_PEPPER = [System.Net.NetworkCredential]::new("", $securePepper).Password
npm run db:bootstrap
Remove-Item Env:DATABASE_URL
Remove-Item Env:API_KEY_PEPPER
~~~

The bootstrap command refuses to run if the database already contains an organization. It creates a $10 default monthly budget and limits the initial model policy to the explicitly listed free OpenRouter Nemotron model. Copy the generated owner key into a password manager and use it for the dashboard's server-side API key setting. Do not run the development `db:seed` script against the prototype database.

## Free-tier use

A free-tier deployment is suitable only for a prototype or low-traffic demonstration. The API needs a long-lived Node.js process, PostgreSQL, and Redis/Valkey-compatible commands including Lua scripting. Free hosting plans may sleep, restart, cap compute, or lose transient Valkey state. This can cause cold starts and governance requests to fail closed. Do not use a free-tier setup as a production service or for durable budget enforcement.

The website build currently emits static pages but uses Next.js standalone output; use a Node.js service unless you deliberately configure and verify static export. The dashboard requires a Node.js runtime because it uses server-side Auth0 and API proxy routes.

## Production requirements

Before serving real users, use paid/appropriate hosting with persistent PostgreSQL, reliable Redis-compatible state, TLS, secrets management, backups, monitoring, and tested recovery procedures. Verify the complete deployment by exercising authentication, budget reservation/reconciliation, provider execution, streaming, and failure paths.
