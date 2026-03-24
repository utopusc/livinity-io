---
phase: 09-relay-server-tunnel-client
plan: 03
status: complete
---

# 09-03 Summary: Tunnel Client in livinityd

## What was built
TunnelClient module that connects to the relay server via WebSocket, authenticates with API key, forwards HTTP requests to localhost:8080, and reconnects with exponential backoff. tRPC routes for UI control, integrated into livinityd startup/shutdown.

## Files created/modified
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` — TunnelClient class with connect, disconnect, start, stop, HTTP forwarding, reconnection manager
- `livos/packages/livinityd/source/modules/platform/routes.ts` — 4 tRPC routes: getStatus, setApiKey, disconnect, getConnectionInfo
- `livos/packages/livinityd/source/modules/domain/routes.ts` — Merged platform router as `domain.platform.*`
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — Added platform mutations to httpOnlyPaths
- `livos/packages/livinityd/source/index.ts` — TunnelClient instantiated in constructor, started in start(), stopped in stop()

## Key decisions
- Protocol types duplicated inline (not shared package) — at two consumers, duplication is simpler
- Exponential backoff: 1s base, 60s max, with jitter to prevent thundering herd
- Auth errors do NOT trigger reconnection (bad API key won't magically fix itself)
- Redis keys under `livos:platform:*` prefix for status tracking
- TunnelClient gets Redis from `this.ai.redis` (AiModule creates Redis in its constructor)
- Platform mutations use HTTP transport (httpOnlyPaths) to avoid WS dependency issues

## Verification
- All routes accessible at `domain.platform.*`
- TunnelClient lifecycle properly managed (start/stop with livinityd)
