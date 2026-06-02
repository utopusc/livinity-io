---
phase: 255-livos-spaces-displays-popover-webapp-visibility-in-display-l
status: discussed
source: brainstorming session 2026-06-02 (interactive, user-validated)
milestone: v44.0
depends_on: [254]
locked_decisions: 6
---

# Phase 255 — LivOS Spaces (CONTEXT)

## Goal

Operators see ALL active X displays — the host `:1`, any MCP-created display, AND their
installed WebApps — as **live-preview cards** in a single navbar **"Displays" popover**. The
popover REPLACES the Phase 254 top-edge 2px hover strip and MERGES the existing
windows-manager popover (one surface, no duplication). Clicking a card opens the display as
the existing interactive VNC window (Phase 254-03). Opened displays render inside a **branded
LivOS desktop shell** (LivOS wallpaper + design-token-themed window manager + slim LivOS dock)
instead of bare fluxbox. The navbar clock/weather area gets a **creative, additive** glow-up.

## Requirements (falsifiable)

- **GOAL-255-DISPLAYS-POPOVER** — A single `🖥️` button in the TopBar opens a glass popover
  listing every active display from `displays.list` as a card. The Phase 254-04 top-edge 2px
  hover strip (`active-displays-panel.tsx`) is removed, and the existing "Windows manager"
  popover (`windows-manager-panel.tsx`, the `LayoutGrid` button) is folded into this one
  surface. Truth: on the deployed Mini PC there is exactly ONE display/windows surface reachable
  from the navbar, not a hover strip + a separate popover.
- **GOAL-255-LIVE-THUMBS** — Each card shows a lightweight, auto-refreshing (~2s) **JPEG
  screenshot** preview of that display. The popover must NOT open N concurrent noVNC/RFB
  connections; full live VNC happens only when a display is opened as a window. Truth: with 4
  displays open the popover issues periodic screenshot fetches, not 4 live RFB sockets.
- **GOAL-255-WEBAPP-DISPLAYS** — `WebAppWindowManager.spawn()` registers its Xvfb `:N` into
  `displayManager` (via `displayManager.create(...)` or an equivalent register call, owner =
  the WebApp's user session, name = the WebApp name), and `close()` unregisters it
  (`displayManager.kill(...)`). Truth: after installing/opening a WebApp, its `:N` appears in
  `displays.list` and therefore in the popover; after closing it disappears. Closes the
  architectural gap where WebApp displays were spawned but never written to Redis.
- **GOAL-255-LIVOS-SHELL** — Opened X displays render a branded LivOS shell: LivOS-branded
  wallpaper (feh), fluxbox themed from `@livinity/design-tokens` colors/fonts, and a slim
  LivOS-styled dock. Applies to `:1` always; WebApp displays keep it minimal (their content is
  the app). Truth: opening `:1` shows a LivOS-branded desktop (wallpaper + dock), not a bare
  gray fluxbox root.
- **GOAL-255-NAVBAR-GLOWUP** — `ClockWithLocation` is refreshed: open-meteo `weather_code` →
  condition glyph (☀️/☁️/🌧️ etc.), day/night-aware accent, a short greeting (e.g. "İyi
  geceler, Bruce"); the Displays `🖥️` button sits beside it. STRICTLY ADDITIVE — no teardown of
  the existing pill/donut/profile layout. Truth: the existing TopBar structure is intact; the
  clock cluster is visibly richer.

## Locked decisions (from brainstorming — do NOT relitigate)

- **D-255-POPOVER-CONCEPT** — Popover panel chosen over "expanded-bar inline chips" and
  "full-screen Mission-Control overlay". Displays live in a navbar-anchored popover.
- **D-255-SHELL-LIVOS-BRANDED** — In-display look is a LivOS-branded custom shell, chosen over
  "polished fluxbox (themed only)" and "full XFCE desktop". Ubuntu-mimicry is explicitly NOT the
  goal; it must look like LivOS.
- **D-255-THUMBS-SCREENSHOT** — Popover previews are ~2s JPEG screenshots, NOT live RFB. Live
  VNC is reserved for the opened window. (Mini PC perf.)
- **D-255-REPLACE-STRIP-AND-MERGE** — The 254-04 top-edge hover strip is removed and the
  windows-manager popover is merged into the new Displays popover. The user explicitly wants the
  feature "moved into the navbar," and the two existing top surfaces are redundant.
- **D-255-WEBAPP-REGISTER** — WebApps register/unregister their displays in displayManager.
  This is the fix for "my installed WebApps don't show in Active Displays."
- **D-255-NAVBAR-ADDITIVE** — Navbar glow-up is additive only, per
  `feedback_v36_no_bold_redesigns` (this exact TopBar had bold redesigns rejected 2026-05-15;
  ship the smallest visible deltas, screenshot, validate before stacking).

## Architecture grounding (verified this session)

- **WebApp↔display gap (root cause of issue #1):** WebApps DO spawn their own Xvfb
  (`:10`/`:11`…) via `DisplayAllocator.allocate()` in
  `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (~L394-592) +
  `chrome-process-spawner.ts`, but `WebAppWindowManager` has ZERO references to `displayManager`
  and never writes a `luse:display:*` Redis record. `displayManager.list()`
  (`computer-use/displays/display-manager.ts` ~L354-385) reads ONLY Redis → WebApp displays are
  invisible. Fix = call `displayManager.create()` on spawn, `kill()` on close.
- **Reusable assets:**
  - tRPC: `computer-use/trpc-router.ts` — `displays.list`, `displays.getVncUrl`,
    `canAccessDisplay` (254-06). A `displays.screenshot`/thumbnail seam likely needs adding
    (reuse luse/x11 screenshot capture used by `mcp/tools.ts`).
  - `displayManager`: `computer-use/displays/display-manager.ts` — `create`, `list`, `kill`,
    `registerExisting` (254-05), `attachApp`.
  - UI window: `ui/src/modules/window/app-contents/x11-display-stream-window.tsx` +
    `useWebAppVnc` (open-as-window path, `viewOnly:false`).
  - Navbar: `ui/src/modules/desktop/top-bar.tsx` (`ClockWithLocation` ~L516, windows-manager
    `Popover` ~L358, donut ~L289). Strip to remove:
    `ui/src/modules/desktop/active-displays-panel.tsx`. Panel to fold in:
    `ui/src/modules/desktop/windows-manager-panel.tsx`. Mount site: `ui/src/router.tsx`.
  - Boot WM: `livinityd/source/index.ts` (~L928-982 startXvfb `:1` + `startFluxbox` +
    `registerExisting`). Per-webapp fluxbox: `webapps/window-manager.ts` (~L433-449).
  - Design system: `@livinity/design-tokens` (v35) — single source for shell + popover styling.

## Constraints & non-goals

- Mini PC is the ONLY deploy target (Server4/Server5 off-limits). Deploy via
  `bash /opt/livos/update.sh` (root) after `git push origin master`. Phase 254 is live at SHA
  `cd640335`.
- livinityd runs TypeScript via tsx (no compile); UI needs a vite build (handled by update.sh).
- TDD discipline (RED→GREEN) per project norm; do not break Phase 254 displays/auth contracts
  (`canAccessDisplay` isolation, wsUrl never logged).
- Non-goals: XFCE/GNOME install; live RFB thumbnails; touching Server4/5; BYOK; a full TopBar
  teardown. The in-display dock-as-web-shell mechanism (Chromium kiosk vs native panel) is an
  open implementation choice for the planner/research to resolve under D-255-SHELL-LIVOS-BRANDED.
