# Phase 46: Events + Engine Info + Polish - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Docker events log (real-time event stream), Docker engine info display, Events and Engine tabs in Server Management, and final polish.

</domain>

<decisions>
## Implementation Decisions

### Backend — Docker Events
- `docker.events` query: uses dockerode.getEvents() with time filter, returns array of {type, action, actor, time, attributes}
- Query takes {since?: number (unix timestamp), until?: number, filters?: {type?: string[]}}
- Returns last 100 events by default
- NOT real-time streaming for v13.0 — polling every 5s is sufficient

### Backend — Docker Engine Info
- `docker.engineInfo` query: uses dockerode.info() and dockerode.version()
- Returns {version, apiVersion, os, architecture, kernelVersion, storageDriver, loggingDriver, cpus, totalMemory, dockerRootDir, containers, images, volumes, serverTime}
- Read-only, privateProcedure (not admin-only — just info)

### Frontend — Events Tab
- New tab in Server Management
- Event log table: Time, Type (badge: container/image/network/volume), Action, Actor (name), Details
- Filter row at top: type dropdown (all/container/image/network/volume), time range dropdown (last 1h/6h/24h/7d)
- 5s polling for new events
- Color-coded action badges (create=green, destroy=red, start=blue, stop=amber, etc.)

### Frontend — Engine Info
- Show in Overview tab as a collapsible "Docker Engine" section
- Key-value grid: Version, API Version, OS, Architecture, Kernel, Storage Driver, Logging Driver, CPUs, Memory, Containers (total), Images (total)

### Claude's Discretion
- Event detail formatting
- Engine info grid layout
- Event badge colors per action type

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- dockerode already handles getEvents() and info()/version()
- Tab pattern established in server-control
- Badge component for event types
- Overview tab for engine info section

### Integration Points
- Extend docker/routes.ts with events and engineInfo queries
- Add Events tab to server-control/index.tsx
- Add engine info section to OverviewTab
- New hook: use-docker-events.ts

</code_context>

<specifics>
No specific requirements.
</specifics>

<deferred>
- Real-time event streaming via WebSocket — v14.0
- Event notifications/alerts — v14.0
</deferred>
