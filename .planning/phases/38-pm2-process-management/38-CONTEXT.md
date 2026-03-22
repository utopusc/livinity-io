# Phase 38: PM2 Process Management - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add PM2 process management: new `pm2` tRPC router using execa to shell out to PM2 CLI (not programmatic API). Backend: list, manage (start/stop/restart), logs, describe. Frontend: PM2 tab with process table, action buttons, log viewer, detail view.

</domain>

<decisions>
## Implementation Decisions

### Backend — PM2 via execa
- Use `execa('pm2', ['jlist'])` for structured JSON output (NOT pm2 programmatic API — avoids 40MB dep, connection lifecycle issues)
- New tRPC router: `pm2` with adminProcedure on all routes
- Protected processes: livos, nexus-core cannot be stopped (similar to Docker protected containers)

### Routes
- `pm2.list` query: exec `pm2 jlist`, parse JSON, return array of {name, pm_id, status, cpu, memory, uptime, restarts, pm2_env.node_version}
- `pm2.manage` mutation: operations `start | stop | restart`, exec `pm2 {operation} {name}`, validate against protected list
- `pm2.logs` query: exec `pm2 logs {name} --lines {N} --nostream --raw`, return string (stdout + stderr interleaved)
- `pm2.describe` query: exec `pm2 describe {name} --json`, parse first result, return {name, pm_id, pid, script, cwd, node_version, exec_mode, status, restarts, uptime, created_at}

### Frontend — PM2 Tab
- Process table: Name, Status (badge), CPU%, Memory, Uptime, Restarts, Actions
- Status badges: online=green, stopped=red, errored=amber, launching=blue
- Action buttons: Start, Stop, Restart (protected processes have disabled stop)
- Click row to expand inline detail panel (not a sheet — simpler than Docker)
- Detail panel: Process info + log viewer
- Log viewer: monospace pre with auto-scroll, refresh button, lines slider (50-500, default 200)
- 10s polling for process list

### Claude's Discretion
- Exact execa options (timeout, etc.)
- Memory display format (MB or human-readable)
- Uptime format (relative or absolute)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Docker routes pattern (adminProcedure, Zod validation)
- Container table pattern (state badges, action buttons, protected indicators)
- Log viewer pattern from Phase 36 container logs
- httpOnlyPaths pattern for mutations

### Integration Points
- New `modules/pm2/routes.ts` tRPC router
- Register in appRouter at `modules/server/trpc/index.ts`
- Add mutations to httpOnlyPaths
- Fill PM2 placeholder tab in server-control/index.tsx

</code_context>

<specifics>
No specific requirements beyond standard PM2 management.
</specifics>

<deferred>
## Deferred Ideas
- PM2 ecosystem file editor — v13.0
- PM2 log rotation trigger — v13.0
- Process environment editor — v13.0
</deferred>
