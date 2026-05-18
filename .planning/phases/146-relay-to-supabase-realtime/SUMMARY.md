# Phase 146 SUMMARY — Big-Bang Migration Server5 → Vercel + Supabase + Realtime Presence

**Status:** ✅ SHIPPED 2026-05-18
**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 11 commits (sdk-agent-runner.ts ZERO diff)
**Cutover duration:** ~12h elapsed (autonomous + setup), ~30 min hot cutover window (DNS swap → Server5 pm2 stop)

## What shipped

Replaced the Server5 Caddy + pm2 (Next.js + relay WS + changelog) + Postgres stack with a Vercel-hosted control plane backed by Supabase Postgres + Realtime presence. livinityd's `tunnel-client.ts` rewritten from 852 LOC of WS-to-relay code to a 103 LOC facade delegating to a new `TunnelPresence` module that uses Supabase Realtime channels.

### Old shape (pre-cutover)
- `livinity.io` apex → Server5 (45.137.194.102), Caddy → pm2 next.js (port 3000) for API + Caddy file_server for landing HTML
- `*.livinity.io` (apex wildcard) → Server5, but user subdomains were CNAME→cfargotunnel (CF Tunnel direct to user Mini PC/mainserver)
- livinityd connected to `wss://livinity.io:4000` (Server5 relay) for online/presence signal

### New shape (post-cutover)
- `livinity.io` (CNAME → vercel-dns) → Vercel project `livinity-io` (sfo1 edge cache)
  - 307s to `www.livinity.io` (Vercel default)
  - Next.js API routes serve `/api/*`
  - 9 landing HTML pages (`/dashboard`, `/login`, `/profile`, `/verify`, `/forgot-password`, `/download`, `/dashboard/install`, `/`, `/customize`) served via `beforeFiles` rewrites pointing at `platform/web/public/*.html`
- Supabase Postgres us-west-2 (`qlsalsyqjichtpjitldi`) is the new platform DB (pooler-6543 via `pgbouncer=true`)
- livinityd's `tunnel-presence.ts` does `POST /api/me/realtime-token` → receives `{token, supabaseUrl, supabaseAnonKey, channel}` self-bootstrap envelope → `createClient(...).realtime.setAuth(token).channel('tunnel:<userId>').track({...})`
- `/api/dashboard` reads presence via `supabaseService.channel(...).presenceState()` (10s cache, 3s timeout)
- Server5 pm2 stack (web/relay/changelog) ALL STOPPED — VM kept hot 7 days for rollback

## Critical findings during execution

### 1. Operator-supplied JWT_SECRET was wrong (W2-T2 catch)
- Operator pasted `c470b930-01d5-447c-ad8b-2bf685ba3950` (UUID) as `SUPABASE_JWT_SECRET`
- POC v1 failed `JwtSignatureError` because that UUID was NOT the real HS256 signing secret
- **Recovery path:** retrieved real secret via Supabase Management API `GET /v1/projects/{ref}/postgrest` (`jwt_secret` field). Real secret: `bklT8Zw...==`
- Verified by `jwt.verify(anonToken, realSecret)` against Supabase's own anon key
- Vercel env was set with the real secret; final Vercel-minted JWT round-trip → Realtime → SUBSCRIBED + track ok

### 2. Landing UI was static HTML, not Next.js (plan-146 miss → W1-T4 inserted)
- Server5 Caddyfile served `/dashboard`, `/login`, `/profile`, `/verify`, etc. as static HTML from `/opt/landing/livinity.io/`
- Repo had NO copies of these files; cutover would have 404'd every user-facing page
- Fix: rsync canonical files (excl. .bak/.pre-/.sh) from Server5 → `platform/landing/` + mirror in `platform/web/public/`; `next.config.ts` `beforeFiles` rewrites intercept routes before Next.js filesystem
- 9 routes verified live via curl + title match on Vercel

### 3. Vercel did the DNS itself (not our manual PATCH)
- W4-T1 plan was: PATCH CF apex A record from `45.137.194.102` → `76.76.21.21` (Vercel anycast)
- Reality: when operator added `livinity.io` to Vercel project, Vercel auto-updated CF DNS (CF<>Vercel integration). PATCH returned 404 because the record ID we captured at W0-T1 no longer existed.
- New state: `livinity.io` is now a CNAME (NOT A) to `e1ecfaeff3d82935.vercel-dns-017.com` (Vercel-managed alias). Same outcome, different mechanism.

### 4. broker == relay (plan-146 misconception)
- Plan said `pm2 stop web relay changelog` "leave broker untouched". Memory said broker was a separate pm2 process.
- Reality: there is no separate broker process on Server5. `api.livinity.io` Caddy block was `reverse_proxy localhost:4000` = the relay process itself. api.livinity.io was returning HTTP 503 pre-cutover anyway (relay speaks WS, not HTTP — broker was broken or never wired).
- Operator decision: stop all 3 (web/relay/changelog). api.livinity.io now returns 502 (Caddy reaches stopped backend). No regression vs pre-cutover 503.
- If the broker is needed in a future phase, it'll need a fresh impl + deploy target.

### 5. 4th user `bolcay` discovered (friend's test account)
- pg_dump of Server5 platform DB revealed users: socinity + lucy + bozturk + **bolcay** (created same-day during friend's UAT session)
- Operator chose "delete all users" cleanup path → all 4 users + cascading data + CF tunnels + DNS CNAMEs purged
- bolcay had no mainserver/Mini PC livinityd footprint (confirmed via grep)

### 6. custom_domains had no FK to users
- `DELETE FROM users` cascade hit api_keys + sessions + user_app_subdomains + bandwidth_usage + tunnel_connections cleanly but `custom_domains` survived because no FK constraint
- Manual `DELETE FROM custom_domains` cleaned 4 orphan `livinity.live` rows (from a prior phase test).
- `install_history` also had no FK — manual cleanup of 7 orphan install records.
- Phase 147+ TODO: add proper FKs in a schema migration.

### 7. Vercel build crashed on first deploy (lazy-init fix)
- First Vercel deploy succeeded compilation but failed page-data collection: `supabase-server.ts` called `createClient()` at MODULE TOP, requiring env vars that aren't present during build
- Fix: replace `export const supabaseService` with `getSupabaseService()` lazy-init + cache. `/api/dashboard` updated to call the getter.
- This is the standard pattern for serverless route handlers with secret-backed clients.

## Wave-by-wave outcomes

### W0 — Prep
- W0-T1: CF DNS TTL apex `livinity.io` → 60s. Git tag `pre-146-cutover` at `8d5dc1bd` pushed.
- W0-T2: `pg_dump --format=custom` Server5 platform DB → 40KB. 11 tables, 4 users, 27 apps.

### W1 — Backend
- W1-T1: `pg_restore` (run from Server5 itself since Windows lacks pg_restore) → Supabase us-west-2. All 11 tables + indexes + constraints + FKs restored. RLS auto-enabled on every table per project "Enable automatic RLS" toggle.
- W1-T2: `@supabase/supabase-js` installed in `platform/web/`. `supabase-server.ts` exports `getSupabaseService()`, `mintRealtimeJwt()`, `getSupabasePublicUrl()`, `getSupabaseAnonKey()`, `presenceChannelName()`. `.env.example` documented.
- W1-T4 (NEW — see Finding #2): canonical Server5 landing HTML synced to `platform/landing/` + `platform/web/public/`; `next.config.ts` `beforeFiles` rewrites mirror Caddyfile routing.

### W2 — Realtime
- W2-T1: `/api/me/realtime-token` route mints HS256 JWT (sub=userId, role=authenticated, aud=authenticated, 1h TTL) + ships `supabaseUrl` + `supabaseAnonKey` in response body. Self-bootstrap contract.
- W2-T2: POC node script ran end-to-end against real Supabase: SUBSCRIBED → track ok → service-role observer saw lucy entry. PASS.
- W2-T3: `/api/dashboard` rewritten. CF Tunnel API + relay /internal/user-status both retired. Presence read via `supabaseService.channel(...).presenceState()`. Bandwidth stubbed to zeros (Phase 147 carryover).

### W3 — livinityd
- W3-T1.5: 5 `TunnelDevice*` interfaces + `LegacyDeviceMessage` union extracted from `tunnel-client.ts` → new `legacy-device-types.ts`. Re-exported from `tunnel-client.ts` for back-compat.
- W3-T1: `@supabase/supabase-js` added to livinityd. `tunnel-presence.ts` (260 LOC) — `TunnelPresence` class with start/stop/snapshot, JWT remint at 50min, retry-on-failure timer.
- W3-T2: `tunnel-client.ts` rewritten 852 → 103 LOC. Thin facade delegating to TunnelPresence. `sendDeviceMessage()` is no-op stub (Phase 148 carryover). `tunnel-http-bridge.ts` doc-stub created. Workspace tsc 390 → 386 (4 pre-existing wire-protocol errors retired with deleted proxy code).
- W3-T3: Windows-friendly smoke (tsx + mock Redis + stub fetch) PASS against real Supabase project.

### W4 — Cutover
- W4-T1: Vercel domain add (operator UI) triggered Vercel-managed CF DNS swap. `livinity.io` + `www.livinity.io` both CNAME → `vercel-dns-017.com`. Apex 307s www. Live smoke green on all 9 landing routes + API routes.
- W4-Tcleanup (replaces W4-T2/T3 per operator "delete all users" directive):
  - CF DNS CNAMEs deleted: 8 (lucy/bozturk/socinity/bolcay + *.lucy + n8n-bozturk + n8n-socinity + code-server-socinity)
  - CF Tunnels deleted (cascade=true): 4 (lucy/bozturk/socinity/bolcay)
  - `DELETE FROM users` → 4 rows + cascade through api_keys/sessions/user_app_subdomains/bandwidth_usage
  - Manual cleanup: `DELETE FROM custom_domains` (4 orphans) + `DELETE FROM install_history` (7 orphans, no FK)
  - `apps` catalog (27 rows) preserved — platform-level, not user-tied
- W4-Tstop:
  - mainserver `154.53.56.75`: livos.service stopped (inactive). liv-cloudflared.service didn't exist.
  - Mini PC `10.69.31.68`: 5 SSH retries all failed (ZeroTier flapping per memory). Orphan socinity livinityd will fail auth (deleted DB user) and spam logs but cause no harm. Operator manual stop deferred.

### W5 — Cleanup
- W5-T1: Server5 pm2 `pm2 stop web relay changelog` + `pm2 save`. All 3 processes status=stopped.
- W5-T2: this SUMMARY + ROADMAP flip + cutover.log commit.

## Commits (master ref)

```
df09a4c7  (tag) pre-146-cutover         (anchor at 8d5dc1bd)
4a4f5c8b  feat(146-W1/supabase-client)  supabase-server.ts + .env.example
3f7fba09  feat(146-W2/realtime-token)   /api/me/realtime-token route
b89bc4d2  test(146-W2/poc-presence)     POC script
00aa3dde  feat(146-W2/dashboard-online) /api/dashboard rewrite to Supabase presence
db86a3f6  refactor(146-W3/extract-device-types) legacy-device-types.ts safety net
f7412e39  feat(146-W3/livinityd-presence) tunnel-presence.ts new + tunnel-client.ts 852→103 LOC
92d069b6  test(146-W3/smoke-presence)   Windows-friendly TunnelPresence smoke
a46d32f1  fix(146-W1/lazy-supabase-client) defer createClient() to first use
f523d461  feat(146-W1-T4/landing-migration) 28 canonical HTML files + next.config rewrites
```

Plus this SUMMARY + ROADMAP + cutover.log final commit (this work's commit hash captured at the end).

## Remaining technical debt (Phase 147+)

- **bandwidth metering** — `/api/dashboard` returns hardcoded zeros. Need Supabase `bandwidth_usage` reader + livinityd sender.
- **device events / broadcast** — `sendDeviceMessage()` is stubbed no-op. Phase 148 routes via Supabase Broadcast.
- **domain sync** — legacy relay's `domain_sync` event is gone. CF tunnel CRUD already works via `/api/auth/register`; longer-term domain push will be Supabase channel or polled `/api/me/domains`.
- **dead Next.js pages** — `app/dashboard/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/verify/page.tsx`, `app/forgot-password/page.tsx`, `app/download/page.tsx`, `app/profile/page.tsx` all compile but are intercepted by rewrites. Delete in cleanup phase.
- **broker** — `api.livinity.io` is now 502. If the LLM-broker functionality is still needed, plan a fresh impl + Vercel deploy target.
- **RLS policies** — every Supabase public table has `rls_enabled=true` (project default) but ZERO policies. Service-role client bypasses RLS so /api/* still works. Need real policies for anon-key direct reads.
- **schema FKs missing** — `custom_domains.user_id` and `install_history.user_id` have NO FK. Fix in migration.
- **Mini PC orphan livinityd** — operator follow-up SSH stop (currently failing auth + spamming logs).
- **Vercel function region** — initial deploy went to `iad1` (Washington). Operator may relocate Settings → Functions → `sfo1` to be co-located with Supabase us-west-2 (~10ms vs ~70ms RTT).
- **Server5 VM** — keep hot 7 days for rollback per CONTEXT.md. After that, destroy via Contabo panel.

## Rollback (if needed within 7 days)

1. **DNS rollback** — set `livinity.io` CNAME back to `45.137.194.102` (Vercel UI: remove domain from project; OR direct CF API PATCH).
2. **Server5 pm2 resurrect** — `pm2 start web relay changelog` on Server5 (45.137.194.102).
3. **Re-install pre-146 livinityd** — `git checkout pre-146-cutover` ref, build, deploy via Phase 145 one-liner.
4. **Supabase data** — left intact (no DROP), can be discarded later or kept as reference.

## Operator action items

- [ ] Choose Vercel canonical: apex `livinity.io` or `www.livinity.io`? Currently apex 307s to www. Settings → Domains → Configure redirect direction.
- [ ] Vercel Function Region: relocate `iad1` → `sfo1` to match Supabase us-west-2.
- [ ] Mini PC livinityd manual stop when ZeroTier recovers.
- [ ] Secret rotation post-stable: Supabase DB password, service_role key, JWT secret, sbp_* MCP token (per `project_phase_146_setup_progress.md`).
- [ ] Server5 VM destroy via Contabo panel after 2026-05-25 if rollback not needed.
