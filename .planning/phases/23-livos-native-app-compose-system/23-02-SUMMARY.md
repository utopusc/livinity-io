---
phase: 23-livos-native-app-compose-system
plan: 02
subsystem: infra
tags: [docker, compose, install-flow, platform-api, fallback]

# Dependency graph
requires:
  - phase: 23-01
    provides: "generateAppTemplate() and builtin compose definitions for all 11 apps"
provides:
  - "Template resolution chain in install(): builtin compose -> platform API -> community repos"
  - "fetchPlatformTemplate() for non-builtin apps via apps.livinity.io API"
  - "installForUser() uses same resolution chain for per-user Docker containers"
  - "Temp directory cleanup after rsync for generated templates"
  - "reinstallMissingAppsAfterRestore allows builtin apps to install even without git repos"
affects: [app-install-flow, backup-restore, multi-user-installs]

# Tech tracking
tech-stack:
  added: []
  patterns: [template-resolution-chain, platform-api-fallback, generated-template-cleanup]

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/apps/apps.ts

key-decisions:
  - "3-step resolution chain: builtin compose -> platform API -> community repos -> error"
  - "fetchPlatformTemplate writes docker-compose.yml + livinity-app.yml to temp dir from API response"
  - "reinstallMissingAppsAfterRestore no longer returns early on repo update failure -- builtin apps install without repos"
  - "isGeneratedTemplate flag tracks temp dirs for cleanup after rsync"

patterns-established:
  - "Resolution chain: try local generation first, remote API second, legacy git repos last"
  - "Platform API integration: apps.livinity.io/api/apps/{appId} with X-Api-Key header"

requirements-completed: [R-COMPOSE-GEN, R-COMPOSE-FALLBACK]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 23 Plan 02: Install Flow Integration Summary

**3-step template resolution chain in install() and installForUser(): builtin compose generation first, platform API fallback second, community git repos last -- eliminating git repo dependency for all 11 builtin apps**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T08:04:36Z
- **Completed:** 2026-03-21T08:07:11Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Wired generateAppTemplate() into both install() and installForUser() as first resolution step, making builtin apps install without any git repos on the server
- Added fetchPlatformTemplate() private method that fetches docker_compose from apps.livinity.io API and writes compose + manifest YAML to temp directory for non-builtin apps added via web admin
- Modified reinstallMissingAppsAfterRestore to continue to install loop even when app store repo update fails (builtin apps don't need repos)
- Generated temp directories are cleaned up after rsync in both install paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Add template resolution chain to install() with builtin-first and platform DB fallback** - `8018328` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/apps.ts` - Modified install(), installForUser(), reinstallMissingAppsAfterRestore(); added fetchPlatformTemplate() and compose-generator import

## Decisions Made
- 3-step resolution chain order: builtin compose (local, no network) -> platform API (remote, for web-admin apps) -> community repos (legacy git) -> clear error
- fetchPlatformTemplate builds manifest from API response fields with sensible defaults (category: 'other', port: 8080, version: '1.0.0')
- isGeneratedTemplate boolean flag to track temp directories for cleanup rather than path-based detection
- reinstallMissingAppsAfterRestore logs descriptive message ("builtin apps will still install from generated templates") when repo update fails

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 23 complete: all builtin apps can now install purely from in-code compose definitions
- Platform API fallback is ready for when apps are added via the web admin at livinity.io
- Legacy git repo path remains as final fallback for community app repositories
- appScript compatibility preserved: SCRIPT_APP_REPO_DIR="" is already handled by try-catch in app-script.ts

## Self-Check: PASSED

- [x] apps.ts exists with template resolution chain
- [x] Commit 8018328 found (Task 1)
- [x] 23-02-SUMMARY.md exists

---
*Phase: 23-livos-native-app-compose-system*
*Completed: 2026-03-21*
