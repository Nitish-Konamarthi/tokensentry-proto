# TokenSentry Dashboard

The dashboard is a Next.js administration interface for the TokenSentry V1 API. It uses Auth0 for user authentication and a server-side TokenSentry API key for gateway requests.

## Implemented pages

- Overview and budget state
- Spend analytics and cost breakdown
- Budget policy
- API key management
- Agent Guard sessions
- Provider credential configuration status
- Team member listing and removal
- Audit log
- Organization name settings

Team invitations, billing, organization deletion, and budget-counter reset are not implemented in V1.

## Local development

Requires Node.js 22+, an available TokenSentry API, and the Auth0 settings in .env.example.

~~~powershell
npm ci
npm run typecheck
npm run dev
~~~

The dashboard listens on port 3001 by default. TOKENSENTRY_API_URL and TOKENSENTRY_DASHBOARD_API_KEY are server-side settings. Do not expose the API key through a NEXT_PUBLIC_ variable.

The shared-types package is not currently imported by dashboard source; dashboard API shapes are defined in lib/types.ts.