---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 03
subsystem: ui / window-manager + window-content + display VNC window
tags: [ui, vnc, novnc, rfb, displays, window-manager, x11, tdd]
requires:
  - displays.getVncUrl tRPC mutation (Plan 01) — input {display: ':N'} → {wsUrl}
  - useWebAppVnc hook (Phase 95-04) — noVNC RFB wrapper, viewOnly option
  - trpcReact (UI tRPC react client)
provides:
  - X11DisplayStreamWindow — live interactive noVNC window for an X display
  - DISPLAY_ appId routing branch in window-content.tsx (full-bleed)
  - openWindow(..., suggested?: {width; height}) sizing seam
affects:
  - 254-04 (hover panel calls openWindow('DISPLAY_:N', …, {width, height}) to open a display window)
tech-stack:
  added: []
  patterns:
    - "DISPLAY_:N appId prefix discriminator (mirrors WEBAPP_/NATIVE_/OPENUI_)"
    - "fire-once tRPC mutation guarded by a per-key ref (resolvedForRef ↔ spawnedForRef)"
    - "viewOnly:false → RFB-native mouse/keyboard (no per-event xdotool dispatch)"
    - "trailing optional openWindow param keeps existing callers byte-identical"
key-files:
  created:
    - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx
    - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.test.tsx
  modified:
    - livos/packages/ui/src/providers/window-manager.tsx
    - livos/packages/ui/src/providers/window-manager.test.tsx
    - livos/packages/ui/src/modules/window/window-content.tsx
decisions:
  - "Reused useWebAppVnc verbatim with {viewOnly:false} — RFB forwards input natively; dropped the WebApp xdotool canvas interceptors (locked decision #1)"
  - "object-contain (NOT cover) on the display canvas — a full desktop must never be cropped"
  - "Retry overlay re-resolves the wsUrl (resets resolvedForRef) then vnc.reconnect() — covers a server-side x11vnc that went away"
  - "No client-side close mutation — StreamManager owns the x11vnc lifecycle (Plan 01); RFB disconnect on unmount is sufficient"
metrics:
  duration: ~9m
  completed: 2026-05-31
  tasks: 3
  files: 5
---

# Phase 254 Plan 03: Live Interactive VNC Display Window + openWindow Sizing Seam Summary

Built the live, interactive VNC display window (locked decision #1 — reuse the
noVNC/RFB infra) and the window-content routing + openWindow sizing it needs. A
LivOS window whose appId is `DISPLAY_:N` now resolves that display's VNC
websocket via `displays.getVncUrl` (Plan 01) and renders it through the existing
`useWebAppVnc` hook with `viewOnly:false`, so mouse + keyboard are forwarded
natively over the VNC protocol — no screenshot-polling, no per-event tRPC
dispatch (unlike the WebApp path which uses xdotool because it runs viewOnly).

## What shipped

- **Task 1 — openWindow suggested size** (`de1e3c35` RED test, `d8e9ba56` GREEN feat)
  - Widened the `WindowManager` context type and the `openWindow` `useCallback`
    with a trailing optional `suggested?: {width: number; height: number}`.
  - `baseSize = suggested ?? (isWebApp ? {1280,720} : DEFAULT_WINDOW_SIZES[appId] || default)`.
  - `getResponsiveSize(w, h, isWebApp || isDisplay || suggested != null)` — preserves
    aspect when a suggested/display size is in play so a full desktop never
    degrades to a portrait window on a narrow viewport. Absent `suggested`, the
    behavior is byte-identical to pre-254.
- **Task 2 — X11DisplayStreamWindow** (`280f30af` RED test, `513033a0` GREEN feat)
  - New `x11-display-stream-window.tsx` (default export
    `X11DisplayStreamWindow({displayId, windowId})`).
  - Fire-once `displays.getVncUrl.useMutation()` with `{display: displayId}`,
    guarded by `resolvedForRef` (mirrors `spawnedForRef` in
    webapp-stream-window.tsx) → captures `res.wsUrl` into state.
  - Renders `useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})` — LIVE input,
    RFB-native. NO canvas event interceptors, NO per-event tRPC input dispatch.
  - Full-bleed container `[&_canvas]:object-contain` (full desktop not cropped),
    root `relative flex h-full w-full flex-col bg-black`.
  - Connecting overlay + error overlay (with Retry → re-resolve wsUrl +
    `vnc.reconnect()`). No client-side close route (StreamManager owns the
    x11vnc lifecycle).
- **Task 3 — DISPLAY_ routing** (`105c248f` feat)
  - Lazy-imported `X11DisplayStreamWindow`; added `const DISPLAY_APP_ID_PREFIX =
    'DISPLAY_'` + `isDisplayKind(appId)`.
  - Threaded `isDisplayKind(appId)` into the full-bleed OR chain in
    `WindowContent` and added a `WindowAppContent` branch (before the switch)
    that slices `':N'` off the appId and mounts the VNC window, forwarding
    `windowId`.

## must_haves verification

- **A DISPLAY_ window renders a live, interactive noVNC stream (RFB-native input)** —
  `X11DisplayStreamWindow` calls `useWebAppVnc(wsUrl, {viewOnly: false})`;
  viewOnly:false is the live-input path (RFB forwards mouse+keyboard). Source
  contains no xdotool / `input.click` / per-event dispatch (locked test).
- **openWindow accepts an explicit suggested width/height** — context type +
  callback both carry `suggested?: {width: number; height: number}` (2 source
  hits, locked test); `baseSize = suggested ?? …` and aspect-preserving
  `getResponsiveSize`.
- **window-content routes DISPLAY_ full-bleed** — `isDisplayKind` in the
  full-bleed OR chain + the WindowAppContent branch returning
  `<X11DisplayStreamWindow displayId={displayId} windowId={windowId} />`.

## key_links verification

| From | To | Status |
|------|----|--------|
| x11-display-stream-window.tsx | `trpc.displays.getVncUrl` | `trpcReact.displays.getVncUrl.useMutation()` with `{display: displayId}` |
| x11-display-stream-window.tsx | `useWebAppVnc(wsUrl, {viewOnly:false})` | live interactive RFB |
| window-content.tsx | `X11DisplayStreamWindow` | `appId.startsWith('DISPLAY_')` branch via `isDisplayKind` |

## Threat model dispositions applied

| Threat | Disposition | How |
|--------|-------------|-----|
| T-254-08 (I — wsUrl leak via logs) | mitigate | The component never `console.log`s the wsUrl (locked negative test); wsUrl lives only in component state. Server-side authz is enforced in `displays.getVncUrl` (Plan 01 T-254-01). |
| T-254-09 (E — live input to a non-authorized display) | mitigate | `getVncUrl` (Plan 01) only returns a wsUrl for an owned/host display; the component cannot fabricate a wsUrl. |
| T-254-10 (T — malformed displayId) | mitigate | `displayId` is the slice of a `DISPLAY_:N` appId originating from `displays.list`; `getVncUrl` re-validates with its `^:\d+` zod regex server-side. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking: test/criteria collision] Reworded source comments that referenced `xdotool` / `webapp.input`**
- **Found during:** Task 2 (RED→GREEN)
- **Issue:** The plan's own acceptance criterion requires `rg -n "xdotool|input.click|inputClickMutation"` to return NO matches in the file, and the RED test asserts the same. My explanatory comments (describing *why* the WebApp xdotool path is NOT used here) contained the literal tokens `xdotool` and `webapp.input.*`, tripping the negative invariant.
- **Fix:** Reworded the comments to "canvas event interceptors" / "per-window mutation" — preserves the rationale without the forbidden literals. The behavioral guarantee (no per-event input dispatch) is unchanged.
- **Files modified:** `x11-display-stream-window.tsx`
- **Commit:** `513033a0`

## TDD Gate Compliance

- Task 1: RED `de1e3c35` (`test(254-03)`) → GREEN `d8e9ba56` (`feat(254-03)`). No refactor commit needed.
- Task 2: RED `280f30af` (`test(254-03)`) → GREEN `513033a0` (`feat(254-03)`). No refactor commit needed.
- Task 3 is `type="auto"` (non-TDD) per plan; committed as a single `feat`.

## Known Stubs

None. The window is fully wired to the live `displays.getVncUrl` tRPC + `useWebAppVnc` RFB. No hardcoded empty values, placeholders, or mock data sources.

## tsc gate

`npx tsc --noEmit -p tsconfig.json` for the ui package: the three touched files
emit **zero new non-baseline errors**.
- `window-manager.tsx`: 0 errors.
- `window-content.tsx`: 0 errors.
- `x11-display-stream-window.tsx`: only 2 errors, both `TS2786 'AlertTriangle' /
  'RefreshCw' cannot be used as a JSX component` — the package-wide React-types /
  lucide-icon drift baseline that already affects hundreds of files (including
  `webapp-stream-window.tsx`, the COPY source the plan told me to follow, and
  `apple-spotlight.tsx`, `assistant-ui/*`, etc.). Zero errors mention
  `getVncUrl`, `display`, `useWebAppVnc`, or any of the component's own wiring —
  the tRPC + hook integration is fully type-correct. Fixing the lucide JSX
  baseline would require a package-wide React-types/tsconfig change (out of
  scope, would touch hundreds of unrelated files).

## Notes for downstream plans

- **Plan 04 (hover panel)** opens a display window by calling
  `openWindow('DISPLAY_' + display, route, title, icon, originRect, {width, height})`
  where `{width, height}` is the display's real WxH from `displays.list`. The
  `DISPLAY_:N` appId (note the `:`) is sliced at `'DISPLAY_'.length` so the
  remaining `:N` is passed straight to `getVncUrl`.
- Per Plan 01's note, host `:1` is not yet in `displays.list` and
  `getVncUrl(':1')` returns NOT_FOUND — making `:1` listable/resolvable is
  separate-plan scope (CONTEXT #2/#3), not this plan.

## Tests

21/21 pass across the two test files:
- `window-manager.test.tsx` (15 — includes the 3 new Phase 254-03 invariants).
- `x11-display-stream-window.test.tsx` (6 new).

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx`
- FOUND: `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.test.tsx`
- FOUND: commit `de1e3c35` (Task 1 RED)
- FOUND: commit `d8e9ba56` (Task 1 GREEN)
- FOUND: commit `280f30af` (Task 2 RED)
- FOUND: commit `513033a0` (Task 2 GREEN)
- FOUND: commit `105c248f` (Task 3)
