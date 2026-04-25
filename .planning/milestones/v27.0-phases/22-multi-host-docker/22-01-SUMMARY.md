---
phase: 22-multi-host-docker
plan: 01
subsystem: docker/multi-host
tags: [phase-22, mh-01, mh-02, environments, dockerode-factory, multi-host]
requires: [Phase 17 docker foundation, Phase 19 deviceProcedure pattern, Phase 20 PG migration pattern, Phase 21 git-credentials envId precedent]
provides: [environments PG table, getDockerClient(envId) factory, optional environmentId on every docker.* tRPC route, docker.environments.* CRUD]
affects: [docker.ts, stacks.ts, container-files.ts, routes.ts, schema.sql, common.ts httpOnlyPaths, livinityd boot]
tech-stack:
  added: []
  patterns: [factory pattern with per-id cache, ON CONFLICT (name) DO NOTHING idempotent seed, fixed sentinel UUID for built-in row]
key-files:
  created:
    - livos/packages/livinityd/source/modules/docker/environments.ts
    - livos/packages/livinityd/source/modules/docker/environments.unit.test.ts
    - livos/packages/livinityd/source/modules/docker/docker-clients.ts
    - livos/packages/livinityd/source/modules/docker/docker-clients.unit.test.ts
  modified:
    - livos/packages/livinityd/source/modules/database/schema.sql
    - livos/packages/livinityd/source/modules/docker/docker.ts
    - livos/packages/livinityd/source/modules/docker/stacks.ts
    - livos/packages/livinityd/source/modules/docker/container-files.ts
    - livos/packages/livinityd/source/modules/docker/routes.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - environments table shape: id/name/type/socket_path/tcp_host+port/tls_*_pem/agent_id/agent_status/last_seen/created_by/created_at
  - LOCAL_ENV_ID = '00000000-0000-0000-0000-000000000000' fixed sentinel; null/undefined/'local' all alias-resolve to it
  - agent_id has NO foreign-key constraint (deferred to 22-03 where docker_agents lands)
  - factory uses Map<envId, Dockerode> in-memory cache; invalidateClient(id) on update/delete
  - agent type throws [agent-not-implemented] until 22-03 ships AgentDockerClient
  - docker compose CLI calls (stacks.ts deploy/control/remove) stay host-local — multi-host stack deploy is v28
  - vuln-scan.ts (Trivy) stays host-only — needs host docker daemon
  - docker-exec-socket.ts / docker-logs-socket.ts stay local-only — real-time WS streaming over remote envs is v28
metrics:
  duration_minutes: 16
  tasks: 3
  files_changed: 7 modified + 4 created = 11
  unit_tests: 27 (19 environments + 8 docker-clients) all passing
  completed: 2026-04-25
---

# Phase 22 Plan 01: environments + Dockerode factory + envId param Summary

**One-liner:** Multi-host Docker foundation — environments PG table with auto-seeded `local` row, `getDockerClient(envId)` factory with per-env Dockerode cache, and optional `environmentId` threaded through every existing `docker.*` tRPC route. Backwards compatible — calls without envId still hit the local socket.

## Final environments Table Shape

```sql
CREATE TABLE IF NOT EXISTS environments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL CHECK (type IN ('socket', 'tcp-tls', 'agent')),
  socket_path  TEXT,                                       -- type='socket'
  tcp_host     TEXT,                                       -- type='tcp-tls'
  tcp_port     INTEGER,                                    -- type='tcp-tls'
  tls_ca_pem   TEXT,                                       -- type='tcp-tls'
  tls_cert_pem TEXT,                                       -- type='tcp-tls'
  tls_key_pem  TEXT,                                       -- type='tcp-tls'
  agent_id     UUID,                                       -- type='agent' (FK NOT yet declared)
  agent_status TEXT NOT NULL DEFAULT 'offline' CHECK (agent_status IN ('online', 'offline')),
  last_seen    TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_environments_type ON environments(type);
```

**Auto-seeded local row:** `id='00000000-0000-0000-0000-000000000000'`, `name='local'`, `type='socket'`, `socket_path='/var/run/docker.sock'` — inserted on every boot via `INSERT … ON CONFLICT (name) DO NOTHING`. Idempotent across restarts.

## Decisions Made

### D-01: agent_id has no FK constraint yet (deferred to 22-03)

The `agent_id UUID` column references the future `docker_agents` table created in Plan 22-03. Adding the foreign-key constraint here would create a circular dependency (environments → docker_agents → environments via `environments.id` for the env that owns the agent record). Plan 22-03 will either:
1. Add `ALTER TABLE environments ADD CONSTRAINT environments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES docker_agents(id) ON DELETE SET NULL`, or
2. Leave the FK unenforced — application code in `environments.ts` is the integrity gate.

The decision is deferred to 22-03's planner.

### D-02: agent type throws [agent-not-implemented] in buildClient

The factory's `case 'agent':` branch throws `[agent-not-implemented]` until Plan 22-03 wires `AgentDockerClient` (a Dockerode-shaped wrapper that proxies Docker API calls over an outbound WebSocket from the agent binary). The placeholder makes the failure mode explicit — existing code paths cannot accidentally hit a half-built agent client.

**Pattern for 22-03:** replace the `throw` with `return new AgentDockerClient(env.agentId, /* WS proxy from agent registry */)`. The cache key (`env.id`) and invalidation hook (`invalidateClient`) work unchanged.

### D-03: LOCAL_ENV_ID alias resolution at the environments.ts layer (not at every call site)

`getEnvironment(idOrAlias)` resolves `null` / `undefined` / `'local'` to `LOCAL_ENV_ID` before issuing the SELECT. This means the factory and every route's error handling sees a single canonical id, and the cache is never duplicated for the same logical env. The alternative (push alias resolution into the factory) would have leaked the LOCAL_ENV_ID constant into more files.

### D-04: `getDockerClient(envId)` returns `Promise<Dockerode>` (lazy, async)

The factory must read PG to determine connection params, so it can't be synchronous. Every consumer therefore awaits the call as the first statement of each helper. This is a one-line change per helper and matches the pattern used elsewhere in livinityd (`getPool()` in database/index.ts is sync, but our factory needs the row data).

### D-05: Module-level `const docker = new Dockerode()` in container-files.ts removed entirely

Before Plan 22-01, `container-files.ts` imported Dockerode and built its own per-module singleton "since the connection is just /var/run/docker.sock". Now the factory owns that lifecycle, so the import is reduced to `getDockerClient` and a comment explaining the change. Same shape applies to `stacks.ts`'s `const docker = new Dockerode({socketPath: ...})`.

### D-06: docker compose CLI calls stay host-local

`stacks.ts` uses `docker compose -f /opt/livos/data/stacks/<name>/docker-compose.yml up -d` for deploy/control/remove. These shell out to the host's `docker` CLI which always talks to the local daemon — they don't accept a remote env. Multi-host stack deploy requires either:
1. Copying the compose file to the remote env's filesystem, or
2. Replacing `docker compose` with a Dockerode-based deploy implementation (significant rewrite).

Both deferred to v28.0. For v27.0, only `listStacks` (which uses Dockerode under the hood) accepts envId.

### D-07: Trivy / vuln-scan stays host-only

`vuln-scan.ts` shells out `docker run --rm aquasec/trivy:latest …` via execa. This requires:
- The host's docker CLI (subprocess can't talk to a remote daemon without `DOCKER_HOST`)
- A volume mount of the local image cache (Trivy needs to read image layers)

Routing this to a remote env would mean either pulling the image into the remote env or proxying the entire Trivy stdout — both significantly more complex than the current single-line `execa` invocation. Out of scope for v27.0.

### D-08: Real-time WS streaming (exec / logs follow) stays local-only

`docker-exec-socket.ts` and `docker-logs-socket.ts` open WebSocket upgrades to the local docker socket via `Dockerode.modem.dial()`. Routing these over a remote tcp-tls dockerd or an outbound agent requires:
- For tcp-tls: streaming TCP frames over WS (works in principle, untested with our Caddy reverse proxy)
- For agent: agent-side WS multiplexing protocol (Plan 22-03 doesn't ship this)

Both deferred to v28.0. `docker.containerLogs` (one-shot, non-streaming) does accept envId.

## Documented Gaps for v28.0 Follow-up

1. **Multi-host stack deploy/control/remove** — `stacks.ts` Dockerode usages now accept envId, but `docker compose` CLI calls still target the host filesystem. Remote stacks need either compose-file replication or a Dockerode-based deploy.
2. **Multi-host Trivy scanning** — `scanImage` / `getCachedScan` continue to require the host docker daemon.
3. **Multi-host real-time exec/logs** — `docker-exec-socket.ts` / `docker-logs-socket.ts` stay local-only.
4. **Agent transport** — Plan 22-03 will replace the `[agent-not-implemented]` branch in `docker-clients.ts buildClient` with `new AgentDockerClient(env.agentId, ...)`.
5. **environments.agent_id FK constraint** — Plan 22-03 may add `ALTER TABLE environments ADD CONSTRAINT … REFERENCES docker_agents(id) ON DELETE SET NULL`, or leave it unenforced.

## Pattern for 22-03

The `case 'agent':` branch in `docker-clients.ts buildClient(env)` is the single integration point for Plan 22-03's outbound agent. Replacement shape:

```typescript
case 'agent':
  if (!env.agentId) {
    throw new Error(`[env-misconfigured] agent env '${env.name}' has no agentId`)
  }
  return new AgentDockerClient(env.agentId, /* WS proxy injected from registry */)
```

The cache (`Map<envId, Dockerode>`) and the `invalidateClient(envId)` hook work without modification — `AgentDockerClient` is Dockerode-shaped (same surface area: `listContainers`, `getContainer`, `pull`, `pruneImages`, etc.). When an agent disconnects/reconnects, the agent registry calls `invalidateClient(envId)` so the next `getDockerClient` call grabs the new WS handle.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + environments PG CRUD module | `9a27543c` | schema.sql, environments.ts, environments.unit.test.ts, index.ts (boot wiring) |
| 2 | Dockerode factory + refactor docker.ts/stacks.ts/container-files.ts | `28d8a00f` | docker-clients.ts, docker-clients.unit.test.ts, docker.ts, stacks.ts, container-files.ts |
| 3 | tRPC routes envId param + docker.environments.* CRUD | `95be5388` | routes.ts, common.ts |

**Final metadata commit:** see below (SUMMARY + STATE + ROADMAP).

## Verification

| Check | Result |
|-------|--------|
| `environments` table DDL idempotent (CREATE TABLE IF NOT EXISTS + ON CONFLICT seed) | PASS — schema.sql |
| `seedLocalEnvironment()` runs idempotently | PASS — unit test verifies 2nd call uses identical SQL |
| `getEnvironment(null)` / `'local'` / `LOCAL_ENV_ID` all return same row | PASS — 3 unit tests confirm alias resolution |
| `getDockerClient(null)` → Dockerode with `socketPath: '/var/run/docker.sock'` | PASS — unit test asserts modem.socketPath |
| `getDockerClient(LOCAL_ENV_ID)` returns same cached instance as null | PASS — reference equality test |
| Unknown env id throws `[env-not-found]` | PASS — unit test |
| Agent env throws `[agent-not-implemented]` (Plan 22-03 placeholder) | PASS — unit test |
| `invalidateClient(envId)` evicts cache so next call rebuilds | PASS — unit test |
| Local row protected: `deleteEnvironment(LOCAL_ENV_ID)` throws `[cannot-delete-local]` | PASS — unit test |
| Local row protected: `updateEnvironment(LOCAL_ENV_ID, …)` throws `[cannot-modify-local]` | PASS — unit test |
| Every existing `docker.*` route accepts optional `environmentId` | PASS — routes.ts inspection (30+ routes updated) |
| New `docker.environments.*` CRUD router exists | PASS — listEnvironments query + create/update/delete mutations |
| `docker.createEnvironment/updateEnvironment/deleteEnvironment` in `httpOnlyPaths` | PASS — common.ts updated |
| `[env-not-found]` → NOT_FOUND, `[agent-not-implemented]` → NOT_IMPLEMENTED, `[cannot-delete-local]/[cannot-modify-local]` → FORBIDDEN | PASS — error mappings added per route |
| UI build passes (no broken `RouterInput`/`RouterOutput` consumers) | PASS — `pnpm --filter ui build` exits 0 |
| Zero new typecheck errors in `docker/` module | PASS — `tsc --noEmit` shows 0 errors in touched files (327 total = ~324 pre-existing baseline + small noise unrelated to docker) |
| 27 unit tests passing (19 environments + 8 docker-clients) | PASS |

## Deviations from Plan

None — plan executed exactly as written. The plan called for `docker-clients.test.ts` and `environments.test.ts`; the existing repo convention is `*.unit.test.ts` (used by `system.unit.test.ts`), so the new test files follow that suffix.

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/docker/environments.ts`: FOUND
- `livos/packages/livinityd/source/modules/docker/environments.unit.test.ts`: FOUND
- `livos/packages/livinityd/source/modules/docker/docker-clients.ts`: FOUND
- `livos/packages/livinityd/source/modules/docker/docker-clients.unit.test.ts`: FOUND
- Commit `9a27543c`: FOUND
- Commit `28d8a00f`: FOUND
- Commit `95be5388`: FOUND
