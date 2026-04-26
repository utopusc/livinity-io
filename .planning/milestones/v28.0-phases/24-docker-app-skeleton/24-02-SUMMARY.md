---
phase: 24-docker-app-skeleton
plan: 02
subsystem: ui
tags: [react, tailwind, dark-mode, websocket, vitest, status-bar, dockhand, tabler-icons]

# Dependency graph
requires:
  - phase: 24-01
    provides: DockerApp shell with <main> integration slot + useDockerTheme(rootRef) + Sidebar header h-12 alignment + vitest infrastructure
  - phase: 22-multi-host-docker
    provides: EnvironmentSelector (cross-imported verbatim) + useEnvironments hook + environment-store + LOCAL_ENV_ID
  - phase: 23-ai-powered-docker-diagnostics
    provides: AlertsBell (cross-imported verbatim) + useAiAlerts hook
  - phase: 17-docker-quick-wins
    provides: docker.engineInfo tRPC route (Docker version + cpus + totalMemory)
  - phase: pre-existing
    provides: system.uptime + system.systemDiskUsage tRPC routes + wsClient.getConnection() runtime method
provides:
  - "StatusBar component — sticky 48px header with EnvironmentSelector + 8 stat pills + Search + AlertsBell + ThemeToggle"
  - "ThemeToggle button cycling light → dark → system → light, persisted via existing useDockerTheme localStorage"
  - "SearchButton placeholder modal (cmd+k binding deferred to Phase 29 / DOC-18)"
  - "Pure formatter module (format.ts) + 15 unit tests — formatUptime / formatRamGb / formatDiskFree / formatTimeHHMM / formatSocketType"
  - "useNow(intervalMs) hook — 1s-tick Date for the StatusBar clock pill"
  - "useTrpcConnection(pollMs) hook — 1s-poll of wsClient.getConnection()?.readyState for the Live indicator"
  - "Cross-instance theme sync via storage event + custom 'livos:docker:theme-changed' window event (theme.ts refactor)"
  - "Read-only useDockerTheme() path (rootRef omitted) — required by ThemeToggle to avoid double-mounting the dark class"
  - "Deprecation banner on legacy routes/server-control/index.tsx — DOC-03 closed"
affects: [25, 26, 27, 28, 29]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies — all data flows through existing v27.0 tRPC routes
  patterns:
    - "StatusBar pill row — extending the chrome with a new metric is a single <Pill icon={Icon}>{label}</Pill> append, no backend work; data sources stay in useEngineInfo / system.* routes"
    - "Cross-instance localStorage sync — the storage event fires only in OTHER tabs, so same-tab cross-instance updates need a custom window event ('livos:docker:theme-changed'). Pattern reusable for any zustand-less localStorage-shared state across components"
    - "Read-only hook variant — useDockerTheme() called without rootRef returns mode + setMode without mutating the DOM. Allows sub-components to drive shared state without competing for the root class application"
    - "1s polling of WebSocket readyState — robust against tRPC v11's WS-recreate-on-reconnect behaviour where addEventListener references go stale; cheap (a single readyState read every 1000ms)"
    - "Smoke chain test for layout files — render-level testing the StatusBar requires tRPC + WS mocking that adds friction for negligible signal; instead we lock down the formatter strings the StatusBar relies on. Pattern: layout-only files get a pure-function smoke test, behaviour lives in extracted modules"

key-files:
  created:
    - livos/packages/ui/src/routes/docker/format.ts
    - livos/packages/ui/src/routes/docker/format.unit.test.ts
    - livos/packages/ui/src/routes/docker/use-now.ts
    - livos/packages/ui/src/routes/docker/use-trpc-connection.ts
    - livos/packages/ui/src/routes/docker/theme-toggle.tsx
    - livos/packages/ui/src/routes/docker/search-button.tsx
    - livos/packages/ui/src/routes/docker/status-bar.tsx
    - livos/packages/ui/src/routes/docker/status-bar.unit.test.ts
  modified:
    - livos/packages/ui/src/routes/docker/docker-app.tsx (StatusBar mount as first child of <main>)
    - livos/packages/ui/src/routes/docker/theme.ts (read-only path + cross-instance sync)
    - livos/packages/ui/src/routes/server-control/index.tsx (deprecation banner replaces header; unused imports removed)

key-decisions:
  - "WS connection: 1s polling of wsClient.getConnection()?.readyState over an event listener. tRPC v11's TRPCWebSocketClient recreates the underlying WS on reconnect, so addEventListener references go stale after the first reconnect. Polling readyState is the simpler correct approach for v1 — Phase 29 polish task can swap for a proper observable once tRPC v12 ships getConnection() on the public type."
  - "Free disk + uptime sourced from existing system.* routes — no docker.engineInfo extension needed. Plan-spec called out this constraint and the routes existed at livinityd/source/modules/system/routes.ts:47, 107."
  - "Theme is localStorage-only, NOT server-persisted — matches CONTEXT.md decisions guidance ('scoped to /docker route via wrapper'). Promote to a global LivOS preference in v29.0 when dark mode rolls out app-wide."
  - "Time pill via dedicated useNow() hook so 1s re-renders are scoped to the StatusBar — Sidebar / SectionView don't import this hook so they don't re-render on every tick."
  - "Read-only useDockerTheme() path. Plan 24-01 always-mutated document.documentElement when no rootRef was supplied; Plan 24-02's ThemeToggle needs to call useDockerTheme() to read mode + write setMode WITHOUT mutating the DOM (DockerApp's own rootRef-bound hook is what owns DOM mutation). Refactored theme.ts so the no-arg path is read-only AND added cross-instance sync via storage event + custom 'livos:docker:theme-changed' window event so a setMode() call propagates to DockerApp's instance in the same tab."
  - "Legacy Server Control file kept on disk; in-component header replaced with deprecation banner. Full file delete deferred to Plan 27 once Stacks migration consumes the last reusable code chunks (ContainerCreateForm, ContainerDetailSheet, ComposeGraphViewer, DomainsTab still imported by lazy paths)."
  - "(wsClient as unknown as {getConnection?: () => WebSocket | undefined}) cast required because tRPC v11's TRPCWebSocketClient doesn't expose .getConnection() on the public type. Documented in JSDoc — remove cast on tRPC v12 upgrade."
  - "IconHardDrive doesn't exist in @tabler/icons-react@3.36.1; substituted IconDeviceSdCard for the free-disk pill. Storage-themed semantic match. Pre-existing icons (IconCpu / IconDatabase / IconClock / IconBrandDocker / IconCircleFilled) used as-is."
  - "Pill icon prop typed as Icon (the @tabler/icons-react ForwardRefExoticComponent type) instead of bare React.ComponentType<{size?, className?}>. Same fix sidebar.tsx applied in Plan 24-01."
  - "EnvironmentSelector + AlertsBell cross-imported verbatim from routes/server-control/. Plan 27 will relocate them to routes/docker/ once the legacy file is fully decommissioned. Cross-route imports during the transition phase are correct and intentional."

patterns-established:
  - "Adding a new docker chrome metric: extend the <Pill icon={Icon}>{label}</Pill> row in status-bar.tsx; data source stays in existing tRPC routes; no backend work."
  - "Cross-instance localStorage sync (no zustand): storage event for OTHER tabs + custom window event ('livos:docker:theme-changed') for same-tab. Reusable for any UI preference shared across detached component trees."
  - "Smoke chain test for layout files: when render-level testing requires heavy mocking (tRPC + WS + zustand), instead lock down the strings the layout file consumes via formatter-chain assertions. The behavioural module's own tests guard against regressions."
  - "Visual smoke test cadence: stop/restart nexus-core for 1-2s to verify the Live indicator polls; manually click ThemeToggle to verify cycle; click Search to verify modal placeholder. Repeatable for any Phase 25-29 chrome change."

requirements-completed: [DOC-01, DOC-02, DOC-03]
# DOC-01 closed: skeleton + sidebar (Plan 24-01) + persistent status bar (this plan) = full Dockhand chrome.
# DOC-02 closed: env + Docker version + Socket type + cores + RAM + free disk + uptime + time + Live + Search + AlertsBell + ThemeToggle.
# DOC-03 closed: legacy unreachable from dock (Plan 24-01) + in-component header replaced with deprecation banner (this plan). Full file delete is Plan 27.

# Metrics
duration: 10min
completed: 2026-04-25
---

# Phase 24 Plan 02: Docker App Skeleton — Top Status Bar Summary

**Persistent 48px Dockhand-style top StatusBar mounted in DockerApp `<main>` — EnvironmentSelector + 8 stat pills (Docker version / Socket type / N cores / GB RAM / GB free / uptime / HH:MM / Live indicator) + Search button + AlertsBell + light/dark/system theme toggle. Closes DOC-01 + DOC-02 + DOC-03.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-25T06:26:07Z
- **Completed:** 2026-04-25T06:36:45Z
- **Tasks:** 4 (Task 1 split into TDD RED + GREEN — 5 commits total)
- **Files created:** 8 (4 utility modules + 2 chrome components + 1 status-bar + 1 status-bar test)
- **Files modified:** 3 (docker-app.tsx, theme.ts, server-control/index.tsx)
- **Tests added:** 16 new (15 format + 1 status-bar smoke chain) — total 28 docker tests pass

## Accomplishments

- Sticky 48px-tall `<header>` rendered as the FIRST child of `<main>` inside DockerApp, matching the Sidebar header `h-12` height for visual alignment.
- 8 stat pills displayed in plan-specified order: Docker version → Socket type → N cores → GB RAM → GB free → uptime → HH:MM → Live/Offline indicator.
- Live indicator polls `wsClient.getConnection()?.readyState` every 1s; renders green pulsing dot when OPEN, red dot when not.
- Time pill ticks every 1s via dedicated `useNow()` hook (re-renders scoped to StatusBar; Sidebar / SectionView don't import this).
- ThemeToggle cycles light → dark → system → light on click; renders the active mode's icon (sun / moon / laptop). Read-only `useDockerTheme()` call (no rootRef) just writes `setMode(next)`; DockerApp's rootRef-bound instance picks up the change via storage event + custom `livos:docker:theme-changed` window event.
- SearchButton opens placeholder Dialog announcing "Coming in Phase 29 — DOC-18". cmd+k binding deferred per plan.
- Deprecation banner replaces the legacy Server Control header (the dock no longer routes here post-Plan 24-01; the banner only shows if some code lazy-imports the file directly).
- Zero new backend modules — all data flows through existing v27.0 tRPC routes (`docker.engineInfo`, `docker.listEnvironments`, `system.uptime`, `system.systemDiskUsage`).
- 28 vitest tests pass: 15 format + 1 status-bar smoke chain + 4 theme + 5 store + 3 sidebar.
- `pnpm --filter ui build` green (31.71s + 31.83s); typecheck clean for all new files; baseline noise unchanged.

## Task Commits

1. **Task 1 RED — failing formatter tests** — `92e94c04` (test)
2. **Task 1 GREEN — formatters + useNow + useTrpcConnection** — `9778917a` (feat)
3. **Task 2 — ThemeToggle + SearchButton (also refactored theme.ts for read-only / cross-instance sync)** — `0087de2f` (feat)
4. **Task 3 — StatusBar + smoke test + DockerApp mount** — `1de5747b` (feat)
5. **Task 4 — Deprecation banner replaces legacy Server Control header** — `fe569282` (refactor)

_Plan metadata commit added at the end (final commit)._

## Files Created

**Docker app module additions (`livos/packages/ui/src/routes/docker/`):**
- `format.ts` — 5 pure formatters (formatUptime / formatRamGb / formatDiskFree / formatTimeHHMM / formatSocketType) + `SocketKind` type alias
- `format.unit.test.ts` — 12 boundary tests + 3 describe-level (15 vitest cases total)
- `use-now.ts` — 1s-tick Date hook for the clock pill
- `use-trpc-connection.ts` — 1s-poll of wsClient.getConnection()?.readyState → {connected: boolean}; documents the (wsClient as unknown as ...).getConnection?.() cast
- `theme-toggle.tsx` — light → dark → system → light cycle; sun / moon / laptop icons; `Icon` typed; size-8
- `search-button.tsx` — placeholder Dialog announcing "Coming in Phase 29 — DOC-18"; ⌘K kbd hint
- `status-bar.tsx` — sticky h-12 header; layout = [EnvironmentSelector] | 8 pills | [Search][AlertsBell][ThemeToggle]; Pill + LivePill local sub-components
- `status-bar.unit.test.ts` — 1 smoke chain test locking down the formatter strings the StatusBar consumes

## Files Modified

- `livos/packages/ui/src/routes/docker/docker-app.tsx` — added `import {StatusBar}` and mounted `<StatusBar />` as the first child of `<main>` (above the existing scrollable section content div). Comment updated to reflect Plan 24-02 completion.
- `livos/packages/ui/src/routes/docker/theme.ts` — refactored `useDockerTheme(rootRef?)` so the no-arg path is read-only (DOM mutation only when `rootRef` is supplied); added cross-instance sync via storage event (other tabs) + custom `livos:docker:theme-changed` window event (same-tab); `setMode` now dispatches the custom event after writing localStorage.
- `livos/packages/ui/src/routes/server-control/index.tsx` — replaced the in-component header (lines 4271-4282 — h1 "Server Management" + EnvironmentSelector + AlertsBell) with an amber deprecation banner; removed the now-unused `EnvironmentSelector` and `AlertsBell` imports (the components themselves stay on disk for the new StatusBar's cross-import).

## Decisions Made

1. **WS connection state via 1s polling, not addEventListener.** tRPC v11's TRPCWebSocketClient recreates the underlying WebSocket on reconnect, so addEventListener references registered against the initial WS go stale after the first reconnect. Polling readyState is the simpler correct approach for v1; Phase 29 polish task can swap for a proper observable once tRPC v12 ships.
2. **Free disk + uptime from existing `system.*` routes.** No `docker.engineInfo` extension needed; the routes existed at `livinityd/source/modules/system/routes.ts:47,107`.
3. **Theme is localStorage-only, NOT server-persisted.** Matches CONTEXT.md `decisions` guidance. Promote to a global LivOS preference in v29.0 when dark mode rolls out app-wide.
4. **Time pill via dedicated `useNow()` hook.** Re-renders scoped to the StatusBar; Sidebar / SectionView don't import this hook so they don't re-render on every tick. Same-thread render-tax is negligible.
5. **Read-only `useDockerTheme()` path + cross-instance sync (theme.ts refactor).** Plan 24-01 always-mutated document.documentElement when no rootRef was supplied; Plan 24-02's ThemeToggle needs to call useDockerTheme() to read mode + write setMode WITHOUT mutating the DOM (DockerApp's own rootRef-bound hook owns DOM mutation). Refactored so:
   - Hook with `rootRef` supplied → applies dark/light class to rootRef.current.
   - Hook without rootRef → returns `{mode, resolved, setMode}` without DOM mutation.
   - Both instances stay in sync via storage event (cross-tab) + custom `livos:docker:theme-changed` window event (same-tab) — `setMode` writes localStorage AND dispatches the custom event so listeners in the same tab re-read.
   This is a Plan 24-02 deviation (reconciled per plan Task 2 NOTE: "If Plan 24-01 implemented it differently, the executor reconciles by editing theme.ts here AND noting in commit body").
6. **`(wsClient as unknown as {getConnection?: () => WebSocket | undefined})` cast.** tRPC v11 keeps `.getConnection()` off the public type. Documented in JSDoc; remove cast on tRPC v12 upgrade.
7. **IconHardDrive substituted with IconDeviceSdCard.** `IconHardDrive` doesn't exist in `@tabler/icons-react@3.36.1`. SdCard is storage-themed and semantically matches the free-disk pill.
8. **Pill icon prop typed as `Icon` (tabler `ForwardRefExoticComponent` alias) instead of bare `React.ComponentType<{size?, className?}>`.** Plan 24-01 sidebar.tsx applied the same fix; ThemeToggle adopted the same pattern.
9. **EnvironmentSelector + AlertsBell cross-imported verbatim from `routes/server-control/`.** Until Plan 27 cleanup, this is correct. Final relocation to `routes/docker/` happens once the legacy file is fully decommissioned.
10. **`useDockerTheme()` no-arg path subscribes to the system preference change MQL too.** Even though it doesn't mutate the DOM, it still tracks `prefersDark` so `mode` returns the correct resolved value to ThemeToggle's icon picker. Cheap (one MQL listener per hook instance).
11. **Pill min-width / overflow-x-auto on the inner pill row.** Center pills overflow to a horizontal scroll on narrow widths; the right-side controls (Search/AlertsBell/ThemeToggle) stay visible thanks to `flex shrink-0`. EnvironmentSelector on the left has its own min-width via shadcn `<SelectTrigger className='h-9 w-full sm:w-[240px]'>`.
12. **Smoke chain test instead of render test.** The StatusBar render is layout + data wiring; render-level testing requires tRPC + WS + zustand mocking that adds friction for negligible signal. Locking down the formatter chain (Task 1's pure module) suffices — any layout regression that breaks pill text is caught either by manual smoke or by a future Phase 29 e2e test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Refactored `useDockerTheme` for read-only no-arg path + cross-instance sync**

- **Found during:** Task 2 (ThemeToggle component creation)
- **Issue:** Plan 24-01's `useDockerTheme` always-mutated `document.documentElement` when called without a rootRef. Plan 24-02's ThemeToggle calls `useDockerTheme()` (no rootRef) inside the StatusBar; the DockerApp shell's separate `useDockerTheme(rootRef)` instance also runs. Without the refactor the toggle would mount the dark class onto `<html>` AND DockerApp's rootRef-bound effect would mount it on the docker-app root — competing DOM mutations, plus localStorage updates wouldn't propagate to the rootRef-bound instance until a remount.
- **Fix:** Refactored `theme.ts` so:
  - The DOM-mutation effect runs ONLY when `rootRef` is supplied.
  - Added a new effect that subscribes to `storage` events (cross-tab) AND a custom `livos:docker:theme-changed` window event (same-tab), so any hook instance re-reads localStorage when another instance writes.
  - `setMode` dispatches the custom event after writing localStorage.
- **Files modified:** `livos/packages/ui/src/routes/docker/theme.ts`
- **Verification:** All 4 existing theme.unit.test.ts tests still pass (the refactor is purely additive — `resolveTheme` pure function unchanged); typecheck clean.
- **Committed in:** `0087de2f` (Task 2 commit, alongside the toggle component itself, with rationale in the commit body).
- **Reconciliation:** Plan Task 2 Step 1 NOTE explicitly licensed this: "If Plan 24-01 implemented it differently, the executor reconciles by editing `theme.ts` here AND noting in commit body."

**2. [Rule 3 - Blocking] IconHardDrive substituted with IconDeviceSdCard**

- **Found during:** Task 3 (StatusBar typecheck)
- **Issue:** Plan-spec named `IconHardDrive` for the free-disk pill, but `@tabler/icons-react@3.36.1` doesn't export that name. Verified via `ls node_modules/@tabler/icons-react/dist/esm/icons/ | grep -iE "harddisk|hard|disk"` returning empty.
- **Fix:** Substituted `IconDeviceSdCard` (storage-themed; semantic match for "free disk").
- **Files modified:** `livos/packages/ui/src/routes/docker/status-bar.tsx`
- **Verification:** `pnpm typecheck` clean for status-bar.tsx; UI build succeeds.
- **Committed in:** `1de5747b` (Task 3).

**3. [Rule 3 - Blocking] Pill icon prop typed as `Icon` instead of `React.ComponentType<{size?, className?}>`**

- **Found during:** Task 2 (ThemeToggle typecheck) AND Task 3 (StatusBar Pill typecheck)
- **Issue:** Plan-spec used bare `React.ComponentType<{size?: number; className?: string}>` for the icon prop, but tabler icons are `ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>` — TS rejects the assignment.
- **Fix:** Imported the `Icon` type from `@tabler/icons-react` (the same type Sidebar already uses for `SECTION_META`); typed `ICON: Record<ThemeMode, Icon>` in ThemeToggle and `icon?: Icon` in Pill.
- **Files modified:** `theme-toggle.tsx`, `status-bar.tsx`.
- **Verification:** Typecheck clean.
- **Committed in:** `0087de2f` (toggle) + `1de5747b` (Pill) — fix applied identically in both.

**4. [Rule 3 - Blocking] Tailwind class-order lint warnings on new components**

- **Found during:** Task 2 self-check
- **Issue:** ESLint plugin-tailwindcss flagged class-order issues on `theme-toggle.tsx` (`h-8 w-8` shorthand to `size-8`) and `search-button.tsx` (kbd class order: dark: before sm:).
- **Fix:** Applied recommended `size-8` shorthand and reordered classes (dark: before sm:).
- **Files modified:** `theme-toggle.tsx`, `search-button.tsx`.
- **Verification:** ESLint clean for both files.
- **Committed in:** `0087de2f`.

---

**Total deviations:** 4 auto-fixed (all Rule 3 blocking). Zero Rule 4 (architectural). All deviations were on the plan's explicit happy-path or covered by the plan's "If Plan 24-01 implemented it differently" reconciliation clause. No scope creep.

## Issues Encountered

- **Pre-existing typecheck noise in `routes/server-control/index.tsx` (47 errors).** Documented as Plan 24-01 scope-boundary deferral. Stash baseline confirmed: 47 errors before AND after Plan 24-02's edits. Out of scope per the scope-boundary rule.
- **Lint warnings on legacy `routes/server-control/index.tsx` (109 warnings).** All pre-existing — none introduced by the deprecation banner edit. Same precedent as Plan 24-01 deferrals.

## Scope-Boundary Deferrals

Pre-existing typecheck + lint noise (NOT introduced by this plan) — confirmed by stash baseline:

- `livos/packages/ui/src/routes/server-control/index.tsx` — 47 typecheck errors (ActionButton-icon ForwardRefExoticComponent→ComponentType incompatibility + `outline` Button variant not in union). Plan 24-01 SUMMARY documented this as scope-boundary deferral; Plan 27 file delete will resolve.
- All other pre-existing typecheck noise from Plan 24-01's deferred-items list (stories tree, `cmdk`, `motion-primitives`, `use-current-user`, `desktop-content`, `window-chrome`, `apple-spotlight`, `window-manager`) — unchanged.

Build is the gating signal — `pnpm --filter ui build` succeeded in both Task 3 (31.83s) and Task 4 (31.71s).

## User Setup Required

None — Plan 24-02 is pure UI scaffold consuming existing v27.0 tRPC routes. No new env vars, no DB migrations, no deployment changes. A UI rebuild + restart is all that's needed (`pnpm --filter @livos/config build && pnpm --filter ui build` then `pm2 restart livos` on server).

## Manual Smoke Test Checklist

Per `<verify><manual>` clauses in the plan — the user should run these in dev mode (`cd livos/packages/ui && pnpm dev`) to confirm visual behaviour:

- [ ] Click Docker dock icon → window titled "Docker" opens.
- [ ] Top: 48px sticky StatusBar with [EnvironmentSelector | Docker {version} | {socket} | {N} cores | {N} GB RAM | {N} GB free | Up {Xd Yh} | {HH:MM} | Live] + [Search ⌘K | Bell | Sun/Moon/Laptop].
- [ ] Time pill ticks every 1s.
- [ ] Click ThemeToggle → cycles sun → moon → laptop (light → dark → system); the docker-app root flips dark/light backgrounds; pill bg switches between `zinc-50` and `zinc-900`. Reload window → mode persists.
- [ ] Click Search → modal opens with "Coming in Phase 29 — DOC-18".
- [ ] Click Bell → existing Plan 23-02 alerts panel opens.
- [ ] Click env selector → existing Plan 22-02 dropdown opens.
- [ ] Stop nexus dev server → after 1-2s, Live pill flips to red "Offline". Restart → flips back to green within 1-2s.
- [ ] Reach `/server-control` directly via URL bar → 404 / NotFound (route not registered in router.tsx).
- [ ] Hypothetical only: if some lazy import surfaces `routes/server-control/index.tsx`, the deprecation banner is visible at the top of the rendered tree.

## Patterns Established for Phases 25-29

1. **Adding a new chrome metric to the StatusBar:** extend the `<Pill>` row with a new `<Pill icon={Icon}>{label}</Pill>` entry; data source stays in `useEngineInfo` / `system.*` / `docker.*` existing routes; no backend work. Example: a "Containers running" pill in Phase 25-29 polish would be `<Pill icon={IconBox}>{containerCount} running</Pill>` driven by `useContainers()` count.

2. **Cross-importing legacy components during the migration phase:** until Plan 27 cleanup, importing from `routes/server-control/` is correct (precedent: EnvironmentSelector + AlertsBell). Each phase that consumes a legacy component leaves the source file alone; Plan 27 does the bulk relocation/delete pass.

3. **Visual verification of WS-state pills:** stop nexus-core for 1-2s, observe red flip; restart, observe green flip — repeatable smoke check applicable to any future component subscribing to `useTrpcConnection()`.

4. **Phase 26+ deep-linking work:** requires upgrading section state from zustand to URL routing. Plan 24-01 + Plan 24-02 intentionally did NOT pre-build this to keep scope tight; Phase 26 owns the upgrade per DOC-20.

5. **Read-only hook variant pattern:** `useDockerTheme(rootRef?)` with the no-arg path being read-only is reusable for any future hook that needs DOM mutation OR pure state-read access. The cross-instance sync via storage event + custom window event is the canonical pattern for localStorage-shared state across detached component trees (alternative to a zustand store with persist).

## Open Items for Phase 27 (legacy cleanup pass)

- Delete `livos/packages/ui/src/routes/server-control/index.tsx` once last legacy import is migrated (last is Stacks tab, migrating in Plan 27-XX).
- Delete `livos/packages/ui/src/modules/window/app-contents/server-control-content.tsx` adapter.
- Remove the `// eslint-disable-next-line` ServerControlWindowContent import from `livos/packages/ui/src/modules/window/window-content.tsx` (Plan 24-01 left it for one-phase rollback safety).
- Move `environment-selector.tsx` and `ai-alerts-bell.tsx` from `routes/server-control/` to `routes/docker/` (or a shared `routes/docker/_components/` dir). Update Plan 24-02's StatusBar import path accordingly.

---

## Self-Check: PASSED

All 8 created files verified present on disk:
- `livos/packages/ui/src/routes/docker/format.ts`
- `livos/packages/ui/src/routes/docker/format.unit.test.ts`
- `livos/packages/ui/src/routes/docker/use-now.ts`
- `livos/packages/ui/src/routes/docker/use-trpc-connection.ts`
- `livos/packages/ui/src/routes/docker/theme-toggle.tsx`
- `livos/packages/ui/src/routes/docker/search-button.tsx`
- `livos/packages/ui/src/routes/docker/status-bar.tsx`
- `livos/packages/ui/src/routes/docker/status-bar.unit.test.ts`

All 5 task commits verified in `git log --oneline`:
- `92e94c04` (Task 1 RED)
- `9778917a` (Task 1 GREEN)
- `0087de2f` (Task 2)
- `1de5747b` (Task 3)
- `fe569282` (Task 4)

Tests: 28/28 passing (`pnpm exec vitest run src/routes/docker/ --environment jsdom`)
Build: green (`pnpm --filter ui build`, 31.71s on Task 4)

---

*Phase: 24-docker-app-skeleton*
*Plan: 02*
*Completed: 2026-04-25*
