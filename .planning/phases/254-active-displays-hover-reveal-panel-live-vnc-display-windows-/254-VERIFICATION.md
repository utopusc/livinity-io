---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
verified: 2026-06-02T12:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Gap 1: :1 host display absent from displays.list — closed by 254-05 (registerExisting + boot call)"
    - "Gap 2 / CR-01: getVncUrl UUID-vs-luse-id FORBIDDEN for MCP-created displays — closed by 254-06 (canAccessDisplay admin-bypass)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Top-edge mouse reveal — move cursor to the very top edge of the LivOS desktop at https://bruce.livinity.io"
    expected: "A drop-down strip appears listing active X displays with :N, WxH, and running-app count. :1 host display MUST appear (254-05 ensures it is registered on boot). Strip shows DISPLAYS ONLY — no app windows."
    why_human: "Requires a live browser on the Mini PC; the hot-zone (2px fixed strip) and AnimatePresence reveal cannot be tested headlessly"
  - test: "Click a display row (e.g. :1) to open a VNC window"
    expected: "A LivOS window opens sized to the display WxH and shows a live stream of that X screen (not a screenshot). Admin user should NOT get FORBIDDEN (254-06 admin bypass)."
    why_human: "Requires authenticated browser session + visual confirmation of live stream vs. static image"
  - test: "Native mouse and keyboard input forwarded in the VNC window"
    expected: "Moving the mouse and typing inside the opened display window moves the cursor and types in the remote X display in real time"
    why_human: "RFB viewOnly:false input forwarding cannot be asserted programmatically; requires hands-on interaction"
  - test: "Panel collapse on cursor leave"
    expected: "Moving the cursor away from the top region collapses the strip via AnimatePresence exit animation"
    why_human: "onMouseLeave collapse is a DOM interaction that requires a live browser"
  - test: "WR-02 z-index flicker — hover in and out of the top 2px region slowly"
    expected: "The panel does not flicker open/close when the cursor re-enters the top 2px of the strip"
    why_human: "Requires visual observation of hover behavior in a real browser"
---

# Phase 254: Active Displays Hover-Reveal Panel + Live VNC Display Windows — Verification Report

**Phase Goal:** Operators reveal active X displays from a top-edge hover strip and open any display as a live, interactive VNC window inside LivOS; the main :1 display is created at the shared MCP display-creation resolution.
**Verified:** 2026-06-02T12:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (prior score 5/7, gaps_found)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A logged-in UI client can call displays.list and receive the same active X displays the MCP computer_list_displays reports | VERIFIED | `displaysRouter.list` in `computer-use/trpc-router.ts:75-86` delegates to `dm.list()`, returning `{displays, count}`. Mounted in `server/trpc/index.ts:103+332`. Same DisplayManager Redis surface (`luse:display:*`) the MCP reads. |
| 2 | A logged-in UI client can call displays.getVncUrl({display}) and receive a VNC websocket URL for that display | VERIFIED | `getVncUrl` mutation in `trpc-router.ts:88-148`. Admin-bypass via `canAccessDisplay` (254-06) means the admin operator on Mini PC now receives a wsUrl for MCP-created displays. `:1` has empty `owner_session` after 254-05, so it passes the shared gate for any authenticated user. |
| 3 | A client cannot obtain a VNC ws URL for a display owned by a different session | VERIFIED | `canAccessDisplay` predicate (`trpc-router.ts:64-72`): returns false when `ownerSession` is non-empty AND `callerRole !== 'admin'` AND `callerSession !== ownerSession`. 5-case vitest matrix in `trpc-router-authz.test.ts` — all GREEN. Non-admin member/guest isolation preserved. |
| 4 | The main host X display :1 is created at the same resolution constant the MCP display-creation uses | VERIFIED | `DEFAULT_DISPLAY_WIDTH=1920` / `DEFAULT_DISPLAY_HEIGHT=1080` exported from `display-manager.ts:57-58`, re-exported via `displays/index.ts:16-17`, imported in `index.ts:57`, used at `index.ts:940`: `` `${DEFAULT_DISPLAY_WIDTH}x${DEFAULT_DISPLAY_HEIGHT}x24` ``. No `'1920x1080x24'` literal remains for :1. |
| 5 | A window whose appId starts with DISPLAY_ renders a live interactive noVNC stream (viewOnly:false, RFB-native input) | VERIFIED | `X11DisplayStreamWindow` (`x11-display-stream-window.tsx:51-126`): calls `trpcReact.displays.getVncUrl.useMutation()`, passes `{viewOnly: false}` to `useWebAppVnc` (line 94), no xdotool/canvas interceptors. Full-bleed container. Routing in `window-content.tsx:50,56,76-77,198-200`. |
| 6 | openWindow accepts an explicit suggested width/height so a display window opens sized to the display's real WxH | VERIFIED | `window-manager.tsx:59` (context type) and `window-manager.tsx:332` (callback) both carry `suggested?: {width: number; height: number}`. `baseSize = suggested ?? ...` at line 348. Existing callers unaffected. |
| 7 | Top-edge hover reveals a drop-down strip listing every ACTIVE X display (incl :1), each showing :N, WxH, and running-app count; clicking opens a DISPLAY_:N window; strip is displays-only and collapses on leave | VERIFIED (code) | `active-displays-panel.tsx`: `displays.list.useQuery` at line 32, renders `d.display` / `d.width×d.height` / `d.running_apps.length app(s)`, opens `DISPLAY_${d.display}` with `{width:d.width,height:d.height}` at line 79. Comment at line 4-8 asserts displays-only (no window-manager.windows). Hot-zone + AnimatePresence collapse on `onMouseLeave`. Mounted in `router.tsx:25+95`. `:1` now appears via 254-05 `registerExisting` boot call. Live interactive confirmation requires human UAT. |

**Score:** 7/7 truths verified (code)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/computer-use/trpc-router.ts` | displays.list + displays.getVncUrl + canAccessDisplay predicate | VERIFIED | 159 lines; `export function canAccessDisplay`; `displaysRouter`; admin-bypass wired; wsUrl never logged (line 146 logs only user+display) |
| `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts` | `registerExisting` method + exported DEFAULT_DISPLAY_WIDTH/HEIGHT | VERIFIED | Lines 57-58 export constants; lines 304-352 implement `registerExisting` (Redis-only HSET, idempotent, no spawnFn call); returned in manager object at line 465 |
| `livos/packages/livinityd/source/modules/computer-use/displays/types.ts` | `RegisterExistingInput` type + `registerExisting` in `DisplayManager` interface | VERIFIED | Lines 61-72 `RegisterExistingInput`; lines 156 `registerExisting(input): Promise<DisplayRecord>` in interface |
| `livos/packages/livinityd/source/modules/computer-use/displays/index.ts` | Barrel re-exports DEFAULT_DISPLAY_WIDTH/HEIGHT + RegisterExistingInput | VERIFIED | Lines 16-17 export constants; line 48 exports `RegisterExistingInput` type |
| `livos/packages/livinityd/source/index.ts` | registerExisting boot call after startXvfb(':1'); resolution from shared constants | VERIFIED | Line 940 resolution template; lines 963-982 `if (this.displayManager) { await this.displayManager.registerExisting({display:':1', ownerSession:'', ...}) }` |
| `livos/packages/livinityd/source/modules/computer-use/__tests__/trpc-router-authz.test.ts` | canAccessDisplay 5-case authz matrix | VERIFIED | 49 lines; imports `canAccessDisplay` from `../trpc-router.js`; 5 test cases (empty-owner, admin-bypass, owner-match, non-admin-forbidden, guest-forbidden); all GREEN (254-06 SUMMARY: `e2396bc7` commit) |
| `livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts` | 4 new registerExisting cases (15-18) | VERIFIED | Lines 429-509; Case 15 (hash shape + no spawn), 16 (list returns :1), 17 (idempotent no-clobber), 18 (allocator untouched); 21/21 GREEN (254-05 SUMMARY) |
| `livos/packages/livinityd/source/modules/server/trpc/index.ts` | displaysRouter mounted on appRouter | VERIFIED | Line 103 imports `displaysRouter`; line 332 mounts `displays: displaysRouter` |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | displays.getVncUrl in httpOnlyPaths | VERIFIED | Lines 436-437: comment + `'displays.getVncUrl'` |
| `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx` | Live VNC component with useWebAppVnc({viewOnly:false}) | VERIFIED | 151 lines; `useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})` at line 94; `trpcReact.displays.getVncUrl.useMutation()` at line 55; no xdotool |
| `livos/packages/ui/src/modules/window/window-content.tsx` | DISPLAY_ routing branch | VERIFIED | Lines 50,56,76-77,198-200: lazy import, prefix const, isDisplayKind, full-bleed OR chain, WindowAppContent branch |
| `livos/packages/ui/src/providers/window-manager.tsx` | openWindow accepts optional suggested {width, height} | VERIFIED | Context type line 59 + callback line 332 both carry `suggested?: {width: number; height: number}` |
| `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx` | Top-edge hover-reveal strip driven by displays.list | VERIFIED (code) | 107 lines; exports `ActiveDisplaysPanel`; `displays.list.useQuery` with `{enabled:open, refetchInterval:4000}` at line 32; `openWindow(DISPLAY_${d.display}, ...)` at line 79; comment asserts displays-only; no `windowManager.windows` access |
| `livos/packages/ui/src/router.tsx` | ActiveDisplaysPanel mounted as sibling of TopBar | VERIFIED | Line 25 import; line 95 render inside WindowManagerProvider |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `computer-use/trpc-router.ts` | `ctx.livinityd.displayManager.list()` | `displays.list` query | VERIFIED | Line 83: `dm.list()` |
| `computer-use/trpc-router.ts` | `canAccessDisplay({ownerSession, callerSession, callerRole})` | Authorization before startStream (254-06) | VERIFIED | Lines 113-125: `callerRole = ctx.currentUser?.role ?? 'member'`; `!canAccessDisplay({...})` → FORBIDDEN |
| `computer-use/trpc-router.ts` | `sm.startStream({userId, mode:'vnc-window', target:{display}})` | `getVncUrl` mutation | VERIFIED | Lines 136-140 |
| `index.ts` | `this.displayManager.registerExisting({display:':1', ownerSession:'', ...})` | Boot after startXvfb (254-05) | VERIFIED | Lines 963-982; guarded + try/catch + non-fatal |
| `index.ts` | `DEFAULT_DISPLAY_WIDTH`/`DEFAULT_DISPLAY_HEIGHT` from display-manager | `:1` startXvfb resolution template | VERIFIED | Lines 57+940 |
| `x11-display-stream-window.tsx` | `trpc.displays.getVncUrl.useMutation()` | wsUrl resolution | VERIFIED | Line 55 |
| `x11-display-stream-window.tsx` | `useWebAppVnc(wsUrl ?? undefined, {viewOnly: false})` | Live interactive RFB | VERIFIED | Line 94 |
| `window-content.tsx` | `X11DisplayStreamWindow` | `appId.startsWith('DISPLAY_')` branch | VERIFIED | Lines 50,76-77,198-200 |
| `active-displays-panel.tsx` | `trpc.displays.list.useQuery` | Populating the strip | VERIFIED | Line 32 |
| `active-displays-panel.tsx` | `windowManager.openWindow('DISPLAY_'+display, ..., {width,height})` | Click handler | VERIFIED | Line 79 |
| `router.tsx` | `<ActiveDisplaysPanel />` | Sibling mount next to TopBar | VERIFIED | Lines 25+95 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `active-displays-panel.tsx` | `displays` (from `displaysQuery.data?.displays ?? []`) | `trpcReact.displays.list.useQuery` → `displayManager.list()` → Redis `luse:display:*` keys; on boot `:1` is now written by `registerExisting` | Yes — real Redis reads; `:1` now appears after 254-05 boot call | FLOWING |
| `x11-display-stream-window.tsx` | `wsUrl` (from `getVncUrl.useMutation`) | `streamManager.startStream` → live x11vnc/websockify; admin bypass means admin user now reaches MCP-created displays | Yes for admin (all displays) + any user (shared `:1`); non-admin still FORBIDDEN for foreign displays | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for live browser interaction (requires running Mini PC). The prior deploy verification (Plan 04 SUMMARY) provides objective evidence that routes are live.

| Behavior | Evidence | Status |
|----------|----------|--------|
| `displays.list` tRPC route alive | Prior deploy: `GET /trpc/displays.list?batch=1&input=%7B%7D` → 401 UNAUTHORIZED (auth gate, not 404) | PASS |
| `canAccessDisplay` unit tests | 254-06 SUMMARY: vitest 5/5 GREEN at commit `e2396bc7` | PASS |
| `registerExisting` unit tests | 254-05 SUMMARY: vitest 21/21 GREEN at commit `00348c6d` (Cases 15-18 new) | PASS |
| `:1` registered without spawn | Case 15 asserts `spawnFn` called 0 times; Case 16 asserts `list()` returns `:1`; Case 17 idempotent no-clobber; Case 18 allocator untouched | PASS |

### Requirements Coverage

The GOAL-254-* tokens are plan-local goal tokens — they do not appear as tracked entries in REQUIREMENTS.md (which is v41-scoped). They are verified directly against the codebase.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GOAL-254-DISPLAYS-TRPC | 254-01 | displays.list tRPC exposing active X displays | VERIFIED | `displaysRouter.list` in trpc-router.ts; mounted in server/trpc/index.ts; `:1` appears via 254-05 |
| GOAL-254-VNC-RESOLVE | 254-01, 254-06 | displays.getVncUrl resolving display to VNC ws URL; admin-bypass for MCP-created displays | VERIFIED | `canAccessDisplay` exported predicate wired in getVncUrl; admin reaches MCP displays; non-admin isolation preserved; wsUrl never logged |
| GOAL-254-MAIN-DISPLAY-RES | 254-02 | :1 creation resolution from shared MCP constant | VERIFIED | DEFAULT_DISPLAY_WIDTH/HEIGHT exported, imported in index.ts, used at line 940 |
| GOAL-254-VNC-WINDOW | 254-03 | Live interactive VNC window for DISPLAY_ appId | VERIFIED (code) | x11-display-stream-window.tsx with viewOnly:false; human UAT needed for interactive confirm |
| GOAL-254-WINDOW-SIZING | 254-03 | openWindow suggested size param | VERIFIED | window-manager.tsx context type + callback both carry suggested param |
| GOAL-254-HOVER-PANEL | 254-04, 254-05 | Top-edge hover-reveal Active Displays strip; :1 appears | VERIFIED (code) | Code correct + :1 now registered by boot registerExisting; interactive reveal/collapse/VNC requires human UAT |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `active-displays-panel.tsx` | 45 | Hot-zone `z-[60]` sits above strip `z-[55]` | Warning (WR-02) | Hover at top 2px of open strip may fire onMouseLeave + re-enter hot-zone, causing open/close flicker |
| `x11-display-stream-window.tsx` | 96-104 | `onRetry` calls `vnc.reconnect()` before `setWsUrl(null)` settles | Warning (WR-03) | Two RFB connections in quick succession on retry; visible connecting overlay flicker |

Both are pre-existing warnings from the original code review. Neither prevents the primary feature from working. The two prior blockers (`:1` absent from Redis; admin FORBIDDEN from MCP displays) are CLOSED by 254-05 and 254-06.

### Human Verification Required

#### 1. Top-edge hover reveal

**Test:** Open `https://bruce.livinity.io` in a browser, log in, move the cursor to the very top edge (top 2px) of the desktop.
**Expected:** A drop-down strip reveals listing active X displays, each showing `:N`, `WxH`, and `running_apps.length app(s)`. `:1` MUST appear (written by boot `registerExisting` with empty `owner_session`). Strip shows DISPLAYS ONLY — no LivOS app windows.
**Why human:** DOM hover events and AnimatePresence reveal cannot be tested headlessly.

#### 2. Click to open VNC window (admin user)

**Test:** After the strip reveals, click a display row (e.g. `:1`).
**Expected:** A LivOS window opens sized to the display's WxH, containing a live stream of the X display. An admin user should NOT receive FORBIDDEN — `canAccessDisplay` admin-bypass allows it.
**Why human:** Requires visual confirmation that the window shows a live stream and no FORBIDDEN error overlay.

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

No remaining blocking gaps. Both prior blockers are closed:

- **Gap 1 (closed by 254-05):** `:1` host display absent from `displays.list` — `DisplayManager.registerExisting()` is now called in `index.ts` boot sequence after `startXvfb(':1')` succeeds. The call is Redis-only (no second Xvfb spawn), idempotent, guarded, and non-fatal. 21/21 vitest cases GREEN.

- **Gap 2 / CR-01 (closed by 254-06):** `getVncUrl` returned FORBIDDEN to admin operator on all MCP-created displays due to UUID-vs-luse-id mismatch. The `canAccessDisplay` pure predicate adds an admin-role bypass (Option A). Non-admin isolation preserved. 5/5 vitest cases GREEN.

Outstanding items are visual/interactive behaviors that require browser UAT on the live Mini PC (see Human Verification above).

---

_Verified: 2026-06-02T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
