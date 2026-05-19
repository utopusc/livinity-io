---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 01
subsystem: testing
tags: [test-scaffold, vitest, source-text-invariants, d-no-new-deps]

# Dependency graph
requires:
  - phase: 101-09
    provides: webapp-floating-action-bar.test.tsx source-text invariant precedent (D-NO-NEW-DEPS, readFileSync pattern, no @testing-library/react)
provides:
  - 7 stub vitest suites anchoring Phase 159 source-text invariants across Workstreams A/B/C
  - Wave 1+ implementation plans can append `expect(SRC).toMatch(...)` without re-scaffolding test files
  - Pattern documented for "target-file-not-yet-existing" stubs via `existsSync` (Plans 03, 06, 08 will fill)
affects:
  - 159-02 (window-manager registry: closeHandler invariants land in window-manager.test.tsx)
  - 159-03 (native-app-idle-reaper creation: REAL-timer unit tests land in native-app-idle-reaper.test.ts)
  - 159-04 (native-app-stream-window close-handler migration: invariants land in native-app-stream-window.test.tsx)
  - 159-06 (use-native-app-agent hook creation: invariants land in use-native-app-agent.test.ts)
  - 159-07 (window-chrome wiring: invariants land in window-chrome.test.tsx)
  - 159-08 (windows-manager-panel + top-bar mount: invariants land in both .test.tsx files)

# Tech tracking
tech-stack:
  added: []  # D-NO-NEW-DEPS preserved — no new dev/runtime deps
  patterns:
    - "Stub-first test scaffolding: pre-create test files with trivial assertions so implementation plans only append real invariants"
    - "Forward-reference stubs: when target file does not yet exist (created by downstream plan), use existsSync + path-typeof assertion as placeholder"

key-files:
  created:
    - livos/packages/ui/src/modules/window/window-chrome.test.tsx
    - livos/packages/ui/src/hooks/use-native-app-agent.test.ts
    - livos/packages/ui/src/providers/window-manager.test.tsx
    - livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx
    - livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.test.ts
    - livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx
    - livos/packages/ui/src/modules/desktop/top-bar.test.tsx
  modified: []

key-decisions:
  - "Used npx vitest run with explicit file paths instead of pnpm filter test:run because the latter ignores positional filter args and runs the full suite"
  - "For not-yet-existing targets (use-native-app-agent.ts, native-app-idle-reaper.ts, windows-manager-panel.tsx) the stub asserts typeof PATH === 'string' rather than readFileSync, so the test stays green until the downstream plan creates the target"

patterns-established:
  - "Phase 159 stub header: `// Phase 159 — {target} source-text invariants (Workstream X).` + `Wave 0 stub. Real invariants land in Plan NN (...)` comment block, mirroring the 101-09 precedent"
  - "All stubs use `describe('{target} — Phase 159 stub', ...)` so downstream plans can append `describe('{target} — Phase 159 {pillar}', ...)` blocks without colliding"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-05-19
---

# Phase 159 Plan 01: Test Scaffold Stubs Summary

**7 stub vitest suites pre-created across UI + livinityd packages, each ready to receive source-text invariants in Wave 1-3 implementation plans without further scaffold work.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-19T00:54Z (approx)
- **Completed:** 2026-05-19T01:00Z (approx)
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 0

## Accomplishments
- 7 stub test files created at exact paths declared in `files_modified` frontmatter
- All 7 stubs pass under vitest (6 in `@livos/ui`, 1 in `@livos/livinityd`)
- D-NO-NEW-DEPS preserved — zero new dependencies, no `@testing-library/react` introduced
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged across all 3 commits
- Stub header convention codified so downstream plans (02-08) only need to append `expect(SRC).toMatch(...)` lines

## Task Commits

Each task was committed atomically:

1. **Task 1: Workstream A test stubs (window-chrome + use-native-app-agent)** — `b8b93526` (chore)
2. **Task 2: Workstream B test stubs (window-manager + native-app-stream-window + native-app-idle-reaper)** — `440cde11` (chore)
3. **Task 3: Workstream C test stubs (windows-manager-panel + top-bar)** — `18c9e55a` (chore)

**Plan metadata:** (final commit — docs: SUMMARY.md) — pending

## Files Created/Modified

### Workstream A (Task 1)
- `livos/packages/ui/src/modules/window/window-chrome.test.tsx` — `readFileSync` stub; Plan 07 fills with chrome wiring invariants
- `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` — `existsSync` stub (target file does not exist yet); Plan 06 creates target + appends invariants

### Workstream B (Task 2)
- `livos/packages/ui/src/providers/window-manager.test.tsx` — `readFileSync` stub; Plan 02 fills with registerCloseHandler / 2s Promise.race timeout invariants
- `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx` — `readFileSync` stub; Plan 04 fills with close-handler migration invariants
- `livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.test.ts` — `existsSync` stub (target file does not exist yet); Plan 03 creates target + appends timer-mocked unit tests

### Workstream C (Task 3)
- `livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx` — `existsSync` stub (target file does not exist yet); Plan 08 C1 creates target + appends panel invariants
- `livos/packages/ui/src/modules/desktop/top-bar.test.tsx` — `readFileSync` stub; Plan 08 C2 fills with WindowsManagerPanel mount invariants

## Verification

```
$ npx vitest run \
    src/modules/window/window-chrome.test.tsx \
    src/hooks/use-native-app-agent.test.ts \
    src/providers/window-manager.test.tsx \
    src/modules/window/app-contents/native-app-stream-window.test.tsx \
    src/modules/desktop/windows-manager-panel.test.tsx \
    src/modules/desktop/top-bar.test.tsx
# Test Files  6 passed (6)
# Tests       6 passed (6)

$ npx vitest run source/modules/apps/native-app-idle-reaper.test.ts
# Test Files  1 passed (1)
# Tests       1 passed (1)

$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
# f3538e1d811992b782a9bb057d1b7f0a0189f95f  ← sacred SHA intact
```

## Decisions Made
- **Stub style for forward-referenced targets:** Files where target source does not yet exist (Plans 03, 06, 08 create them) use `existsSync` + `typeof PATH === 'string'` so the stub stays trivially green. Once the downstream plan adds the target source file, that plan's task swaps the assertion block for real `expect(SRC).toMatch(...)` invariants.
- **No `@testing-library/react`:** Followed D-NO-NEW-DEPS precedent from `webapp-floating-action-bar.test.tsx` — every stub uses only `node:fs` + `vitest`, zero React rendering deps.
- **`@vitest-environment jsdom` directive even on stubs that do not yet use DOM:** Matches the canonical precedent so Plans 02/04/07/08 can append DOM-leaning assertions without re-editing the directive.

## Deviations from Plan

None - plan executed exactly as written. All 3 tasks completed using the exact file contents specified in the plan's `<action>` blocks. No bug fixes, no architectural questions, no missing-critical additions.

## Issues Encountered

**1. `pnpm --filter ui test -- --run <filter>` ignored positional filter and ran full suite**
- **Symptom:** First verification attempts using the plan's documented `pnpm --filter ui test -- --run <filename>` command appeared to exit silently with code 0 (no test script named `test`, only `test:run`). When switched to `test:run`, vitest ignored the positional filter and ran 70 test files (including 12 pre-existing failures in `routes/docker/*.unit.test.ts` due to `localStorage is not defined` in non-jsdom env).
- **Resolution:** Verified each task's stubs via `npx vitest run <exact-path>` from inside the package dir. All 7 stubs confirmed green in isolation.
- **Out-of-scope items deferred:** 12 pre-existing test failures in `src/routes/docker/**/*.unit.test.ts` (and `feature-tile.unit.test.tsx` etc.) are unrelated to Phase 159 — they exist on master before this plan's commits and stem from missing `@vitest-environment jsdom` directives in those tests. Not in scope for Plan 159-01; flagged for future cleanup but NOT auto-fixed per scope-boundary rule.

## Next Phase Readiness
- Plan 02 (Workstream B1 registry) can begin immediately — `window-manager.test.tsx` ready to receive `registerCloseHandler` / `closeWindow` / `Promise.race` invariants
- Plan 03 (B4 reaper creation) can begin immediately — `native-app-idle-reaper.test.ts` stub holds the slot; once Plan 03 creates `native-app-idle-reaper.ts`, the stub swaps to real timer-mocked unit tests
- Plan 06 / 07 / 08 (Workstream A hook + chrome + Workstream C panel/mount) ready in same pattern
- No blockers

## Self-Check: PASSED

- File `livos/packages/ui/src/modules/window/window-chrome.test.tsx` exists
- File `livos/packages/ui/src/hooks/use-native-app-agent.test.ts` exists
- File `livos/packages/ui/src/providers/window-manager.test.tsx` exists
- File `livos/packages/ui/src/modules/window/app-contents/native-app-stream-window.test.tsx` exists
- File `livos/packages/livinityd/source/modules/apps/native-app-idle-reaper.test.ts` exists
- File `livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx` exists
- File `livos/packages/ui/src/modules/desktop/top-bar.test.tsx` exists
- Commit `b8b93526` present (Task 1)
- Commit `440cde11` present (Task 2)
- Commit `18c9e55a` present (Task 3)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` unchanged

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Completed: 2026-05-19*
