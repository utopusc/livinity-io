# Stack Research: v12.0 -- Server Management Dashboard

**Domain:** Server management dashboard (Docker lifecycle, PM2 process management, enhanced system monitoring)
**Researched:** 2026-03-22
**Confidence:** HIGH -- all recommendations build on libraries already in the codebase

---

## Executive Summary

The v12.0 Server Management Dashboard requires **zero new runtime dependencies on the backend** and only **two small addons on the frontend**. The existing stack -- `dockerode ^4.0.2`, `systeminformation` (forked), `execa`, `node-pty`, `@xterm/xterm ^5.4.0`, and `recharts ^2.12.7` -- already covers every capability needed. The work is purely about writing new tRPC routes that expose more of dockerode's API surface, adding `systeminformation` calls for network/disk I/O, shelling out to `pm2` via execa (not the pm2 programmatic API), and building UI components with the existing component library.

---

## What Already Exists (DO NOT re-add)

These are already installed and working. Listed to prevent duplicate installs.

| Package | Current Version | Where Used | Relevant Capabilities |
|---------|----------------|------------|----------------------|
| `dockerode` | ^4.0.2 | `docker-pull.ts`, `ai/routes.ts` | `listContainers`, `getContainer`, `start/stop/restart`, `pull` |
| `@types/dockerode` | ^3.3.26 | devDep | Full typings for Container, Image, Volume, Network, Exec |
| `systeminformation` | forked (getumbrel) | `system.ts` | `cpuTemperature`, `mem`, `system` |
| `execa` | ^7.1.1 | Throughout | Shell command execution (used for `docker inspect`, `ps`, `top`, `df`) |
| `node-pty` | ^1.0.0 | `terminal-socket.ts` | PTY spawning for `docker exec -it` terminal sessions |
| `ws` | ^8.16.0 | Server + terminal | WebSocket for terminal I/O and tRPC subscriptions |
| `@xterm/xterm` | ^5.4.0 | UI terminal | Terminal rendering in browser |
| `@xterm/addon-fit` | ^0.9.0 | UI terminal | Auto-fit terminal to container |
| `recharts` | ^2.12.7 | `live-usage.tsx`, `server-control/` | Area charts for CPU/memory/disk |
| `zod` | ^3.21.4 (backend) / 4.0.8 (UI) | Throughout | Input validation for tRPC routes |
| `@trpc/server` | ^11.1.1 | Backend | tRPC v11 router definitions |
| `@trpc/client` | 11.1.1 | UI | tRPC client for queries/mutations |
| `@trpc/react-query` | 11.1.1 | UI | React hooks for tRPC |
| `framer-motion` | 10.16.4 | UI | Animations (AnimatePresence, layout) |
| `@tabler/icons-react` | ^3.36.1 | UI | Icon library |

---

## New Packages to ADD

### Backend (livinityd) -- NONE

**No new backend packages required.** Every capability is covered:

| Capability | How to Implement | Library |
|------------|-----------------|---------|
| Container inspect | `docker.getContainer(id).inspect()` | dockerode (existing) |
| Container logs | `docker.getContainer(id).logs({follow, stdout, stderr, tail})` | dockerode (existing) |
| Container exec | Already implemented via `node-pty` + `docker exec` in `terminal-socket.ts` | node-pty (existing) |
| Container remove | `docker.getContainer(id).remove({force})` | dockerode (existing) |
| Container stats (one-shot) | `docker.getContainer(id).stats({stream: false})` | dockerode (existing) |
| Container stats (streaming) | `docker.getContainer(id).stats({stream: true})` + tRPC subscription or SSE | dockerode (existing) |
| Image list | `docker.listImages()` | dockerode (existing) |
| Image pull | Already implemented in `docker-pull.ts` with progress tracking | dockerode (existing) |
| Image remove | `docker.getImage(name).remove()` | dockerode (existing) |
| Image tag | `docker.getImage(name).tag({repo, tag})` | dockerode (existing) |
| Volume list | `docker.listVolumes()` | dockerode (existing) |
| Volume remove | `docker.getVolume(name).remove()` | dockerode (existing) |
| Volume inspect | `docker.getVolume(name).inspect()` | dockerode (existing) |
| Network list | `docker.listNetworks()` | dockerode (existing) |
| Network inspect | `docker.getNetwork(id).inspect()` | dockerode (existing) |
| Network remove | `docker.getNetwork(id).remove()` | dockerode (existing) |
| PM2 list | `execa('pm2', ['jlist'])` -- parse JSON output | execa (existing) |
| PM2 describe | `execa('pm2', ['jlist'])` -- filter by name | execa (existing) |
| PM2 restart/stop/start | `execa('pm2', ['restart', name])` | execa (existing) |
| PM2 logs | `execa('pm2', ['logs', name, '--lines', n, '--nostream'])` | execa (existing) |
| Network I/O stats | `systemInformation.networkStats()` | systeminformation (existing) |
| Disk I/O stats | `systemInformation.disksIO()` | systeminformation (existing) |
| Process list | `systemInformation.processes()` | systeminformation (existing) |

### Frontend (UI) -- 2 Optional Addons

| Package | Version | Purpose | Why Add |
|---------|---------|---------|---------|
| `@xterm/addon-search` | ^0.16.0 | Search within container log terminal | Lets users search through Docker/PM2 log output in the terminal viewer |
| `@xterm/addon-web-links` | ^0.12.0 | Clickable URLs in terminal output | URLs in container logs become clickable links |

These are optional quality-of-life addons. The core features work without them.

```bash
# Frontend only -- optional addons
cd livos/packages/ui
pnpm add @xterm/addon-search@^0.16.0 @xterm/addon-web-links@^0.12.0
```

---

## Recommended Stack (Detailed Decisions)

### Docker Management -- Use dockerode Directly

**Decision:** Use `dockerode` programmatic API, NOT `execa('docker', ...)` shell commands.

**Why:**
- Already installed and typed (`@types/dockerode`)
- Streaming support built-in (stats, logs, exec, pull progress)
- Promise-based API with full Docker Engine API coverage
- Structured JSON responses (no stdout parsing needed)
- Already proven in codebase (`docker-pull.ts`, `ai/routes.ts`)

**Exception:** The existing `terminal-socket.ts` correctly uses `node-pty` to spawn `docker exec -it` for interactive terminal sessions. Keep this pattern -- dockerode's exec API is more complex for interactive TTY and node-pty handles resize/signal propagation better.

**Key patterns to use:**

```typescript
// One-shot container stats (for dashboard polling)
const stats = await docker.getContainer(id).stats({ stream: false })

// Streaming container stats (for real-time charts via SSE or tRPC subscription)
const stream = await docker.getContainer(id).stats({ stream: true })
stream.on('data', (chunk) => { /* parse JSON, emit to client */ })

// Container logs with tail
const logStream = await docker.getContainer(id).logs({
  follow: false, stdout: true, stderr: true, tail: 200
})

// Streaming logs (for live log viewer)
const logStream = await docker.getContainer(id).logs({
  follow: true, stdout: true, stderr: true, since: timestamp
})
// IMPORTANT: Use docker.modem.demuxStream() to separate stdout/stderr
```

**Confidence:** HIGH -- dockerode v4 is the standard Node.js Docker client. 4M+ weekly npm downloads. Used by Docker Desktop, Portainer backend, and the existing codebase.

### PM2 Management -- Use execa + JSON Output, NOT pm2 Programmatic API

**Decision:** Shell out via `execa('pm2', ['jlist'])` rather than importing the `pm2` npm package programmatically.

**Why NOT use pm2 programmatic API:**
1. **Connection management burden** -- `pm2.connect()` / `pm2.disconnect()` lifecycle is error-prone; forgetting `disconnect()` leaks PM2 daemon connections
2. **Version coupling** -- importing `pm2` as a dependency pins you to a specific PM2 version that must match the system-installed PM2; version mismatches cause silent failures
3. **Huge dependency tree** -- pm2 package is ~40MB with 200+ transitive deps; unnecessary when the CLI is already installed on the server
4. **Process conflict risk** -- pm2 programmatic API can interfere with the running PM2 daemon if versions differ
5. **JSON output is excellent** -- `pm2 jlist` returns structured JSON identical to what the programmatic API returns
6. **execa is already used everywhere** -- consistent pattern with the rest of the codebase

**Key patterns to use:**

```typescript
// List all PM2 processes (structured JSON)
const { stdout } = await $`pm2 jlist`
const processes = JSON.parse(stdout) as PM2ProcessDescription[]

// Restart a process
await $`pm2 restart ${processName}`

// Get logs (last N lines, no streaming)
const { stdout } = await $`pm2 logs ${processName} --lines ${lines} --nostream`

// For streaming logs: use node-pty to spawn `pm2 logs <name>` in a PTY
// This reuses the exact same terminal-socket.ts pattern used for docker exec
```

**Confidence:** HIGH -- this is the standard pattern used by Portainer, Cockpit, and other server management tools. The JSON output from `pm2 jlist` is stable and well-documented.

### Enhanced System Monitoring -- Use systeminformation (Already Installed)

**Decision:** Use the existing `systeminformation` package's additional functions that aren't yet called in the codebase.

**Currently used:** `cpuTemperature()`, `mem()`, `system()`
**Need to add calls to:** `networkStats()`, `disksIO()`, `processes()`, `fsStats()`

**Important behavior:** `networkStats()`, `disksIO()`, and `fsStats()` return null for rate values (rx_sec, tx_sec, IOPS) on the first call. The second call onwards calculates the delta. Design the polling endpoint to handle this -- either prime the first call on server startup, or handle null in the UI.

```typescript
// Network I/O (returns per-interface stats)
const netStats = await systemInformation.networkStats()
// Returns: [{ iface, rx_bytes, tx_bytes, rx_sec, tx_sec, ... }]

// Disk I/O
const diskIO = await systemInformation.disksIO()
// Returns: { rIO, wIO, rIO_sec, wIO_sec, ... }

// Process list
const procs = await systemInformation.processes()
// Returns: { all, running, blocked, sleeping, list: [{ pid, name, cpu, mem, ... }] }
```

**Confidence:** HIGH -- these are stable functions in systeminformation. The forked version (getumbrel) includes them.

### Container Stats Streaming -- Use SSE (Server-Sent Events), NOT tRPC Subscriptions

**Decision:** For real-time container stats and log streaming, use plain Express SSE endpoints alongside tRPC, rather than tRPC subscriptions over WebSocket.

**Why:**
1. **Per-container streams** -- each container needs its own stream; tRPC subscriptions multiplex over a single WS which adds complexity
2. **Natural cleanup** -- SSE connections auto-close when the client navigates away; no manual subscription management
3. **Back-pressure** -- SSE over HTTP/2 handles back-pressure better than WS for one-way data flow
4. **Existing pattern** -- the codebase already has Express routes alongside tRPC (`files/api.ts` uses Express for uploads/downloads)
5. **Browser native** -- `EventSource` API is simpler than WS on the client side

**For log viewing:** The existing `terminal-socket.ts` WebSocket + node-pty pattern is better for interactive `docker exec` terminals. For read-only log viewing, use SSE or a simple `fetch` with streaming response.

**Confidence:** MEDIUM-HIGH -- SSE is simpler and well-suited for unidirectional streams. The alternative (tRPC subscriptions) would also work but adds complexity.

### UI Charts -- Use recharts (Already Installed)

**Decision:** Continue using `recharts` for all monitoring charts. No need for a different charting library.

**Why:**
- Already used for CPU/memory/disk charts in `live-usage.tsx` and `server-control/`
- Proven patterns: `AreaChart` with `ResponsiveContainer` for real-time data
- The existing 30-point sliding window pattern works well for streaming metrics
- Supports all needed chart types: area (timeseries), bar (resource comparison), line (network I/O)

**For new charts:**
- Network I/O: dual AreaChart (rx/tx) with different colors
- Disk I/O: AreaChart for read/write IOPS
- Container CPU/Memory: BarChart for comparative view across containers
- Per-container stats: AreaChart matching existing live-usage style

**Confidence:** HIGH -- recharts is well-established, already integrated.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| dockerode (existing) | `execa('docker', ...)` shell commands | No structured output, no streaming, stdout parsing is fragile |
| dockerode (existing) | Docker HTTP API via `fetch` | dockerode already wraps this; re-implementing adds no value |
| execa for PM2 | `pm2` npm package (programmatic) | 40MB dep, version coupling, connection lifecycle issues (see above) |
| systeminformation (existing) | `os` + custom `/proc` parsing | systeminformation already parses /proc with cross-platform support |
| SSE for streaming | tRPC subscriptions (WS) | Simpler for unidirectional streams, auto-cleanup, no subscription management |
| SSE for streaming | Socket.io | Massive dependency, overkill for unidirectional event streams |
| recharts (existing) | Chart.js / Tremor / Nivo | Already integrated, proven patterns in codebase, no need to switch |
| @xterm/xterm (existing) | Monaco Editor for logs | Overkill; xterm handles ANSI colors and large log buffers efficiently |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `pm2` npm package | 40MB, version coupling, daemon conflicts | `execa('pm2', ['jlist'])` for structured JSON |
| `docker-stats` npm package | Thin wrapper around dockerode with less control | `dockerode` container.stats() directly |
| `socket.io` | Massive dependency (250KB+), bidirectional overkill for stats streaming | SSE via Express or tRPC subscriptions |
| `blessed` / `blessed-contrib` | Terminal UI library, not web | Keep using React + recharts |
| `pidusage` | CPU/memory per PID | `systeminformation.processes()` covers this |
| `node-os-utils` | Subset of systeminformation | systeminformation already installed, more comprehensive |
| `@docker/cli-js` | Wraps Docker CLI, same as execa but less flexible | dockerode for API, execa for edge cases |
| New WebSocket library | For container log streaming | Existing `ws` library + existing terminal-socket pattern |

---

## Stack Patterns by Feature Area

### Docker Container Management

**Pattern:** Create a new tRPC router file `source/modules/server/docker-routes.ts` with a singleton `Dockerode` instance (not re-instantiated per request like the current `ai/routes.ts` pattern).

```typescript
import Dockerode from 'dockerode'
const docker = new Dockerode()

// Export router with: list, inspect, logs, stats, remove, start, stop, restart
// Plus: images (list, pull, remove, tag), volumes (list, inspect, remove), networks (list, inspect, remove)
```

**Why singleton:** Creating a new Dockerode instance per request is wasteful. The `docker-pull.ts` file already uses a module-level singleton. Standardize on this.

### PM2 Process Management

**Pattern:** Create `source/modules/server/pm2-routes.ts` using execa.

```typescript
import { $ } from 'execa'

// pm2 jlist returns JSON array of process descriptions
interface PM2Process {
  name: string
  pm_id: number
  pid: number
  pm2_env: {
    status: string      // 'online' | 'stopping' | 'stopped' | 'errored'
    restart_time: number
    unstable_restarts: number
    created_at: number
    pm_uptime: number
    memory: number
    node_version: string
    exec_mode: string   // 'fork' | 'cluster'
  }
  monit: {
    memory: number      // bytes
    cpu: number         // percentage
  }
}
```

### Enhanced Monitoring

**Pattern:** Add new procedures to the existing `source/modules/system/routes.ts` file (it already has cpu, memory, disk routes).

```typescript
// New routes to add:
networkStats: privateProcedure.query(() => systemInformation.networkStats()),
diskIO: privateProcedure.query(() => systemInformation.disksIO()),
processList: privateProcedure.query(async () => {
  const procs = await systemInformation.processes()
  // Return top 50 by CPU to avoid sending thousands of processes
  return {
    ...procs,
    list: procs.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
  }
}),
```

### Container Log Viewing

**Pattern:** Two approaches depending on use case:

1. **Static logs** (last N lines): tRPC query using `docker.getContainer(id).logs({follow: false, tail: N})`
2. **Live logs** (streaming): Express SSE endpoint at `/api/containers/:id/logs/stream`

The xterm terminal is the right renderer for logs (handles ANSI escape codes, large buffers, search).

### Container Stats Streaming

**Pattern:** Express SSE endpoint at `/api/containers/:id/stats/stream`

```typescript
app.get('/api/containers/:id/stats/stream', authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const container = docker.getContainer(req.params.id)
  container.stats({ stream: true }, (err, stream) => {
    if (err) { res.end(); return }
    stream.on('data', (chunk) => {
      res.write(`data: ${chunk.toString()}\n\n`)
    })
    req.on('close', () => stream.destroy())
  })
})
```

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| dockerode ^4.0.2 | @types/dockerode ^3.3.26 | Types lag slightly behind; v3.3.26 covers all v4 APIs |
| dockerode ^4.0.2 | Docker Engine API 1.41+ | v4 targets API 1.41; servers running Docker 20.10+ are compatible |
| @xterm/xterm ^5.4.0 | @xterm/addon-search ^0.16.0 | Both in @xterm namespace; version-matched |
| @xterm/xterm ^5.4.0 | @xterm/addon-web-links ^0.12.0 | Both in @xterm namespace; version-matched |
| @xterm/xterm ^5.4.0 | @xterm/addon-fit ^0.9.0 (existing) | Already working together |
| @trpc/server ^11.1.1 | Express SSE endpoints | SSE routes live alongside tRPC in the same Express app; no conflict |
| systeminformation (forked) | Node.js 22+ | Verified working in current setup |

---

## Integration Points

### Where New Code Goes

| Feature | Backend File | Frontend Location | tRPC Router Name |
|---------|-------------|-------------------|-----------------|
| Docker containers (full) | `source/modules/server/docker-routes.ts` (new) | `src/routes/server-control/` (extend) | `docker` |
| Docker images | Same file | `src/routes/server-control/images.tsx` (new) | `docker.images.*` |
| Docker volumes | Same file | `src/routes/server-control/volumes.tsx` (new) | `docker.volumes.*` |
| Docker networks | Same file | `src/routes/server-control/networks.tsx` (new) | `docker.networks.*` |
| PM2 processes | `source/modules/server/pm2-routes.ts` (new) | `src/routes/server-control/pm2.tsx` (new) | `pm2` |
| Network I/O | `source/modules/system/routes.ts` (extend) | `src/routes/server-control/` (extend) | `system.networkStats` |
| Disk I/O | `source/modules/system/routes.ts` (extend) | `src/routes/server-control/` (extend) | `system.diskIO` |
| Process list | `source/modules/system/routes.ts` (extend) | `src/routes/server-control/processes.tsx` (new) | `system.processList` |
| Stats streaming | `source/modules/server/index.ts` (SSE route) | Custom `EventSource` hook | N/A (raw Express) |
| Log streaming | `source/modules/server/index.ts` (SSE route) | xterm + `EventSource` | N/A (raw Express) |

### Register New Routers

In `source/modules/server/trpc/index.ts`, add:

```typescript
import docker from '../../server/docker-routes.js'
import pm2 from '../../server/pm2-routes.js'

const appRouter = router({
  // ... existing routers
  docker,
  pm2,
})
```

### httpOnlyPaths

Per MEMORY.md: new tRPC mutations MUST be added to `httpOnlyPaths` in `common.ts` to avoid WebSocket routing issues. All Docker management mutations (remove, start, stop, restart, image pull, image remove, volume remove, network remove) and PM2 mutations (restart, stop, start) need this.

---

## Sources

- [dockerode npm](https://www.npmjs.com/package/dockerode) -- v4.0.x API surface, Container/Image/Volume/Network methods (HIGH confidence)
- [dockerode GitHub examples](https://github.com/apocas/dockerode/blob/master/examples/exec_running_container.js) -- exec and stats streaming patterns (HIGH confidence)
- [PM2 Programmatic API docs](https://pm2.io/docs/runtime/reference/pm2-programmatic/) -- evaluated and rejected in favor of CLI JSON output (HIGH confidence)
- [PM2 API docs](https://pm2.keymetrics.io/docs/usage/pm2-api/) -- launchBus and log streaming evaluation (HIGH confidence)
- [systeminformation npm](https://www.npmjs.com/package/systeminformation) -- networkStats, disksIO, processes, fsStats functions (HIGH confidence)
- [systeminformation GitHub](https://github.com/sebhildebrandt/systeminformation) -- rate calculation behavior (first call returns null) (HIGH confidence)
- [@xterm/addon-search npm](https://www.npmjs.com/package/@xterm/addon-search) -- v0.16.0 compatible with @xterm/xterm 5.x (HIGH confidence)
- [@xterm/addon-web-links npm](https://www.npmjs.com/package/@xterm/addon-web-links) -- v0.12.0 compatible with @xterm/xterm 5.x (HIGH confidence)
- Existing codebase analysis: `docker-pull.ts`, `ai/routes.ts`, `system.ts`, `terminal-socket.ts`, `server-control/index.tsx` (HIGH confidence)

---
*Stack research for: LivOS v12.0 Server Management Dashboard*
*Researched: 2026-03-22*
