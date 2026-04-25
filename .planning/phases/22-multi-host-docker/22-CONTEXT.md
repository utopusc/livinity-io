# Phase 22: Multi-host Docker Management - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped)

<domain>
## Phase Boundary

Manage multiple Docker hosts from one Livinity instance. Three connection types:
1. **Local** — Unix socket (current default)
2. **TCP+TLS** — direct connection to remote dockerd
3. **Outbound agent** — small Node binary on remote host opens WebSocket to Livinity (NAT-traversal — no inbound port required)

Server Control header has environment selector. All `docker.*` tRPC routes accept optional environmentId.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- `environments` PG table: id, name, type ('socket'|'tcp-tls'|'agent'), socket_path|tcp_host+port+tls_cert|agent_id, created_by, created_at
- Dockerode factory pattern: `getDockerClient(envId)` returns cached Dockerode instance per env
- Agent: Node binary at `livos/packages/docker-agent/` — connects via WSS to `/agent/connect`, forwards Docker API calls (proxy mode)
- Agent auth: per-agent token (32 bytes, hex) + revoke endpoint
- Agent protocol: similar to platform/relay device-bridge — outbound WS, request/response message types

</decisions>

<specifics>
## Specific Ideas

**Plans (target 3 — multi-host is the largest):**
- Plan 22-01: environments PG + Dockerode factory + tRPC envId param
- Plan 22-02: UI environment selector + add/remove env management (Settings)
- Plan 22-03: Outbound agent (Node binary) + WebSocket proxy + token auth

</specifics>

<deferred>
## Deferred Ideas

- Agent auto-update — v28.0
- Agent Go binary (Node only for v27.0) — v28.0
- Cross-environment container migration — v28.0
- Per-env audit log — v28.0

</deferred>
