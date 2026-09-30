# Changelog

All notable changes to TokenSentry are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

TokenSentry uses the following versioning strategy:

| Package | Location | Version | Published |
|---|---|---|---|
| `@tokensentry/api` | `api/` | Independent | Docker image tag |
| `@tokensentry/dashboard` | `dashboard/` | Independent | Docker image tag |
| `@tokensentry/website` | `website/` | Independent | Docker image tag |
| `@tokensentry/shared-types` | `shared-types/` | Tracks API major | npm |
| Infrastructure | `infrastructure/` | Tracks deployment | git tag |

Each component is versioned independently. The root CHANGELOG tracks
cross-cutting changes. Component-specific changes are documented
in each package's own CHANGELOG.md or inferred from git history.

## [Unreleased]

### Added
- API endpoint for AI budget advisor queries
- Dashboard advisor page with natural-language budget Q&A
- Real-time spend tracking via Valkey counters
- Auth0 integration for dashboard authentication
- Docker Compose deployment with healthchecks

### Changed
- Database schema migrated from Prisma to Drizzle ORM
- API rate limiting uses Valkey-backed sliding window
- Dashboard UI rebuilt with Tailwind CSS v3 + shadcn/ui
- Audit log filtering now supports action prefix matching

### Fixed
- Budget route now persists alert thresholds and exhaustion behavior
- Middleware handles root path `/` and API proxy rewrites
- Nginx SSL stapling enabled across all server blocks
- Docker Compose healthchecks added for all services
- CI pipeline type-checks and tests every push
