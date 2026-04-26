# Phase 25: Multi-Environment Dashboard — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Dashboard view in the v28.0 Docker app — multi-environment health card grid + Top-CPU panel + env tag filter chips. Reference design: Dockhand Dashboard (https://dockhand.bor6.pl).

**Depends on:** Phase 24 (DockerApp shell + StatusBar + Sidebar — already shipped: 11 commits d7c790b8..2853d27d). Phase 22 (multi-host environments table + tRPC).

**Requirement IDs in scope:** DOC-04, DOC-05, DOC-06

**Success criteria from ROADMAP:**
1. Dashboard route renders env card grid — each card has env name + type icon + connection target + tags + health banner + container counts (running/stopped/paused/restarting) + image/stack/volume/network counts + recent events (last 8) + CPU/memory utilization.
2. "Top containers by CPU" panel aggregates across all envs, sorted by CPU%, with quick-action chips (logs / shell / restart). Updates every 5s.
3. Env tag filter chips (All / dev / prod / staging) filter card grid client-side.
4. Live polling (5s) updates stats; visual transitions smooth, no full re-render flicker.
5. Clicking an env card scopes the rest of the app to that env (sets selectedEnvironmentId in zustand store).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at planner discretion (discuss skipped). Use Dockhand reference + Phase 24's established patterns.

### Likely Patterns
- **Section component**: `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` already exists as a placeholder from Phase 24 ("Coming in Phase 25"). Replace its body with the real dashboard.
- **Card grid**: Tailwind `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4` (matches Dockhand 4-up at wide viewport).
- **Env card** = subcomponent. Aggregates per-env data via React Query queries: `docker.engineInfo({environmentId})`, `docker.containerCountsByState({environmentId})` (NEW or extend existing), `docker.listContainers({environmentId})` (slice for top-CPU + counts), `docker.listImages({environmentId})` (count only), `docker.listVolumes({environmentId})` (count only), `docker.listNetworks({environmentId})` (count only), `docker.listStacks({environmentId})` (count only), `docker.recentEvents({environmentId, limit:8})` (NEW or use existing event stream + slice).
- **Backend extension if needed**: If `docker.containerCountsByState` or `docker.recentEvents` don't exist, prefer client-side aggregation from existing `listContainers` + dockerEvents WS first; if performance is a concern (many envs × many containers polling 5s), add a single new tRPC query that returns aggregated counts per env in one call. This is fine — backend "no new modules" rule is for invasive features; small aggregation queries that consume existing data are OK.
- **Top-CPU panel**: across-all-envs union of `docker.listContainers({environmentId: each})` filtered to running, sorted by `cpu_percent`, top 10. Quick-action chips inline.
- **Env tags**: NEW user-editable per-env metadata. Schema: add `tags TEXT[]` column to `environments` table OR JSON column. Editable in `/docker/settings` (Phase 29) but Phase 25 needs the read path + a temporary inline edit (e.g., right-click env card → Edit Tags). For autonomous mode minimum scope: render existing tags from PG, edit-UI is OK to defer to Phase 29 — but the schema column must land in Phase 25 since DOC-06 requires the filter chips to work.
- **Filter chips**: Tags collected from all env cards; "All" + each unique tag becomes a chip. Click toggles; multiple chips multi-select OR single-select (Dockhand looks single-select by visible state). Default single-select.
- **Polling**: React Query `refetchInterval: 5000` per query. Per Phase 22 D-02 precedent, queryKey includes `environmentId` so per-env data refetches on env switch automatically. Phase 25 dashboard polls multiple envs in parallel using individual hooks per env card.
- **Live indicator**: per-env card shows online/offline pill (env's `agent_status` for agent envs; ping/getEngineInfo failure → offline for socket/tcp-tls envs).
- **Click env card → scope app**: calls `useEnvironmentStore.setState({selectedEnvironmentId: env.id})` then optionally navigates to `containers` section. v28.0 plan defers actual route-switching to Phase 26 (deep-linking) but Phase 25 can call `useDockerSection.setSection('containers')` to switch the section view.

### Scope Boundaries
- DOC-04 (env card grid) + DOC-05 (Top-CPU panel) + DOC-06 (filter chips) = the Phase 25 deliverable.
- Editing env tags UI = Phase 29 (Settings); Phase 25 just renders existing tags.
- Per-env CPU/memory utilization aggregate (sum across containers) = part of DOC-04 ("CPU/memory utilization for selected env").
- "Live polling 5s" — keep React Query default refetch interval to 5000ms; document if any query is too expensive to poll at that rate (e.g., listImages on 357-image env) — in that case 30s is fine for image/volume/network counts (less dynamic).

</decisions>

<code_context>
## Existing Code Insights

Anchor files:
- `livos/packages/ui/src/routes/docker/sections/dashboard.tsx` — placeholder from Phase 24
- `livos/packages/ui/src/routes/docker/section.ts` (or `store.ts`) — `useDockerSection` zustand store
- `livos/packages/ui/src/stores/environment-store.ts` — Phase 22 env store (`useEnvironmentStore`, `useSelectedEnvironmentId`)
- `livos/packages/ui/src/hooks/use-environments.ts` — `useEnvironments()` 10s refetch
- `livos/packages/ui/src/hooks/use-containers.ts` — env-aware listContainers
- Similar hooks: use-images.ts, use-volumes.ts, use-networks.ts, use-stacks.ts (Phase 22)
- `livos/packages/livinityd/source/modules/docker/routes.ts` — env-aware tRPC routes
- `livos/packages/livinityd/source/modules/docker/environments.ts` — Phase 22 environments CRUD
- `livos/packages/livinityd/source/modules/database/schema.sql` — environments table (add `tags TEXT[]` column)
- Tabler icons (already in repo) — for env type / state / event verbs

</code_context>

<specifics>
## Specific Ideas

- Env card visual structure (top to bottom):
  - Header row: type icon (globe/socket/agent) + env name + connection target + edit gear
  - Tags chips
  - Health banner (green "All containers healthy" / amber "N unhealthy")
  - Container count row: ▶N (running), □N (stopped), ‖N (paused), ↺N (restarting), Total N
  - Stats grid (2x2): Images / Stacks / Volumes / Networks
  - Events: Recent events list (last 8 with timestamp + name + verb icon)
  - Optional: CPU/memory utilization mini-chart (defer chart to v29.0; just numbers in Phase 25)
- For now (Phase 25), focus on TEXT-based render. Sparklines/charts can come later.
- Dockhand uses subtle drop-shadow + rounded corners; reuse Phase 24 sidebar/status-bar styling for consistency.

</specifics>

<deferred>
## Deferred Ideas

- Custom dashboard widgets / user-arrangeable layout (out of scope per REQUIREMENTS.md)
- Sparkline/chart rendering for CPU/memory (text-only for Phase 25; rich viz can be v29.0 polish)
- Inline tag editing UI (Phase 29 Settings owns it; Phase 25 only renders)

</deferred>
