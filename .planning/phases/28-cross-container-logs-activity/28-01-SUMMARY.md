---
phase: 28
plan: 01
subsystem: ui+livinityd
tags: [docker-app, logs, websocket, multiplex, doc-13, virtualized-list, tdd, env-aware-ws]
requires:
  - phase: 17
    provides: /ws/docker/logs WS handler + stripDockerStreamHeaders helper
  - phase: 22
    provides: getDockerClient(envId) factory + LOCAL_ENV_ID alias
  - phase: 24
    provides: DockerApp section switch + Phase 24 sections/logs.tsx placeholder
  - phase: 26
    provides: filterByQuery primitive + sectional resource search precedent
provides:
  - cross-container-logs-section
  - env-aware-/ws/docker/logs-handler
  - parseLogsParams-pure-helper
  - colorForContainer-deterministic-hash
  - classifySeverity-word-boundary-classifier
  - pushBounded-ring-buffer
  - useMultiplexedLogs-hook
affects:
  - routes/docker/sections/logs.tsx
  - routes/docker/logs/
  - modules/docker/docker-logs-socket.ts
  - phase-28-02 (Activity Timeline reuses color-hash + bounded ring buffer patterns)
  - phase-29 (DOC-15 cross-container shell — WS multiplex pattern carries forward)
tech-stack:
  added: []
  patterns:
    - "Pure helper extraction for testability (parseLogsParams, colorForContainer, classifySeverity, pushBounded) — keeps WS handler / React hook a thin shell"
    - "djb2 string hash mod 360 → HSL hue with fixed S/L for theme-agnostic legibility"
    - "Word-boundary regex severity classifier — narrow heuristic, returns null for noise (false positives worse than false negatives in a UI filter)"
    - "Bounded ring-buffer push helper returns NEW array (immutable shape so React detects setState)"
    - "Multiplex WS pattern: one socket per resource, aggregated client-side, throttled setState (100ms window) to coalesce chunks"
    - "Bare-bones virtualized list (no react-window dep) — 80-line implementation with ResizeObserver + rAF live-tail"
    - "Live-tail toggle that auto-disables on manual scroll-up (Dockhand UX parity)"
    - "Backend WS handler env-aware via per-request getDockerClient(envId) — back-compat preserved by treating null/empty envId as local socket"
key-files:
  created:
    - livos/packages/ui/src/routes/docker/logs/log-color.ts
    - livos/packages/ui/src/routes/docker/logs/log-color.unit.test.ts
    - livos/packages/ui/src/routes/docker/logs/log-severity.ts
    - livos/packages/ui/src/routes/docker/logs/log-severity.unit.test.ts
    - livos/packages/ui/src/routes/docker/logs/log-buffer.ts
    - livos/packages/ui/src/routes/docker/logs/log-buffer.unit.test.ts
    - livos/packages/ui/src/routes/docker/logs/use-multiplexed-logs.ts
    - livos/packages/ui/src/routes/docker/logs/logs-sidebar.tsx
    - livos/packages/ui/src/routes/docker/logs/logs-viewer.tsx
    - livos/packages/ui/src/routes/docker/logs/logs-section.tsx
    - livos/packages/livinityd/source/modules/docker/docker-logs-socket.unit.test.ts
  modified:
    - livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts
    - livos/packages/ui/src/routes/docker/sections/logs.tsx
    - .gitignore
    - livos/.gitignore
    - livos/packages/ui/.gitignore
key-decisions:
  - "WS handler envId extension: per-request getDockerClient(envId) instead of module-scope new Dockerode(). null/empty envId falls back to local socket — Phase 17 ContainerDetailSheet LogsTab back-compat preserved without code changes."
  - "Agent envs: ws.close(1011, 'Agent envs not yet supported for logs') — honest failure mode beats silent fallback to local socket. Plan 22-03 may unblock; until then the LogsViewer just shows no lines for agent envs (cross-env clearing means nothing leaks from local)."
  - "Multiplex cap of 25 concurrent sockets enforced client-side in useMultiplexedLogs (T-28-02). includedNames.slice(0, 25) + truncated boolean surfaced via amber banner in LogsViewer."
  - "Grep input maxLength=500 (T-28-03 ReDoS bound) + only the visible-buffer slice gets regex-tested per render. Per-render cost stays well within 16ms frame budget."
  - "Bare-bones virtualizer (~80 lines) instead of adding react-window. Plan called this out as a way to avoid a new dep; ResizeObserver + rAF live-tail snap-to-bottom + 4px scroll-up tolerance mirrors Dockhand."
  - "NO ANSI parsing in cross-container view. Plain-text rendering only. The xterm-based per-container LogsTab in ContainerDetailSheet (Phase 17 QW-01) stays the canonical drilldown for ANSI colors. ANSI escape codes here render as visible garbage — acceptable v1 trade-off, documented in CONTEXT.md."
  - "Severity heuristic: word-boundary regex per level, ERROR-first precedence. Returns null for unrecognized lines (intentional — false positives are worse than false negatives in a filter that the user can toggle off)."
  - "100ms setLines throttle window in useMultiplexedLogs. Coalesces all chunks within window into one setState call. setTimeout (NOT requestAnimationFrame) so background tabs still flush. Critical for >20 lines/sec streams."
  - "selectedNames is local component state in LogsSection (NOT zustand). Conversational, like resource-store pattern. Reset on env change so checkboxes don't reference containers from a previous env."
  - "useMultiplexedLogs uses TWO separate effects: a reconcile-on-deps effect (handles diff) and a final-unmount-cleanup effect (closes all sockets only on true unmount, not on every deps change). React StrictMode double-invocation in dev would otherwise tear down sockets the diff loop just opened."
  - "gitignore negation rule added: src/routes/docker/logs/ is the cross-container log viewer SOURCE dir, NOT a runtime log dir. Without negation, the 'logs/' rule (intended for runtime log directories) blocked the entire Phase 28 surface from being committed."
patterns-established:
  - "Pure helper + thin shell: extract URL parser / color hash / severity classifier / ring-buffer helpers so unit tests don't need to mock WS / Docker / React. Use Plan 24-02 D-12 layout-files smoke-only rationale for the surrounding shells."
  - "Multiplex WS pattern: one socket per resource, aggregate client-side, throttled setState. Reusable for Phase 28-02 Activity Timeline (single dockerEvents WS subscription) and Phase 29 cross-container shell (multi-container exec) — though scheduler/ai sources are polling, the bounded-buffer + chronological-sort pattern carries over."
  - "Two-effect WS lifecycle: deps-driven reconcile effect (open new, close removed, preserve still-included buffers) + empty-deps unmount effect (close all). Avoids StrictMode double-invocation tear-downs."
  - "Bare-bones virtualizer: 80 lines of math + a ResizeObserver. Reusable for any large-list surface where adding react-window/react-virtual feels heavy."
requirements-completed: [DOC-13]
threat-mitigations:
  - id: T-28-01
    status: mitigated
    note: getDockerClient(envId) validates env existence; admin sees same envs they already see via listEnvironments — no new privilege boundary.
  - id: T-28-02
    status: mitigated
    note: 25-socket hard cap in useMultiplexedLogs (includedNames.slice(0,25)). Phase 17 server-side 30s heartbeat carries forward unchanged.
  - id: T-28-03
    status: mitigated
    note: <Input maxLength=500> + filter applied to bounded buffer only. Per-render regex cost within 16ms frame budget.
  - id: T-28-04
    status: accepted
    note: Severity classifier is heuristic + UI-only. No security boundary.
  - id: T-28-05
    status: accepted
    note: 5000-line per-container × 25-socket cap × ~200B/line ≈ 25 MB worst-case browser memory.
  - id: T-28-06
    status: accepted
    note: Container name spoofing fails server-side (getContainer(name).logs() throws 404 → ws.close 1011).
  - id: T-28-07
    status: accepted
    note: No audit log on read-only logs stream — same decision as Phase 17 QW-01.
metrics:
  duration_minutes: 14
  tasks_completed: 3
  tasks_total: 3
  red_green_commits: 4
  feature_commits: 1
  total_commits: 5
  files_created: 11
  files_modified: 5
  vitest_added: 26
completed: 2026-04-25
---

# Phase 28 Plan 01: Cross-Container Logs Section Summary

**One-liner:** Live `/docker` Logs section replaces the Phase 24 placeholder — a 240-px sidebar of running containers in the selected env drives a multiplexed WebSocket viewer (one socket per checked container against the existing /ws/docker/logs handler, now env-aware) with deterministic per-container color stripes, [container-name] line prefixes, regex grep, ERROR/WARN/INFO/DEBUG severity heuristic, and live-tail toggle. DOC-13 closed.

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-25T15:20:00Z
- **Completed:** 2026-04-25T15:34:00Z
- **Tasks:** 3 (2× TDD split into RED + GREEN, 1× single feat commit)
- **Files created:** 11
- **Files modified:** 5
- **Total commits:** 5 task commits

## Accomplishments

1. **Phase 24 placeholder gone.** `sections/logs.tsx` is a 1-line re-export to the new LogsSection. `grep -r "Coming in Phase 28 — Cross-container" livos/packages/ui/src` returns empty.
2. **DOC-13 surface live.** Cross-container Logs section with multi-select sidebar, multiplexed WS streaming (one socket per checked container), deterministic per-container color stripes + name prefixes, regex grep, severity heuristic filter, live-tail toggle.
3. **WS handler env-aware.** `/ws/docker/logs` now accepts an optional `envId` query param routed through `getDockerClient(envId)`. Empty/missing envId falls back to local socket — Phase 17 ContainerDetailSheet LogsTab back-compat preserved without code changes. Agent envs get a clear `1011 'Agent envs not yet supported for logs'` close instead of silently falling back.
4. **Four pure helper modules** with 26 unit tests (5 + 7 + 6 + 8 cases): `colorForContainer` (djb2 → HSL deterministic per name), `classifySeverity` (word-boundary regex with ERROR-first precedence), `pushBounded` (immutable ring-buffer), `parseLogsParams` (URL parser).
5. **Bare-bones virtualizer in ~80 lines** — no `react-window` dependency added; ResizeObserver + rAF live-tail snap-to-bottom + 4px scroll-up tolerance.
6. **Pattern established for Phase 28-02 + 29:** multiplex WS aggregation pattern (one socket per resource, throttled setState, bounded ring buffer per source) carries forward to Activity Timeline and cross-container shell.

## Task Commits

1. **Task 1 RED: failing tests for log-color + log-severity + log-buffer** — `7647e2fb` (test) — also includes the gitignore negation Rule 3 auto-fix
2. **Task 1 GREEN: implement log-color + log-severity + log-buffer helpers** — `69fd6226` (feat)
3. **Task 2 RED: failing parseLogsParams unit tests** — `e392730b` (test)
4. **Task 2 GREEN: docker-logs-socket env-aware via getDockerClient** — `76c023a1` (feat)
5. **Task 3: cross-container Logs section — multiplexed WS + grep + severity + live-tail** — `b1cbd722` (feat)

(Phase metadata commit follows this SUMMARY.)

## Files Created/Modified

### Created (11)

**UI helpers (with paired unit tests, 26 cases total):**
- `livos/packages/ui/src/routes/docker/logs/log-color.ts` — djb2 string hash mod 360 → `hsl(h, 70%, 55%)` deterministic per container name
- `livos/packages/ui/src/routes/docker/logs/log-color.unit.test.ts` — 5 cases (determinism, hue distribution, format, empty input, range)
- `livos/packages/ui/src/routes/docker/logs/log-severity.ts` — word-boundary regex classifier ERROR/WARN/INFO/DEBUG, null fallback
- `livos/packages/ui/src/routes/docker/logs/log-severity.unit.test.ts` — 7 cases (each level, case-insensitivity + word boundaries, precedence, null fallback)
- `livos/packages/ui/src/routes/docker/logs/log-buffer.ts` — `pushBounded(buf, item, cap)` immutable ring-buffer + `MAX_LINES_PER_CONTAINER = 5000`
- `livos/packages/ui/src/routes/docker/logs/log-buffer.unit.test.ts` — 6 cases (append, FIFO drop, cap constant, empty, over-cap defensive, no-mutate)

**UI hook + components:**
- `livos/packages/ui/src/routes/docker/logs/use-multiplexed-logs.ts` — one WS per included container, throttled setState, 25-socket cap, env-crossing buffer clear
- `livos/packages/ui/src/routes/docker/logs/logs-sidebar.tsx` — 240px column, running containers, checkboxes, color circles, connection-state dots, Select-all/Clear footer
- `livos/packages/ui/src/routes/docker/logs/logs-viewer.tsx` — toolbar (grep + severity + live-tail + counts) + bare-bones virtualized list with color stripes + [name] prefixes
- `livos/packages/ui/src/routes/docker/logs/logs-section.tsx` — composition: Sidebar + Viewer + useMultiplexedLogs glue, local selectedNames state, env-change reset

**Backend test:**
- `livos/packages/livinityd/source/modules/docker/docker-logs-socket.unit.test.ts` — 8 cases for parseLogsParams (back-compat, envId UUID, alias, empty fallback, missing container, tail clamping, weird URL, token defense)

### Modified (5)

- `livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts` — extracted `parseLogsParams` pure helper; replaced module-scope `new Dockerode()` with per-request `await getDockerClient(envId)`; added `[env-not-found]` (1008) and `[agent-not-implemented]` (1011) error paths.
- `livos/packages/ui/src/routes/docker/sections/logs.tsx` — replaced placeholder body with 1-line re-export `export {LogsSection as Logs} from '../logs/logs-section'`.
- `.gitignore` — added negation `!livos/packages/ui/src/routes/docker/logs/**` (Rule 3 auto-fix; the global `logs/` rule meant for runtime log dirs blocked the entire Phase 28 surface).
- `livos/.gitignore` — same negation, scoped to that subdir.
- `livos/packages/ui/.gitignore` — same negation, scoped to UI package.

## Decisions Made

(Captured in detail in frontmatter `key-decisions`. Key ones inline:)

1. **WS handler envId extension via per-request getDockerClient**, not module-scope. Empty/missing envId → local socket fallback. Agent envs → honest 1011 close (no silent fallback).
2. **Multiplex cap = 25 sockets**, surfaced via `truncated: boolean`. Plan called this out as the T-28-02 mitigation; chose hard cap over soft warning.
3. **Bare-bones virtualizer (~80 lines)** instead of adding react-window. ResizeObserver + rAF live-tail.
4. **NO ANSI parsing** in cross-container view. xterm in ContainerDetailSheet is the canonical drilldown for ANSI colors; cross-container view is plain text. Documented in `logs-viewer.tsx` header comment.
5. **Two-effect WS lifecycle** in `useMultiplexedLogs`: deps-driven reconcile + empty-deps unmount cleanup. Avoids React StrictMode double-invocation closing sockets the diff loop just opened.
6. **selectedNames as local component state** (NOT zustand) — conversational, like the resource-store pattern. Reset on env change.
7. **Severity classifier** uses word-boundary regex per level, ERROR-first precedence, returns null for unrecognized lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gitignore rule blocked the entire Phase 28 surface from being committed**

- **Found during:** Task 1 RED commit attempt
- **Issue:** All three gitignore files (root, `livos/`, `livos/packages/ui/`) had a `logs/` rule (intended for runtime log directories like `/logs` or `node_modules/.../logs`). Git refused to add `livos/packages/ui/src/routes/docker/logs/log-color.unit.test.ts` because the path component `logs/` matched the rule. Without a fix, the entire Phase 28 surface was un-committable.
- **Fix:** Added explicit negations in all three gitignore files for `src/routes/docker/logs/` (the SOURCE directory of the cross-container log viewer, not a runtime log dir). Patterns added: `!livos/packages/ui/src/routes/docker/logs/` + `!livos/packages/ui/src/routes/docker/logs/**` (or repo-relative equivalents). Inline comments document the reason.
- **Files modified:** `.gitignore`, `livos/.gitignore`, `livos/packages/ui/.gitignore`
- **Verification:** `git check-ignore -v` reports the negation rule applies; `git status` shows the directory as untracked (committable).
- **Committed in:** `7647e2fb` (Task 1 RED commit)

**2. [Test mistake — not a deviation, but worth noting] Two test cases in `log-severity.unit.test.ts` initially had impossible expectations**

- **Found during:** Task 1 GREEN run
- **Issue:** Test D asserted `'verbose only no debug keyword' → null`, but the line CONTAINS the word `debug` (correctly classified as DEBUG). Test F asserted `'serror: not a real error keyword' → null`, but the line ends with `error keyword` where `error` is bounded by spaces (correctly classified as ERROR).
- **Fix:** Replaced the mistaken cases with correct ones — test D now uses `'verbose only message here'` (no severity keyword); test F now uses `'this is serror only'` (where `error` is glued INSIDE `serror` and should NOT match the word-boundary regex).
- **Files modified:** `livos/packages/ui/src/routes/docker/logs/log-severity.unit.test.ts`
- **Verification:** All 18 helper unit tests pass.
- **Committed in:** `69fd6226` (Task 1 GREEN commit, alongside source files)

This was a test-authoring mistake on my part; source behaviour was correct on first write.

---

**Total deviations:** 1 auto-fix (Rule 3 - Blocking) + 1 test-authoring fixup
**Impact on plan:** Both were necessary to unblock execution. No scope creep — the gitignore negation is the minimum necessary change to allow the Phase 28 source dir to be committable; the test fixup corrected my own mistake.

## Issues Encountered

None during planned work. The gitignore + test-mistake fixups are documented above.

## Self-Check: PASSED

**Files on disk (11 created, 5 modified — all confirmed present):**

- [x] `livos/packages/ui/src/routes/docker/logs/log-color.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/log-color.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/log-severity.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/log-severity.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/log-buffer.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/log-buffer.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/use-multiplexed-logs.ts`
- [x] `livos/packages/ui/src/routes/docker/logs/logs-sidebar.tsx`
- [x] `livos/packages/ui/src/routes/docker/logs/logs-viewer.tsx`
- [x] `livos/packages/ui/src/routes/docker/logs/logs-section.tsx`
- [x] `livos/packages/livinityd/source/modules/docker/docker-logs-socket.unit.test.ts`
- [x] `livos/packages/livinityd/source/modules/docker/docker-logs-socket.ts` (modified)
- [x] `livos/packages/ui/src/routes/docker/sections/logs.tsx` (modified — 1-line re-export)
- [x] `.gitignore` (modified)
- [x] `livos/.gitignore` (modified)
- [x] `livos/packages/ui/.gitignore` (modified)

**Commits in git log (verified via `git log --oneline -8`):**

- [x] `7647e2fb` test(28-01): add failing tests for log-color + log-severity + log-buffer
- [x] `69fd6226` feat(28-01): implement log-color + log-severity + log-buffer helpers
- [x] `e392730b` test(28-01): add failing parseLogsParams unit tests
- [x] `76c023a1` feat(28-01): make docker-logs-socket env-aware via getDockerClient
- [x] `b1cbd722` feat(28-01): cross-container Logs section — multiplexed WS + grep + severity + live-tail (DOC-13)

**Tests passing:**

- [x] UI vitest: 18/18 in `src/routes/docker/logs/` (5 color + 7 severity + 6 buffer)
- [x] livinityd vitest: 8/8 parseLogsParams cases
- [x] No new typecheck errors (`pnpm --filter ui typecheck`, `pnpm --filter livinityd typecheck`)

**Build green:**

- [x] `pnpm --filter @livos/config build` — green
- [x] `pnpm --filter ui build` — green (vite + workbox PWA SW generated)

**Placeholder gone:**

- [x] `grep -r "Coming in Phase 28 — Cross-container" livos/packages/ui/src` returns empty

## TDD Gate Compliance

- Task 1: RED commit `7647e2fb` (test) → GREEN commit `69fd6226` (feat). Sequence verified.
- Task 2: RED commit `e392730b` (test) → GREEN commit `76c023a1` (feat). Sequence verified.
- Task 3: Single feat commit `b1cbd722` per plan `<action>` block (React glue files; testable logic lives in Task 1+2 helpers — Plan 24-02 D-12 / 25-01 / 26-01 precedent for layout-files-as-smoke-test).

## Phase 28-02 Readiness

Plan 28-02 (Activity Timeline) reuses these patterns established here:

- `colorForContainer` deterministic hash → can color-stripe activity rows by source (docker / scheduler / ai) too, OR by container for docker-source events.
- `pushBounded(buf, item, cap)` ring-buffer helper for the activity event list.
- `useMultiplexedLogs`'s WS lifecycle pattern (deps-driven reconcile + empty-deps unmount cleanup, throttled setState) carries forward to the dockerEvents subscription Plan 28-02 will use.
- `classifySeverity` is reusable for Activity Timeline severity badges (info / warn / error chip filters mentioned in CONTEXT.md decisions.activity-timeline).

No blockers identified. Plan 28-02 can start immediately.

## Next Phase Readiness

Phase 28 Plan 28-02 (Activity Timeline) is unblocked. Phase 29 (DOC-15 cross-container shell) inherits the multiplex-WS pattern from this plan; the WS handler's envId extension is also available for the Phase 29 exec handler (Plan 29 may need to apply the same getDockerClient(envId) refactor to docker-exec-socket.ts — flagging here for that planner).

---

*Phase: 28-cross-container-logs-activity*
*Completed: 2026-04-25*
