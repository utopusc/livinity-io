# Domain Pitfalls: v19.0 Custom Domain Management

**Domain:** Custom domain management for self-hosted platform with tunnel relay
**Researched:** 2026-03-26
**Overall confidence:** HIGH (verified against Caddy docs, Let's Encrypt docs, codebase analysis)

---

## Critical Pitfalls

Mistakes that cause outages, security vulnerabilities, or require architectural rework.

---

### CRITICAL-1: ACME Challenge Routing Mismatch (Tunnel vs Direct)

**Severity:** CRITICAL
**Phase:** SSL/Caddy configuration phase
**What goes wrong:** Livinity has TWO routing paths: (1) direct Caddy on user's LivOS server, and (2) tunnel relay through Server5. Custom domains pointed via A record to the user's LivOS IP work with HTTP-01 challenge because Caddy on the LivOS box can serve `/.well-known/acme-challenge/`. But custom domains routed through the tunnel relay CANNOT use HTTP-01 because the domain resolves to the relay IP, not the LivOS box where Caddy runs. The relay would need to forward ACME challenges to the correct LivOS instance, which the current tunnel protocol does not support.

**Why it happens:** The existing tunnel client (`tunnel-client.ts`) proxies all HTTP requests through LivOS port 8080, but the ACME HTTP-01 challenge requires the domain's A record to resolve to the server running Caddy. If the custom domain points to the relay (Server5), the relay would receive the ACME challenge request, not the user's LivOS Caddy instance.

**Consequences:**
- SSL certificate provisioning silently fails for tunnel-connected users
- Domain shows "active" in UI but HTTPS never works
- Let's Encrypt rate limits get consumed on failed attempts

**Prevention:**
- **Architecture decision required FIRST:** Custom domains must point their A record directly to the user's LivOS server IP (not the relay). This means custom domains only work for users with a publicly-accessible IP and ports 80/443 open. Document this clearly.
- Alternative: Use DNS-01 challenge instead of HTTP-01, but this requires the platform to have API access to the user's DNS provider, which is impractical.
- Alternative: If tunnel users need custom domains, the relay must be enhanced to forward ACME challenge requests to the correct LivOS instance -- a significant protocol extension.
- **Recommended approach:** Phase 1 supports custom domains only for direct-access LivOS servers (with public IP). Tunnel users get `*.livinity.io` subdomains only. This is the simplest correct approach.

**Detection:** Test custom domain flow through tunnel relay path before shipping.

---

### CRITICAL-2: Caddy Reload Destroys Active Connections

**Severity:** CRITICAL
**Phase:** Caddy configuration management phase
**What goes wrong:** The current `reloadCaddy()` function (`caddy.ts` line 152) calls `caddy reload --config /etc/caddy/Caddyfile`. Caddy reload is generally graceful, BUT: (1) active WebSocket connections to apps may be dropped during reload, (2) the v18.0 desktop streaming uses `stream_close_delay 5m` specifically to survive reloads, but other WebSocket connections (tRPC subscriptions, AI chat SSE) have no such protection. Every time a new custom domain is added, ALL existing connections are at risk.

**Why it happens:** Each domain add/remove triggers a full Caddyfile rewrite + reload. The current code in `rebuildCaddy()` (routes.ts line 62-75) rewrites the entire Caddyfile from scratch every time, then calls `caddy reload`. At scale with multiple users adding domains, this creates frequent reloads.

**Consequences:**
- Active AI chat sessions interrupted
- tRPC subscriptions drop requiring reconnect
- Desktop streaming sessions may stutter
- If two domain changes happen near-simultaneously, the second reload may cancel the first's in-flight certificate acquisition

**Prevention:**
- Use Caddy's `on_demand_tls` with an `ask` endpoint instead of regenerating the Caddyfile per domain. This eliminates reloads entirely for new custom domains.
- The `ask` endpoint checks a database/Redis to verify domain ownership. Caddy handles certificates lazily on first TLS handshake.
- Keep the existing Caddyfile approach for the platform's own domains (`*.livinity.app`, main domain, native apps) and use `on_demand_tls` exclusively for user custom domains.
- If sticking with Caddyfile reload approach, batch domain changes with a debounce (e.g., 5-second window) to coalesce multiple adds.

**Detection:** Monitor WebSocket disconnect events during domain provisioning; test concurrent domain addition.

---

### CRITICAL-3: Domain Ownership Verification Bypass / Domain Takeover

**Severity:** CRITICAL
**Phase:** DNS verification phase
**What goes wrong:** User A adds `example.com` and verifies DNS. Later, User A removes their A record but the domain remains "verified" in the platform database. User B (or an attacker) then points `example.com` at their own LivOS server and claims it, or worse, the stale Caddy config still serves content for that domain on User A's server, potentially to User B's visitors.

**Why it happens:** One-time DNS verification without periodic re-verification. The current `verifyDns()` in `dns-check.ts` only checks that the A record matches the expected IP at verification time. There is no periodic re-check.

**Consequences:**
- Domain squatting: attacker claims domains they don't own
- Stale SSL certificates served for domains no longer pointed at the server
- Potential phishing if attacker points a verified domain elsewhere and the old certificate is still valid

**Prevention:**
- **Periodic re-verification:** Run a background job (every 6-12 hours) that re-checks all verified custom domains. If A record no longer matches, transition domain to "dns_mismatch" status and disable routing after a grace period (48 hours to allow for temporary DNS issues).
- **TXT record ownership proof:** Require both an A record (for routing) AND a TXT record (for ownership). The TXT record should contain a unique token like `livinity-verify=<userId>-<random>`. This prevents someone who points an A record at the server from claiming ownership without DNS management access.
- **Domain uniqueness enforcement:** Database constraint ensuring one domain can only be claimed by one user across the entire platform at a time.
- **Cleanup on domain removal:** When a user removes a custom domain, immediately remove it from Caddy config and revoke/delete the certificate.

**Detection:** Audit log for domain verification events; alert on domains that fail re-verification.

---

### CRITICAL-4: Let's Encrypt Rate Limit Exhaustion

**Severity:** CRITICAL
**Phase:** SSL provisioning phase
**What goes wrong:** Let's Encrypt imposes hard rate limits: 50 certificates per registered domain per week, 300 new orders per account per 3 hours, 5 failed validations per hostname per account per hour. In a multi-tenant platform, a bug in domain verification (approving domains with bad DNS) or rapid user onboarding can exhaust these limits, blocking ALL certificate issuance for the entire platform.

**Why it happens:** All LivOS instances sharing the same ACME account, or aggressive retry logic after failures. Caddy retries failed certificates automatically, and each retry counts against rate limits.

**Exact limits (verified from letsencrypt.org/docs/rate-limits/, updated June 2025):**

| Limit | Value | Refill Rate |
|-------|-------|-------------|
| New Certificates per Registered Domain | 50 per 7 days | 1 per ~3.4 hours |
| New Orders per Account | 300 per 3 hours | 1 per 36 seconds |
| Duplicate Certificate | 5 per 7 days per exact set | 1 per 34 hours |
| Failed Validations | 5 per hostname per account per hour | 1 per 12 minutes |
| Accounts per IP | 10 per 3 hours | 1 per 18 minutes |

**Consequences:**
- Platform-wide SSL outage for new domains (existing certs unaffected until renewal)
- 7-day wait to recover from "certificates per registered domain" limit
- Users see "pending SSL" indefinitely

**Prevention:**
- **Each LivOS instance runs its own ACME account** (Caddy does this by default with its own email). Custom domains are issued by the user's Caddy, not a central platform Caddy. This distributes rate limits across users.
- **Verify DNS BEFORE triggering certificate issuance.** Never add a domain to Caddy config until DNS verification passes. The current codebase has `verifyDns()` but nothing enforces this as a gate before `applyCaddyConfig()`.
- **If using `on_demand_tls`:** The `ask` endpoint MUST reject domains whose DNS has not been verified. This is the primary defense.
- **Use Let's Encrypt staging environment for testing.** Staging has much higher limits (see staging-environment docs). Caddy automatically falls back to staging after repeated failures.
- **Monitor certificate issuance:** Log and alert when approaching 40 certificates in a 7-day window on any single ACME account.
- **Cap custom domains per user:** Start with a limit of 5 custom domains per user to prevent abuse.

**Detection:** Caddy logs certificate acquisition failures; parse logs for "rate limit" errors.

---

## High-Severity Pitfalls

Issues that cause significant user-facing problems or security degradation.

---

### HIGH-1: App Gateway Cannot Route Custom Domains

**Severity:** HIGH
**Phase:** Domain-to-app mapping phase
**What goes wrong:** The existing app gateway middleware in `server/index.ts` (lines 184-308) ONLY handles subdomains of `mainDomain`. It extracts the subdomain by checking `host.endsWith(.${mainDomain})` and then looking up the subdomain in Redis. A custom domain like `myblog.com` does NOT end with `.livinity.cloud`, so the gateway skips it entirely. The request falls through to the main LivOS UI, returning the wrong content.

**Why it happens:** The app gateway was designed for `{app}.{user}.livinity.app` subdomain routing only. Custom domains require a completely different lookup path: instead of extracting a subdomain prefix, the gateway must match the entire hostname against a custom domain mapping table.

**Consequences:**
- Custom domain visitors see the LivOS dashboard instead of their mapped app
- No error message -- just wrong content served silently
- WebSocket upgrade path (lines 370-465) has the same limitation

**Prevention:**
- **Extend the app gateway with a custom domain lookup BEFORE the subdomain check.** The flow should be:
  1. Check if `request.hostname` matches a custom domain in Redis/DB -> route to mapped app
  2. THEN fall through to existing subdomain logic for `*.mainDomain`
- **New Redis key pattern:** `livos:custom_domain:{hostname}` -> `{appId, port, userId}`
- **Same pattern for WebSocket upgrade handler** (must be updated in parallel)
- **Important:** The custom domain lookup should be a fast O(1) Redis GET, not a scan of all domains.

**Detection:** Test custom domain routing with a real domain pointing at the server; verify correct app content is served.

---

### HIGH-2: DNS Propagation False Negatives Block Users

**Severity:** HIGH
**Phase:** DNS verification phase
**What goes wrong:** User adds A record, but the LivOS server's DNS resolver still has the old (or empty) record cached. `verifyDns()` in `dns-check.ts` uses `dns.resolve4()` which queries the system's configured DNS resolver, which may cache negative responses for hours. User keeps clicking "Verify" and it keeps failing, even though the record is correct globally.

**Why it happens:** DNS negative caching (NXDOMAIN TTL). When the system resolver queries a domain before the A record exists and gets NXDOMAIN, it caches that negative result. The TTL for negative responses can be 300-3600 seconds depending on the authoritative server's SOA record. Additionally, the LivOS server may be behind a caching resolver (like systemd-resolved or a provider's recursive resolver).

**Consequences:**
- User frustration: "I already set the record, why won't it verify?"
- Support tickets
- Users may give up on custom domain setup

**Prevention:**
- **Query authoritative nameservers directly** instead of the system resolver. Extract the domain's NS records first, then query those nameservers for the A record. This bypasses local caching.
- **Query multiple public DNS resolvers** (Google 8.8.8.8, Cloudflare 1.1.1.1, Quad9 9.9.9.9) and accept verification if ANY of them return the correct IP.
- **Show clear status messages:** "DNS record found on Cloudflare DNS but not yet on Google DNS. Propagation in progress -- this can take up to 48 hours."
- **Auto-retry verification** on a timer (every 5 minutes for 48 hours) instead of requiring manual re-checks.
- **Warn users BEFORE they start:** "After adding your DNS record, verification usually takes 5-30 minutes but can take up to 48 hours."

**Detection:** Compare verification results across multiple DNS resolvers; log discrepancies.

---

### HIGH-3: `on_demand_tls` Ask Endpoint Becomes SPOF

**Severity:** HIGH
**Phase:** SSL/Caddy configuration phase (if using on_demand_tls approach)
**What goes wrong:** If the `ask` endpoint (which checks whether a domain is authorized for certificate issuance) goes down, crashes, or responds slowly, Caddy cannot issue ANY new certificates. All first-time HTTPS connections to custom domains fail with a TLS error. The ask endpoint is called during the TLS handshake, so latency directly impacts user experience.

**Why it happens:** The ask endpoint runs inside the LivOS application (livinityd). If livinityd crashes, is restarting, or is under heavy load, the ask endpoint becomes unavailable. Caddy documentation explicitly states the ask endpoint should "return as fast as possible, in a few milliseconds."

**Consequences:**
- New custom domain visitors get TLS handshake failures
- Slow ask endpoint causes first-visit latency spikes (seconds of delay)
- If livinityd restarts frequently, certificate acquisition is unreliable

**Prevention:**
- **Keep the ask endpoint extremely simple:** Direct Redis GET to check domain authorization. No database queries, no network calls, no authentication middleware. Example: `GET /internal/domain-check?domain=X` -> Redis `GET livos:custom_domain:X` -> 200 or 404.
- **Run the ask endpoint on a separate lightweight HTTP server** (not through Express/tRPC middleware stack) to isolate it from application load.
- **Health monitoring:** Alert if ask endpoint latency exceeds 50ms.
- **Fallback:** If the ask endpoint is unreachable, Caddy rejects the certificate request. This is safe (better to reject than issue unauthorized certs) but should be logged.

**Detection:** Monitor ask endpoint response times; Caddy logs show "on-demand certificate" errors.

---

### HIGH-4: Caddyfile Rewrite Erases Native App Subdomains

**Severity:** HIGH
**Phase:** Caddy configuration management phase
**What goes wrong:** The current `rebuildCaddy()` function (routes.ts line 62-75) regenerates the ENTIRE Caddyfile from Redis state, including native app entries (desktop streaming `pc.{domain}` from v18.0). If the native app registration is missed during regeneration -- due to a race condition, import failure, or code change -- the desktop streaming subdomain silently disappears from the Caddyfile, breaking remote desktop access.

**Why it happens:** The rebuild function dynamically imports `NATIVE_APP_CONFIGS` each time. Any change to native app registration, or a new native app added in a future version, must be known to the domain module. This is a fragile coupling.

**Consequences:**
- Remote desktop streaming stops working after a domain config change
- User has no indication why `pc.{domain}` stopped loading
- Hard to debug because the Caddyfile looks "correct" (just missing entries)

**Prevention:**
- **Move to `on_demand_tls` for custom domains** so that Caddyfile changes are only needed for platform-owned domains, reducing reload frequency.
- **If keeping Caddyfile approach:** Add a Caddyfile validation step after generation that checks all expected entries (main domain, all subdomains, all native apps, all custom domains) are present before writing to disk.
- **Integration test:** After every Caddyfile regeneration, verify all expected domain blocks exist.
- **Consider making native app entries statically declared** in the Caddyfile template rather than dynamically imported.

**Detection:** Post-reload health check that verifies all expected domains respond.

---

### HIGH-5: Domain Sync Stale State Through Tunnel

**Severity:** HIGH
**Phase:** Domain sync via tunnel relay phase
**What goes wrong:** Custom domains are registered on livinity.io (Server5) and must be synced to LivOS instances via the tunnel WebSocket. If the tunnel disconnects during a domain sync, or the LivOS instance is offline when domains are modified on the platform, the LivOS instance has stale domain data. It may serve old domain mappings or miss new ones.

**Why it happens:** The current tunnel protocol (`tunnel-client.ts`) has no domain sync mechanism. The `connected` handler auto-configures the assigned URL but has no concept of custom domain lists. Domain sync is a new protocol message type that must be designed.

**Consequences:**
- User adds domain on livinity.io dashboard, but LivOS doesn't know about it
- Domain shows "active" on platform but returns errors on the actual server
- After tunnel reconnect, domains may be in inconsistent state

**Prevention:**
- **Design sync as "full state snapshot + incremental updates":**
  1. On tunnel connect/reconnect, relay sends the FULL list of verified custom domains for this user
  2. Between reconnects, relay sends incremental add/remove messages
  3. LivOS replaces its domain list entirely on full sync (no merge logic)
- **Idempotent sync messages:** Each sync message contains the complete domain config, not just a diff. This prevents ordering issues.
- **Heartbeat-based freshness:** If no sync message received in X minutes, LivOS requests a full resync.
- **Persist synced domains in Redis/PostgreSQL** on LivOS so they survive livinityd restarts without waiting for tunnel reconnect.

**Detection:** Compare domain lists between platform DB and LivOS Redis; alert on mismatches.

---

## Moderate Pitfalls

Issues that cause confusion, degraded UX, or require workarounds.

---

### MOD-1: Wildcard SSL Conflicts with Per-Domain SSL

**Severity:** MODERATE
**Phase:** Caddy configuration phase
**What goes wrong:** Livinity already uses a wildcard certificate for `*.livinity.app` (via Cloudflare DNS challenge with `CF_API_TOKEN`). When adding per-domain certificates for custom domains via HTTP-01 or on_demand_tls, the Caddyfile needs to carefully separate the two certificate acquisition methods. Misconfiguration can cause Caddy to attempt HTTP-01 for `*.livinity.app` (which fails) or DNS-01 for custom domains (which requires DNS provider access).

**Prevention:**
- Explicitly configure TLS challenge type per domain block in the Caddyfile:
  - `*.livinity.app` and `*.livinity.io`: DNS challenge with Cloudflare plugin
  - Custom domains: HTTP-01 challenge (default) via `on_demand_tls`
- Test that adding a custom domain block does not interfere with wildcard renewal.

---

### MOD-2: Port 80 Not Accessible Blocks HTTP-01 Challenge

**Severity:** MODERATE
**Phase:** SSL provisioning phase
**What goes wrong:** HTTP-01 ACME challenge requires port 80 to be externally accessible. Many home server setups have port 80 blocked by ISP, firewall, or NAT. The current `ensureFirewallPorts()` in `firewall.ts` opens local firewall ports but cannot fix ISP-level blocks or router NAT.

**Prevention:**
- **Pre-check port accessibility** before attempting certificate issuance. Test if port 80 is reachable from outside (e.g., use an external port-check API).
- **Show clear error message:** "Port 80 must be accessible from the internet for SSL certificates. Check your router port forwarding and ISP restrictions."
- **Document ISP restrictions** as a known limitation for home server users.
- **Future enhancement:** Support DNS-01 challenge as fallback for users who cannot open port 80 (requires DNS provider API integration).

---

### MOD-3: Domain-to-App Mapping Ambiguity with Subdomains

**Severity:** MODERATE
**Phase:** Domain-to-app mapping phase
**What goes wrong:** User adds `example.com` and maps it to App A. They also want `blog.example.com` mapped to App B. The system needs to handle both the apex domain and subdomains of a custom domain. The current subdomain routing logic in the app gateway only handles one level of subdomain extraction. `blog.example.com` is a subdomain of the custom domain, not a subdomain of the platform domain.

**Prevention:**
- **Support explicit subdomain entries:** Allow users to add both `example.com` and `blog.example.com` as separate custom domain entries, each mapped to a different app.
- **Match by exact hostname, not by subdomain extraction.** The custom domain lookup should be `hostname -> app` mapping, not trying to parse subdomain prefixes from custom domains.
- **Wildcard custom domains** (e.g., `*.example.com`) should be deferred -- too complex for v19.0.

---

### MOD-4: TXT Record Token Collision Across Users

**Severity:** MODERATE
**Phase:** DNS verification phase
**What goes wrong:** If TXT verification tokens are predictable or short, two users trying to verify different domains could theoretically use the same token format, or an attacker could pre-populate TXT records for domains they anticipate others will add.

**Prevention:**
- **Generate cryptographically random tokens** per domain per user: `livinity-verify=<userId>:<crypto.randomUUID()>`
- **Include user ID in the token** so the platform can verify both the token AND the user.
- **Expire verification tokens** after 7 days; require regeneration.
- **Store tokens in PostgreSQL** (platform DB), not just in the TXT record format.

---

### MOD-5: Caddy `on_demand_tls` Abuse Vector

**Severity:** MODERATE
**Phase:** SSL provisioning phase
**What goes wrong:** Without the `ask` endpoint, anyone who points a domain at the LivOS server will trigger certificate issuance. Even WITH the `ask` endpoint, an attacker could point many domains at the server and cause thousands of TLS handshakes that hit the ask endpoint, creating a DoS vector.

**Prevention:**
- **Always configure the `ask` endpoint** -- Caddy docs explicitly warn that on_demand_tls in production is "insecure" without it.
- **Rate-limit the ask endpoint** itself: max 10 requests per second per source IP.
- **The `ask` endpoint must be a LOCAL endpoint** (127.0.0.1) not exposed externally.
- **Caddy's `interval` and `burst` options are deprecated** (per current docs). Rely on the `ask` endpoint + external rate limiting instead.

---

### MOD-6: Redis State Loss Breaks Domain Configuration

**Severity:** MODERATE
**Phase:** All domain-related phases
**What goes wrong:** Current domain configuration is stored entirely in Redis (`livos:domain:config`, `livos:domain:subdomains`). Redis data can be lost on restart if persistence is not configured, or during a Redis crash. All custom domain mappings, verification status, and Caddy config state would be lost.

**Prevention:**
- **Store custom domain configuration in PostgreSQL** (already used for user data), not Redis.
- **Use Redis only as a cache** for fast lookups (ask endpoint, app gateway routing).
- **On livinityd startup:** Rebuild Redis cache from PostgreSQL source of truth.
- **This aligns with existing architecture:** User data is in PostgreSQL, ephemeral state is in Redis.

---

## Minor Pitfalls

Issues that cause minor inconvenience or edge-case problems.

---

### MINOR-1: DNS Verification Fails Behind CDN/Proxy

**What goes wrong:** If the user's domain is behind Cloudflare proxy (orange cloud), the A record resolves to Cloudflare's IP, not the LivOS server IP. DNS verification fails even though the domain is correctly configured.

**Prevention:**
- Detect Cloudflare IPs and show a message: "Your domain appears to be behind Cloudflare proxy. Please set the DNS record to 'DNS only' (grey cloud) mode for verification."
- After verification, user can re-enable proxy if desired (though this may break direct access).

---

### MINOR-2: Domain Already Claimed by Another User

**What goes wrong:** User B tries to add `example.com` which User A has already verified. Without a uniqueness check, both users could have the same domain, causing routing conflicts.

**Prevention:**
- Platform-level uniqueness constraint in PostgreSQL: `UNIQUE(domain)` across all users.
- Clear error message: "This domain is already registered by another user."
- Support process for domain transfer disputes.

---

### MINOR-3: Certificate Renewal Failure After DNS Change

**What goes wrong:** User verifies domain and gets certificate. Months later, they change their A record to point elsewhere. When certificate renewal time comes (60-90 days), the HTTP-01 challenge fails because the domain no longer points to the LivOS server. Caddy retries, consuming rate limits.

**Prevention:**
- Periodic DNS re-verification (see CRITICAL-3) catches this before renewal fails.
- Caddy handles renewal failures gracefully (switches to staging environment after repeated failures).
- Alert user when their domain's DNS no longer points to the server.

---

### MINOR-4: Unicode/IDN Domain Names

**What goes wrong:** User enters a Unicode domain name (e.g., `beispiel.de` with umlauts). The current `DOMAIN_RE` regex in `caddy.ts` only allows ASCII characters. Internationalized domain names (IDN) require Punycode conversion.

**Prevention:**
- Convert IDN domains to Punycode (ASCII-compatible encoding) before validation and storage.
- Display the Unicode version in the UI but store and use Punycode internally.
- Use Node.js `url.domainToASCII()` for conversion.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Architecture decision: tunnel vs direct | CRITICAL-1: ACME challenge routing | CRITICAL | Decide early: custom domains = direct access only |
| Platform domain CRUD (livinity.io) | MOD-4: Token collision | MODERATE | Crypto-random tokens with user ID |
| DNS verification | HIGH-2: False negatives from caching | HIGH | Query authoritative nameservers directly |
| DNS verification | CRITICAL-3: One-time verification bypass | CRITICAL | Periodic re-verification + TXT ownership proof |
| Domain sync via tunnel | HIGH-5: Stale state on reconnect | HIGH | Full state snapshot on connect |
| App gateway routing | HIGH-1: Gateway ignores custom domains | HIGH | Add hostname-based lookup before subdomain check |
| Caddy SSL provisioning | CRITICAL-2: Reload disruption | CRITICAL | Use on_demand_tls for custom domains |
| Caddy SSL provisioning | CRITICAL-4: Rate limit exhaustion | CRITICAL | DNS-verify before cert issuance; per-instance ACME accounts |
| Caddy SSL provisioning | HIGH-3: Ask endpoint SPOF | HIGH | Lightweight Redis-only endpoint |
| Caddy config management | HIGH-4: Native app erasure | HIGH | Validation step after Caddyfile generation |
| Domain-to-app mapping | MOD-3: Subdomain ambiguity | MODERATE | Exact hostname matching |

## Key Architectural Recommendation

**Use Caddy's `on_demand_tls` with an `ask` endpoint** instead of regenerating the Caddyfile for each custom domain. This is the single most impactful decision because it:

1. Eliminates Caddyfile reloads for custom domains (prevents CRITICAL-2)
2. Naturally enforces domain verification before cert issuance (prevents CRITICAL-4)
3. Removes the native app erasure risk (prevents HIGH-4)
4. Scales to hundreds of domains without configuration file growth
5. Is the recommended pattern by Caddy for multi-tenant platforms

**Recommended Caddyfile structure:**

```
{
    on_demand_tls {
        ask http://127.0.0.1:8080/internal/domain-check
    }
}

# Platform-owned domains (static, DNS-01 challenge via Cloudflare)
{$MAIN_DOMAIN} {
    reverse_proxy 127.0.0.1:8080
}

*.{$MAIN_DOMAIN} {
    tls {
        dns cloudflare {$CF_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080
}

# Custom domains (dynamic, HTTP-01 challenge via on_demand_tls)
https:// {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:8080
}
```

## Sources

- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/) -- verified June 2025 update, HIGH confidence
- [Caddy On-Demand TLS Documentation](https://caddyserver.com/docs/caddyfile/options) -- official docs, HIGH confidence
- [Caddy Automatic HTTPS Documentation](https://caddyserver.com/docs/automatic-https) -- official docs, HIGH confidence
- [Caddy TLS Directive Documentation](https://caddyserver.com/docs/caddyfile/directives/tls) -- official docs, HIGH confidence
- [Pirsch: Custom Domains with Caddy](https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/) -- real-world implementation, MEDIUM confidence
- [Honeybadger: Secure Custom Domains with Caddy](https://www.honeybadger.io/blog/secure-custom-domains-caddy/) -- real-world implementation, MEDIUM confidence
- [FiveNines: Caddy TLS On-Demand Guide](https://fivenines.io/blog/caddy-tls-on-demand-complete-guide-to-dynamic-https-with-lets-encrypt/) -- tutorial, MEDIUM confidence
- [NameSilo: TXT vs CNAME Verification](https://www.namesilo.com/blog/en/dns/custom-domains-in-saas-txt-vs-cname-verification-and-when-to-use-each) -- comparison, MEDIUM confidence
- [Let's Encrypt Challenge Types](https://letsencrypt.org/docs/challenge-types/) -- official docs, HIGH confidence
- [Microsoft: Prevent Subdomain Takeovers](https://learn.microsoft.com/en-us/azure/security/fundamentals/subdomain-takeover) -- security guidance, HIGH confidence
- [Caddy GitHub Issue #6732: Certificate renewal stuck after issuer change](https://github.com/caddyserver/caddy/issues/6732) -- verified bug report, HIGH confidence
- Codebase analysis: `livos/packages/livinityd/source/modules/domain/caddy.ts`, `dns-check.ts`, `routes.ts`, `tunnel-client.ts`, `server/index.ts` -- direct code review, HIGH confidence
