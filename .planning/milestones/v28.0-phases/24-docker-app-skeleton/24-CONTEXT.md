# Phase 24: Docker App Skeleton — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Standalone Docker app at `/docker` route with persistent left sidebar + top status bar — the structural foundation for everything in v28.0. Reference design: Dockhand (https://dockhand.dev / https://dockhand.bor6.pl).

**Depends on:** Nothing (foundation phase of v28.0; consumes v27.0 backend)

**Requirement IDs in scope:** DOC-01, DOC-02, DOC-03

**Success criteria from ROADMAP:**
1. `/docker` mounts a layout with persistent left sidebar (collapsible to icon-only) and top status bar.
2. Sidebar lists 12 entries: Dashboard, Containers, Logs, Shell, Stacks, Images, Volumes, Networks, Registry, Activity, Schedules, Settings.
3. Top status bar shows env selector, Docker version, Socket type, cores, RAM total, free disk, uptime, current time, Live indicator (WS connection state), Search button, theme toggle.
4. Old `/server` redirects to `/docker` (no parallel implementations).
5. Theme toggle persists choice (light / dark / system) per-user via existing LivOS theme infra.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at planner discretion (discuss skipped). Use existing Dockhand reference design + LivOS conventions to drive choices.

### Likely Patterns (from prior precedent + Dockhand reference)
- **Routing**: React Router v6 nested routes — `/docker/*` parent layout + child routes for Dashboard/Containers/Logs/Shell/Stacks/Images/Volumes/Networks/Registry/Activity/Schedules/Settings. Each child route lazy-loads its own component (matches Phase 22 lazy `EnvironmentsSectionLazy`).
- **Sidebar**: shadcn/ui Sidebar primitive (verify if installed; if not, build from Tailwind Flex) with collapsible state persisted to localStorage (`livos:docker:sidebar-collapsed`). Icons from Tabler (already in repo).
- **Top status bar**: Reuse `EnvironmentSelector` from Phase 22 (already mounted in current Server Control header) — relocate to top status bar component. Add system stats pills (Docker version / Socket type / cores / RAM / disk / uptime / time / Live indicator) — backed by existing `docker.getEngineInfo` query (extend if needed for missing fields).
- **Live indicator**: WS connection state from existing tRPC link — green dot when connected, red on disconnect.
- **Theme**: LivOS already ships theme infra (Settings > Appearance) — reuse the existing theme store + apply to `/docker` route via wrapper component.
- **Old `/server` deprecation**: Replace existing Server Control route with redirect (`<Navigate to="/docker" replace />`). Move existing Server Control component file to `/docker/legacy-server-control.tsx` or delete entirely (the relevant content gets migrated piecemeal in Phases 25-29).

### Scope Boundaries
- Only the skeleton + sidebar + top status bar in this phase.
- Dashboard view is Phase 25 (placeholder route stub OK for now).
- All resource routes (Containers/Images/etc.) are Phase 26-29 — Phase 24 just lays out the empty route components with "Coming in Phase XX" placeholders.
- Cmd+k command palette is Phase 29 — but the Search button in the top status bar can be wired to a `<>` placeholder modal in Phase 24.

</decisions>

<code_context>
## Existing Code Insights

Anchor files for the planner to examine:

- `livos/packages/ui/src/routes/server-control/index.tsx` — current tab-based Server Control page (~5000+ lines, big file). Header section at top has logo + EnvironmentSelector + Tabs. v28 will replace this layout.
- `livos/packages/ui/src/routes/server-control/environment-selector.tsx` — Phase 22 EnvironmentSelector component (3140 bytes). Reuse as-is.
- `livos/packages/ui/src/routes/server-control/ai-alerts-bell.tsx` — Phase 23 AlertsBell. Mount in top status bar.
- `livos/packages/ui/src/stores/environment-store.ts` — Phase 22 zustand env store with `useSelectedEnvironmentId`. Reuse.
- `livos/packages/ui/src/App.tsx` (or `main.tsx`) — top-level router. Add `/docker/*` route here, redirect `/server` → `/docker`.
- `livos/packages/ui/src/components/ui/sidebar.tsx` (if exists) — shadcn Sidebar primitive; otherwise Tailwind layout.
- `livos/packages/ui/src/hooks/use-engine-info.ts` (if exists) — Docker version + cores via `docker.getEngineInfo` tRPC. May need extension for uptime / disk.
- `livos/packages/ui/tailwind.config.js` — verify existing theme tokens for sidebar (dark/light bg, text, accent).
- `livos/packages/ui/src/lib/theme.ts` (or similar) — existing theme store; reuse for theme toggle.

Existing tRPC endpoints to consume in top status bar:
- `docker.getEngineInfo` → Docker version, cores, total RAM, OS
- `docker.listEnvironments` → env dropdown population
- `system.getStats` (if exists) → uptime, free disk; if missing, livinityd extension is in scope

</code_context>

<specifics>
## Specific Ideas

- The existing Server Control page has a tabs implementation that's deeply embedded — don't try to migrate everything in this phase. Just lay down the skeleton route, redirect old to new, and put placeholder components for each child route. Subsequent phases (25-29) will move the real content into each placeholder.
- Consider naming the new route component `DockerApp` or `DockerLayout` — follow existing component-naming conventions in `livos/packages/ui/src/routes/`.
- Sidebar collapsed state: stored as localStorage `livos:docker:sidebar-collapsed` (matches the env-store key naming `livos:selectedEnvironmentId` from Phase 22).

</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.

</deferred>
