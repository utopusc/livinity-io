---
phase: 09-tunnel-sync-livos-domain-receiver
verified: 2026-03-26T12:45:00Z
status: human_needed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "LivOS stores synced domains in local PostgreSQL and Redis cache"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Verify domain appears in LivOS within 30 seconds of platform verification"
    expected: "After DNS verification on platform, domain shows up in LivOS Redis within 30 seconds via relay tunnel and is also persisted to PostgreSQL custom_domains table"
    why_human: "Requires a live tunnel connection between platform and LivOS. Cannot verify timing or end-to-end message delivery programmatically."
  - test: "Verify domain syncs on reconnect after LivOS was offline during verification"
    expected: "Connecting LivOS receives domain_list_sync with all verified domains immediately after tunnel connect; domains written to both Redis and PostgreSQL"
    why_human: "Requires simulating offline/reconnect scenario with an active relay."
  - test: "Verify DNS-Changed status pauses routing"
    expected: "After dns_changed transition, routeCustomDomain() returns false and traffic is not served to the app container"
    why_human: "Requires DNS environment manipulation and live routing observation."
---

# Phase 09: Tunnel Sync + LivOS Domain Receiver Verification Report

**Phase Goal:** Verified domains sync from platform to LivOS via tunnel, stored locally for app gateway routing.
**Verified:** 2026-03-26T12:45:00Z
**Status:** human_needed (all automated checks passed; gap closed)
**Re-verification:** Yes — after gap closure (Plan 09-03)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | When a domain is verified on the platform, a domain_sync message is sent through the relay to LivOS | VERIFIED | `dns-polling.ts` calls `notifyRelayDomainSync(user_id, 'add', domain, 'dns_verified')` after `db.update()`. `server.ts` `/internal/domain-sync` forwards `domain_sync` via `tunnel.ws.send()`. |
| 2 | When LivOS reconnects to the relay, it receives a full domain_list_sync with all verified/active domains | VERIFIED | `sendDomainListSync()` called in both new-session and reconnect branches of `onTunnelConnect` in `index.ts` (lines 216, 241). Queries `custom_domains WHERE status IN ('dns_verified', 'active')`. |
| 3 | LivOS stores synced domains in local PostgreSQL and Redis cache | VERIFIED | Redis: per-domain keys `livos:custom_domain:{hostname}` and list key `livos:custom_domains` (unchanged from plan 01). PostgreSQL: `handleDomainSync` upserts/deletes via `INSERT ON CONFLICT DO UPDATE` / `DELETE FROM custom_domains WHERE domain=$1`; `handleDomainListSync` performs transactional `BEGIN/DELETE/INSERT*/COMMIT`. All guarded by `if (pgPool)` null check. Commit bfccf0f. |
| 4 | When DNS re-verification detects a change, domain_sync with updated status is sent to LivOS | VERIFIED | `dns-polling.ts` calls `notifyRelayDomainSync(user_id, 'update', domain, 'dns_changed')` after `db.update()` sets `status: 'dns_changed'` (line 170). |
| 5 | Custom domain requests on LivOS route to the correct Docker container based on app_mapping | VERIFIED | `routeCustomDomain()` in `server/index.ts` reads `livos:custom_domain:{hostname}` from Redis, resolves `appMapping[subPrefix]` to app slug, looks up port via `livos:domain:subdomains`, proxies to `http://127.0.0.1:{port}`. |
| 6 | Relay resolves targetApp from custom domain app_mapping before forwarding to tunnel | VERIFIED | `resolveCustomDomainApp()` imported and called in both `server.ts` HTTP path (line 251) and `index.ts` WebSocket path (line 576). |
| 7 | Custom domain WebSocket upgrades also resolve targetApp from app_mapping | VERIFIED | `index.ts` upgrade handler calls `resolveCustomDomainApp(hostname!, customDomain)` before `handleWsUpgrade`. LivOS `server/index.ts` also handles WebSocket upgrades via Redis lookup. |

**Score:** 7/7 truths verified

---

## Gap Closure Verification (Plan 09-03)

### Must-Haves from Plan 09-03 Frontmatter

| Truth | Status | Evidence |
|-------|--------|---------|
| handleDomainSync upserts domain into PostgreSQL custom_domains on add/update and deletes on remove | VERIFIED | Lines 663-671 (delete branch), 683-699 (upsert branch). Parameterized queries. `INSERT INTO custom_domains ... ON CONFLICT (domain) DO UPDATE SET app_mapping=EXCLUDED.app_mapping, status=EXCLUDED.status, synced_at=NOW()` and `DELETE FROM custom_domains WHERE domain=$1`. |
| handleDomainListSync replaces all rows in PostgreSQL custom_domains with received domain list | VERIFIED | Lines 731-750. `BEGIN` → `DELETE FROM custom_domains` (all rows) → loop `INSERT INTO custom_domains` per domain → `COMMIT`. ROLLBACK on error, `client.release()` in finally. |
| PostgreSQL writes are non-blocking — Redis remains the primary fast-path; PG failures log errors but do not break sync | VERIFIED | Each PG block is an independent `try/catch`. Errors are logged via `this.logger.error(...)`. Redis writes execute before PG blocks. Ack (`domain_sync_ack`) sent from outer try/catch that is independent of PG result. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` | PostgreSQL INSERT/UPDATE/DELETE in domain sync handlers | VERIFIED | 1 `getPool` import; 2 `INSERT INTO custom_domains`; 2 `DELETE FROM custom_domains`; 1 `ON CONFLICT`; 3 `if (pgPool)` guards; 1 `ROLLBACK`; 2 `COMMIT`. Commit bfccf0f (49 insertions, 0 deletions to existing lines). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tunnel-client.ts` | `database/index.ts` | `import {getPool}` (line 214) | WIRED | `getPool` is exported from `database/index.ts` line 43. Import resolves to `../database/index.js`. |
| `handleDomainSync` | `custom_domains` table | `INSERT ON CONFLICT DO UPDATE` / `DELETE` | WIRED | Both branches present at lines 667 and 687-695 with parameterized `$1/$2/$3` values. |
| `handleDomainListSync` | `custom_domains` table | `BEGIN/DELETE FROM custom_domains/INSERT INTO custom_domains/COMMIT` | WIRED | Transaction at lines 735-744. `client.release()` in finally block. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| DOM-03 | 09-01, 09-03 | When domain is verified, platform sends `domain_sync` through relay WebSocket to LivOS. On reconnect, full domain list via `domain_list_sync`. LivOS stores in local PostgreSQL + Redis cache. | SATISFIED | Sync pipeline fully wired (plans 01+02). Redis storage working. PostgreSQL persistence added by plan 03: `handleDomainSync` upserts/deletes, `handleDomainListSync` transactionally replaces all rows. Gap closed. |
| DOM-06 | 09-02 | Users map custom domains to Docker apps. Mapping stored on LivOS, app gateway routes based on hostname. | SATISFIED | `resolveCustomDomainApp` resolves app slug from `appMapping`. LivOS `routeCustomDomain()` routes to correct container port via Redis O(1) lookup. |
| DOM-07 | 09-01 | Background job re-checks DNS every 12 hours. Status transitions to `dns_changed` if A record changes; routing paused. | SATISFIED | `dns-polling.ts` re-verifies `dns_verified`/`active` domains every 12 hours. On DNS change sets `status: 'dns_changed'` and calls `notifyRelayDomainSync`. `routeCustomDomain()` returns false for `dns_changed` domains. |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TODO/FIXME/placeholder patterns. No empty handlers. No static returns. All PG queries use parameterized `$1/$2/$3` values. Redis logic unchanged. |

---

## Human Verification Required

### 1. End-to-End Domain Sync Timing (DOM-03 UAT)

**Test:** On the platform, complete DNS verification for a custom domain while a LivOS instance is online with an active tunnel.
**Expected:** Domain appears in LivOS Redis (`livos:custom_domain:{domain}`) within 30 seconds AND is persisted to PostgreSQL `custom_domains` table. Custom domain request through relay reaches the correct Docker container.
**Why human:** Requires a live tunnel WebSocket connection, platform DNS verification flow, and relay routing. Cannot be verified statically.

### 2. Offline/Reconnect Resilience (DOM-03 UAT)

**Test:** Verify a domain while LivOS is offline. Reconnect the LivOS tunnel.
**Expected:** On reconnect, LivOS immediately receives `domain_list_sync` containing the newly verified domain. Domain written to both Redis and PostgreSQL. Domain becomes routable after reconnect.
**Why human:** Requires controlling LivOS connectivity state and observing message receipt over live WebSocket.

### 3. DNS-Changed Routing Pause (DOM-07 UAT)

**Test:** Manually trigger a `dns_changed` status transition. Attempt to access the custom domain through LivOS.
**Expected:** Request returns 503 or falls through (not served). After re-verification polling runs, domain stops serving traffic.
**Why human:** Requires DNS environment manipulation and live routing observation.

---

## Re-verification Summary

**Previous status:** gaps_found (6/7) — `handleDomainSync` and `handleDomainListSync` wrote only to Redis, not PostgreSQL.

**Gap closed by Plan 09-03 (commit bfccf0f):**
- `getPool` imported from `../database/index.js` (line 214)
- `handleDomainSync` remove branch: `DELETE FROM custom_domains WHERE domain=$1` (lines 664-671)
- `handleDomainSync` add/update branch: `INSERT INTO custom_domains ... ON CONFLICT (domain) DO UPDATE` (lines 684-699)
- `handleDomainListSync`: transactional `BEGIN / DELETE FROM custom_domains / INSERT INTO custom_domains (loop) / COMMIT` with ROLLBACK on error and `client.release()` in finally (lines 731-750)
- All PG writes guarded by `if (pgPool)` null check — YAML-only mode silently skips PG
- All PG writes in independent try/catch — PG failures do not prevent Redis writes or ack messages

**No regressions detected.** Redis write counts unchanged (5 occurrences of `livos:custom_domain:` pattern, 2 of `livos:custom_domains`). Only additions to the file (49 insertions, 0 deletions of existing lines per git diff).

All automated checks pass. Phase goal is fully achieved. Remaining items are live end-to-end UAT scenarios that require an active tunnel connection.

---

_Verified: 2026-03-26T12:45:00Z_
_Verifier: Claude (gsd-verifier)_
