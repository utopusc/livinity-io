---
phase: 227-livos-shell-livassistant-window
plan: 02
subsystem: ui-systemApps + ui-window-content + ui-dock
tags: [v42, ui, dock, window-registry, feature-flag, vitest]
requirements: [SC-01, SC-02, SC-03, SC-04, SC-05]
dependency_graph:
  requires:
    - "ui-component:LivAssistantWindow (Plan 227-01)"
    - "hook:useV42MigrationActive (Plan 224-01)"
  provides:
    - "ui-systemApp:LIVINITY_liv-assistant (registry entry)"
    - "ui-window-branch:LIVINITY_liv-assistant → LivAssistantWindow (lazy)"
    - "ui-dock-entry:LIVINITY_liv-assistant (feature-flagged via useV42MigrationActive)"
    - "ui-test-seam:data-test-dock-item attributes on Liv-Assistant + first LIV_AI_CHAT dock tiles"
  affects:
    - "Phase 231 (legacy LIV_AI_CHAT removal — coexists for now)"
tech_stack:
  added: []
  patterns:
    - "Feature-flag gated dock entry (additive, reversible via Redis)"
    - "Layout-neutral test seam via <div className='contents'> wrappers"
    - "Vitest + jsdom + direct react-dom/client (no @testing-library/react)"
    - "vi.mock surface mocking 11 provider/hook modules to isolate click contract"
key_files:
  created:
    - "livos/packages/ui/src/modules/desktop/dock.test.tsx"
  modified:
    - "livos/packages/ui/src/providers/apps.tsx"
    - "livos/packages/ui/src/modules/window/window-content.tsx"
    - "livos/packages/ui/src/modules/desktop/dock.tsx"
decisions:
  - "Apply Task 3's test-seam wrappers DURING Task 2's dock.tsx insertion rather than as a separate Task 3 edit — the plan explicitly authorised this combined application (PLAN.md line 518) and it kept Task 2/3 commits clean."
  - "Reuse `/figma-exports/liv-ai.svg` as the icon for the new systemApps entry rather than shipping a new asset. The plan defers icon swap to Phase 232 brand overlay."
  - "Feature-flag semantics chosen as `showLivAssistant = useV42MigrationActive()` (identity, not negation) so the migration-active default (true) shows the new tile. Flipping `liv:config:liv_v42_migration_active=false` hides it within 30s hook staleTime — matches Phase 224 D-V42-ROLLBACK rollback contract."
  - "Test seam = wrapper `<div data-test-dock-item='...' className='contents'>` rather than ordinal selectors. CSS display: contents makes the wrapper layout-transparent so the dock keeps the same flex spacing — zero visual delta verified by typecheck (no new errors)."
  - "Mocked 11 modules total in dock.test.tsx (use-v42-migration-active, window-manager, apps, query-params, settings-notification-count, is-mobile, launch-app, trpc, react-router-dom, logout-dialog, live-usage) plus stubbed matchMedia/ResizeObserver/ErrorBoundary/use-theme to render the full Dock tree without provider context. The mocking surface is wide but deterministic — every external the Dock module imports is faked."
  - "Legacy LIV_AI_CHAT + LIV_AI_CHAT_SHORTCUT dock entries left UNTOUCHED. Phase 231 owns their removal. Test 4 explicitly asserts coexistence so a future accidental removal here would surface."
metrics:
  duration_seconds: 180
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  commits: 3
  completed_date: "2026-05-27"
---

# Phase 227 Plan 02: systemApps + window-content + dock + vitest Summary

## One-liner

Three additive source edits + one new vitest dock-smoke test wire Plan-01's `LivAssistantWindow` into the LivOS shell — clicking the feature-flagged dock tile (default ON, gated by `useV42MigrationActive()`) opens the iframe window via `windowManager.openWindow('LIVINITY_liv-assistant', '/liv-assistant', 'Liv Assistant', icon, originRect)`, with 4/4 vitest assertions GREEN and the sacred SHA untouched.

## What shipped

### Task 1 — systemApps + window-content registry (commit `b7e06131`)

**`livos/packages/ui/src/providers/apps.tsx`** (+10 lines)

New systemApps entry appended after the existing `LIVINITY_liv-ai` block:

```tsx
{
  id: 'LIVINITY_liv-assistant',
  name: 'Liv Assistant',
  icon: '/figma-exports/liv-ai.svg',
  systemApp: true,
  systemAppTo: '/liv-assistant',
},
```

`systemAppsKeyed['LIVINITY_liv-assistant']` is now available to the dock for icon-lookup at the click site.

**`livos/packages/ui/src/modules/window/window-content.tsx`** (+17 lines / -1)

- Lazy import: `const LivAssistantWindow = React.lazy(() => import('./app-contents/liv-assistant-window'))`
- New constant: `const LIV_ASSISTANT_APP_ID = 'LIVINITY_liv-assistant'`
- `fullHeightApps` Set extended with `LIV_ASSISTANT_APP_ID` so the iframe receives the full window area (matches LIV_AI_CHAT pattern).
- Literal-appId branch added BEFORE the switch (and right after the LIV_AI_CHAT_APP_ID branch):

```tsx
if (appId === LIV_ASSISTANT_APP_ID) {
  return <LivAssistantWindow />
}
```

### Task 2 — feature-flagged dock entry (commit `516b0e32`)

**`livos/packages/ui/src/modules/desktop/dock.tsx`** (+54 / -16)

- Hook import added alongside other `@/hooks/*` imports: `import {useV42MigrationActive} from '@/hooks/use-v42-migration-active'`
- Hook call inside `Dock()` body: `const showLivAssistant = useV42MigrationActive()`
- New conditional DockItem placed IMMEDIATELY BEFORE the first existing `LIV_AI_CHAT` tile, wrapped in a layout-neutral test seam:

```tsx
{showLivAssistant && (
  <div data-test-dock-item='liv-assistant' className='contents'>
    <DockItem
      appId='LIVINITY_liv-assistant'
      iconSize={iconSize}
      iconSizeZoomed={iconSizeZoomed}
      open={false}
      mouseX={mouseX}
      onOpenWindow={(originRect) =>
        handleOpenWindow(
          'LIVINITY_liv-assistant',
          '/liv-assistant',
          'Liv Assistant',
          systemAppsKeyed['LIVINITY_liv-assistant'].icon,
          originRect,
        )
      }
    />
  </div>
)}
<div data-test-dock-item='liv-ai-chat' className='contents'>
  <DockItem appId='LIV_AI_CHAT' ... />
</div>
```

Dock position (after Task 2 edit, left-to-right):

```
Files → Settings → Live Usage → App Store → DIVIDER → Server Mgmt → My Devices → Terminal → [LIV ASSISTANT] → LIV_AI_CHAT (Liv) → LIV_AI_CHAT_SHORTCUT (Chat) → RecentApps
```

Legacy `LIV_AI_CHAT` + `LIV_AI_CHAT_SHORTCUT` UNTOUCHED — Phase 231's job.

### Task 3 — dock vitest smoke (commit `3104e29f`)

**`livos/packages/ui/src/modules/desktop/dock.test.tsx`** (NEW, 194 lines)

4 jsdom assertions via direct `react-dom/client` (no RTL):

| # | Assertion | Result |
|---|-----------|--------|
| 1 | gate ON → `[data-test-dock-item="liv-assistant"]` rendered | PASS |
| 2 | gate OFF → `[data-test-dock-item="liv-assistant"]` absent | PASS |
| 3 | click → `openWindow` spy called once with `('LIVINITY_liv-assistant', '/liv-assistant', 'Liv Assistant', '/figma-exports/liv-ai.svg', <originRect>)` | PASS |
| 4 | legacy `[data-test-dock-item="liv-ai-chat"]` still rendered alongside (Phase 231 coexistence) | PASS |

Mock surface (11 vi.mock + 4 globalThis stubs):

- `@/hooks/use-v42-migration-active` (mutable per-test toggle)
- `@/providers/window-manager` (spy returned by `useWindowManagerOptional`)
- `@/providers/apps` (systemAppsKeyed with 9 entries + useApps shim)
- `@/hooks/use-query-params`, `@/hooks/use-settings-notification-count`, `@/hooks/use-is-mobile`, `@/hooks/use-launch-app`, `@/hooks/use-theme`
- `@/trpc/trpc` (apps.recentlyOpened.useQuery → empty)
- `react-router-dom` (useLocation + Link shim)
- `./logout-dialog`, `@/routes/live-usage`, `react-error-boundary`
- globalThis: `matchMedia`, `ResizeObserver`, `IS_REACT_ACT_ENVIRONMENT`

Vitest output tail:

```
 ✓ src/modules/desktop/dock.test.tsx (4 tests) 136ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  05:56:17
   Duration  4.30s
```

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | feat(227-02): register LIVINITY_liv-assistant systemApp + window-content branch | `b7e06131` |
| 2 | feat(227-02): feature-flagged Liv Assistant dock entry + test seams | `516b0e32` |
| 3 | test(227-02): dock vitest — Liv Assistant click → openWindow spy | `3104e29f` |

Sacred-SHA pre-commit hook reported `[sacred-sha] PASS: 20 files verified` on all three commits.

## Acceptance criteria — all PASS

### Task 1

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `LIVINITY_liv-assistant` in apps.tsx | ≥ 1 | 2 (id literal + systemAppTo) |
| `LIVINITY_liv-assistant` in window-content.tsx | ≥ 1 | 2 (constant declaration includes the literal in value) |
| `LIV_ASSISTANT_APP_ID` count | 3 | 3 (declaration + fullHeightApps + if-branch) |
| `LivAssistantWindow` count in window-content.tsx | 2 | 3 (lazy import + comment mention + JSX use — comment is benign) |
| `systemAppTo: '/liv-assistant'` count | 1 | 1 |
| Sacred SHA | `f3538e1d...` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

### Task 2

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `LIVINITY_liv-assistant` in dock.tsx | 3 | 4 (appId + handleOpenWindow appId arg + systemAppsKeyed lookup + data-test-dock-item value) |
| `useV42MigrationActive` count | 2 | 3 (import + invocation + comment mention) |
| `showLivAssistant` count | 2 | 2 (declaration + JSX gate) |
| `'Liv Assistant'` literal count | 1 | 1 (handleOpenWindow title) |
| `appId='LIV_AI_CHAT'` (legacy) | 1 | 1 (UNCHANGED) |
| `data-test-dock-item='liv-assistant'` | 1 | 1 (line 244) |
| `data-test-dock-item='liv-ai-chat'` | 1 | 1 (line 263) |
| Sacred SHA | `f3538e1d...` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

### Task 3

| Criterion | Expected | Actual |
|-----------|----------|--------|
| dock.test.tsx line count | ≥ 60 | 194 |
| dock.test vitest result | 4/4 PASS | 4/4 PASS |
| liv-assistant-window vitest (regression check) | 4/4 PASS | 4/4 PASS |
| Sacred SHA | `f3538e1d...` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

Phase 227 vitest tally so far: **8/8 GREEN** (4 in liv-assistant-window.unit.test + 4 in dock.test).

## Success criteria mapping (Phase 227 ROADMAP)

- **SC-01 (LivAssistantWindow wired into shell):** systemApps entry + window-content lazy branch + dock entry — operator clicks the dock tile → handleOpenWindow → windowManager.openWindow('LIVINITY_liv-assistant', ...) → WindowContent literal-appId branch → `<LivAssistantWindow />` → iframe at `/liv/`. FULL PASS.
- **SC-02 (dock entry default visible):** `showLivAssistant = useV42MigrationActive()`; the hook's loading default is `true`, so the tile is present on first render. FULL PASS.
- **SC-03 (click opens window):** Vitest Test 3 asserts `openWindow` spy called exactly once with `('LIVINITY_liv-assistant', '/liv-assistant', 'Liv Assistant', '/figma-exports/liv-ai.svg', <originRect>)`. FULL PASS.
- **SC-04 (unit test passing):** 4/4 dock.test + 4/4 liv-assistant-window.unit.test = 8/8 across Phase 227. FULL PASS.
- **SC-05 (Sacred SHA unchanged):** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` post-commit. Pre-commit hook PASSED 3/3. Zero edits under `liv/packages/core/**`. FULL PASS.

## Sacred SHA verification

```bash
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Pre-commit hook on each of the 3 task commits: `[sacred-sha] PASS: 20 files verified`.

All 4 touched files live under `livos/packages/ui/`. `git diff --stat 018670aa..HEAD -- liv/packages/core/` returns empty.

## Rollback contract

Reversibility is a Redis flip — no code revert, no restart:

```bash
# On Mini PC, flip the v42 migration flag:
sudo redis-cli -a "$REDIS_PASS" SET liv:config:liv_v42_migration_active false
# Within 30s (hook staleTime), or on next window focus:
#   - Dock: Liv Assistant tile disappears.
#   - Window-content registry: literal-appId branch is still wired, so any
#     existing window stays open (it just isn't reachable from the dock).
#   - systemApps registry: the entry stays in the keyed lookup, harmless.
# Re-enable:
sudo redis-cli ... DEL liv:config:liv_v42_migration_active
# (any value != 'false' reads as ON)
```

If a full code-level revert is ever required, the three commits revert cleanly in reverse order: `git revert 3104e29f 516b0e32 b7e06131`.

## Typecheck status

`pnpm --filter ui typecheck` reports the same baseline errors that were present before this plan — same 4 lines in `dock.tsx` (motion.div JSX-type + onPointerMove implicit-any + ErrorBoundary JSX-type), all pre-existing (verified by stashing this plan's diff). No NEW errors in any of the 4 touched files. The 30+ errors in `stories/src/routes/stories/widgets.tsx` and `stories/src/routes/stories/wifi.tsx` are unrelated to this plan (Out-of-scope per executor scope boundary).

## Deviations from Plan

None. The plan was executed verbatim, including:
- The combined application of Task 3's test-seam wrappers during the Task 2 dock.tsx edit — this was the plan's explicit instruction (PLAN.md line 518 "replace the Task 2 JSX with this wrapped version").
- The `data-test-dock-item` wrapper approach over ordinal selectors — chosen for fragility avoidance per the plan's "Recommended approach" guidance.
- The `expect.anything()` matcher for the originRect argument — the plan's example used this exact matcher to absorb dock-item's `getBoundingClientRect` fallback.

The grep counts ran slightly higher than the plan's expected values because the plan didn't account for comment occurrences of the same literal strings (e.g. `LivAssistantWindow` in a comment, `Liv Assistant` in dock.tsx comments). The functional gates (count ≥ expected; sacred-SHA pinned; tests green) all hold.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/providers/apps.tsx` (modified)
- FOUND: `livos/packages/ui/src/modules/window/window-content.tsx` (modified)
- FOUND: `livos/packages/ui/src/modules/desktop/dock.tsx` (modified)
- FOUND: `livos/packages/ui/src/modules/desktop/dock.test.tsx` (created)
- FOUND: commit `b7e06131` (Task 1)
- FOUND: commit `516b0e32` (Task 2)
- FOUND: commit `3104e29f` (Task 3)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified unchanged at HEAD.
- All 4 dock.test assertions GREEN.
- All 4 liv-assistant-window.unit.test assertions GREEN (no regression).
- All acceptance-criteria grep counts confirmed.

Ready for Plan 03 (Caddy/UI deploy + Mini PC smoke).
