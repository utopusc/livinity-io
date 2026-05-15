# Phase 131-01 — Drag-to-pin bug fix

> Closes the user UAT regression `cacd03cd` (Phase 130-09): "bu sefer
> pencere sürükle bırak çalışmıyor". Drag a window's title pill onto the
> TopBar shelf and release → the window now pins (chip appears, source
> window animates to chip).

## ROOT CAUSE

Two compounding bugs introduced by Phase 130-09 (`cacd03cd`):

**B1 — TopBar mounted OUTSIDE WindowManagerProvider** (primary, breaks
the wiring). `router.tsx:74` rendered `<TopBar />` as a child of
`<EnsureLoggedIn>`, *above* `<AvailableAppsProvider>` →
`<AppsProvider>` → `<WindowManagerProvider>`. Inside TopBar,

```ts
const windowManager = useWindowManagerOptional()  // ← returns null!
```

returns `null` because the consumer is outside the provider. Every
chained call silently no-ops via optional chaining:

- `pinnedWindows = (windowManager?.windows ?? []).filter(...)` → always `[]`
- `windowManager?.pinWindowToTopBar(event.windowId)` → silent no-op

130-08 wired the drop-subscriber inside TopBar but used local
`useState` + localStorage to track pinned IDs, so the missing
provider context didn't matter. 130-09 moved the pinned-state
ownership into `WindowManager` (so the actual `WindowState` can stay
alive in the background and AI agents can drive it later) and
removed the localStorage cache. After 130-09, the provider was the
*only* path to pin a window — and TopBar didn't have it. Pin became
permanently broken.

This matches the H4-adjacent failure mode in `131-01-PLAN.md` (drop
subscriber observes a null/unmounted target), but the actual null is
the provider context, not `dropZoneRef.current`.

**B2 — Drop-zone shelf collapses the moment the drag ends** (secondary,
hides the chip even after wiring is restored). The TopBar's
`isExpanded` derivation was:

```ts
const isExpanded = dragState.isDragging || isHoverExpanded
```

When the user releases the drag, `dragState.isDragging` flips to
`false` and the bar immediately collapses back to its 580px compact
form. The center column swaps from the drop-zone with chips back to
the brand donut, so the chip just dropped (which lives inside the
`<AnimatePresence initial={false}>` *inside* the conditionally
rendered drop-zone div) unmounts before the user ever sees it. Visible
symptom: the source window animates to scale 0.1 / opacity 0 at the
top of the screen, then "nothing" — no chip, no feedback. The user
reads this as "drag-drop doesn't work" even though state had been
correctly updated (before B1 broke that too).

## WHY IT BROKE

- Commit `6526607e` (Phase 130-08, `feat(v36/topbar): drag-triggered
  expand + pin-on-drop wiring`): added `useWindowDragState` +
  `onWindowDragDrop` subscriber in TopBar. Chips were tracked in
  TopBar local state and persisted via localStorage. Worked without
  needing `WindowManagerProvider` context inside TopBar.
- Commit `cacd03cd` (Phase 130-09, `feat(v36/topbar): pinned-window
  animation + clock 12h + city/weather`): introduced
  `isPinnedToTopBar` flag on `WindowState`, added
  `pinWindowToTopBar / unpinWindowFromTopBar` to the WindowManager
  context, and rewrote TopBar to derive `pinnedWindows` from
  `windowManager?.windows.filter(...)`. The commit message explicitly
  notes "localStorage cache for pinned IDs was removed — persistence
  across full reloads will need a richer hook ... deferred to a
  follow-up." The follow-up replaced the persistence vehicle but
  left TopBar above the provider, silently severing the new wire.

## THE FIX

Two minimal changes (net +12 / −2 lines, well under the 80-line cap):

1. `livos/packages/ui/src/router.tsx` — move `<TopBar />` from being a
   sibling of `<Wallpaper />` (outside the provider) to being the first
   child of `<WindowManagerProvider>`. Visual position is unchanged
   because TopBar is `fixed inset-x-0 top-0 z-50` — DOM order does not
   affect layering for fixed elements. Inline comment documents the
   reason so a future refactor doesn't re-introduce the regression.

2. `livos/packages/ui/src/modules/desktop/top-bar.tsx` — extend the
   `isExpanded` derivation:

   ```ts
   const isExpanded = dragState.isDragging || isHoverExpanded || pinnedWindows.length > 0
   ```

   The bar now stays in its expanded shelf form whenever the user has
   at least one pinned window, so the chip stays visible after drop
   (and on subsequent visits to the page, once Plan 131-02 lands
   persistence). When the user unpins the last chip the bar collapses
   back to the compact brand-donut form.

No changes to `window.tsx` or `window-drag-state.ts` — the wiring those
files own was correct all along; the bug was the consumer being out
of context.

## MANUAL UAT LOG

Verified by static analysis + tsc:

- `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` →
  `100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ (before edits)
- `npx tsc --noEmit -p .` in `livos/packages/ui/` → 586 errors ✓
  (matches the 130-09 baseline exactly — no new errors)
- React tree audit: TopBar is now nested inside `WindowManagerProvider`
  → `useWindowManagerOptional()` returns the real context, not null.
  `pinWindowToTopBar` resolves to the reducer-dispatching callback.
- `isExpanded = pinnedWindows.length > 0` keeps the drop-zone div
  mounted after drop, so `<AnimatePresence>` retains its mounted
  state and the new chip enters with the spring animation defined
  on `PinnedWindowChip` (lines 339-346 of `top-bar.tsx`).

Live operator UAT remains (per 131-01-PLAN.md verification section):
the Mini PC walk through points 1-8 in `<verification>`. This belongs
to the operator at next session — autonomous execution can't run the
dev server interactively. The fix is type-safe and logically
verified; the only remaining unknown is whether any *third* visible
issue surfaces during the live walk (e.g. shelf bbox vs cursor edge
case H1). If so, follow up in 131-01.1.

## REGRESSION TEST IDEA

Add to a future Playwright suite (131-06 scope):

```ts
test('drag-to-pin pins the window and shows a chip', async ({page}) => {
  await page.goto('/')
  await openWindow(page, 'LIVINITY_files')
  const titlePill = page.locator('[data-testid="window-title-pill"]').first()
  const bar       = page.locator('[role="banner"][aria-label="Top bar"]')
  const target    = await bar.boundingBox()
  await titlePill.dragTo(page.locator('[aria-label="Show pinned windows shelf"]'))
  // chip should be visible immediately, bar should stay expanded
  await expect(page.locator('[role="banner"] button[title^="Restore"]')).toBeVisible()
  await expect(bar).toHaveCSS('max-width', /1180/)
})
```

Plus a unit-level guardrail that fails if TopBar is ever moved back
outside `WindowManagerProvider`: render the router root in a test,
spy on `console.error` for the React "must be used within Provider"
shape, and assert no warnings. (Won't catch the silent `null`
because `useWindowManagerOptional` is the no-throw variant — better
guardrail: a render-time `useEffect(() => { if (!windowManager)
console.warn('TopBar without WindowManager') }, [windowManager])`
that the test asserts is never warned.)
