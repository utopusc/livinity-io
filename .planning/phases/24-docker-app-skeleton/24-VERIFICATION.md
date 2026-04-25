---
status: human_needed
phase: 24-docker-app-skeleton
must_haves_total: 22
must_haves_verified: 22
must_haves_failed: 0
requirement_ids: DOC-01, DOC-02, DOC-03
verified: 2026-04-25T23:45:00Z
human_verification:
  - test: "Sidebar visual look-feel vs. Dockhand reference"
    expected: "Persistent left sidebar (w-56 expanded / w-14 collapsed) with proper Dockhand-style polish — icon spacing, font weight, active highlight depth, chevron toggle alignment"
    why_human: "Visual UX comparison against Dockhand reference design (https://dockhand.bor6.pl) requires eyeball judgement; only structural correctness verifiable in code"
  - test: "Top status bar polish + pill alignment"
    expected: "Sticky 48px header aligned with sidebar header h-12; 8 stat pills render in correct order with consistent vertical centering, proper backdrop-blur, no layout jitter on data refetch (every 30s)"
    why_human: "Visual alignment + transition smoothness require live browser inspection at multiple viewport widths"
  - test: "Theme toggle visual transition"
    expected: "Clicking ThemeToggle cycles sun → moon → laptop icons; backgrounds smoothly transition between zinc-50 / zinc-900 across docker-app root + sidebar + status bar; no flash-of-unstyled-content"
    why_human: "Cross-component theme propagation via storage event + custom window event needs live verification on bruce.livinity.io"
  - test: "Live indicator real-time WS state"
    expected: "Live pill is green (pulsing) when nexus-core is running; flips to red Offline within 1-2s after stopping nexus-core; flips back to green within 1-2s after restart"
    why_human: "Real-time WebSocket reconnect behaviour cannot be verified by static code inspection — requires running the dev server and toggling backend availability"
  - test: "Time pill ticks every second"
    expected: "Clock pill updates HH:MM each minute boundary; no visible jitter / re-render flash in adjacent pills"
    why_human: "1s setInterval render scope (Sidebar / SectionView don't import useNow) is observable only in DevTools profiler against a running app"
  - test: "Docker dock entry icon + label visual"
    expected: "Dock icon + tooltip both read 'Docker'; Spotlight launcher entry reads 'Docker'; mobile tab bar shows IconBrandDocker with 'Docker' label; desktop tile shows 'Docker' with the existing dock-server.svg icon"
    why_human: "Plan reused the legacy dock-server.svg pending Phase 29 polish — visual rebrand judgement on bruce.livinity.io is a UAT concern"
  - test: "Sidebar tooltips when collapsed"
    expected: "Hovering a section icon when sidebar is collapsed (w-14) surfaces a Radix Tooltip on the right side with the section label after 300ms delay"
    why_human: "Radix Tooltip portal positioning + delay UX needs live mouse interaction"
  - test: "Reload persistence — sidebar + theme"
    expected: "After reloading the docker window or browser, last selected section + collapsed state + theme mode all restore from localStorage (livos:docker:sidebar-collapsed + livos:docker:theme)"
    why_human: "localStorage write is verified in code; observed restoration on real reload requires browser session"
---

# Phase 24: Docker App Skeleton Verification Report

**Phase Goal:** Standalone Docker app at `/docker` route with persistent left sidebar + top status bar — the structural foundation for everything in v28.0.
**Verified:** 2026-04-25T23:45:00Z
**Status:** human_needed (all coded artifacts pass; visual UX awaits browser eyeball after deploy)
**Re-verification:** No — initial verification

## Goal Achievement

Phase 24 lays down the structural skeleton (sidebar, status bar, theme infra, app-registry rewiring, deprecation banner, 12 placeholder sections) for v28.0's Dockhand-style Docker management UI. The phase is foundation only — no end-user feature lands here. Subsequent phases (25-29) put real content in the placeholder slots.

**Pure-code claims (verified passed):** all 22 must-haves across DOC-01 / DOC-02 / DOC-03 are coded correctly, wired correctly, and covered by tests. 28/28 vitest tests pass; `pnpm --filter ui build` green in 31.59s. Grep for `LIVINITY_server-control` returns only Phase 24 comments and the legacy directory itself (no functional references).

**Visual UX claims (deferred to human):** Dockhand-reference look-feel, theme transition smoothness, real-time WS pill behaviour, dock icon polish — these need eyeball on bruce.livinity.io after deploy. Listed in `human_verification` frontmatter.

## Observable Truths

| #   | Truth                                                                                                                          | Status     | Evidence                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clicking the Docker dock icon opens new Docker app window (NOT legacy Server Control)                                          | ✓ VERIFIED | `dock.tsx:179` uses `appId='LIVINITY_docker'`; `window-content.tsx:69` switch case routes to `<DockerWindowContent />`                                 |
| 2   | Persistent left sidebar lists 12 entries with Tabler icons + labels                                                            | ✓ VERIFIED | `sidebar.tsx:51-64` SECTION_META has 12 entries; SECTION_IDS in `store.ts:40-53` matches order; sidebar.unit.test.ts (3 tests) verifies completeness |
| 3   | Clicking a sidebar entry switches the main pane to that section's component                                                    | ✓ VERIFIED | `sidebar.tsx:102` calls `setSection(id)`; `docker-app.tsx:59-86` SectionView switch is exhaustive (TS narrowing on SectionId)                          |
| 4   | Active sidebar entry visually highlighted (background + accent)                                                                | ✓ VERIFIED | `sidebar.tsx:106-108` applies `bg-blue-500/10 text-blue-700` (light) / `bg-blue-500/15 text-blue-300` (dark) when `section === id`                     |
| 5   | Sidebar collapses to icon-only via chevron toggle; persists via localStorage                                                   | ✓ VERIFIED | `sidebar.tsx:84-91` chevron button calls `useToggleSidebar()`; `store.ts:73` persist key `livos:docker:sidebar-collapsed`; collapsed → `w-14`         |
| 6   | All 12 section components render "Coming in Phase XX" placeholder                                                              | ✓ VERIFIED | All 12 sections grep'd; phase numbers correct: dashboard→25, containers→26, logs→28, shell→29, stacks→27, images→26, volumes→26, networks→26, registry→29, activity→28, schedules→27, settings→29 |
| 7   | Theme toggle cycles light → dark → system; applies `dark` class to docker-app root; persists localStorage `livos:docker:theme` | ✓ VERIFIED | `theme-toggle.tsx:16` NEXT cycle; `theme.ts:118-127` applies class to rootRef when supplied; `theme.ts:29` STORAGE_KEY = 'livos:docker:theme'        |
| 8   | Tailwind dark: variants resolve under docker-app root in dark mode                                                             | ✓ VERIFIED | `tailwind.config.ts:18` `darkMode: 'class'`; sidebar uses `dark:bg-zinc-950`; status bar uses `dark:bg-zinc-900/95`; build succeeds                   |
| 9   | Legacy `LIVINITY_server-control` no longer reachable from dock                                                                 | ✓ VERIFIED | Grep for `LIVINITY_server-control` returns 0 functional references; only 5 Phase 24 comments remain (apps.tsx, window-content.tsx, dock.tsx, mobile-tab-bar.tsx, apple-spotlight.tsx) |
| 10  | Top status bar renders as sticky 48px header (sibling-right of sidebar, first child of `<main>`)                                | ✓ VERIFIED | `status-bar.tsx:79` `sticky top-0 ... h-12`; `docker-app.tsx:50` mounts `<StatusBar />` as first child of `<main>`                                    |
| 11  | Status bar layout: env selector (left) → 8 pills → search/alerts/theme (right)                                                 | ✓ VERIFIED | `status-bar.tsx:84-103` matches plan order — `<EnvironmentSelector />` → 8 `<Pill>` + `<LivePill>` → `<SearchButton><AlertsBell><ThemeToggle>`         |
| 12  | 8 stat pills in correct order: Docker version, Socket, cores, RAM, free disk, uptime, time, Live                               | ✓ VERIFIED | `status-bar.tsx:88-95` pills in plan-specified order; `status-bar.unit.test.ts` smoke chain locks down formatter strings                              |
| 13  | Docker version + cores + total RAM from `useEngineInfo` (no extension)                                                         | ✓ VERIFIED | `status-bar.tsx:55, 67-70` consumes `engineInfo.{version, cpus, totalMemory}` directly; no new tRPC routes added                                       |
| 14  | Free disk from `system.systemDiskUsage`                                                                                        | ✓ VERIFIED | `status-bar.tsx:60-63` `trpcReact.system.systemDiskUsage.useQuery({refetchInterval: 30_000})`                                                          |
| 15  | Uptime from `system.uptime` (refetches every 30s)                                                                              | ✓ VERIFIED | `status-bar.tsx:59` `trpcReact.system.uptime.useQuery(undefined, {refetchInterval: 30_000})`                                                           |
| 16  | Current time updates every second via `useNow()` hook                                                                          | ✓ VERIFIED | `use-now.ts:13-20` `setInterval(() => setNow(new Date()), 1000)`; `status-bar.tsx:64` consumes                                                        |
| 17  | Live indicator polls `wsClient.getConnection()?.readyState === OPEN` every 1s                                                  | ✓ VERIFIED | `use-trpc-connection.ts:34-41` polls every 1000ms; checks `WebSocket.OPEN`                                                                            |
| 18  | Theme toggle cycles light → dark → system; renders active mode icon (sun/moon/laptop)                                          | ✓ VERIFIED | `theme-toggle.tsx:16-26` NEXT + ICON + TITLE records; `<Icon size={16} />` renders correct icon                                                       |
| 19  | Search button opens placeholder Dialog "Coming in Phase 29"                                                                    | ✓ VERIFIED | `search-button.tsx:23-54` Dialog with `<DialogDescription>Coming in Phase 29 — DOC-18</DialogDescription>`                                            |
| 20  | Old Server Control header replaced with deprecation banner                                                                     | ✓ VERIFIED | `routes/server-control/index.tsx:4279-4283` amber-themed banner with "Deprecated:" strong tag; legacy h1 + EnvironmentSelector + AlertsBell removed   |
| 21  | All 12 placeholder sections present and exhaustive                                                                             | ✓ VERIFIED | `ls sections/` returns 12 .tsx files; SectionView switch covers all 12 (TS exhaustiveness check)                                                       |
| 22  | localStorage persistence: `livos:docker:sidebar-collapsed` + `livos:docker:theme`                                              | ✓ VERIFIED | `store.ts:73` + `theme.ts:29` keys exact match plan spec                                                                                              |

**Score:** 22/22 truths verified

## Required Artifacts

| Artifact                                                                  | Expected                                            | Status     | Details                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `livos/packages/ui/src/routes/docker/docker-app.tsx`                      | DockerApp shell — sidebar + main pane wrapper       | ✓ VERIFIED | 87 lines; mounts `<Sidebar />` + `<StatusBar />` + SectionView switch                          |
| `livos/packages/ui/src/routes/docker/sidebar.tsx`                         | 12 entries, collapsible, active highlight           | ✓ VERIFIED | 131 lines; SECTION_META + active highlight + chevron toggle + Radix Tooltip on collapse        |
| `livos/packages/ui/src/routes/docker/store.ts`                            | zustand store w/ section + sidebarCollapsed         | ✓ VERIFIED | 86 lines; persist middleware; 4 selector hooks; SectionId / SECTION_IDS exported               |
| `livos/packages/ui/src/routes/docker/theme.ts`                            | useDockerTheme hook + resolveTheme + STORAGE_KEY    | ✓ VERIFIED | 152 lines; read-only no-arg path + cross-instance sync via storage event + custom window event |
| `livos/packages/ui/src/routes/docker/index.tsx`                           | Default export wrapping DockerApp                   | ✓ VERIFIED | 9 lines; default export `DockerApp`                                                            |
| `livos/packages/ui/src/modules/window/app-contents/docker-content.tsx`    | Window-content adapter (lazy-loads DockerApp)       | ✓ VERIFIED | 18 lines; ErrorBoundary + Suspense + `React.lazy(@/routes/docker)`                             |
| `livos/packages/ui/src/routes/docker/sections/{12 files}.tsx`             | 12 placeholder section components                   | ✓ VERIFIED | All 12 .tsx files exist; each renders "Coming in Phase XX" with correct phase number          |
| `livos/packages/ui/src/routes/docker/status-bar.tsx`                      | StatusBar — env + 8 pills + search/alerts/theme     | ✓ VERIFIED | 146 lines; sticky h-12; matches plan layout exactly                                            |
| `livos/packages/ui/src/routes/docker/use-trpc-connection.ts`              | useTrpcConnection — 1s WS poll                      | ✓ VERIFIED | 44 lines; polling pattern; cast documented                                                     |
| `livos/packages/ui/src/routes/docker/use-now.ts`                          | useNow — 1s tick Date                               | ✓ VERIFIED | 21 lines; setInterval + cleanup                                                                |
| `livos/packages/ui/src/routes/docker/format.ts`                           | 5 pure formatters                                   | ✓ VERIFIED | 50 lines; formatUptime/RamGb/DiskFree/TimeHHMM/SocketType                                      |
| `livos/packages/ui/src/routes/docker/theme-toggle.tsx`                    | ThemeToggle — cycles modes, renders active icon     | ✓ VERIFIED | 47 lines; NEXT/ICON/TITLE records; size-8 button                                               |
| `livos/packages/ui/src/routes/docker/search-button.tsx`                   | SearchButton — opens placeholder modal              | ✓ VERIFIED | 55 lines; Dialog with "Coming in Phase 29 — DOC-18"                                            |
| `livos/packages/ui/tailwind.config.ts`                                    | `darkMode: 'class'` configured                      | ✓ VERIFIED | Line 18: `darkMode: 'class'`                                                                   |
| `livos/packages/ui/src/providers/apps.tsx`                                | LIVINITY_docker registry entry                      | ✓ VERIFIED | Lines 73-79: id 'LIVINITY_docker', name 'Docker', systemAppTo '/docker'                        |
| `livos/packages/ui/src/routes/server-control/index.tsx`                   | Deprecation banner replaces header                  | ✓ VERIFIED | Lines 4279-4283: amber banner with "Deprecated:" strong; EnvironmentSelector/AlertsBell removed |

## Key Link Verification

| From                                  | To                              | Via                                        | Status   | Details                                                                                                |
| ------------------------------------- | ------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `dock.tsx`                            | DockerApp                       | `openWindow('LIVINITY_docker', '/docker')` | ✓ WIRED  | `dock.tsx:179-191` matches plan exactly                                                                |
| `window-content.tsx`                  | docker-content.tsx              | switch case 'LIVINITY_docker'              | ✓ WIRED  | `window-content.tsx:16` lazy import + `:69-70` switch case                                             |
| `docker-app.tsx`                      | sidebar.tsx                     | `<Sidebar />`                              | ✓ WIRED  | `docker-app.tsx:31, 47`                                                                                |
| `docker-app.tsx`                      | status-bar.tsx                  | `<StatusBar />` first child of `<main>`    | ✓ WIRED  | `docker-app.tsx:32, 50`                                                                                |
| `sidebar.tsx`                         | store.ts                        | useDockerSection / useSetDockerSection      | ✓ WIRED  | `sidebar.tsx:38-41` imports + line 67-70 usage                                                         |
| `docker-app.tsx`                      | sections/*.tsx                  | section switch                             | ✓ WIRED  | `docker-app.tsx:59-86` exhaustive switch over all 12 sections                                          |
| `status-bar.tsx`                      | environment-selector.tsx        | `<EnvironmentSelector />`                  | ✓ WIRED  | `status-bar.tsx:36, 84` cross-route import (intentional; relocate in Plan 27)                          |
| `status-bar.tsx`                      | ai-alerts-bell.tsx              | `<AlertsBell />`                           | ✓ WIRED  | `status-bar.tsx:35, 101`                                                                                |
| `status-bar.tsx`                      | use-engine-info.ts              | useEngineInfo()                            | ✓ WIRED  | `status-bar.tsx:33, 55`                                                                                |
| `status-bar.tsx`                      | tRPC system routes              | system.uptime + system.systemDiskUsage     | ✓ WIRED  | `status-bar.tsx:59-63`                                                                                  |
| `use-trpc-connection.ts`              | trpc.ts wsClient                | wsClient.getConnection()?.readyState       | ✓ WIRED  | `use-trpc-connection.ts:21, 34-36`                                                                     |
| `theme-toggle.tsx`                    | theme.ts                        | useDockerTheme() (no rootRef)              | ✓ WIRED  | `theme-toggle.tsx:14, 29` — read-only path                                                              |

## Requirements Coverage

| Requirement | Source Plan                | Description                                                              | Status      | Evidence                                                                                       |
| ----------- | -------------------------- | ------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| DOC-01      | 24-01-PLAN + 24-02-PLAN    | `/docker` route with persistent left sidebar (12 entries, collapsible)   | ✓ SATISFIED | Sidebar (24-01) + StatusBar (24-02) = full Dockhand chrome; 22/22 truths verified              |
| DOC-02      | 24-02-PLAN                 | Top status bar with env selector + 8 pills + search + alerts + theme    | ✓ SATISFIED | StatusBar component renders all 8 pills + 3 right-side controls; data wired to existing routes |
| DOC-03      | 24-01-PLAN + 24-02-PLAN    | Old Server Control deprecated; redirect to new Docker app               | ✓ SATISFIED | Legacy unreachable from dock/desktop/mobile/spotlight (24-01); deprecation banner replaces in-component header (24-02). Full file delete is Plan 27 (intentional deferral per ROADMAP). |

REQUIREMENTS.md table at lines 51-53 confirms DOC-01 / DOC-02 / DOC-03 are within Phase 24's scope. ROADMAP table marks DOC-01 partial after 24-01 (full close after 24-02), DOC-02 complete after 24-02, DOC-03 partial after 24-01 (file delete pending Plan 27 — explicit deferral, not a gap).

## Anti-Patterns Found

None blocking. All "TODO/FIXME/Coming in Phase XX" copy is intentional placeholder content for the 12 section files. Pre-existing typecheck noise in `routes/server-control/index.tsx` (47 errors) and elsewhere documented as scope-boundary deferrals across both plan SUMMARYs — none introduced by Phase 24.

## Spot-Check Findings

1. **All 12 section placeholders correct.** Phase numbers match the plan's SECTION_META mapping (dashboard→25, containers/images/volumes/networks→26, stacks/schedules→27, logs/activity→28, shell/registry/settings→29).
2. **Tests: 28/28 pass.** vitest run (jsdom env): format.unit (15) + theme.unit (4) + status-bar.unit (1) + store.unit (5) + sidebar.unit (3) = 28 tests, 1.53s total.
3. **Build green.** `pnpm --filter ui build` succeeds in 31.59s; PWA generates 194 precache entries.
4. **No stale `LIVINITY_server-control` references in functional code.** Grep returns 5 matches — all are Phase 24 comments documenting the transition. Functional code uses `LIVINITY_docker` consistently across 7 files: apps.tsx (registry), window-content.tsx (switch + fullHeightApps), dock.tsx (DockItem), dock-item.tsx (DOCK_LABELS / DOCK_ICONS), desktop-content.tsx (mobile system app entry), mobile-tab-bar.tsx (TABS), apple-spotlight.tsx (spotlight launcher), window-manager.tsx (DEFAULT_WINDOW_SIZES).
5. **EnvironmentSelector + AlertsBell cross-imported correctly.** Both still live in `routes/server-control/` per plan; StatusBar imports them via `@/routes/server-control/{environment-selector,ai-alerts-bell}` — Plan 27 will relocate.
6. **Tailwind dark mode functional.** `darkMode: 'class'` on line 18 of tailwind.config.ts; `dark:` variants resolve under the docker-app root via useDockerTheme rootRef class application.
7. **Theme cross-instance sync correctly implemented.** theme.ts line 99-111 subscribes to both `storage` event (cross-tab) and custom `livos:docker:theme-changed` window event (same-tab). ThemeToggle's read-only useDockerTheme() call writes localStorage + dispatches custom event → DockerApp's rootRef-bound instance flips the dark class without a remount.
8. **Deprecation banner on legacy file works as guard.** `routes/server-control/index.tsx:4279-4283` shows amber-themed deprecation copy. Legacy file stays on disk for content-migration reuse in Phases 25-29; Plan 27 SUMMARY deletes it. No production path renders this banner — verified by all 7 entry points routing to `LIVINITY_docker`.
9. **Plan deviations documented and reconciled.** Both SUMMARYs document auto-fixes (4 in Plan 24-02, 2 in Plan 24-01) — all Rule 3 blocking, all on plan happy-path or covered by reconciliation clauses. No scope creep.

## Human Verification Required

8 visual UX items deferred to human (see `human_verification` frontmatter). These cannot be verified by static code analysis:

1. **Sidebar look-feel vs. Dockhand reference** — visual polish judgement
2. **Top status bar polish + pill alignment** — visual alignment + transition smoothness across viewport widths
3. **Theme toggle visual transition** — cross-component theme propagation observable on bruce.livinity.io
4. **Live indicator real-time WS state** — requires stop/restart of nexus-core to observe red→green flip within 1-2s
5. **Time pill ticks every second** — visible 1s render scope behaviour
6. **Docker dock entry icon + label visual** — UAT-level rebrand judgement (legacy `dock-server.svg` reused pending Phase 29 polish)
7. **Sidebar tooltips when collapsed** — Radix Tooltip portal positioning + 300ms delay UX
8. **Reload persistence — sidebar + theme** — observable only by reloading the browser session

## Issues

None. All coded artifacts pass; pre-existing typecheck/lint noise documented as scope-boundary deferrals in both SUMMARYs. Build green; tests green; grep clean.

## Recommendation

**Status: human_needed.** All 22 must-haves across DOC-01 / DOC-02 / DOC-03 verified passing in code. The skeleton is structurally correct, tests green (28/28), build clean. This phase is foundation only — no end-user feature lands here, so the 8 visual UX items are appropriately deferred to UAT after deploy.

**Next step:** Deploy to bruce.livinity.io / livinity.cloud (or pull on Server4 + UI rebuild + `pm2 restart livos`); ask user to walk through the `human_verification` checklist; if visual items pass eyeball test, mark phase complete and proceed to Phase 25 (DOC-04/05/06 Dashboard).

**No re-planning gaps.** Phase 24 ships as designed.

---

_Verified: 2026-04-25T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
