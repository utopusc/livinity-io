---
phase: 29-unified-capability-registry
plan: 01
subsystem: api
tags: [registry, capability, redis, typescript, mcp, tools, skills, agents]

# Dependency graph
requires: []
provides:
  - CapabilityManifest interface (18-field rich manifest for all capability types)
  - CapabilityType union (tool, skill, mcp, hook, agent)
  - CapabilityRegistry class (sync engine, Redis persistence, in-memory search)
affects: [30-marketplace-mcp, 31-intent-router, 32-auto-provisioning, 35-agents-panel-redesign]

# Tech tracking
tech-stack:
  added: []
  patterns: [dependency-injection-constructor, redis-pipeline-persistence, pubsub-event-sync, in-memory-cache-search]

key-files:
  created:
    - nexus/packages/core/src/capability-registry.ts
  modified: []

key-decisions:
  - "In-memory Map cache for search (expected <200 entries, no Redis SCAN needed)"
  - "Skip mcp__ prefixed tools in syncTools to avoid double-counting with MCP entries"
  - "Empty semantic_tags for skills since SkillLoader.listSkills() does not expose manifest tags"
  - "Event-driven re-sync via existing nexus:config:updated pub/sub channel"

patterns-established:
  - "Capability ID format: {type}:{name} (e.g. mcp:chrome-devtools, tool:shell, agent:monitor-1)"
  - "Redis key pattern: nexus:cap:{type}:{name} for persistent manifest storage"
  - "Context cost estimation: (description.length + JSON.stringify(parameters).length) / 4 tokens"

requirements-completed: [REG-01, REG-02, REG-03]

# Metrics
duration: 2min
completed: 2026-03-29
---

# Phase 29 Plan 01: Unified Capability Registry Summary

**CapabilityRegistry module with 5-type manifest model, 4-source sync engine, Redis persistence, and in-memory search**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-29T04:04:45Z
- **Completed:** 2026-03-29T04:07:13Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created CapabilityManifest interface with 18 fields covering identity, classification, dependencies, cost, and runtime status
- Implemented CapabilityRegistry class that syncs from ToolRegistry, SkillLoader, McpClientManager, and SubagentManager
- Redis pipeline persistence under nexus:cap:{type}:{name} keys for restart durability
- In-memory cache with list/search/get supporting text, tags, and type filtering
- Event-driven re-sync via Redis pub/sub on nexus:config:updated channel

## Task Commits

Each task was committed atomically:

1. **Task 1: Define CapabilityManifest interface, CapabilityType union, and CapabilityRegistry class** - `7e6dafb` (feat)

## Files Created/Modified
- `nexus/packages/core/src/capability-registry.ts` - Unified capability registry with manifest types, sync engine, and query API (404 lines)

## Decisions Made
- Used in-memory Map for search cache since the expected entry count is <200, making Redis SCAN unnecessary
- Skipped tools with `mcp__` prefix in syncTools to avoid double-counting (they appear under MCP capability entries via provides_tools)
- Used empty semantic_tags for skills because SkillLoader.listSkills() does not expose manifest tags through its public API; can be enhanced later when the API is extended
- Reused the existing `nexus:config:updated` pub/sub channel for event-driven re-sync rather than creating a new channel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CapabilityRegistry is ready for integration into nexus-core startup (Plan 29-02)
- All downstream phases (30-36) can depend on the CapabilityManifest interface and CapabilityRegistry class
- The `search()` method is ready for the Intent Router (Phase 31)
- The `list()` method with filters is ready for the Agents Panel Redesign (Phase 35)

## Self-Check: PASSED

- FOUND: nexus/packages/core/src/capability-registry.ts
- FOUND: .planning/phases/29-unified-capability-registry/29-01-SUMMARY.md
- FOUND: commit 7e6dafb

---
*Phase: 29-unified-capability-registry*
*Completed: 2026-03-29*
