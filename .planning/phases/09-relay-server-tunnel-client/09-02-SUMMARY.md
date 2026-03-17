---
phase: 09-relay-server-tunnel-client
plan: 02
status: complete
---

# 09-02 Summary: Relay Server Core

## What was built
The relay server core: tunnel connection acceptance via WebSocket, API key authentication with Redis cache, tunnel registry with heartbeat, subdomain-based HTTP routing, request proxying through tunnels, and health endpoint.

## Files created/modified
- `platform/relay/src/auth.ts` — API key verification with prefix lookup + bcrypt + Redis cache
- `platform/relay/src/subdomain-parser.ts` — Extract username/appName from Host header
- `platform/relay/src/health.ts` — Health endpoint (connections, memory, uptime)
- `platform/relay/src/tunnel-registry.ts` — TunnelConnection class + TunnelRegistry Map with heartbeat, pending requests, cleanup
- `platform/relay/src/request-proxy.ts` — HTTP request serialization to JSON envelope, response handling with base64 decode
- `platform/relay/src/server.ts` — HTTP request handler with subdomain routing
- `platform/relay/src/index.ts` — Entry point: HTTP server, WebSocket server (noServer mode), Redis, PostgreSQL, schema apply, graceful shutdown

## Key decisions
- WebSocket close codes: 4001=auth timeout, 4002=invalid key (application-specific range)
- Auth caching in Redis with configurable TTL to avoid DB lookups per connection
- `noServer` mode for WebSocket to handle both tunnel and user subdomain upgrades on same port
- Graceful shutdown broadcasts `relay_shutdown` to all connected tunnels before closing

## Verification
- `tsc --noEmit` passes clean
- All 7 source files compile and export documented APIs
