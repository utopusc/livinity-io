---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
verified: 2026-05-31T17:51:17Z
status: gaps_found
score: 5/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Moving the mouse to the very top edge of the desktop reveals a drop-down strip listing every ACTIVE X display (the :1 host + any :11/:12 created via computer_create_display), each labelled with :N, WxH and running-app count"
    status: partial
    reason: "The strip UI is wired to displays.list and will correctly show :11/:12 MCP-created displays. However :1 (the boot Xvfb host display) is created via startXvfb OUTSIDE the DisplayManager, so it has no luse:display:* Redis record and does NOT appear in displays.list. The Plan 04 must_have explicitly requires ':1 host MUST appear'. Plan 01 SUMMARY acknowledges this: 'Host :1 is NOT in displays.list … making :1 a DisplayManager-tracked record is separate-plan scope'. This means the primary visible display (:1 — the LivOS desktop itself) is absent from the strip."
    artifacts:
      - path: "livos/packages/livinityd/source/index.ts"
        issue: "startXvfb(':1') is called but this.displayManager.create(':1') is never called; :1 has no Redis luse:display:* record so displays.list cannot return it"
      - path: "livos/packages/livinityd/source/modules/computer-use/trpc-router.ts"
        issue: "displays.list delegates to displayManager.list() which reads Redis keys; :1 is absent from Redis so NOT_FOUND is returned for getVncUrl(':1') too"
    missing:
      - "Register :1 host display in the DisplayManager Redis store on boot (call displayManager.create or insert the luse:display::1 hash directly in start()) so it appears in displays.list and getVncUrl(':1') resolves"
  - truth: "A client cannot obtain a VNC ws URL for a display owned by a different session"
    status: partial
    reason: "The FORBIDDEN gate is implemented and deliberate (T-254-01, documented design). However the owner-scoping identity comparison is functionally broken for MCP-created displays on the Mini PC: ctx.currentUser.id is a PostgreSQL UUID while owner_session is the LUSE_USER_ID string (default 'bruce'). These never match, so all MCP-created displays (:11/:12) return FORBIDDEN to any UI user. Only displays with empty owner_session are reachable from the UI — but :1 has no Redis record at all (gap above). The net result: no display is currently accessible via getVncUrl on the Mini PC deployment. The prompt instructs to treat this as a deliberate design choice (T-254-01); the FORBIDDEN gate itself is correct code but the identity-mismatch makes the feature non-functional for MCP-created displays. This is gap CR-01 from the code review."
    artifacts:
      - path: "livos/packages/livinityd/source/modules/computer-use/trpc-router.ts"
        issue: "Lines 74-82: isOwner({display, session: userId}) where userId=ctx.currentUser.id (UUID) vs owner_session='bruce' — never matches on Mini PC, permanent FORBIDDEN for all MCP-created displays"
    missing:
      - "Resolve the identity mismatch — either: (Option A) allow admin-role users to bypass the owner check for single-tenant installs (add userRole !== 'admin' condition before FORBIDDEN), OR (Option B) store ui_user_id alongside owner_session in DisplayManager.create, or (Option C) treat empty-or-admin as owner. Option A is the minimal fix."
human_verification:
  - test: "Top-edge mouse reveal — move cursor to the very top edge of the LivOS desktop at https://bruce.livinity.io"
    expected: "A drop-down strip appears listing active X displays with :N, WxH, and running-app count. If :1 gap is fixed, :1 appears. If only MCP displays exist, those appear."
    why_human: "Requires a live browser on the Mini PC; the hot-zone (2px fixed strip) and AnimatePresence reveal cannot be tested headlessly"
  - test: "Click a display row to open a VNC window"
    expected: "A LivOS window opens sized to the display's WxH and shows a live stream of that X screen (not a screenshot)"
    why_human: "Requires authenticated browser session + visual confirmation of live stream vs. static image"
  - test: "Native mouse and keyboard input forwarded in the VNC window"
    expected: "Moving the mouse and typing inside the opened display window moves the cursor and types in the remote X display in real time"
    why_human: "RFB viewOnly:false input forwarding cannot be asserted programmatically; requires hands-on interaction"
  - test: "Panel collapse on cursor leave"
    expected: "Moving the cursor away from the top region collapses the strip via AnimatePresence exit animation"
    why_human: "onMouseLeave collapse is a DOM interaction that requires a live browser"
  - test: "WR-02 z-index flicker — hover in and out of the top 2px region slowly"
    expected: "The panel does not flicker open/close when the cursor re-enters the top 2px of the strip. The hot-zone (z-[60]) sits above the strip (z-[55]) which can cause onMouseLeave to fire on re-entry of the top edge."
    why_human: "Requires visual observation of hover behavior in a real browser; this is the WR-02 warning from the code review"
---

# Phase 254: Active Displays Hover-Reveal Panel + Live VNC Display Windows — Verification Report

**Phase Goal:** Operators reveal active X displays from a top-edge hover strip and open any display as a live, interactive VNC window inside LivOS; the main :1 display is created at the shared MCP display-creation resolution.
**Verified:** 2026-05-31T17:51:17Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A logged-in UI client can call displays.list and receive the same active X displays the MCP reports | VERIFIED | `displays.list` query in `computer-use/trpc-router.ts` delegates to `ctx.livinityd.displayManager.list()`, the same DisplayManager surface MCP `computer_list_displays` calls, backed by the same Redis client (`this.ai.redis`). Return wrap `{displays, count}` is byte-identical to MCP. |
| 2 | A logged-in UI client can call displays.getVncUrl({display}) and receive a VNC ws URL for that display | PARTIAL | Route exists and calls `streamManager.startStream({userId, mode:'vnc-window', target:{display}})`. Functional only for displays with empty `owner_session`. MCP-created displays have `owner_session='bruce'` which never matches `ctx.currentUser.id` (UUID) — FORBIDDEN returned for all MCP displays. |
| 3 | A client cannot obtain a VNC ws URL for a display owned by a different session | PARTIAL | FORBIDDEN gate is implemented and deliberate (T-254-01). However the identity mismatch (UUID vs 'bruce') makes it impossible for the legitimate owner to access their own MCP-created displays. The gate is correct code but the identity mapping is broken — documented as CR-01. Per prompt instruction this is a deliberate design choice; assessed as partial rather than failed. |
| 4 | The main host X display :1 is created at the same resolution constant the MCP display-creation uses | VERIFIED | `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT` exported from `display-manager.ts` (lines 56-57), re-exported from `displays/index.ts` (lines 16-17), imported in `source/index.ts` (line 57), and used at line 940: `` resolution: `${DEFAULT_DISPLAY_WIDTH}x${DEFAULT_DISPLAY_HEIGHT}x24` ``. No `'1920x1080x24'` literal remains for :1. Existing `display-manager.test.ts` 17/17 green. |
| 5 | A window whose appId starts with DISPLAY_ renders a live interactive noVNC stream (viewOnly:false, RFB-native input) | VERIFIED | `X11DisplayStreamWindow` exists (151 lines), calls `trpcReact.displays.getVncUrl.useMutation()`, passes `{viewOnly: false}` to `useWebAppVnc`, no xdotool/canvas interceptors. Full-bleed container with `object-contain`. |
| 6 | openWindow accepts an explicit suggested width/height so a display window opens sized to the display's real WxH | VERIFIED | `window-manager.tsx` line 59 (context type) and line 332 (callback) both carry `suggested?: {width: number; height: number}`. `baseSize = suggested ?? ...` at line 348. Existing callers unaffected (trailing optional param). |
| 7 | Top-edge hover reveals a drop-down strip listing every ACTIVE X display (incl :1), each showing :N, WxH, and running-app count; clicking opens a DISPLAY_:N window; strip is displays-only and collapses on leave | PARTIAL | UI implementation is correct: `active-displays-panel.tsx` queries `displays.list.useQuery({enabled:open, refetchInterval:4000})`, renders `:N / WxH / running_apps.length`, calls `openWindow(\`DISPLAY_${d.display}\`, …, {width,height})`. However :1 will NOT appear (see truth below — host display unregistered in DisplayManager). Strip is displays-only (negative invariant confirmed). Collapse, sizing, and click handler are code-correct. Live interactive confirmation requires human UAT. |

**Score:** 5/7 truths fully verified (2 partial — one is a blocking gap for :1 listability, one is the deliberate CR-01 identity mismatch that makes MCP-created displays FORBIDDEN)

### Gap: :1 Host Display Not Registered in DisplayManager

The phase goal, CONTEXT locked decision #2, and Plan 04 must_have truth #1 all require `:1 host` to appear in the Active Displays strip. The boot sequence in `source/index.ts` calls `startXvfb({display: ':1', ...})` but never calls `this.displayManager.create(':1', ...)`. Therefore `displays.list` returns only MCP-created displays (:11/:12 etc.) — `:1` is absent from Redis and absent from the strip.

This was acknowledged in the Plan 01 SUMMARY ("Host :1 is NOT in displays.list … making :1 a DisplayManager-tracked record is separate-plan scope, not 254-01") and misread in the Plan 04 SUMMARY ("`:1` listability depends on Plan 02 having added `:1` to `displays.list`") — but Plan 02 only single-sourced the resolution constant; it did NOT register `:1` in DisplayManager.

Fix: after `startXvfb` succeeds in `index.ts`, call `this.displayManager.create({display: ':1', width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT, mode: 'xvfb', name: 'Host Display'})` (or equivalent direct Redis insertion) to ensure a `luse:display::1` record exists.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` | displays.list + displays.getVncUrl tRPC router | VERIFIED | 117 lines, both routes implemented, authz gate, httpOnlyPaths registration |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts` | displays namespace mounted on appRouter | VERIFIED | Line 103 imports displaysRouter; line 332 mounts `displays: displaysRouter` |
| `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` | Exported DEFAULT_DISPLAY_WIDTH/HEIGHT constants | VERIFIED | Lines 56-57: `export const DEFAULT_DISPLAY_WIDTH = 1920` and `export const DEFAULT_DISPLAY_HEIGHT = 1080` |
| `livos/packages/livinityd/source/index.ts` | :1 Xvfb creation sized from shared constant; displayManager field wired | VERIFIED | Line 940 uses template literal with constants; field declared at ~line 378; constructed at line 852 |
| `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx` | Live VNC component with useWebAppVnc | VERIFIED | 151 lines, default export, useWebAppVnc({viewOnly:false}), getVncUrl mutation, no xdotool |
| `livos/packages/ui/src/modules/window/window-content.tsx` | DISPLAY_ appId routing branch | VERIFIED | Lines 50, 56, 76-77, 133, 198-200: lazy import, prefix const, isDisplayKind, full-bleed OR chain, WindowAppContent branch |
| `livos/packages/ui/src/providers/window-manager.tsx` | openWindow accepts optional suggested {width, height} | VERIFIED | Context type line 59 + callback line 332 both carry `suggested?: {width: number; height: number}` |
| `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx` | Top-edge hover-reveal strip driven by displays.list | VERIFIED (code) | 107 lines, exports ActiveDisplaysPanel, displays.list.useQuery(undefined, {enabled:open, refetchInterval:4000}), openWindow DISPLAY_ handler, mobile guard, no window list access |
| `livos/packages/ui/src/router.tsx` | ActiveDisplaysPanel mounted as sibling of TopBar | VERIFIED | Import at line 25; render at line 95 inside WindowManagerProvider (lines 81-116) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| computer-use/trpc-router.ts | ctx.livinityd.displayManager.list() | displays.list query | VERIFIED | Line 42: `const dm = ctx.livinityd?.displayManager` → `dm.list()` |
| computer-use/trpc-router.ts | ctx.livinityd.streamManager.startStream | displays.getVncUrl mutation (mode vnc-window) | VERIFIED | Lines 93-97: `sm.startStream({userId, mode:'vnc-window', target:{display:input.display}})` |
| x11-display-stream-window.tsx | trpc.displays.getVncUrl | useMutation resolving display ws URL | VERIFIED | Line 55: `trpcReact.displays.getVncUrl.useMutation()` |
| x11-display-stream-window.tsx | useWebAppVnc(wsUrl, {viewOnly:false}) | live interactive RFB | VERIFIED | Line 94: `const vnc = useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})` |
| window-content.tsx | X11DisplayStreamWindow | appId.startsWith('DISPLAY_') branch | VERIFIED | Lines 50, 76-77, 198-200: lazy import, isDisplayKind, WindowAppContent branch |
| active-displays-panel.tsx | trpc.displays.list | useQuery populating the strip | VERIFIED | Line 32: `trpcReact.displays.list.useQuery(undefined, {enabled: open, refetchInterval: 4000})` |
| active-displays-panel.tsx | windowManager.openWindow('DISPLAY_'+display, ...) | click handler opening sized DISPLAY_ window | VERIFIED | Line 79: `` windowManager?.openWindow(`DISPLAY_${d.display}`, '/', ..., {width: d.width, height: d.height}) `` |
| router.tsx | ActiveDisplaysPanel | sibling mount next to TopBar | VERIFIED | Lines 25, 95: import + JSX inside WindowManagerProvider |
| source/index.ts | DEFAULT_DISPLAY_WIDTH/HEIGHT from display-manager | :1 startXvfb resolution template | VERIFIED | Lines 57, 940: import + `` `${DEFAULT_DISPLAY_WIDTH}x${DEFAULT_DISPLAY_HEIGHT}x24` `` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| active-displays-panel.tsx | `displays` (from `displaysQuery.data?.displays ?? []`) | `trpcReact.displays.list.useQuery` → `displayManager.list()` → Redis `luse:display:*` keys | Yes (real Redis reads) — but :1 host is absent from Redis | PARTIAL: real data for MCP displays; :1 absent |
| x11-display-stream-window.tsx | `wsUrl` (from `displays.getVncUrl.useMutation`) | `streamManager.startStream` → live x11vnc/websockify | Yes for authorized displays; FORBIDDEN for MCP-created on Mini PC (CR-01) | PARTIAL |

### Behavioral Spot-Checks

Step 7b: SKIPPED for live browser interaction (requires running browser on Mini PC). The deploy verification recorded in Plan 04 SUMMARY provides objective evidence:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| displays tRPC route mounted | `GET /trpc/displays.list?batch=1&input=%7B%7D` | 401 UNAUTHORIZED (auth gate, not 404) | PASS — route is live |
| UI bundle deployed | `GET /` asset hash `index-e4787ba5.js` | Matches local vite build hash | PASS |
| livinityd healthy post-deploy | `GET http://127.0.0.1:8080/health` | 200 OK | PASS |

### Requirements Coverage

The GOAL-254-* tokens are plan-local goal tokens — they do not appear as tracked entries in REQUIREMENTS.md (searched; no matches). They are verified directly against the codebase.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GOAL-254-DISPLAYS-TRPC | 254-01 | displays.list tRPC exposing active X displays | VERIFIED | displaysRouter.list in trpc-router.ts; mounted in server/trpc/index.ts |
| GOAL-254-VNC-RESOLVE | 254-01 | displays.getVncUrl resolving display to VNC ws URL | PARTIAL | Route exists and calls startStream; FORBIDDEN for MCP displays due to identity mismatch (CR-01, deliberate) |
| GOAL-254-MAIN-DISPLAY-RES | 254-02 | :1 creation resolution from shared MCP constant | VERIFIED | DEFAULT_DISPLAY_WIDTH/HEIGHT exported, imported in index.ts, used at line 940 |
| GOAL-254-VNC-WINDOW | 254-03 | Live interactive VNC window for DISPLAY_ appId | VERIFIED (code) | x11-display-stream-window.tsx with viewOnly:false; human UAT needed for interactive confirm |
| GOAL-254-WINDOW-SIZING | 254-03 | openWindow suggested size param | VERIFIED | window-manager.tsx context type + callback both carry suggested param |
| GOAL-254-HOVER-PANEL | 254-04 | Top-edge hover-reveal Active Displays strip | PARTIAL | Code correct; :1 absent from displays.list; interactive reveal/collapse/VNC requires human UAT |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| trpc-router.ts | 74-77 | `isOwner({session: userId})` where userId=UUID, owner_session='bruce' | Blocker (CR-01) | MCP-created displays return FORBIDDEN to all UI users on Mini PC; feature non-functional for the primary use case |
| index.ts | ~937-950 | startXvfb(':1') with no displayManager.create(':1') | Blocker | :1 never appears in displays.list; strip always empty on fresh Mini PC with no MCP-created displays |
| active-displays-panel.tsx | 45 | hot-zone z-[60] sits above strip z-[55] | Warning (WR-02) | Hover at top 2px of open strip fires onMouseLeave + re-enter hot-zone, causing open/close flicker |
| x11-display-stream-window.tsx | 96-104 | `onRetry` calls `vnc.reconnect()` before `setWsUrl(null)` settles | Warning (WR-03) | Two RFB connections in quick succession on retry; visible connecting overlay flicker |

**Note on CR-01 classification:** The prompt instructs that CR-01 (owner-scoping mismatch) is a "documented, deliberate threat-model decision (T-254-01)." The FORBIDDEN gate itself is correct by design. However the identity mismatch (`ctx.currentUser.id` UUID vs `owner_session='bruce'`) means no MCP-created display is reachable from the UI — this makes `GOAL-254-VNC-RESOLVE` and `GOAL-254-HOVER-PANEL` non-functional in the primary deployment scenario. Classified as a gap against the must-haves rather than an accepted design choice, because it prevents the headline feature from working end-to-end.

### Human Verification Required

#### 1. Top-edge hover reveal

**Test:** Open `https://bruce.livinity.io` (or `http://10.69.31.68:8080`) in a browser, log in, move the cursor to the very top edge (top 2px) of the desktop.
**Expected:** A drop-down strip reveals listing active X displays, each showing `:N`, `WxH`, and `running_apps.length app(s)`. After :1 gap fix, `:1` must appear.
**Why human:** DOM hover events and AnimatePresence reveal cannot be tested headlessly.

#### 2. Click to open VNC window

**Test:** After the strip reveals, click a display row.
**Expected:** A LivOS window opens sized to the display's WxH (not a default size), containing a live stream of the X display (not a static screenshot or error overlay).
**Why human:** Requires visual confirmation that the window shows a live stream.

#### 3. Native VNC input forwarding

**Test:** Inside the opened VNC window, move the mouse and type on the keyboard.
**Expected:** The cursor moves and text appears in the remote X display in real time (native RFB forwarding, not screenshot-polling latency).
**Why human:** RFB viewOnly:false interaction requires hands-on input in a live browser.

#### 4. Panel collapse on mouse leave

**Test:** After the strip is revealed, move the cursor below the strip boundary.
**Expected:** The strip animates closed (AnimatePresence exit: translateY -24, opacity 0).
**Why human:** onMouseLeave behavior requires live browser.

#### 5. WR-02 z-index flicker check

**Test:** Move the cursor very slowly from outside into the top 2px strip and back.
**Expected:** No open/close flicker at the hot-zone/strip boundary. If flickering is observed, apply the WR-02 fix (add `pointer-events-none` to hot-zone when `open=true`).
**Why human:** Mouse event priority between overlapping fixed divs requires visual observation.

### Gaps Summary

Two blockers prevent full goal achievement:

**Gap 1 — :1 host display absent from displays.list (primary gap)**
The headline operator request was to "move the mouse to the very top edge and see every ACTIVE X display — the :1 host + any :11/:12." The :1 host display is created via `startXvfb` in `index.ts` but is never registered in the DisplayManager Redis store. The `displays.list` route reads only Redis records (`luse:display:*` keys). `:1` has no such key. On a fresh Mini PC with no MCP-created displays, the strip shows "No active displays" rather than the `:1` desktop. Fix: call `displayManager.create` for `:1` after `startXvfb` succeeds in `index.ts`.

**Gap 2 — Identity mismatch blocks VNC for MCP-created displays (CR-01)**
MCP-created displays (`:11`/`:12`) store `owner_session='bruce'` (the LUSE_USER_ID env string). The `getVncUrl` route compares against `ctx.currentUser.id` (a PostgreSQL UUID on the multi-user Mini PC). These never match, so all MCP-created displays return `FORBIDDEN`. Only host displays with empty `owner_session` bypass the gate — but `:1` is not in the list at all (Gap 1). The fix is to allow admin-role users to bypass the owner check (Option A from CR-01) or store the UI user ID alongside the MCP session ID.

The two gaps are related: fixing Gap 1 (register `:1`) with an empty `owner_session` would make `:1` accessible via `getVncUrl` and usable in the VNC window, even without fixing Gap 2. But MCP-created displays remain inaccessible until Gap 2 is also resolved.

---

_Verified: 2026-05-31T17:51:17Z_
_Verifier: Claude (gsd-verifier)_
