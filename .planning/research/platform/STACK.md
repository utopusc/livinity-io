# Tech Stack Research: Livinity Platform v8.0

**Domain:** Tunnel relay + SaaS platform (livinity.io)
**Researched:** 2026-03-17
**Confidence:** HIGH (based on current GitHub stats, official docs, and 2025-2026 community consensus)

---

## 1. Tunnel Relay

### Candidates Evaluated

#### frp (Fast Reverse Proxy)
- **Language:** Go
- **GitHub:** ~90,000 stars (most adopted self-hosted tunnel project by far)
- **HTTP/WebSocket support:** Yes — native HTTP and HTTPS proxy modes, WebSocket passes through transparently
- **Bandwidth limiting:** Yes — `transport.bandwidthLimit` per proxy, configurable in KB or MB units
- **Bandwidth metering (per-user counting):** No native support. The server plugin system fires HTTP webhooks on six events: `Login`, `NewProxy`, `CloseProxy`, `Ping`, `NewWorkConn`, `NewUserConn`. None of these events carry traffic/bytes data. Per-user bandwidth counting must be implemented externally by wrapping frp traffic at the OS or proxy layer.
- **Reconnection:** Built-in heartbeat + auto-reconnect on the frpc client side
- **Connection multiplexing:** Yes — `mux` over a single TCP connection
- **Config:** TOML files on both server and client. Per-user isolation requires one frpc config per user or use of the `metadatas` field to tag connections.
- **Verdict:** Excellent general relay, but bandwidth metering requires a separate layer (e.g., intercepting proxy or iptables accounting). Adds Go binary deployment complexity to the LivOS client side.

#### rathole
- **Language:** Rust
- **GitHub:** ~12,400 stars, last updated July 2025
- **HTTP/WebSocket support:** Yes — HTTP and WebSocket tunneling supported
- **Performance:** Lower memory footprint than frp; benchmarks show higher connection throughput and similar latency
- **Bandwidth metering:** No built-in per-user metering. The project is leaner than frp and has no plugin system at all. External metering is harder than with frp.
- **Config:** TOML. Requires one config section per service (tunnel).
- **Verdict:** Better raw performance than frp, but fewer ecosystem integrations and no plugin hooks at all. Inappropriate for a managed multi-user platform without significant custom wrapping.

#### bore
- **Language:** Rust
- **GitHub:** ~9,000 stars
- **HTTP/WebSocket support:** TCP only. bore tunnels raw TCP — HTTP and WebSocket work because they run over TCP, but there is no application-layer awareness (no Host header rewriting, no subdomain routing).
- **Bandwidth metering:** No.
- **Verdict:** Minimal viable tool for developer use. Not suitable for a multi-tenant platform that needs HTTP-level subdomain routing and per-user metering.

#### Custom Node.js WebSocket Relay
- **Language:** TypeScript/Node.js
- **HTTP/WebSocket support:** Full control — can handle HTTP, HTTPS upgrades, WebSocket, and SSE natively using Node.js streams
- **Bandwidth metering:** First-class — every `data` event on a socket emits byte counts. `socket.bytesRead` and `socket.bytesWritten` give cumulative totals at any time. Per-connection metering is trivial.
- **Reconnection:** Implement with exponential backoff; standard pattern in ~30 lines
- **Connection multiplexing:** Implement with a logical channel layer over WebSocket (e.g., assign numeric channel IDs to concurrent HTTP requests over one WS connection)
- **Subdomain routing:** Native — parse the `Host` header, look up user, route to the correct upstream WS connection
- **Integration with platform:** Runs in the same Node.js process as the Next.js API backend or as a standalone service in the same monorepo, sharing PostgreSQL and Redis directly
- **Operational complexity:** No extra binaries to distribute. The LivOS client only needs a small Node.js script (or a compiled pkg binary) to establish the WebSocket connection.
- **Verdict:** More implementation work than frp (~800-1200 lines), but uniquely suited to this use case: built-in bandwidth metering, direct DB access for auth/session validation, no extra binary dependencies, and full control over WebSocket upgrade handling.

### Recommendation: Custom Node.js WebSocket Relay

For the Livinity Platform use case, a custom relay is the correct choice. The reasons:

1. frp and rathole do not expose per-user traffic byte counts via any hook. Bolting on external metering (iptables, tc) is fragile and requires root-level OS configuration that is harder to maintain and deploy.
2. The relay must validate API keys before accepting connections. A custom relay checks the key against PostgreSQL directly (or via a Redis cache). frp's `Login` plugin hook can reject connections but cannot easily enforce per-user quotas in real time.
3. The relay must route `{app}.{username}.livinity.io` → the correct WebSocket tunnel. This is application-layer HTTP routing logic. frp's subdomains feature can do basic virtual hosting but routing based on a two-level subdomain pattern (`app.user`) requires custom frps configuration or a reverse proxy in front, which eliminates frp's simplicity advantage.
4. The relay runs on Server5 alongside the Next.js platform. A Node.js service shares the same process manager (PM2), the same Redis instance, and the same PostgreSQL connection pool without cross-process RPC.

**Implementation pattern:**

```
LivOS client (frp-client replacement, ~200 lines TS)
  → establishes WS to wss://relay.livinity.io/tunnel
  → sends auth frame: { apiKey, userId }
  → enters receive loop: server forwards incoming HTTP requests as JSON frames
  → client pipes response back through WS as frames

Relay server (Node.js, ~600-800 lines TS)
  → listens on :443 (behind Caddy) at /tunnel (WS upgrade)
  → maintains Map<userId, WebSocket> of active tunnels
  → also listens on :80/:443 for subdomain requests
  → on incoming {user}.livinity.io request: look up tunnel, forward as frame
  → on each data chunk: atomically INCR redis key bandwidth:{userId}:{YYYY-MM}
  → every 60s: flush Redis counters to PostgreSQL usage table
```

**Libraries for custom relay:**
- `ws` (npm) — WebSocket server and client, production-grade, no deps
- `http-proxy` or manual `net.connect` piping — for forwarding HTTP to the tunnel connection
- `ioredis` — already used in LivOS, same instance for bandwidth counters
- `pg` / connection pool shared with Next.js API

---

## 2. Next.js Platform (livinity.io)

### Framework

**Next.js 15 with App Router** — confirmed choice. Key characteristics relevant to this project:
- Server Components reduce client JS bundle for the marketing/landing pages
- Server Actions allow form submissions (registration, API key generation) without separate API route files
- Route Handlers (`app/api/*/route.ts`) for programmatic endpoints (tunnel auth, webhook receivers)
- Edge Runtime available for middleware (subdomain redirect logic) but avoid it for DB-heavy routes

### Authentication

**Recommendation: Better Auth**

The auth landscape changed significantly in late 2025:
- Lucia Auth was deprecated in early 2025 and is no longer viable for new projects
- Auth.js (formerly NextAuth.js) v5 development team joined Better Auth in September 2025. Auth.js continues to receive security patches but Better Auth is now the forward-looking choice.
- Better Auth provides: plugin ecosystem (2FA, magic links, passkeys as opt-in modules), built-in rate limiting and CSRF protection, first-class TypeScript types, Drizzle and Prisma adapters, and framework-agnostic design

**Better Auth setup for Livinity:**
```typescript
// lib/auth.ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [/* apiKey plugin, emailVerification */],
})
```

**Why not custom JWT:** Handling token rotation, session invalidation, CSRF, and secure cookie configuration correctly requires significant implementation. For a freemium SaaS, the time is better spent on tunnel and routing logic.

**Why not Auth.js v5:** Still works and is well-documented, but Better Auth has a cleaner API, better TypeScript inference, and is the actively developed successor. Both are viable — Better Auth is preferred for greenfield.

### Database ORM

**Recommendation: Drizzle ORM**

| Factor | Drizzle | Prisma |
|---|---|---|
| Bundle size | ~7.4 KB gzipped | ~400 KB+ (includes query engine binary) |
| Cold start | ~50ms | ~400-1100ms |
| Type inference | Instant, from schema | Requires `prisma generate` step |
| PostgreSQL support | Excellent — arrays, JSON ops, custom types feel natural | Good, but multi-DB abstraction limits pg-specific features |
| Migrations | `drizzle-kit` generate + push | `prisma migrate` |
| Learning curve | Higher — SQL-like API | Lower — more abstracted |
| Edge/serverless | Works natively, no binary | Requires Prisma 7+ for edge, still larger |

For a freemium SaaS running on a VPS (Server5, not serverless), cold start differences are negligible. The primary reason to choose Drizzle is the instant TypeScript inference and the PostgreSQL-native API, which matters when writing bandwidth usage queries with `SUM`, window functions, and upsert patterns.

**Schema preview:**
```typescript
// db/schema.ts
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  keyHash: text("key_hash").notNull(),    // bcrypt hash, never store raw
  prefix: text("prefix").notNull(),       // first 8 chars for display
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
})

export const bandwidthUsage = pgTable("bandwidth_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  periodMonth: text("period_month").notNull(),   // "2026-03"
  bytesIn: bigint("bytes_in", { mode: "number" }).default(0),
  bytesOut: bigint("bytes_out", { mode: "number" }).default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({ uniq: unique().on(t.userId, t.periodMonth) }))
```

### Email

**Recommendation: Resend**

- Managed transactional email API (HTTP), not SMTP library
- Native Next.js integration: official `@react-email/react` + `resend` SDK, templates written as React components
- Deliverability: managed dedicated IPs with automatic warmup
- Free tier: 3,000 emails/month (sufficient for v8.0 launch)
- DX: `await resend.emails.send({ from, to, subject, react: <VerifyEmail token={t} /> })`

**Why not Nodemailer:** Nodemailer is a transport-layer SMTP library. Using it requires selecting and configuring an SMTP provider anyway. Resend abstracts the provider entirely and handles bounces, retries, and reputation management. Nodemailer is appropriate when you must talk to a specific internal SMTP server — not for a developer SaaS.

### UI Components

**Tailwind CSS 3.4 + shadcn/ui** — consistent with the existing LivOS codebase. Avoids introducing a second design system.

Note: LivOS uses Tailwind 3.4 with the existing shadcn component set. The platform site should import the same `tailwind.config` tokens (colors, font stack) from a shared config package to maintain visual consistency between the LivOS dashboard and the livinity.io marketing/dashboard pages.

---

## 3. DNS Management

### Architecture

On each new user registration, the platform provisions:
1. An A record: `{username}.livinity.io` → Server5 IP (45.137.194.102)
2. A wildcard A record: `*.{username}.livinity.io` → Server5 IP

Both records are non-proxied (grey cloud). Cloudflare does not proxy wildcard records, and even if it did, the Caddy DNS-01 challenge requires DNS-01 tokens to be reachable via Cloudflare's DNS, which works fine without proxying.

### Cloudflare Node.js SDK

```typescript
import Cloudflare from "cloudflare"

const cf = new Cloudflare({ apiToken: process.env.CF_API_TOKEN })

async function provisionUserDNS(username: string, serverIp: string) {
  const zoneId = process.env.CF_ZONE_ID  // zone ID for livinity.io

  // 1. {username}.livinity.io → Server5
  await cf.dns.records.create({
    zone_id: zoneId,
    type: "A",
    name: `${username}.livinity.io`,
    content: serverIp,
    ttl: 1,      // 1 = automatic TTL
    proxied: false,
  })

  // 2. *.{username}.livinity.io → Server5
  await cf.dns.records.create({
    zone_id: zoneId,
    type: "A",
    name: `*.${username}.livinity.io`,
    content: serverIp,
    ttl: 1,
    proxied: false,
  })
}
```

**API Token scopes required:** `Zone:DNS:Edit` for the `livinity.io` zone only. Do not use a Global API Key.

**Propagation:** Cloudflare's DNS propagation is near-instant globally (typically < 30 seconds). However, Caddy's On-Demand TLS certificate request happens on first connection, so the DNS record must exist before the first HTTPS request to that subdomain.

**Cleanup on account deletion:** Store the Cloudflare DNS record IDs in the PostgreSQL `dns_records` table at provisioning time so they can be deleted via `cf.dns.records.delete(zoneId, recordId)` on account teardown.

---

## 4. SSL/TLS

### Architecture

Caddy v2 (already deployed on Server5 at `/usr/bin/caddy` with the Cloudflare DNS module) handles all TLS automatically.

**Two certificate types are needed:**

1. **Static wildcard: `*.livinity.io`** — covers `livinity.io`, `www.livinity.io`, `relay.livinity.io`, and first-level user subdomains like `alice.livinity.io`. Obtained once at startup via DNS-01 challenge. Renewed automatically by Caddy every ~60 days.

2. **On-Demand TLS for nested wildcards** — covers `{app}.{username}.livinity.io`. Because this is a second-level subdomain under `livinity.io`, a single `*.livinity.io` wildcard does NOT cover it (wildcards are only one level deep). Each `*.{username}.livinity.io` pattern requires its own certificate. Caddy's On-Demand TLS obtains each certificate on the first TLS handshake to that subdomain, verified via an `ask` endpoint.

### Caddy Configuration

```
{
  on_demand_tls {
    ask http://localhost:8080/api/tls/authorize
    interval 2m
    burst 5
  }
}

*.livinity.io, livinity.io {
  tls {
    dns cloudflare {env.CF_API_TOKEN}
  }
  # static routes for the platform itself
}

*.*.livinity.io {
  tls {
    on_demand
    dns cloudflare {env.CF_API_TOKEN}
  }
  reverse_proxy localhost:3100  # relay HTTP listener
}
```

The `ask` endpoint is an internal HTTP endpoint in the Next.js API (or standalone Express) that:
- Parses the requested domain from the `?domain=` query parameter
- Validates the second-level subdomain matches a registered username in PostgreSQL
- Returns HTTP 200 to allow certificate issuance, HTTP 403 to deny
- Adds caching (Redis, 5-minute TTL) to avoid DB hits on every TLS handshake

### Let's Encrypt Rate Limits

| Limit | Value |
|---|---|
| Certificates per registered domain per week | 50 |
| Duplicate certificate limit per week | 5 |
| Failed validation attempts | 5 per account per hostname per hour |
| New orders per account per 3 hours | 300 |

**Implications for Livinity Platform:**

- The registered domain is `livinity.io`. All `*.{username}.livinity.io` certificates count toward the **50 per week** limit for `livinity.io`.
- At 50 certs/week, the platform can onboard approximately 50 new users per week before hitting the rate limit (since each user needs one `*.{username}.livinity.io` cert). This is fine for v8.0.
- Renewals of existing certificates are exempt from the 50/week limit (subject only to the 5 duplicate limit).
- Use Let's Encrypt staging environment during development to avoid burning rate limits while testing.
- If growth requires > 50 new users/week, the solution is ZeroSSL (also ACME-compatible, Caddy supports it) as an alternate CA, which has independent rate limits.

### Important: `stream_close_delay` Setting

Caddy reloads its config whenever a new On-Demand TLS certificate is issued. By default, `stream_close_delay` is 0, meaning active WebSocket connections are immediately closed on config reload. Set `stream_close_delay 5m` in the global Caddy config to give tunnels time to reconnect gracefully. (This issue is documented in `PITFALLS.md`.)

---

## 5. Bandwidth Metering

### Architecture Decision: Redis for Real-Time, PostgreSQL for Persistence

**Redis (hot counters):**
```
INCRBY bandwidth:{userId}:in:{YYYY-MM}  <bytes>
INCRBY bandwidth:{userId}:out:{YYYY-MM} <bytes>
```
- Atomic increment on every data chunk in the relay
- O(1) per increment, handles hundreds of concurrent tunnels without lock contention
- Key expires after 90 days (use `EXPIREAT` to end-of-month + 90 days)

**PostgreSQL (durable record):**
- Background job (cron via `node-cron`, every 60 seconds) reads all `bandwidth:*` keys, flushes to `bandwidth_usage` table via `INSERT ... ON CONFLICT DO UPDATE`
- Source of truth for billing decisions, quota enforcement, and historical display

**Why not PostgreSQL-only:** A direct `UPDATE bandwidth_usage SET bytes_in = bytes_in + $1` on every data chunk would require row-level locking under concurrent tunnel writes. At 10 concurrent tunnels each receiving 1MB/s with 64KB chunks, that is ~160 UPDATE statements per second on the same row per user, causing lock contention and write amplification. Redis `INCRBY` is lock-free.

**Quota enforcement in the relay:**

```typescript
// Check quota before forwarding data chunk
const used = await redis.get(`bandwidth:${userId}:out:${month}`)
if (parseInt(used ?? "0") > FREE_TIER_BYTES) {
  // send 429 frame to tunnel client
  // LivOS client displays quota exceeded notice
  return
}
await redis.incrby(`bandwidth:${userId}:out:${month}`, chunk.byteLength)
```

For the free tier (50 GB/month), the `FREE_TIER_BYTES` constant is `53_687_091_200`.

**Implementation location:** The bandwidth increment logic lives entirely in the custom relay server, not in Next.js. The Next.js API only reads the flushed PostgreSQL data to display usage in the dashboard.

---

## Summary: Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| Tunnel relay | Custom Node.js (TypeScript) + `ws` npm package | Only option with native per-byte metering + direct auth integration |
| Platform framework | Next.js 15, App Router | Consistent with ecosystem direction |
| Authentication | Better Auth | Actively developed successor to Auth.js/Lucia, plugin ecosystem, first-class TypeScript |
| ORM | Drizzle ORM | Instant type inference, PostgreSQL-native API, minimal bundle |
| Email | Resend + react-email | Managed deliverability, React template DX, sufficient free tier |
| UI | Tailwind CSS 3.4 + shadcn/ui | Matches LivOS design system |
| DNS | Cloudflare API (official `cloudflare` npm SDK) | Wildcard A records, near-instant propagation, existing CF setup |
| TLS | Caddy On-Demand TLS + DNS-01 (CF module, already on Server5) | Handles nested wildcards automatically, no cert management code |
| Bandwidth (hot) | Redis `INCRBY` | Lock-free atomic increments for concurrent tunnel writes |
| Bandwidth (cold) | PostgreSQL via 60s flush job | Durable, queryable, source of truth for quotas |

---

## Sources

- [GitHub - fatedier/frp](https://github.com/fatedier/frp)
- [GitHub - rathole-org/rathole](https://github.com/rathole-org/rathole)
- [frp Server Plugin Documentation](https://gofrp.org/en/docs/features/common/server-plugin/)
- [xTom - FRP vs. Rathole vs. ngrok Comparison](https://xtom.com/blog/frp-rathole-ngrok-comparison-best-reverse-tunneling-solution/)
- [Building a HTTP Tunnel with WebSocket and Node.JS](https://dev.to/embbnux/building-a-http-tunnel-with-websocket-and-nodejs-4bp5)
- [Auth.js is now part of Better Auth - GitHub Discussion](https://github.com/nextauthjs/next-auth/discussions/13252)
- [Better Auth vs Auth.js - BetterStack](https://betterstack.com/community/guides/scaling-nodejs/better-auth-vs-nextauth-authjs-vs-autho/)
- [Drizzle vs Prisma ORM in 2026 - Makerkit](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Drizzle ORM Guide 2026](https://devtoolbox-blue.vercel.app/en/blog/drizzle-orm-guide/)
- [Resend - Email for developers](https://resend.com/nextjs)
- [Caddy Automatic HTTPS Documentation](https://caddyserver.com/docs/automatic-https)
- [GitHub - caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare)
- [Multi-Tenant SaaS Wildcard TLS: DNS-01 Challenges](https://www.skeptrune.com/posts/wildcard-tls-for-multi-tenant-systems/)
- [Cloudflare Wildcard DNS Records](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
- [Cloudflare API - Create DNS Record](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt Scaling Rate Limits 2025](https://letsencrypt.org/2025/01/30/scaling-rate-limits)
- [Caddy On-Demand TLS Rate Limits - Community](https://caddy.community/t/on-demand-tls-rate-limits/10986)
- [How to Use Drizzle ORM with PostgreSQL in Next.js 15](https://strapi.io/blog/how-to-use-drizzle-orm-with-postgresql-in-a-nextjs-15-project)
- [GitHub - anderspitman/awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)
