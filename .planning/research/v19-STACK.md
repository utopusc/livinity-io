# Technology Stack: v19.0 Custom Domain Management

**Project:** Livinity v19.0 Custom Domain Management
**Researched:** 2026-03-26
**Overall confidence:** HIGH

---

## Executive Summary

Custom domain management for Livinity requires **zero new npm dependencies**. The existing stack (Caddy + Node.js `dns` module + `node:crypto` + PostgreSQL + Drizzle ORM) covers every requirement. The key architectural decision is to use **Caddy's on-demand TLS with an ask endpoint** (already implemented in the relay Caddyfile) rather than the Caddy Admin API for adding/removing domain routes. This approach is battle-tested by multiple SaaS companies (Pirsch, Honeybadger, Olly) and matches the existing relay architecture perfectly.

---

## Recommended Stack Additions

### No New Libraries Required

The existing stack covers all v19.0 needs:

| Requirement | Solution | Already In Stack? |
|-------------|----------|-------------------|
| DNS A record verification | `node:dns/promises` (`resolve4`) | YES - used in `dns-check.ts` |
| DNS TXT record verification | `node:dns/promises` (`resolveTxt`) | YES - built-in Node.js |
| TXT token generation | `node:crypto` (`randomBytes`) | YES - built-in Node.js |
| Domain database storage | Drizzle ORM + PostgreSQL | YES - platform/web uses Drizzle |
| Domain sync to LivOS | Tunnel relay WebSocket protocol | YES - protocol.ts |
| SSL certificate provisioning | Caddy on-demand TLS | YES - relay Caddyfile already configured |
| Domain status polling | `setInterval` / cron-like | YES - Node.js built-in |
| Caddy config on LivOS | Caddyfile generation + reload | YES - `caddy.ts` module |

**Confidence: HIGH** - All of these are verified against the existing codebase.

---

## Component-by-Component Technical Details

### 1. Caddy On-Demand TLS (Relay/Server5) -- The Core Pattern

**Recommendation: Use on-demand TLS with ask endpoint, NOT the Caddy Admin API.**

The relay Caddyfile already has on-demand TLS configured:

```
{
    on_demand_tls {
        ask http://localhost:4000/internal/ask
    }
}
```

The existing `handleAskRequest()` in `server.ts` checks if a username exists in the database. For custom domains, **extend this same ask endpoint** to also check a `custom_domains` table.

**Why NOT the Caddy Admin API:**

| Criterion | Admin API (POST /config/) | On-Demand TLS + Ask |
|-----------|---------------------------|---------------------|
| Per-domain config changes | Must add/remove JSON route blocks | No config changes needed |
| Cert provisioning | Manual or via route config | Automatic on first request |
| Config drift risk | High (API state vs disk state) | None (Caddyfile is static) |
| Restart resilience | Config lost unless persisted | Survives restarts (Caddyfile unchanged) |
| Existing implementation | Would need new code | Already have ask endpoint |
| Scaling | Config grows per domain | Config stays constant |
| Complexity | Moderate (JSON path manipulation, concurrency) | Low (DB lookup in ask endpoint) |

**How on-demand TLS works for custom domains:**

1. User points `mysite.com` A record to Server5 IP (45.137.194.102)
2. Browser requests `https://mysite.com`
3. Caddy receives TLS handshake, doesn't have cert for `mysite.com`
4. Caddy calls `http://localhost:4000/internal/ask?domain=mysite.com`
5. Relay looks up `mysite.com` in `custom_domains` table
6. Returns 200 if verified domain exists, 404 otherwise
7. Caddy obtains Let's Encrypt cert via HTTP-01 challenge (port 80 already open)
8. Caddy proxies request to relay on port 4000
9. Relay routes to the correct user's tunnel based on custom domain mapping

**Caddyfile update needed** on Server5 relay:

```
{
    on_demand_tls {
        ask http://localhost:4000/internal/ask
    }
}

livinity.io {
    tls { on_demand }
    reverse_proxy localhost:3000
}

*.livinity.io {
    tls { on_demand }
    reverse_proxy localhost:4000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}

*.*.livinity.io {
    tls { on_demand }
    reverse_proxy localhost:4000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}

# NEW: Catch-all for custom domains (on-demand TLS)
https:// {
    tls {
        on_demand
    }
    reverse_proxy localhost:4000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
        header_up X-Custom-Domain {host}
    }
}
```

The `https://` catch-all block handles any domain not matched by the explicit blocks above. The `X-Custom-Domain` header tells the relay this is a custom domain request (not a subdomain request).

**Confidence: HIGH** - This pattern is documented by Caddy, used by Pirsch/Honeybadger/Olly, and the ask endpoint already exists.

**Sources:**
- [Caddy On-Demand TLS](https://caddyserver.com/on-demand-tls)
- [Caddy Automatic HTTPS docs](https://caddyserver.com/docs/automatic-https)
- [Pirsch custom domains](https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/)
- [Honeybadger custom domains](https://www.honeybadger.io/blog/secure-custom-domains-caddy/)

---

### 2. Caddy Admin API Reference (For LivOS Side Only)

On the LivOS side (Server4/mini PC), Caddy manages the actual app reverse proxy. Custom domains arriving via the tunnel need a Caddy route on LivOS to proxy to the correct app port. The existing `caddy.ts` module uses **Caddyfile generation + reload** which is the right approach for LivOS (small number of domains per server).

However, for reference, here is the Caddy Admin API if the Caddyfile approach becomes unwieldy:

**Caddy Admin API Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/load` | Replace entire config (JSON or Caddyfile via Content-Type) |
| `GET` | `/config/[path]` | Read config at path |
| `POST` | `/config/[path]` | Append to array or create object |
| `PUT` | `/config/[path]` | Insert at position or create strictly |
| `PATCH` | `/config/[path]` | Replace existing value |
| `DELETE` | `/config/[path]` | Remove config at path |
| `POST` | `/adapt` | Convert Caddyfile to JSON (without loading) |
| `POST` | `/stop` | Graceful shutdown |

**JSON config structure for adding a custom domain route:**

```json
{
  "match": [{ "host": ["mysite.com"] }],
  "handle": [{
    "handler": "reverse_proxy",
    "upstreams": [{ "dial": "127.0.0.1:8080" }]
  }],
  "terminal": true
}
```

**Adding a route via API:**

```bash
curl -X POST "http://localhost:2019/config/apps/http/servers/srv0/routes" \
  -H "Content-Type: application/json" \
  -d '{"match":[{"host":["mysite.com"]}],"handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"127.0.0.1:8080"}]}],"terminal":true}'
```

**Recommendation: Stay with Caddyfile generation + reload on LivOS.** The existing `generateFullCaddyfile()` function in `caddy.ts` is clean and works. Extend it to include custom domain blocks. The Admin API adds complexity (JSON path management, concurrency control via ETags) without meaningful benefit at LivOS scale (tens of domains, not thousands).

**Confidence: HIGH** - Verified from Caddy official docs.

**Sources:**
- [Caddy API docs](https://caddyserver.com/docs/api)
- [Caddy API Tutorial](https://caddyserver.com/docs/api-tutorial)

---

### 3. DNS Verification -- Node.js Built-in `dns/promises`

**Use `node:dns/promises` exclusively. No third-party DNS libraries needed.**

The existing `dns-check.ts` already uses `dns.resolve4()` for A record verification. Extend with `dns.resolveTxt()` for TXT record ownership verification.

**A Record Verification (already exists):**

```typescript
import dns from 'node:dns/promises'

// Verify domain points to relay server IP
const addresses = await dns.resolve4('mysite.com')
// addresses: ['45.137.194.102']
```

**TXT Record Verification (new):**

```typescript
import dns from 'node:dns/promises'

// Check for ownership TXT record
// Convention: _livinity-verification.mysite.com TXT "liv_verify=abc123..."
const records = await dns.resolveTxt('_livinity-verification.mysite.com')
// records: [['liv_verify=abc123def456']]
// Note: returns 2D array. Each inner array is chunks of one TXT record.
const flatRecords = records.map(chunks => chunks.join(''))
const hasToken = flatRecords.some(r => r === `liv_verify=${expectedToken}`)
```

**TXT verification subdomain convention:** Use `_livinity-verification.{domain}` as the TXT record hostname. This follows industry standard (Google uses `_google-site-verification`, GitHub uses `_github-challenge`, etc.). Using a subdomain TXT record avoids cluttering the root domain's TXT records and prevents conflicts with SPF/DKIM/DMARC.

**Error handling:**

```typescript
try {
  const records = await dns.resolveTxt(hostname)
  // Success
} catch (err: any) {
  switch (err.code) {
    case 'ENOTFOUND':  // Domain doesn't exist
    case 'ENODATA':    // Domain exists but no TXT records
      return { verified: false, reason: 'no_txt_record' }
    case 'ETIMEOUT':   // DNS server timeout
      return { verified: false, reason: 'dns_timeout' }
    case 'ESERVFAIL':  // DNS server failure
      return { verified: false, reason: 'dns_error' }
    default:
      return { verified: false, reason: 'unknown_error' }
  }
}
```

**Important caveats:**
- `dns.resolve*()` always queries DNS servers on the network (not `/etc/hosts`)
- No built-in DNS caching in Node.js -- each call is a fresh query
- Default timeout is system-dependent; use `new dns.Resolver({ timeout: 5000 })` for explicit control
- TXT records return a 2D array (chunks per record) -- must join chunks before comparison

**Confidence: HIGH** - Verified against Node.js v25 documentation.

**Sources:**
- [Node.js DNS API](https://nodejs.org/api/dns.html)

---

### 4. TXT Token Generation -- `node:crypto`

**Use `crypto.randomBytes()` for token generation. No libraries needed.**

```typescript
import crypto from 'node:crypto'

// Generate a 32-byte (64 hex char) verification token
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Result: e.g., "a1b2c3d4e5f6..." (64 characters)
// Stored as: liv_verify=a1b2c3d4e5f6...
// User adds TXT record: _livinity-verification.mysite.com -> liv_verify=a1b2c3d4e5f6...
```

**Token format recommendation:** `liv_verify={hex_token}`
- `liv_` prefix makes it identifiable
- 32 bytes = 256 bits of entropy (collision-proof)
- Hex encoding is safe for DNS TXT records (no special chars)

**Confidence: HIGH** - Standard crypto API, well-documented.

---

### 5. Let's Encrypt Rate Limits and Staging

**Current production rate limits (as of 2026):**

| Limit | Value | Refill Rate |
|-------|-------|-------------|
| Certificates per Registered Domain | 50 per 7 days | 1 per 202 minutes |
| Duplicate Certificates (exact set) | 5 per 7 days | 1 per 34 hours |
| New Orders per Account | 300 per 3 hours | 1 per 36 seconds |
| Authorization Failures per Identifier | 5 per hour | 1 per 12 minutes |
| Consecutive Auth Failures (per identifier) | 1,152 before blocked | 1 per day on success |
| New Registrations per IP | 10 per 3 hours | 1 per 18 minutes |

**Critical for Livinity:**
- **50 certs per registered domain per week** applies to `livinity.io` subdomains, NOT custom domains. Custom domains (e.g., `mysite.com`) each count against their own registered domain.
- **Renewals are exempt** from most rate limits. Only new domain issuance counts.
- **ARI (ACME Renewal Info) renewals** are exempt from ALL rate limits.
- The **300 new orders per 3 hours** limit applies per ACME account. Caddy uses one account, so this limits new custom domain onboarding to ~100/hour (well within Livinity's scale).

**Staging environment for development/testing:**

| Limit | Staging Value |
|-------|---------------|
| New Registrations per IP | 50 per 3 hours |
| New Orders per Account | 1,500 per 3 hours |
| Certificates per Domain | 30,000 per second |
| Authorization Failures | 200 per hour |

**Staging URL:** `https://acme-staging-v02.api.letsencrypt.org/directory`

**Caddy staging config:**
```
{
    acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

**Important: Staging certificates are NOT trusted by browsers.** Staging root CA is "(STAGING) Pretend Pear X1". Use for testing only.

**2026 certificate lifetime changes:**
- May 13, 2026: Optional 45-day certificates via `tlsserver` ACME profile
- Feb 10, 2027: Default becomes 64-day certificates
- Feb 16, 2028: Default becomes 45-day certificates
- **Caddy handles renewal automatically** -- no action needed from Livinity

**Confidence: HIGH** - Verified from Let's Encrypt official docs (2026).

**Sources:**
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt Staging Environment](https://letsencrypt.org/docs/staging-environment/)
- [Let's Encrypt 45-Day Certs](https://letsencrypt.org/2026/02/24/rate-limits-45-day-certs)
- [Let's Encrypt Scaling Rate Limits](https://letsencrypt.org/2025/01/30/scaling-rate-limits)

---

### 6. Database Schema (Platform -- Drizzle ORM)

**Add a `custom_domains` table to the platform's PostgreSQL database.**

Drizzle schema (extends `platform/web/src/db/schema.ts`):

```typescript
export const customDomains = pgTable('custom_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),
  // Verification
  verification_token: text('verification_token').notNull(),
  txt_verified: boolean('txt_verified').notNull().default(false),
  a_record_verified: boolean('a_record_verified').notNull().default(false),
  // Status: pending_dns | txt_verified | active | error | removed
  status: text('status').notNull().default('pending_dns'),
  error_message: text('error_message'),
  // App mapping (synced to LivOS)
  target_app: text('target_app'),       // null = main LivOS UI
  target_subdomain: text('target_subdomain'), // for subdomain routing (blog.mysite.com -> blog)
  // SSL
  ssl_provisioned: boolean('ssl_provisioned').notNull().default(false),
  ssl_provisioned_at: timestamp('ssl_provisioned_at', { withTimezone: true }),
  // Timestamps
  last_dns_check: timestamp('last_dns_check', { withTimezone: true }),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**Also add to relay's `schema.sql`:**

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain               TEXT NOT NULL UNIQUE,
  verification_token   TEXT NOT NULL,
  txt_verified         BOOLEAN NOT NULL DEFAULT false,
  a_record_verified    BOOLEAN NOT NULL DEFAULT false,
  status               TEXT NOT NULL DEFAULT 'pending_dns',
  error_message        TEXT,
  target_app           TEXT,
  target_subdomain     TEXT,
  ssl_provisioned      BOOLEAN NOT NULL DEFAULT false,
  ssl_provisioned_at   TIMESTAMPTZ,
  last_dns_check       TIMESTAMPTZ,
  verified_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON custom_domains(status);
```

**Confidence: HIGH** - Follows existing schema patterns from `schema.sql` and `schema.ts`.

---

### 7. Domain Sync via Tunnel Protocol

**Add new tunnel protocol messages for domain sync.**

Extend `protocol.ts`:

```typescript
/** Relay sends domain config to LivOS after domain verification */
export interface TunnelDomainSync {
  type: 'domain_sync';
  domains: Array<{
    domain: string;
    targetApp: string | null;
    targetSubdomain: string | null;
    status: 'active' | 'removed';
  }>;
}

/** LivOS confirms domain config applied */
export interface TunnelDomainSyncAck {
  type: 'domain_sync_ack';
  success: boolean;
  error?: string;
}
```

**Sync flow:**
1. User verifies domain on livinity.io dashboard
2. Platform updates `custom_domains` table status to `active`
3. Relay sends `domain_sync` message through user's tunnel WebSocket
4. LivOS receives sync, updates local Caddy config (adds domain block)
5. LivOS sends `domain_sync_ack` back
6. Platform marks `ssl_provisioned` once Caddy on relay obtains cert

**Confidence: HIGH** - Follows existing tunnel protocol patterns.

---

### 8. Domain Status Polling (Cron-Like)

**Use `setInterval` in the relay process for periodic DNS re-checks.**

```typescript
// Check pending domains every 5 minutes
const DNS_CHECK_INTERVAL = 5 * 60 * 1000 // 5 min

setInterval(async () => {
  const pendingDomains = await pool.query(
    `SELECT * FROM custom_domains WHERE status IN ('pending_dns', 'txt_verified') AND last_dns_check < NOW() - INTERVAL '5 minutes'`
  )
  for (const domain of pendingDomains.rows) {
    await checkDomainDns(domain)
  }
}, DNS_CHECK_INTERVAL)
```

No need for a separate cron library. The relay process already runs continuously and uses `setInterval` for bandwidth flushing (see `bandwidth.ts` with `BANDWIDTH_FLUSH_INTERVAL_MS`).

**Confidence: HIGH** - Matches existing relay patterns.

---

## Relay Ask Endpoint Extension

The existing `handleAskRequest()` in `server.ts` needs extension. Currently it only checks usernames:

```typescript
// CURRENT: Only checks livinity.io subdomains
const { username } = parseSubdomain(domain);
// ...
const result = await pool.query('SELECT 1 FROM users WHERE username = $1 LIMIT 1', [username]);
```

**Extended ask endpoint:**

```typescript
async function handleAskRequest(req, res, pool) {
  const url = new URL(req.url ?? '', 'http://localhost');
  const domain = url.searchParams.get('domain');

  // 1. Check if it's a livinity.io subdomain (existing logic)
  const { username } = parseSubdomain(domain);
  if (username) {
    // ... existing user lookup ...
    return;
  }

  // 2. Check if it's a verified custom domain
  const customResult = await pool.query(
    'SELECT 1 FROM custom_domains WHERE domain = $1 AND status = $2 LIMIT 1',
    [domain, 'active']
  );
  if (customResult.rows.length > 0) {
    res.writeHead(200);
    res.end(JSON.stringify({ allowed: true }));
    return;
  }

  // 3. Not recognized
  res.writeHead(404);
  res.end(JSON.stringify({ allowed: false }));
}
```

**Performance note from Caddy docs:** The ask endpoint should return in milliseconds. A PostgreSQL query with an indexed `domain` column meets this requirement easily.

**Confidence: HIGH** - Direct extension of existing code.

---

## Request Routing for Custom Domains

The relay's `createRequestHandler()` in `server.ts` currently routes based on subdomain:

```typescript
const { username, appName } = parseSubdomain(req.headers.host);
```

For custom domains, add a lookup path:

```typescript
// If no username from subdomain parsing, check custom domains
if (!username) {
  const hostname = req.headers.host?.split(':')[0];
  if (hostname) {
    const customDomain = await lookupCustomDomain(hostname); // DB + Redis cache
    if (customDomain) {
      const tunnel = registry.get(customDomain.username);
      // Route through tunnel with targetApp from custom domain config
    }
  }
}
```

**Cache custom domain lookups in Redis** to avoid DB hit per request:

```typescript
// Redis key: relay:custom-domain:{domain} -> { userId, username, targetApp }
// TTL: 5 minutes (matches DNS check interval)
```

---

## LivOS Caddy Config Extension

Extend `generateFullCaddyfile()` in `caddy.ts` to include custom domain blocks:

```typescript
// NEW: Custom domain blocks (received via tunnel sync)
for (const customDomain of customDomains) {
  const targetPort = customDomain.targetApp
    ? getAppPort(customDomain.targetApp)
    : 8080 // main LivOS UI
  blocks.push(`${customDomain.domain} {
    reverse_proxy 127.0.0.1:${targetPort}
}`)
}
```

**Note:** On LivOS with direct domain access (non-tunnel), Caddy handles SSL directly via HTTP-01 challenge. On tunnel mode, the relay's Caddy handles SSL and LivOS Caddy stays on `:80`.

---

## Summary: What to Install

```bash
# Nothing to install. Zero new dependencies.
# All functionality uses:
#   - node:dns/promises (built-in)
#   - node:crypto (built-in)
#   - Existing Caddy on-demand TLS
#   - Existing Drizzle ORM + PostgreSQL
#   - Existing tunnel WebSocket protocol
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Caddy config approach | On-demand TLS + ask endpoint | Admin API (JSON routes) | Adds complexity, config drift risk, existing ask endpoint already works |
| DNS verification | `node:dns/promises` | `dns2` npm package | Built-in is sufficient, zero dependencies preferred |
| DNS verification | `node:dns/promises` | `dnsjson.com` API / DoH | External dependency, rate limits, latency -- built-in is better |
| TXT token generation | `node:crypto.randomBytes` | `nanoid` / `uuid` | Already have crypto, hex is DNS-safe |
| Domain polling | `setInterval` in relay | `node-cron` / `bull` / Redis-based queue | Overkill for 5-min interval, relay already uses setInterval |
| Domain storage | PostgreSQL + Drizzle | Redis only | Domains are persistent data, not ephemeral -- belongs in PostgreSQL |
| Cert storage | Caddy default (filesystem) | Caddy + Redis storage plugin | Single Caddy instance per server, no need for shared storage |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Caddy on-demand TLS | HIGH | Verified from official docs + existing relay Caddyfile + multiple SaaS references |
| DNS verification (dns module) | HIGH | Verified from Node.js v25 docs, existing `dns-check.ts` in codebase |
| Let's Encrypt rate limits | HIGH | Verified from official LE docs (2026 edition) |
| Database schema | HIGH | Follows existing patterns in `schema.sql` and Drizzle `schema.ts` |
| Tunnel sync protocol | HIGH | Follows existing protocol message patterns |
| LivOS Caddy extension | HIGH | Extends existing `caddy.ts` module |
| Ask endpoint extension | HIGH | Direct modification of existing `handleAskRequest()` |

---

## Open Questions

1. **Wildcard custom domains:** Should users be able to add `*.mysite.com` in addition to `mysite.com`? This requires DNS-01 challenge (Cloudflare plugin) which is only available on the user's own LivOS, not on the relay. Defer to v20+.

2. **Multiple domains per user:** What's the limit? Suggest 3 for free tier, 10 for premium. Rate limiting prevents abuse at the cert level, but DB-level limits are also needed.

3. **Domain transfer between users:** If user A removes `mysite.com` and user B wants to add it, should there be a cooldown? The TXT verification token changes per user, so natural protection exists.

4. **CNAME vs A record:** Some users may prefer CNAME pointing to `domains.livinity.io` instead of A record to an IP. CNAME is more resilient to IP changes. Consider supporting both.

---

## Sources

- [Caddy API Documentation](https://caddyserver.com/docs/api)
- [Caddy API Tutorial](https://caddyserver.com/docs/api-tutorial)
- [Caddy On-Demand TLS](https://caddyserver.com/on-demand-tls)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy TLS Directive](https://caddyserver.com/docs/caddyfile/directives/tls)
- [Caddy Global Options](https://caddyserver.com/docs/caddyfile/options)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt Staging Environment](https://letsencrypt.org/docs/staging-environment/)
- [Let's Encrypt 45-Day Certificates](https://letsencrypt.org/2026/02/24/rate-limits-45-day-certs)
- [Let's Encrypt Scaling Rate Limits](https://letsencrypt.org/2025/01/30/scaling-rate-limits)
- [Node.js DNS API](https://nodejs.org/api/dns.html)
- [Pirsch: Custom Domains with Caddy](https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/)
- [Honeybadger: Secure Custom Domains with Caddy](https://www.honeybadger.io/blog/secure-custom-domains-caddy/)
- [Olly: Custom Domain Support](https://olly.world/how-i-implemented-custom-domain-support-with-automatic-tls-certs-for-my-saas-app)
- [JHumanJ: SaaS Custom Domains with Caddy + DynamoDB](https://jhumanj.com/saas-custom-domain-feature-caddy-dynamodb)
- [Caddy JSON Route Example (Gist)](https://gist.github.com/fizzyade/8b7978c9001c9dde987c16bdfa322a01)
- [Caddy Community: Using API in SaaS](https://caddy.community/t/using-caddy-api-in-saas-solutions/11960)
- [verify-domain npm](https://github.com/GodderE2D/verify-domain)
- [domain-verification npm](https://www.npmjs.com/package/domain-verification)
- [NameSilo: TXT vs CNAME Verification](https://www.namesilo.com/blog/en/dns/custom-domains-in-saas-txt-vs-cname-verification-and-when-to-use-each/)
