---
phase: 05-configurability
plan: 03
subsystem: infra
tags: [nexus, environment-variables, path-configuration, cross-platform]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "NEXUS_ environment variable prefix convention"
provides:
  - "NEXUS_LOGS_DIR configuration in logger and daemon"
  - "NEXUS_BASE_DIR configuration in shell and index"
  - "NEXUS_SKILLS_DIR configuration in index"
  - "NEXUS_OUTPUT_DIR configuration in all skill files"
affects: [deployment, testing, multi-environment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NEXUS_ prefixed environment variables for Nexus-specific paths"
    - "path.join() for cross-platform path construction"
    - "Fallback defaults using || operator"

key-files:
  created: []
  modified:
    - "nexus/packages/core/src/logger.ts"
    - "nexus/packages/core/src/daemon.ts"
    - "nexus/packages/core/src/shell.ts"
    - "nexus/packages/core/src/index.ts"
    - "nexus/skills/content.ts"
    - "nexus/skills/leadgen-auto.ts"
    - "nexus/skills/research.ts"
    - "nexus/skills/site-audit.ts"

key-decisions:
  - "Each file defines its own NEXUS_ constants (no shared module needed)"
  - "Fallback defaults preserve existing /opt/nexus paths for backward compatibility"
  - "path.join() used even on Linux for consistency and Windows dev compatibility"

patterns-established:
  - "NEXUS_ prefix for all Nexus environment variables"
  - "Define const at top of file with fallback, use const throughout"

# Metrics
duration: 4min
completed: 2026-02-04
---

# Phase 5 Plan 03: Nexus Hardcoded Paths Summary

**NEXUS_LOGS_DIR, NEXUS_BASE_DIR, NEXUS_SKILLS_DIR, and NEXUS_OUTPUT_DIR environment variables replace all hardcoded /opt/nexus paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-04T09:04:58Z
- **Completed:** 2026-02-04T09:08:20Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- All Nexus core files (logger, daemon, shell, index) now read paths from environment variables
- All Nexus skill files (content, leadgen-auto, research, site-audit) use NEXUS_OUTPUT_DIR
- Cross-platform path construction using path.join()
- Backward compatible fallback defaults preserve /opt/nexus behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace hardcoded paths in logger.ts and daemon.ts** - `c5a9106` (feat)
2. **Task 2: Replace hardcoded paths in shell.ts, index.ts, and nexus skills** - `34aea7f` (feat)

## Files Created/Modified

- `nexus/packages/core/src/logger.ts` - Added NEXUS_LOGS_DIR for log file path
- `nexus/packages/core/src/daemon.ts` - Added NEXUS_LOGS_DIR for log reading in router and tool registry
- `nexus/packages/core/src/shell.ts` - Added NEXUS_BASE_DIR for default working directory
- `nexus/packages/core/src/index.ts` - Added NEXUS_BASE_DIR and NEXUS_SKILLS_DIR for shell, skills, and heartbeat
- `nexus/skills/content.ts` - Added NEXUS_OUTPUT_DIR for content output files
- `nexus/skills/leadgen-auto.ts` - Added NEXUS_OUTPUT_DIR for leads JSON output
- `nexus/skills/research.ts` - Added NEXUS_OUTPUT_DIR for research report files
- `nexus/skills/site-audit.ts` - Added NEXUS_OUTPUT_DIR for audit report files

## Decisions Made

- Each file defines its own constant rather than importing from a shared module (simpler, no cross-dependency)
- Using fallback defaults with `|| '/opt/nexus/...'` ensures backward compatibility
- Using `path.join()` for all path construction even though production is Linux (supports Windows development)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Environment variables are optional with sensible defaults.

## Next Phase Readiness

- Nexus workspace fully configurable via NEXUS_ environment variables
- Ready for multi-environment deployment (dev/staging/prod)
- TypeScript compilation verified

---
*Phase: 05-configurability*
*Completed: 2026-02-04*
