# Phase 9: Relay Server + Tunnel Client - Research

**Researched:** 2026-03-17
**Domain:** Custom WebSocket tunnel relay (Node.js/TypeScript) + tunnel client module in livinityd
**Confidence:** HIGH

## Summary

Phase 9 builds two components: a custom WebSocket relay server that runs on Server5 (45.137.194.102:4000) and accepts tunnel connections from LivOS instances, and a tunnel client module inside livinityd that establishes and maintains the tunnel connection. The relay serializes incoming HTTP requests as JSON+base64 envelopes, sends them through the tunnel WebSocket to the LivOS instance, and returns the response to the original client. WebSocket upgrade requests from browsers are handled by a separate protocol path that establishes bidirectional frame relay through the tunnel.

The standard approach is a custom Node.js relay using the `ws` library (not frp/rathole) because the platform requires per-byte bandwidth metering, direct database access for API key validation, and multi-level subdomain routing that off-the-shelf tunneling tools do not support. The relay is approximately 800-1200 lines of TypeScript, the tunnel client approximately 200-300 lines. Both leverage libraries already in the LivOS ecosystem: `ws`, `ioredis`, `pg`, `jsonwebtoken`.

**Primary recommendation:** Build the relay server as a standalone Node.js process in a new `platform/relay/` directory at the monorepo root. Build the tunnel client as a new module at `livos/packages/livinityd/source/modules/platform/tunnel-client.ts`. Use the JSON+base64 envelope protocol documented below. Start with hardcoded API key auth (real auth via Better Auth comes in Phase 11). Deploy on Server5 with PM2.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | 8.x | WebSocket server and client | Battle-tested, zero dependencies, built-in ping/pong, already in livinityd dependencies |
| ioredis | 5.x | Redis client for bandwidth counters, tunnel status | Already used throughout LivOS, named export `import { Redis } from 'ioredis'` |
| pg | 8.x | PostgreSQL client for platform schema | Already in livinityd dependencies, raw Pool for direct queries |
| jsonwebtoken | 9.x | API key / tunnel token verification | Already in livinityd dependencies |
| nanoid | 5.x | Request ID generation (URL-safe, collision-resistant) | Standard for unique IDs in Node.js, fast, small |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| http (Node.js built-in) | N/A | HTTP server for relay | Relay needs raw HTTP server, not Express (Express adds overhead, unnecessary for relay) |
| crypto (Node.js built-in) | N/A | API key hashing, random bytes | bcrypt for stored hashes, crypto.timingSafeEqual for comparison |
| bcryptjs | 2.x | API key hash comparison | Already in livinityd deps; relay loads key hash from DB and compares |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `http.createServer` | Express | Express adds ~2ms overhead per request and unnecessary middleware complexity for a relay that just serializes/forwards |
| nanoid | crypto.randomUUID | UUIDs are longer (36 chars vs 21); nanoid is URL-safe and shorter for request IDs in JSON messages |
| JSON+base64 | Binary framing (msgpack/protobuf) | Binary is ~33% more compact but much harder to debug; JSON is correct at 50-100 tunnel scale |
| Single WS connection | Connection pool (2-4 WS) | Pool mitigates head-of-line blocking but adds complexity; start with single, upgrade if profiling shows need |

**Installation (relay server):**
```bash
# In platform/relay/
npm init -y
npm install ws ioredis pg jsonwebtoken nanoid bcryptjs
npm install -D typescript @types/ws @types/pg @types/jsonwebtoken @types/bcryptjs tsx
```

**Installation (tunnel client -- already available in livinityd):**
No new dependencies needed. `ws`, `ioredis`, and `jsonwebtoken` are already in livinityd's package.json.

## Architecture Patterns

### Recommended Project Structure

**Relay Server (new directory at monorepo root):**
```
platform/
  relay/
    src/
      index.ts              # Entry point: creates HTTP server, starts relay
      server.ts             # HTTP request handler: parses host, routes to tunnel
      tunnel-registry.ts    # Map<username, TunnelConnection> with lifecycle management
      request-proxy.ts      # Serializes HTTP req -> JSON envelope, awaits response
      ws-proxy.ts           # WebSocket upgrade proxying through tunnel
      bandwidth.ts          # Redis INCRBY counters, 60s flush to PostgreSQL
      auth.ts               # API key verification (bcrypt compare + Redis cache)
      subdomain-parser.ts   # Extract username from Host header
      health.ts             # /health endpoint (connections, memory, uptime)
      offline-page.ts       # Branded "Connecting..." HTML page
      protocol.ts           # TypeScript interfaces for all tunnel message types
      config.ts             # Environment-based configuration constants
    package.json
    tsconfig.json
```

**Tunnel Client (new module in livinityd):**
```
livos/packages/livinityd/source/modules/platform/
  tunnel-client.ts          # WebSocket connection manager, request forwarding
  routes.ts                 # tRPC routes for platform connection settings
```

**Shared Protocol Types:**
The protocol types (`TunnelRequest`, `TunnelResponse`, etc.) are defined in `platform/relay/src/protocol.ts` and duplicated in the tunnel client. At this scale (two consumers), duplication is simpler than a shared package. Extract to `@livinity/tunnel-protocol` later if a third consumer appears.

### Pattern 1: Relay Request Processing Pipeline

**What:** The relay receives an HTTP request from Caddy, extracts the subdomain to identify the user, serializes the request as a JSON+base64 envelope, sends it through the user's tunnel WebSocket, and waits for the response.

**When to use:** Every HTTP request that arrives at the relay for a user subdomain.

```typescript
// Source: Architecture research + localtunnel/server pattern analysis
// Simplified relay server request handler

import http from 'node:http'
import { WebSocket } from 'ws'
import { nanoid } from 'nanoid'
import type { TunnelRequest, TunnelResponse } from './protocol.js'

const tunnels = new Map<string, TunnelConnection>()
const pendingRequests = new Map<string, PendingRequest>()

interface PendingRequest {
  res: http.ServerResponse
  timeout: NodeJS.Timeout
  startedAt: number
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const { username } = parseSubdomain(req.headers.host)

  if (!username) {
    res.writeHead(404).end('Not Found')
    return
  }

  const tunnel = tunnels.get(username)
  if (!tunnel || tunnel.ws.readyState !== WebSocket.OPEN) {
    // Serve branded offline page
    serveOfflinePage(res, username)
    return
  }

  const requestId = nanoid()

  // Collect request body
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    const body = chunks.length > 0
      ? Buffer.concat(chunks).toString('base64')
      : null

    const message: TunnelRequest = {
      type: 'http_request',
      id: requestId,
      method: req.method || 'GET',
      path: req.url || '/',
      headers: req.headers as Record<string, string>,
      body,
    }

    // Track pending request with 30s timeout
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId)
      if (!res.headersSent) {
        res.writeHead(504).end('Gateway Timeout')
      }
    }, 30_000)

    pendingRequests.set(requestId, { res, timeout, startedAt: Date.now() })

    // Count outbound bandwidth
    const messageBytes = Buffer.byteLength(JSON.stringify(message))
    trackBandwidth(tunnel.userId, 'out', messageBytes)

    // Send through tunnel
    tunnel.ws.send(JSON.stringify(message))
  })
}
```

### Pattern 2: WebSocket Upgrade Proxying Through Tunnel

**What:** When a browser wants to open a WebSocket to the user's LivOS (e.g., for tRPC subscriptions or terminal), the relay must handle the HTTP upgrade, send a control message through the tunnel, wait for the client to confirm it opened a local WebSocket, then complete the browser's upgrade and relay frames bidirectionally.

**When to use:** Any `Upgrade: websocket` request to a user subdomain.

```typescript
// Source: Existing pattern from livinityd server/index.ts lines 382-406

const wsUpgradePending = new Map<string, PendingWsUpgrade>()

interface PendingWsUpgrade {
  req: http.IncomingMessage
  socket: import('stream').Duplex
  head: Buffer
  timeout: NodeJS.Timeout
}

httpServer.on('upgrade', (req, socket, head) => {
  const { username, appName } = parseSubdomain(req.headers.host)

  // Tunnel client connecting (not proxied traffic)
  if (req.url?.startsWith('/tunnel/connect')) {
    return handleTunnelConnect(req, socket, head)
  }

  // Health check WebSocket (relay internal)
  // ... skip

  const tunnel = tunnels.get(username)
  if (!tunnel || tunnel.ws.readyState !== WebSocket.OPEN) {
    socket.destroy()
    return
  }

  const wsId = nanoid()

  // Send upgrade request through tunnel
  const upgradeMsg: TunnelWsUpgrade = {
    type: 'ws_upgrade',
    id: wsId,
    path: req.url || '/',
    headers: req.headers as Record<string, string>,
    targetApp: appName || undefined,
  }

  // Store pending upgrade with 10s timeout
  const timeout = setTimeout(() => {
    wsUpgradePending.delete(wsId)
    socket.destroy()
  }, 10_000)

  wsUpgradePending.set(wsId, { req, socket, head, timeout })
  tunnel.ws.send(JSON.stringify(upgradeMsg))
})

// When client responds with ws_ready, complete the upgrade:
function handleWsReady(username: string, msg: TunnelWsReady) {
  const pending = wsUpgradePending.get(msg.id)
  if (!pending) return
  clearTimeout(pending.timeout)
  wsUpgradePending.delete(msg.id)

  const wss = new WebSocketServer({ noServer: true })
  wss.handleUpgrade(pending.req, pending.socket, pending.head, (browserWs) => {
    // Frame relay: browser <-> relay <-> tunnel <-> LivOS
    // Browser frames go through tunnel as ws_frame messages
    browserWs.on('message', (data, isBinary) => {
      const frame: TunnelWsFrame = {
        type: 'ws_frame',
        id: msg.id,
        data: Buffer.from(data as Buffer).toString('base64'),
        binary: isBinary,
      }
      tunnel.ws.send(JSON.stringify(frame))
    })

    // Tunnel frames go to browser
    // (handled in the tunnel message router when type === 'ws_frame')

    browserWs.on('close', () => {
      tunnel.ws.send(JSON.stringify({ type: 'ws_close', id: msg.id }))
    })
    browserWs.on('error', () => {
      tunnel.ws.send(JSON.stringify({ type: 'ws_close', id: msg.id }))
    })

    // Store browserWs for incoming frames from tunnel
    activeBrowserSockets.set(msg.id, browserWs)
  })
}
```

### Pattern 3: Tunnel Client Request Forwarding

**What:** The tunnel client receives a serialized HTTP request from the relay, makes a local HTTP request to livinityd on 127.0.0.1:8080, serializes the response, and sends it back through the tunnel.

**When to use:** In the tunnel client module inside livinityd.

```typescript
// Source: Architecture research + existing livinityd patterns

import http from 'node:http'
import type { TunnelRequest, TunnelResponse } from './protocol.js'

async function handleTunnelRequest(msg: TunnelRequest, tunnelWs: WebSocket) {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: 8080,
    path: msg.path,
    method: msg.method,
    headers: {
      ...msg.headers,
      // Remove host header (points to relay) - livinityd expects its own host
      host: '127.0.0.1:8080',
    },
  }

  const localReq = http.request(options, (localRes) => {
    const chunks: Buffer[] = []
    localRes.on('data', (chunk: Buffer) => chunks.push(chunk))
    localRes.on('end', () => {
      const body = chunks.length > 0
        ? Buffer.concat(chunks).toString('base64')
        : null

      const response: TunnelResponse = {
        type: 'http_response',
        id: msg.id,
        status: localRes.statusCode || 500,
        headers: localRes.headers as Record<string, string>,
        body,
      }

      tunnelWs.send(JSON.stringify(response))
    })
  })

  localReq.on('error', (err) => {
    const response: TunnelResponse = {
      type: 'http_response',
      id: msg.id,
      status: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Local server error: ${err.message}`).toString('base64'),
    }
    tunnelWs.send(JSON.stringify(response))
  })

  // Forward request body if present
  if (msg.body) {
    localReq.write(Buffer.from(msg.body, 'base64'))
  }
  localReq.end()
}
```

### Pattern 4: Exponential Backoff with Jitter

**What:** The tunnel client reconnects with exponential backoff and jitter to avoid thundering herd when the relay restarts.

```typescript
// Source: Standard exponential backoff pattern with full jitter (AWS recommendation)

class ReconnectionManager {
  private attempt = 0
  private readonly baseDelay = 1000      // 1 second
  private readonly maxDelay = 60_000     // 60 seconds
  private readonly maxJitter = 1000      // 1 second jitter

  getNextDelay(): number {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, this.attempt),
      this.maxDelay
    )
    // Full jitter: random between 0 and exponentialDelay
    const jitter = Math.random() * Math.min(this.maxJitter, exponentialDelay)
    this.attempt++
    return exponentialDelay + jitter
  }

  reset(): void {
    this.attempt = 0
  }

  get consecutiveFailures(): number {
    return this.attempt
  }
}
```

### Anti-Patterns to Avoid

- **Using Express for the relay:** Express adds unnecessary overhead. The relay is a pure HTTP proxy with no middleware needs. Use raw `http.createServer`.
- **Storing tunnel connections in Redis:** The tunnel registry must be in-memory (Map) for sub-millisecond lookup. Redis is for cross-process signaling only.
- **Buffering entire response bodies in memory without limits:** The base64 encoding of large files (uploads to Immich, file downloads) can OOM the relay. Set `maxPayload: 50 * 1024 * 1024` (50MB) on the WebSocket server.
- **Using http-proxy-middleware for WS upgrades in the relay:** The relay must handle `server.on('upgrade')` explicitly. http-proxy-middleware's WS support does not work when the upstream is a WebSocket tunnel, not a direct HTTP server.
- **Sharing a single pending requests Map across all users:** Use one Map per tunnel connection (inside TunnelConnection class) so cleanup on disconnect is O(1) instead of O(n).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom TCP socket handler | `ws` library with noServer mode | Handles upgrade, ping/pong, binary frames, close codes, backpressure |
| Request ID generation | `Math.random().toString(36)` | `nanoid` | Collision-resistant, URL-safe, predictable length, fast |
| API key hashing | Custom hash function | `bcryptjs` | Timing-safe comparison, configurable work factor, industry standard |
| Exponential backoff | Custom retry loop | Standard pattern (see Pattern 4 above) | Jitter prevents thundering herd; simple enough to implement inline |
| Redis atomic increment | `GET` then `SET` | Redis `INCRBY` | Atomic, no race condition under concurrent tunnel writes |
| JSON parsing with type safety | Manual type checks | Zod schema validation | Already in livinityd deps; validates tunnel messages at boundary |

**Key insight:** The relay is architecturally simple (serialize HTTP -> send through WS -> deserialize response) but the edge cases are complex (WebSocket upgrade proxying, connection lifecycle, bandwidth metering). Use battle-tested libraries for the primitives so you can focus on the protocol logic.

## Common Pitfalls

### Pitfall 1: WebSocket Connections Drop Silently Through the Tunnel
**What goes wrong:** Caddy's `stream_close_delay` defaults to 0. Any Caddy config reload (triggered by On-Demand TLS cert issuance) instantly kills all active WebSocket connections through the relay.
**Why it happens:** The relay sits behind Caddy on Server5. Caddy is the TLS terminator. When Caddy reloads config, it tears down existing connections unless `stream_close_delay` is set.
**How to avoid:** Set `stream_close_delay 5m` in Caddy global config. Implement 30s ping/pong heartbeat between relay and tunnel client. On the client side, detect no-pong within 60s and trigger reconnection.
**Warning signs:** Users report "AI stopped responding" or terminal sessions freezing after a few minutes of use.

### Pitfall 2: Relay Memory Exhaustion
**What goes wrong:** Server5 has 8GB RAM shared across relay, Next.js (future), PostgreSQL, and Redis. Unbounded Maps, orphaned WebSocket connections, and uncollected event listeners cause memory leaks.
**Why it happens:** Node.js WebSocket memory leaks are common when connections are not explicitly cleaned up. Each WS connection plus its event listeners and pending request Map entries consume memory.
**How to avoid:** Implement a `TunnelConnection` class with an explicit `destroy()` method that clears all Maps, removes all event listeners, and closes the WebSocket. Set `maxPayload: 50MB` on the WebSocket server. Add a `/health` endpoint that reports `process.memoryUsage()`. Reject new connections if RSS > 80% of 8GB.
**Warning signs:** Memory usage climbs over days without corresponding increase in active tunnels.

### Pitfall 3: Tunnel Protocol Not Designed for Reconnection
**What goes wrong:** Residential internet has micro-outages (2-5 seconds). Without session resumption, every blip requires full re-authentication and loses all in-flight requests.
**Why it happens:** The WebSocket connection is stateful. When it drops, all pending request/response pairs are lost.
**How to avoid:** Assign persistent session IDs on first connection. On reconnection, the client sends its session ID. The relay buffers incoming requests for 30 seconds during the reconnection window. Serve a branded "Connecting..." page to browsers instead of raw 502 errors during the buffer window.
**Warning signs:** Users see brief error pages that immediately resolve, or pending HTTP requests return 502 then succeed on browser retry.

### Pitfall 4: Forgetting to Forward All Headers
**What goes wrong:** The relay strips or modifies headers that livinityd needs. Cookie headers, Authorization headers, Accept-Encoding, X-Forwarded-For, and Content-Type must all pass through.
**Why it happens:** Naive serialization may normalize header casing, drop duplicate headers (like multiple Set-Cookie values), or omit non-standard headers.
**How to avoid:** Serialize headers as `Record<string, string | string[]>` to preserve multi-value headers. On the response side, use `res.writeHead(status, headers)` which accepts multi-value headers. Add `X-Forwarded-For` and `X-Forwarded-Proto` headers so livinityd knows the request came from the internet.
**Warning signs:** Authentication fails through the tunnel (cookies not forwarded), CORS errors (Origin header missing), or responses arrive without compression.

### Pitfall 5: WebSocket Frame Relay Race Condition
**What goes wrong:** When proxying WebSocket frames through the tunnel, frames can arrive out of order if the tunnel processes them asynchronously.
**Why it happens:** The tunnel client receives a `ws_upgrade` message, opens a local WebSocket, and sends `ws_ready`. But the relay may start forwarding `ws_frame` messages before the local WebSocket is fully open.
**How to avoid:** The relay must NOT forward browser WebSocket frames until it receives `ws_ready` from the client. Buffer any frames that arrive between the upgrade request and the ready confirmation. Use a per-WebSocket-session queue.
**Warning signs:** tRPC subscriptions appear to miss the first few messages, or the initial WebSocket handshake fails intermittently.

## Code Examples

### Tunnel Protocol Message Types (Complete)

```typescript
// protocol.ts -- shared between relay and tunnel client
// Source: Architecture research document Section 4.2

// ── Relay -> Client messages ──────────────────────────────────

interface TunnelRequest {
  type: 'http_request'
  id: string              // nanoid, unique per request
  method: string          // GET, POST, PUT, DELETE, etc.
  path: string            // /path?query=string
  headers: Record<string, string | string[]>
  body: string | null     // base64-encoded if present
  targetApp?: string      // for app subdomain routing (e.g., "immich")
}

interface TunnelWsUpgrade {
  type: 'ws_upgrade'
  id: string              // WebSocket session ID (nanoid)
  path: string            // /trpc, /terminal, etc.
  headers: Record<string, string | string[]>
  targetApp?: string
}

interface TunnelPing {
  type: 'ping'
  ts: number              // Date.now() for latency measurement
}

interface TunnelRelayShutdown {
  type: 'relay_shutdown'  // Relay is shutting down gracefully
}

// ── Client -> Relay messages ──────────────────────────────────

interface TunnelResponse {
  type: 'http_response'
  id: string              // matching request ID
  status: number          // HTTP status code
  headers: Record<string, string | string[]>
  body: string | null     // base64-encoded if present
}

interface TunnelWsReady {
  type: 'ws_ready'
  id: string              // matching WebSocket session ID
}

interface TunnelWsError {
  type: 'ws_error'
  id: string
  error: string
}

interface TunnelPong {
  type: 'pong'
  ts: number              // echo back the relay's timestamp
}

interface TunnelAuth {
  type: 'auth'
  apiKey: string          // raw API key for initial authentication
  sessionId?: string      // for reconnection (reuse previous session)
}

// ── Bidirectional messages ────────────────────────────────────

interface TunnelWsFrame {
  type: 'ws_frame'
  id: string              // WebSocket session ID
  data: string            // base64-encoded frame data
  binary: boolean         // was the original frame binary?
}

interface TunnelWsClose {
  type: 'ws_close'
  id: string
  code?: number           // WebSocket close code
  reason?: string
}

// ── Relay -> Client control messages ──────────────────────────

interface TunnelConnected {
  type: 'connected'
  sessionId: string       // assigned session ID for reconnection
  assignedUrl: string     // e.g., "alice.livinity.io"
}

interface TunnelAuthError {
  type: 'auth_error'
  error: string           // human-readable error message
}

interface TunnelQuotaExceeded {
  type: 'quota_exceeded'
  usedBytes: number
  limitBytes: number
  resetsAt: string        // ISO date string
}

// Union type for message routing
type RelayToClientMessage =
  | TunnelRequest
  | TunnelWsUpgrade
  | TunnelPing
  | TunnelRelayShutdown
  | TunnelConnected
  | TunnelAuthError
  | TunnelQuotaExceeded

type ClientToRelayMessage =
  | TunnelAuth
  | TunnelResponse
  | TunnelWsReady
  | TunnelWsError
  | TunnelPong

type BidirectionalMessage =
  | TunnelWsFrame
  | TunnelWsClose

type TunnelMessage =
  | RelayToClientMessage
  | ClientToRelayMessage
  | BidirectionalMessage
```

### Tunnel Connection Class (Relay Side)

```typescript
// tunnel-registry.ts -- manages a single tunnel connection lifecycle

import { WebSocket } from 'ws'

interface TunnelConnectionOptions {
  username: string
  userId: string
  ws: WebSocket
  sessionId: string
}

class TunnelConnection {
  readonly username: string
  readonly userId: string
  readonly ws: WebSocket
  readonly sessionId: string
  readonly connectedAt: number = Date.now()

  // Per-connection pending requests
  private pendingRequests = new Map<string, PendingRequest>()
  // Per-connection active WebSocket sessions
  private activeWsSessions = new Map<string, WebSocket>()

  private pingInterval: NodeJS.Timeout | null = null
  private alive = true

  constructor(options: TunnelConnectionOptions) {
    this.username = options.username
    this.userId = options.userId
    this.ws = options.ws
    this.sessionId = options.sessionId

    // Start heartbeat
    this.pingInterval = setInterval(() => {
      if (!this.alive) {
        this.destroy('ping timeout')
        return
      }
      this.alive = false
      this.ws.ping()  // ws library ping frame
    }, 30_000)

    this.ws.on('pong', () => {
      this.alive = true
    })
  }

  destroy(reason?: string) {
    // Clear heartbeat
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    // Fail all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      if (!pending.res.headersSent) {
        pending.res.writeHead(502).end('Tunnel disconnected')
      }
    }
    this.pendingRequests.clear()

    // Close all active WebSocket sessions
    for (const [id, browserWs] of this.activeWsSessions) {
      browserWs.close(1001, 'Tunnel disconnected')
    }
    this.activeWsSessions.clear()

    // Close tunnel WebSocket
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, reason || 'Server closing')
    }

    // Remove all listeners to prevent memory leaks
    this.ws.removeAllListeners()
  }
}
```

### Bandwidth Tracking (Redis INCRBY + PostgreSQL Flush)

```typescript
// bandwidth.ts -- hot counters in Redis, cold storage in PostgreSQL
// Source: Platform STACK.md research, Section 5

import { Redis } from 'ioredis'
import pg from 'pg'

const FREE_TIER_BYTES = 53_687_091_200  // 50 GB

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function trackBandwidth(
  redis: Redis,
  userId: string,
  direction: 'in' | 'out',
  bytes: number,
) {
  const month = currentMonth()
  const key = `bandwidth:${userId}:${direction}:${month}`
  await redis.incrby(key, bytes)
  // Set expiry to end of month + 90 days if not already set
  await redis.expire(key, 90 * 24 * 60 * 60)
}

async function checkQuota(redis: Redis, userId: string): Promise<boolean> {
  const month = currentMonth()
  const inBytes = parseInt(await redis.get(`bandwidth:${userId}:in:${month}`) || '0')
  const outBytes = parseInt(await redis.get(`bandwidth:${userId}:out:${month}`) || '0')
  return (inBytes + outBytes) < FREE_TIER_BYTES
}

// Flush job: runs every 60 seconds
async function flushBandwidthToPostgres(redis: Redis, pool: pg.Pool) {
  const keys = await redis.keys('bandwidth:*')
  for (const key of keys) {
    // Parse: bandwidth:{userId}:{direction}:{month}
    const parts = key.split(':')
    if (parts.length !== 4) continue
    const [, userId, direction, month] = parts
    const bytes = parseInt(await redis.get(key) || '0')
    if (bytes === 0) continue

    const column = direction === 'in' ? 'bytes_in' : 'bytes_out'
    await pool.query(
      `INSERT INTO bandwidth_usage (user_id, period_month, ${column})
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, period_month)
       DO UPDATE SET ${column} = bandwidth_usage.${column} + $3,
                     updated_at = NOW()`,
      [userId, month, bytes],
    )

    // Reset Redis counter after successful flush
    // Use DECRBY to handle concurrent writes between GET and DECRBY
    await redis.decrby(key, bytes)
  }
}
```

### ws Library Heartbeat Pattern

```typescript
// Source: ws library README + official documentation

import { WebSocketServer, WebSocket } from 'ws'

const wss = new WebSocketServer({ noServer: true })

// Server-side heartbeat detection
wss.on('connection', (ws) => {
  (ws as any).isAlive = true

  ws.on('pong', () => {
    (ws as any).isAlive = true
  })

  ws.on('error', console.error)
})

// Periodic check (30s interval)
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as any).isAlive === false) {
      ws.terminate()  // Not close() -- terminate() is immediate
      continue
    }
    (ws as any).isAlive = false
    ws.ping()  // Built-in WebSocket ping frame
  }
}, 30_000)

wss.on('close', () => {
  clearInterval(heartbeatInterval)
})
```

## Tunnel Protocol Specification

### Connection Establishment Flow

```
LivOS Client                                  Relay Server
    |                                               |
    |  WS connect: wss://relay.livinity.io          |
    |             /tunnel/connect                    |
    |---------------------------------------------->|
    |                                               |
    |  First message (within 5s or disconnect):     |
    |  { type: "auth", apiKey: "liv_k_..." }        |
    |---------------------------------------------->|
    |                                               |
    |                        Verify API key:        |
    |                        1. Extract prefix      |
    |                        2. Look up in DB       |
    |                        3. bcrypt.compare      |
    |                        4. Cache in Redis 5min |
    |                                               |
    |  { type: "connected",                         |
    |    sessionId: "sess_abc123",                   |
    |    assignedUrl: "alice.livinity.io" }          |
    |<----------------------------------------------|
    |                                               |
    |  ping/pong every 30s                          |
    |<--------------------------------------------->|
```

### Reconnection Flow

```
LivOS Client                                  Relay Server
    |                                               |
    |  [connection drops]                            |
    |                                               |
    |  Wait: 1s + jitter(0-1s)                      |
    |                                               |
    |  WS connect: /tunnel/connect                   |
    |---------------------------------------------->|
    |                                               |
    |  { type: "auth",                              |
    |    apiKey: "liv_k_...",                        |
    |    sessionId: "sess_abc123" }                  |
    |---------------------------------------------->|
    |                                               |
    |                     Verify API key            |
    |                     Recognize session ID      |
    |                     Flush buffered requests   |
    |                                               |
    |  { type: "connected",                         |
    |    sessionId: "sess_abc123",                   |
    |    assignedUrl: "alice.livinity.io" }          |
    |<----------------------------------------------|
    |                                               |
    |  [buffered requests arrive]                    |
    |<----------------------------------------------|
```

### Session Buffer Design

During the 30-second reconnection window, the relay:
1. Keeps the TunnelConnection object alive (marked as `reconnecting`)
2. Buffers incoming HTTP requests (up to 100 requests, 10MB total)
3. Serves the branded "Connecting..." page to browsers
4. If the client reconnects within 30s, forwards all buffered requests
5. If 30s expires, destroys the session and returns 502 to all buffered requests

## PostgreSQL Schema (Platform -- Server5)

This is the PLATFORM schema, separate from the LivOS schema on each user's server.

```sql
-- Platform database: runs on Server5, NOT on user's servers
-- Applied idempotently (IF NOT EXISTS) on every relay startup

-- Users table (for Phase 9, stores API key info only;
-- full registration fields added in Phase 11)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API keys (one per user for v8.0)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  prefix VARCHAR(14) NOT NULL,       -- "liv_k_" + first 8 chars for display
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)                    -- one key per user for v8.0
);

-- Bandwidth usage (cold storage, flushed from Redis every 60s)
CREATE TABLE IF NOT EXISTS bandwidth_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month VARCHAR(7) NOT NULL,  -- "2026-03"
  bytes_in BIGINT NOT NULL DEFAULT 0,
  bytes_out BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_month)
);

-- Tunnel connections (tracks connection history + current state)
CREATE TABLE IF NOT EXISTS tunnel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64) UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  client_version VARCHAR(20),
  client_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)                    -- one tunnel per user
);

-- Index for API key lookup by prefix
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);

-- Index for bandwidth queries by user and month
CREATE INDEX IF NOT EXISTS idx_bandwidth_user_month ON bandwidth_usage(user_id, period_month);
```

**Phase 9 bootstrap:** For testing before Phase 11 (auth) is built, manually insert a test user and API key:

```sql
-- Test user for Phase 9 development
INSERT INTO users (id, username, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'testuser', 'test@livinity.io')
ON CONFLICT (username) DO NOTHING;

-- Generate test API key: liv_k_test1234567890abcdef
-- Hash: bcrypt('liv_k_test1234567890abcdef', 10)
INSERT INTO api_keys (user_id, key_hash, prefix) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '$2a$10$...',  -- generate with: await bcrypt.hash('liv_k_testkey12345678', 10)
   'liv_k_testke')
ON CONFLICT (user_id) DO NOTHING;
```

## Server5 Setup Requirements

Server5 (45.137.194.102) currently runs as a test server with systemd. Phase 9 needs:

### Software to Install
| Software | Version | Purpose | Install Method |
|----------|---------|---------|----------------|
| Node.js | 22 LTS | Relay server runtime | nvm or NodeSource |
| PostgreSQL | 16 | Platform database | apt install postgresql-16 |
| Redis | 7.x | Bandwidth counters, tunnel status, pub/sub | apt install redis-server |
| Caddy | 2.11+ with cloudflare module | TLS termination, reverse proxy | xcaddy build or existing binary |
| PM2 | latest | Process management for relay | npm install -g pm2 |

### Caddy Configuration (Phase 9 minimal)

For Phase 9, Caddy needs minimal config (full DNS/TLS config comes in Phase 10):

```caddyfile
{
  # Allow WebSocket connections to survive Caddy reloads
  servers {
    stream_close_delay 5m
  }
}

# Relay server -- accepts tunnel connections and proxies requests
:4000 {
  reverse_proxy 127.0.0.1:4001 {
    # Enable WebSocket proxying
    header_up Connection {>Connection}
    header_up Upgrade {>Upgrade}
  }
}
```

Note: In Phase 9, the relay can listen directly on port 4000 without Caddy (Caddy TLS comes in Phase 10). For initial development, skip Caddy and connect tunnel clients directly.

### Redis Configuration

Redis should be configured with a password and reasonable memory limits:

```
# /etc/redis/redis.conf additions
requirepass LivRelayRedis2024!
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### PM2 Ecosystem File

```javascript
// ecosystem.config.cjs (Server5)
module.exports = {
  apps: [
    {
      name: 'relay',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/opt/platform/relay',
      env: {
        NODE_ENV: 'production',
        RELAY_PORT: 4000,
        DATABASE_URL: 'postgresql://platform:LivPlatform2024!@localhost:5432/platform',
        REDIS_URL: 'redis://:LivRelayRedis2024!@localhost:6379',
      },
      max_memory_restart: '1G',
      restart_delay: 3000,
    },
  ],
}
```

## Integration with livinityd

### Where the Tunnel Client Module Goes

The tunnel client is a new module in livinityd, NOT a separate process:

```
livos/packages/livinityd/source/modules/platform/
  tunnel-client.ts    # WebSocket connection to relay, request forwarding
  routes.ts           # tRPC routes for tunnel settings (enable, API key, status)
```

### How It Integrates

1. **Initialization:** The tunnel client is instantiated in `Livinityd` constructor (like other modules) but only connects if an API key is configured in Redis (`livos:platform:api_key`).

2. **Start/Stop:** Called from `Livinityd.start()` after database and server modules are ready. Uses livinityd's existing Redis connection (`this.livinityd.ai.redis`).

3. **tRPC Routes:** Added to the domain router (alongside existing tunnel and domain routes). New routes:
   - `domain.platform.getStatus` -- returns connection status
   - `domain.platform.setApiKey` -- stores API key, triggers connection
   - `domain.platform.disconnect` -- stops tunnel, clears API key
   These must be added to `httpOnlyPaths` in `common.ts`.

4. **Redis Keys:**
   - `livos:platform:api_key` -- stored API key
   - `livos:platform:enabled` -- boolean
   - `livos:platform:status` -- "connected" | "disconnected" | "connecting" | "error"
   - `livos:platform:url` -- assigned URL (e.g., "alice.livinity.io")
   - `livos:platform:session_id` -- for reconnection

5. **No Changes to Existing Server:** The tunnel client makes HTTP requests to `127.0.0.1:8080` (livinityd's own port). Livinityd sees these as normal local HTTP requests. No changes needed to the server module, app gateway, or any existing middleware.

### Tunnel Client Lifecycle

```
livinityd.start()
  |
  +-> modules/platform/tunnel-client.ts
       |
       +-> Check Redis: livos:platform:api_key exists?
       |     NO -> idle, wait for user to set API key via Settings
       |     YES -> connect()
       |
       +-> connect()
       |     WebSocket to wss://relay.livinity.io/tunnel/connect
       |     Send auth message with API key
       |     On connected: update Redis status, store session ID
       |     On message: route to handleRequest / handleWsUpgrade / handlePing
       |     On close: trigger reconnection with exponential backoff
       |     On error: log, trigger reconnection
       |
       +-> handleRequest(msg)
       |     http.request to 127.0.0.1:8080
       |     Forward full headers + body
       |     Send response back through tunnel
       |
       +-> handleWsUpgrade(msg)
             Open local WebSocket to 127.0.0.1:8080
             Send ws_ready
             Bidirectional frame relay
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localtunnel raw TCP pool | WebSocket-based tunnel with JSON envelopes | 2023+ (pipenet, custom relays) | HTTP-level inspection, metering, and routing possible |
| Cloudflare Tunnel (cloudflared) | Custom relay for metered self-hosted platforms | N/A (different use case) | Direct bandwidth metering, no vendor lock-in |
| HTTP long-polling for tunnel | WebSocket with ping/pong heartbeat | Standard since 2020 | Lower latency, built-in connection health detection |
| Single connection per client | Connection pooling with multiplexing | 2024+ (for high-throughput tunnels) | Mitigates head-of-line blocking; overkill for v8.0 scale |

**Deprecated/outdated:**
- **localtunnel's TCP pool approach:** localtunnel creates a pool of raw TCP sockets to the server. This doesn't support HTTP-level inspection or per-user metering. The Livinity relay uses WebSocket with JSON envelopes instead.
- **Server-Sent Events for tunnel:** SSE is unidirectional (server to client only). A tunnel requires bidirectional communication. WebSocket is the correct transport.

## Open Questions

Things that couldn't be fully resolved:

1. **SSE (Server-Sent Events) passthrough**
   - What we know: LivOS uses SSE for AI chat streaming (`/api/agent/stream`). The relay must not buffer SSE responses.
   - What's unclear: Whether JSON+base64 envelope supports streaming responses or if the entire response must be collected before sending. For SSE, the response is a long-lived stream.
   - Recommendation: For Phase 9, treat SSE as a regular HTTP response (collect entire body). This means AI chat responses appear all at once instead of streaming. Add chunked response streaming as an optimization in Phase 14.

2. **Large file upload/download through tunnel**
   - What we know: Users may upload photos to Immich or download files through the tunnel. Files can be hundreds of MB.
   - What's unclear: The JSON+base64 encoding adds 33% overhead and requires holding the entire file in memory.
   - Recommendation: Set a 50MB max payload for Phase 9. Document that large file transfers are limited. Add chunked streaming protocol extension in Phase 14.

3. **App subdomain routing through tunnel**
   - What we know: The relay needs to route `immich.alice.livinity.io` to Alice's Immich app. The `targetApp` field in the protocol handles this.
   - What's unclear: Whether the tunnel client should forward to livinityd's app gateway (which already handles subdomain routing) or directly to the app container's port.
   - Recommendation: Forward ALL requests to livinityd on port 8080. Let livinityd's existing app gateway middleware handle app routing. This avoids duplicating routing logic. The `targetApp` field is informational only in Phase 9; the Host header carries the actual routing info.

4. **PM2 vs systemd on Server5**
   - What we know: Server5 currently uses systemd (per MEMORY.md). Server4 uses PM2.
   - What's unclear: Whether to switch Server5 to PM2 for consistency or keep systemd.
   - Recommendation: Use PM2 for consistency with Server4 and because PM2 provides `max_memory_restart`, log rotation, and cluster mode without systemd unit file management.

## Sources

### Primary (HIGH confidence)
- LivOS codebase: `server/index.ts` (WebSocket upgrade handling, lines 344-519)
- LivOS codebase: `database/index.ts` (PostgreSQL pool pattern, pg library usage)
- LivOS codebase: `domain/tunnel.ts` (existing Cloudflare tunnel pattern)
- LivOS codebase: `domain/routes.ts` (tRPC route pattern for domain/tunnel settings)
- [ws library documentation](https://github.com/websockets/ws/blob/master/doc/ws.md) - noServer mode, handleUpgrade, ping/pong
- [ws library README](https://github.com/websockets/ws) - heartbeat pattern, multiple servers example
- Platform STACK.md research (bandwidth metering architecture, Redis INCRBY pattern)
- Platform ARCHITECTURE.md research (tunnel protocol specification, data flow diagrams)
- Platform PITFALLS.md research (P1, P2, P5, P8 prevention strategies)

### Secondary (MEDIUM confidence)
- [Building HTTP Tunnel with WebSocket and Node.js](https://dev.to/embbnux/building-a-http-tunnel-with-websocket-and-nodejs-4bp5) - JSON envelope serialization pattern
- [localtunnel/server architecture](https://deepwiki.com/localtunnel/server/2-architecture) - TunnelAgent pattern, socket pool management
- [pipenet](https://github.com/punkpeye/pipenet) - TypeScript tunnel implementation, multiplexing design
- [WebSocket heartbeat patterns](https://oneuptime.com/blog/post/2026-01-27-websocket-heartbeat/view) - ping/pong implementation
- [Exponential backoff with jitter](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1) - reconnection strategy

### Tertiary (LOW confidence)
- TCP-over-WebSocket meltdown (theoretical concern; severity depends on user network quality)
- 50MB max payload limit (estimated; needs profiling with real workloads)
- 30s reconnection buffer window (estimated; may need tuning based on residential internet patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in LivOS ecosystem, verified versions
- Architecture: HIGH - tunnel protocol fully specified in prior research, patterns verified against existing codebase
- Pitfalls: HIGH - identified from codebase analysis + official documentation + production tunnel service patterns
- PostgreSQL schema: MEDIUM - schema is straightforward but Phase 11 auth integration may require modifications
- Server5 setup: MEDIUM - specific versions and configurations need verification on actual server

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (30 days -- stable domain, libraries are mature)
