# Architecture: Livinity Platform (v8.0)

**Domain:** Self-hosted platform with tunnel relay and central website
**Researched:** 2026-03-17
**Overall Confidence:** HIGH (architecture patterns well-established; verified against existing codebase + multiple sources)

---

## 1. System Overview

The Livinity Platform adds three new components to the existing LivOS ecosystem:

1. **Relay Server** -- Accepts persistent WebSocket connections from LivOS instances, routes HTTP/WebSocket traffic to them based on subdomain
2. **livinity.io (Next.js)** -- Central platform website: user accounts, dashboard, tunnel provisioning, marketing pages
3. **LivOS Tunnel Client** -- Runs inside each LivOS instance, establishes and maintains the tunnel connection to the relay

These integrate with the existing LivOS stack (livinityd on :8080, Caddy, Redis, PostgreSQL, Docker apps) without modifying the core LivOS serving path -- the tunnel client sits alongside livinityd as a new module.

```
                        EXISTING (Server4/User's Server)       NEW (Server5)
                     +-------------------+               +-----------------------+
                     |  User's LivOS     |               |  livinity.io          |
                     |  Instance         |               |  Platform Server      |
                     |                   |               |                       |
                     | [livinityd :8080] |  WebSocket    | [Next.js :3000]       |
                     | [Caddy :80]       |  tunnel       |    |                  |
                     | [Redis]           |               | [Relay Server :4000]  |
                     | [PostgreSQL]      |               |    |                  |
                     | [Docker Apps]     |               | [Caddy :443]          |
                     | [Nexus :3200]     |               | [PostgreSQL]          |
                     |                   |               | [Redis]               |
                     | [Tunnel Client]---|----WSS------->|                       |
                     +-------------------+               +-----------------------+
                                                                  |
                                                           [Cloudflare DNS]
                                                           *.livinity.io -> Server5
                                                           *.livinity.app -> Server5
```

---

## 2. Component Architecture

### 2.1 Relay Server (NEW -- runs on Server5)

**Purpose:** Accept tunnel connections from LivOS instances, route incoming HTTP requests and WebSocket upgrades to the correct tunnel based on subdomain.

**Technology:** Standalone Node.js/TypeScript process using the `ws` library for WebSocket and native `http` module for request handling.

**Why a separate process (not embedded in Next.js):**
- Next.js does not natively support WebSocket server endpoints in production (confirmed via Next.js GitHub discussion #58698)
- The relay must handle raw HTTP request/response proxying with WebSocket upgrade support, which requires a custom HTTP server
- Separation of concerns: the relay handles networking; Next.js handles UI/API
- Independent scaling: relay can be restarted or scaled without affecting the website
- Reliability: a tunnel relay crash should not take down the marketing site

**Architecture:**

```
Relay Server Process (:4000)
|
+-- HTTP Server (http.createServer)
|   |-- Handles incoming HTTP requests from Cloudflare/Caddy
|   |-- Extracts subdomain from Host header
|   |-- Looks up tunnel by subdomain in registry
|   |-- Serializes request -> sends through tunnel WebSocket
|   |-- Awaits response -> sends back to original client
|   |
|   +-- WebSocket Upgrade Handler
|       |-- For tunnel control connections (/tunnel/connect)
|       |-- For proxied WebSocket connections (app traffic)
|
+-- Tunnel Registry (in-memory Map)
|   |-- Key: username (from subdomain)
|   |-- Value: { ws, status, connectedAt, lastPing }
|   |-- Backed by Redis for cross-process state (future scaling)
|
+-- Request Multiplexer
    |-- Assigns unique requestId to each proxied request
    |-- Tracks pending requests in Map<requestId, {res, timeout}>
    |-- Handles timeout (30s default, configurable)
```

**Key Design Decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport for tunnel | WebSocket (ws library) | Battle-tested, firewall-friendly, built-in ping/pong, browser-debuggable |
| Request serialization | JSON envelope + base64 body | Simple, debuggable; binary bodies base64-encoded. Adequate for 50-100 tunnels |
| Multiplexing | Request ID in JSON envelope | Single WebSocket per LivOS instance, multiple concurrent requests via ID matching |
| State storage | In-memory Map + Redis pub/sub | Fast lookups; Redis for signaling between relay and Next.js |
| Process model | Single process, single port | Sufficient for 50-100 tunnels; add clustering later if needed |

### 2.2 livinity.io Next.js App (NEW -- runs on Server5)

**Purpose:** Central platform website with user registration, dashboard, tunnel management, and marketing/docs pages.

**Technology:** Next.js 15 with App Router, React Server Components, Server Actions, PostgreSQL (via Drizzle ORM), Redis for session/state.

**Architecture:**

```
Next.js App (:3000)
|
+-- App Router
|   +-- / (marketing pages -- SSG)
|   +-- /login, /register (auth pages)
|   +-- /dashboard (protected -- user's LivOS status, tunnel info)
|   +-- /settings (account, billing future)
|   +-- /docs (documentation)
|
+-- API Routes (/api/*)
|   +-- /api/auth/* (NextAuth.js or custom JWT auth)
|   +-- /api/tunnel/register (LivOS instance registers, gets tunnel credentials)
|   +-- /api/tunnel/status (check tunnel health)
|   +-- /api/webhook/* (future: payment webhooks)
|
+-- Server Actions
|   +-- createTunnel() -- provisions subdomain, stores in DB, signals relay
|   +-- deleteTunnel() -- tears down tunnel, cleans up
|   +-- updateProfile() -- user settings
|
+-- Communication with Relay
|   +-- Redis pub/sub channel: "relay:commands"
|   +-- Next.js publishes: { action: "provision", username, token }
|   +-- Relay subscribes and updates its registry
|   +-- Relay publishes status back: "relay:status"
```

**Why Next.js communicates with relay via Redis (not HTTP):**
- Redis pub/sub is real-time and event-driven
- No need to expose relay's internal API to the network
- Both processes already share Redis on Server5
- Simple, reliable, no additional HTTP server endpoint on the relay

### 2.3 LivOS Tunnel Client (NEW -- runs on each user's LivOS instance)

**Purpose:** Establish and maintain a persistent WebSocket connection to the relay server, forward HTTP requests to local livinityd, return responses.

**Technology:** TypeScript module inside livinityd.

**Recommendation: New module inside livinityd** rather than a separate process, because:
- Access to livinityd's Redis, logger, config system
- Can be enabled/disabled from the existing Settings UI via tRPC
- Simpler deployment (no extra PM2 process to manage)
- The tunnel client is lightweight (one WebSocket connection + request forwarding)

**Architecture:**

```
Tunnel Client Module (inside livinityd)
|
+-- WebSocket Connection Manager
|   |-- Connects to wss://relay.livinity.io/tunnel/connect
|   |-- Authenticates with tunnel token (issued by livinity.io)
|   |-- Ping/pong heartbeat (30s interval)
|   |-- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s... max 60s)
|   |-- Jitter to prevent thundering herd
|
+-- Request Handler
|   |-- Receives serialized HTTP request from relay
|   |-- Deserializes JSON envelope
|   |-- Makes local HTTP request to 127.0.0.1:8080 (livinityd)
|   |-- Serializes response (status, headers, base64 body)
|   |-- Sends back through WebSocket with matching requestId
|
+-- WebSocket Proxy Handler
|   |-- Receives WebSocket upgrade request from relay
|   |-- Opens local WebSocket to 127.0.0.1:8080
|   |-- Bidirectional frame relay (same pattern as existing app gateway in server/index.ts)
|
+-- Config (Redis keys)
    |-- livos:tunnel:enabled (boolean)
    |-- livos:tunnel:token (auth token from livinity.io)
    |-- livos:tunnel:status (connected/disconnected/error)
    |-- livos:tunnel:url (assigned URL, e.g., "alice.livinity.io")
```

---

## 3. Data Flow Diagrams

### 3.1 HTTP Request Flow (browser to user's LivOS)

```
Browser                  Cloudflare           Server5 (Relay)         User's LivOS
  |                         |                      |                       |
  |  GET alice.livinity.io  |                      |                       |
  |------------------------>|                      |                       |
  |                         |  *.livinity.io       |                       |
  |                         |  -> Server5 IP       |                       |
  |                         |--------------------->|                       |
  |                         |                      |                       |
  |                         |              Extract subdomain: "alice"      |
  |                         |              Lookup tunnel registry          |
  |                         |              Found: alice's WebSocket        |
  |                         |                      |                       |
  |                         |              Serialize request:              |
  |                         |              {                               |
  |                         |                id: "req_abc123",             |
  |                         |                method: "GET",                |
  |                         |                path: "/",                    |
  |                         |                headers: {...},               |
  |                         |                body: null                    |
  |                         |              }                               |
  |                         |                      |                       |
  |                         |                      |--- WS message ------->|
  |                         |                      |                       |
  |                         |                      |          Deserialize  |
  |                         |                      |          HTTP GET to  |
  |                         |                      |          127.0.0.1:8080
  |                         |                      |                       |
  |                         |                      |          livinityd    |
  |                         |                      |          processes    |
  |                         |                      |          returns HTML |
  |                         |                      |                       |
  |                         |                      |<-- WS message --------|
  |                         |                      |  {                    |
  |                         |                      |    id: "req_abc123",  |
  |                         |                      |    status: 200,       |
  |                         |                      |    headers: {...},    |
  |                         |                      |    body: "<base64>"   |
  |                         |                      |  }                    |
  |                         |                      |                       |
  |<-----------------------------------------------|                       |
  |  200 OK + HTML                                 |                       |
```

### 3.2 WebSocket Upgrade Flow (tRPC subscriptions, voice)

```
Browser                      Relay                    User's LivOS
  |                            |                           |
  |  WS upgrade request        |                           |
  |  alice.livinity.io/trpc    |                           |
  |--------------------------->|                           |
  |                            |                           |
  |                  Extract subdomain: "alice"            |
  |                  Send WS control message:              |
  |                  {                                     |
  |                    type: "ws_upgrade",                 |
  |                    id: "ws_xyz789",                    |
  |                    path: "/trpc",                      |
  |                    headers: {...}                      |
  |                  }                                     |
  |                            |--- tunnel WS ----------->|
  |                            |                           |
  |                            |          Open local WS to |
  |                            |          127.0.0.1:8080   |
  |                            |          /trpc?token=...  |
  |                            |                           |
  |                            |<-- { type: "ws_ready",    |
  |                            |      id: "ws_xyz789" } ---|
  |                            |                           |
  |  Complete WS handshake     |                           |
  |<-------------------------->|                           |
  |                            |                           |
  |  WS frame (tRPC sub)       |                           |
  |--------------------------->|-- tunnel {type:"ws_frame", |
  |                            |   id:"ws_xyz789",         |
  |                            |   data:<base64>} -------->|
  |                            |                           |-- local WS
  |                            |                           |
  |                            |<-- {type:"ws_frame", ...} |
  |<---------------------------|                           |
  |  WS frame (tRPC response)  |                           |
```

### 3.3 App Subdomain Flow (e.g., immich.alice.livinity.app)

```
Browser                  Cloudflare           Relay                User's LivOS
  |                         |                   |                       |
  |  immich.alice           |                   |                       |
  |  .livinity.app          |                   |                       |
  |------------------------>|                   |                       |
  |                         |  *.livinity.app   |                       |
  |                         |  -> Server5 IP    |                       |
  |                         |------------------>|                       |
  |                         |                   |                       |
  |                    Parse: app="immich", user="alice"                |
  |                    Lookup alice's tunnel                            |
  |                    Forward with targetApp: "immich"                 |
  |                                             |                       |
  |                                             |--- WS message ------->|
  |                                             |  {                    |
  |                                             |    id: "req_...",     |
  |                                             |    method: "GET",     |
  |                                             |    path: "/",         |
  |                                             |    targetApp: "immich"|
  |                                             |  }                    |
  |                                             |                       |
  |                                             |     Tunnel client     |
  |                                             |     routes to immich  |
  |                                             |     container port    |
  |                                             |     (reuses existing  |
  |                                             |      app gateway      |
  |                                             |      port lookup)     |
  |                                             |                       |
  |<--------------------------------------------|                       |
  |  Immich web UI                              |                       |
```

---

## 4. Tunnel Protocol Specification

### 4.1 Connection Establishment

```
LivOS Client                                    Relay Server
    |                                                 |
    |  WS connect: wss://relay.livinity.io            |
    |             /tunnel/connect                      |
    |  Headers:                                       |
    |    Authorization: Bearer <tunnel_token>         |
    |    X-LivOS-Version: 8.0.0                       |
    |    X-Instance-Id: <uuid>                        |
    |------------------------------------------------>|
    |                                                 |
    |                              Verify token       |
    |                              (JWT verify +      |
    |                               Redis cache)      |
    |                              Extract username    |
    |                              Register in tunnel |
    |                              registry           |
    |                                                 |
    |  WS connected                                   |
    |  { type: "connected",                           |
    |    assignedUrl: "alice.livinity.io" }            |
    |<------------------------------------------------|
    |                                                 |
    |  Ping (every 30s)                               |
    |<----------------------------------------------->|
    |  Pong                                           |
```

### 4.2 Message Envelope Format

All messages are JSON. Binary bodies are base64-encoded.

**Request (relay -> client):**
```typescript
interface TunnelRequest {
  type: "http_request"
  id: string            // unique request ID (nanoid)
  method: string        // GET, POST, etc.
  path: string          // /path?query=string
  headers: Record<string, string | string[]>
  body: string | null   // base64-encoded if present
  targetApp?: string    // for app subdomain routing (e.g., "immich")
}
```

**Response (client -> relay):**
```typescript
interface TunnelResponse {
  type: "http_response"
  id: string            // matching request ID
  status: number        // HTTP status code
  headers: Record<string, string | string[]>
  body: string | null   // base64-encoded if present
}
```

**WebSocket Upgrade (relay -> client):**
```typescript
interface TunnelWsUpgrade {
  type: "ws_upgrade"
  id: string            // WebSocket session ID
  path: string
  headers: Record<string, string | string[]>
  targetApp?: string
}
```

**WebSocket Ready/Error (client -> relay):**
```typescript
interface TunnelWsReady {
  type: "ws_ready"
  id: string
}

interface TunnelWsError {
  type: "ws_error"
  id: string
  error: string
}
```

**WebSocket Frame (bidirectional):**
```typescript
interface TunnelWsFrame {
  type: "ws_frame"
  id: string            // WebSocket session ID
  data: string          // base64-encoded frame data
  binary: boolean       // was the original frame binary?
}

interface TunnelWsClose {
  type: "ws_close"
  id: string
  code?: number
  reason?: string
}
```

**Control Messages:**
```typescript
interface TunnelPing { type: "ping"; ts: number }
interface TunnelPong { type: "pong"; ts: number }
interface TunnelRelayShutdown { type: "relay_shutdown" }
```

### 4.3 Why JSON + Base64 (not binary framing)

For 50-100 concurrent tunnels, the overhead of base64 encoding (~33% size increase) is negligible compared to the complexity savings:

| Approach | Pros | Cons |
|----------|------|------|
| JSON + base64 | Debuggable, simple parser, human-readable logs | ~33% body size overhead |
| Binary framing (msgpack/protobuf) | Compact, efficient | Complex, hard to debug, overkill at this scale |
| Streaming chunks | Handles large files | Significantly more complex state machine |

**Recommendation:** Start with JSON + base64. If profiling shows body encoding is a bottleneck (unlikely at this scale), switch to binary WebSocket frames with a length-prefixed header protocol. This is a localized change in the serializer/deserializer only.

**Large body mitigation:** For file uploads >10MB, the tunnel client can stream the response in chunks using multiple `http_response_chunk` messages. This is a future optimization, not needed for MVP.

---

## 5. DNS and Routing Architecture

### 5.1 Cloudflare DNS Configuration

Two domains, two wildcard records:

```
livinity.io zone:
  *.livinity.io    A    <Server5 IP>   (proxied, orange cloud ON)
  livinity.io      A    <Server5 IP>   (proxied)

livinity.app zone:
  *.livinity.app   A    <Server5 IP>   (proxied, orange cloud ON)
```

**Confidence: HIGH** -- Cloudflare documentation explicitly states "wildcard DNS records can be either proxied or DNS-only" on all plan levels. A wildcard record applies only when no exact record exists at the queried name.

**Cloudflare proxy benefits:**
- DDoS protection for the relay server
- SSL termination at edge (free Universal SSL covers wildcard)
- HTTP/2 and HTTP/3 to browser automatically
- Caching for static assets
- Hides Server5's real IP address

### 5.2 Subdomain Parsing Logic

```
Request arrives at relay:

  Host: alice.livinity.io
  -> domain = "livinity.io"
  -> subdomain = "alice"
  -> tunnelKey = "alice"
  -> route to alice's tunnel

  Host: immich.alice.livinity.app
  -> domain = "livinity.app"
  -> parts = ["immich", "alice"]
  -> username = "alice" (rightmost before domain)
  -> appName = "immich" (leftmost)
  -> tunnelKey = "alice"
  -> forward with targetApp = "immich"

  Host: livinity.io (no subdomain)
  -> route to Next.js app (marketing/dashboard)

  Host: www.livinity.io
  -> redirect to livinity.io (or route to Next.js)
```

**Implementation note:** The relay must differentiate between livinity.io (no subdomain -> Next.js) and alice.livinity.io (subdomain -> tunnel). This is handled at the Caddy level: Caddy routes `livinity.io` to Next.js (:3000) and `*.livinity.io` to the relay (:4000).

### 5.3 Caddy Configuration on Server5

```caddyfile
# Main website -- routes to Next.js
livinity.io {
    reverse_proxy 127.0.0.1:3000
}

# User tunnel subdomains -- routes to relay
*.livinity.io {
    reverse_proxy 127.0.0.1:4000
}

# App tunnel subdomains -- routes to relay
*.livinity.app {
    reverse_proxy 127.0.0.1:4000
}
```

**Note on TLS:** Since Cloudflare proxy is enabled, Cloudflare terminates the browser's TLS connection and establishes a separate TLS connection to Caddy. Use Cloudflare's "Full (strict)" SSL mode so Caddy must have valid certificates. Caddy's automatic HTTPS with Let's Encrypt handles this. For wildcards, Caddy will need DNS challenge via Cloudflare API (same pattern already used for multi-user mode on Server4 -- the `caddy` binary with `dns.providers.cloudflare` module).

---

## 6. Authentication and Security

### 6.1 Tunnel Token Flow

```
1. User creates account on livinity.io
2. User installs LivOS on their server
3. User goes to LivOS Settings > Platform > Connect
4. User enters livinity.io credentials or pastes a "connection code"
5. LivOS calls livinity.io API: POST /api/tunnel/register
   - Body: { connectionCode: "..." } or { email, password }
   - Response: { tunnelToken: "...", assignedUrl: "alice.livinity.io" }
6. LivOS stores tunnel token in Redis: livos:tunnel:token
7. Tunnel client connects to relay with this token
8. Relay verifies token, registers tunnel
```

**Tunnel tokens:**
- JWT signed by livinity.io's secret
- Payload: `{ userId, username, instanceId, iat, exp }`
- Long-lived (90 days) with refresh mechanism
- Revocable via livinity.io dashboard (stored in DB with `revoked` flag)
- Relay checks token on each connection, caches validation in Redis (5 min TTL)

### 6.2 Security Boundaries

```
                    TRUST BOUNDARY
                         |
    Public Internet      |      Private (relay internal)
                         |
    Browser ----HTTPS--->| Cloudflare --HTTPS--> Caddy --HTTP--> Relay
                         |                                         |
                         |                        Authenticated    |
                         |                        WebSocket (WSS)  |
                         |                        (tunnel token)   |
                         |                              |          |
                         |                              v          |
                         |                        User's LivOS    |
                         |                        (own auth)       |
```

**Key security properties:**
- Relay NEVER stores user data -- it is a dumb pipe
- Each LivOS instance has its own authentication (JWT, sessions)
- Tunnel tokens are separate from LivOS user tokens
- A compromised relay cannot access LivOS admin functions (no credentials pass through the relay itself; browser auth cookies go to the user's LivOS through the tunnel)
- Rate limiting on relay: max requests per tunnel per second (configurable, default 100 req/s)
- Max WebSocket message size: 50MB (prevents memory abuse)
- Connection limit: 1 tunnel per username (prevents connection storms)

### 6.3 What the relay CAN see (and mitigation)

The relay can see:
- HTTP headers (including cookies) in transit
- Request/response bodies (base64 encoded but not encrypted)

**Mitigation:**
- Relay is self-operated (you control the server)
- Cloudflare terminates external TLS; Caddy terminates for relay
- The tunnel WebSocket itself runs over TLS (wss://)
- For additional security (future): end-to-end encryption between browser and LivOS using client-side encryption layer

---

## 7. Integration Points with Existing LivOS

### 7.1 Existing Components -- NO Changes Needed

| Component | Why No Change |
|-----------|---------------|
| livinityd HTTP server (:8080) | Tunnel client proxies to it as-is; livinityd sees normal HTTP requests from 127.0.0.1 |
| App gateway middleware (`server/index.ts`) | Already handles subdomain-based routing; tunnel client can reuse the same port-lookup logic for targetApp routing |
| Caddy (on user's server) | Still handles local HTTPS; tunnel client bypasses Caddy and talks directly to :8080 |
| Redis | Tunnel client uses existing Redis connection for config storage |
| tRPC router | No changes; requests arrive normally via HTTP |
| WebSocket handlers (tRPC WS, terminal, voice) | No changes; tunnel client opens local WS connections that livinityd handles normally |
| Docker apps | No changes; accessed through existing port-based routing |
| PostgreSQL (user's server) | No changes; platform has its own DB on Server5 |

### 7.2 Existing Components -- Minor Additions

| Component | Change | Reason |
|-----------|--------|--------|
| `livos/packages/livinityd/source/modules/domain/` | Add `platform-tunnel.ts` module alongside existing `tunnel.ts` (Cloudflare Tunnel) | New module for Livinity Platform tunnel client (distinct from Cloudflare Tunnel) |
| `livos/packages/livinityd/source/modules/server/trpc/` | Add tRPC routes for platform connection settings | Enable/disable tunnel, enter connection code, show status |
| `livos/packages/ui/src/routes/settings/` | Add "Platform" section in Settings UI | UI for connecting to livinity.io |
| `@livos/config` (`livos/packages/config/src/domains.ts`) | Add `platform` and `relay` domain entries | `relay: 'relay.livinity.io'`, `platform: 'livinity.io'` |

### 7.3 New Components

| Component | Location | Type |
|-----------|----------|------|
| Relay Server | New directory: `platform/relay/` in monorepo (or separate repo) | Standalone Node.js/TypeScript process |
| livinity.io | New directory: `platform/web/` in monorepo (or separate repo) | Next.js 15 application |
| Platform DB schema | Part of livinity.io codebase | PostgreSQL tables for users, tunnels, instances |
| Tunnel Client | `livos/packages/livinityd/source/modules/platform/` | New livinityd module |
| Shared types | `platform/shared/` or `@livinity/tunnel-protocol` package | TypeScript interfaces for tunnel messages |

---

## 8. Database Schema (livinity.io -- Server5)

```sql
-- Platform database (separate from LivOS database on user's server)
-- This runs on Server5, NOT on user's servers

CREATE TABLE platform_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,  -- becomes subdomain
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tunnel_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE,
    instance_id UUID UNIQUE NOT NULL,       -- LivOS instance identifier
    tunnel_token_hash VARCHAR(255) NOT NULL, -- hashed for security
    assigned_url VARCHAR(255) NOT NULL,      -- e.g., alice.livinity.io
    status VARCHAR(20) DEFAULT 'disconnected', -- connected/disconnected/revoked
    livos_version VARCHAR(20),
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)  -- one tunnel per user initially
);

CREATE TABLE tunnel_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES tunnel_instances(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Future: app-specific subdomain reservations
CREATE TABLE app_subdomains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES tunnel_instances(id) ON DELETE CASCADE,
    app_id VARCHAR(64) NOT NULL,       -- e.g., "immich"
    subdomain VARCHAR(64) NOT NULL,    -- e.g., "immich" -> immich.alice.livinity.app
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instance_id, app_id)
);
```

---

## 9. Relay Server Internal Architecture

### 9.1 Module Structure

```
platform/relay/
  src/
    index.ts              -- Entry point, starts HTTP server
    server.ts             -- HTTP server: request handling and routing
    tunnel-registry.ts    -- Map of username -> WebSocket connection
    request-proxy.ts      -- Serializes HTTP req, sends through tunnel, awaits response
    ws-proxy.ts           -- Handles WebSocket upgrade proxying through tunnel
    auth.ts               -- Token verification (JWT verify + Redis cache)
    subdomain-parser.ts   -- Extract username and appName from Host header
    health.ts             -- Health check endpoint (/health)
    metrics.ts            -- Connection count, request latency (simple in-memory)
    protocol.ts           -- TypeScript interfaces for tunnel messages (shared)
    config.ts             -- Environment-based configuration
  package.json
  tsconfig.json
```

### 9.2 Request Processing Pipeline (Pseudocode)

```typescript
// Simplified relay server logic

const tunnels = new Map<string, WebSocket>()  // username -> ws
const pending = new Map<string, { res: http.ServerResponse, timeout: NodeJS.Timeout }>()

httpServer.on('request', async (req, res) => {
  const host = req.headers.host
  const { username, appName, domain } = parseHost(host)

  // No subdomain -> this request is for the main site (shouldn't reach relay
  // if Caddy is configured correctly, but handle gracefully)
  if (!username) {
    return res.writeHead(404).end('Not found')
  }

  // Find tunnel
  const tunnel = tunnels.get(username)
  if (!tunnel || tunnel.readyState !== WebSocket.OPEN) {
    return res.writeHead(502).end('Tunnel offline')
  }

  // Serialize request
  const requestId = nanoid()
  const body = await collectBody(req)  // Buffer -> base64

  const message: TunnelRequest = {
    type: 'http_request',
    id: requestId,
    method: req.method,
    path: req.url,
    headers: req.headers,
    body: body ? body.toString('base64') : null,
    targetApp: appName || undefined,
  }

  // Track pending request with timeout
  const timeout = setTimeout(() => {
    pending.delete(requestId)
    if (!res.headersSent) res.writeHead(504).end('Tunnel timeout')
  }, 30_000)

  pending.set(requestId, { res, timeout })

  // Send through tunnel
  tunnel.send(JSON.stringify(message))
})

// Handle tunnel responses
function handleTunnelMessage(username: string, data: string) {
  const msg = JSON.parse(data)

  if (msg.type === 'http_response') {
    const p = pending.get(msg.id)
    if (!p) return  // already timed out
    clearTimeout(p.timeout)
    pending.delete(msg.id)

    p.res.writeHead(msg.status, msg.headers)
    if (msg.body) {
      p.res.end(Buffer.from(msg.body, 'base64'))
    } else {
      p.res.end()
    }
  }
}
```

### 9.3 WebSocket Upgrade Handling (Pseudocode)

```typescript
httpServer.on('upgrade', (req, socket, head) => {
  const { username, appName } = parseHost(req.headers.host)

  // Tunnel client connection (not proxied traffic)
  if (req.url?.startsWith('/tunnel/connect')) {
    return handleTunnelConnect(req, socket, head)
  }

  // Proxied WebSocket: browser wants to connect to user's LivOS
  const tunnel = tunnels.get(username)
  if (!tunnel || tunnel.readyState !== WebSocket.OPEN) {
    socket.destroy()
    return
  }

  // Send upgrade request through tunnel
  const wsId = nanoid()
  const upgradeMsg: TunnelWsUpgrade = {
    type: 'ws_upgrade',
    id: wsId,
    path: req.url,
    headers: req.headers,
    targetApp: appName,
  }

  // Store pending upgrade, wait for client to confirm local WS is ready
  wsUpgradePending.set(wsId, { req, socket, head })
  tunnel.send(JSON.stringify(upgradeMsg))

  // Timeout: if client doesn't respond in 10s, destroy socket
  setTimeout(() => {
    if (wsUpgradePending.has(wsId)) {
      wsUpgradePending.delete(wsId)
      socket.destroy()
    }
  }, 10_000)
})
```

---

## 10. Reliability and Resilience

### 10.1 Tunnel Reconnection (Client Side)

```
Connection lost
  |
  Wait 1s + jitter(0-1s)
  |
  Attempt reconnect
  |
  Failed? Wait 2s + jitter -> retry
  |
  Failed? Wait 4s + jitter -> retry
  |
  ...
  |
  Max backoff: 60s
  |
  After 10 consecutive failures: log error, update Redis status, notify LivOS UI
  |
  Continue retrying indefinitely (relay may be temporarily down)
```

**Jitter:** Random 0-1s added to each wait to prevent thundering herd when relay restarts and all clients reconnect simultaneously.

### 10.2 Heartbeat Protocol

- Relay sends WebSocket ping frame every 30 seconds
- Client must respond with pong within 10 seconds
- If no pong received, relay considers tunnel dead, removes from registry
- Client also sends application-level `{type:"ping", ts:...}` every 30s as a backup
- If client receives no messages for 90 seconds, it initiates reconnect

### 10.3 Graceful Shutdown

**Relay shutdown:**
1. Stop accepting new tunnel connections
2. Send `{type: "relay_shutdown"}` to all connected tunnels
3. Wait 5 seconds for in-flight requests to complete
4. Close all WebSocket connections
5. Exit

**Client disconnect:**
1. Send WebSocket close frame with code 1000 (normal closure)
2. Relay removes from registry immediately
3. Pending requests get 502 response

### 10.4 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Tunnel WebSocket drops mid-request | Relay removes from registry; pending requests get 502; client auto-reconnects |
| Relay process crashes | All tunnels disconnect; PM2 restarts relay; all clients auto-reconnect |
| User's livinityd down | Client stays connected to relay but local HTTP requests fail; relay sends 502 to browser |
| Cloudflare outage | Traffic stops reaching relay; tunnels stay connected (WS is direct); no impact on tunnel WS connections |
| Invalid tunnel token | Relay rejects WS with 4001 close code; client shows error in Settings UI |
| Request timeout (30s) | Relay sends 504 to browser; logs the timeout event |
| Token expired | Client receives `{type: "token_expired"}`; client attempts refresh via livinity.io API |

---

## 11. Scalability Considerations

| Concern | 50 tunnels (v1) | 500 tunnels | 5,000 tunnels |
|---------|-----------------|-------------|---------------|
| Memory | ~50MB (trivial) | ~200MB | ~1GB, needs monitoring |
| WebSocket connections | Single process fine | Single process fine | Consider clustering |
| Request throughput | No bottleneck | Profile serialization | Binary protocol, worker threads |
| DNS | Wildcard covers all | Same | Same |
| Database | Single PostgreSQL | Same | Connection pooling |
| Relay instances | 1 | 1 | 2+ with Redis-backed registry |

**Scale-up path (when needed, not now):**
1. Move tunnel registry from in-memory Map to Redis (enables multi-instance)
2. Run multiple relay instances behind a load balancer
3. Use consistent hashing on username to route subdomains to relay instances
4. Switch from JSON+base64 to binary protocol for large bodies
5. Add chunked streaming for file uploads/downloads

---

## 12. Suggested Build Order

Based on dependencies and the ability to test incrementally:

### Phase 1: Relay Server Core + Tunnel Client

Build the relay and client first, test with hardcoded auth.

1. **Relay HTTP server skeleton** -- Accept connections, parse Host header, return static responses
2. **Tunnel WebSocket endpoint** -- Accept WS connections at `/tunnel/connect` with hardcoded token
3. **Request proxy** -- Serialize incoming HTTP, send through tunnel WS, collect and return response
4. **LivOS tunnel client module** -- WebSocket connection to relay, request handler, reconnection logic
5. **Manual end-to-end test** -- curl -> relay -> tunnel -> livinityd -> response (using localhost or direct IP)

### Phase 2: DNS, TLS, and Subdomain Routing

Wire up the networking on Server5.

1. **Cloudflare wildcard DNS** -- Set up `*.livinity.io` and `*.livinity.app` A records pointing to Server5
2. **Caddy on Server5** -- Wildcard TLS with DNS challenge, route `livinity.io` to :3000 and `*.livinity.io`/`*.livinity.app` to :4000
3. **Subdomain parsing in relay** -- Handle both `user.livinity.io` and `app.user.livinity.app` patterns
4. **End-to-end test** -- Real domain, real TLS: browser -> alice.livinity.io -> relay -> tunnel -> Server4 livinityd

### Phase 3: livinity.io Next.js App

Build the platform website with auth and tunnel provisioning.

1. **Basic Next.js app** -- Marketing pages, auth (register/login), PostgreSQL schema
2. **Tunnel provisioning API** -- Register instance, issue JWT tunnel token, store in DB
3. **Dashboard** -- Show tunnel status (connected/disconnected), assigned URL
4. **Redis integration** -- Publish tunnel commands to relay, subscribe to status updates
5. **Settings UI in LivOS** -- "Connect to Livinity Platform" flow with connection code

### Phase 4: WebSocket Proxy Support

Enable tRPC subscriptions, voice, and terminal through the tunnel.

1. **WebSocket upgrade handling in relay** -- Detect WS upgrade, forward through tunnel protocol
2. **WebSocket proxy in tunnel client** -- Open local WS, bidirectional frame relay
3. **Test tRPC subscriptions** -- Verify real-time updates work through tunnel
4. **Test voice WebSocket** -- Verify voice proxy works through tunnel

### Phase 5: App Subdomain Routing

Enable Docker app access through dedicated subdomains.

1. **Two-level subdomain parsing** -- `app.user.livinity.app` pattern in relay
2. **App routing in tunnel client** -- Use `targetApp` field to route to correct Docker container port
3. **App discovery on dashboard** -- livinity.io shows user's installed apps with direct links
4. **End-to-end test** -- immich.alice.livinity.app -> Immich on alice's server

---

## 13. Technology Recommendations

### Relay Server

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| Node.js | 22 LTS | Runtime | Matches existing LivOS stack; proven for WebSocket |
| TypeScript | 5.x | Language | Consistency with LivOS codebase |
| ws | 8.x | WebSocket server | Already used in livinityd (`server/index.ts`); battle-tested |
| nanoid | 5.x | Request ID generation | Fast, URL-friendly, collision-resistant |
| jsonwebtoken | 9.x | Token verification | Already used in LivOS |
| ioredis | 5.x | Redis client | Already used throughout LivOS |

### livinity.io

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| Next.js | 15 | Web framework | App Router, RSC, Server Actions, SSG for marketing pages |
| React | 19 | UI library | Pairs with Next.js 15 |
| Tailwind CSS | 4 | Styling | Consistent with LivOS UI design language |
| shadcn/ui | latest | Components | Consistent with LivOS UI; reuse design tokens |
| Drizzle ORM | latest | Database | Type-safe, lightweight, good Next.js integration |
| PostgreSQL | 16 | Database | Already proven in LivOS stack |
| Redis (ioredis) | 5.x | Session/state | Communication with relay, caching |
| bcrypt | latest | Password hashing | Standard for auth |

### LivOS Tunnel Client

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| ws | 8.x | WebSocket client | Already a dependency of livinityd |
| Built-in http module | -- | Local HTTP proxy | No additional deps needed |

---

## 14. Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding relay in Next.js

**What:** Running the relay WebSocket server inside Next.js's custom server.
**Why bad:** Next.js custom servers are fragile, restart on code changes, and the relay's long-lived WebSocket connections would be disrupted by deployments. Next.js GitHub discussion #58698 confirms WebSocket support is not a first-class feature.
**Instead:** Run relay as a separate process, communicate via Redis pub/sub.

### Anti-Pattern 2: Polling for tunnel status

**What:** Next.js dashboard polling the relay via HTTP to check if a tunnel is connected.
**Why bad:** Adds unnecessary load, introduces latency, stale data.
**Instead:** Relay publishes status changes to Redis pub/sub; Next.js queries Redis on page load and subscribes for updates.

### Anti-Pattern 3: Storing request bodies in Redis

**What:** Using Redis as an intermediary buffer for request/response bodies between relay and tunnel.
**Why bad:** Redis is not designed for large binary payloads; adds latency and memory pressure.
**Instead:** Request/response bodies flow directly through the WebSocket tunnel connection (in-memory, never persisted).

### Anti-Pattern 4: Per-user DNS records

**What:** Creating individual Cloudflare DNS A records for each user (alice.livinity.io, bob.livinity.io, etc.).
**Why bad:** Unnecessary Cloudflare API calls, DNS propagation delays, management overhead, Cloudflare rate limits.
**Instead:** Single wildcard DNS record (`*.livinity.io`) -- all subdomains resolve to Server5; routing happens at the relay application layer.

### Anti-Pattern 5: End-to-end encryption in MVP

**What:** Implementing E2E encryption between browser and LivOS through the tunnel from day one.
**Why bad:** Significant complexity (key exchange, certificate management, client-side crypto) for minimal benefit when the relay is self-operated and all links use TLS.
**Instead:** TLS between browser<->Cloudflare, TLS between Cloudflare<->Caddy, WSS between relay<->LivOS client. Sufficient when you control the relay server. Add E2E later as an advanced security feature.

### Anti-Pattern 6: Separate tunnel client process

**What:** Running the tunnel client as its own PM2 process alongside livinityd.
**Why bad:** Extra process management, extra deployment step, duplicated Redis/config access, harder to coordinate lifecycle.
**Instead:** Implement as a module inside livinityd -- shares event loop, config, Redis connection, logger. The tunnel client is lightweight (one WS connection + HTTP forwarding).

---

## 15. Open Questions for Phase-Specific Research

### Resolved by this research:

- **Q: Should relay be embedded in Next.js?** A: No. Separate process. (Section 2.1)
- **Q: Per-user DNS or wildcard?** A: Wildcard. No per-user DNS needed. (Section 5.1)
- **Q: Binary or JSON protocol?** A: JSON + base64 for MVP. Binary later if needed. (Section 4.3)
- **Q: Separate process or livinityd module for client?** A: Module inside livinityd. (Section 2.3)
- **Q: How does Next.js talk to relay?** A: Redis pub/sub. (Section 2.2)

### Remaining questions for later phases:

- **Username validation rules:** What characters are allowed? Length limits? Reserved words (admin, www, api, etc.)? (affects subdomain validity)
- **Rate limiting strategy:** Per-tunnel rate limits, global rate limits, how to handle abuse from a single tunnel
- **Multi-instance support:** Should one user connect multiple LivOS instances? (not in v1, but architecture should not preclude it -- change UNIQUE constraint)
- **Offline page:** What does the relay serve when a tunnel is disconnected? Custom branded page? Simple 502?
- **Monitoring and observability:** What metrics to expose? Prometheus endpoint? Simple JSON /health?
- **Deployment automation for Server5:** PM2, Docker Compose, or systemd for relay + Next.js?
- **Connection code UX:** One-time code vs. email/password login in LivOS Settings?

---

## Sources

- [Cloudflare Wildcard DNS Records Documentation](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) -- HIGH confidence (official Cloudflare docs)
- [Cloudflare API: Create DNS Record](https://developers.cloudflare.com/api/node/resources/dns/subresources/records/methods/create/) -- HIGH confidence (official Cloudflare API docs)
- [Self-Hosted Ngrok Alternative in 200 Lines of Node.js](https://dev.to/lasisi_ibrahimpelumi_dc0/building-your-own-ngrok-alternative-in-200-lines-of-nodejs-28of) -- MEDIUM confidence (verified architecture pattern against multiple sources)
- [Pipenet (TypeScript tunnel, modernized fork of localtunnel)](https://github.com/punkpeye/pipenet) -- MEDIUM confidence (verified architecture, TypeScript reference implementation)
- [Awesome Tunneling - Comprehensive list of self-hosted tunnel solutions](https://github.com/anderspitman/awesome-tunneling) -- MEDIUM confidence (curated ecosystem list)
- [Next.js GitHub Discussion #58698: WebSocket support in route handlers](https://github.com/vercel/next.js/discussions/58698) -- HIGH confidence (official Next.js discussion confirming limitation)
- [localtunnel/server](https://github.com/localtunnel/server) -- MEDIUM confidence (reference architecture for subdomain-based tunnel routing)
- [How to Programmatically Add DNS Records to Cloudflare in Node](https://www.buildwithmatija.com/blog/how-to-programmatically-add-dns-records-to-cloudflare-in-node) -- MEDIUM confidence (tutorial with Cloudflare SDK examples)
- Existing LivOS codebase analysis (`server/index.ts` lines 182-519, `domain/tunnel.ts`, `domain/caddy.ts`, `config/domains.ts`) -- HIGH confidence (direct code reading)

---

*Architecture research: 2026-03-17*
