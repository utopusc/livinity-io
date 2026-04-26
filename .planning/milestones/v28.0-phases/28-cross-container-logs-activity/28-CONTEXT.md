# Phase 28: Cross-Container Logs + Activity Timeline — Context

**Gathered:** 2026-04-25
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Two NEW surfaces v27.0 didn't ship:
1. **Cross-container Logs** — multi-select container log aggregator with grep + live-tail
2. **Activity Timeline** — global event timeline (docker events + scheduler runs + AI alerts) sorted desc

**Depends on:** Phase 24 (DockerApp + sections), Phase 17 (per-container WS log streaming), Phase 20 (scheduler run history), Phase 23 (AI alerts table).

**Requirement IDs:** DOC-13, DOC-14

**Success criteria:**
1. `/docker/logs` route — multi-select containers (sidebar list), free-text grep filter, timestamp range, severity filter, live-tail toggle. Re-uses `/ws/docker/logs` per-container with multiplexed UI.
2. Lines from different containers visually distinguished (color stripe + container name prefix).
3. `/docker/activity` route — global event timeline aggregating Docker events + scheduler run history + AI alerts. Filter by source (docker / scheduler / ai). Filter by severity. Sorted descending.
4. Live updates: new events appear at top with smooth insertion.
5. Clicking an event navigates to its source resource.

</domain>

<decisions>
## Implementation Decisions

### Logs (DOC-13)
- **Multi-select left sidebar within Logs section** — small list of running containers in selected env. Checkboxes; clicking toggles include.
- **Multiplexed UI**: open one WS subscription per included container via existing `/ws/docker/logs` (Phase 17). Aggregate lines client-side, sort by container timestamp.
- **Color stripe per container**: deterministic hash of container name → consistent color stripe on left edge of each line.
- **Container name prefix** in line: `[container-name]` followed by line content.
- **Grep filter**: client-side regex match against the visible line buffer (capped at, e.g., 5000 lines per container).
- **Severity filter**: heuristic based on common log patterns (ERROR / WARN / INFO / DEBUG keywords). Optional.
- **Timestamp range**: client-side filter on parsed timestamps (or relative "last N minutes" picker).
- **Live-tail toggle**: when on, auto-scrolls to bottom; when off, user can scroll up freely.
- **xterm reuse**: NO — xterm is per-container, color-stripe + line prefix needs custom render. Use a virtualized list (react-window or similar) for performance with thousands of lines.

### Activity Timeline (DOC-14)
- **Three sources unified**:
  1. Docker events from existing `dockerEvents` tRPC route (Phase 22) or WS subscription
  2. Scheduler run history from `scheduled_jobs` history (Phase 20 — needs query like `scheduler.listRuns({limit, since})` — verify exists, else add small backend query)
  3. AI alerts from `ai_alerts` table (Phase 23 — `docker.listAiAlerts` already exists)
- **Unified shape**: `{id, source: 'docker'|'scheduler'|'ai', severity, timestamp, title, body, sourceId, sourceType}` where sourceId+sourceType allows click-through (e.g., `sourceType: 'container', sourceId: 'n8n'`).
- **Filter chips**: source filter (All / docker / scheduler / ai), severity filter (All / info / warn / error).
- **Live updates**: poll every 5s + WS subscription on dockerEvents for instant Docker event delivery. New events fade-in at top.
- **Click-through**: Docker container event → setSelectedContainer + setSection('containers'). Scheduler run → setSection('schedules'). AI alert → setSelectedContainer (if alert is container-scoped) or setSection('logs') for cross-container.

### Backend Extensions (Allowed)
- If `scheduler.listRuns({limit, since})` doesn't exist, add a small tRPC query that reads `scheduled_jobs.last_run_at` + history table. One query, no new tables.
- All Docker events come from existing `dockerEvents` (no extension).
- AI alerts come from existing `docker.listAiAlerts` (no extension).

### Scope Boundaries
- DOC-13 + DOC-14 only.
- xterm-style per-container Logs already exists in ContainerDetailSheet (Phase 17) — keep that. The cross-container Logs is a NEW surface that complements it.
- Cross-container shell is Phase 29 (DOC-15).

</decisions>

<code_context>
## Existing Code Insights

- `livos/packages/ui/src/routes/docker/sections/logs.tsx` + `activity.tsx` (Phase 24 placeholders — replace)
- `livos/packages/ui/src/components/log-viewer.tsx` (or similar — find Phase 17 xterm component)
- `livos/packages/livinityd/source/modules/server/docker-logs-socket.ts` (Phase 17 WS handler — already supports `/ws/docker/logs?container=X&envId=Y`)
- `livos/packages/livinityd/source/modules/docker/routes.ts` — find `dockerEvents`, `listAiAlerts`
- `livos/packages/livinityd/source/modules/scheduler/index.ts` (Phase 20 — find run history query)
- `livos/packages/ui/src/hooks/use-containers.ts` (env-aware list — for sidebar)
- Tabler icons for source badges (docker / scheduler / ai)

</code_context>

<specifics>
## Specific Ideas

- Plan 28-01: Cross-container Logs — multi-select sidebar, multiplexed WS, color stripes, grep, severity, live-tail
- Plan 28-02: Activity Timeline — unified event stream, filter chips, click-through, live updates

</specifics>

<deferred>
## Deferred Ideas

- Saved query presets (out of scope per REQUIREMENTS.md)
- Cross-container regex grep replacement (out of scope)
- Persistent log archival (existing host docker handles)

</deferred>
