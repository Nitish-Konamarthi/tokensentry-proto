# @tokensentry/shared-types

Shared TypeScript types for TokenSentry API and Dashboard.

## Contents

- **api.ts** — TypeBox request/response schemas (Proxy, Budget, API Key, Advisor, Agent Guard, Onboarding)
- **models.ts** — Domain model interfaces (PlanTier, OrgRole, MonthlyUsage, DailySpend, etc.)
- **validation.ts** — Runtime validation helpers (UUID, API key format, integer, URL)

## Usage

```typescript
import { ProxyRequestSchema } from '@tokensentry/shared-types'
import type { PlanTier } from '@tokensentry/shared-types'
```

## Build

```bash
npm ci
npm run build    # Compiles to dist/
```
