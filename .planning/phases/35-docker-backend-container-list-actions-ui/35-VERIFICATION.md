---
phase: 35-docker-backend-container-list-actions-ui
verified: 2026-03-22T21:11:41Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Container list shows all running and stopped containers with name, image, state, ports, and resource usage columns"
    status: partial
    reason: "Per-container resource usage (CPU/memory) is not included in ContainerInfo type or rendered in the table. DOCK-01 requires 'resource usage' but the container list only shows name, image, state, ports, actions. System-level resource cards (CPU, Memory, Storage) exist above the table but are not per-container."
    artifacts:
      - path: "livos/packages/livinityd/source/modules/docker/types.ts"
        issue: "ContainerInfo has id, name, image, state, status, ports, created, isProtected but no cpu/memory usage fields"
      - path: "livos/packages/livinityd/source/modules/docker/docker.ts"
        issue: "listContainers uses docker.listContainers({all:true}) which does not return per-container resource stats (requires container.stats())"
      - path: "livos/packages/ui/src/routes/server-control/index.tsx"
        issue: "Table columns are Name, Image, State, Ports, Actions -- no resource usage column"
    missing:
      - "Add cpu/memory fields to ContainerInfo (requires docker.stats() calls or a separate stats endpoint)"
      - "Add a resource usage column to the container table showing per-container CPU% and memory"
human_verification:
  - test: "Open Server Management window and verify Containers tab is default active"
    expected: "Tabbed interface appears with Containers selected, showing a table of containers"
    why_human: "Visual UI layout and tab default state cannot be verified by code analysis alone"
  - test: "Click Stop on a protected container row (e.g., redis, postgres)"
    expected: "Stop button is disabled/greyed out, nothing happens on click"
    why_human: "Interactive button disabled state and visual indicator need runtime verification"
  - test: "Click Remove on a non-protected container and verify the confirmation dialog"
    expected: "Dialog opens asking to type the container name; Remove button stays disabled until name matches exactly"
    why_human: "Dialog flow, input matching, and button enablement are runtime interactive behaviors"
  - test: "Verify container list auto-refreshes without page reload"
    expected: "New containers or state changes appear within 5 seconds without manual action"
    why_human: "Polling behavior and live data refresh require a running server with Docker"
---

# Phase 35: Docker Backend + Container List/Actions UI Verification Report

**Phase Goal:** Admin users can see all Docker containers and perform lifecycle actions (start, stop, restart, remove) with safety guardrails preventing infrastructure damage
**Verified:** 2026-03-22T21:11:41Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User opens Server Management and sees a tabbed interface with Containers as the default active tab | VERIFIED | `server-control/index.tsx` line 351: `<Tabs defaultValue='containers'>` with TabsTrigger for Containers, Images, Volumes, Networks, PM2, Monitoring |
| 2 | Container list shows all running and stopped containers with name, image, state, ports, and resource usage columns | PARTIAL | Table has Name, Image, State, Ports, Actions columns. Backend passes `{all: true}` to Dockerode. **Missing: per-container resource usage** -- ContainerInfo has no cpu/memory fields, table has no resource usage column |
| 3 | User can start, stop, and restart any non-protected container from action buttons in the list | VERIFIED | Inline ActionButtons for Start (when not running), Stop (when running), Restart (always). `manage()` calls `docker.manageContainer` mutation. Backend executes `container.start()/stop()/restart()` |
| 4 | User cannot stop or remove Redis, PostgreSQL, Caddy, or LivOS core containers -- UI disables actions and backend rejects requests | VERIFIED | UI: Stop/Remove buttons `disabled={isManaging \|\| container.isProtected}` (lines 472, 487). Backend: `isProtectedContainer()` checks name against 10 patterns, throws `[protected-container]` error mapped to FORBIDDEN TRPCError |
| 5 | Remove requires a confirmation dialog where user must type the container name before proceeding | VERIFIED | RemoveDialog component (lines 210-269) with Input field, `canConfirm = typedName === containerName`. Backend enforces `confirmName !== name` check (routes.ts line 26). Remove button disabled until match |

**Score:** 4/5 truths verified (1 partial)

### Required Artifacts

**Plan 01 Artifacts (Backend)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/docker/types.ts` | Container types + protected patterns | VERIFIED | 34 lines. Exports PROTECTED_CONTAINER_PATTERNS (10 patterns), ContainerInfo, PortMapping, ContainerOperation. All expected fields present. |
| `livos/packages/livinityd/source/modules/docker/docker.ts` | Dockerode singleton + domain functions | VERIFIED | 61 lines. Singleton `const docker = new Dockerode()`. Exports isProtectedContainer, listContainers, manageContainer. Protected enforcement on stop/remove. |
| `livos/packages/livinityd/source/modules/docker/routes.ts` | tRPC docker router with admin auth | VERIFIED | 49 lines. Uses adminProcedure for both routes. listContainers query, manageContainer mutation with confirmName validation and FORBIDDEN error mapping. |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts` | appRouter with docker sub-router | VERIFIED | Line 19: `import docker from '../../docker/routes.js'`. Line 39: `docker` in appRouter object. |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | docker.manageContainer in httpOnlyPaths | VERIFIED | Line 55: `'docker.manageContainer'` in httpOnlyPaths array. |

**Plan 02 Artifacts (Frontend)**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/ui/src/hooks/use-containers.ts` | Container list hook with 5s polling | VERIFIED | 51 lines. `refetchInterval: 5000`. Exports useContainers with containers, manage, actionResult, runningCount, totalCount. |
| `livos/packages/ui/src/routes/server-control/index.tsx` | Tabbed Server Management UI | VERIFIED | 534 lines. Tabs (Containers default), Table with 5 columns, StateBadge, IconLock, ActionButtons, RemoveDialog, ResourceCards preserved, PlaceholderTab for 5 future tabs. |
| `livos/packages/ui/src/modules/window/window-content.tsx` | server-control in fullHeightApps | VERIFIED | Line 23: `'LIVINITY_server-control'` in fullHeightApps Set. |
| `livos/packages/ui/src/providers/window-manager.tsx` | Window size 1100x750 | VERIFIED | Line 74: `'LIVINITY_server-control': {width: 1100, height: 750}` |

### Key Link Verification

**Plan 01 Key Links**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| docker/routes.ts | docker/docker.ts | `import {listContainers, manageContainer} from './docker.js'` | WIRED | Line 5: exact import. Both functions called in route handlers (lines 11, 35). |
| trpc/index.ts | docker/routes.ts | `import docker from '../../docker/routes.js'` | WIRED | Line 19: import. Line 39: `docker` registered in appRouter. |

**Plan 02 Key Links**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| use-containers.ts | docker.listContainers | `trpcReact.docker.listContainers.useQuery` | WIRED | Line 8: query with 5s polling. Result destructured as `containersQuery.data`. |
| use-containers.ts | docker.manageContainer | `trpcReact.docker.manageContainer.useMutation` | WIRED | Line 13: mutation with onSuccess (refetch + toast) and onError handlers. |
| server-control/index.tsx | use-containers.ts | `import {useContainers}` | WIRED | Line 26: import. Lines 293-305: full destructuring of hook return value. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DOCK-01 | 35-01, 35-02 | All containers with name, image, state, status, ports, and resource usage | PARTIAL | Name, image, state, status, ports all present. **Resource usage missing** -- no per-container CPU/memory in ContainerInfo or table. |
| DOCK-02 | 35-01, 35-02 | Start, stop, restart, and remove from UI | SATISFIED | Backend manageContainer supports all 4 operations. UI has inline action buttons for each. |
| DOCK-06 | 35-01 | Protected containers cannot be stopped or removed | SATISFIED | 10-pattern PROTECTED_CONTAINER_PATTERNS. Server-side enforcement in docker.ts + FORBIDDEN TRPCError in routes.ts. UI disables buttons. |
| DOCK-07 | 35-02 | Remove requires confirmation dialog with name | SATISFIED | RemoveDialog component with typed name matching. Backend enforces confirmName === name for remove operation. |
| UI-01 | 35-02 | Tabbed interface (Overview, Containers, Images, Volumes, Networks, PM2, Monitoring) | PARTIAL | 6 tabs present: Containers (default), Images, Volumes, Networks, PM2, Monitoring. **Overview tab is missing** -- ROADMAP success criterion does not mention Overview, but UI-01 description does. The plan chose to omit Overview and make Containers the default, which aligns with the success criteria. Acceptable deviation. |
| UI-04 | 35-02 | Destructive operations show confirmation dialogs | SATISFIED | RemoveDialog with typed container name confirmation before removal. |
| UI-05 | 35-02 | Real-time data updates without full page refresh | SATISFIED | `refetchInterval: 5000` in useContainers hook. Automatic 5-second polling. |
| SEC-01 | 35-01 | All Docker operations require admin role | SATISFIED | Both listContainers and manageContainer use `adminProcedure` (not privateProcedure). |
| SEC-02 | 35-01 | Protected container registry prevents infrastructure deletion | SATISFIED | 10-pattern registry in types.ts. Server-side enforcement in docker.ts line 39. |
| SEC-03 | 35-01, 35-02 | Container remove requires explicit typed confirmation | SATISFIED | Backend: routes.ts lines 25-31 validate confirmName === name. Frontend: RemoveDialog Input must match exactly. |

No orphaned requirements found -- all 10 requirement IDs from REQUIREMENTS.md mapped to Phase 35 are accounted for in the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server-control/index.tsx | 198-206 | PlaceholderTab "Coming soon" for 5 future tabs | Info | Intentional -- placeholder tabs for future phases (36-39). Not stubs; these are explicit shells. |

No TODOs, FIXMEs, empty implementations, or stub returns found in any phase artifacts.

### Human Verification Required

### 1. Tabbed Interface Visual Layout

**Test:** Open Server Management window from the desktop/dock
**Expected:** Window opens at 1100x750 with "Server Management" title, resource cards (CPU, Memory, Storage) at top, and tab bar with "Containers" selected by default
**Why human:** Visual layout, tab selection state, and window sizing need runtime verification

### 2. Protected Container Lock Indicators

**Test:** Look at a protected container row (redis, postgres, caddy)
**Expected:** Lock icon (amber) appears next to the container name. Stop and Remove buttons are visually disabled (lower opacity, not-allowed cursor). Start and Restart remain enabled.
**Why human:** Visual indicator rendering and disabled state appearance need visual confirmation

### 3. Remove Confirmation Dialog Flow

**Test:** Click Remove on a non-protected container
**Expected:** Dialog opens with title "Remove Container", shows container name in bold mono font, has an input field. "Remove" button is disabled until the typed name exactly matches. After confirming, container is removed and dialog closes.
**Why human:** Dialog flow, input matching behavior, and post-action state are interactive

### 4. 5-Second Auto-Refresh

**Test:** Watch the container list for 10 seconds while a container state changes (e.g., start a container from CLI)
**Expected:** Container state badge updates within 5 seconds without manual refresh
**Why human:** Polling behavior requires a running server with Docker containers

### Gaps Summary

One gap identified:

**Per-container resource usage is missing from the container list (DOCK-01 partial).** The requirement DOCK-01 specifies "resource usage" as part of the container display. The current implementation shows system-level resource cards (CPU, Memory, Storage) above the table, but no per-container CPU/memory columns in the table. The ContainerInfo type and docker.ts listContainers function do not fetch per-container stats (which requires separate `container.stats()` API calls). This was likely deferred to Phase 36 ("Container Detail View + Logs + Stats" which includes "per-container CPU/memory stats"), but it means DOCK-01 is only partially satisfied in Phase 35.

The gap is minor in context: all other functionality is complete and well-wired. Per-container stats require a fundamentally different data flow (streaming stats vs. one-shot list) and Phase 36 is explicitly designed for this. The question is whether DOCK-01 should be considered fully satisfied by Phase 35 alone, or if the "resource usage" portion was always intended for Phase 36.

---

_Verified: 2026-03-22T21:11:41Z_
_Verifier: Claude (gsd-verifier)_
