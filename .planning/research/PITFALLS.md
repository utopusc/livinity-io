# Pitfalls Research: v12.0 Server Management Dashboard

**Domain:** Adding Docker management, PM2 control, and system monitoring to an existing self-hosted Node.js/React app
**Researched:** 2026-03-22
**Confidence:** HIGH (based on codebase analysis, Portainer CVE history, Docker API docs, and community post-mortems)

---

## Critical Pitfalls

### Pitfall 1: Unrestricted Docker Exec Grants Host-Level Shell Access

**What goes wrong:**
`docker exec` on a container gives the caller a shell inside that container. If the container runs as root (Docker default when no USER directive exists), the user has root access inside that container. Combined with mounted volumes (like `/opt/livos/` or Docker socket mounts), this becomes a path to full host compromise. The existing `terminal-socket.ts` already does `docker exec -it {container} /bin/sh` with zero restrictions on which containers can be targeted or what commands can be run.

**Why it happens:**
Developers treat `docker exec` as "just opening a terminal in a container" without realizing it bypasses all application-level authorization. Portainer had CVE-2018-19367 (unauthenticated websocket/exec endpoint) for exactly this reason. The existing terminal implementation takes an `appId` query parameter from the URL with no server-side validation of which containers the user is authorized to access.

**How to avoid:**
1. Admin-only: `docker exec` endpoints must be gated behind `adminProcedure` -- never expose to member/guest roles
2. Container allowlist: Only allow exec into containers the user owns (match against `user_app_instances` table) or that admin has explicitly authorized
3. Command filtering: For non-admin exec (if ever needed), restrict to read-only commands; never allow arbitrary shell access
4. Session timeout: WebSocket exec sessions must have an idle timeout (the existing terminal has none -- `ws.on('close')` only fires on disconnect)
5. Audit logging: Log every exec session (who, which container, when, duration) to a persistent log

**Warning signs:**
- Terminal websocket handler accepting any `appId` without checking `ctx.currentUser`
- No role check in the WebSocket upgrade path (currently auth is handled by Express but only checks if user is logged in, not role)
- Member users able to exec into admin's containers

**Phase to address:**
Phase 1 (Docker Container Management) -- before any exec endpoint is exposed, the authorization layer must be built

---

### Pitfall 2: Deleting Infrastructure Containers Bricks the System

**What goes wrong:**
A Docker management UI that lists "all containers" will show infrastructure containers that LivOS depends on (Redis, PostgreSQL, Caddy, the app environment containers, Firecrawl, Puppeteer). If an admin clicks "Remove" on Redis or PostgreSQL, the entire system goes down immediately. Docker's `docker rm -f` has no concept of "protected" containers.

**Why it happens:**
Docker treats all containers equally. There is no built-in Docker concept of a "system" vs "user" container. When building a management UI, developers list all containers from `docker ps -a` and add action buttons to each without distinguishing between infrastructure and user-managed containers. Portainer partially solves this by hiding its own container, but even Portainer allows removing critical infrastructure if the user has access.

**How to avoid:**
1. Maintain a server-side protected container registry (hardcoded + configurable):
   ```typescript
   const PROTECTED_CONTAINERS = new Set([
     'livos_redis', 'livos_postgres', 'caddy',
     'livos_tor', 'livos_auth', 'livos_dns',
     // Pattern match: any container from app-environment compose
   ])
   ```
2. The `remove` endpoint must check against this registry BEFORE calling Docker API -- never rely on frontend-only guards
3. Protected containers should be visually distinct in the UI (different badge, dimmed delete button, or absent delete button entirely)
4. Even for non-protected containers, require `adminProcedure` for removal
5. For the "remove all stopped containers" bulk operation, ALWAYS exclude protected containers server-side

**Warning signs:**
- `docker rm` or `docker compose down` calls that accept user-supplied container IDs without validation
- No distinction between system containers and app containers in the listing endpoint
- Delete button visible on all containers in the UI

**Phase to address:**
Phase 1 (Docker Container Management) -- the protected container list is a prerequisite for the remove endpoint

---

### Pitfall 3: Multi-User Container Visibility Leaks Cross-User Data

**What goes wrong:**
A raw `docker ps` lists ALL containers on the host. In LivOS's multi-user model, user A should only see their own per-user containers (prefixed `{appId}-user-{username}`) plus any shared apps. If the Docker management UI simply lists all containers, member users see admin's containers, other users' containers, and infrastructure -- leaking information about what other users have installed and their resource usage.

**Why it happens:**
Docker has no built-in multi-tenancy. The existing per-user isolation in LivOS works at the application layer (the `user_app_instances` table tracks which containers belong to which user). But a new Docker management module that calls `docker ps` directly bypasses this application-layer isolation.

**How to avoid:**
1. The container listing endpoint must filter by the current user's role:
   - **Admin:** Sees all containers, clearly labeled by owner (system / admin / username)
   - **Member:** Sees only their own per-user containers + shared app containers they have access to
   - **Guest:** Sees nothing (no Docker management access)
2. Use the existing `user_app_instances` and `user_app_access` database tables to determine visibility
3. Container names follow the convention `{appId}-user-{username}` -- use this pattern to map containers to users, but validate against the database (don't trust container names alone for authorization)
4. The `docker stats` and `docker logs` endpoints must also apply the same visibility filtering

**Warning signs:**
- Container list endpoint using `privateProcedure` instead of role-aware filtering
- Docker API calls that return unfiltered results
- No user context being passed to the Docker listing functions

**Phase to address:**
Phase 1 (Docker Container Management) -- visibility filtering must be part of the initial listing implementation, not bolted on later

---

### Pitfall 4: Docker Stats Streaming Causes Memory Exhaustion

**What goes wrong:**
The Docker stats API streams JSON objects every ~1 second per container. If a dashboard opens stats streams for all 20+ containers simultaneously and keeps them open while the user navigates away (common in SPA routing), the server accumulates streams that are never cleaned up. Each stream holds buffered data. With 20 containers streaming stats, this is ~20 concurrent HTTP connections to the Docker daemon plus unbounded buffer growth on the Node.js side.

**Why it happens:**
The Docker stats API endpoint is `GET /containers/{id}/stats?stream=true` which returns a never-ending stream. Dockerode (already used in `docker-pull.ts`) wraps this as a Node.js stream. Developers connect the stream on component mount but forget to disconnect on unmount, or the WebSocket connection drops without cleanly closing the Docker stream. The Docker Engine issue #23188 documented that the stats API is significantly slower than other APIs, adding to the problem.

**How to avoid:**
1. **Poll, don't stream for overview:** For the container list/dashboard view, use `?stream=false` (one-shot stats) on a 5-second polling interval instead of persistent streams. The cgroups read is cheap per Docker's own docs.
2. **Stream only for detail view:** Only open a persistent stats stream when a user is actively viewing a single container's detail panel
3. **Server-side stream lifecycle management:** Track all open Docker stats streams in a Map keyed by WebSocket connection ID. When the WebSocket closes (or pings timeout after 45s), abort the Docker stream immediately
4. **Buffer caps:** If streaming stats to WebSocket, only keep the last N data points (e.g., 60 data points = 1 minute of history). Never accumulate unbounded arrays
5. **Connection counting:** Limit concurrent stats streams per user (max 3-5) to prevent a single browser tab from opening stats for all containers

**Warning signs:**
- `docker.getContainer(id).stats({stream: true})` called without storing a reference for cleanup
- No `stream.destroy()` in the WebSocket close handler
- Memory usage of the livinityd process growing steadily over time (check `process.memoryUsage().heapUsed`)
- Docker daemon showing many open connections (`docker system info` or checking open file descriptors)

**Phase to address:**
Phase 3 (System Monitoring Enhancement) -- when stats are added to the UI. But the infrastructure for stream lifecycle management should be designed in Phase 1.

---

### Pitfall 5: Docker Log Streaming Without Tail Limits Sends Gigabytes

**What goes wrong:**
`docker logs {container}` without `--tail` returns ALL logs since the container was created. For long-running containers like Redis or PostgreSQL, this can be megabytes or even gigabytes of text. Streaming this over a WebSocket to a browser will freeze the browser tab, exhaust server memory buffering the response, and potentially crash the Node.js process.

**Why it happens:**
The existing system routes use `journalctl --lines 1500` for system logs (line 136-141 in `system/routes.ts`), which correctly limits output. But when adding Docker container logs, developers often start with `docker logs {container}` without limits during development (works fine with fresh containers), then ship it to production where containers have days/weeks of logs.

**How to avoid:**
1. **Always use `--tail N`:** Default to `--tail 500` for initial log load. Never send all logs.
2. **Streaming with `--follow --tail 0`:** For live tailing, use `--tail 0 --follow` so only new lines are sent, not historical logs
3. **Server-side line buffer:** Keep a circular buffer of the last 1000 lines max. When the buffer fills, drop oldest lines. The Dokploy project uses exactly this pattern.
4. **Client-side virtual scrolling:** Use a virtualized list (react-window or similar) for log rendering -- DOM nodes for 10,000+ log lines will freeze the browser
5. **Binary/raw log detection:** Some containers output binary data or extremely long lines. Detect and truncate lines over 10KB. Strip ANSI codes (the existing code already uses `strip-ansi` for system logs).

**Warning signs:**
- Log endpoint without a `tail` or `lines` parameter in the tRPC input schema
- Browser tab hanging when opening logs for a long-running container
- Log response size exceeding 1MB

**Phase to address:**
Phase 1 (Docker Container Management) -- log viewing is a core feature that will be implemented early

---

### Pitfall 6: PM2 Programmatic API Connection Leaks

**What goes wrong:**
PM2's programmatic API (`pm2.connect()`) opens a connection to the PM2 daemon. If `pm2.disconnect()` is not called after each operation, the connection stays open. Repeated API calls without disconnect will eventually exhaust file descriptors or cause the PM2 daemon to become unresponsive. Additionally, if the livinityd process manages PM2 processes while itself being managed by PM2 (which it is -- `livos` is a PM2 process), recursive management creates confusing edge cases.

**Why it happens:**
The PM2 API docs state: "If your script does not exit by itself, make sure you call `pm2.disconnect()`." In a long-running server like livinityd, every tRPC route handler that calls PM2 must connect, perform the operation, and disconnect. Developers often connect once on startup and reuse the connection, which works until it doesn't (daemon restart, connection timeout).

**How to avoid:**
1. **Wrapper pattern:** Create a `withPm2` helper that handles connect/disconnect:
   ```typescript
   async function withPm2<T>(fn: (pm2: PM2) => Promise<T>): Promise<T> {
     await pm2.connect()
     try { return await fn(pm2) }
     finally { pm2.disconnect() }
   }
   ```
2. **Alternative: Shell out instead of API:** Use `execa` to call `pm2 jlist`, `pm2 restart`, etc. (the same pattern the codebase already uses for Docker via `$` from execa). This avoids the connection management issue entirely and is simpler.
3. **Self-management guard:** The PM2 management UI must identify the livinityd process itself and prevent the user from stopping/restarting it through the PM2 UI (doing so would kill the server and the management UI). Same for the nexus-core process.
4. **Process identification:** PM2 processes should be tagged as "system" vs "user" similar to the Docker protected container concept.

**Warning signs:**
- `pm2.connect()` called without corresponding `pm2.disconnect()` in all code paths (including error paths)
- PM2 daemon becoming unresponsive after many management operations
- User able to stop the `livos` PM2 process from the management UI

**Phase to address:**
Phase 2 (PM2 Process Management) -- must be resolved before shipping PM2 management

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Shell out to Docker CLI instead of using Dockerode API | Simpler, consistent with existing codebase patterns | Parsing stdout is fragile, no structured error handling, harder to stream | MVP only -- migrate to Dockerode for streaming/stats in later phases |
| No rate limiting on Docker API proxy endpoints | Faster development | Runaway polling or malicious scripts can DoS the Docker daemon | Never in production -- add rate limits from Phase 1 |
| Storing Docker stats history in memory only | No database schema changes needed | Lost on restart, unbounded growth risk, not queryable | Acceptable for v12.0 -- persist to PostgreSQL in future if time-series analytics needed |
| Using PM2 CLI via execa instead of programmatic API | Avoids connection management bugs, consistent with codebase | Slightly slower (process spawn overhead), JSON parsing needed | Always acceptable -- this is actually the better pattern for this codebase |
| Frontend-only protected container guards | Quick to implement | Bypassable via direct API calls, no real security | Never -- must be enforced server-side |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Dockerode + existing codebase | Creating a new `Dockerode()` instance per call (like `docker-pull.ts` does at module scope) | Create a single shared Dockerode instance, reuse across the module. Module-scoped singleton is fine. |
| Docker exec + WebSocket | Piping Docker exec stream directly to WebSocket without flow control | Use `node-pty` (already in the project) for terminal emulation, or implement backpressure handling between the Docker stream and WebSocket |
| Docker stats + tRPC subscriptions | Using tRPC subscriptions (WebSocket) for stats streaming | Use SSE or a dedicated WebSocket endpoint instead. tRPC subscriptions over WS have had issues in this codebase (see `httpOnlyPaths` pattern). Stats are read-heavy, not RPC-shaped. |
| PM2 + livinityd | Calling PM2 programmatic API from a process PM2 manages | Shell out via execa (`pm2 jlist`, `pm2 restart {name}`) instead. Avoids circular dependency. |
| `docker system prune` in management UI | Exposing "prune" as a simple button | Prune removes ALL stopped containers, unused networks, dangling images. Must show a preview of what will be deleted and require explicit confirmation. Protected containers must be excluded. |
| Docker volumes + removal | Using `docker rm -v` which removes anonymous volumes | Never auto-remove volumes. Volume removal must be a separate, explicit action with its own confirmation. |
| New tRPC routes + WebSocket transport | Adding new mutation routes without adding them to `httpOnlyPaths` | All new Docker/PM2/system mutation routes MUST be added to `httpOnlyPaths` in `common.ts` to avoid WebSocket routing issues (documented in MEMORY.md) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling `docker stats` for all containers every second | livinityd CPU spikes, Docker daemon CPU usage increase, slow API responses | Poll at 5s intervals with `?stream=false`, aggregate on server | At 15+ containers with 3+ simultaneous dashboard users |
| Calling `docker inspect` per container in list view | Slow container list load (100ms+ per container), serial requests | Batch via `docker inspect $(docker ps -q)` or use `docker ps --format json` which includes most needed data | At 10+ containers |
| Unbounded `docker logs --follow` streams | Memory growth on server, frozen browser tabs, WebSocket backpressure | `--tail 500` for initial, `--tail 0 --follow` for live, circular buffer server-side, client-side virtualization | Containers with >10,000 log lines |
| Running `top --batch-mode --iterations 1` (existing in system.ts) per request | Each call takes ~1 second due to `top` sampling period | Cache the result for 2-3 seconds, serve cached to concurrent requests | Multiple simultaneous dashboard viewers |
| `ps -Ao pid,pss` for all process memory (existing in system.ts) | Slow on systems with many processes (Docker creates many) | Cache result for 5 seconds, only refresh on explicit request | Systems running 50+ containers with many child processes |
| `docker images` listing all images including intermediate layers | Slow response, confusing output with `<none>` tagged images | Use `docker images --filter dangling=false` for the main list, show dangling images only in a "cleanup" section | At 50+ images (common after many installs/updates) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing Docker exec to non-admin users | Full root access inside containers, potential host escape via volume mounts | Gate behind `adminProcedure`, audit log all sessions |
| No container ownership validation on Docker API proxy | User A can stop/restart/inspect User B's containers | Check `user_app_instances` table before every Docker operation |
| Passing user-supplied container names directly to shell commands | Command injection: `containerId = "foo; rm -rf /"` | Always use Dockerode API (parameterized) instead of shell commands, or validate container ID format (hex characters only for Docker IDs) |
| Docker socket exposed via a management container | Anyone with access to the container can control the entire Docker host | Keep Docker socket access on the host only, never mount in user-accessible containers |
| PM2 management UI allowing restart of livinityd/nexus-core | User restarts the management server itself, losing access | Maintain a `PROTECTED_PROCESSES` list matching Docker's `PROTECTED_CONTAINERS` pattern |
| Volume mount paths visible in container inspect | Reveals host filesystem structure (data directory paths, secret locations) | Sanitize or redact host paths in inspect output for non-admin users, or restrict inspect to admin only |
| Docker image pull without registry validation | User pulls malicious image from untrusted registry | Restrict image pulls to known registries or require admin approval for arbitrary pulls |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all Docker containers in a flat list | Overwhelming for users who only care about their apps. System containers, init containers, and per-user containers all mixed together. | Group by category: "Your Apps", "System Services", "Other Containers". Show app name not container name for known apps. |
| Delete button on every container without distinction | User accidentally deletes Redis, PostgreSQL, or another user's container. System goes down. | No delete button on protected containers. Type-to-confirm for non-protected containers. Two-step confirmation for any running container. |
| Raw Docker stats numbers (bytes, nanoseconds) | Users see "167772160 bytes" instead of "160 MB". CPU shown as nanosecond delta instead of percentage. | Format all values: human-readable bytes (MB/GB), CPU as percentage, uptime as "3d 5h", etc. |
| Log viewer loading all history on open | Browser freezes for containers with extensive logs. User thinks the app is broken. | Load last 100 lines immediately, "Load more" button for history. Show "Loading..." state during fetch. Virtual scroll for rendering. |
| PM2 process list showing raw JSON output | Confusing process metadata (pm2_env, monit data, etc.) | Show curated fields only: name, status, CPU, memory, uptime, restarts. Detail view for full info. |
| Dangerous operations (remove, exec, prune) placed alongside safe operations (logs, inspect, stats) | Accidental clicks on destructive actions. Users habituated to click-through confirmations. | Separate "danger zone" section. Use red button styling. Require typing container name for removal (like GitHub repo deletion). |
| No loading states for Docker operations that take time (pull, build, remove) | User clicks button, nothing happens for 10 seconds, clicks again, creates duplicate operation | Show immediate feedback (spinner, progress bar). Disable button during operation. For long operations (pull), show streaming progress (like existing `docker-pull.ts` does). |
| Terminal (exec) without clear security context | User doesn't realize they have root access inside the container. Accidentally modifies data or config. | Show banner: "You are connected as root inside container X. Changes are permanent." Include read-only mode option. |

## "Looks Done But Isn't" Checklist

- [ ] **Container list:** Often missing container health check status -- verify that `docker inspect` health data is shown (healthy/unhealthy/none)
- [ ] **Container removal:** Often missing volume cleanup prompt -- verify user is asked whether to also remove associated volumes
- [ ] **Docker exec/terminal:** Often missing resize handling -- verify terminal resizes when browser window resizes (existing `terminal-socket.ts` passes initial `cols`/`rows` but needs ongoing resize events)
- [ ] **Log streaming:** Often missing ANSI code handling -- verify colored log output is rendered correctly (not shown as raw escape codes). Also verify binary data doesn't crash the viewer.
- [ ] **Stats monitoring:** Often missing historical graph -- verify stats show at least 60s of history, not just the current instant value
- [ ] **PM2 management:** Often missing the protection of the management server itself -- verify that `livos` and `nexus-core` PM2 processes cannot be stopped/deleted from the UI
- [ ] **Image management:** Often missing "in use" indicator -- verify images show which containers use them before allowing deletion
- [ ] **Network management:** Often missing "in use" indicator -- verify networks show connected containers before allowing removal
- [ ] **Volume management:** Often missing "in use" indicator and data size -- verify volumes show which containers mount them and disk usage
- [ ] **Multi-user filtering:** Often missing in stats/logs endpoints -- verify member users can only view stats/logs for their own containers, not all containers
- [ ] **WebSocket cleanup:** Often missing on navigation -- verify all Docker streams (stats, logs, exec) are properly closed when user navigates away from the management UI
- [ ] **Error handling:** Often missing Docker daemon errors -- verify graceful handling when Docker daemon is unreachable (e.g., during system updates)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Protected container deleted (Redis/PostgreSQL) | HIGH | SSH into server, `docker compose up -d` from app-environment dir. PostgreSQL data may survive if volumes weren't removed. If volumes were removed, restore from backup. |
| PM2 livinityd process stopped via UI | MEDIUM | SSH into server, `source /root/.profile && pm2 start livos`. No data loss, but downtime until admin SSHs in. |
| Memory exhaustion from stats streaming | MEDIUM | Restart livinityd process (`pm2 restart livos`). Fix: add stream cleanup and caps. |
| Log streaming freeze (browser) | LOW | Close browser tab, reopen. Fix: add `--tail` limits and virtual scrolling. |
| Cross-user container access | HIGH | Audit log review to assess what was accessed. Rotate any secrets that may have been exposed. Fix: add authorization checks. |
| Command injection via container name | CRITICAL | Full security audit, check for compromised data/processes, rotate all secrets, potentially reinstall server. Fix: switch to Dockerode API, validate all inputs. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Docker exec unauthorized access | Phase 1 (Docker Container Management) | Test: member user cannot open terminal in admin's container |
| Protected container deletion | Phase 1 (Docker Container Management) | Test: attempt to delete Redis container returns error with "protected" message |
| Multi-user visibility leak | Phase 1 (Docker Container Management) | Test: member user's container list only shows their containers + shared |
| Stats memory exhaustion | Phase 1 (design) + Phase 3 (implementation) | Test: open dashboard, navigate away, check no orphaned Docker stream connections |
| Log streaming without limits | Phase 1 (Docker Container Management) | Test: container with 100K+ log lines loads in <2 seconds, browser stays responsive |
| PM2 connection leak | Phase 2 (PM2 Process Management) | Test: run 100 sequential PM2 operations, check file descriptor count stays stable |
| PM2 self-management | Phase 2 (PM2 Process Management) | Test: attempt to stop `livos` process returns error with "protected" message |
| Command injection | Phase 1 (Docker Container Management) | Test: container ID with shell metacharacters is rejected at input validation |
| Docker prune without preview | Phase 1 (Docker Container Management) | Test: prune shows preview of what will be removed, requires explicit confirmation |
| tRPC route transport issues | Phase 1 (Docker Container Management) | Test: all new Docker mutations work via HTTP (added to `httpOnlyPaths`) |
| Container inspect path leakage | Phase 1 (Docker Container Management) | Test: non-admin inspect output does not contain host filesystem paths |
| Image pull from untrusted registry | Phase 4 (Image/Volume/Network Management) | Test: image pull restricted to allowlisted registries for non-admin users |

## Sources

- [Portainer Critical Vulnerabilities (Fortinet)](https://www.fortinet.com/blog/threat-research/seven-critical-vulnerabilities-portainer) -- bind mount bypass, privilege escalation, websocket auth bypass
- [Docker Container Escape Techniques (Palo Alto Unit42)](https://unit42.paloaltonetworks.com/container-escape-techniques/) -- container breakout vectors
- [CVE-2025-9074 Docker Desktop Container Escape](https://thehackernews.com/2025/08/docker-fixes-cve-2025-9074-critical.html) -- unauthenticated API access
- [Docker Stats API Performance (moby #23188)](https://github.com/moby/moby/issues/23188) -- stats API 250x slower than normal API
- [Docker Stats Monitoring Guide (Dash0)](https://www.dash0.com/guides/docker-stats) -- cgroups read overhead is minimal
- [Dockerode GitHub](https://github.com/apocas/dockerode) -- Node.js Docker API client, stream handling
- [PM2 Programmatic API](https://pm2.io/docs/runtime/reference/pm2-programmatic/) -- connect/disconnect lifecycle
- [Real-Time Docker Log Streaming (Dokploy DeepWiki)](https://deepwiki.com/dokploy/dokploy/9.1-real-time-log-streaming) -- circular buffer pattern, WebSocket cleanup
- [Confirmation Dialogs (NN/g)](https://www.nngroup.com/articles/confirmation-dialog/) -- preventing user errors with destructive actions
- [Managing Dangerous Actions in UIs (Smashing Magazine)](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/) -- type-to-confirm, layered confirmation
- [Docker Security Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) -- socket exposure, privilege escalation
- [Docker Runtime Metrics](https://docs.docker.com/engine/containers/runmetrics/) -- cgroups filesystem monitoring
- [Why I Stopped Using Portainer (XDA)](https://www.xda-developers.com/why-i-stopped-using-portainer-and-went-back-to-dockge/) -- UX frustrations with complex Docker UIs
- [5 Portainer Mistakes (XDA)](https://www.xda-developers.com/mistakes-made-first-week-using-portainer/) -- networking, volume binding, stack management
- Codebase analysis: `terminal-socket.ts` (exec without role check), `system.ts` (existing monitoring patterns), `apps.ts` (per-user Docker isolation), `is-authenticated.ts` (RBAC middleware), `docker-pull.ts` (Dockerode usage pattern)

---
*Pitfalls research for: v12.0 Server Management Dashboard*
*Researched: 2026-03-22*
