# Phase 39: Enhanced System Monitoring + Overview Tab - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add enhanced system monitoring (network I/O, disk I/O, process list) and an Overview tab that combines system health with container/PM2 summaries. Backend: new monitoring tRPC routes using systeminformation. Frontend: Monitoring tab content + Overview tab as the dashboard landing page.

</domain>

<decisions>
## Implementation Decisions

### Backend — Monitoring Routes
- New `monitoring` tRPC router (or extend `system` router)
- `monitoring.networkStats` query: uses systeminformation networkStats(), returns array of {interface, rxBytes, txBytes, rxSec, txSec}
- `monitoring.diskIO` query: uses systeminformation disksIO(), returns {rIO, wIO, rIOSec, wIOSec}
- `monitoring.processes` query: uses systeminformation processes(), return top 20 by CPU or memory, fields: {pid, name, cpu, memory, state}
- NOTE: systeminformation rate values (rxSec, txSec, rIOSec, wIOSec) return null on first call — need two calls with delay or frontend handles null gracefully
- All queries use privateProcedure (read-only monitoring, not admin-only)

### Frontend — Monitoring Tab
- Network I/O: recharts AreaChart with 30-point history (rxSec, txSec), 2s polling
- Disk I/O: recharts AreaChart with 30-point history (rIOSec, wIOSec), 5s polling
- Process list: sortable table (PID, Name, CPU%, Memory, State), toggleable sort by CPU or Memory

### Frontend — Overview Tab (becomes default tab)
- System health row: CPU, RAM, Disk, Temp sparklines (reuse existing useCpu, useMemory, useDisk, useCpuTemperature hooks)
- Container summary card: X running / Y total containers, link to Containers tab
- PM2 summary card: X online / Y total processes, link to PM2 tab
- Network throughput mini: current rx/tx speed
- Make Overview the default active tab (move Containers to second position)

### Claude's Discretion
- Chart colors and styling
- Process list page size
- Overview card layout (grid vs flex)
- Sparkline implementation (recharts mini or custom)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing system hooks: useCpu, useMemory, useDisk, useCpuTemperature
- Existing recharts integration (AreaChart in server-control, live-usage)
- Existing system routes: system.cpuUsage, system.memoryUsage, system.diskUsage, system.cpuTemperature
- Container list hook (useContainers) for summary count
- PM2 list hook (usePM2) for summary count
- systeminformation already installed (forked from getumbrel)

### Integration Points
- New monitoring routes in tRPC
- Fill Monitoring placeholder tab
- Replace Overview placeholder or add new tab
- Reorder tabs: Overview first

</code_context>

<specifics>
- systeminformation first-call null issue: either do a warmup call on server start or handle null in frontend
</specifics>

<deferred>
## Deferred Ideas
- Historical metrics storage (24h/7d) — v13.0
- Per-container network traffic — v13.0
- Alert thresholds — v13.0
</deferred>
