# @tokensentry/dashboard

Next.js admin dashboard for TokenSentry.

## Quick Start

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm run dev
```

## Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript, strict mode
- **Styling**: Tailwind CSS 3 + shadcn/ui
- **Data Fetching**: TanStack Query
- **Charts**: Recharts
- **Auth**: Auth0 Next.js SDK
- **API Client**: Typed fetch wrapper

## Pages

| Route | Description | Status |
|-------|-------------|--------|
| /dashboard | Overview — KPI cards, budget, charts | Live API |
| /dashboard/analytics | Usage analytics | Live API |
| /dashboard/analytics/cost | Cost breakdown | Live API |
| /dashboard/budgets | Budget policy controls | Live API |
| /dashboard/api-keys | API key management | Live API |
| /dashboard/agent-guard | Agent session monitoring | Live API |
| /dashboard/providers | Provider health | Provider credentials are configured server-side |
| /dashboard/team | Team member management | Demo data |
| /dashboard/audit-log | Audit log viewer | Demo data |
| /dashboard/settings | Organization settings | Demo data |
| /dashboard/advisor | AI budget advisor | Demo data |

## Environment

```env
TOKENSENTRY_API_URL=https://api.tokensentry.ai
TOKENSENTRY_DASHBOARD_API_KEY=ts_live_your_key_here
DASHBOARD_ALLOWED_EMAILS=admin@example.com
```

## Build

```bash
npm run build    # Standalone output (Docker-ready)
```

## Directory

```
app/dashboard/          # 11 page routes
components/             # 17 UI + feature components
lib/                    # API client, hooks, types, utils
```
