---
phase: 159-nativeapp-webapp-parity-window-manager-panel
plan: 08
subsystem: ui
tags: [workstream-c, windows-panel, topbar-mount, functional-not-pretty, radix-popover, latent-feature-activation]

# Dependency graph
requires:
  - phase: 159
    provides: Plan 01 Wave 0 stubs (windows-manager-panel.test.tsx + top-bar.test.tsx — replaced with real invariants here)
  - phase: 159
    provides: Plan 02 registerCloseHandler registry on WindowManagerProvider (consumed indirectly via wm.closeWindow)
provides:
  - WindowsManagerPanel component (4-action surface per window — Focus / Min-or-Restore / Pin-or-Unpin / Close)
  - classifyAppId helper covering WEBAPP_ / NATIVE_ / LIVINITY_ prefix discrimination
  - describeState helper exposing Visible / Minimized / Pinned states
  - TopBar Radix Popover mount behind a Lucide LayoutGrid trigger in the right cluster
  - 11 source-text invariants on the panel + 7 on the TopBar mount
  - First UI caller of minimizeWindow() / restoreWindow() — activates latent reducer actions documented as Research C risk #1
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Radix Popover from TopBar right cluster (mirrors webapp-floating-skills-button.tsx precedent)"
    - "appId-prefix classifier (WEBAPP_/NATIVE_/LIVINITY_) reused without introducing a new streamAppId type"
    - "Source-text invariant tests for both new file (panel) AND modified file (TopBar mount)"

key-files:
  created:
    - livos/packages/ui/src/modules/desktop/windows-manager-panel.tsx
  modified:
    - livos/packages/ui/src/modules/desktop/top-bar.tsx
    - livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx
    - livos/packages/ui/src/modules/desktop/top-bar.test.tsx

key-decisions:
  - "Panel directly mutates via wm.closeWindow(w.id) — does NOT touch any kind-specific backend mutation. The Plan 02 close-handler registry (registered by NativeAppStreamWindow + WebAppStreamWindow when those land) makes Close 'just work' for any window kind without adding per-kind branches here."
  - "Panel uses useWindowManagerOptional (not useWindowManager) and returns null when no provider in tree — matches the pattern used by other TopBar consumers and keeps source-text invariant tests truly source-text (no React render required)."
  - "Panel + existing pinned-window shelf coexist (NOT mutually exclusive). Per RESEARCH C risk #4, duplication is acceptable: the shelf is spatial-quick-access for pinned chips, the panel is the canonical full window list with all four actions."
  - "Visual is intentionally utilitarian — plain border/list/buttons, no animations beyond Radix defaults. A follow-up frontend redesign phase will skin this later."
  - "Did NOT introduce a `streamAppId` discriminated-union type per RESEARCH cross-workstream guidance. The existing appId-prefix convention is sufficient and avoids cascading type changes through Window/WindowChrome/WindowsContainer."
  - "WindowRow is a plain inner function component (not memoized). Re-renders on every wm.windows change are cheap and the panel is only mounted while the Popover is open."

patterns-established:
  - "Radix Popover as the canonical mount for TopBar dropdowns (LayoutGrid trigger pattern reusable for future TopBar panels)"
  - "classifyAppId + describeState helpers as the kind/state discrimination idiom — future panels can import these or copy the pattern"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-05-19
---

# Phase 159 Plan 08: Windows Manager Panel (Workstream C) Summary

**Functional Windows Manager panel listing every open window across WebApp/NativeApp/System kinds with Focus/Min-or-Restore/Pin-or-Unpin/Close actions per row, mounted as a Radix Popover behind a Lucide LayoutGrid trigger in the TopBar right cluster — visual deliberately utilitarian, polish deferred to follow-up phase.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-19T01:22Z (approx)
- **Completed:** 2026-05-19T01:30Z (approx)
- **Tasks:** 2 (Task 1 panel creation + invariants; Task 2 TopBar mount + invariants)
- **Files created:** 1 (windows-manager-panel.tsx)
- **Files modified:** 3 (top-bar.tsx, windows-manager-panel.test.tsx, top-bar.test.tsx)
- **Files deleted:** 0
- **Commits:** 2 atomic (36f0129b, 7b9803c0)

## Accomplishments

- New `WindowsManagerPanel` functional component (~110 lines) subscribing to `useWindowManagerOptional()`, rendering a 340×480 max-clipped scrollable list of every open window.
- 4 action buttons per row (Focus / Min-or-Restore / Pin-or-Unpin / Close) wired to the existing 6 WindowManager methods directly. No new state, no new provider, no new route, no new backend touch.
- **Latent feature activation:** First UI surface in the codebase to invoke `wm.minimizeWindow()` / `wm.restoreWindow()`. The reducer actions `MINIMIZE_WINDOW` + `RESTORE_WINDOW` have lived in `window-manager.tsx` since Phase 130 with no caller — this panel finally surfaces them. Minimized windows (filtered out by `windows-container.tsx`) can now be restored by users for the first time.
- **Cross-workstream registry win:** the panel's Close button calls plain `wm.closeWindow(w.id)`. Plan 02's `registerCloseHandler` registry fires the registered handler synchronously BEFORE the reducer dispatches, so when NativeAppStreamWindow + WebAppStreamWindow eventually register their backend-close handlers (Plans 04/05/06), the panel's Close button gets clean backend teardown for free with zero per-kind branches in the panel code.
- TopBar right cluster gains a 32×32 LayoutGrid button (Lucide icon, aria-label "Windows manager") that opens the panel via Radix Popover (aligned end). Placed BEFORE the existing ClockWithLocation, gap-1.5 spacing.
- Existing pinned-window shelf (PinnedWindowChip drop-zone in the Center column) is preserved untouched per regression guard in top-bar.test.tsx — both surfaces coexist.
- `classifyAppId(appId)` discriminates WEBAPP_ / NATIVE_ / LIVINITY_ / unknown without introducing a new TypeScript discriminated-union type, per RESEARCH cross-workstream recommendation.
- `describeState(w)` returns "Minimized" / "Pinned" / "Visible" — surfaced as the row sub-label (`{kind} · {state}`).
- 11 source-text invariants in `windows-manager-panel.test.tsx` lock the panel API surface (imports, 6 method invocation sites, prefix constants, empty state, state labels, sacred-SHA marker).
- 7 source-text invariants in `top-bar.test.tsx` lock the mount (LayoutGrid + Popover + WindowsManagerPanel imports, Popover-wraps-WindowsManagerPanel structure, aria-label, PinnedWindowChip regression guard, ClockWithLocation regression guard).

## Task Commits

Each task was committed atomically as a TDD RED→GREEN cycle in a single commit (test + source together — source-text invariants on a file MUST land with the file):

1. **Task 1: WindowsManagerPanel component + invariants** — `36f0129b` (feat). RED gate: 1 file collected / 0 tests run / ENOENT on missing source (proves test is real). GREEN gate: 11/11 PASS. tsc --noEmit on windows-manager-panel.tsx: 0 errors.
2. **Task 2: TopBar Popover mount + invariants** — `7b9803c0` (feat). RED gate: 5/7 failed (the 2 passing ones were the PinnedWindowChip + ClockWithLocation regression guards that hold pre-edit). GREEN gate: 7/7 PASS. tsc --noEmit on top-bar.tsx: 0 errors.

## Files Created/Modified

- **Created:** `livos/packages/ui/src/modules/desktop/windows-manager-panel.tsx` — the panel component itself; ~107 lines including the sacred-SHA marker comment, classifyAppId/describeState helpers, WindowsManagerPanel function component, and inner WindowRow.
- **Modified:** `livos/packages/ui/src/modules/desktop/top-bar.tsx` — added 3 imports (LayoutGrid, Popover/PopoverContent/PopoverTrigger, WindowsManagerPanel) and rewrote the right-cluster div from `pr-1.5` (single child) to `gap-1.5 pr-1.5` (two children: Popover + ClockWithLocation).
- **Modified:** `livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx` — replaced Wave 0 stub with 11 real source-text invariants.
- **Modified:** `livos/packages/ui/src/modules/desktop/top-bar.test.tsx` — replaced Wave 0 stub with 7 real source-text invariants.

## Decisions Made

- **Combined RED/GREEN in single per-task commit** — same rationale as Plan 02: source-text invariant tests don't compile cleanly on their own (they assert on the source file they accompany). Splitting would produce a transient state where the test file references literals not yet in the source. Mitigation: RED gate was still proven (Task 1: ENOENT on missing source; Task 2: 5/7 fail captured in transcript).
- **useWindowManagerOptional (not useWindowManager)** — chosen because the panel might be mounted in test/storybook contexts without the provider. Returning null early is cheaper than a thrown error.
- **WindowRow as inner function component, not memoized** — the panel is only rendered while the Popover is open, so re-render cost on every `wm.windows` change is negligible. Memoization would add complexity without measurable benefit.
- **Panel does NOT filter pinned windows out** — operator can see + act on pinned windows in the panel just like any other. This is intentional per RESEARCH C risk #4 (shelf duplication is acceptable).
- **Window object renamed to `w` in WindowRow props** — `window` is a reserved global; passing it as a prop name (`{window: w}`) avoids shadowing the DOM global inside the component body.
- **No animations beyond Radix Popover defaults** — phase scope explicitly defers visual polish. The panel is plain `border-line` + `border-b` + `rounded-md` rectangles. The frontend redesign phase will replace this with the design-system aesthetic.

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria source-text counts met:

- `export function WindowsManagerPanel` × 1 (target: 1) ✓
- `wm.{focusWindow|minimizeWindow|restoreWindow|pinWindowToTopBar|unpinWindowFromTopBar|closeWindow}` × 6 invocations (target: 6) ✓
- `sdk-agent-runner` marker × 1 (target: 1) ✓
- `import {LayoutGrid}` × 1 (target: 1) ✓
- `import {Popover, PopoverContent, PopoverTrigger}` × 1 (target: 1) ✓
- `import {WindowsManagerPanel}` × 1 (target: 1) ✓
- `<WindowsManagerPanel` × 1 (target: 1) ✓
- `<PinnedWindowChip` × 1 (target: ≥1, regression guard) ✓
- 11/11 panel invariants PASS ✓
- 7/7 top-bar invariants PASS ✓

## Issues Encountered

- **Pre-existing UI test drift (out of scope):** Same fleet of pre-existing failing tests reported by Plan 02 (missing `@vitest-environment jsdom` headers, stale Phase 157-round-10 invariants, Playwright specs picked up by vitest, pre-existing `stories/` package tsc errors). All unrelated to Plan 08. Already documented in `deferred-items.md`.
- **livinityd tsc errors (out of scope):** `pnpm exec tsc --noEmit` from the ui package surfaces ~30+ pre-existing errors in `livinityd/source/modules/ai/routes.ts` (`ctx.livinityd` is possibly undefined). Pre-existing drift; zero new errors introduced by Plan 08.
- **No deviation tracking entries** — Rules 1/2/3/4 did not trigger during this plan; the scope was tightly bounded to two UI files + two test files.

## Frontend Visual Deferral (Per Phase Scope)

The panel intentionally uses utilitarian styling:
- `border-line` rectangles, no rounded corners beyond `rounded-md`
- Plain Lucide LayoutGrid icon — no custom glyph
- `text-[11px]` row sub-labels — readable but spartan
- No motion/transition beyond Radix Popover defaults
- No design-system tokens beyond what's already CSS-var-bound (--fg, --bg-2)
- 4 action buttons rendered as plain `<button>` with hover backgrounds — no Magnetic, no shadcn Button variants

The follow-up frontend redesign phase (v37 visual continuation) will:
- Replace the plain border list with the design-system card/list pattern
- Animate row enter/exit (likely framer-motion AnimatePresence per row)
- Group rows by kind (WebApp / NativeApp / System sections)
- Add a search filter + per-kind filter chips
- Replace plain button labels with icon + label pairs (Lucide Focus/Minus/Pin/X glyphs)

The current panel intentionally ships nothing of that — it is **functional, not pretty**, per phase scope.

## Latent Feature Activation: minimizeWindow / restoreWindow

Per RESEARCH C risk #1: `MINIMIZE_WINDOW` + `RESTORE_WINDOW` reducer actions existed in `window-manager.tsx` since Phase 130 with **zero UI callers**. `windows-container.tsx:26` filters out `isMinimized: true` windows, but no surface invoked `minimizeWindow()` and no surface invoked `restoreWindow()` to bring them back. This was a half-shipped feature.

Plan 08's panel is the first UI surface to invoke both. The Min button on each row now puts a window into the minimized state (it disappears from the desktop), and the Restore button (same button, label-toggled when `isMinimized: true`) brings it back with focus. This activates the latent feature without any reducer change.

Operator-visible win: users can now temporarily hide a window without closing it, then bring it back from the panel. Future enhancement: a per-row keyboard shortcut (e.g. `M` to minimize, `R` to restore the focused row) — out of scope for Plan 08.

## Cross-Workstream Registry Win

The panel's Close button calls plain `wm.closeWindow(w.id)`. There is NO per-kind branching (no `if (kind === 'webapp') call webapp.close mutation else call native.close mutation`). This works because Plan 02's `registerCloseHandler(windowId, handler)` registry intercepts `closeWindow()`:

1. `closeWindow(w.id)` looks up the registered handler for the windowId
2. Fire-and-forget invocation with Promise.race + 2s timeout
3. Reducer dispatches `CLOSE_WINDOW` action, AnimatePresence unmounts the window

When Plans 04/05/06 land:
- `NativeAppStreamWindow` registers `() => closeMutationRef.current.mutateAsync({id: nativeAppId})` on mount via `wm.registerCloseHandler`
- `WebAppStreamWindow` registers `() => stopStreamMutation.mutateAsync(...)` similarly

After those land, the panel's Close button automatically triggers proper backend teardown for ANY kind of window. The panel itself never imports or knows about any backend mutation. This is the cleanest possible cross-cutting concern win.

## Sacred SHA Invariant

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — unchanged through both commits. ✓

## Next Phase Readiness

- **Plan 159-04/05 (Workstream A/B)** — independent of Plan 08; safe to merge in any order. The TopBar mount + panel render path do not touch any A/B-touched file.
- **Plan 159-06 (Workstream B defensive — webapp-stream-window.tsx)** — once it lands, the panel's Close button automatically gains clean WebApp backend teardown.
- **Frontend redesign follow-up phase** — will replace the utilitarian panel skin with the design-system aesthetic. The component API (props, exported name, mount point) is locked by the 11 + 7 invariants — the redesign phase can change internals freely without breaking call-sites.

## Self-Check: PASSED

- File `livos/packages/ui/src/modules/desktop/windows-manager-panel.tsx`: FOUND (created)
- File `livos/packages/ui/src/modules/desktop/top-bar.tsx`: FOUND (modified)
- File `livos/packages/ui/src/modules/desktop/windows-manager-panel.test.tsx`: FOUND (modified)
- File `livos/packages/ui/src/modules/desktop/top-bar.test.tsx`: FOUND (modified)
- Commit `36f0129b` (Task 1): FOUND in `git log --oneline`
- Commit `7b9803c0` (Task 2): FOUND in `git log --oneline`
- Sacred SHA preserved: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- 11/11 invariants pass on `pnpm exec vitest run src/modules/desktop/windows-manager-panel.test.tsx`
- 7/7 invariants pass on `pnpm exec vitest run src/modules/desktop/top-bar.test.tsx`
- tsc --noEmit on touched files: 0 errors (livinityd pre-existing errors out of scope)

---
*Phase: 159-nativeapp-webapp-parity-window-manager-panel*
*Completed: 2026-05-19*
