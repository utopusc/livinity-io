---
status: human_needed
phase: 22-multi-host-docker
must_haves_total: 18
must_haves_verified: 14
must_haves_failed: 0
must_haves_human_needed: 4
requirement_ids: MH-01, MH-02, MH-03, MH-04, MH-05
verified: 2026-04-24T00:00:00Z
human_verification:
  - test: "Remote TCP/TLS daemon connectivity"
    expected: "Creating a tcp-tls env with a real remote dockerd (host+port+CA+cert+key PEM blobs) successfully lists containers on that remote host; invalidateClient() + re-list returns fresh data from the updated env row"
    why_human: "Requires a second host running `dockerd --tlsverify ...` on an open port with a valid CA chain — impossible to exercise without live infrastructure"
  - test: "Agent end-to-end connection + handshake"
    expected: "Running `install.sh --token <T> --server wss://livinity.cloud/agent/connect` on a remote VM spawns systemd-managed Node process; livinityd logs 'agent <id> connected'; environments.agent_status flips to 'online'; EnvironmentSelector shows green wifi icon; listContainers scoped to that env returns the remote host's containers"
    why_human: "Requires a remote host (NOT the dev workstation) with Node 20+ and Docker, plus a livinityd instance reachable over WSS with a valid TLS cert. Commits 4ddcf5aa/870e742b ship all the code; only the live round-trip needs human observation"
  - test: "Token revocation 5s SLA"
    expected: "Clicking Revoke in UI → docker_agents.revoked_at set → Redis publishes on livos:agent:revoked → live WS closes with code 4403 → agent process exits with code 3 → environments.agent_status flips to 'offline' — all within 5 seconds of the Revoke click"
    why_human: "Latency SLA is observable only with a live agent connection plus co-located Redis; code path is fully wired (agent-socket.ts subscriber + agent-registry.forceDisconnect + routes.ts publish) but timing must be measured on real deployment"
  - test: "Agent round-trip latency < 100ms over local network"
    expected: "With agent on same LAN as livinityd, `listContainers` on agent env returns in < 100ms median (plan MH-04 truth #6)"
    why_human: "Requires live agent + performance measurement; no unit test can verify network RTT"
---

# Phase 22: Multi-host Docker Management — Verification Report

**Phase Goal:** Manage multiple Docker hosts from one Livinity instance — local socket, remote TCP/TLS, or outbound agent for NAT-traversal — with environment selector in UI.

**Verified:** 2026-04-24
**Status:** human_needed (all code evidence present; 4 must-haves require runtime validation on a second host + live deployment)
**Re-verification:** No — initial verification

## Goal Assessment

Phase 22 ships a three-transport Docker management system (local socket, TCP/TLS, outbound agent). All three plans are committed, all key artifacts exist in the tree, and every key link from the per-plan frontmatter resolves to real code. The backend foundation (22-01), UI surface (22-02), and outbound agent (22-03) integrate through the documented seams:

- `environments` + `docker_agents` PG tables with idempotent seed + CASCADE
- `getDockerClient(envId)` factory returns a Dockerode-shaped client (real Dockerode or `AgentDockerClient`) routed by env.type
- Every `docker.*` tRPC route accepts optional `environmentId`; zustand store + React Query queryKey drive automatic refetch on env switch
- `/agent/connect` WS branch in `server/index.ts` bypasses generic JWT token gate and uses the agent's register-message token instead
- Redis pub/sub (`livos:agent:revoked`) + `agent-registry.forceDisconnect(4403)` deliver the MH-05 "revoke within 5s" path

No blocker anti-patterns, stubs, or broken wiring found. The only verification gaps are truths that require a live remote host / real TLS daemon / perf measurement — marked `human_needed`, not `gaps_found`.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T-01 | PostgreSQL `environments` table exists with correct shape + auto-seeded local row | VERIFIED | `schema.sql:219` CREATE TABLE with id/name/type/socket_path/tcp_host+port/tls_*_pem/agent_id/agent_status/last_seen/created_by/created_at; `environments.ts:65` seedLocalEnvironment() with ON CONFLICT DO NOTHING; LOCAL_ENV_ID sentinel = `00000000-0000-0000-0000-000000000000` |
| T-02 | `getDockerClient(envId)` returns cached Dockerode per env; null/'local' alias-resolves to local socket | VERIFIED | `docker-clients.ts:72-86` factory with `Map<envId, Dockerode>` cache; `environments.ts:96-110` `getEnvironment()` alias resolution — null/undefined/'local' → LOCAL_ENV_ID |
| T-03 | Every `docker.*` tRPC route accepts optional `environmentId` | VERIFIED | `routes.ts` has 88 `environmentId` occurrences across 30+ routes; Zod input extended with `z.string().uuid().nullable().optional()` |
| T-04 | `docker.environments.*` admin CRUD routes exist | VERIFIED | `routes.ts:1500+` — listEnvironments query + createEnvironment/updateEnvironment/deleteEnvironment mutations; `common.ts:89-91` registers all three in httpOnlyPaths |
| T-05 | Server Control header has env dropdown that lists every env in PG | VERIFIED | `environment-selector.tsx` renders `Select` with `useEnvironments()` data; `server-control/index.tsx:60` imports + `:4065` renders `<EnvironmentSelector />` |
| T-06 | Switching dropdown refetches ALL Docker views automatically | VERIFIED | React Query queryKey mechanism: `use-containers.ts:3` imports `useSelectedEnvironmentId`, passes `{environmentId}` into `listContainers.useQuery` — when the id changes, queryKey changes, refetch fires. Same pattern applied in use-images/volumes/networks/stacks/engine-info/docker-events |
| T-07 | Selected env persists across page reload | VERIFIED | `environment-store.ts:26-38` uses zustand `persist` middleware with localStorage key `livos:selectedEnvironmentId`; `partialize` persists only the id |
| T-08 | Settings > Environments section lets admins add/edit/remove non-local envs | VERIFIED | `settings-content.tsx:143` adds 'environments' to `SettingsSection` union; `:173` sidebar entry; `:461` switch case renders `EnvironmentsSectionLazy`; `environments-section.tsx` has Add/Edit/Remove dialogs |
| T-09 | 'local' environment is protected from delete/modify | VERIFIED | `environments.ts:203` throws `[cannot-modify-local]` on LOCAL_ENV_ID; `:269` throws `[cannot-delete-local]`; `environments-section.tsx` disables Edit/Remove for local row |
| T-10 | Add-environment dialog supports socket / tcp-tls / agent with conditional fields | VERIFIED | `environments-section.tsx` has TypeSelector + per-type form fields (socket: path; tcp-tls: host/port + 3 PEM textareas; agent: name only → GenerateAgentTokenDialog) |
| T-11 | Agent token generation shows 64-char token ONCE with copy button and warning | VERIFIED | `environments-section.tsx:824` GenerateAgentTokenDialog auto-fires `useGenerateAgentToken().mutateAsync({environmentId})` on open; displays token + curl install snippet; closing drops token from React state |
| T-12 | `docker_agents` PG table stores token_hash + revoked_at + last_seen | VERIFIED | `schema.sql:248` CREATE TABLE with id/env_id (FK to environments ON DELETE CASCADE)/token_hash UNIQUE/created_by/created_at/last_seen/revoked_at |
| T-13 | Agent CLI (`@livos/docker-agent`) parses --token/--server, handshakes, dispatches Docker API | VERIFIED | `docker-agent/src/index.ts:32-49` parseArgs; `:63-151` runOnce with register→request/response handling; `:128-141` handles close codes 4401 (auth-fatal → exit 2) / 4403 (revoked → exit 3); `proxy.ts` dispatch table covers listContainers/container.start/createContainer/container.logs/etc. Built successfully (`dist/index.js` 6277 bytes) |
| T-14 | `docker.generateAgentToken` mutation returns cleartext token ONCE; stores SHA-256 hash | VERIFIED | `routes.ts:1567-1591` generateAgentToken adminProcedure; validates env.type='agent'; `agents.ts:55-77` createAgent() generates `randomBytes(32).toString('hex')` (64 chars), stores `hashToken()` SHA-256, backfills environments.agent_id; returns `{agentId, token, agentInstallSnippet}` |
| T-15 | `docker.revokeAgentToken` updates PG + publishes to Redis to disconnect live WS within 5s | VERIFIED | `routes.ts:1593-1619` revokeAgentToken mutation: calls `revokeAgent(id)` + `redis.publish('livos:agent:revoked', {agentId})`; `agent-socket.ts:183-210` startAgentRevocationSubscriber duplicates ioredis connection, receives message, calls `agentRegistry.forceDisconnect(agentId, 'token-revoked')` → WS close code 4403 |
| T-16 | AgentDockerClient proxies Dockerode methods over `agentRegistry.sendRequest` | VERIFIED | `agent-docker-client.ts` has AgentContainerHandle/AgentImageHandle/AgentNetworkHandle/AgentVolumeHandle all proxying via sendRequest; `docker-clients.ts:62` builds `new AgentDockerClient(env.agentId) as unknown as Dockerode` in the type='agent' branch (replaced the Plan 22-01 `[agent-not-implemented]` placeholder) |
| T-17 | Agent-connect WS endpoint auths via register-message token (not JWT query param) | VERIFIED | `server/index.ts:692-700` branches on `pathname === '/agent/connect'` BEFORE generic webSocketRouter, mounts `createAgentWsHandler`; `agent-socket.ts:83-105` parses first `register` message, calls `findAgentByToken()`, rejects with 4401 on invalid/revoked or registers |
| T-18 | Agent reconnects with exponential backoff; agent_status flips immediately on connect/disconnect | VERIFIED | `docker-agent/src/index.ts:153-174` connectLoop with `backoff = 1s → 30s cap`; `agent-socket.ts:107-116` UPDATE environments SET agent_status='online' on successful register; `:46-66` cleanup() UPDATEs agent_status='offline' + last_seen=NOW() on WS close |

**Score:** 14/18 VERIFIED, 4 needing human/runtime validation (listed under Human Verification Required)

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/database/schema.sql` | environments + docker_agents DDL | VERIFIED | Both CREATE TABLE IF NOT EXISTS blocks present (lines 219, 248); docker_agents has FK env_id ON DELETE CASCADE to environments |
| `livos/packages/livinityd/source/modules/docker/environments.ts` | CRUD module | VERIFIED | Exports: seedLocalEnvironment, listEnvironments, getEnvironment, createEnvironment, updateEnvironment, deleteEnvironment, LOCAL_ENV_ID, LOCAL_ENV_NAME, type Environment, type EnvironmentType |
| `livos/packages/livinityd/source/modules/docker/docker-clients.ts` | Factory + cache | VERIFIED | Exports getDockerClient, invalidateClient, clearAllClients; agent branch returns `new AgentDockerClient(...) as unknown as Dockerode` |
| `livos/packages/livinityd/source/modules/docker/agents.ts` | docker_agents CRUD | VERIFIED | Exports createAgent (generates 64-char hex, stores SHA-256, backfills environments.agent_id), listAgents, findAgentByToken, findAgentByTokenHash, revokeAgent, touchLastSeen, hashToken |
| `livos/packages/livinityd/source/modules/docker/agent-protocol.ts` | Shared message types | VERIFIED | Present (2536 bytes) |
| `livos/packages/livinityd/source/modules/docker/agent-registry.ts` | In-process registry | VERIFIED | `AgentRegistry` class with registerAgent (displaces old WS with 4409), unregisterAgent, sendRequest (30s timeout, requestId-driven demux), handleResponse, forceDisconnect (close 4403); `agentRegistry` singleton exported |
| `livos/packages/livinityd/source/modules/docker/agent-docker-client.ts` | Dockerode-shaped wrapper | VERIFIED | 9012 bytes; covers listContainers/Images/Volumes/Networks, info/version, prune*, createContainer/Network/Volume, getContainer/Image/Network/Volume with full handle surface; streaming methods (exec/attach/putArchive/getArchive/follow logs) throw `[agent-streaming-unsupported]` — explicit v28 follow-up |
| `livos/packages/livinityd/source/modules/server/agent-socket.ts` | WS handler + revocation subscriber | VERIFIED | Exports createAgentWsHandler (lifecycle: register→touchLastSeen→mark online→ping loop; on close→unregister + mark offline) and startAgentRevocationSubscriber (ioredis duplicate for subscribe-mode, receives livos:agent:revoked → forceDisconnect) |
| `livos/packages/livinityd/source/modules/docker/routes.ts` | Updated + new routes | VERIFIED | 88 occurrences of env/agent route tokens; listEnvironments + create/update/delete EnvironmentMutations at ~line 1500; listAgents + generateAgentToken + revokeAgentToken at lines 1550/1567/1593 |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | httpOnlyPaths additions | VERIFIED | Lines 89-97: docker.createEnvironment, updateEnvironment, deleteEnvironment, generateAgentToken, revokeAgentToken all registered (avoids documented WS-mutation hang) |
| `livos/packages/livinityd/source/modules/server/index.ts` | /agent/connect mount + subscriber boot | VERIFIED | Line 35 imports createAgentWsHandler + startAgentRevocationSubscriber; lines 692-700 handle /agent/connect WS upgrade with single-use WebSocketServer; lines 1156-1162 start revocation subscriber at boot using this.livinityd.ai.redis |
| `livos/packages/ui/src/stores/environment-store.ts` | zustand persist | VERIFIED | 1592 bytes; exports useEnvironmentStore (create+persist with localStorage key 'livos:selectedEnvironmentId'), useSelectedEnvironmentId, LOCAL_ENV_ID |
| `livos/packages/ui/src/hooks/use-environments.ts` | Hook bundle | VERIFIED | Exports useEnvironments (10s refetchInterval), useCreateEnvironment, useUpdateEnvironment, useDeleteEnvironment, useGenerateAgentToken (defensive `route?.useMutation` stub — resolves to real mutation now that 22-03 ships) |
| `livos/packages/ui/src/routes/server-control/environment-selector.tsx` | Dropdown | VERIFIED | 3140 bytes; `<Select>` wired to store; agent items show online/offline wifi icon + status; 'Manage Environments…' Link → /settings; defensive useEffect resets to LOCAL_ENV_ID if persisted id is missing |
| `livos/packages/ui/src/routes/settings/_components/environments-section.tsx` | Settings section | VERIFIED | 29343 bytes; includes GenerateAgentTokenDialog (auto-fires mutation, renders token + curl install snippet + warning), Add/Edit/Remove dialogs, local row protection |
| `livos/packages/docker-agent/package.json` | NEW workspace package | VERIFIED | `@livos/docker-agent` v0.1.0, type=module, bin=livos-docker-agent → dist/index.js, deps dockerode ^4.0.2 + ws ^8.16.0 |
| `livos/packages/docker-agent/src/index.ts` | Agent CLI entry | VERIFIED | parseArgs + runOnce + connectLoop; exponential backoff 1s→30s cap; auth-fatal codes (4401/4403) → process.exit(2/3) |
| `livos/packages/docker-agent/src/proxy.ts` | Dockerode dispatch | VERIFIED | 7196 bytes; dispatch table maps method strings to local Dockerode calls; container.logs base64-encoded; container.stats forces stream:false |
| `livos/packages/docker-agent/install.sh` | Systemd installer | VERIFIED | 3161 bytes, executable; checks root+Node20+Docker; downloads tarball; writes systemd unit with LIVOS_AGENT_TOKEN/SERVER env vars; `systemctl enable --now` |
| `livos/packages/docker-agent/dist/` (built output) | TypeScript build output | VERIFIED | dist/index.js 6277 bytes; dist/proxy.js 7802 bytes; dist/protocol.js present — successful `pnpm build` |

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|----|--------|----------|
| docker/routes.ts | docker-clients.getDockerClient | input.environmentId threaded through every helper | WIRED | 88 occurrences of environmentId across 30+ routes in routes.ts |
| docker-clients.buildClient | agent-docker-client.AgentDockerClient | type='agent' branch | WIRED | docker-clients.ts:19 imports; :62 constructs `new AgentDockerClient(env.agentId)` replacing Plan 22-01 placeholder throw |
| docker-clients.ts | environments.getEnvironment | factory reads env row for connection params | WIRED | docker-clients.ts:20 + :75 |
| Settings Environments dialog | docker.generateAgentToken | useGenerateAgentToken → tRPC mutation | WIRED | use-environments.ts:48-66 checks real route; environments-section.tsx:853 calls mutateAsync({environmentId}); routes.ts:1567-1591 ships the real mutation |
| revokeAgentToken mutation | Redis 'livos:agent:revoked' | publish → subscriber forceDisconnect | WIRED | routes.ts:1604-1607 publish; agent-socket.ts:183-210 subscribe; :203 forceDisconnect |
| server/index.ts /agent/connect | createAgentWsHandler | WS upgrade branch BEFORE generic router | WIRED | server/index.ts:692-700; branches on pathname before webSocketRouter; handler owns the socket |
| AgentRegistry.sendRequest | AgentDockerClient methods | requestId demux via pendingRequests Map | WIRED | agent-registry.ts:87-110 sendRequest; :117-132 handleResponse; agent-docker-client.ts all methods route through `agentRegistry.sendRequest(this.agentId, ...)` |
| agent-socket register handler | agents.findAgentByToken + registerAgent | hashToken → lookup → registerAgent | WIRED | agent-socket.ts:94-104; rejects with 4401 if not found or revoked |
| server/trpc/common.ts httpOnlyPaths | docker.{create,update,delete}Environment + generateAgentToken + revokeAgentToken | ensures mutations go HTTP not WS | WIRED | common.ts:89-97 lists all 5 |
| server/control header | EnvironmentSelector | import + render in header area | WIRED | server-control/index.tsx:60 import; :4065 render |
| use-containers/images/volumes/networks/stacks/engine-info/docker-events | useSelectedEnvironmentId | envId in query input → auto-refetch on change | WIRED | use-containers.ts:3 imports + :7-11 uses; verified in SUMMARY checks for all 7 hooks |
| settings-content.tsx | EnvironmentsSectionLazy | React.lazy import + sidebar entry + switch case | WIRED | settings-content.tsx:143 union + :173 menu item + :461 switch case + :1413 lazy import |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MH-01 | 22-01 | `environments` PostgreSQL table (id, name, socket_path \| tcp_host+tls_cert \| agent_id) per Docker host | SATISFIED | schema.sql:219 CREATE TABLE environments with all required columns; environments.ts module implements CRUD; seedLocalEnvironment runs idempotently on boot |
| MH-02 | 22-01 | All `docker.*` tRPC routes accept optional `environmentId`; Dockerode client is factory-created per environment | SATISFIED | docker-clients.ts factory with `Map<envId, Dockerode>` cache; routes.ts has 88 environmentId occurrences; alias resolution null/'local'/LOCAL_ENV_ID in environments.ts:96-110 |
| MH-03 | 22-02 | Server Control header has an environment selector dropdown | SATISFIED | environment-selector.tsx component; rendered in server-control/index.tsx:4065; zustand store persists selection; 7 docker hooks thread envId for automatic refetch |
| MH-04 | 22-03 | Outbound agent (Node or Go) opens a WebSocket to Livinity from remote host and proxies Docker API calls — no open TCP port on remote host required | SATISFIED (code); NEEDS HUMAN (live round-trip + < 100ms latency) | `@livos/docker-agent` package builds; `/agent/connect` WS upgrade branch in server/index.ts bypasses JWT gate; AgentDockerClient proxies through agent-registry; install.sh provisions systemd service. Live agent connection + performance measurement needs real remote host |
| MH-05 | 22-03 | Agent authentication via per-agent token; tokens revocable from Settings | SATISFIED (code); NEEDS HUMAN (5s SLA measurement) | agents.ts generates 64-char hex + SHA-256 hash; routes.ts:1593 revokeAgentToken publishes to Redis; agent-socket.ts:183 subscribes + forceDisconnect; close code 4403. Agent exits with code 3 on revoke |

All 5 requirement IDs are implemented at the code level. MH-04/MH-05 live validation is blocked only on needing a second host — not on missing code.

## Spot-Check Findings

Ten Read-verified spot checks against SUMMARY claims:

1. **schema.sql environments + docker_agents tables** — Both CREATE TABLE IF NOT EXISTS blocks present with expected columns, CHECK constraints (type enum, agent_status enum), and FK env_id → environments ON DELETE CASCADE. Matches 22-01/22-03 SUMMARY shape exactly.
2. **environments.ts seedLocalEnvironment** — Idempotent INSERT ... ON CONFLICT (name) DO NOTHING at line 65; LOCAL_ENV_ID sentinel = `00000000-0000-0000-0000-000000000000` matches SUMMARY D-01.
3. **docker-clients.ts agent branch** — Line 62 constructs `new AgentDockerClient(env.agentId) as unknown as Dockerode`; no longer throws `[agent-not-implemented]` (Plan 22-01 placeholder replaced). Misconfigured agent env (no agentId) throws `[env-misconfigured]` at line 54-56 per SUMMARY.
4. **agents.ts createAgent** — Line 62 `randomBytes(32).toString('hex')` = 64-char hex; line 63 `hashToken` = SHA-256; line 74 UPDATE environments SET agent_id (backfill). Token returned cleartext ONCE in return tuple.
5. **agent-registry.ts singleton + sendRequest** — Module-level `agentRegistry` exported at line 152. sendRequest at :87 implements 30s timeout + pending Map + WS send; handleResponse at :117 preserves statusCode/code on error. forceDisconnect closes with code 4403 (`token-revoked`).
6. **agent-socket.ts lifecycle** — Register handler at :83 validates token via findAgentByToken; updates environments.agent_status='online' on success; ping every 30s; close handler cleanup() updates agent_status='offline'+last_seen=NOW(). Subscriber at :183 uses `redis.duplicate()` for subscribe-mode (matches ioredis requirement).
7. **routes.ts new agent routes** — listAgents strips token_hash + computes online from agentRegistry (lines 1550-1565); generateAgentToken validates env.type='agent' before calling createAgent (1567-1591); revokeAgentToken publishes JSON.stringify({agentId}) to 'livos:agent:revoked' (1604-1607).
8. **server/index.ts /agent/connect branch** — Lines 692-700 handle upgrade BEFORE generic webSocketRouter; uses `new WebSocketServer({noServer: true})` + handleUpgrade pattern. startAgentRevocationSubscriber booted at line 1159 with `this.livinityd.ai.redis`.
9. **UI environment-store.ts + zustand persist** — Uses `persist` middleware with `name: 'livos:selectedEnvironmentId'` + partialize for just the id. Default = LOCAL_ENV_ID; setEnvironment falls back to LOCAL_ENV_ID on empty string (matches SUMMARY D-03).
10. **docker-agent package + dist** — package.json declares bin `livos-docker-agent` → dist/index.js; dist/ contains built output (index.js 6277 bytes, proxy.js 7802 bytes); install.sh is executable and installs to /opt/livos-docker-agent with systemd unit containing LIVOS_AGENT_TOKEN/SERVER env vars.

All spot-checks match their SUMMARY claims. No STUBs, no orphaned code.

## Anti-Patterns Found

None. Scanned the 25+ files modified/created in this phase for:
- TODO/FIXME/XXX/HACK/PLACEHOLDER → no blockers (only v28 follow-up notes in comments, classified as Info not Blocker)
- Empty implementations (`return null` / `return {}`) → none in production paths
- Hardcoded empty data flowing to render → none
- Console.log-only handlers → none
- Stub mutations that throw "not implemented" → `useGenerateAgentToken` stub correctly fell through to the REAL mutation route now that 22-03 shipped (use-environments.ts:49-57 — `route?.useMutation` resolves); stub branch is dead code but intentionally preserved as defensive fallback per SUMMARY D-08

`[agent-streaming-unsupported]` throws in agent-docker-client.ts (exec, attach, follow logs, stream stats, putArchive, getArchive) are documented v28 follow-ups — NOT stubs for v27.0 scope. They throw BEFORE sending the WS request so the agent's dispatch table doesn't need to handle them. Correctly classified as Info.

## Human Verification Required

### 1. Remote TCP/TLS Daemon Connectivity

**Test:** Create a tcp-tls env pointing at a remote `dockerd --tlsverify` instance. Select it in the dropdown. Verify containers list populates.
**Expected:** Containers from the remote daemon appear; updateEnvironment + invalidateClient re-fetch uses new connection params.
**Why human:** Requires a second host running dockerd on an open TLS port with a valid CA chain — no unit test substitutes.
**Reproduction:** Spin up a remote VM with `dockerd -H tcp://0.0.0.0:2376 --tlsverify --tlscacert=... --tlscert=... --tlskey=...`; generate matching client certs; paste into Settings > Environments > Add > tcp-tls; switch dropdown; verify containers tab.

### 2. Agent End-to-End Connection + Handshake

**Test:** Install agent on a remote host and confirm it connects.
**Expected:** `systemctl status livos-docker-agent` shows active running; livinityd logs `agent <uuid> connected`; Settings > Environments shows the env as `agent · online` (green wifi icon); selecting that env in Server Control populates containers from the remote host.
**Why human:** Requires a remote host (NOT the dev workstation) with Node 20+, Docker, reachable WSS to livinityd. Commits 4ddcf5aa + 870e742b ship all code paths; only the live WS round-trip needs human observation.
**Reproduction:**
1. In Settings > Environments: Add > agent > name='test-remote' → Save (env row created with agent_id=null)
2. The GenerateAgentTokenDialog auto-opens and fires generateAgentToken mutation → displays 64-char token + curl install snippet
3. Copy the snippet, run on the remote VM: `curl -fsSL https://livinity.cloud/install-agent.sh | bash -s -- --token <T> --server wss://livinity.cloud/agent/connect`
4. Wait ~5s; verify `journalctl -u livos-docker-agent -f` shows `registered as <uuid>`
5. Refresh Settings > Environments → status flips to online
6. Select in Server Control dropdown → containers tab shows remote containers

### 3. Token Revocation 5s SLA (MH-05)

**Test:** With a live agent connection, revoke the token from Settings and measure disconnect latency.
**Expected:** Click Revoke → within 5 seconds: docker_agents.revoked_at set, Redis publishes, agent-registry.forceDisconnect fires, WS closes with code 4403, agent process exits with code 3, environments.agent_status flips to 'offline'.
**Why human:** Latency SLA is observable only with real timing + live agent. Code path is fully wired.
**Reproduction:**
1. With connected agent from test #2, open Settings > Environments > click Revoke on the agent
2. Start stopwatch on click
3. Watch `journalctl -u livos-docker-agent -f` on remote — observe `disconnected by server (code 4403): token-revoked. Halting.` message
4. Verify timestamp delta < 5s

### 4. Agent Round-Trip Latency < 100ms (MH-04 truth #6)

**Test:** Measure `docker.listContainers` median latency against an agent env on the same LAN.
**Expected:** Median < 100ms across 10 sequential calls (agent + local network path).
**Why human:** No unit test can measure real network RTT.
**Reproduction:**
1. With connected agent from test #2 (ideally on same LAN segment), open DevTools Network tab
2. Switch to agent env → Containers tab fetches 10 times (refresh button ×10)
3. Observe request timings; verify median < 100ms

## Issues

None. 4 truths are human-verification items, not issues.

Minor notes that do NOT affect verification status:
- `.planning/REQUIREMENTS.md` line 117-118 still shows MH-04 and MH-05 as "Pending" — administrative marker not yet flipped. Code is shipped per SUMMARY 22-03.
- `.planning/ROADMAP.md` line 225 still has an unchecked `[ ]` for 22-03-PLAN.md. Same administrative-only lag; SUMMARY file exists (24581 bytes), commits 4ddcf5aa and 870e742b are in `git log`, all code is present.
- Both are trivial single-character flips, outside verifier scope — flagged for the orchestrator to update STATE.md / REQUIREMENTS.md / ROADMAP.md.

## Recommendation

**Mark Phase 22 as code-complete (`passed`) once the 4 human-verification items are performed on server4 + a second host.** All code evidence is in place. Status is `human_needed` rather than `passed` solely because runtime validation of a multi-host deployment cannot be performed by static inspection.

Path to full `passed` status:
1. Deploy to server4: `git pull && npm run build --workspace=packages/core && pm2 restart nexus-core; cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build && pm2 restart livos`
2. Host the `livos-docker-agent.tar.gz` tarball at `https://livinity.cloud/agent/livos-docker-agent.tar.gz` (install.sh references this URL)
3. Host `/install-agent.sh` endpoint (currently referenced in generateAgentToken response snippet)
4. Execute tests 1-4 above on a second host
5. Fold into `/gsd:audit-milestone v27.0` — that is the documented next step per STATE.md

No code changes required for phase completion.

---

*Verified: 2026-04-24*
*Verifier: Claude (gsd-verifier)*
