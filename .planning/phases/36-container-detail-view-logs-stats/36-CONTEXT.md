# Phase 36: Container Detail View + Logs + Stats - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add container detail drill-down: clicking a container opens a sheet/drawer with tabbed Info/Logs/Stats views. Backend: inspect endpoint, log streaming via tRPC subscription, container stats polling. Frontend: detail sheet component with three tabs.

</domain>

<decisions>
## Implementation Decisions

### Backend — Container Inspect
- New `docker.inspectContainer` query: returns full inspect data (ports, volumes, env vars, networks, mounts, restart policy, health status, created, platform)
- Input: container name (string)
- Output: ContainerDetail type with all fields

### Backend — Container Logs
- New `docker.containerLogs` query: returns last N lines of logs
- Parameters: name (string), tail (number, default 500), timestamps (boolean, default true)
- Returns: string (log output with ANSI codes preserved)
- For v12.0: polling-based (query every 2s), NOT streaming subscription (defer real-time streaming)

### Backend — Container Stats
- New `docker.containerStats` query: returns one-shot stats snapshot
- Uses dockerode container.stats({stream: false}) for single snapshot
- Returns: ContainerStats type with cpuPercent, memoryUsage, memoryLimit, memoryPercent, networkRx, networkTx, pids
- Frontend polls every 3s for the selected container only

### Frontend — Detail Sheet
- Use shadcn/ui Sheet component (slides in from right)
- Opens when clicking a container row in the table
- Three tabs inside: Info, Logs, Stats
- Info tab: key-value pairs for all inspect fields, ports table, volumes table, env vars list
- Logs tab: monospace pre block with ANSI-stripped output, auto-scroll, tail slider (100-1000), refresh button
- Stats tab: CPU% and Memory% gauges/progress bars, network I/O display, PID count
- Close button returns to container list

### Claude's Discretion
- Exact Sheet width and animation
- ANSI stripping approach (strip or render with colors)
- Stats gauge visual style (progress bar vs ring chart)
- Info tab field ordering

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 35 docker module: `modules/docker/docker.ts` (Dockerode singleton, listContainers, manageContainer)
- Phase 35 types: `modules/docker/types.ts` (ContainerInfo, PortMapping)
- Phase 35 routes: `modules/docker/routes.ts` (existing tRPC router to extend)
- Phase 35 frontend: `routes/server-control/index.tsx` (container table, tabs shell)
- Phase 35 hook: `hooks/use-containers.ts` (tRPC query pattern)
- shadcn/ui Sheet component
- Existing recharts integration for charts

### Integration Points
- Extend `docker/routes.ts` with new queries (inspectContainer, containerLogs, containerStats)
- Extend `docker/types.ts` with ContainerDetail and ContainerStats types
- Add ContainerDetailSheet component to server-control page
- httpOnlyPaths: queries don't need to be added (only mutations)

</code_context>

<specifics>
## Specific Ideas

- Portainer-style detail drawer with full inspect data
- Logs with line numbers and timestamp toggle
- Stats as compact gauges (not full charts — those are for the monitoring tab)

</specifics>

<deferred>
## Deferred Ideas

- Real-time log streaming via WebSocket/subscription — use polling for v12.0
- Log download/export — future
- Log search/filter — future
- Per-container historical stats — Phase 39 or v13.0
</deferred>
