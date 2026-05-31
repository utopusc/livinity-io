---
phase: 254-active-displays-hover-reveal-panel-live-vnc-display-windows-
plan: 04
subsystem: ui / desktop chrome — Active Displays hover-reveal panel
tags: [ui, desktop, displays, vnc, hover-reveal, top-bar, window-manager, tdd]
requires:
  - displays.list tRPC query (Plan 01) → {displays: DisplayRecord[], count}
  - openWindow(appId, route, title, icon, originRect?, suggested?:{width,height}) (Plan 03)
  - X11DisplayStreamWindow + DISPLAY_:N appId routing (Plan 03)
  - useWindowManagerOptional / useIsMobile / trpcReact / cn (UI primitives)
provides:
  - ActiveDisplaysPanel — top-edge hover-reveal strip listing active X displays
  - displays-only headline UI mounted as a sibling of <TopBar /> in router.tsx
affects:
  - phase 254 closeout (this is the visible payoff plan; consumes 01 + 03)
tech-stack:
  added: []
  patterns:
    - "top-edge hot-zone (fixed inset-x-0 top-0 h-2 z-[60]) → AnimatePresence strip z-[55] above TopBar z-50"
    - "displays.list poll gated on open (enabled:open + refetchInterval:4000) — no polling while closed"
    - "click → openWindow(`DISPLAY_${d.display}`, …, {width,height}) → setOpen(false)"
    - "displays-ONLY (decision #2): never reads the window-manager window list / per-window inventory"
    - "source-text invariant test mirroring windows-manager-panel.test.tsx convention"
key-files:
  created:
    - livos/packages/ui/src/modules/desktop/active-displays-panel.tsx
    - livos/packages/ui/src/modules/desktop/active-displays-panel.test.tsx
  modified:
    - livos/packages/ui/src/router.tsx
decisions:
  - "Mounted <ActiveDisplaysPanel /> immediately after <TopBar /> inside WindowManagerProvider so openWindow is in scope"
  - "Followed the source-text-invariant test convention (readFileSync + regex) used by windows-manager-panel.test.tsx — not a render test — to lock the consumer contract without a tRPC/RFB harness"
  - "Deploy path = scp tarball (UI dist + 6 unpushed livinityd source files) + restart, NOT update.sh — the 254 commits are unpushed to GitHub master so update.sh would clone stale code (plan-sanctioned alternative)"
metrics:
  duration: ~12m
  completed: 2026-05-31
  tasks: 4
  files: 3
---

# Phase 254 Plan 04: Active Displays Hover-Reveal Panel Summary

Built the operator's headline feature (locked decision #2): a top-edge
hover-reveal "Active Displays" strip. Moving the cursor to the very top edge
reveals a drop-down listing every ACTIVE X display from `displays.list` (Plan
01) — the `:1` host plus any `:11`/`:12` created via the luse MCP. Each row
shows `:N`, `WxH`, and a running-app count. Clicking a row opens a LivOS window
(`DISPLAY_:N` appId) sized to the display's real WxH via Plan 03's trailing
`suggested` openWindow param, rendering Plan 03's live interactive
`X11DisplayStreamWindow` (native VNC mouse/keyboard). The strip lists DISPLAYS
ONLY — it never reads the window-manager window list. Cursor-leave collapses
it.

## What shipped

- **Task 1 — ActiveDisplaysPanel (TDD)** (`1990cffc` RED test, `ed7dcf8c` GREEN feat)
  - New `active-displays-panel.tsx` exporting `function ActiveDisplaysPanel()`.
  - Top-edge invisible hot-zone (`fixed inset-x-0 top-0 h-2 z-[60]`,
    `onMouseEnter → setOpen(true)`). Revealed strip is an `AnimatePresence` +
    `motion.div` at `fixed inset-x-0 top-0 z-[55]` (above TopBar's z-50),
    `onMouseLeave → setOpen(false)`. TopBar visual language (rounded-2xl,
    `backdrop-blur-2xl`, `bg-card-bg/78 dark:bg-black/55`, `border-line`).
  - `trpcReact.displays.list.useQuery(undefined, {enabled: open, refetchInterval: 4000})`
    — polls while open so a newly-created display appears within ~4s; no poll
    while closed.
  - One clickable chip per `DisplayRecord`: `:N`, `${width}×${height}`,
    `${running_apps.length} app(s)`. Empty state "No active displays".
  - Click → `windowManager?.openWindow(\`DISPLAY_${d.display}\`, '/', \`Display
    ${d.display}\`, '🖥️', undefined, {width: d.width, height: d.height})` then
    `setOpen(false)`.
  - `useIsMobile()` → `if (isMobile) return null` (mirrors TopBar).
    `useWindowManagerOptional()` guarded (null outside provider).
  - 11/11 source-text invariants pass (including the displays-only negative
    invariant).
- **Task 2 — mount in router.tsx** (`0ffd3cc2` feat)
  - Imported `{ActiveDisplaysPanel}` next to the `TopBar` import; rendered
    `<ActiveDisplaysPanel />` immediately after `<TopBar />`, inside the same
    `<WindowManagerProvider>` scope (so `openWindow` is reachable).
- **Task 3 — build + deploy to Mini PC** (no source commit — build artifacts gitignored)
  - `pnpm --filter @livos/config build` (tsc clean) + `pnpm --filter ui build`
    (vite clean, `✓ built in 29.84s`, entry bundle `assets/index-e4787ba5.js`).
  - Deployed to Mini PC (Tailscale `bruce@100.112.68.1`). See deploy note below.
- **Task 4 — operator browser walk (checkpoint:human-verify)**
  - Auto-mode (`workflow.auto_advance=true`) → **auto-approved** per checkpoint
    protocol. The interactive VNC reveal/click/live-input/collapse walk is
    deferred to the operator UAT pass (it cannot be performed headlessly).
    Code + deploy verified objectively (below).

## must_haves verification

- **Top edge reveals a drop-down strip listing active X displays (incl :1),
  each with :N / WxH / running-app count** — `displays.list.useQuery` populates
  the strip; each row renders `d.display`, `${d.width}×${d.height}`,
  `${d.running_apps.length} app(s)`. (`:1` listability depends on Plan 02 having
  added `:1` to `displays.list`, per the prior-wave note.)
- **The strip lists X DISPLAYS only — not LivOS app windows / list_windows** —
  the source contains zero references to the window-manager window list or
  per-window enumeration (negative invariant test + plan `rg` check both pass).
  A code comment asserts decision #2.
- **Clicking a display opens a DISPLAY_:N LivOS window sized to the display's
  real WxH showing the live VNC stream** — click handler calls
  `openWindow(\`DISPLAY_${d.display}\`, …, {width: d.width, height: d.height})`;
  Plan 03 routes `DISPLAY_:N` to the live `X11DisplayStreamWindow` and uses the
  `suggested` size.
- **Panel collapses when the cursor leaves the top region** — `onMouseLeave` on
  the revealed strip sets `open=false`; `AnimatePresence` runs the exit.

## key_links verification

| From | To | Status |
|------|----|--------|
| active-displays-panel.tsx | `trpc.displays.list` | `trpcReact.displays.list.useQuery(undefined, {enabled: open, refetchInterval: 4000})` |
| active-displays-panel.tsx | `windowManager.openWindow('DISPLAY_'+display, …)` | click handler `openWindow(\`DISPLAY_${d.display}\`, '/', …, {width, height})` |
| router.tsx | `<ActiveDisplaysPanel />` | imported + rendered sibling of `<TopBar />` inside WindowManagerProvider |

## Threat model dispositions applied

| Threat | Disposition | How |
|--------|-------------|-----|
| T-254-11 (I — strip lists foreign-owned displays) | accept | `displays.list` is intentionally global (matches displayManager.list() / MCP semantics); CONTROL still requires `getVncUrl` owner-scoped authz (Plan 01). |
| T-254-12 (E — clicking a non-owned display) | mitigate | click → `getVncUrl` (Plan 01) FORBIDs non-owned/non-host displays; the window shows Plan 03's error overlay, not a usable stream. |
| T-254-13 (T — display id injected via UI) | mitigate | display ids originate from `displays.list` server data; `getVncUrl` re-validates with its `^:\d+` zod regex server-side. |

## Threat surface scan

No new network endpoints, auth paths, file access, or schema changes introduced
by this plan (UI-only consumer of the Plan 01 tRPC seam + Plan 03 window). No
threat flags.

## Deploy note (Task 3)

The four 254-04 commits — and all of phase 254's prior-wave commits (Plans
01/02/03) — are **unpushed to GitHub master** (18 commits ahead). `update.sh`
clones master from GitHub, so it would deploy stale code. Per the plan's
sanctioned alternative ("if pushing to master is gated/undesirable for an
uncommitted plan, instead rsync the built `ui/dist` + the changed livinityd
source files"), deploy was done via a tar+scp+extract (rsync is unavailable on
the operator's Windows shell):

1. Tarred `livos/packages/ui/dist` + the 6 unpushed phase-254 livinityd source
   files (`index.ts`, `computer-use/displays/{display-manager,index}.ts`,
   `computer-use/trpc-router.ts`, `server/trpc/{common,index}.ts`).
2. scp → `/tmp` on Mini PC; backed up current `ui/dist` + `index.ts`
   (`*.bak-<ts>`); extracted, replaced `ui/dist`, copied the 6 source files,
   `chown -R bruce:bruce` (livinityd runs as `bruce`).
3. `sudo systemctl restart livos` → `systemctl is-active livos` = **active**,
   clean startup (Xvfb `:1` + fluxbox up, no errors).

**Deploy verification (objective, recorded):**

- `GET http://127.0.0.1:8080/health` → **200** (the actual healthcheck for this
  build; `/api/auth/status` returns 404 in this build — wrong path).
- `GET /` → **200**, `<title>Livinity</title>`; served `index.html` references
  **`assets/index-e4787ba5.js`** — the exact entry-bundle hash from the local
  vite build → the new ActiveDisplaysPanel bundle is live.
- `GET /trpc/displays.list?batch=1&input=%7B%7D` → **401 UNAUTHORIZED**
  (`isAuthenticated` `privateProcedure` gate — Plan 01 design), NOT 404 → the
  displays tRPC route the panel consumes is mounted and live; an authenticated
  UI session reaches it.

The Mini PC's livinityd had NO phase-254 backend before this deploy
(`trpc-router.ts` absent, `displayManager` count 0 in `index.ts`) — Plans 01/02
backend shipped together with this UI in the same deploy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking: test/criteria collision] Reworded the decision-#2
comment that contained the literal `list_windows`**
- **Found during:** Task 1 (RED→GREEN)
- **Issue:** The displays-only negative invariant (both the plan `rg` criterion
  and my RED test) requires the source to contain NO match of
  `windowManager.windows|list_windows|listWindows`. My explanatory comment
  ("does NOT call any list_windows source") contained the literal `list_windows`
  token, tripping the negative invariant — the identical situation Plan 03 hit
  with its `xdotool` comment.
- **Fix:** Reworded the comment to "does NOT enumerate per-window inventory" /
  "the window-manager window list" — preserves the decision-#2 rationale
  without the forbidden literal. Behavior unchanged.
- **Files modified:** `active-displays-panel.tsx`
- **Commit:** `ed7dcf8c`

**2. [Rule 3 — Blocking: formatter line-wrap broke the openWindow regex]**
- **Found during:** Task 1 (RED→GREEN)
- **Issue:** The acceptance criterion `rg "openWindow\(\`DISPLAY_\$\{"` (and the
  RED test) requires `openWindow(` and the `` `DISPLAY_${ `` template arg on the
  SAME line. My initial multi-line `openWindow(` call put them on separate lines.
- **Fix:** Collapsed the `openWindow(...)` call to a single line. Matches.
- **Files modified:** `active-displays-panel.tsx`
- **Commit:** `ed7dcf8c`

## TDD Gate Compliance

- Task 1: RED `1990cffc` (`test(254-04)`, file-not-found failure) → GREEN
  `ed7dcf8c` (`feat(254-04)`, 11/11 pass). No refactor commit needed.
- Tasks 2/3 are `type="auto"` (non-TDD) per plan.

## Known Stubs

None. The panel is fully wired to the live `displays.list` tRPC (Plan 01) and
`openWindow`→`X11DisplayStreamWindow` (Plan 03). No hardcoded empty values,
placeholders, or mock data sources — `displays` defaults to `[]` only as the
loading/empty state (renders "No active displays"), driven by live query data.

## tsc gate

The two touched UI files emit **zero new non-baseline errors**. The only tsc
errors in `active-displays-panel.tsx` (`AnimatePresence` / `motion.div` TS2786
"cannot be used as a JSX component" + the cascading TS2322) are the package-wide
framer-motion / React-types JSX baseline — **182 identical TS2786 errors
package-wide**, including `top-bar.tsx` (the precedent file the plan told me to
mirror, with errors at lines 186/237/336). `router.tsx`'s only new-context
errors are the same baseline on `Outlet`/`Link`; no error mentions
`ActiveDisplaysPanel`. The tRPC + openWindow wiring is fully type-correct.

## Tests

11/11 pass — `active-displays-panel.test.tsx` (source-text invariants:
ActiveDisplaysPanel export, displays.list useQuery, open-gated poll, sized
DISPLAY_ window on click, :N/WxH/app-count row, close-after-open, empty state,
mobile null, optional window-manager hook, displays-only negative invariant,
top-edge reveal).

## Operator UAT note (deferred from Task 4)

The interactive walk — top-edge reveal listing `:1` (+ any created display),
click `:1` → live VNC window sized to WxH, native mouse/keyboard forwarded,
cursor-leave collapse — was auto-approved under auto-mode and remains for the
operator browser walk. The Mini PC is deployed and serving the new bundle; open
`https://bruce.livinity.io` (or local `:8080`), log in, and verify the five
checkpoint confirmations.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/modules/desktop/active-displays-panel.tsx`
- FOUND: `livos/packages/ui/src/modules/desktop/active-displays-panel.test.tsx`
- FOUND: commit `1990cffc` (Task 1 RED)
- FOUND: commit `ed7dcf8c` (Task 1 GREEN)
- FOUND: commit `0ffd3cc2` (Task 2)
