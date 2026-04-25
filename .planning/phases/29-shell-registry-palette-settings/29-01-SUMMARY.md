---
phase: 29
plan: 01
subsystem: ui+livinityd
tags: [docker-app, shell, exec, websocket, xterm, cmd-k, palette, command-palette, env-aware-ws, doc-15, doc-18, tdd]
requires:
  - phase: 17
    provides: /ws/docker-exec WS handler + ContainerDetailSheet ConsoleTab xterm pattern
  - phase: 22
    provides: getDockerClient(envId) factory + LOCAL_ENV_ID alias
  - phase: 24
    provides: DockerApp tree, sectional store, SearchButton placeholder, sections/shell.tsx placeholder
  - phase: 26
    provides: useDockerResource (5 selected slots) — palette result navigation
  - phase: 28
    provides: parseLogsParams pattern + envId extension precedent for sockets + colorForContainer
provides:
  - shell-section-multi-tab-xterm
  - env-aware-/ws/docker-exec-handler
  - parseExecParams-pure-helper
  - useExecTabs-hook
  - cmd-k-command-palette
  - usePaletteStore-global-open-close
  - useCmdK-keyboard-shortcut-listener
  - useRecentSearches-localstorage-ringbuffer
  - buildPaletteResults-pure-helper
affects:
  - routes/docker/sections/shell.tsx
  - routes/docker/shell/
  - routes/docker/palette/
  - routes/docker/search-button.tsx
  - routes/docker/docker-app.tsx
  - modules/docker/docker-exec-socket.ts
  - phase-29-02 (Registry + Settings — adds Settings section + registry credentials, builds on env-aware backend pattern)
tech-stack:
  added: []
  patterns:
    - "Pure helper extraction for testability (parseExecParams, pushRecent, loadRecent, buildPaletteResults) — keeps WS handler / React hook a thin shell"
    - "TDD RED→GREEN gate enforcement: 4 RED commits (test) → 4 GREEN commits (feat) for the testable surface; 2 single-feat commits for layout/glue files (Plan 24-02 D-12 / Plan 28-01 Task 3 precedent for layout-files-as-smoke-test)"
    - "Multi-tab xterm with display:none over unmount — preserves WebSocket + Terminal state across active-tab switches; cleanup runs only on TRUE removal of the tab"
    - "Cross-env tab persistence (D-06): tabs capture envId at creation; survive global env switches; explicit user action (click X) to tear down"
    - "WS handler env-aware via per-request getDockerClient(envId) — back-compat preserved by treating null/empty envId as local socket; mirrors Plan 28-01 docker-logs-socket.ts EXACTLY"
    - "Pure-helper-as-fixture for hooks: loadRecent + pushRecent exported alongside useRecentSearches → tests hit pure helpers (no @testing-library/react dependency)"
    - "Global zustand store for cross-component modal control (usePaletteStore) — cmd+k AND StatusBar Search button both call openPalette()"
    - "buildPaletteResults scoring: lowercase indexOf as score (0=prefix, >0=mid-substring, -1=miss); sort ascending; tie-break alpha-asc; cap 8 per category"
    - "T-29-01 ReDoS bound: query.slice(0,200) + CommandInput maxLength=200 — defensive bound on per-keystroke render cost"
    - "Result-click ordering: addRecent → closePalette → setSelected* + setSection. Modal animation starts before navigation; React 18 batches store mutations into single render — no flicker"
key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/docker-exec-socket.unit.test.ts
    - livos/packages/ui/src/routes/docker/shell/use-exec-tabs.ts
    - livos/packages/ui/src/routes/docker/shell/use-exec-tabs.unit.test.ts
    - livos/packages/ui/src/routes/docker/shell/exec-tab-pane.tsx
    - livos/packages/ui/src/routes/docker/shell/shell-sidebar.tsx
    - livos/packages/ui/src/routes/docker/shell/shell-section.tsx
    - livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts
    - livos/packages/ui/src/routes/docker/palette/use-recent-searches.unit.test.ts
    - livos/packages/ui/src/routes/docker/palette/palette-results.ts
    - livos/packages/ui/src/routes/docker/palette/palette-results.unit.test.ts
    - livos/packages/ui/src/routes/docker/palette/use-cmd-k.ts
    - livos/packages/ui/src/routes/docker/palette/use-palette-store.ts
    - livos/packages/ui/src/routes/docker/palette/command-palette.tsx
  modified:
    - livos/packages/livinityd/source/modules/docker/docker-exec-socket.ts
    - livos/packages/ui/src/routes/docker/sections/shell.tsx
    - livos/packages/ui/src/routes/docker/search-button.tsx
    - livos/packages/ui/src/routes/docker/docker-app.tsx
key-decisions:
  - "WS handler envId extension via per-request getDockerClient (mirror Plan 28-01 pattern verbatim). null/empty envId → local socket fallback so Phase 17 ContainerDetailSheet ConsoleTab keeps working byte-for-byte unchanged. Agent envs → 1011 'Agent envs not yet supported for exec' (honest failure beats silent fallback)."
  - "Token query param NOT surfaced through parseExecParams. JWT consumed by WS upgrade authn before handler runs; surfacing it through the parser would create a place where the secret could leak into a logger. Test H pins the boundary."
  - "Multi-tab xterm uses display:none over unmount. ExecTabPane mounts Terminal + WebSocket once on first show; cleanup only runs on TRUE tab removal (parent calls closeTab). isActive prop toggles wrapper visibility but does NOT re-run the mount effect (deps array empty). Active-tab switches preserve session state."
  - "Cross-env tabs (D-06): tabEnvMap (module-scope Map keyed by tab.id) captures the envId at creation. When global env changes, sidebar refreshes but old tabs continue with their original envId. Explicit user X-click required to tear down. Avoids accidental session loss on env-switch."
  - "Tab id generation: monotonic counter `${++_nextId}-${Date.now()}` guarantees uniqueness across rapid double-clicks (50 calls in <1ms still yield 50 distinct ids; Date.now() alone collides at sub-ms resolution)."
  - "useExecTabs.closeTab fallback: rightward when possible (next tab at same idx), leftward at end (last tab in list), null on empty. Test D pins the contract."
  - "Palette result-click ordering: addRecent(query) FIRST → closePalette() → setSelectedX + setSection. Modal animation starts before navigation triggers re-render. React 18 batches the store mutations. Anti-flicker pattern."
  - "Recent searches store the QUERY the user typed, NOT the result label they selected. Matches mental model ('I just searched for foo') over alternative ('I just opened the foo container'). 8-item LRU cap, dedupe-on-add, persisted to localStorage 'livos:docker:palette:recent'."
  - "Palette categories: containers / stacks / images / volumes / networks / environments / sections. The plan's 'Recent Events' category from CONTEXT.md was deferred — mapping events to clickable navigation requires Phase 28-02 Activity event ids which aren't first-class navigation targets in v28.0. Sections category covers section navigation; events would be a v29.0+ enhancement."
  - "buildPaletteResults sections category is a constant set built from SECTION_IDS at module-scope; matches against label only. Test G pins 'set' → 'settings' as a sanity check that section navigation is searchable."
  - "Pure-helper-as-fixture for useRecentSearches: KEY/MAX/loadRecent/pushRecent all exported. Tests hit the pure helpers — no @testing-library/react dependency required (this UI package doesn't ship that lib). Plan 28-01 log-buffer + parseLogsParams set the same precedent."
  - "Tests count uplift (16 vs 14 planned): added defensive A2 (loadRecent on invalid JSON) for use-recent-searches AND B2 (prefix-vs-mid-substring scoring) for buildPaletteResults. Both natural strengthenings of the contract; not deviations, just slightly stronger TDD coverage."
patterns-established:
  - "Pure helper + thin shell pattern, applied for the 4th plan in a row (Plan 26-01 filterByQuery, Plan 27-02 stack helpers, Plan 28-01 parseLogsParams + log-buffer, Plan 29-01 parseExecParams + buildPaletteResults + use-recent-searches helpers). Reusable for any future URL-parser / data-transformer surface."
  - "WS handler envId-extension recipe (per-request getDockerClient(envId) + [env-not-found] → 1008 + [agent-not-implemented] → 1011 + null fallback for back-compat). Plan 28-01 logs-socket.ts → Plan 29-01 exec-socket.ts; available for any future v28.0+ WS handler that needs to span envs."
  - "Multi-tab session UI with display:none persistence: parent owns tab list, child components mount once and stay mounted, isActive prop toggles visibility. Reusable for any 'persistent session per tab' surface (multi-DB-shell, multi-SSH, multi-AI-agent-chat)."
  - "Global zustand modal store + ref-counted-listener-once: usePaletteStore + useCmdK pattern. Reusable for any docker-app-level modal that should be openable from multiple trigger points."
  - "Categorized search algorithm (lowercase indexOf score + alpha tie-break + per-category cap + length-bound query): buildPaletteResults reusable as a starting point for any future fuzzy-search-with-categories surface."
requirements-completed: [DOC-15, DOC-18]
threat-mitigations:
  - id: T-29-01
    status: mitigated
    note: CommandInput maxLength=200 + buildPaletteResults query.slice(0,200) before any indexOf. Per-keystroke cost bounded.
  - id: T-29-02
    status: mitigated
    note: envId comes from useEnvironmentStore (server-validated env list); UUID format reaches getDockerClient which throws [env-not-found] on invalid input → 1008 close. No raw user input flows in.
  - id: T-29-03
    status: mitigated
    note: ws.close(1011, 'Agent envs not yet supported for exec') — explicit denial; no silent fallback to local socket. Test C pins envId='local' alias preservation; integration with getDockerClient enforces the agent-env rejection.
  - id: T-29-04
    status: accepted
    note: docker.getContainer(name).exec() throws on missing container → 1011 stream-error close. Same trust model as Phase 17 ConsoleTab.
  - id: T-29-05
    status: accepted
    note: No audit log on read-write exec stream — same decision as Phase 17 QW-01.
  - id: T-29-06
    status: accepted
    note: Recent searches stored on the same browser's localStorage where they originated. Same-user scope; no escalation.
  - id: T-29-07
    status: accepted
    note: User must click each tab open; no programmatic mass-open vector. 25-50 tabs would degrade browser perf but not a security boundary.
  - id: T-29-08
    status: accepted
    note: Palette searches resources in the SELECTED env only (env-aware hooks: useContainers, useImages, useStacks, useVolumes, useNetworks). Switching env requires conscious action via EnvironmentSelector or palette result. No cross-env bleed.
  - id: T-29-09
    status: accepted
    note: localStorage tampering achieves nothing — clicking a recent search just sets the query input; no code execution path.
metrics:
  duration_minutes: 10
  tasks_completed: 3
  tasks_total: 3
  red_green_commits: 6
  feature_commits: 2
  total_commits: 8
  files_created: 13
  files_modified: 4
  vitest_added: 25
completed: 2026-04-25
---

# Phase 29 Plan 01: Shell + cmd+k Palette Summary

**One-liner:** Live `/docker/shell` section replaces the Phase 24 placeholder — a 240px sidebar of running containers in the selected env opens new exec-terminal tabs in the main pane (multi-tab xterm with display:none persistence so switching tabs preserves session state). The exec WS handler is now env-aware (`getDockerClient(envId)` mirroring Plan 28-01 logs handler). cmd+k command palette searches across containers / stacks / images / volumes / networks / environments / sections; result-click navigates via `useDockerResource` + `useDockerStore`. StatusBar Search button opens the same palette. DOC-15 + DOC-18 closed.

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-25T23:19:32Z
- **Completed:** 2026-04-25T23:29:36Z
- **Tasks:** 3 (Tasks 1+2 each TDD-split into RED+GREEN+single feat; Task 3 split into RED+GREEN helpers + single feat for modal/wiring)
- **Files created:** 13
- **Files modified:** 4
- **Total commits:** 8 task commits

## Accomplishments

1. **DOC-15 closed.** Live Shell section with multi-tab xterm sessions wired to the env-aware `/ws/docker-exec`. Phase 24 placeholder string `Coming in Phase 29 — Cross-container exec terminal` is gone from the codebase.
2. **DOC-18 closed.** cmd+k / ctrl+k command palette searches all 7 categories (containers / stacks / images / volumes / networks / environments / sections) and navigates correctly via `useDockerResource` + `useDockerStore`. StatusBar Search button (Phase 24-02 placeholder) opens the same palette; placeholder `Coming in Phase 29 — DOC-18` string gone.
3. **Backend extension shipped.** `docker-exec-socket.ts` is now env-aware. Per-request `await getDockerClient(envId)` replaces the module-scope `new Dockerode()` singleton. `[env-not-found]` → 1008, `[agent-not-implemented]` → 1011, anything else propagates. **Back-compat preserved**: empty/missing `envId=` falls through to local socket so Phase 17 ContainerDetailSheet ConsoleTab continues to work without UI changes.
4. **Multi-tab session lifecycle.** Each `ExecTabPane` owns one Terminal + one WebSocket; mounts on first show; `isActive` toggles `display:none` rather than unmount. Active-tab switches preserve each session's xterm state. Cleanup runs only on TRUE tab removal (parent calls `closeTab`).
5. **Cross-env tab persistence (D-06).** `tabEnvMap` (module-scope Map) captures `envId` at tab creation. When the global env changes, the sidebar refreshes to the new env's containers but already-open tabs continue running with their original env. Explicit user action (click X) is required to tear down. Avoids accidental session loss on env-switch.
6. **5 pure helper modules** with **25 unit tests** (10 + 7 + 8 + 8 — note the plan called for ≥24 tests, the helpers picked up 25 across stronger contracts):
   - `parseExecParams` (livinityd, 10 cases): back-compat, envId UUID, alias 'local', empty envId fallback, missing container, default shell, parser/handler validation boundary, token defense, weird URLs, user param.
   - `useExecTabs` (UI, 7 cases): initial empty, addTab returns id + activates, no dedupe on duplicate names, closeTab rightward-fallback / null on empty, activateTab, no-op on non-existent, unique ids on rapid adds.
   - `useRecentSearches` helpers (UI, 8 cases): empty load, defensive invalid JSON, push, dedupe, cap-at-8, empty-input no-op, trim-on-push, MAX constant.
   - `buildPaletteResults` (UI, 8 cases): empty query (all categories), substring filter, prefix-vs-mid scoring, query-length cap (T-29-01), empty results, no cross-category dedupe, per-category max 8, section-id matching.
7. **TDD gate compliance.** 4 RED commits → 4 GREEN commits → 2 layout/glue feat commits. Task 1 RED→GREEN, Task 2 RED→GREEN (helper) → single feat (components), Task 3 RED→GREEN (helpers) → single feat (modal+wiring).
8. **Pattern carry-forward.** The pure-helper-as-fixture pattern for hooks (Plan 28-01 log-buffer + parseLogsParams) and the WS handler envId-extension recipe (Plan 28-01 docker-logs-socket.ts → Plan 29-01 docker-exec-socket.ts) are now established conventions. Plan 29-02 will reuse the AES-256-GCM-with-JWT-key pattern from Phase 21 git-credentials for registry credentials.

## Task Commits

1. **Task 1 RED:** failing tests for parseExecParams + envId-aware exec handler — `bdec2373` (test)
2. **Task 1 GREEN:** make docker-exec-socket env-aware via getDockerClient — `d29fd9cd` (feat)
3. **Task 2 RED:** failing tests for useExecTabs — `51022425` (test)
4. **Task 2 GREEN (hook):** useExecTabs hook for multi-tab session state — `127aa734` (feat)
5. **Task 2 (components):** live Shell section with multi-tab xterm sessions (DOC-15) — `2b3a42af` (feat)
6. **Task 3 RED:** failing tests for use-recent-searches + buildPaletteResults — `6949a23b` (test)
7. **Task 3 GREEN (helpers):** use-recent-searches + buildPaletteResults pure helpers — `51e34d24` (feat)
8. **Task 3 (modal + wiring):** cmd+k command palette + StatusBar Search button wiring (DOC-18) — `90bb6d26` (feat)

(Phase metadata commit follows this SUMMARY.)

## Files Created/Modified

### Created (13)

**Backend (1):**

- `livos/packages/livinityd/source/modules/docker/docker-exec-socket.unit.test.ts` — 10 cases for `parseExecParams`.

**UI shell/ surface (5):**

- `livos/packages/ui/src/routes/docker/shell/use-exec-tabs.ts` — zustand store; `addTab` returns new id, `closeTab` rightward-fallback, monotonic counter for unique tab ids.
- `livos/packages/ui/src/routes/docker/shell/use-exec-tabs.unit.test.ts` — 7 cases for the multi-tab state machine.
- `livos/packages/ui/src/routes/docker/shell/exec-tab-pane.tsx` — single-tab xterm + WS; lifted from container-detail-sheet.tsx ConsoleTab with envId added to URL params; isActive prop drives display:none.
- `livos/packages/ui/src/routes/docker/shell/shell-sidebar.tsx` — 240px column of running containers in selected env; click → `onSelect(name)` → parent's `addTab`.
- `livos/packages/ui/src/routes/docker/shell/shell-section.tsx` — composition (sidebar + tab bar + tab panes); empty state when no tabs; tabEnvMap module-scope Map captures envId at tab creation (D-06).

**UI palette/ surface (7):**

- `livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts` — `KEY` + `MAX` exports + `loadRecent` + `pushRecent` pure helpers + `useRecentSearches` hook wrapper.
- `livos/packages/ui/src/routes/docker/palette/use-recent-searches.unit.test.ts` — 8 cases.
- `livos/packages/ui/src/routes/docker/palette/palette-results.ts` — `buildPaletteResults({query, ...resources})` → `CategorizedResults`. Lowercase indexOf scoring, alpha tie-break, max 8 per category, query length cap at 200.
- `livos/packages/ui/src/routes/docker/palette/palette-results.unit.test.ts` — 8 cases.
- `livos/packages/ui/src/routes/docker/palette/use-palette-store.ts` — global zustand `{open, openPalette, closePalette, setOpen}` store. NO persist (open-state is conversational).
- `livos/packages/ui/src/routes/docker/palette/use-cmd-k.ts` — global document keydown listener (cmd+k mac / ctrl+k win/linux). Filters out shift/alt modifiers.
- `livos/packages/ui/src/routes/docker/palette/command-palette.tsx` — shadcn CommandDialog wrapping cmdk@0.2.0. Categorized result groups + recent searches header on empty query + section navigation + result-click ordering (addRecent → closePalette → setSelected* + setSection).

### Modified (4)

- `livos/packages/livinityd/source/modules/docker/docker-exec-socket.ts` — extracted `parseExecParams` pure helper; replaced module-scope `new Dockerode()` with per-request `await getDockerClient(envId)`; added `[env-not-found]` (1008) and `[agent-not-implemented]` (1011) error paths; envId logged in the exec session line.
- `livos/packages/ui/src/routes/docker/sections/shell.tsx` — replaced placeholder body with 1-line re-export `export {ShellSection as Shell} from '../shell/shell-section'`.
- `livos/packages/ui/src/routes/docker/search-button.tsx` — replaced placeholder body (local useState + Coming-in-Phase-29 Dialog) with single button onClick → `usePaletteStore.openPalette()`.
- `livos/packages/ui/src/routes/docker/docker-app.tsx` — added `useCmdK()` call at the top of DockerApp body + `<CommandPalette />` mounted as last child of root div.

## Decisions Made

(Captured in detail in frontmatter `key-decisions`. Key ones inline:)

1. **WS handler envId via per-request `getDockerClient(envId)`** (mirror Plan 28-01 EXACTLY). null/empty envId → local socket fallback. Agent envs → honest 1011 close. Phase 17 ConsoleTab back-compat preserved without UI changes.
2. **Multi-tab xterm with display:none over unmount.** Switching tabs preserves session state; cleanup only on TRUE removal.
3. **Cross-env tabs survive global env switches** (D-06). tabEnvMap captures envId at creation. Explicit user action to tear down.
4. **Tab id uniqueness via module-counter + Date.now()** — survives rapid double-clicks (50 in <1ms = 50 distinct ids).
5. **Result-click ordering** anti-flicker: addRecent → closePalette → setSelectedX + setSection.
6. **Recent searches store the QUERY**, not the result label. Mental model: "I just searched for foo".
7. **Categories axis primary**: a name shared across containers + stacks appears in both groups (no cross-category dedupe).
8. **Pure-helper-as-fixture for hooks** keeps tests dependency-free (no @testing-library/react needed).

## Deviations from Plan

### Test count uplift (not deviations — strengthened contracts)

**1. [Strengthening] use-recent-searches gained one defensive case (8 vs 7 planned)**

- **Found during:** Task 3 GREEN authoring
- **What:** Added test A2 — `loadRecent on invalid JSON returns []` (defensive against tampered localStorage). The hook already had try/catch in the original spec; the test pins it.
- **Files:** `palette/use-recent-searches.unit.test.ts`
- **Impact:** Strengthens the contract; no behavioral change.

**2. [Strengthening] palette-results gained one prefix-scoring case (8 vs 7 planned)**

- **Found during:** Task 3 GREEN authoring
- **What:** Added test B2 — explicit prefix-vs-mid-substring ordering check (`'web'`, `'webapp'` before `'midweb'`). Test B asserts substring match correctness; B2 pins the score-ordering boundary so future refactors don't accidentally swap to fuzzy-rank scoring.
- **Files:** `palette/palette-results.unit.test.ts`
- **Impact:** Strengthens the contract.

**3. [Scope-bound] CONTEXT.md mentioned "Recent Events" as a palette category — deferred**

- **Found during:** Task 3 design
- **Why:** Mapping events to clickable navigation requires Phase 28-02 Activity event ids which aren't first-class navigation targets in v28.0 (an event isn't a *thing* you can deep-link to; it's a record of a state change). The seven categories shipped (containers, stacks, images, volumes, networks, environments, sections) cover all v28.0 navigable resources; events would be a v29.0+ enhancement.
- **Action:** Documented in DEFERRED below; not blocking DOC-18 closure (CONTEXT.md decisions list says "Recent Events" as ONE of many candidate categories; the must-haves only require the 5 resource types + envs + sections).

**Total deviations:** 0 plan deviations. 2 contract strengthenings (test cases) + 1 scope-bound deferral documented.
**Impact on plan:** None. The 25 tests committed exceed the 24+ baseline implied by the plan; the strengthenings are pure adds. The deferred "Recent Events" is captured in DEFERRED.

## Issues Encountered

None during planned work. Two minor authoring observations:

1. The plan's example types for buildPaletteResults input had `tags?: string[]` for images; the actual hook (`useImages()`) returns `{repoTags?: readonly string[]}` so I used `repoTags` matching the production shape. No deviation — just matching the actual interface.
2. `@testing-library/react` is NOT a dep in `livos/packages/ui` (verified via `grep` and `ls node_modules/@testing-library` returned 0 results). Switched to the pure-helper-as-fixture pattern (already documented in the plan's anti-pitfall section). All 25 tests run without it.

## DEFERRED to v29.0+

- **Browser-level URL routing** (`/docker/containers/n8n` literal URL — programmatic API closed by Phase 26 + final copy-deep-link button planned for Plan 29-02 per CONTEXT.md). Window-app pattern incompatible with React Router for /docker.
- **Palette saved-query presets** (out of scope per CONTEXT.md deferred-ideas).
- **"Recent Events" palette category** — see deviation #3 above. Events aren't first-class navigation targets in v28.0.
- **"Clear recent searches" button** — Plan 29-02 may add this in Settings.
- **Palette result preview pane** — out of scope; click-to-navigate is sufficient v1.
- **Multi-shell selector in Shell section** — bash-only v1; ConsoleTab in detail sheet keeps the per-shell switcher for power users.
- **Soft cap on number of open exec tabs** (T-29-07 acceptance) — Plan 29-02 settings tab could add if user research demands.

## Self-Check: PASSED

**Files on disk (13 created, 4 modified — all confirmed present):**

- [x] `livos/packages/livinityd/source/modules/docker/docker-exec-socket.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/shell/use-exec-tabs.ts`
- [x] `livos/packages/ui/src/routes/docker/shell/use-exec-tabs.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/shell/exec-tab-pane.tsx`
- [x] `livos/packages/ui/src/routes/docker/shell/shell-sidebar.tsx`
- [x] `livos/packages/ui/src/routes/docker/shell/shell-section.tsx`
- [x] `livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/use-recent-searches.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/palette-results.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/palette-results.unit.test.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/use-cmd-k.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/use-palette-store.ts`
- [x] `livos/packages/ui/src/routes/docker/palette/command-palette.tsx`
- [x] `livos/packages/livinityd/source/modules/docker/docker-exec-socket.ts` (modified)
- [x] `livos/packages/ui/src/routes/docker/sections/shell.tsx` (modified — 1-line re-export)
- [x] `livos/packages/ui/src/routes/docker/search-button.tsx` (modified)
- [x] `livos/packages/ui/src/routes/docker/docker-app.tsx` (modified)

**Commits in git log (verified via `git log --oneline -10`):**

- [x] `bdec2373` test(29-01): add failing tests for parseExecParams + envId-aware exec handler
- [x] `d29fd9cd` feat(29-01): make docker-exec-socket env-aware via getDockerClient
- [x] `51022425` test(29-01): add failing tests for useExecTabs
- [x] `127aa734` feat(29-01): useExecTabs hook for multi-tab session state
- [x] `2b3a42af` feat(29-01): live Shell section with multi-tab xterm sessions (DOC-15)
- [x] `6949a23b` test(29-01): add failing tests for use-recent-searches + buildPaletteResults
- [x] `51e34d24` feat(29-01): use-recent-searches + buildPaletteResults pure helpers
- [x] `90bb6d26` feat(29-01): cmd+k command palette + StatusBar Search button wiring (DOC-18)

**Tests passing:**

- [x] livinityd vitest: 18/18 (10 new parseExecParams + 8 existing parseLogsParams)
- [x] UI vitest: 23/23 across `src/routes/docker/{shell,palette}/` (7 useExecTabs + 8 use-recent-searches + 8 buildPaletteResults)

**Build green:**

- [x] `pnpm --filter @livos/config build` — green
- [x] `pnpm --filter ui build` — green (vite + workbox PWA SW generated)

**Placeholders gone:**

- [x] `grep -r "Coming in Phase 29 — Cross-container exec terminal" livos/packages/ui/src` returns empty
- [x] `grep -r "Coming in Phase 29 — DOC-18" livos/packages/ui/src` returns empty

**Back-compat smoke (paper-verified, not runtime):**

- ContainerDetailSheet ConsoleTab still calls `new URLSearchParams({container, shell, token})` with NO envId. parseExecParams returns envId:null; getDockerClient(null) resolves to LOCAL_ENV_ID. Phase 17 path stays byte-for-byte unchanged.

## TDD Gate Compliance

- **Task 1:** RED commit `bdec2373` (test) → GREEN commit `d29fd9cd` (feat). Sequence verified.
- **Task 2:** RED commit `51022425` (test) → GREEN commit `127aa734` (feat) for the testable hook → single feat commit `2b3a42af` for the layout/components surface (Plan 24-02 D-12 / Plan 28-01 Task 3 precedent for layout-files-as-smoke-test).
- **Task 3:** RED commit `6949a23b` (test) → GREEN commit `51e34d24` (feat) for the testable helpers → single feat commit `90bb6d26` for the modal/wiring surface (same precedent — modal is a Radix dialog + cmdk integration; the testable boundaries are the helpers).

All 3 tasks have a RED → GREEN sequence in git log; the feature commits land AFTER their corresponding RED commits.

## Phase 29-02 Readiness

Plan 29-02 (Registry + Settings + DOC-19/20) reuses these patterns established here:

- **`getDockerClient(envId)` pattern in WS handlers** — if registry image-pull progress streams need a dedicated WS, it follows the same envId extension shape.
- **`buildPaletteResults` reusable for registry image search** — registry search results could feed into a 7th category (or an 8th once registry credentials land).
- **`usePaletteStore` is global** — Plan 29-02 may add registry-credential / settings-shortcut entries to the palette by extending the SECTION_RESULTS list or adding a registry category.
- **Pure-helper-as-fixture pattern** continues to be the testing default; recent searches "Clear" button suggested in DEFERRED would naturally extend the same export surface.
- **AES-256-GCM-with-JWT-key pattern from `git-credentials.ts` (Phase 21)** is the noted precedent for `registry_credentials` storage in Plan 29-02.

No blockers identified. Plan 29-02 can start immediately.

## Next Phase Readiness

Phase 29 final closure of v28.0:

- DOC-15 (Shell) ✓ closed by Plan 29-01.
- DOC-16 (Registry) → Plan 29-02.
- DOC-17 (Docker Settings) → Plan 29-02.
- DOC-18 (cmd+k palette) ✓ closed by Plan 29-01.
- DOC-19 (Theme persistence) — Plan 29-02 verification (already shipped Phase 24-02).
- DOC-20 (Deep-linking) — programmatic API closed Phase 26; final copy-deep-link button → Plan 29-02.

After Plan 29-02 completes: **v28.0 milestone complete** (20/20 requirements satisfied across Phases 24–29).

---

*Phase: 29-shell-registry-palette-settings*
*Completed: 2026-04-25*
