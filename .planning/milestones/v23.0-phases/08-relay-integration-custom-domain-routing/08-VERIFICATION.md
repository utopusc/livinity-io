---
phase: 08-relay-integration-custom-domain-routing
verified: 2026-03-26T12:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 08: Relay Integration Custom Domain Routing — Verification Report

**Phase Goal:** Relay's Caddy serves custom domains with auto-SSL and routes traffic through tunnel to correct LivOS.
**Verified:** 2026-03-26T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                              | Status     | Evidence                                                                                          |
|----|------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------|
| 1  | Ask endpoint authorizes verified custom domains (returns 200)                      | VERIFIED   | `server.ts:67-72` — `isCustomDomainAuthorized` called; 200 returned when true                    |
| 2  | Ask endpoint rejects unverified/unknown custom domains (returns 404)               | VERIFIED   | `server.ts:78-80` — 404 returned when `isCustomDomainAuthorized` returns false or throws          |
| 3  | Ask endpoint responds within 200ms using Redis cache                               | VERIFIED   | `custom-domains.ts:172-173` — Redis cache checked first; DB only on cache miss; 60s TTL           |
| 4  | Existing *.livinity.io subdomain authorization still works unchanged               | VERIFIED   | `server.ts:54-89` — `parseSubdomain(domain)` runs first; custom domain check only runs after no username found |
| 5  | Caddyfile catch-all `https://` block is ordered AFTER explicit livinity.io blocks  | VERIFIED   | `Caddyfile:34-43` — `https://` block is last; `livinity.io`, `*.livinity.io`, `*.*.livinity.io` precede it |
| 6  | HTTP requests to custom domains are routed through the correct user's tunnel       | VERIFIED   | `server.ts:171-212` — `lookupCustomDomain` -> `registry.get(customDomain.username)` -> `proxyHttpRequest` |
| 7  | WebSocket upgrades on custom domains are routed through the correct user's tunnel  | VERIFIED   | `index.ts:533-545` — async upgrade handler calls `lookupCustomDomain` -> `handleWsUpgrade(req, socket, head, tunnel, null)` |
| 8  | Custom domain routing resolves the domain owner's username for tunnel lookup       | VERIFIED   | `custom-domains.ts:134-151` — DB query JOINs `custom_domains` with `users` to return `username`  |
| 9  | Existing *.livinity.io HTTP and WebSocket routing still works unchanged            | VERIFIED   | Both `server.ts:161` and `index.ts:522` run `parseSubdomain` first; custom domain path guarded by `if (!username)` |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact                                  | Expected                                             | Status     | Details                                                                      |
|-------------------------------------------|------------------------------------------------------|------------|------------------------------------------------------------------------------|
| `platform/relay/src/schema.sql`           | `custom_domains` table + 3 indexes                   | VERIFIED   | Lines 133-150: table with all 12 columns; 3 indexes present and idempotent   |
| `platform/relay/src/custom-domains.ts`    | Redis cache layer + DB lookup, 4 exports             | VERIFIED   | Exports: `lookupCustomDomain`, `isCustomDomainAuthorized`, `warmDomainCache`, `invalidateDomainCache` |
| `platform/relay/src/server.ts`            | Extended ask endpoint + custom domain HTTP routing   | VERIFIED   | `handleAskRequest` (4-arg, with `redis`) + `createRequestHandler` custom domain block |
| `platform/relay/Caddyfile`                | Catch-all `https://` block                           | VERIFIED   | Lines 34-43: `https://` block with `on_demand` TLS and `X-Custom-Domain` header |
| `platform/relay/src/index.ts`             | `warmDomainCache` on startup + custom domain WS      | VERIFIED   | Line 81: `warmDomainCache(pool, redis)` called after schema; lines 533-545: WS upgrade routing |
| `platform/relay/src/ws-proxy.ts`          | `handleWsUpgrade` with optional `targetAppOverride`  | VERIFIED   | Line 66: `targetAppOverride?: string | null` parameter; lines 72-74: override respected |

---

### Key Link Verification

| From                        | To                           | Via                                        | Status   | Details                                                                 |
|-----------------------------|------------------------------|--------------------------------------------|----------|-------------------------------------------------------------------------|
| `server.ts`                 | `custom-domains.ts`          | `import isCustomDomainAuthorized, lookupCustomDomain` | WIRED | Line 18: both imported and used at lines 67 and 174                    |
| `custom-domains.ts`         | Redis                        | `relay:custom-domain:` key prefix          | WIRED    | Lines 31-32: constants defined; used throughout GET/SET operations      |
| `Caddyfile`                 | `server.ts`                  | `ask http://localhost:4000/internal/ask`   | WIRED    | Line 3: ask URL; `server.ts:120-122`: endpoint handler wired            |
| `server.ts`                 | `tunnel-registry.ts`         | `registry.get(customDomain.username)`      | WIRED    | Line 176: `registry.get(customDomain.username)`                         |
| `index.ts`                  | `custom-domains.ts`          | `lookupCustomDomain` for WS upgrade        | WIRED    | Line 26: imported; line 536: called in upgrade handler                  |
| `server.ts`                 | `request-proxy.ts`           | `proxyHttpRequest(tunnel, req, res, null)` | WIRED    | Line 208: `proxyHttpRequest(cdTunnel, req, res, null)`                  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                 | Status        | Evidence                                                                                 |
|-------------|-------------|-----------------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------------|
| DOM-04      | 08-01, 08-02 | Relay Caddy ask endpoint extended; catch-all https:// block; traffic routed through tunnel | SATISFIED | Ask endpoint in `server.ts:32-106`; Caddyfile `https://` block; HTTP+WS routing in `server.ts` + `index.ts` |
| DOM-NF-01   | 08-01        | Ask endpoint responds within 200ms via Redis cache                          | SATISFIED     | `custom-domains.ts`: Redis checked first on every call; 60s positive TTL; 30s negative TTL |
| DOM-NF-02   | 08-01        | Only DNS-verified domains authorized (no cert for unverified)               | SATISFIED     | `custom-domains.ts:41`: `AUTHORIZED_STATUSES = ['dns_verified', 'active']`; error path defaults to 404 |
| DOM-NF-04   | 08-01, 08-02 | Existing *.livinity.io routing completely unaffected                        | SATISFIED     | `parseSubdomain` runs first in all handlers; custom domain code only executes inside `if (!username)` guards |

No orphaned requirements found. All phase-declared IDs (DOM-04, DOM-NF-01, DOM-NF-02, DOM-NF-04) are accounted for in both plans and implemented.

---

### Anti-Patterns Found

No blockers or stubs detected.

| File                                  | Pattern Checked                     | Result  |
|---------------------------------------|-------------------------------------|---------|
| `platform/relay/src/custom-domains.ts` | Empty returns, TODO, placeholder   | None    |
| `platform/relay/src/server.ts`        | Hardcoded empty data, stub handlers | None    |
| `platform/relay/src/index.ts`         | warmDomainCache called but ignored  | None — result awaited and logged |
| `platform/relay/src/ws-proxy.ts`      | targetAppOverride ignored           | None — correctly respected at line 72-74 |
| `platform/relay/Caddyfile`            | X-Custom-Domain header missing      | None — present at line 41 |

---

### Human Verification Required

#### 1. End-to-End TLS Provisioning

**Test:** Point a verified custom domain's A record to the relay IP (Server5: 45.137.194.102), ensure it has `status = 'dns_verified'` in the `custom_domains` table, then open `https://<custom-domain>` in a browser.
**Expected:** Caddy provisions a Let's Encrypt certificate automatically; browser shows a valid SSL certificate issued for the custom domain; page content comes from the user's LivOS instance.
**Why human:** Certificate provisioning requires a live public domain, real DNS, and Caddy running — cannot be verified by code inspection alone.

#### 2. Catch-All Caddy Block Ordering at Runtime

**Test:** On Server5, run `caddy validate --config /path/to/Caddyfile` and send an HTTP request to the relay on port 80 from a custom domain hostname that is NOT a livinity.io subdomain.
**Expected:** Caddy routes to the `https://` catch-all block (not to any *.livinity.io block); no routing conflict logged.
**Why human:** Caddy block-matching behavior at runtime (especially for wildcards vs. catch-all) depends on the live Caddy version and may differ from static analysis.

#### 3. WebSocket Upgrade on Custom Domain

**Test:** From a browser, open a WebSocket connection to `wss://<verified-custom-domain>/some-path` while the domain owner's LivOS tunnel is connected.
**Expected:** Upgrade completes successfully; frames relay bidirectionally; `handleWsUpgrade` receives `targetAppOverride = null`.
**Why human:** Async WebSocket upgrade handler correctness requires a live tunnel and browser to confirm frame routing works end-to-end.

---

### Gaps Summary

None. All automated checks passed. The phase fully achieves its goal: Relay's Caddy serves custom domains with auto-SSL (via the extended ask endpoint and catch-all `https://` block) and routes both HTTP and WebSocket traffic through the tunnel to the correct LivOS instance. Three items above require human testing against a live environment but do not represent code deficiencies.

---

_Verified: 2026-03-26T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
