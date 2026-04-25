# @livos/docker-agent

Outbound Docker agent for LivOS (Phase 22 MH-04, MH-05). Runs on any host with Docker, opens a single outbound WebSocket to your livinityd instance, and proxies Docker API calls — letting LivOS manage hosts behind NAT without inbound port exposure.

## How it works

```
┌──────────────┐       outbound WSS        ┌──────────────┐
│ Remote host  │ ───────────────────────►  │ livinityd    │
│ (NAT'd)      │   wss://your.livos/        │ (public)     │
│              │      agent/connect         │              │
│ docker-agent ├───────────────────────────►│ AgentRegistry│
│              │   {register, token}       │              │
│              │ ◄──── Docker API calls ───┤              │
│              │ ──── results ────────────►│              │
└──────────────┘                            └──────────────┘
```

1. Operator creates an "agent" environment in Settings → Environments and clicks "Generate token".
2. They run `curl -fsSL .../install-agent.sh | bash -s -- --token <T> --server wss://<host>/agent/connect` on the remote machine.
3. Agent installs as a systemd service, opens a persistent WebSocket, and presents the token in its first `register` message.
4. livinityd validates SHA-256(token) against `docker_agents.token_hash` and (if not revoked) flips `environments.agent_status='online'`.
5. Every Docker API call (listContainers, container.start, image.pull, ...) is sent as `{type:'request', method, args}`; the agent dispatches via local Dockerode and replies with `{type:'response', requestId, result|error}`.

## Install

### One-line (production)

```bash
curl -fsSL https://livinity.cloud/install-agent.sh | sudo bash -s -- \
  --token <T> --server wss://livinity.cloud/agent/connect
```

This downloads the agent tarball, extracts to `/opt/livos-docker-agent`, writes a systemd unit, and starts it.

### Manual / development

```bash
git clone https://github.com/livinity/livos
cd livos/livos/packages/docker-agent
pnpm install
pnpm build
LIVOS_AGENT_TOKEN=<T> LIVOS_AGENT_SERVER=wss://your.livos.host/agent/connect \
  node dist/index.js
```

## Uninstall

```bash
sudo systemctl stop livos-docker-agent
sudo systemctl disable livos-docker-agent
sudo rm -rf /opt/livos-docker-agent
sudo rm /etc/systemd/system/livos-docker-agent.service
sudo systemctl daemon-reload
```

The remote token is **revoked separately** in the LivOS UI (Settings → Environments → Revoke). Until you do that, anyone with the token can still register a new agent.

## Token rotation

Tokens are 32 random bytes hex-encoded (64 chars, ~256 bits). They're stored only as SHA-256 on the server, so leaked DB rows do not reveal tokens.

To rotate:

1. UI → Settings → Environments → Revoke (the live agent disconnects within ~5 seconds).
2. UI → Generate token (new 64-char hex shown ONCE).
3. On the remote host: re-run the installer with the new token, OR edit `/etc/systemd/system/livos-docker-agent.service` and change `LIVOS_AGENT_TOKEN`, then `systemctl restart livos-docker-agent`.

## Privacy

The agent only forwards Docker API calls. No telemetry, no metrics, no phone-home. Source: `livos/packages/docker-agent/src/`.

The WS is bidirectional but the server is the only initiator of `request` messages. Agent never spontaneously sends data — only `register`, `pong`, and `response`.

## Limitations (v27.0)

The following Dockerode capabilities are **not** proxied in v27.0 and will throw `[agent-streaming-unsupported]`:

- `container.exec` (TTY shell-into)
- `container.attach`
- `container.logs` with `follow: true` (streaming logs)
- `container.stats` with `stream: true` (real-time stats stream)
- `getEvents` follow mode (real-time event stream)
- `container.putArchive` / `getArchive` (file copy in/out)

These need bidirectional streaming over the agent WS — planned for v28.0 along with a Go binary (eliminating the Node.js runtime dependency) and an auto-update mechanism.

## Connection codes

| Code | Meaning |
|------|---------|
| 4400 | Bad protocol (invalid JSON, wrong sequence) |
| 4401 | Token invalid or revoked at registration time. Process exits with code 2 — no reconnect storm. |
| 4403 | Token revoked while connected. Process exits with code 3. |
| 4409 | Replaced by a newer connection (you ran two agents with the same token). |
| 1006 / other | Network error or server restart — agent reconnects with exponential backoff (1s → 30s cap). |

## Source

- [`src/index.ts`](src/index.ts) — CLI entry, connection loop, exponential backoff
- [`src/proxy.ts`](src/proxy.ts) — Dockerode dispatch table
- [`src/protocol.ts`](src/protocol.ts) — WS message types (KEEP IN SYNC with livinityd's `agent-protocol.ts`)
- [`install.sh`](install.sh) — systemd installer
