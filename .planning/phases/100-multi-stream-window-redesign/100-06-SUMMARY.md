---
phase: 100-multi-stream-window-redesign
plan: 06
status: complete
date: 2026-05-08
---

# Phase 100-06 SUMMARY — UI revisions (action bar outside, round, drop Watch, fixed 1280×720)

**Date:** 2026-05-08
**Outcome:** SHIPPED — 4 user-requested UI revisions land in a single atomic commit. Plan 100-07 (routing fix) re-numbered and queued (was the original 100-06 scope).

## Scope (per user feedback after Phase 100 PARTIAL-PASS deploy)

The user observed the live `4954d9ba` build at `https://bruce.livinity.io` and reported four design corrections:

1. **Bottom buttons are INSIDE the window — move them OUTSIDE.** "Like the close button at the top, they should be round, at the bottom."
2. **Drop Watch mode entirely.**
3. **Make WebApp window resolutions stable at 1280×720.**

## Implementation

### (1) Action bar moved OUTSIDE the window

New file `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — a fixed-positioned `motion.div` that mirrors the top close-button pattern from `window-chrome.tsx`. Positioned 16px BELOW the window's bottom edge in viewport coords, centered horizontally. Wrapped in `<Magnetic>` for the same hover-pull effect as the close button.

Mounted in `windows-container.tsx` as a sibling of `<Window>` for any `appId.startsWith('WEBAPP_')` window.

```typescript
// windows-container.tsx (excerpt)
{webappId ? (
    <WebAppFloatingActionBar
        webappId={webappId}
        windowX={window.position.x}
        windowBottomY={window.position.y + window.size.height}
        windowWidth={window.size.width}
        zIndex={window.zIndex}
    />
) : null}
```

### (2) Round buttons (close-button parity)

Each mode button uses the same Tailwind class set as the top close button:

```
group flex items-center justify-center w-9 h-9 rounded-full
backdrop-blur-xl border shadow-[0_2px_8px_rgba(0,0,0,0.08)]
transition-all duration-200
```

Active state inverts to `bg-primary border-primary/80 text-white`; idle uses `bg-white/90 border-neutral-200/60 text-neutral-500` with `hover:bg-primary` parity.

### (3) Drop Watch mode

- `webapp-mode-selector.tsx`: `WebAppMode` type collapses from 4 → 3 (`'chat' | 'teach' | 'auto'`); `MODE_ORDER` matches.
- `webapp-stream-window.tsx`: `DrawerMode` type, `MODE_ICONS`, `MODE_LABELS` lose the `watch` entry; `setMode('watch')` after teach-stop changed to `setMode('chat')` (the natural fallback); inline `<WebAppWatchDrawer>` render dropped from the Sheet body.
- **DELETED** `livos/packages/ui/src/modules/window/app-contents/webapp-watch-drawer.tsx` (via `git rm`).
- Floating action bar's `MODES` array contains 3 entries (Chat / Teach / Auto). `Eye` Lucide icon import dropped wherever it was the watch-only consumer.

### (4) Fixed 1280×720 WebApp window resolution

`livos/packages/ui/src/providers/window-manager.tsx openWindow`: when `appId.startsWith('WEBAPP_')`, the base size is hardcoded to `{width: 1280, height: 720}` instead of falling through to the `default` map entry. The base still passes through `getResponsiveSize()` for viewport clamping (≥400×400 minimum, capped at viewport-1).

```typescript
const baseSize = appId.startsWith('WEBAPP_')
    ? {width: 1280, height: 720}
    : (DEFAULT_WINDOW_SIZES[appId] || DEFAULT_WINDOW_SIZES.default)
```

### State coupling

New `webapp-drawer-store.ts` (Zustand) keyed by webappId. Both the floating action bar (in `windows-container.tsx`) and the Sheet drawer host (in `webapp-stream-window.tsx`) subscribe. The local `useState<DrawerMode | null>` in webapp-stream-window.tsx was replaced with a store selector.

`WEBAPP_MODE_CHANGE_EVENT` dispatch (legacy contract for Phase 96/97 listeners) preserved — moved from `webapp-stream-window.tsx toggleDrawer` to the floating bar's onClick handler.

## Tests

- `webapp-stream-window.unit.test.tsx`: invariants flipped (3 failing → 21/21 PASS):
  - 4 invariants now assert the bar render is GONE from this file (`MessageCircle / GraduationCap / Bot / Eye` MUST NOT be in this source; `absolute inset-x-0 bottom-0 z-20` MUST NOT be present).
  - 1 invariant asserts subscription to `useWebAppDrawerStore` from `../webapp-drawer-store`.
- New `WebAppFloatingActionBar — source-text invariants` describe block (5 tests):
  - Renders 3 modes only (no `Eye`).
  - Round buttons (`rounded-full` + `backdrop-blur-xl` + `shadow-[0_2px_8px`).
  - Fixed-positioned outside window (`fixed select-none` + `windowBottomY` + `<Magnetic>`).
  - Preserves `WEBAPP_MODE_CHANGE_EVENT dispatch`.
  - Subscribes to `useWebAppDrawerStore`.
- Result: **21 / 21 PASS** in webapp-stream-window suite.
- Build clean (`vite build`: 35.92s, 212 PWA precache entries).
- TypeScript: no new errors (out-of-scope `stories/widgets.tsx` + `stories/wifi.tsx` errors persist — pre-existing, documented in 100-04 SUMMARY).

## Diff summary

| File | Action | Δ |
|------|--------|---|
| webapp-drawer-store.ts | NEW | +44 |
| webapp-floating-action-bar.tsx | NEW | +120 |
| webapp-watch-drawer.tsx | DELETED | -73 |
| webapp-stream-window.tsx | MODIFIED | -18 / +6 (drop bar render + state, switch to store) |
| webapp-mode-selector.tsx | MODIFIED | -2 / +3 (3-mode union) |
| webapp-stream-window.unit.test.tsx | MODIFIED | -10 / +50 (flip + new bar suite) |
| windows-container.tsx | MODIFIED | -7 / +18 (per-WebApp bar mount) |
| window-manager.tsx | MODIFIED | -1 / +5 (1280×720 base) |
| **Total** | | **+277 / -140** (8 files) |

## Sacred SHA

- pre-commit: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- post-commit: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- `.husky/pre-commit` fired and passed.

## Commit

- `f18c8973` feat(100-06): UI revisions — action bar OUTSIDE the window, round buttons, drop Watch, fixed 1280×720

## Push state

- Push range: `bb38d2b8..f18c8973` (1 commit).
- origin/master: `f18c8973` ✓ matches local HEAD.

## Next

- Plan 100-07 (routing fix — original 100-06 scope) still queued. Rough scope: click bypass via `xdotool --window <wid>` tRPC mutation + chat MCP scoping system-prompt fix + explicit windowId on every bytebot tool call. ~3-4 plans, 1-2 days.
- Re-walk Phase 100 UAT after 100-07 ships → 11/11 PASS → flip v33 ✅ Shipped.

## Carry-over

- The `pb-9` reservation on `webapp-stream-window.tsx`'s stream wrapper (line 328 region) is now decorative — the new bar lives OUTSIDE the window in viewport coords, not as an overlay over the stream. Preserved for layout stability across re-flow. Can be removed in a future polish pass if desired.
- `MODE_ICONS` / `MODE_LABELS` constants still exist in `webapp-stream-window.tsx` as comments-only (the actual maps live in `webapp-floating-action-bar.tsx`'s `MODES` array). Cleanup is cosmetic.
