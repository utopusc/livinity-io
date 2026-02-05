---
phase: 05-configurability
plan: 01
subsystem: config
tags: [typescript, zod, environment-variables, csp, domains]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "@livos/config package with paths and domains schemas"
provides:
  - paths.output config value for generated files directory
  - domains.marketplace config value for app store URL
  - domains.api config value for API subdomain prefix
  - Config-driven API URL in update.ts
  - Config-driven CSP frameSrc in server/index.ts
affects: [06-ai-migration, 07-installer, 08-documentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Environment variable binding pattern for config values"
    - "Config-driven URL construction: ${domains.api}.${domains.primary}"

key-files:
  created: []
  modified:
    - "livos/packages/config/src/paths.ts"
    - "livos/packages/config/src/domains.ts"
    - "livos/packages/config/src/index.ts"
    - "livos/packages/livinityd/source/modules/system/update.ts"
    - "livos/packages/livinityd/source/modules/server/index.ts"
    - "livos/packages/livinityd/package.json"

key-decisions:
  - "API URL construction uses domains.api + domains.primary pattern"
  - "CSP frameSrc uses domains.marketplace and wildcard for domains.primary"

patterns-established:
  - "Config-driven domain URLs: protocol + api subdomain + primary domain"
  - "Environment variable bindings: LIVOS_OUTPUT_DIR, LIVOS_MARKETPLACE_DOMAIN, LIVOS_API_SUBDOMAIN"

# Metrics
duration: 8min
completed: 2026-02-04
---

# Phase 5 Plan 01: Extend Config with Output Path and Marketplace/API Domains

**Extended @livos/config with paths.output and domains.marketplace/api, replaced hardcoded livinity.cloud/livinity.io in backend modules**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-04T10:00:00Z
- **Completed:** 2026-02-04T10:08:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added paths.output config value with default '/opt/livos/output' for generated files
- Added domains.marketplace config value with default 'apps.livinity.io' for app store
- Added domains.api config value with default 'api' for API subdomain prefix
- Replaced hardcoded 'https://api.livinity.cloud' in update.ts with config-driven URL
- Replaced hardcoded 'apps.livinity.io' and '*.livinity.io' in CSP frameSrc with config values

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend @livos/config with output path and marketplace/API domains** - `91abe7d` (feat)
2. **Task 2: Replace hardcoded domains in backend modules** - `eba15d5` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `livos/packages/config/src/paths.ts` - Added output path schema with default '/opt/livos/output'
- `livos/packages/config/src/domains.ts` - Added marketplace and api domain schemas
- `livos/packages/config/src/index.ts` - Added environment variable bindings for new config values
- `livos/packages/livinityd/source/modules/system/update.ts` - Config-driven API URL construction
- `livos/packages/livinityd/source/modules/server/index.ts` - Config-driven CSP frameSrc
- `livos/packages/livinityd/package.json` - Added @livos/config workspace dependency

## Decisions Made
- API URL construction pattern: `${domains.api}.${domains.primary}` allows flexible API subdomain configuration
- Protocol selection uses domains.useHttps boolean for http/https prefix
- CSP frameSrc uses both marketplace domain and wildcard for primary domain (*.primary)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in livinityd package (unrelated to changes) - verified changes don't introduce new errors
- pnpm install failed at UI postinstall on Windows (copy command syntax) - doesn't affect core functionality

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config package fully extended with output path and domain values
- Backend modules now use config-driven domains
- Ready for further domain hardcoding removal in other modules
- Environment variables documented: LIVOS_OUTPUT_DIR, LIVOS_MARKETPLACE_DOMAIN, LIVOS_API_SUBDOMAIN

---
*Phase: 05-configurability*
*Completed: 2026-02-04*
