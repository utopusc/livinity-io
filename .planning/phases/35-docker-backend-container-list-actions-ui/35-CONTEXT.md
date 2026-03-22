# Phase 35: Docker Backend + Container List/Actions UI - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Docker management foundation: Dockerode singleton module, protected container registry, new `docker` tRPC router with full container CRUD operations (list, start, stop, restart, remove), admin-only auth, and a tabbed Server Management UI shell with the Containers tab showing a sortable container table with inline actions.

</domain>

<decisions>
## Implementation Decisions

### Docker Backend Architecture
- Create Dockerode singleton in `modules/docker/docker.ts` (not per-call import)
- New `docker` tRPC router at `modules/docker/routes.ts` with adminProcedure
- Protected container registry: hardcoded array of container name patterns that cannot be stopped/removed (redis, postgres, caddy, livinityd patterns)
- All new mutations added to `httpOnlyPaths` in common.ts to avoid WebSocket hangs

### Container Operations
- `docker.listContainers` query: all containers (running + stopped), return name, image, state, status, ports, created
- `docker.manageContainer` mutation: operations `start | stop | restart | remove`, validate against protected registry
- Remove requires `force: true` param and container name confirmation on frontend
- Return port mappings as structured data (hostPort, containerPort, protocol)

### UI Architecture
- Replace/extend existing Server Control page with tabbed interface
- Tabs: Overview, Containers, Images, Volumes, Networks, PM2, Monitoring (placeholder tabs for future phases)
- Containers tab as default active tab
- Container table with columns: Name, Image, State, Status, Ports, Actions
- State shown as color-coded badge (green=running, red=stopped, yellow=paused)
- Action buttons inline: Start (green), Stop (amber), Restart (blue), Remove (red)
- Remove button shows confirmation dialog requiring typed container name
- Protected containers show disabled/hidden action buttons
- 5s polling for container list refresh

### Claude's Discretion
- Table sorting (by name, state, image) implementation details
- Exact Tailwind styling/color choices within existing design system
- Animation choices for state transitions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dockerode` v4.0.2 already installed
- `server-control/index.tsx` — existing page with resource charts + basic container cards
- `shadcn/ui` components (Table, Badge, Button, Dialog, Tabs)
- `useCpu`, `useMemory`, `useDisk` hooks — polling pattern to reuse
- Framer Motion for animations
- `adminProcedure` in tRPC for role-based auth

### Established Patterns
- tRPC router files in `modules/<name>/routes.ts`
- Frontend routes in `routes/<name>/index.tsx`
- Hooks in `hooks/use-<name>.ts`
- `httpOnlyPaths` in `common.ts` for mutation routing

### Integration Points
- tRPC appRouter in `modules/server/trpc/index.ts` — add new `docker` router
- Frontend router — update Server Control route
- `common.ts` httpOnlyPaths — register new mutations
- Existing `ai.listDockerContainers` / `ai.manageDockerContainer` — keep as deprecated aliases

</code_context>

<specifics>
## Specific Ideas

- Portainer-style container table (sortable, filterable)
- CasaOS-style color-coded state badges
- Protected containers shown with a lock icon
- Port mappings shown as clickable links (e.g., "8080→80/tcp")

</specifics>

<deferred>
## Deferred Ideas

- Container exec/terminal — Phase 40
- Container creation from UI — v13.0
- Bulk operations (stop all, remove selected) — Phase 40
- Container resource graphs — Phase 36
</deferred>
