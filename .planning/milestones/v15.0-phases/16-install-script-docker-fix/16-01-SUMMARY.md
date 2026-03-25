---
phase: 16-install-script-docker-fix
plan: 01
subsystem: infra
tags: [bash, docker, install-script, tor, auth-server]

# Dependency graph
requires: []
provides:
  - "Hardened install.sh with fail-fast Docker image pulls"
  - "setup_docker_prerequisites function creating tor/data (1000:1000) and app-data directories"
  - "Resilient Kimi CLI handling that cannot abort the install"
  - "Documented install flow dependency chain"
affects: [install, deployment, docker]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fail-fast on required Docker image pulls", "subshell isolation for optional install steps"]

key-files:
  created: []
  modified:
    - livos/install.sh

key-decisions:
  - "Use fail() not warn() for Docker pull failures -- compose up will fail anyway, better to fail fast with clear message"
  - "Subshell + || warn pattern for Kimi CLI -- isolates entire block so any error is caught without set -e abort"
  - "chown -R 1000:1000 on tor dir -- matches container user:group in docker-compose.yml"

patterns-established:
  - "Fail-fast pattern: required dependencies use fail(), optional ones use subshell + || warn"
  - "Dependency chain documentation: comment block at top of main flow listing prerequisites in order"

requirements-completed: [INST-01, INST-02, INST-03, INST-04, INST-05]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 16 Plan 01: Install Script Docker Fix Summary

**Hardened install.sh with fail-fast Docker image pulls, tor/data + app-data directory creation, and subshell-isolated Kimi CLI handling**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T03:17:51Z
- **Completed:** 2026-03-21T03:19:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Docker image pulls now fail the install immediately with a clear error message instead of silently continuing
- New setup_docker_prerequisites() function creates /opt/livos/data/tor/data with 1000:1000 ownership and /opt/livos/data/app-data directory before services start
- Kimi CLI section wrapped in subshell with || warn so failures cannot abort the entire install
- Install flow dependency chain documented with comment block for future maintainers

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden setup_docker_images and add setup_docker_prerequisites** - `acbd482` (fix)
2. **Task 2: Validate end-to-end install flow logic** - `2b2f5df` (docs)

## Files Created/Modified
- `livos/install.sh` - Hardened Docker image pulls (fail not warn), new setup_docker_prerequisites() function, subshell-wrapped Kimi CLI section, dependency chain documentation

## Decisions Made
- Used `fail()` instead of `warn()` for Docker pull failures -- without images, compose up will fail anyway; better to fail fast with a clear error message than to continue and fail mysteriously later
- Wrapped Kimi CLI section in a subshell with `|| warn` rather than just adding `|| true` to individual commands -- the subshell pattern isolates the entire block so even unexpected errors (e.g., set -e triggering on a missed command) are caught
- Used `chown -R 1000:1000` on the entire tor directory rather than just tor/data -- ensures the container has consistent ownership on all tor-related paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - no stubs or placeholder data exist in the modified files.

## Next Phase Readiness
- install.sh is now ready for single-command deployment on fresh Ubuntu servers
- Manual verification on actual server recommended: run the install script and confirm `docker ps` shows auth and tor_proxy containers
- All five docker compose prerequisites are met before services start: images tagged, tor/data dir created with correct ownership, app-data dir created, torrc files in repo, env vars provided by app-environment.ts at runtime

## Self-Check: PASSED

- livos/install.sh: FOUND
- 16-01-SUMMARY.md: FOUND
- Commit acbd482: FOUND
- Commit 2b2f5df: FOUND

---
*Phase: 16-install-script-docker-fix*
*Completed: 2026-03-21*
