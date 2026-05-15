# Phase 131 — Pinned-Windows Architecture: Context Seed

> Drafted 2026-05-15 after Phase 130-09 ship + user UAT.
> Status: PLANNED — awaiting full PLAN.md via `/gsd-plan-phase 131`.
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
> on `liv/packages/core/src/sdk-agent-runner.ts`.

## Why this phase exists

The TopBar pinned-windows shelf shipped in Phase 130-09 with three
load-bearing gaps:

1. **Drag-to-pin doesn't actually work end-to-end on Mini PC.** The
   `setWindowDragState` / `emitWindowDragDrop` pipeline was wired but
   the user reports "bu sefer pencere surukle birak calismiyor" — the
   release-over-shelf gesture either isn't broadcasting `dragend`, the
   shelf hit-test misses, or the mousemove listener that drives the
   highlight is racing with the window's own move handler. Needs root-
   cause diagnosis + fix (Plan 131-01).

2. **Pinned state is in-memory only.** Phase 130-09 explicitly removed
   the localStorage `liv:topbar:pinnedWindows` cache because persisting
   just the windowId is meaningless without persisting the WHOLE
   window (route, position, size, app-specific session). On a page
   reload all pinned chips disappear. The user explicitly asked:
   > "ben calistiriridigim pencereler buraya koydugumda ben bir yere
   >  gittikten sonra bilene calissin istiyorum"
   = pinned windows should survive page navigation AND keep running
   in the background even when the user leaves the site.

3. **No background runtime.** Today every window is a React subtree.
   When the WindowManager unmounts (e.g. user navigates away, refresh,
   tab close), the window stops. A "background-running" pinned window
   needs:
   - State persistence (route + app-state)
   - Session continuity (WebSocket streams, agent threads, etc. need
     to survive the React unmount on the user's screen)
   - A reattach path (when the user returns, the same session resumes
     where it left off)
   - AI-control hooks (agents reading + sending input to a pinned
     window's session)

## Hard constraints inherited from project memory

- **Sacred SHA:** `liv/packages/core/src/sdk-agent-runner.ts` SHA stays
  `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Verify before/after
  every commit per the v36 phase discipline.
- **D-NO-PROD-IMPACT on Mini PC `livos/install.sh` and `update.sh`.**
  Plan 131 changes the application code; the deploy/bootstrap scripts
  stay untouched.
- **Window logic, not URL routes** (`feedback_livos_window_logic_no_url_routing`).
  Pinned windows are dock-window-shaped, NOT new browser routes.
- **Subscription-only AI path** (`feedback_subscription_only`). Any AI
  agent hooks added in Plan 131-04 use the broker subscription path
  (sdk-agent-runner) — no raw `@anthropic-ai/sdk` fallback.
- **v36 micro-commit rule** (`feedback_v36_no_bold_redesigns`). Plan
  131 ships as multiple small commits, each verified by the user in
  isolation. No big-bang rewrite.

## What Phase 130-09 ALREADY shipped (the foundation 131 builds on)

- `WindowState.isPinnedToTopBar?: boolean` field (see
  `livos/packages/ui/src/providers/window-manager.tsx`).
- `pinWindowToTopBar(windowId)` / `unpinWindowFromTopBar(windowId)`
  reducer actions + context methods.
- `Window` component morphs to/from the TopBar drop-zone position
  via spring transition when the flag flips (scale 0.1 + opacity 0).
- `TopBar` reads `pinnedWindows` from `windowManager.windows.filter(
  w => w.isPinnedToTopBar)`.
- `providers/window-drag-state.ts` external store with
  `useWindowDragState()` + `onWindowDragDrop()`.
- `modules/window/window.tsx` `handleDragStart` broadcasts the drag
  state; `handleMouseUp` emits the drop event with cursor coords.
- `modules/desktop/top-bar.tsx` hit-tests cursor against
  `dropZoneRef.current.getBoundingClientRect()` and calls
  `pinWindowToTopBar` when the release lands inside.

The DOM/event wiring is in place. The bug (item 1 above) is somewhere
inside the existing wiring — not a structural gap.

## Scope candidates for 131

### Plan 131-01 — Drag-to-pin bug fix
- Reproduce on Mini PC + capture exact failure (which event drops?).
- Hypotheses:
  - `setWindowDragState` import cycle (window-drag-state imported by
    both window.tsx + top-bar.tsx; module instance might not be shared
    in dev HMR).
  - `handleMouseUp` signature accepts `e?: MouseEvent` but native
    `mouseup` from `document.addEventListener` passes a different
    event shape than React `MouseEvent`. Coords might be undefined.
  - The drag-state listener in TopBar fires the chip render, but the
    shelf bbox changes mid-flight (expand animation), so the hit-test
    happens against stale rect.
  - `useEffect` cleanup order: when isDragging flips false, the
    mousemove listener is removed BEFORE the drop event fires.
- Fix + commit + UAT screenshot of a real window dragged onto the bar.

### Plan 131-02 — Persistent pinned-window registry
- Add a `pinnedWindows` table to PostgreSQL (or a Redis hash; pick
  via discuss-phase): `{user_id, window_id, app_id, route, title, icon,
  position, size, pinned_at, last_seen, payload_json}`.
- tRPC procedures: `pinnedWindows.list`, `.upsert`, `.delete`.
- On `pinWindowToTopBar` action, mirror to backend.
- On `WindowManagerProvider` mount, hydrate from backend.
- Page refresh: pinned chips reappear with their previous state.
- Decide whether unpinned-but-just-shipped chip persists if the user
  unpinned mid-flight (race condition).

### Plan 131-03 — Background runtime
- Hardest plan. Pick approach via discuss-phase. Candidates:
  - **A. Service Worker host:** spawn a service worker that owns
    the long-lived sessions; the React UI just renders a view. When
    the tab closes, the SW keeps running (within OS limits).
  - **B. Backend hermes runner:** the existing livinityd hermes
    process hosts the session; React just streams a view. When the
    user closes the tab, the session keeps going on the server.
    Most robust, biggest scope. Probably the right call given
    livinityd already runs hermes for AI sessions.
  - **C. Hybrid:** lightweight apps (AI Chat) → SW; heavy apps
    (WebApp stream windows, Files watch) → backend hermes.
- Define the "session" contract per app type. AI Chat session =
  conversation id + ws connection. WebApp = bytebot/chrome handle.
  Files = current path + watch subscription.

### Plan 131-04 — AI control of pinned windows
- Once windows survive in the background, agents need to read +
  write to them. Add a `livinityd.pinnedWindows` API for agents:
  - `list-pinned` → enumerate pinned windows
  - `read-pinned <id>` → snapshot of current state / screen
  - `send-input <id> <event>` → keyboard / mouse / message
  - `wait-for <id> <predicate>` → block until condition
- Wire to existing agent tool dispatch (sdk-agent-runner).
- Threat model: agents could spam pinned windows. Rate-limit + per-
  window allowlist.

### Plan 131-05 — TopBar shelf polish
- Chip hover preview (small thumbnail of the live pinned window).
- Chip drag = unpin + drop somewhere else on the desktop.
- Chip right-click = context menu (close, restore-with-position).
- Empty-shelf hint inside the dashed area.

### Plan 131-06 — UAT walk + docs
- Full Mini PC live test of every flow above.
- Update PROJECT.md with the new architecture chapter.
- Memory snapshot of decisions made (which background-runtime
  approach, which storage backend).

### Plan 131-07 — Carry-over bug fixes
- Anything 131-01 surfaces that doesn't deserve its own plan.

## Open questions for `/gsd-discuss-phase 131`

1. **Background runtime: SW vs backend hermes?**
2. **Storage backend: Postgres vs Redis?**
3. **Per-app session contract: granular or generic?**
4. **AI control surface: tRPC vs MCP tool?**
5. **How aggressive is the "survive site close" requirement?**
   Phase 1 = page refresh works. Phase 2 = tab close works.
   Phase 3 = browser close works. Phase 4 = user signs out works.
6. **Mobile behavior:** TopBar already hides on mobile. Pinned
   shelf moot on mobile?
7. **Pin limit:** Max N pinned windows? Storage / runtime cost?
8. **Unpin: restore-to-previous-position or open-fresh?**

## Resume command after `/clear`

> "phase 131 başla — pinned-windows architecture. CONTEXT at
>  .planning/phases/131-pinned-windows-architecture/131-CONTEXT.md.
>  Run /gsd-discuss-phase 131 then /gsd-plan-phase 131."
