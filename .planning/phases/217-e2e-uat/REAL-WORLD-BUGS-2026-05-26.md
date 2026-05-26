# Real-World Usage Bugs — 2026-05-26 (operator dogfooding)

Operator installed Immich + Bolt.diy + filesystem MCP via the store. Tests revealed multiple gaps that the UAT-CHECKLIST.md alone didn't catch.

## ✅ FIXED THIS SESSION

### MCP UI WRONGTYPE — Bug A
**Symptom:** Liv AI Settings → MCP panel → "WRONGTYPE Operation against a key holding the wrong kind of value" + "No MCP servers configured" (even though `filesystem` MCP was installed and running).

**Root cause:** `liv:mcp:config` Redis primitive was STRING (JSON blob), but the tRPC router `mcp-config-router.ts` (line 59) declared and uses it as a HASH. Mismatch → HKEYS on STRING returned WRONGTYPE.

**Fix:** Migrated Redis value STRING → HASH on Mini PC. JSON's `mcpServers.filesystem` extracted and HSET back as `filesystem` field. Verified: TYPE=hash, HKEYS=[filesystem], UI now lists external server. **livos+liv-core restarted** for the in-memory caches to pick up the new type.

**Status:** SHIPPED live on Mini PC. No code commit needed (Redis migration only). Documented as `CARRY-P211-UNIFY-RECONCILE` (closed).

### Store/desktop subdomain dot→hyphen mismatch — Bug C
**Symptom:** Store detail page showed Immich at `photos.bruce.livinity.io` (DOT) but desktop icon used `immich-bruce.livinity.io` (HYPHEN). Two different URLs for the same app.

**Root cause:** UI fallback constructed URLs as `${appSubdomain}.${userDomain}` (dot) instead of Phase 210 canonical `${appSubdomain}-${userPart}.livinity.io` (hyphen). Phase 210 explicitly chose hyphen because CF wildcard cert `*.livinity.io` only covers leaf-level — `photos.bruce.livinity.io` is sub-of-sub and fails SSL + tunnel routing.

**Fix (commit `58a4172f`):**
- `livos/packages/ui/src/utils/misc.ts`: appToUrl() fallback now produces hyphen-format under livinity.io; preserves dot-format only for custom user domains (test.livinity.live, example.com, etc.).
- `platform/web/src/app/store/[id]/app-detail-client.tsx`: editor placeholder + display URL both switched to `-<user>.livinity.io`.

**Status:** SHIPPED to Vercel (will auto-deploy in <60s). Mini PC needs `update.sh` to pick up the UI change.

### Admin logout button — Operator request
Sidebar foot button + `/api/auth/logout` POST flow + sessionStorage purge. **SHIPPED** (commit `ed18d8f6`).

### CARRY-P212-TUNNEL-PERSIST — `/admin/tunnels` empty
**Fixed earlier this turn:** 2 Vercel endpoints + tunnel-presence hooks. Verified row `b2e74fc5...` written to Supabase. **SHIPPED** (commit `dadf8448`).

---

## 🔴 OPEN GAPS — need separate fix sessions

### Bug B (root cause): Mini PC Caddyfile is the STATIC install.sh template

**Symptom:** Both Immich and Bolt.diy installed (docker containers up, healthy=Bolt, unhealthy=Immich), subdomains provisioned on CF, but operator sees:
- `bolt-diy-bruce.livinity.io` → 403 CF challenge then "redirects to livinity login" (actually it's bolt-diy's `/login` — but the underlying issue is below).
- `immich-bruce.livinity.io` → 502 Bad Gateway from Cloudflare.

**Actual root cause (verified via Caddy admin API + /etc/caddy/Caddyfile inspection):**

Mini PC's `/etc/caddy/Caddyfile` is the **33-line static template from `install.sh` Phase 104**. It has internal LivOS routes (`/liv-ai-app/*` → `:3010`, `/liv-ai-app/openclawos/*` → `:18789`) and a catch-all `handle { reverse_proxy 127.0.0.1:8080 }` pointing to livinityd.

**There is ZERO per-app host block.** When `bolt-diy-bruce.livinity.io` hits Mini PC Caddy:
1. Caddy has no `bolt-diy-bruce.livinity.io { reverse_proxy 127.0.0.1:5173 }` block.
2. Falls to default `:80 { handle { reverse_proxy 127.0.0.1:8080 } }`.
3. Goes to livinityd's HTTP server (port 8080).
4. livinityd's LivOS UI sees an unknown host header → its default route is `/login`.
5. Operator sees "bolt-diy-bruce.livinity.io/login?redirect=%2F" — which IS livinity's login UI rendered under the wrong host.

For Immich: same chain. Even if Caddy DID have a host block, Immich's container is `unhealthy` and `curl http://127.0.0.1:2283/` returns code 000 (connection refused) — Immich container is broken independently.

**The dynamic caddy emitter (`generateFullCaddyfile()` in livinityd) EXISTS but is never invoked.** install.sh writes the static Caddyfile and livinityd never replaces it. This is the root cause for ALL app subdomains failing.

**Carries filed:**
- **CARRY-V41-CADDY-EMITTER-GAP** — wire livinityd to dynamically regenerate Caddyfile on app install/uninstall. ~100-200 LOC. The function exists (`apps.ts:1038-1040` `writeCaddyfile + reloadCaddy`); it just isn't called from `installForUser`. Likely also needs systemd service file update to read from a livinityd-writable path.
- **CARRY-V41-IMMICH-HEALTHCHECK** — separate from above. Even with Caddy fixed, Immich container needs `127.0.0.1:2283` reachable. Could be volume permission, port mapping, or app-internal misconfiguration.
- **CARRY-V41-CADDY-EMITTER-DEPRECATE-INSTALL-SH** — install.sh's static Caddyfile becomes a one-time bootstrap; ongoing config managed by livinityd.

### `user_app_subdomains` table missing from Mini PC schema

When I queried `SELECT * FROM user_app_subdomains` the Mini PC returned **"relation does not exist"**. But the platform Vercel side (Supabase) DOES have this table. So:
- Mini PC's livinityd database is a SEPARATE Postgres from Supabase.
- Phase 140-05 added the `user_app_subdomains` table — but only to Supabase, never to the Mini PC's local schema migration.
- This makes the Mini PC's local "which subdomains does this user own" view incomplete.

**Carry:** `CARRY-V41-MINIPC-SCHEMA-DRIFT` — write a startup migration that adds `user_app_subdomains` to the local Mini PC postgres schema. ~30 LOC migration.

### `user_app_instances` only has adguard-home

Docker shows `bolt-diy_server_1` and `immich_server_1` up — but `SELECT * FROM user_app_instances` only shows `adguard-home`. So Bolt.diy and Immich got installed via SOMETHING that didn't write to `user_app_instances`. Possibilities:
- Manual `docker compose up` outside of livinityd
- Install path different from `installForUser` (e.g., legacy single-user `install()` rather than multi-user)
- Old code path that's no longer maintained

**Carry:** `CARRY-V41-INSTALL-PATH-AUDIT` — figure out which install path created these orphan containers; ensure all paths converge on `user_app_instances` write so the admin UI can see them.

### Install-poller: section-aware dispatch (already filed earlier)

Test confirmed: `installForUser` Docker-only. MCP installs through this path die with `Cannot read properties of null (reading 'services')`. See `E2E-FINDINGS-2026-05-26.md` for details. **CARRY-P215-SECTION-DISPATCH**.

---

## Improvement opportunities for v42

### A. Install reliability per app section
1. **CARRY-P215-SECTION-DISPATCH** — Section-aware installer routing (Docker / MCP / native / webapp / plugin → right sub-installer). Highest priority — unlocks MCP/webapp one-click installs.
2. **CARRY-V41-CADDY-EMITTER-GAP** — Wire dynamic Caddyfile regen on every install/uninstall. Without this, NO subdomain-routed app works on the Mini PC.
3. **CARRY-V41-IMMICH-HEALTHCHECK** — App-specific debug for Immich's broken container.
4. **CARRY-V41-INSTALL-PATH-AUDIT** — Reconcile multiple install paths (docker direct vs installForUser vs install_commands queue).

### B. Schema convergence
5. **CARRY-V41-MINIPC-SCHEMA-DRIFT** — Sync user_app_subdomains and other v37+ tables into Mini PC local Postgres.
6. **CARRY-P210-RECONCILE** — Backfill `host` field on existing user_app_subdomains rows (Phase 210 hyphen-format).

### C. UI polish (small wins)
7. **CARRY-P215-WALKTHROUGH-LIVE-STATUS** — SSE-driven install progress in /admin/walkthrough.
8. **CARRY-P215-POLLER-UI-CONTROL** — Emergency kill-switch toggle in admin panel.
9. **CARRY-P213-USERS-EMPTY-VISUAL** — "Never" treatment.
10. **CARRY-P212-TUNNEL-IP-DISPLAY** — Clarify WAN vs LAN IP.

### D. Architectural
11. **CARRY-P212-BANDWIDTH-WRITER** — Wire livinityd to write bandwidth_usage rows.
12. **CARRY-P213-DESIGN-SYSTEM-POLISH** — shadcn + recharts adoption.
13. **CARRY-P213-RSC-REFACTOR** — Server Components migration.

---

## Operator next actions

1. **Browser hard-refresh `/admin`** — see the new logout button + tunnels row (b2e74fc5...) + fixed dashboard.
2. **Liv AI → Settings → MCP** — should now show `filesystem` external server (Bug A fix).
3. **DO NOT click Immich/Bolt.diy from desktop** until CARRY-V41-CADDY-EMITTER-GAP fix lands. They will keep failing.
4. **`update.sh` on Mini PC** to pick up the misc.ts hyphen URL fix (commit `58a4172f`).
5. **CARRY-V41-RELAY-DOWN** restart Server5 PM2 relay — separate problem, doesn't block per-app subdomains but DOES block bandwidth + api.livinity.io broker routing.
