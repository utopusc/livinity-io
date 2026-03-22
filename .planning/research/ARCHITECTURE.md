# Architecture Patterns

**Domain:** Server Management Dashboard (v12.0) for LivOS
**Researched:** 2026-03-22
**Confidence:** HIGH (based on direct codebase analysis + verified library capabilities)

## Current Architecture Snapshot

Before recommending the integration architecture, here is what exists today:

### tRPC Router Structure (13 sub-routers)
```
appRouter = {
  migration, system, wifi, user, preferences,
  appStore, apps, widget, files, notifications,
  eventBus, backups, ai, domain
}
```

### Existing Docker Operations (scattered)
| Location | Operations | Method |
|----------|-----------|--------|
| `ai/routes.ts` lines 916-956 | `listDockerContainers`, `manageDockerContainer` (start/stop/restart) | Dynamic `import('dockerode')` per call |
| `apps/routes.ts` | Per-user Docker install, state checks, restart/start/stop | `execa` shelling out to `docker` CLI |
| `utilities/docker-pull.ts` | Image pulling with progress tracking | Singleton `Dockerode` instance |
| `server/terminal-socket.ts` | `docker exec -it` into containers | `node-pty` via WebSocket |

### Existing System Monitoring
| Location | Data | Method |
|----------|------|--------|
| `system/system.ts` | CPU, memory, disk, temperature, IP | `systeminformation` + `df` CLI |
| `system/routes.ts` | 15 routes (query + mutation) | tRPC `privateProcedure` |
| Frontend hooks | `useCpu`, `useMemory`, `useDisk` | tRPC polling (1s CPU/mem, 10s disk) |

### Existing Streaming Infrastructure
| Mechanism | Used For | Transport |
|-----------|---------|-----------|
| tRPC subscriptions (async generators) | Event bus (file changes, backup progress) | WebSocket via `wsLink` |
| Raw WebSocket | Terminal shell | `node-pty` + custom `mountWebSocketServer` |
| SSE (HTTP) | AI chat streaming | `fetch` to Nexus daemon |

### Auth Hierarchy
```
publicProcedure      -- no auth
privateProcedure     -- JWT required (any authenticated user)
adminProcedure       -- JWT + admin role
```

### Transport Routing (common.ts)
Subscriptions always go to WebSocket. Queries/mutations default to WebSocket when JWT exists, except paths in `httpOnlyPaths` which force HTTP (for cookie/header semantics or reliability through tunnel relay).

---

## Recommended Architecture

### Decision 1: Three New tRPC Routers (NOT extending existing)

**Recommendation:** Create three new dedicated routers: `docker`, `pm2`, `monitoring`.

**Rationale:**
- The existing `ai/routes.ts` is already ~500 lines of AI-specific code; Docker operations there were a quick hack (they even dynamically import dockerode per call). They must be relocated.
- The existing `system/routes.ts` handles OS-level operations (update, reboot, factory reset). Monitoring (network I/O, process list, per-container stats) is conceptually different.
- PM2 is entirely new functionality with no existing home.
- Each router maps to a distinct API surface with its own domain logic module.

**New router registration in `trpc/index.ts`:**
```typescript
import docker from '../../docker/routes.js'
import pm2 from '../../pm2/routes.js'
import monitoring from '../../monitoring/routes.js'

const appRouter = router({
  // ... existing 13 routers ...
  docker,
  pm2,
  monitoring,
})
```

**Impact:** This changes `AppRouter` type, which auto-propagates to the frontend via the shared `common.ts` export. No manual frontend type updates needed.

### Decision 2: Dedicated Dockerode Singleton Module

**Recommendation:** Create `modules/docker/docker.ts` that exports a singleton Dockerode instance and typed wrapper functions.

**Rationale:**
- Currently, `ai/routes.ts` does `new Dockerode()` on every call (wasteful, no connection reuse).
- `utilities/docker-pull.ts` has its own singleton. These must be unified.
- A single module makes it testable and keeps routes thin.

**Structure:**
```
modules/docker/
  docker.ts          -- Dockerode singleton + typed operations
  routes.ts          -- tRPC router (thin, delegates to docker.ts)
  types.ts           -- Shared TypeScript types for container/image/volume/network
```

**`docker.ts` responsibilities:**
```typescript
// Singleton Dockerode instance
const docker = new Dockerode()

// Container operations
export async function listContainers(all?: boolean)
export async function inspectContainer(id: string)
export async function containerLogs(id: string, opts: LogOptions): AsyncGenerator<string>
export async function containerStats(id: string): AsyncGenerator<ContainerStats>
export async function startContainer(id: string)
export async function stopContainer(id: string)
export async function restartContainer(id: string)
export async function removeContainer(id: string, force?: boolean)
export async function execContainer(id: string, cmd: string[]): AsyncGenerator<string>

// Image operations
export async function listImages()
export async function pullImage(image: string, onProgress: (p: number) => void)
export async function removeImage(id: string, force?: boolean)
export async function tagImage(id: string, repo: string, tag: string)

// Volume operations
export async function listVolumes()
export async function inspectVolume(name: string)
export async function removeVolume(name: string)

// Network operations
export async function listNetworks()
export async function inspectNetwork(id: string)
export async function removeNetwork(id: string)
```

### Decision 3: Container Logs via tRPC Subscription (async generator over WebSocket)

**Recommendation:** Use tRPC async generator subscriptions for log streaming. Do NOT use raw WebSocket or SSE.

**Rationale:**
- The project already uses tRPC v11 with async generator subscriptions (see `eventBus/routes.ts`). The pattern is proven and the infrastructure exists.
- Raw WebSocket would require a new `mountWebSocketServer` path, custom auth handling, and a non-tRPC client -- unnecessary complexity.
- SSE would work but requires adding `httpSubscriptionLink` to the client, and the existing split-link setup routes subscriptions to WebSocket already.
- Async generators get automatic cleanup via `AbortSignal` when the client disconnects (already proven in event bus).

**Implementation pattern (matching existing eventBus pattern):**
```typescript
// modules/docker/routes.ts
containerLogs: adminProcedure
  .input(z.object({
    containerId: z.string(),
    tail: z.number().optional().default(100),
    timestamps: z.boolean().optional().default(false),
  }))
  .subscription(async function* ({input, signal}) {
    for await (const chunk of streamContainerLogs(input.containerId, {
      tail: input.tail,
      timestamps: input.timestamps,
      signal,
    })) {
      yield chunk
    }
  }),
```

**Frontend consumption:**
```typescript
trpcReact.docker.containerLogs.useSubscription(
  { containerId: id, tail: 200 },
  { onData: (line) => appendToLogBuffer(line) }
)
```

### Decision 4: Container Stats via tRPC Subscription

**Recommendation:** Per-container CPU/memory stats as a subscription, NOT polling.

**Rationale:**
- Docker stats API is a continuous stream (one JSON object per ~1s). Polling with queries would double the round-trips and miss the natural streaming model.
- Pattern identical to container logs subscription.

```typescript
containerStats: adminProcedure
  .input(z.object({ containerId: z.string() }))
  .subscription(async function* ({input, signal}) {
    for await (const stats of streamContainerStats(input.containerId, { signal })) {
      yield {
        cpuPercent: calculateCpuPercent(stats),
        memoryUsage: stats.memory_stats.usage,
        memoryLimit: stats.memory_stats.limit,
        netIO: { rx: stats.networks?.eth0?.rx_bytes, tx: stats.networks?.eth0?.tx_bytes },
        blockIO: calculateBlockIO(stats),
        pids: stats.pids_stats?.current,
      }
    }
  }),
```

### Decision 5: Container Exec via Existing Terminal WebSocket

**Recommendation:** Reuse the existing `terminal-socket.ts` WebSocket handler for `docker exec`. Do NOT create a new exec mechanism.

**Rationale:**
- `terminal-socket.ts` already handles `docker exec -it` into containers via `node-pty`. It accepts an `?appId=` query param and resolves to the correct container.
- For the new dashboard, extend the query params to accept a raw `containerId` in addition to `appId`:
  - `?appId=nextcloud` -- existing behavior (resolves via manifest)
  - `?containerId=abc123` -- new behavior (direct container ID)
- This avoids duplicating the PTY, WebSocket, and auth handling.

**Modification to `terminal-socket.ts`:**
```typescript
const containerId = searchParams.get('containerId')
if (containerId) {
  // Direct container exec (for server management dashboard)
  ptyProcess = pty.spawn('docker', ['exec', '-it', containerId, '/bin/sh', '-c', '...'], ...)
}
```

### Decision 6: PM2 Module via pm2 Programmatic API (NOT CLI)

**Recommendation:** Use `pm2` npm package programmatic API, not shelling out to `pm2` CLI.

**Rationale:**
- PM2's programmatic API (`pm2.connect()`, `pm2.list()`, `pm2.restart()`, `pm2.describe()`) returns structured JSON directly. No need to parse CLI output.
- pm2 is already installed globally on the server (used for production PM2 processes).
- The programmatic API connects to the existing PM2 daemon.

**Structure:**
```
modules/pm2/
  pm2.ts             -- PM2 programmatic wrapper
  routes.ts          -- tRPC router
```

**Key constraint:** `pm2.connect()` links to the existing daemon. Must call `pm2.disconnect()` when done with each operation to avoid holding the connection and preventing the livinityd process from exiting cleanly.

**PM2 log streaming:** PM2 logs are files on disk (`~/.pm2/logs/`). Stream them with `fs.createReadStream` + `fs.watch` (or `chokidar`), yielded as tRPC async generator subscription. Do NOT use `pm2.streamLogs()` which is undocumented and unreliable.

```typescript
pm2Logs: adminProcedure
  .input(z.object({
    processName: z.string(),
    lines: z.number().optional().default(100),
  }))
  .subscription(async function* ({input, signal}) {
    // Read last N lines then watch for new ones
    const logPath = `/root/.pm2/logs/${input.processName}-out.log`
    // ... tail + watch pattern
  }),
```

### Decision 7: Enhanced System Monitoring Extends Existing Module

**Recommendation:** Add new routes to the EXISTING `system/routes.ts` for enhanced monitoring (network I/O, process list, disk I/O). Create a separate `monitoring/routes.ts` ONLY for new subscription-based real-time metrics.

**Rationale:**
- One-shot queries (network interfaces, process list snapshot, disk I/O snapshot) fit naturally alongside existing `system.cpuUsage`, `system.memoryUsage`, etc.
- Real-time streaming metrics (continuous network throughput, continuous per-process CPU) need subscriptions and justify a new router to keep concerns separate.

**New routes in `system/routes.ts`:**
```typescript
networkInterfaces: privateProcedure.query(...)   // List interfaces with IPs, MACs
processlist: privateProcedure.query(...)          // Top processes by CPU/memory
diskIO: privateProcedure.query(...)               // Disk I/O rates
```

**New `monitoring/routes.ts` (subscription-based):**
```typescript
systemMetrics: privateProcedure
  .subscription(async function* ({signal}) {
    while (!signal?.aborted) {
      yield {
        cpu: await getCpuUsage(),
        memory: await getSystemMemoryUsage(),
        networkIO: await getNetworkIO(),
        diskIO: await getDiskIO(),
        timestamp: Date.now(),
      }
      await sleep(1000)
    }
  }),
```

### Decision 8: Frontend Structure -- Tabbed Server Management Dashboard

**Recommendation:** Expand the existing Server Control window content with a tab-based navigation. NOT a new window/app.

**Rationale:**
- Server Control is already registered as `LIVINITY_server-control` in the window manager. Creating a separate app would fragment the server management experience.
- The current page already has resource cards (CPU, memory, disk) and a container list. The new features extend this naturally.
- Tabs provide progressive disclosure without overwhelming the user.

**Tab structure:**
```
Server Control Window
  [Overview] [Containers] [Images] [Volumes] [Networks] [PM2] [Monitoring]
```

- **Overview** (current page, enhanced): Resource cards + container summary + PM2 process summary
- **Containers**: Full container list with inspect drawer, logs panel, stats, exec terminal
- **Images**: Image list, pull dialog, remove
- **Volumes**: Volume list, inspect, remove
- **Networks**: Network list, inspect, remove
- **PM2**: Process list, logs, restart/stop/start
- **Monitoring**: Real-time graphs (CPU, memory, network I/O, disk I/O, process list)

**Frontend file structure:**
```
routes/server-control/
  index.tsx                        -- Tab container + shared state
  tabs/
    overview.tsx                   -- Enhanced current page
    containers.tsx                 -- Container list + detail drawer
    containers/
      container-detail-drawer.tsx  -- Inspect, logs, stats, exec
      container-log-viewer.tsx     -- Log streaming component
      container-stats.tsx          -- Per-container CPU/mem charts
    images.tsx                     -- Image list + pull
    volumes.tsx                    -- Volume list
    networks.tsx                   -- Network list
    pm2.tsx                        -- PM2 process list
    monitoring.tsx                 -- Real-time system graphs
  hooks/
    use-containers.ts              -- Container list + mutations
    use-container-logs.ts          -- Log subscription hook
    use-container-stats.ts         -- Stats subscription hook
    use-images.ts                  -- Image list + mutations
    use-volumes.ts                 -- Volume list + mutations
    use-networks.ts                -- Network list + mutations
    use-pm2.ts                     -- PM2 list + mutations
    use-system-metrics.ts          -- Real-time metrics subscription
```

**The `LIVINITY_server-control` app should be added to `fullHeightApps` set** in `window-content.tsx` since the tabbed layout needs to manage its own scroll per tab.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `modules/docker/docker.ts` | Dockerode singleton, all Docker API operations | Dockerode library, Docker daemon socket |
| `modules/docker/routes.ts` | tRPC router: containers, images, volumes, networks | `docker.ts`, tRPC context |
| `modules/pm2/pm2.ts` | PM2 programmatic API wrapper | `pm2` npm package, PM2 daemon |
| `modules/pm2/routes.ts` | tRPC router: PM2 processes | `pm2.ts`, tRPC context, filesystem (logs) |
| `modules/monitoring/routes.ts` | tRPC subscriptions: real-time system metrics | `systeminformation`, existing `system.ts` functions |
| `modules/system/routes.ts` | Extended with snapshot queries | `systeminformation`, existing `system.ts` |
| `ui/routes/server-control/` | Tabbed dashboard UI | tRPC hooks, recharts |

### Data Flow

```
[Browser] --WebSocket--> [tRPC Server] ---> [Docker Routes] ---> [Dockerode] ---> [Docker Daemon]
                                        |
                                        +-> [PM2 Routes] -----> [pm2 API] -----> [PM2 Daemon]
                                        |
                                        +-> [Monitoring] -----> [systeminformation] --> [/proc, /sys]
                                        |
                                        +-> [System Routes] --> [systeminformation, execa]

Subscriptions (logs, stats, metrics):
[Browser] <--WS stream-- [tRPC async generator] <--- [Docker stream / fs.watch / poll loop]
```

---

## Integration Points (New vs Modified)

### New Files
| File | Purpose |
|------|---------|
| `modules/docker/docker.ts` | Dockerode singleton + typed operations |
| `modules/docker/routes.ts` | tRPC docker router |
| `modules/docker/types.ts` | Shared Docker types |
| `modules/pm2/pm2.ts` | PM2 programmatic wrapper |
| `modules/pm2/routes.ts` | tRPC PM2 router |
| `modules/monitoring/routes.ts` | Real-time subscription router |
| `ui/routes/server-control/tabs/*.tsx` | Tab components |
| `ui/routes/server-control/hooks/*.ts` | Data hooks |

### Modified Files
| File | Change | Reason |
|------|--------|--------|
| `server/trpc/index.ts` | Add `docker`, `pm2`, `monitoring` to `appRouter` | Register new routers |
| `server/trpc/common.ts` | Add Docker mutation paths to `httpOnlyPaths` | Ensure container ops use HTTP for reliability |
| `server/terminal-socket.ts` | Accept `?containerId=` param | Enable direct container exec from dashboard |
| `ai/routes.ts` | REMOVE `listDockerContainers` and `manageDockerContainer` | Relocated to `docker/routes.ts` |
| `ui/routes/server-control/index.tsx` | Rewrite to tabbed layout | Host all management tabs |
| `ui/modules/window/window-content.tsx` | Add `LIVINITY_server-control` to `fullHeightApps` | Tab layout needs full control |

### Migration: Existing Docker Routes in ai/routes.ts

The frontend currently calls `trpcReact.ai.listDockerContainers` and `trpcReact.ai.manageDockerContainer`. After migration:
- `trpcReact.docker.listContainers` replaces `trpcReact.ai.listDockerContainers`
- `trpcReact.docker.manage` replaces `trpcReact.ai.manageDockerContainer`
- The old routes should be kept as deprecated aliases during the transition, then removed.

---

## Auth Strategy for New Routes

| Route Category | Procedure | Rationale |
|----------------|-----------|-----------|
| Docker container list, inspect, stats | `adminProcedure` | Only admins should see all containers |
| Docker container start/stop/restart | `adminProcedure` | Destructive operations |
| Docker container remove, image remove | `adminProcedure` | Destructive + irreversible |
| Docker image list, volume list, network list | `adminProcedure` | Infrastructure visibility |
| PM2 list, describe | `adminProcedure` | System process visibility |
| PM2 restart/stop/start | `adminProcedure` | Critical service management |
| System monitoring (metrics, processes) | `privateProcedure` | Non-destructive, useful for all users |
| Container logs subscription | `adminProcedure` | May contain sensitive data |
| System metrics subscription | `privateProcedure` | General health monitoring |

---

## httpOnlyPaths Additions

New mutations that modify Docker state should use HTTP for reliability, especially through tunnel relay:

```typescript
export const httpOnlyPaths = [
  // ... existing paths ...
  // Docker management -- use HTTP for reliability through relay tunnel
  'docker.start',
  'docker.stop',
  'docker.restart',
  'docker.remove',
  'docker.removeImage',
  'docker.pullImage',
  'docker.removeVolume',
  'docker.removeNetwork',
  // PM2 management
  'pm2.restart',
  'pm2.stop',
  'pm2.start',
] as const
```

Queries (list, inspect) and subscriptions (logs, stats) stay on WebSocket -- they are non-destructive and benefit from the persistent connection.

---

## Patterns to Follow

### Pattern 1: Thin Routes + Fat Domain Module
**What:** Routes do input validation and auth only. Business logic lives in the domain module.
**When:** Always, for all new routes.
**Why:** Matches existing patterns (`apps/routes.ts` delegates to `apps.ts`, `system/routes.ts` delegates to `system.ts`). Enables testing domain logic without tRPC.

```typescript
// routes.ts (thin)
listContainers: adminProcedure
  .input(z.object({ all: z.boolean().optional().default(true) }))
  .query(({ input }) => docker.listContainers(input.all)),

// docker.ts (fat)
export async function listContainers(all: boolean) {
  const containers = await dockerInstance.listContainers({ all })
  return containers.map(formatContainer)
}
```

### Pattern 2: Async Generator Subscription with AbortSignal Cleanup
**What:** Use `signal` parameter in subscriptions for automatic cleanup.
**When:** Any subscription (logs, stats, metrics).
**Why:** Matches existing `eventBus.listen` pattern. Prevents memory leaks when clients disconnect.

```typescript
.subscription(async function* ({ input, signal }) {
  const stream = getStream(input)
  signal?.addEventListener('abort', () => stream.destroy(), { once: true })
  for await (const chunk of stream) {
    yield processChunk(chunk)
  }
})
```

### Pattern 3: Dynamic Import for Optional Dependencies
**What:** Use `await import('pm2')` instead of top-level import for PM2.
**When:** PM2 may not be installed on all LivOS instances (e.g., mini PC test server may use systemd).
**Why:** Prevents crash at startup if PM2 is not available. Matches existing pattern where `ai/routes.ts` dynamically imports dockerode.

```typescript
export async function listProcesses() {
  try {
    const pm2 = await import('pm2')
    // ... use pm2
  } catch {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'PM2 is not available on this system' })
  }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shelling Out to Docker CLI
**What:** Using `execa` to run `docker inspect`, `docker logs`, etc.
**Why bad:** Parsing CLI output is fragile, loses type safety, and can't stream efficiently. The existing `apps/routes.ts` does this for per-user containers and it's already a maintenance burden.
**Instead:** Use Dockerode's programmatic API which returns structured JSON and supports Node.js streams.

### Anti-Pattern 2: Creating New WebSocket Paths for Each Feature
**What:** Adding `/ws/docker-logs`, `/ws/container-stats`, etc. via `mountWebSocketServer`.
**Why bad:** Each requires its own auth handling, client connection management, and type definitions. Fragments the API surface.
**Instead:** Use tRPC subscriptions which route through the existing `/trpc` WebSocket with built-in auth, types, and cleanup.

### Anti-Pattern 3: Polling for Streaming Data
**What:** Using `refetchInterval` to poll container logs or stats every second.
**Why bad:** Creates unnecessary round-trips, misses data between polls, and puts load on the server. Docker stats and logs are inherently streaming.
**Instead:** Use tRPC subscriptions backed by Docker's streaming APIs.

### Anti-Pattern 4: Storing Docker State in Redis
**What:** Caching container lists, stats, or states in Redis.
**Why bad:** Docker is the source of truth. Caching creates staleness, consistency issues, and doubles the code. The Docker daemon is local (Unix socket) and fast.
**Instead:** Query Docker directly. The Unix socket round-trip is sub-millisecond.

---

## Suggested Build Order (dependency-aware)

| Phase | Components | Depends On | Rationale |
|-------|-----------|------------|-----------|
| 1 | `docker/docker.ts` + `docker/types.ts` | Nothing | Foundation module; everything else builds on this |
| 2 | `docker/routes.ts` (containers only: list, inspect, start, stop, restart, remove) | Phase 1 | Core container management, replaces ai/routes.ts Docker code |
| 3 | Frontend: Container tab + hooks (list, actions, inspect drawer) | Phase 2 | Visible progress; validates the API design |
| 4 | Container logs subscription (backend + frontend log viewer) | Phase 1, 2 | Extends container detail; uses async generator pattern |
| 5 | Container stats subscription (backend + frontend charts) | Phase 1, 2 | Extends container detail; same pattern as logs |
| 6 | Docker images routes + frontend tab | Phase 1 | Independent of container management |
| 7 | Docker volumes + networks routes + frontend tabs | Phase 1 | Independent of container management |
| 8 | `pm2/pm2.ts` + `pm2/routes.ts` + frontend tab | Nothing (independent) | Can be built in parallel with phases 4-7 |
| 9 | Enhanced system monitoring (snapshot queries in `system/routes.ts`) | Nothing | Extends existing module |
| 10 | `monitoring/routes.ts` subscriptions + frontend monitoring tab | Phase 9 | Real-time version of snapshot data |
| 11 | Overview tab (combines container summary + PM2 summary + metrics) | Phases 2, 8, 9 | Synthesis of all data sources |
| 12 | Cleanup: remove deprecated Docker routes from `ai/routes.ts` | Phase 2, 3 | Only after frontend is fully migrated |

**Critical path:** Phases 1 -> 2 -> 3 are the critical path. Everything else can be parallelized.

---

## Scalability Considerations

| Concern | Current (few containers) | At 50 containers | At 200 containers |
|---------|------------------------|-------------------|-------------------|
| Container list query | < 10ms | < 50ms | < 200ms, consider pagination |
| Stats subscriptions | 1 per open detail | Max ~5 concurrent | Limit to 1 active subscription via UI |
| Log subscriptions | 1 per open log viewer | Max ~3 concurrent | Limit to 1 active; close others on tab switch |
| PM2 list | < 10ms (5 processes) | N/A (PM2 count won't grow) | N/A |
| System metrics sub | 1 per monitoring tab | Same | Same (single subscription) |
| Memory pressure | Negligible | ~5MB for active streams | Log buffer management needed (ring buffer) |

**Key constraint:** Docker log streams consume memory proportional to output rate. The frontend log viewer should use a ring buffer (keep last ~5000 lines) and the subscription should yield reasonably-sized chunks.

---

## Sources

- [Dockerode GitHub - Docker + Node module](https://github.com/apocas/dockerode)
- [tRPC v11 Subscriptions Documentation](https://trpc.io/docs/server/subscriptions)
- [PM2 Programmatic API](https://pm2.keymetrics.io/docs/usage/pm2-api/)
- [tRPC v11 Announcement](https://trpc.io/blog/announcing-trpc-v11)
- Direct codebase analysis: `livinityd/source/modules/` (all router files, server setup, event bus, terminal socket)
