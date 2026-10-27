# TokenSentry Shared Types

This package contains TypeScript and TypeBox definitions for TokenSentry API data. It currently has no imports from the API or dashboard source, so it is not an enforced shared contract between those applications.

The package is retained as a repository component. Its definitions must match implemented V1 request and response shapes. The API public contract is documented in api/openapi.yaml; the dashboard currently defines its fetch types in dashboard/lib/types.ts.

## Build

~~~powershell
npm ci
npm run typecheck
npm run build
~~~