---
phase: 09-relay-server-tunnel-client
plan: 04
status: complete
---

# 09-04 Summary: WebSocket Proxying, Offline Page, Session Reconnection

## What was built
- Bidirectional WebSocket frame relay through the tunnel (ws-proxy.ts)
- Branded offline page for disconnected tunnels (offline-page.ts)
- Session reconnection buffering (30s window, 100 request max)
- WebSocket forwarding on tunnel client side

## Files created/modified
- `platform/relay/src/ws-proxy.ts` — WS upgrade handling, frame relay, shared WebSocketServer
- `platform/relay/src/offline-page.ts` — Branded HTML with auto-refresh, 503 status
- `platform/relay/src/index.ts` — User subdomain WS upgrade routing, session reconnection on auth
- `platform/relay/src/server.ts` — Offline page for disconnected tunnels, request buffering
- `platform/relay/src/tunnel-registry.ts` — enterReconnectMode, bufferRequest, resumeSession, markDisconnected
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` — handleWsUpgrade, handleWsFrame, handleWsClose, closeAllLocalWsSockets

## Key decisions
- Single shared WebSocketServer for all upgrades (memory efficient)
- resumeSession uses flushFn callback to avoid circular import with request-proxy
- 30s reconnect buffer window with 100 request max
- Session ID matching for reconnection (existing session + same username)
