# Architecture: v19.0 Custom Domain Management

**Researched:** 2026-03-26
**Overall confidence:** HIGH (based on direct codebase analysis + Caddy documentation + production case studies)

---

## Executive Summary

Custom domain management for Livinity requires coordinating three systems: the livinity.io platform (Server5) where users register domains, the tunnel relay (Server5) which proxies traffic, and LivOS instances (user servers) which serve the actual content. The architecture leverages Caddy's existing `on_demand_tls` on the relay side (already configured) and Caddy's Caddyfile-append-and-reload strategy on the LivOS side (already proven). The key new work is: (1) domain CRUD + DNS verification on the platform, (2) a new tunnel message type to sync domain config, (3) LivOS receiving and persisting domain mappings, and (4) extending the relay's ask endpoint to authorize custom domains.

---

## 1. End-to-End Data Flow

```
User adds "mysite.com" on livinity.io dashboard
       |
       v
[Platform DB] stores domain record (pending_dns)
       |
       v
User configures DNS: A record -> relay IP (45.137.194.102)
                     TXT record -> verification token
       |
       v
Platform verifies DNS (A + TXT), marks domain "verified"
       |
       v
Platform sends domain_sync message through tunnel relay WebSocket
       |
       v
[Relay] receives message, updates its own domain registry
        (so the ask endpoint approves TLS certs for this domain)
       |
       v
[Relay] forwards domain_sync to LivOS tunnel client
       |
       v
[LivOS] receives domain config, stores in PostgreSQL + Redis
        Maps domain -> app via existing subdomain config
       |
       v
Browser requests https://mysite.com
       |
       v
[Caddy on Relay] -> on_demand_tls ask endpoint -> relay approves
                  -> provisions Let's Encrypt cert
                  -> reverse_proxy to relay:4000
       |
       v
[Relay] parses Host header, finds domain->username mapping
        Routes through tunnel to LivOS
       |
       v
[LivOS] app gateway detects custom domain, routes to correct container
```

---

## 2. Caddy Configuration Strategy

### Decision: Keep Caddyfile-append-and-reload on LivOS, leverage existing on_demand_tls on Relay

**Rationale:**

The relay Caddyfile already uses `on_demand_tls` with an `ask` endpoint:

```caddyfile
{
    on_demand_tls {
        ask http://localhost:4000/internal/ask
    }
}

*.livinity.io {
    tls { on_demand }
    reverse_proxy localhost:4000 { ... }
}

*.*.livinity.io {
    tls { on_demand }
    reverse_proxy localhost:4000 { ... }
}
```

Custom domains fit naturally into this pattern. Add a catch-all HTTPS block:

```caddyfile
# Existing blocks stay unchanged...

# Custom domains catch-all - any domain not matching above patterns
https:// {
    tls {
        on_demand
    }
    reverse_proxy localhost:4000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```

This means:
- The relay Caddyfile needs ONE new block added (the `https://` catch-all) -- done once at deploy time, never changes.
- The `/internal/ask` endpoint needs updating to also check registered custom domains (not just `*.livinity.io` usernames).
- No Caddy Admin API needed. No Caddyfile regeneration on each domain add.
- Caddy handles certificate provisioning automatically via Let's Encrypt HTTP-01 challenge.

**Why NOT the Admin API:**
- The Caddyfile approach is already proven in this codebase (LivOS `caddy.ts` does file-write + reload).
- Admin API requires JSON config format, which adds complexity with no benefit here.
- The on_demand_tls pattern means we do NOT need to add/remove domain blocks per customer domain -- one catch-all block handles all custom domains.
- File-based config survives Caddy restarts. Admin API config is ephemeral unless persisted separately.

### On LivOS Side (Direct Domain Mode)

For users NOT using the tunnel (direct IP with own domain), LivOS already generates Caddyfile blocks per-domain via `generateFullCaddyfile()`. Custom domains would add additional blocks to the same Caddyfile. The existing `applyCaddyConfig()` flow works -- just extend it to include custom domain blocks.

However, most users will use the tunnel, so custom domains route through the relay. The LivOS Caddy stays in tunnel mode (`:80 { reverse_proxy localhost:8080 }`) and does NOT need custom domain blocks -- the relay handles TLS.

---

## 3. Database Schema

### Platform Side (Server5 -- Drizzle/PostgreSQL)

New table in `platform/web/src/db/schema.ts`:

```typescript
export const customDomains = pgTable('custom_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),          // "mysite.com"
  verification_token: text('verification_token').notNull(), // Random token for TXT record
  status: text('status').notNull().default('pending_dns'),
  // Status: pending_dns | dns_verified | active | error | suspended
  app_mapping: jsonb('app_mapping'),
  // e.g. { "root": "code-server", "blog": "ghost", "api": "n8n" }
  // Maps subdomain prefix -> app slug. "root" = bare domain.
  ssl_provisioned: boolean('ssl_provisioned').notNull().default(false),
  last_dns_check: timestamp('last_dns_check', { withTimezone: true }),
  dns_a_verified: boolean('dns_a_verified').notNull().default(false),
  dns_txt_verified: boolean('dns_txt_verified').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Also add to relay SQL schema (`platform/relay/src/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain          TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_dns',
  app_mapping     JSONB,
  ssl_provisioned BOOLEAN NOT NULL DEFAULT false,
  last_dns_check  TIMESTAMPTZ,
  dns_a_verified  BOOLEAN NOT NULL DEFAULT false,
  dns_txt_verified BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
```

### LivOS Side (PostgreSQL raw SQL)

New table in `livos/packages/livinityd/source/modules/database/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT NOT NULL UNIQUE,
  app_mapping     JSONB NOT NULL DEFAULT '{}',
  -- Maps subdomain prefix -> app_id: {"root": "code-server", "blog": "ghost"}
  status          TEXT NOT NULL DEFAULT 'active',
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
```

LivOS stores a simplified version -- it only needs the domain, app mapping, and status. Verification state lives on the platform side.

### Redis Keys (LivOS)

```
livos:custom_domains          # JSON array of {domain, appMapping, status}
livos:custom_domain:<domain>  # Fast lookup: {appId, port} for app gateway routing
```

---

## 4. Tunnel Message Types

### New Protocol Messages

Add to `platform/relay/src/protocol.ts`:

```typescript
/** Platform syncs custom domain configuration to LivOS */
export interface TunnelDomainSync {
  type: 'domain_sync';
  action: 'add' | 'update' | 'remove';
  domain: string;
  appMapping?: Record<string, string>;  // subdomain prefix -> app slug
  status?: string;
}

/** LivOS acknowledges domain sync */
export interface TunnelDomainSyncAck {
  type: 'domain_sync_ack';
  domain: string;
  success: boolean;
  error?: string;
}

/** Full domain list sync (on reconnect or periodic refresh) */
export interface TunnelDomainListSync {
  type: 'domain_list_sync';
  domains: Array<{
    domain: string;
    appMapping: Record<string, string>;
    status: string;
  }>;
}
```

Update union types:

```typescript
export type RelayToClientMessage =
  | TunnelRequest
  | ...existing...
  | TunnelDomainSync
  | TunnelDomainListSync;

export type ClientToRelayMessage =
  | TunnelAuth
  | ...existing...
  | TunnelDomainSyncAck;
```

### Message Flow

```
1. User adds domain on platform dashboard
   Platform -> Relay: HTTP POST /internal/domain-sync
   Relay -> LivOS tunnel: { type: 'domain_sync', action: 'add', domain: 'mysite.com' }
   LivOS -> Relay: { type: 'domain_sync_ack', domain: 'mysite.com', success: true }

2. User maps domain to app
   Platform -> Relay: HTTP POST /internal/domain-sync
   Relay -> LivOS tunnel: { type: 'domain_sync', action: 'update', domain: 'mysite.com', appMapping: { "root": "code-server" } }

3. LivOS reconnects after disconnect
   Relay sends full domain list: { type: 'domain_list_sync', domains: [...] }
   (Ensures LivOS always has current domain config even after outages)

4. User removes domain
   Platform -> Relay: HTTP POST /internal/domain-sync
   Relay -> LivOS tunnel: { type: 'domain_sync', action: 'remove', domain: 'mysite.com' }
```

---

## 5. DNS Verification Strategy

### Decision: DNS verification runs on the PLATFORM (Server5), not LivOS

**Rationale:**
- The platform knows the relay's public IP (Server5: 45.137.194.102) which is where the A record must point.
- Users can verify DNS before their LivOS server is online.
- Centralized verification simplifies the flow -- platform is the authority.
- LivOS does NOT need to know about DNS; it just receives "this domain is verified, route it."

### Verification Flow

```
1. User adds domain "mysite.com" on dashboard
2. Platform generates verification_token (e.g., "livinity-verify=abc123def456")
3. Dashboard shows instructions:
   - A record:   mysite.com -> 45.137.194.102
   - TXT record:  _livinity.mysite.com -> livinity-verify=abc123def456
4. User clicks "Verify"
5. Platform runs DNS checks:
   a. dns.resolve4('mysite.com') == '45.137.194.102' ?
   b. dns.resolveTxt('_livinity.mysite.com') contains verification_token ?
6. If both pass: status -> 'verified', trigger domain_sync to relay
7. Relay updates ask endpoint database, syncs to LivOS
8. First HTTPS request triggers Caddy cert provisioning
9. Platform marks ssl_provisioned = true after first successful request
```

### Why both A record AND TXT record?

- **A record** proves the domain actually points to our infrastructure (traffic will arrive).
- **TXT record** proves the user owns the domain (prevents someone from pointing a domain they don't own to our IP and claiming it).
- This is the same pattern used by Vercel, Netlify, Cloudflare Pages, etc.

---

## 6. Custom Domain Routing -- Integration with App Gateway

### How Custom Domains Coexist with *.livinity.app Routing

Current routing (relay side):

```
Host: alice.livinity.io        -> tunnel for user "alice"
Host: code.alice.livinity.io   -> tunnel for user "alice", targetApp: "code"
```

New routing (relay side):

```
Host: mysite.com               -> lookup custom_domains table -> find user -> tunnel
Host: blog.mysite.com          -> lookup custom_domains table -> find user + app mapping
```

#### Relay-Side Changes

The `parseSubdomain()` function currently only handles `*.livinity.io` patterns. It needs a secondary lookup for custom domains:

```typescript
// In server.ts request handler:
let { username, appName } = parseSubdomain(req.headers.host);

// If not a livinity.io subdomain, check custom domains
if (!username) {
  const customDomain = await lookupCustomDomain(pool, req.headers.host);
  if (customDomain) {
    username = customDomain.username;
    appName = customDomain.resolvedApp; // Based on subdomain prefix + app_mapping
  }
}
```

The `/internal/ask` endpoint needs the same extension:

```typescript
// Existing: check if username exists for *.livinity.io
// New: also check if domain is in custom_domains table
if (!username) {
  const domainResult = await pool.query(
    "SELECT 1 FROM custom_domains WHERE domain = $1 AND status = 'active'",
    [domain]
  );
  if (domainResult.rows.length > 0) {
    res.writeHead(200); // Allow cert
    return;
  }
  // Also check if it's a subdomain of a custom domain
  const parentDomain = domain.split('.').slice(1).join('.');
  const parentResult = await pool.query(
    "SELECT 1 FROM custom_domains WHERE domain = $1 AND status = 'active'",
    [parentDomain]
  );
  if (parentResult.rows.length > 0) {
    res.writeHead(200);
    return;
  }
}
```

#### LivOS-Side Changes (App Gateway)

The app gateway middleware currently checks:
1. `request.hostname` against `livos:domain:config` (main domain)
2. Subdomain extraction from `host.endsWith(.{mainDomain})`

For custom domains, add a secondary check:

```typescript
// After existing subdomain check fails (host is not *.mainDomain)...
// Check custom domains
const customDomains = await this.livinityd.ai.redis.get('livos:custom_domains');
if (customDomains) {
  const domains = JSON.parse(customDomains);
  const host = request.hostname;

  for (const cd of domains) {
    if (host === cd.domain || host.endsWith(`.${cd.domain}`)) {
      const prefix = host === cd.domain ? 'root' : host.slice(0, -cd.domain.length - 1);
      const appSlug = cd.appMapping[prefix];
      if (appSlug) {
        // Resolve appSlug to port via subdomain config or app instances
        // Route to the correct container
      }
    }
  }
}
```

---

## 7. Domain-to-App Mapping with Subdomain Support

### Mapping Model

Each custom domain has an `app_mapping` JSON object:

```json
{
  "root": "code-server",      // mysite.com -> code-server app
  "blog": "ghost",            // blog.mysite.com -> ghost app
  "api": "n8n",               // api.mysite.com -> n8n app
  "files": "filebrowser"      // files.mysite.com -> filebrowser app
}
```

The `"root"` key maps the bare domain. All other keys map subdomain prefixes.

### Resolution Chain

```
Request for blog.mysite.com:
1. Relay: lookup custom_domains WHERE domain = 'mysite.com'
2. Extract prefix "blog" from hostname
3. Find user_id, send through tunnel with targetApp metadata
4. LivOS: look up app_mapping for "mysite.com" -> blog -> "ghost"
5. Find ghost's container port from Redis subdomain config
6. App gateway proxies to container port
```

### Handling in the Tunnel

The existing tunnel protocol already sends `targetApp` in `TunnelRequest` and `TunnelWsUpgrade`. For custom domains, the relay sets `targetApp` based on the app_mapping lookup:

```typescript
// In request-proxy.ts proxyHttpRequest():
// Currently: targetApp comes from parseSubdomain().appName
// New: also resolve from custom domain mapping
```

This means LivOS does NOT need to know the request came via a custom domain vs a livinity.io subdomain -- it just receives `targetApp: "ghost"` and routes it the same way.

---

## 8. Component Boundary Diagram

```
+-----------------------------------------------------+
|                  livinity.io (Server5)               |
|                                                       |
|  +------------------+   +---------------------------+ |
|  | Next.js Dashboard |   |     Tunnel Relay          | |
|  | - Domain CRUD     |   | - WebSocket proxy         | |
|  | - DNS verify      |   | - Custom domain lookup    | |
|  | - App mapping UI  |   | - ask endpoint (TLS auth) | |
|  | - Status display  |   | - domain_sync forwarding  | |
|  +--------+---------+   +--------+--------+---------+ |
|           |                       |        |           |
|           | HTTP POST             |        |           |
|           | /internal/domain-sync |        |           |
|           +-----------------------+        |           |
|                                            |           |
|  +----------------------------------------+           |
|  | Platform PostgreSQL                     |           |
|  | - custom_domains table (source of truth)|           |
|  +----------------------------------------+           |
+--------------------------------------------+-----------+
                                             |
                                    Tunnel WebSocket
                                             |
+--------------------------------------------+-----------+
|                  LivOS (User Server)                   |
|                                                        |
|  +-------------------+   +---------------------------+ |
|  | Tunnel Client      |   |     App Gateway           | |
|  | - domain_sync recv |   | - Custom domain routing   | |
|  | - Redis + PG store |   | - *.livinity.app routing  | |
|  +--------+----------+   +--------+------------------+ |
|           |                        |                    |
|  +--------+-----------+   +-------+------------------+ |
|  | PostgreSQL          |   | Redis                    | |
|  | - custom_domains    |   | - livos:custom_domains   | |
|  +--------------------+   | - livos:custom_domain:*   | |
|                            +--------------------------+ |
|                                                        |
|  +----------------------------------------------------+|
|  | Caddy (tunnel mode: :80 -> 8080)                   ||
|  | No custom domain blocks needed -- relay handles TLS ||
|  +----------------------------------------------------+|
+--------------------------------------------------------+
```

---

## 9. Platform API Endpoints

New API routes in `platform/web/src/app/api/`:

```
GET  /api/domains              # List user's custom domains
POST /api/domains              # Add new domain
GET  /api/domains/[id]         # Get domain details
PUT  /api/domains/[id]         # Update app mapping
DELETE /api/domains/[id]       # Remove domain
POST /api/domains/[id]/verify  # Trigger DNS verification
GET  /api/domains/[id]/status  # Check current status
```

New relay internal endpoints:

```
POST /internal/domain-sync     # Platform -> Relay: sync domain config
GET  /internal/domain-check    # Ask endpoint extension for custom domains
```

---

## 10. Status Lifecycle

```
pending_dns ──[DNS verified]──> verified ──[first HTTPS OK]──> active
     |                              |                            |
     |                              |                            |
     +──[user removes]────> removed |                            |
                                    +──[DNS fails recheck]──> error
                                                                 |
                                                                 +──[DNS restored]──> active
```

States:
- **pending_dns** -- Domain added, waiting for user to configure DNS records
- **verified** -- DNS A record + TXT record confirmed, domain synced to relay/LivOS
- **active** -- SSL cert provisioned, traffic flowing successfully
- **error** -- DNS re-check failed (domain moved away), or cert provisioning failed
- **suspended** -- Admin suspended (future: abuse/billing)

Periodic re-verification (every 24h) ensures domains that stop pointing to our infrastructure get flagged.

---

## 11. Security Considerations

### Domain Ownership Verification
- TXT record with unique token prevents domain hijacking (someone pointing random domains at our IP).
- The ask endpoint ONLY approves domains in the custom_domains table with status = 'verified' or 'active'.

### Rate Limiting on Ask Endpoint
- Caddy's built-in `interval` and `burst` in `on_demand_tls` prevent cert flooding.
- The ask endpoint should cache results in Redis (5-minute TTL) to avoid DB queries on every request.

### Domain Squatting Prevention
- Limit domains per user (e.g., 3 for free tier, more for premium).
- Require email verification before adding domains.
- Auto-remove domains that fail DNS verification for 30+ days.

### SSL Certificate Considerations
- Let's Encrypt HTTP-01 challenge works because traffic arrives at the relay via the A record.
- Rate limits: 50 certificates per registered domain per week (Let's Encrypt). Not a concern for custom domains.
- Certificate storage: Caddy stores certs in its data directory (`/var/lib/caddy`). For relay, this is fine -- single instance.

---

## 12. Tunnel Reconnection Handling

When LivOS reconnects to the relay after a disconnect:

1. Relay detects reconnection (existing `sessionId` resume flow).
2. After auth succeeds, relay sends `domain_list_sync` with all active domains for this user.
3. LivOS replaces its local domain cache with the authoritative list.
4. This ensures domains added/removed while LivOS was offline are properly synced.

This follows the same pattern as the existing `connected` message that triggers domain auto-configuration.

---

## 13. Implications for Roadmap

### Phase 1: Platform Domain CRUD + DNS Verification
- Database schema (custom_domains table on platform)
- API routes for domain CRUD
- DNS verification (A + TXT record checks)
- Dashboard UI (add domain, show DNS instructions, verify button, status)
- No relay/LivOS changes yet

### Phase 2: Relay Integration + Domain Sync
- Extend relay ask endpoint for custom domains
- Add relay custom_domains table
- New `/internal/domain-sync` endpoint
- New tunnel message types (domain_sync, domain_sync_ack, domain_list_sync)
- Caddy catch-all HTTPS block
- Relay subdomain parser extension for custom domain lookup

### Phase 3: LivOS Integration + App Gateway
- LivOS database schema (custom_domains table)
- Tunnel client handlers for domain_sync messages
- Redis cache for custom domain routing
- App gateway extension for custom domain routing
- Domains tab in Servers app UI (status display, app mapping)

### Phase 4: App Mapping + Polish
- Domain-to-app mapping UI on both platform and LivOS
- Subdomain prefix support (blog.mysite.com -> ghost)
- Periodic DNS re-verification (24h cron)
- Error handling and recovery flows
- Edge cases: domain transfer, SSL failures, concurrent edits

### Phase ordering rationale:
- Phase 1 is platform-only, no cross-system dependencies.
- Phase 2 must come after Phase 1 (needs domain records to sync).
- Phase 3 must come after Phase 2 (needs tunnel messages defined).
- Phase 4 is polish that can happen incrementally.

---

## 14. Key Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Caddy on_demand_tls catch-all (not per-domain blocks) | One-time Caddyfile change, no regeneration per domain. Proven pattern (Pirsch, Olly). |
| DNS verification on platform (not LivOS) | Platform knows relay IP, works when LivOS offline, centralized authority. |
| A record + TXT record verification | A proves routing, TXT proves ownership. Industry standard (Vercel, Netlify). |
| Tunnel message for domain sync (not polling) | Real-time sync, reuses existing WebSocket infrastructure, consistent with device events pattern. |
| Full domain_list_sync on reconnect | Ensures LivOS always has current domain config after outages. |
| app_mapping as JSON on domain record | Flexible subdomain->app mapping without extra join tables. |
| Custom domains stored on both platform + LivOS | Platform is source of truth, LivOS has local cache for fast routing. |
| Relay handles TLS for custom domains (not LivOS) | LivOS in tunnel mode has no public IP for cert challenges. Relay is the TLS termination point. |

---

## Sources

- [Pirsch: How We Use Caddy to Provide Custom Domains](https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/) -- production case study of on_demand_tls pattern
- [Olly: Custom Domain Support with Automatic TLS](https://olly.world/how-i-implemented-custom-domain-support-with-automatic-tls-certs-for-my-saas-app) -- ask endpoint + verification flow
- [Caddy API Documentation](https://caddyserver.com/docs/api) -- Admin API vs Caddyfile comparison
- [Caddy TLS Directive](https://caddyserver.com/docs/caddyfile/directives/tls) -- on_demand_tls configuration
- Direct codebase analysis of: `platform/relay/Caddyfile`, `platform/relay/src/protocol.ts`, `platform/relay/src/server.ts`, `platform/relay/src/subdomain-parser.ts`, `livos/.../domain/caddy.ts`, `livos/.../domain/routes.ts`, `livos/.../server/index.ts` (app gateway), `livos/.../platform/tunnel-client.ts`
