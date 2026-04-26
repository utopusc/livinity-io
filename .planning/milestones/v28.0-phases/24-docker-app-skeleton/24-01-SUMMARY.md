---
phase: 24-docker-app-skeleton
plan: 01
subsystem: ui
tags: [react, zustand, tailwind, dark-mode, vitest, jsdom, sidebar, window-app, tabler-icons, radix-tooltip]

# Dependency graph
requires:
  - phase: pre-existing
    provides: AppT registry + window-content switch + apps registry pattern
  - phase: 22-multi-host-docker
    provides: zustand persist pattern (environment-store.ts as precedent)
provides:
  - "LIVINITY_docker system app — replaces LIVINITY_server-control in dock + desktop + mobile + window-content + apps registry"
  - "DockerApp shell at livos/packages/ui/src/routes/docker/docker-app.tsx (sidebar + main pane wrapper)"
  - "useDockerTheme(rootRef) hook + resolveTheme() pure function — class-based dark/light/system theming scoped to docker-app root"
  - "useDockerStore zustand store with SectionId union + 12 SECTION_IDS + section/sidebarCollapsed state + persist"
  - "Sidebar component with 12 entries, collapsible, active highlighting, Tabler icons, Radix tooltips when collapsed"
  - "12 placeholder section components (sections/*.tsx) ready for content migration in Phases 25-29"
  - "Tailwind darkMode: 'class' configured + dark: variants compile correctly"
  - "vitest@2.1.2 + jsdom@25 added to UI devDeps (no test runner previously)"
affects: [24-02, 25, 26, 27, 28, 29]

# Tech tracking
tech-stack:
  added:
    - vitest@^2.1.2 (UI test runner; livinityd already had it)
    - jsdom@^25 (vitest jsdom environment for localStorage / window)
  patterns:
    - "Window-app pattern: new system apps go through `LIVINITY_<id>` apps-registry entry + window-content switch case + lazy app-content adapter (NOT React Router routes — see router.tsx line 47-48)"
    - "Section navigation INSIDE a window-app uses zustand store (no URL routing). Deep-linking deferred to Phase 26 (DOC-20)."
    - "Theme hook scoped to a ref — useDockerTheme(rootRef) applies dark/light class to a specific root, not document.documentElement, so other LivOS surfaces stay light-mode regardless of the docker-app preference"
    - "SectionId union + SECTION_IDS array + SECTION_META record + exhaustive switch in SectionView — adding/removing a section is a 4-place compile-enforced change"

key-files:
  created:
    - livos/packages/ui/src/routes/docker/docker-app.tsx
    - livos/packages/ui/src/routes/docker/sidebar.tsx
    - livos/packages/ui/src/routes/docker/store.ts
    - livos/packages/ui/src/routes/docker/theme.ts
    - livos/packages/ui/src/routes/docker/index.tsx
    - livos/packages/ui/src/routes/docker/sections/{dashboard,containers,logs,shell,stacks,images,volumes,networks,registry,activity,schedules,settings}.tsx
    - livos/packages/ui/src/routes/docker/{theme,store,sidebar}.unit.test.ts
    - livos/packages/ui/src/modules/window/app-contents/docker-content.tsx
  modified:
    - livos/packages/ui/tailwind.config.ts (darkMode: 'class')
    - livos/packages/ui/src/providers/apps.tsx (LIVINITY_docker registry entry replaces LIVINITY_server-control)
    - livos/packages/ui/src/providers/window-manager.tsx (DEFAULT_WINDOW_SIZES key)
    - livos/packages/ui/src/modules/window/window-content.tsx (lazy import + fullHeightApps + switch case)
    - livos/packages/ui/src/modules/desktop/dock.tsx (dock item)
    - livos/packages/ui/src/modules/desktop/dock-item.tsx (DOCK_LABELS / DOCK_ICONS map)
    - livos/packages/ui/src/modules/desktop/desktop-content.tsx (mobile system app entry)
    - livos/packages/ui/src/modules/mobile/mobile-tab-bar.tsx (tab entry, IconBrandDocker)
    - livos/packages/ui/src/components/apple-spotlight.tsx (spotlight launcher entry)
    - livos/packages/ui/package.json (vitest + jsdom devDeps)

key-decisions:
  - "Theme scoped to /routes/docker via useDockerTheme(rootRef) — not promoted to document.documentElement — so legacy LivOS components keep rendering in light mode unchanged. Promote when v29.0 rolls dark mode app-wide."
  - "Section navigation = zustand store (not URL routing). Deep-linking deferred to Plan 26-01 (DOC-20). Building it now would pre-empt that planner's choice of route shape."
  - "Persistence keys: 'livos:docker:theme' (theme mode) + 'livos:docker:sidebar-collapsed' (section + sidebarCollapsed in one entry). Naming follows Phase 22-02 D-01 precedent ('livos:selectedEnvironmentId')."
  - "vitest + jsdom added to UI devDeps. UI had no test runner; livinityd uses vitest for *.unit.test.ts files. Carries the convention forward without inventing a new one."
  - "ServerControlWindowContent import retained behind eslint-disable for one-phase rollback safety. Final delete in Plan 27 SUMMARY."
  - "Custom Sidebar primitive (Tailwind + Radix Tooltip), NOT shadcn Sidebar — verified shadcn-components/ui has no sidebar.tsx in this repo."
  - "Plan called for IconBrandDocker on mobile tab bar; sidebar uses semantic icons (IconBox for containers, IconStack2 for stacks, etc.) rather than IconBrandDocker for everything."

patterns-established:
  - "Adding a new docker section: extend SectionId union + append to SECTION_IDS + add SECTION_META entry + create sections/<id>.tsx + add SectionView switch case. The compiler enforces all four touchpoints — missing any one becomes a compile error."
  - "useDockerTheme(rootRef) is the integration surface for Plan 24-02's theme toggle. setMode is exposed for the StatusBar's light/dark/system cycle button."
  - "DockerApp's <main> is the integration surface for Plan 24-02's StatusBar. Mount StatusBar as the FIRST child of <main>, before the <div class='min-h-0 flex-1 overflow-auto'> SectionView wrapper."
  - "Migration scaffold for Phases 25-29: each phase replaces ONE section component file (e.g. Phase 25 swaps sections/dashboard.tsx for the real implementation) — no shell/sidebar/theme touched."

requirements-completed: []  # DOC-01 and DOC-03 are PARTIALLY addressed here per the plan's explicit guidance — full closure in Plan 24-02 (DOC-01) and Plan 27 (DOC-03 file delete). Audit will reconcile.
# DOC-01 partial — sidebar layout + 12 entries + collapsible done; status bar pending Plan 24-02.
# DOC-03 partial — legacy server-control unreachable from dock; file delete pending Plan 27.
# DOC-19 scaffolded — useDockerTheme infra ready; the user-facing toggle button is Plan 24-02.

# Metrics
duration: 11min
completed: 2026-04-25
---

# Phase 24 Plan 01: Docker App Skeleton — Layout Foundation Summary

**LIVINITY_docker system app shell — 12-entry collapsible sidebar + zustand section store + scoped class-based dark mode (light/dark/system) — replaces LIVINITY_server-control in dock + desktop + mobile + spotlight launchers.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-25T06:08:20Z
- **Completed:** 2026-04-25T06:19:26Z
- **Tasks:** 3 (Task 1 was TDD: RED + GREEN)
- **Files created:** 18 (1 docker-content + 4 docker module files + 12 section placeholders + 1 hook)
- **Files modified:** 10 (apps registry + window manager + window content + dock + dock-item + desktop content + mobile tab + spotlight + tailwind + ui package.json)

## Accomplishments

- New `LIVINITY_docker` system app: clicking the Docker dock icon opens a window with sidebar + main pane (12 placeholder sections), replacing the legacy tab-based Server Control window content.
- Sidebar: 12 entries (Dashboard / Containers / Logs / Shell / Stacks / Images / Volumes / Networks / Registry / Activity / Schedules / Settings) with Tabler icons + active highlight (blue/10 light, blue/15 dark) + chevron-toggle collapse to 56px icon-only mode + Radix tooltips when collapsed + localStorage persistence.
- Section state: zustand store + 4 selector hooks (`useDockerSection`, `useSidebarCollapsed`, `useSetDockerSection`, `useToggleSidebar`); persist middleware writes both `section` and `sidebarCollapsed` under one localStorage key.
- Theme: `useDockerTheme(rootRef)` hook with `mode` (`light` | `dark` | `system`) + `resolved` + `setMode`, MediaQueryList for system preference, scoped `dark` class on docker-app root, localStorage `livos:docker:theme`.
- Tailwind `darkMode: 'class'` configured — `dark:` variants now resolve under the docker-app root.
- 12 section placeholders rendering "Coming in Phase XX" copy so users can verify sidebar wiring visually before any feature lands.
- All 6 dock/desktop/mobile/spotlight entry points re-routed to `LIVINITY_docker`. Cross-check grep clean — only Phase 24-01 comments remain.
- `pnpm --filter ui build` green (31.98s); 12 vitest tests pass (4 theme + 5 store + 3 sidebar metadata); lint adds zero new errors.

## Task Commits

1. **Task 1 (RED): failing tests for docker theme + section store** — `d7c790b8` (test)
2. **Task 1 (GREEN): tailwind dark-mode + docker theme + section store** — `0f982638` (feat)
3. **Task 2: docker app shell — sidebar + 12 section placeholders + DockerApp** — `f43b0453` (feat)
4. **Task 3: replace LIVINITY_server-control with LIVINITY_docker — dock + desktop + mobile + window-content + apps registry** — `8b9a2a88` (refactor)

_Plan metadata commit added at the end._

## Files Created

**Docker app module** (`livos/packages/ui/src/routes/docker/`):
- `theme.ts` — `ThemeMode`, `STORAGE_KEY`, `resolveTheme()` pure resolver, `useDockerTheme(rootRef)` hook (~100 lines)
- `theme.unit.test.ts` — 4 tests covering the (mode, prefersDark) lookup table
- `store.ts` — `SectionId` union (12 entries), `SECTION_IDS` const tuple, `useDockerStore` (zustand persist), 4 selector hooks
- `store.unit.test.ts` — 5 tests covering shape, default state, setSection, toggleSidebar
- `sidebar.tsx` — `SECTION_META` (icon + label + comingPhase per section), 12-entry nav, collapse-toggle, active highlight, Radix tooltips when collapsed (~125 lines)
- `sidebar.unit.test.ts` — 3 metadata-completeness tests
- `docker-app.tsx` — top-level shell, `useDockerTheme(rootRef)`, exhaustive `SectionView` switch (~85 lines)
- `index.tsx` — default export for `React.lazy(() => import('@/routes/docker'))`
- `sections/dashboard.tsx`, `containers.tsx`, `logs.tsx`, `shell.tsx`, `stacks.tsx`, `images.tsx`, `volumes.tsx`, `networks.tsx`, `registry.tsx`, `activity.tsx`, `schedules.tsx`, `settings.tsx` — 12 placeholders, each ~10 lines

**Window adapter:**
- `livos/packages/ui/src/modules/window/app-contents/docker-content.tsx` — ErrorBoundary + Suspense wrapper around `React.lazy(@/routes/docker)`

## Files Modified

- `livos/packages/ui/tailwind.config.ts` — added `darkMode: 'class'` (top-level field, comment block above)
- `livos/packages/ui/src/providers/apps.tsx` — replaced `LIVINITY_server-control` registry entry with `LIVINITY_docker` (id + name 'Docker' + systemAppTo '/docker'; icon reused for v1)
- `livos/packages/ui/src/providers/window-manager.tsx` — `DEFAULT_WINDOW_SIZES` key renamed (1400×900 default preserved)
- `livos/packages/ui/src/modules/window/window-content.tsx` — `DockerWindowContent` lazy import added + switch case `LIVINITY_docker` → `<DockerWindowContent />` + `fullHeightApps` set member updated. Legacy `ServerControlWindowContent` import retained behind `eslint-disable-next-line` for one-phase rollback safety (delete in Plan 27 SUMMARY).
- `livos/packages/ui/src/modules/desktop/dock.tsx` — Docker dock item appId/route/title/icon refs all switched to `LIVINITY_docker`
- `livos/packages/ui/src/modules/desktop/dock-item.tsx` — `DOCK_LABELS` and `DOCK_ICONS` keys updated (auto-fix per Rule 3 — see Deviations)
- `livos/packages/ui/src/modules/desktop/desktop-content.tsx` — mobile `LIVINITY_server-control` system app entry replaced
- `livos/packages/ui/src/modules/mobile/mobile-tab-bar.tsx` — `TABS[3]` rewritten (id 'docker', label 'Docker', `IconBrandDocker` icon, route '/docker', icon SVG path)
- `livos/packages/ui/src/components/apple-spotlight.tsx` — spotlight launcher entry replaced (auto-fix per Rule 3)
- `livos/packages/ui/package.json` — added `vitest@^2.1.2` and `jsdom@^25` to devDependencies

## Decisions Made

1. **Theme scope = docker-app root, not document.documentElement.** No other LivOS surface uses `dark:` variants today; scoping keeps legacy components rendering unchanged. Promote to global when v29.0 rolls dark mode app-wide.
2. **Section navigation = zustand store, NOT URL routing.** Deep-linking is the explicit deliverable of Plan 26-01 (DOC-20). Building it now would pre-empt that planner's route-shape choice. The `'/docker'` string passed to `openWindow` is just an `initialRoute` prop — never consumed by react-router.
3. **localStorage keys: `livos:docker:theme` + `livos:docker:sidebar-collapsed`.** Naming follows Phase 22-02 D-01 precedent (`livos:selectedEnvironmentId`). The sidebar-collapsed key persists BOTH section and sidebarCollapsed in one entry via zustand `partialize`.
4. **vitest + jsdom added to UI devDeps.** UI had no test runner; livinityd uses vitest for `*.unit.test.ts` files. Carrying the convention forward beats inventing a new one. The plan permitted this fallback explicitly.
5. **Custom Sidebar primitive (Tailwind + Radix Tooltip), NOT shadcn Sidebar.** Verified `shadcn-components/ui/` has no `sidebar.tsx` — building one would be larger scope than required.
6. **`ServerControlWindowContent` import retained for one phase.** Plan explicitly instructed this for rollback safety. Wrapped in `eslint-disable-next-line @typescript-eslint/no-unused-vars` to keep CI clean. Delete in Plan 27 SUMMARY action.
7. **`SECTION_META` table-driven sidebar render.** SectionId union + SECTION_IDS array + SECTION_META record + exhaustive SectionView switch — adding/removing a section is a 4-place compile-enforced change.
8. **`darkMode: 'class'` triggers a stories/tailwind.tsx TS error message change** — pre-existing TS2352 cast error gets a slightly different message (now mentions `darkMode: string`). Underlying error is identical and pre-existing. Out of scope per scope-boundary rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated additional `LIVINITY_server-control` references the plan grep cross-check flagged**

- **Found during:** Task 3 (cross-check grep step)
- **Issue:** Plan listed 6 files to update but the grep cross-check uncovered 4 additional pre-existing references that would have caused runtime failures or stale labels:
  - `livos/packages/ui/src/providers/window-manager.tsx:74` — `DEFAULT_WINDOW_SIZES['LIVINITY_server-control']` would never match → window opens with default 900×600 instead of 1400×900
  - `livos/packages/ui/src/modules/desktop/dock-item.tsx:38, 60` — `DOCK_LABELS` / `DOCK_ICONS` lookups would return undefined → dock tooltip + icon broken
  - `livos/packages/ui/src/components/apple-spotlight.tsx:332-348` — Spotlight 'Server' launcher would call `openWindow('LIVINITY_server-control', ...)` and `systemAppsKeyed['LIVINITY_server-control'].icon` (undefined post-Task-3) → crash on click
- **Fix:** Renamed all 4 references to `LIVINITY_docker` + updated label/route/title strings. Spotlight entry label changed from 'Server' to 'Docker' (TbServer icon retained — neutral, the existing icon-asset rebrand is Phase 29 polish).
- **Files modified:** providers/window-manager.tsx, modules/desktop/dock-item.tsx, components/apple-spotlight.tsx
- **Verification:** Cross-check grep clean (only Phase 24-01 comments remain); `pnpm --filter ui build` green
- **Committed in:** 8b9a2a88 (Task 3 commit)

**2. [Rule 3 - Blocking] Added vitest + jsdom devDeps to UI package**

- **Found during:** Task 1 RED phase
- **Issue:** Plan specified writing `*.unit.test.ts` files matching the livinityd convention, but UI had no test runner. The plan documented this fallback ("ADD a minimal vitest setup as Task 1's last step ONLY if the conventional pattern doesn't carry over").
- **Fix:** Added `vitest@^2.1.2` and `jsdom@^25` to ui devDependencies via `pnpm --filter ui add -D ... --ignore-scripts` (the `--ignore-scripts` flag is required on Windows because the existing `postinstall` uses Unix `mkdir -p` / `cp -r` — pre-existing repo quirk documented in Plan 19-01).
- **Files modified:** livos/packages/ui/package.json, livos/pnpm-lock.yaml
- **Verification:** `pnpm exec vitest run src/routes/docker/ --environment jsdom` returns 12/12 tests passing
- **Committed in:** d7c790b8 (Task 1 RED commit, alongside the failing tests)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Both auto-fixes were on the plan's explicit happy-path. The grep cross-check was specified by the plan; carrying out its instruction surfaced 4 additional references in 3 files. Adding vitest was the documented fallback when the test-runner convention didn't carry over. No scope creep.

## Issues Encountered

- **`darkMode: 'class'` triggers TS2352 message change in stories/tailwind.tsx** — the pre-existing `as Config` cast error (already present without my change) gets a new message wording mentioning `darkMode: string`. The error is identical in nature, just the message diff. Confirmed pre-existing by stashing my changes and re-running `pnpm typecheck`. Out of scope per the scope-boundary rule.
- **Lint warnings on legacy files I touched** — 11 ESLint errors in files like `desktop-content.tsx`, `apps.tsx`, `dock-item.tsx` (empty `catch {}`, conditional hook calls). All confirmed pre-existing baseline via stash test. None introduced by my changes.

## Scope-Boundary Deferrals

Pre-existing typecheck noise (NOT introduced by this plan) — confirmed by stash baseline:

- `stories/src/routes/stories/{tailwind,desktop,settings,widgets}.tsx` — ~25 errors (TS2352 cast, TS2307 missing modules, TS2322 prop shape mismatches, TS7006 implicit any). Stories tree is dev-only, not part of the production bundle.
- `src/components/{cmdk,install-button,install-button-connected,motion-primitives/*}.tsx` — ~10 errors (mostly type narrowing on union states, `Transition` shape drift)
- `src/hooks/{use-current-user,use-stacks}.ts` — 3 errors (multi-user role/id shape on legacy `name+wallpaper` fallback type)
- `src/modules/desktop/desktop-content.tsx` — 6 errors (conditional hook calls — pre-existing pattern)
- `src/modules/window/window-chrome.tsx` — 1 error (`'icon' is defined but never used`)
- `src/components/apple-spotlight.tsx` — 6 lint errors (empty catch blocks)
- `src/providers/window-manager.tsx` — 1 lint error (empty catch block)

Same precedent as Plan 19-01 / 20-02 deferrals. Build is the gating signal — `pnpm --filter ui build` succeeds.

## User Setup Required

None — Phase 24-01 is pure UI scaffold. No new env vars, no DB migrations, no deployment changes. The new app id is registered automatically via apps.tsx; restarting the UI dev server (or rebuilding for prod) is sufficient.

## Next Phase Readiness — Plan 24-02 Integration Surface

Plan 24-02 (Top Status Bar) plugs into 3 anchor points provided here:

1. **`DockerApp` `<main>` first slot (docker-app.tsx, line ~48):** Plan 24-02 mounts `<StatusBar />` as the FIRST child of `<main>`, before the `<div class='min-h-0 flex-1 overflow-auto'>` SectionView wrapper. Comment in source marks the slot.
2. **`useDockerTheme()` exposes `setMode`:** The StatusBar's theme toggle button cycles `light` → `dark` → `system`. The hook is already mounted by DockerApp; the StatusBar just calls `setMode(next)`.
3. **Sidebar header height (h-12 = 48px):** StatusBar should match for visual alignment between sidebar header + status bar.

**Does NOT block 24-02:** all module exports (`DockerApp`, `useDockerTheme`, `useDockerSection`, `SectionId`, `SECTION_IDS`, `SECTION_META`) are stable from Plan 24-01 — 24-02 imports them as-is.

**Phases 25-29:** Each replaces ONE section component file (e.g. Phase 25 swaps `sections/dashboard.tsx` for the real Dashboard). Sidebar/theme/store untouched. The `comingPhase` field in SECTION_META acts as a forward-pointer documenting which phase ships each piece.

---

## Self-Check: PASSED

All 22 created files verified present on disk:
- 4 docker module files (theme.ts, store.ts, sidebar.tsx, docker-app.tsx, index.tsx)
- 3 unit test files (theme/store/sidebar)
- 12 section placeholder files
- 1 docker-content.tsx adapter
- 1 SUMMARY.md

All 4 task commits verified in git log:
- d7c790b8 (Task 1 RED)
- 0f982638 (Task 1 GREEN)
- f43b0453 (Task 2)
- 8b9a2a88 (Task 3)

Tests: 12/12 passing (`pnpm exec vitest run src/routes/docker/ --environment jsdom`)
Build: green (`pnpm --filter ui build`, 31.98s)

---

*Phase: 24-docker-app-skeleton*
*Plan: 01*
*Completed: 2026-04-25*
