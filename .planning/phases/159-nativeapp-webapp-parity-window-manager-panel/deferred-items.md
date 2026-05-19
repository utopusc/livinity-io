# Phase 159 — Deferred Items

Out-of-scope issues found during execution. Tracked here, NOT fixed in
the phase that discovered them.

## From Plan 02 (Workstream B foundation, 2026-05-19)

### Pre-existing UI test drift (NOT caused by Plan 02 changes)

The full `pnpm --filter ui exec vitest run` shows ~23 failing tests across
11 files at Plan 02 commit time. All are PRE-EXISTING drift, not Plan 02
regressions. Confirmed by isolating each failure:

1. **`localStorage is not defined` cascade** (most failures) — multiple
   `.unit.test.ts` files (`use-recent-searches`, `use-tag-filter`,
   `sidebar-density`, `docker/store`, `use-liv-agent-stream`,
   `use-liv-tool-panel-shortcut`, `sidebar.unit.test`) lack the
   `@vitest-environment jsdom` header, so they crash before any
   assertion. Fix: add the header. Out of Plan 02 scope (no relation
   to window-manager).

2. **`webapp-stream-window.unit.test.tsx` T-10-05-11** — asserts
   `windows-container.tsx` contains literal `WebAppFloatingSkillsButton`.
   The Phase 157 round 10 refactor moved that satellite INSIDE the
   chrome row (see `window-chrome.tsx`), so the literal no longer lives
   in `windows-container.tsx`. The invariant is stale. Fix: re-target
   the assertion to `window-chrome.tsx`. Out of Plan 02 scope.

3. **`webapp-stream-window.unit.test.tsx` T-10-10-STATUS-02** — expects
   `agentStatus?.phrase` literal to appear ≥2 times in
   `webapp-floating-action-bar.tsx`. Only 1 reference exists today —
   the chat-input sub-line was consolidated. Fix: update the threshold
   to 1, or restore the second usage. Out of Plan 02 scope.

4. **Playwright `tests/` + `tests-examples/`** — three Playwright e2e
   specs are picked up by vitest by accident (vitest config glob is
   too wide). Fix: exclude Playwright paths from vitest config. Out
   of Plan 02 scope.

5. **Pre-existing tsc errors in `stories/` package** — `widgets.tsx`,
   `wifi.tsx`, `desktop.tsx` reference missing modules
   (`@/modules/widgets/three-stats-widget`, `@/modules/wifi/icon`, etc.)
   and have a `wallpapers` non-export. Fix: either restore the missing
   modules or remove the stories that reference them. Out of Plan 02
   scope.

### Window-manager.test.tsx + tsc for Plan 02 scope

- `pnpm exec vitest run src/providers/window-manager.test.tsx` → **8/8 PASS** ✓
- `pnpm exec tsc --noEmit` for `providers/window-manager.tsx` and the
  new test file produces **zero errors** ✓ (only pre-existing
  `stories/` errors remain, unrelated)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for
  `liv/packages/core/src/sdk-agent-runner.ts` **unchanged** ✓
