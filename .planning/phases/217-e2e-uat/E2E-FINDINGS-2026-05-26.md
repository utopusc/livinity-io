# v41 Live E2E Test Findings — 2026-05-26

**Tested by:** autonomous Claude (operator + curl) post-deploy.
**Production state at start:** Vercel hotfix `e26384ea` deployed, Mini PC SHA `e26384e`, Vercel Firewall: Bot Protection + Attack Mode OFF.

## ✅ WORKS

| Area | Evidence |
|---|---|
| **Vercel deploy auto-trigger on push** | 38 commits pushed, every one auto-built. |
| **Mini PC `update.sh`** | GitHub clone → rsync → pnpm install → tsc build → systemctl restart. ~2-3 min E2E. SHA tracked in `/opt/livos/data/deployed-sha`. |
| **Supabase migrations live** | `phase_212_admin_auth`, `phase_212_bandwidth_rollups`, `phase_215_install_commands`. is_admin column + bandwidth rollup trigger + install_commands queue table. |
| **Admin panel UI** | `/admin` 7 KPI + bar charts, `/admin/users` paginated, `/admin/users/[id]` full 6-section drill-down, `/admin/tunnels` real table, `/admin/store` curation. Cookie session bridge ✓ via `/api/admin/whoami`. |
| **CARRY-P212-TUNNEL-PERSIST** | Mini PC tunnel-presence INSERTs to `tunnel_connections` on subscribe → /admin/tunnels NOT empty anymore. `id=b2e74fc5...`, client_ip captured (`50.175.214.163`), client_version=`146.0.0`. |
| **Install queue: queue → claim → execute pipeline** | Queue OK, claim OK (12:04:23 started), local user resolution OK, poller dispatches to installForUser. |
| **Logout** | Sidebar foot button, clears cookie+sessionStorage, redirect /login. |
| **Bot Protection lessons** | Documented in [[vercel-firewall-livinity-io]]. 5s polling tripped Vercel Attack Challenge Mode. Hotfix: 60s + 5min 429-backoff + Redis kill-switch. |

## 🔴 ACTIVE GAPS (need code fix)

### 1. `installForUser` section-aware dispatch
**File:** `livos/packages/livinityd/source/modules/apps/apps.ts:1141`

`installForUser(appId, userId)` assumes Docker compose path. Calling it for an MCP (`section='ai'`) app returns:
```
Cannot read properties of null (reading 'services')
```
because the manifest has no Docker compose services. MCP apps need `ai-installer.ts` path. Either:
- (A) `Apps.installForUser` reads section + dispatches to right installer.
- (B) New `Apps.installAppForUser(appId, userId)` that's section-aware and the original stays Docker-only.
- (C) Poller reads section from queue and calls separate Apps methods.

**Carry:** `CARRY-P215-SECTION-DISPATCH` — ~50-80 LOC, blocks WIRE-05 live MCP install.

### 2. `liv:mcp:config` Redis type drift
Mini PC has `liv:mcp:config` as **STRING** (JSON blob) — but the P211 defensive guard assumed HASH. Live state:
```
TYPE liv:mcp:config → string
GET → {"mcpServers":{"filesystem":{...}}}
```
The Phase 211 dual-writer guard refused HASH writes on what was actually a STRING. The architectural bet (HASH primitive) is wrong vs lived reality (JSON blob). Two paths:
- Accept STRING as canonical → revert the P211 HASH-guard.
- Migrate live to HASH → write migration script.

**Carry:** `CARRY-P211-UNIFY-RECONCILE` — pick a canonical form and stick to it. ~30 LOC migration + guard update.

### 3. `livos:platform:install_poller_disabled` lifecycle
Currently the kill-switch is operator-managed (set via redis-cli). After this incident I set it then cleared it. There's no UI to toggle it. For an emergency operator panic-stop, the UI should expose this — admin panel "Pause install queue" button.

**Carry:** `CARRY-P215-POLLER-UI-CONTROL` — toggle in /admin/dashboard or /admin/walkthrough. ~20 LOC.

## 🟡 NICE-TO-HAVE (UX)

### 4. Install command UI feedback
Currently /admin/walkthrough test-install button shows toast but no live status. Add an inline status panel:
- "Queued..." → "Running..." → "Ready ✓" / "Failed: <err>"
- Use existing SSE endpoint `/api/admin/install/[id]/stream`.

**Carry:** `CARRY-P215-WALKTHROUGH-LIVE-STATUS` — ~40 LOC.

### 5. Bandwidth rollup trigger never fires
Live state: `bandwidth_usage` has 0 rows because no one writes to it (relay was the original writer; relay is DOWN). Even if we fix the relay, no row writes → no rollup data → /admin dashboard "Bandwidth total" always 0.

**Carry:** `CARRY-P212-BANDWIDTH-WRITER` — wire livinityd to write bandwidth_usage rows (could combine with `tunnel_connections` lifecycle hooks). Or: wait for relay restart per `CARRY-V41-RELAY-DOWN`.

### 6. /admin/users dashes for missing data
"Last seen" column shows "1m ago" for bruce (admin session touched last_seen_at). baris/leo show "never" because they've never logged in via cookie since the migration. Not a bug, just visual: maybe color "never" muted.

**Carry:** `CARRY-P213-USERS-EMPTY-VISUAL` — ~10 LOC.

### 7. Tunnel session ip = client IP not Mini PC LAN IP
`client_ip = 50.175.214.163` — this is the egress IP (public WAN), not the LAN address. Operator might expect to see "Mini PC at 10.69.31.68" but they see the ISP-assigned address. Add either:
- A column "Connected from" with reverse-DNS / GeoIP hint.
- A note explaining "external IP, may be ISP-NAT'd".

**Carry:** `CARRY-P212-TUNNEL-IP-DISPLAY` — ~20 LOC.

## 🟢 OBSERVATIONS / STRENGTHS

- **Sacred SHA discipline** held through 40 commits in this session. Pre-commit hook caught every attempt to touch `sdk-agent-runner.ts`.
- **`update.sh` deploy flow** is robust — no manual steps, idempotent, builds-from-source on Mini PC. Real strength.
- **The architectural separation** (Vercel platform = routing/curation, Mini PC livinityd = execution) is clean. The cloud-id-as-routing-handle pattern works once user_id mapping is explicit.
- **Bot Protection / Attack Mode behaviour** is well-isolated to non-browser clients; once Bot Protection is off, real users were never impacted during the incident.

## 📋 Operator action items

1. ✅ Vercel deploy: done.
2. ✅ Mini PC update: done (SHA `e26384e`).
3. **MCP install** via /admin/walkthrough → confirms section-dispatch gap (Gap #1).
4. **Docker app install** (e.g. AdGuard) via /admin/walkthrough → should SUCCEED end-to-end because Docker is the existing installForUser path. **Recommended next test.**
5. **CARRY-V41-RELAY-DOWN** restart — unblocks bandwidth + further relay-side features.
6. **CF audit** with token: `CF_API_TOKEN=... bash scripts/cf-audit.sh` → CF-AUDIT-RESULTS.md.

## Patch priority for v42 backlog

1. **HIGH:** Section-aware installForUser dispatch (gap #1). Unblocks MCP one-click installs entirely.
2. **HIGH:** MCP config Redis primitive reconciliation (gap #2). Active live state mismatch.
3. **MEDIUM:** Bandwidth writer wiring (gap #5). Makes the dashboard "Bandwidth total" meaningful.
4. **LOW:** UI polish (gaps #4, #6, #7) — operator-facing nice-to-haves.
5. **POLLER UI CONTROL** (gap #3) — emergency kill switch in UI. Pre-emptive for future incidents.
