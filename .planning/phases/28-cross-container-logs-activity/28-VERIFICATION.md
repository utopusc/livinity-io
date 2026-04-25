---
status: human_needed
phase: 28-cross-container-logs-activity
must_haves_total: 16
must_haves_verified: 16
must_haves_failed: 0
requirement_ids: DOC-13, DOC-14
verified: 2026-04-25T22:56:02Z
human_verification:
  - test: "Cross-container multiplex feel — check 2-3 running containers, lines from each interleave in real time within 1s of WS connect"
    expected: "Three streams interleave smoothly; no stuttering, no batching above ~100ms; live-tail auto-scroll feels natural"
    why_human: "Real-time streaming UX cannot be assessed without a live Docker socket and human perception of latency"
  - test: "Color stripe distinctness across containers"
    expected: "Two unrelated container names produce visibly different hues; the same name reloads to the same color across page refresh"
    why_human: "djb2 hue distribution is verified mathematically (50-name distinct-hue test), but visual distinctness on the actual dark/light theme is human-perceived"
  - test: "Activity Timeline AnimatePresence fade-in at top on 5s poll"
    expected: "When a new container starts in another terminal, within ~5s a new row fades in from y=-8 at the top of the Activity list smoothly"
    why_human: "Framer Motion animation fluidity, perceived smoothness of the y/-opacity transition, and absence of layout jank can only be assessed visually"
  - test: "Click-through navigation feel"
    expected: "Clicking a docker container Activity row opens ContainerDetailSheet for that container with no flash; clicking a scheduler row lands on Schedules section; clicking AI alert with containerName opens the right sheet"
    why_human: "Cross-section navigation feel (any flash, scroll-jump, sheet animation glitch) requires running browser; setSelectedContainer + setSection are wired but the resulting UX is observable only at runtime"
  - test: "Live-tail auto-disable on manual scroll-up"
    expected: "Toggle live-tail ON; scroll up past 4px tolerance — toggle visibly switches to OFF; scroll back down + toggle ON snaps to bottom"
    why_human: "Scroll-event-driven UX with rAF-driven snap-to-bottom requires a live stream and human scroll input"
  - test: "Severity dropdown filter on real log streams"
    expected: "Selecting 'ERROR' shows only lines whose body matches /\\b(error|err|fatal|...)\\b/i; switching to 'INFO' shows the matching subset"
    why_human: "Heuristic classifier is unit-tested with synthetic strings, but classifier accuracy on real container output (which mixes log formats) is best judged visually"
  - test: "Cross-env switch resets sidebar + clears lines (no bleed)"
    expected: "Switch env in global selector — sidebar repopulates with new env's containers; old env's lines disappear immediately"
    why_human: "Requires multi-environment setup with running containers in each; useMultiplexedLogs has the clear logic but the multi-env dependency makes it impractical to mock"
  - test: "Cross-env AI alert client filter"
    expected: "Alerts visible in Activity only when environmentId matches selected env or is null"
    why_human: "Requires alerts existing in multiple envs to observe the filter behavior; useActivityFeed.ts implements the filter but exercising it needs real cross-env data"
---

# Phase 28: Cross-Container Logs + Activity Timeline Verification Report

**Phase Goal:** Two NEW surfaces v27.0 didn't ship — cross-container Logs aggregator + global Activity timeline.
**Verified:** 2026-04-25T22:56:02Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

#### Plan 28-01 (DOC-13 — Cross-container Logs)

| #   | Truth                                                                                            | Status     | Evidence                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `/docker/logs` shows left sidebar of running containers with checkboxes                          | ✓ VERIFIED | `logs-sidebar.tsx:88-122` — runningContainers.filter + Checkbox per row; wired in `logs-section.tsx:81-87`              |
| 2   | Multi-container check streams via multiplexed WS within 1s                                       | ✓ VERIFIED | `use-multiplexed-logs.ts:113-275` — one WS per name (line 169), 100ms throttle (line 218), buildWsUrl uses /ws/docker/logs |
| 3   | Each line has 4px deterministic color stripe (same name → same color across reloads)             | ✓ VERIFIED | `logs-viewer.tsx:253` borderLeft 4px solid colorForContainer; djb2 in `log-color.ts:13-24` deterministic               |
| 4   | Each line prefixed with `[container-name]` before body                                           | ✓ VERIFIED | `logs-viewer.tsx:255-261` — `[{line.containerName}]` rendered before body                                              |
| 5   | Grep regex filters; invalid regex → red badge, no crash                                          | ✓ VERIFIED | `logs-viewer.tsx:65-73` compileGrep try/catch returns Error; `:182-190` invalid badge; maxLength=500 line 177          |
| 6   | Severity ALL/ERROR/WARN/INFO/DEBUG filter via classifier                                         | ✓ VERIFIED | `logs-viewer.tsx:91-103` filteredLines uses classifySeverity; `log-severity.ts:31-37` word-boundary regex per level    |
| 7   | Live-tail toggle: on auto-scrolls; off allows manual scroll                                      | ✓ VERIFIED | `logs-viewer.tsx:118-126` handleScroll auto-disables; `:129-138` rAF snap-to-bottom when on                            |
| 8   | Env switch resets sidebar + clears buffers (no cross-env bleed)                                  | ✓ VERIFIED | `use-multiplexed-logs.ts:117-136` env-crossing detection clears sockets/buffers; `logs-section.tsx:41-43` resets selection |

#### Plan 28-02 (DOC-14 — Activity Timeline)

| #   | Truth                                                                                            | Status     | Evidence                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 9   | `/docker/activity` shows descending timeline merging docker + scheduler + AI alerts              | ✓ VERIFIED | `use-activity-feed.ts:91-112` mapDockerEvent + mapScheduledJob + mapAiAlert merged via mergeAndSort; DESC sort `event-mappers.ts:239-241` |
| 10  | Each row has source icon, severity color, relative timestamp, title, body                        | ✓ VERIFIED | `activity-row.tsx:55-81` — Icon, SEVERITY_STRIPE border-l-4, formatRelativeDate, title span, body span                  |
| 11  | Source filter chips (All / docker / scheduler / ai) narrow visible list                          | ✓ VERIFIED | `activity-section.tsx:46-53` filter on source; `activity-filters.tsx:96-107` chip row; ACTIVITY_SOURCES const           |
| 12  | Severity chips (All / info / warn / error) narrow visible list                                   | ✓ VERIFIED | `activity-section.tsx:50` severity check; `activity-filters.tsx:112-124` severity chip row; ACTIVITY_SEVERITIES const   |
| 13  | Click docker container row → setSelectedContainer + section='containers'                         | ✓ VERIFIED | `activity-section.tsx:60-64` — `r.setSelectedContainer(e.sourceId)` + `setSection('containers')`                        |
| 14  | Click scheduler row → section='schedules'                                                        | ✓ VERIFIED | `activity-section.tsx:66-69` — `setSection('schedules')`                                                                |
| 15  | Click AI alert → setSelectedContainer when sourceId present, else section='logs'                 | ✓ VERIFIED | `activity-section.tsx:73-81` — branch on `e.sourceId`                                                                   |
| 16  | 5s polling refreshes feed; new rows fade in at top via AnimatePresence                           | ✓ VERIFIED | `use-activity-feed.ts:41,70,77,85` POLL_INTERVAL_MS=5000 on all 3 queries; `activity-section.tsx:32-36,137-151` AnimatePresence + motion.li |

**Score:** 16/16 truths verified (visual/UX claims routed to human verification per phase brief)

### Required Artifacts

#### Plan 28-01

| Artifact                                                                                  | Expected                                          | Status     | Details                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts`                    | env-aware via getDockerClient(envId)              | ✓ VERIFIED | parseLogsParams extracted; getDockerClient(envId) at line 99           |
| `livos/packages/livinityd/source/modules/docker/docker-logs-socket.unit.test.ts`          | 8 parseLogsParams cases                           | ✓ VERIFIED | 8/8 tests pass                                                         |
| `livos/packages/ui/src/routes/docker/logs/log-color.ts`                                   | djb2 → HSL deterministic                          | ✓ VERIFIED | `colorForContainer` exports HSL string; deterministic                  |
| `livos/packages/ui/src/routes/docker/logs/log-color.unit.test.ts`                         | 5 cases                                           | ✓ VERIFIED | 5/5 pass                                                               |
| `livos/packages/ui/src/routes/docker/logs/log-severity.ts`                                | ERROR/WARN/INFO/DEBUG classifier                  | ✓ VERIFIED | Word-boundary regex per level; null fallback                           |
| `livos/packages/ui/src/routes/docker/logs/log-severity.unit.test.ts`                      | 7 cases                                           | ✓ VERIFIED | 7/7 pass                                                               |
| `livos/packages/ui/src/routes/docker/logs/log-buffer.ts`                                  | pushBounded ring buffer + MAX=5000                | ✓ VERIFIED | Immutable shape; FIFO drop; MAX_LINES_PER_CONTAINER=5000               |
| `livos/packages/ui/src/routes/docker/logs/log-buffer.unit.test.ts`                        | 6 cases                                           | ✓ VERIFIED | 6/6 pass                                                               |
| `livos/packages/ui/src/routes/docker/logs/use-multiplexed-logs.ts`                        | per-container WS multiplex hook                   | ✓ VERIFIED | One WS per name, 25-cap, throttled setLines, env-cross clears          |
| `livos/packages/ui/src/routes/docker/logs/logs-section.tsx`                               | Sidebar + Viewer composition                      | ✓ VERIFIED | LogsSidebar + LogsViewer + useMultiplexedLogs glue                     |
| `livos/packages/ui/src/routes/docker/logs/logs-sidebar.tsx`                               | Running containers w/ checkboxes                  | ✓ VERIFIED | useContainers filtered to running; Checkbox + color circle + state dot |
| `livos/packages/ui/src/routes/docker/logs/logs-viewer.tsx`                                | Toolbar + virtualized rows + grep + severity      | ✓ VERIFIED | Bare-bones virtualizer at 20px; grep maxLength 500; severity Select    |
| `livos/packages/ui/src/routes/docker/sections/logs.tsx`                                   | 1-line re-export replacing placeholder            | ✓ VERIFIED | `export {LogsSection as Logs} from '../logs/logs-section'`             |

#### Plan 28-02

| Artifact                                                                  | Expected                              | Status     | Details                                                                |
| ------------------------------------------------------------------------- | ------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `livos/packages/ui/src/routes/docker/activity/activity-types.ts`          | ActivityEvent + const arrays          | ✓ VERIFIED | ACTIVITY_SOURCES, ACTIVITY_SEVERITIES, ActivityEvent interface         |
| `livos/packages/ui/src/routes/docker/activity/activity-types.unit.test.ts`| 5 cases                               | ✓ VERIFIED | 5/5 pass                                                               |
| `livos/packages/ui/src/routes/docker/activity/event-mappers.ts`           | 3 mappers + mergeAndSort              | ✓ VERIFIED | mapDockerEvent, mapScheduledJob, mapAiAlert, mergeAndSort, FEED_MAX=500 |
| `livos/packages/ui/src/routes/docker/activity/event-mappers.unit.test.ts` | 24 cases                              | ✓ VERIFIED | 24/24 pass                                                             |
| `livos/packages/ui/src/routes/docker/activity/use-activity-feed.ts`       | 3-query 5s polling + cross-env filter | ✓ VERIFIED | dockerEvents+listJobs+listAiAlerts at refetchInterval 5000; AI filter line 106-108 |
| `livos/packages/ui/src/routes/docker/activity/activity-section.tsx`       | Filters + AnimatePresence + click     | ✓ VERIFIED | useActivityFeed + filters + motion.li with ROW_VARIANTS y:-8           |
| `livos/packages/ui/src/routes/docker/activity/activity-row.tsx`           | Single-row presentation               | ✓ VERIFIED | Border-l-4 stripe + Icon + title + body + subtype badge + relTime     |
| `livos/packages/ui/src/routes/docker/activity/activity-filters.tsx`       | Source + severity chip rows           | ✓ VERIFIED | Two single-select chip rows; tone-colored active state                 |
| `livos/packages/ui/src/routes/docker/sections/activity.tsx`               | 1-line re-export replacing placeholder| ✓ VERIFIED | `export {ActivitySection as Activity} from '../activity/activity-section'` |

### Key Link Verification

| From                           | To                                                        | Via                                          | Status     | Details                                                                                |
| ------------------------------ | --------------------------------------------------------- | -------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| use-multiplexed-logs.ts        | /ws/docker/logs?container&envId&tail&token                | one WS per included container                | ✓ WIRED    | `buildWsUrl` line 71 builds canonical URL; `new WebSocket(...)` line 169               |
| docker-logs-socket.ts          | getDockerClient(envId)                                    | per-request env-aware client                 | ✓ WIRED    | Line 99 `await getDockerClient(envId)` replacing module-scope `new Dockerode()`        |
| sections/logs.tsx              | logs/logs-section.tsx                                     | 1-line re-export                             | ✓ WIRED    | `export {LogsSection as Logs} from '../logs/logs-section'`                             |
| use-activity-feed.ts           | trpcReact.docker.dockerEvents + scheduler.listJobs + listAiAlerts | three useQuery hooks                  | ✓ WIRED    | Lines 64, 76, 82 — refetchInterval=5000 across all three                               |
| activity-row.tsx → section.tsx | useDockerResource setSelectedContainer + setSection       | onClick handler in ActivityRow → handleClick | ✓ WIRED    | Section handleClick (line 55-102) routes by source/sourceType                          |
| sections/activity.tsx          | activity/activity-section.tsx                             | 1-line re-export                             | ✓ WIRED    | `export {ActivitySection as Activity} from '../activity/activity-section'`             |
| docker-app.tsx                 | <Logs/> + <Activity/>                                     | section switch case 'logs' / 'activity'      | ✓ WIRED    | docker-app.tsx lines 65-66 + 79-80 render Logs and Activity components                 |

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable | Source                                                  | Produces Real Data                       | Status      |
| ------------------------- | ------------- | ------------------------------------------------------- | ---------------------------------------- | ----------- |
| logs-viewer.tsx           | `lines`       | useMultiplexedLogs → WS chunks → pushBounded buffer     | Real WS messages from Docker socket      | ✓ FLOWING   |
| logs-sidebar.tsx          | `containers`  | useContainers() → trpc                                  | Real Docker container list (env-scoped)  | ✓ FLOWING   |
| activity-section.tsx      | `events`      | useActivityFeed → 3 tRPC polls + mergeAndSort           | Real docker events + scheduler + AI alerts | ✓ FLOWING |
| activity-row.tsx          | `event`       | Prop from activity-section.tsx                          | Real ActivityEvent from feed             | ✓ FLOWING   |

No HOLLOW_PROP, DISCONNECTED, or STATIC issues found. All dynamic surfaces trace to real data sources (existing tRPC routes from Phases 17/20/22/23, plus the env-aware /ws/docker/logs WS).

### Behavioral Spot-Checks

| Behavior                                                       | Command                                                                                                       | Result                                                | Status |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| UI vitest for Phase 28 logs + activity passes                  | `cd livos/packages/ui && pnpm exec vitest run src/routes/docker/logs/ src/routes/docker/activity/`            | 5 files / 47 tests passed (5+7+6+5+24)                | ✓ PASS |
| Backend parseLogsParams unit tests pass                        | `cd livos/packages/livinityd && pnpm exec vitest run source/modules/docker/docker-logs-socket.unit.test.ts`   | 1 file / 8 tests passed                               | ✓ PASS |
| UI build clean                                                 | `cd livos/packages/ui && pnpm build`                                                                          | Built in 31.89s; PWA SW generated                     | ✓ PASS |
| Phase 24 placeholder strings absent in UI source               | `grep -r "Coming in Phase 28" livos/packages/ui/src/`                                                         | No matches in src/ (only references in planning docs) | ✓ PASS |
| DockerApp.tsx imports + renders Logs and Activity              | `grep` for sections/logs + sections/activity in docker-app.tsx                                                | Imports lines 19, 23; rendered cases 'logs', 'activity' | ✓ PASS |
| Phase 28 commit range matches summary                          | `git log --oneline 7647e2fb^..fd190e07`                                                                       | 11 commits — matches phase brief                       | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                              | Status      | Evidence                                                                              |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| DOC-13      | 28-01       | `/docker/logs` cross-container log aggregator: multi-select containers, grep, severity, live-tail toggle | ✓ SATISFIED | All 8 truths verified; LogsSection live; placeholder gone; 26+8 unit tests pass       |
| DOC-14      | 28-02       | `/docker/activity` global event timeline merging docker + scheduler + AI alerts; filter chips; click-through | ✓ SATISFIED | All 8 truths verified; ActivitySection live; placeholder gone; 29 unit tests pass     |

No orphaned requirements. Both requirement IDs are claimed by their respective plans and have implementation evidence.

### Anti-Patterns Found

| File                                                  | Line | Pattern                  | Severity | Impact                                                                                                              |
| ----------------------------------------------------- | ---- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| logs-viewer.tsx                                       | 176  | `placeholder='grep regex…'` | ℹ️ Info  | False positive — `placeholder` is the HTML input attribute (user-facing prompt text), not a stub indicator           |
| log-severity.ts                                       | 36   | `return null`            | ℹ️ Info  | Intentional — classifier returns null for unrecognized lines (documented decision; severity filter excludes these) |
| event-mappers.ts                                      | 142  | `return null`            | ℹ️ Info  | Intentional — mapScheduledJob returns null for never-run / running jobs (honest representation per CONTEXT)         |
| event-mappers.ts                                      | 143  | `return null`            | ℹ️ Info  | Intentional — running status is not a "completed event"                                                             |
| logs-viewer.tsx                                       | 67   | `return null`            | ℹ️ Info  | Intentional — compileGrep returns null when pattern is empty (means "no filter")                                    |

No blocker (🛑) or warning (⚠️) anti-patterns found. All `return null` instances are intentional, documented behavior with corresponding consumer logic that handles null appropriately.

### Human Verification Required

8 visual/UX behaviors require running browser + live Docker socket to confirm — full details in YAML frontmatter `human_verification`:

1. **Cross-container multiplex feel** — interleaving streams + 1s WS connect latency
2. **Color stripe distinctness** — visual hue differentiation on dark/light themes
3. **Activity Timeline AnimatePresence fade-in** — perceived smoothness of motion.li transition
4. **Click-through navigation feel** — sheet open animations, scroll behavior, no flash
5. **Live-tail auto-disable on manual scroll-up** — scroll-event-driven UX
6. **Severity dropdown filter on real log streams** — heuristic accuracy on real container output
7. **Cross-env switch resets sidebar + clears lines** — multi-env behavior
8. **Cross-env AI alert client filter** — multi-env alert visibility

### Gaps Summary

No code gaps. All 16 must-have truths are verified at the code level (existence, substantive implementation, wired connections, real data flow). Status is `human_needed` because the phase brief explicitly routed visual/UX claims (multiplex feel, color stripe distinctness, fade-in smoothness, click-through navigation feel) to human verification — these cannot be assessed programmatically.

The implementation matches both PLAN frontmatter must_haves and ROADMAP success criteria for Phase 28. 11 atomic commits (7647e2fb → fd190e07) follow the documented TDD RED+GREEN sequence for both plans. 47 UI tests + 8 backend tests = 55 unit tests pass. UI build green. Both Phase 24 placeholders correctly replaced with 1-line re-exports.

---

_Verified: 2026-04-25T22:56:02Z_
_Verifier: Claude (gsd-verifier)_
