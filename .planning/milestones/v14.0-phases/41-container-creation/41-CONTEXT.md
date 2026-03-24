# Phase 41: Container Creation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a complete container creation system: backend tRPC mutation for creating containers with full Docker config, and a tabbed creation form UI (General, Network, Volumes, Environment, Resources, Health Check). Also increase Server Management window to 1400x900.

</domain>

<decisions>
## Implementation Decisions

### Backend — Container Create
- New `docker.createContainer` mutation in docker/routes.ts
- Uses dockerode: docker.createContainer({...}) + container.start()
- Input schema covers ALL Portainer creation fields:
  - General: name, image (string), command (string[]), entrypoint (string[]), workingDir, user, hostname, domainname, tty, openStdin
  - Ports: array of {hostPort: number, containerPort: number, protocol: 'tcp'|'udp'}
  - Volumes: array of {hostPath?: string, containerPath: string, readOnly?: boolean, type: 'bind'|'volume'|'tmpfs', volumeName?: string}
  - Environment: array of {key: string, value: string} → converted to ["KEY=VALUE"] format
  - Labels: array of {key: string, value: string}
  - RestartPolicy: {name: 'no'|'always'|'on-failure'|'unless-stopped', maximumRetryCount?: number}
  - Resources: {memoryLimit?: number (bytes), cpuLimit?: number (nanoCPUs), cpuShares?: number}
  - HealthCheck: {test?: string[], interval?: number, timeout?: number, retries?: number, startPeriod?: number}
  - Network: {networkMode?: string, dns?: string[], extraHosts?: string[]}
  - pullImage?: boolean (pull before create, default true)
- Add to httpOnlyPaths
- adminProcedure

### Frontend — Creation Form
- Full-page overlay or large modal (not a small dialog)
- Tabbed form with 6 tabs: General, Network, Volumes, Environment, Resources, Health Check
- General tab: name input, image input (with "always pull" toggle), command, entrypoint, working dir, user, tty toggle
- Network tab: port mapping rows (add/remove: host port ↔ container port / protocol select), network mode dropdown, hostname, DNS
- Volumes tab: mount rows (add/remove: type dropdown, host path / volume name, container path, read-only toggle)
- Environment tab: key-value rows (add/remove), labels key-value rows
- Resources tab: memory limit (MB input), CPU limit, CPU shares, privileged toggle
- Health Check tab: test command, interval, timeout, retries, start period
- "Create" button at bottom — shows loading, redirects to container list on success
- Form validation: name required, image required
- Open via "Add Container" button in Containers tab header

### Window Size
- Increase Server Management window from 1100x750 to 1400x900 in window-manager.tsx

### Claude's Discretion
- Form field exact layout within each tab
- Input component choices (shadcn Input, Select, Switch, etc.)
- Error display pattern
- Loading/progress indicator during creation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 35 docker module: docker.ts singleton, routes.ts pattern, types.ts
- Phase 35 UI: server-control/index.tsx with tabs shell
- shadcn/ui: Input, Select, Switch, Tabs, Button, Label, Dialog/Sheet
- useContainers hook pattern for mutations

### Integration Points
- Extend docker/routes.ts with createContainer mutation
- Extend docker/types.ts with ContainerCreateInput type
- Add "Add Container" button to ContainersTab in server-control/index.tsx
- New component: server-control/container-create-form.tsx
- httpOnlyPaths in common.ts
- window-manager.tsx window size

</code_context>

<specifics>
## Specific Ideas

- Portainer-style tabbed creation form
- Dynamic rows for ports/volumes/env (add/remove with + and x buttons)
- Protocol dropdown for ports (tcp/udp)
- Volume type selector (bind mount / named volume / tmpfs)

</specifics>

<deferred>
## Deferred Ideas

- Registry selector for image pull — v14.0
- GPU configuration — v14.0
- Capabilities add/drop — v14.0
- Security options (seccomp, apparmor) — v14.0
</deferred>
