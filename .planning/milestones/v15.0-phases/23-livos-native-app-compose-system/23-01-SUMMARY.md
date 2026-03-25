---
phase: 23-livos-native-app-compose-system
plan: 01
subsystem: infra
tags: [docker, compose, healthcheck, yaml, builtin-apps]

# Dependency graph
requires: []
provides:
  - Complete Docker Compose definitions for all 11 builtin apps with health checks
  - generateAppTemplate() function to write docker-compose.yml and livinity-app.yml to disk
affects: [23-02-PLAN, app-install-flow, patchComposeFile]

# Tech tracking
tech-stack:
  added: []
  patterns: [compose-definition-in-code, app-template-generation, APP_DATA_DIR-volume-placeholders]

key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/compose-generator.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/builtin-apps.ts

key-decisions:
  - "ComposeDefinition as separate interface (ComposeServiceDef + ComposeDefinition) for type safety"
  - "Volume paths use ${APP_DATA_DIR} placeholder resolved at install time by patchComposeFile"
  - "generateAppTemplate returns null for non-builtin apps enabling fallback to git repo in Plan 02"
  - "Manifest support field defaults to website URL; gallery is empty array for generated manifests"

patterns-established:
  - "Compose-in-code: service definitions live in builtin-apps.ts alongside app metadata"
  - "Template generation: temp dir with docker-compose.yml + livinity-app.yml written via js-yaml"

requirements-completed: [R-COMPOSE-GEN, R-COMPOSE-MULTISERVICE, R-COMPOSE-HEALTHCHECK]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 23 Plan 01: Builtin App Compose Definitions Summary

**Native Docker Compose definitions for all 11 builtin apps with health checks, restart policies, and a generateAppTemplate() generator that writes compose+manifest YAML to disk**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T07:58:36Z
- **Completed:** 2026-03-21T08:02:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended BuiltinAppManifest with typed ComposeDefinition containing mainService identification, per-service health checks, restart policies, and volume/port mappings for all 11 apps
- Portainer has multi-service compose definition (Docker DinD + Portainer CE) satisfying R-COMPOSE-MULTISERVICE
- Created compose-generator.ts that writes docker-compose.yml and livinity-app.yml to temp directories, ready for Plan 02 to wire into install flow
- Port mappings handle host-to-container differences correctly (nextcloud 8080:80, code-server 8081:8080, grafana 3002:3000)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend BuiltinAppManifest with compose definitions for all 11 apps** - `9039d5b` (feat)
2. **Task 2: Create compose-generator.ts with generateAppTemplate()** - `07fb92b` (feat)

## Files Created/Modified
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` - Extended with ComposeDefinition interface and compose field on all 11 apps
- `livos/packages/livinityd/source/modules/apps/compose-generator.ts` - New module exporting generateAppTemplate() for writing template directories

## Decisions Made
- ComposeServiceDef and ComposeDefinition as separate exported interfaces for reuse in Plan 02
- Volume paths use `${APP_DATA_DIR}` placeholder (resolved at install time, not generation time)
- generateAppTemplate returns null for non-builtin apps, enabling clean fallback to git-based installs
- Manifest `support` field defaults to `website` URL; `gallery` is empty array (both required by AppManifest schema)
- Used tab indentation in compose-generator.ts to match existing app.ts code style

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can now import `generateAppTemplate()` and wire it into the install flow
- The `getBuiltinApp()` function returns apps with complete compose definitions
- patchComposeFile will still run on generated compose files to add container names, port binding adjustments, and env overrides

## Self-Check: PASSED

- [x] builtin-apps.ts exists with compose definitions
- [x] compose-generator.ts exists with generateAppTemplate()
- [x] Commit 9039d5b found (Task 1)
- [x] Commit 07fb92b found (Task 2)

---
*Phase: 23-livos-native-app-compose-system*
*Completed: 2026-03-21*
