---
status: partial
phase: 22-multi-host-docker
source: [22-VERIFICATION.md]
started: 2026-04-24T00:00:00Z
updated: 2026-04-24T00:00:00Z
---

## Current Test

[awaiting human testing on live infrastructure]

## Tests

### 1. Remote TCP/TLS daemon connectivity
expected: Creating a tcp-tls env with a real remote dockerd (host+port+CA+cert+key PEM blobs) successfully lists containers on that remote host; invalidateClient() + re-list returns fresh data from the updated env row.
why_human: Requires a second host running `dockerd --tlsverify ...` on an open port with a valid CA chain — impossible to exercise without live infrastructure.
result: [pending]

### 2. Agent end-to-end connection + handshake
expected: Running `install.sh --token <T> --server wss://livinity.cloud/agent/connect` on a remote VM spawns systemd-managed Node process; livinityd logs `agent <id> connected`; `environments.agent_status` flips to `'online'`; EnvironmentSelector shows green wifi icon; listContainers scoped to that env returns the remote host's containers.
why_human: Requires a remote host (NOT the dev workstation) with Node 20+ and Docker, plus a livinityd instance reachable over WSS with a valid TLS cert. Commits 4ddcf5aa/870e742b ship all the code; only the live round-trip needs human observation.
result: [pending]

### 3. Token revocation 5s SLA
expected: Clicking Revoke in UI → `docker_agents.revoked_at` set → Redis publishes on `livos:agent:revoked` → live WS closes with code 4403 → agent process exits with code 3 → `environments.agent_status` flips to `'offline'` — all within 5 seconds of the Revoke click.
why_human: Latency SLA is observable only with a live agent connection plus co-located Redis; code path is fully wired (agent-socket.ts subscriber + agent-registry.forceDisconnect + routes.ts publish) but timing must be measured on real deployment.
result: [pending]

### 4. Agent round-trip latency < 100ms over local network
expected: With agent on same LAN as livinityd, `listContainers` on agent env returns in < 100ms median (plan MH-04 truth #6).
why_human: Requires live agent + performance measurement; no unit test can verify network RTT.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Notes

All 4 items can be exercised once livinityd is deployed on server4 with a publicly reachable WSS endpoint and a second host (e.g., the Mini PC or a Contabo VM) is provisioned to run the agent. Code path is fully wired — only end-to-end runtime observation needed.

## Gaps

(none — all items are awaiting runtime testing, not implementation gaps)
