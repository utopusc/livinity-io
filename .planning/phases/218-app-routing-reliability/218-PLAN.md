# Phase 218 — App Subdomain Routing + MCP Reliability (operator dogfood blockers)

**Status:** READY (post-/clear activation)
**Created:** 2026-05-26
**Triggered by:** Real-world v41 operator usage 2026-05-26. Bug reports:
- Bolt.diy / Immich subdomains open LivOS UI instead of the app
- MCP UI WRONGTYPE re-appearing after delete/re-add cycle
- Store "Open" goes to `photos.bruce.livinity.io`, desktop goes to `immich-bruce.livinity.io`, neither opens the app
- "Bir sikim yapmamissin" — fixes documented but not actually applied
- "Uygulama indirmede çalışmıyor ki amk" — root frustration

**Goal:** End-to-end "operator installs app → clicks desktop icon → app opens in browser at its subdomain". No SSH. No manual Caddyfile edits. No Redis surgery. Just works.

**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST stay through every commit.

**Effort:** ~6-8 hours (1 long session or 2 short).

**Atomic commits:** 8 (T1–T8).

---

## Tasks (serial — each ships independently)

### T1 — Verify install path → Caddyfile regeneration WIRED

**Why:** Mini PC `/etc/caddy/Caddyfile` is the 33-line static `install.sh` template. Per-app reverse_proxy blocks for `bolt-diy-bruce.livinity.io`, `immich-bruce.livinity.io`, etc. are MISSING. `generateFullCaddyfile()` + `writeCaddyfile()` + `reloadCaddy()` all exist in `livos/packages/livinityd/source/modules/domain/caddy.ts`, but `installForUser` does NOT call them.

**Action:**
1. Read `livos/packages/livinityd/source/modules/apps/apps.ts:1141 installForUser()` end-to-end. Identify all branches.
2. Find the existing `applyCaddyConfig` or `writeCaddyfile/reloadCaddy` call chain (currently line ~1038). Determine why it's gated out.
3. After successful install, ALWAYS call:
   ```typescript
   const caddyConfig = await buildCaddyConfigFromState()  // see T2
   const content = generateFullCaddyfile(caddyConfig, isMultiUser, isTunnel, nativeApps)
   await writeCaddyfile(content)
   await reloadCaddy()
   ```
4. Same for `uninstallForUser` (remove blocks).
5. Same for `install()` single-user.

**Acceptance:**
- After `installForUser` returns, `curl http://localhost:2019/config/apps/http/servers/srv0/routes` includes a route matching the new app's host header.
- `/etc/caddy/Caddyfile` includes `<app>-<user>.livinity.io { reverse_proxy 127.0.0.1:<port> }`.

**Commit:** `feat(218-T1): wire caddy regenerate into installForUser/install/uninstall`

---

### T2 — `buildCaddyConfigFromState()` helper

**Why:** generateFullCaddyfile() takes a `CaddyConfig` struct. We need a single source-of-truth function that derives this from the current DB state — list all `user_app_instances` (multi-user) and `user_app_subdomains` (per-app), enrich with port mappings, return a stable shape.

**Action:**
- Add `livos/packages/livinityd/source/modules/domain/caddy-state.ts`
- Export `async function buildCaddyConfigFromState(): Promise<CaddyConfig>`
- Reads: `user_app_instances`, `user_app_subdomains` (after T3 migration lands), users (for username), apps (for slug/section).
- Composes: hyphen-format `<slug>-<username>.livinity.io` per instance; port from instance row.
- Filters: only running instances; skips section='ai' (MCP) since they don't need HTTP routing; native section needs streaming-port handling — handle per existing helpers in caddy.ts.

**Acceptance:**
- Unit test in `caddy-state.test.ts`: given mock DB rows for 3 installed apps + 1 stopped instance, returns config with 3 host blocks, none for stopped/MCP.

**Commit:** `feat(218-T2): buildCaddyConfigFromState helper`

---

### T3 — Mini PC schema drift: add `user_app_subdomains` table

**Why:** Query `SELECT * FROM user_app_subdomains` on Mini PC returns "relation does not exist". Phase 140-05 added the table to Supabase but never to the Mini PC's local Postgres. T2 cannot read what doesn't exist.

**Action:**
- Add migration in `livos/packages/livinityd/source/modules/database/migrations/`:
  ```sql
  CREATE TABLE IF NOT EXISTS user_app_subdomains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id          UUID NOT NULL,            -- references apps.id by convention; no FK because local apps table may not exist
    app_slug        TEXT NOT NULL,
    subdomain       TEXT NOT NULL,
    cf_dns_record_id TEXT,
    port            INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, app_slug)
  );
  ```
- Wire into startup migration runner (`initDatabase()` in `database/index.ts`).
- Idempotent.

**Acceptance:**
- Fresh Mini PC: table exists after first livinityd boot.
- Existing Mini PC: table appears after update.sh.
- `psql -c "\d user_app_subdomains"` shows the schema.

**Commit:** `feat(218-T3): add user_app_subdomains to Mini PC schema`

---

### T4 — Reconcile orphan Docker containers → `user_app_instances`

**Why:** Operator's Mini PC has `bolt-diy_server_1` and `immich_server_1` Docker containers up, but only `adguard-home` in `user_app_instances`. They were installed via a path that bypassed the central registry — possibly:
- Direct `docker compose up` (manual)
- Legacy `install()` path (single-user) that doesn't write to multi-user table
- v37 install_commands queue that lands containers but doesn't backfill local table

**Action:**
- On livinityd boot, run `reconcileOrphanInstances()`:
  - List all `livos-app-*` Docker containers (`docker ps --filter "label=livos.app"` or by name pattern).
  - For each container, check `user_app_instances` for a matching `(user_id, app_id)` row.
  - If missing: INSERT a reconciled row with `port` derived from container port mapping, status='running', `instance_name=<container-name>` so the row's existence is auditable.
- Add a log line per reconciliation: `[recon] inserted user_app_instances for orphan <container>`.
- Idempotent on subsequent boots.

**Acceptance:**
- After livinityd restart on operator's box: `bolt-diy` and `immich` appear in `user_app_instances`.
- /admin UI /admin/users/<id> drill-down shows them in the app list.

**Commit:** `feat(218-T4): reconcile orphan Docker containers into user_app_instances`

---

### T5 — One-shot Caddyfile regenerate on livinityd boot

**Why:** Even after T1 wires regen on install, the EXISTING Mini PC has orphan apps and a stale Caddyfile. Boot-time regen rebuilds the truth.

**Action:**
- In livinityd `start()`, after T4 reconciliation completes:
  ```typescript
  try {
    const caddyConfig = await buildCaddyConfigFromState()
    const content = generateFullCaddyfile(caddyConfig, ...)
    await writeCaddyfile(content)
    await reloadCaddy()
    logger.log('[boot] caddyfile regenerated for', caddyConfig.subdomains.length, 'apps')
  } catch (err) {
    logger.error('[boot] caddyfile regen failed (non-fatal):', err)
  }
  ```
- Non-fatal: if regen fails, livinityd boots anyway (no chicken-and-egg).
- Run AFTER T4 reconciliation so orphan apps land in the Caddyfile.

**Acceptance:**
- After Mini PC update.sh + restart: `curl https://bolt-diy-bruce.livinity.io/` returns Bolt.diy login (NOT LivOS UI).
- Same for any other installed app.

**Commit:** `feat(218-T5): regenerate caddyfile on livinityd boot`

---

### T6 — MCP config Redis primitive: stop the STRING-recreation

**Why:** Operator deleted filesystem MCP → UI showed empty (HASH was empty, OK). Then re-added → UI shows WRONGTYPE again. Something in the codebase re-creates `liv:mcp:config` as STRING (JSON blob) after our HASH migration.

**Action:**
1. **grep for writers:** `grep -rn "liv:mcp:config" livos/ liv/ | grep -E "SET|set\\("` — find any path that calls `redis.set('liv:mcp:config', ...)`. Compare to HASH writers (`hset`, `hdel`).
2. **Replace STRING writers with HASH equivalents:**
   - If found: change `redis.set('liv:mcp:config', JSON.stringify({mcpServers: {...}}))` → loop and `redis.hset('liv:mcp:config', name, JSON.stringify(serverConfig))`.
3. **Add defensive type guard:** at livinityd boot, check `redis.type('liv:mcp:config')`. If STRING:
   - Parse JSON blob.
   - Convert to HASH (DEL + HSET per server).
   - Log: `[boot] migrated liv:mcp:config STRING → HASH (N servers)`.
4. **Cross-publish on changes:** existing Phase 211 defensive guard cross-publishes on `liv:mcp:updated` — keep that, ensure both sides (livinityd + liv-core) read the HASH primitive uniformly.

**Acceptance:**
- Delete filesystem MCP via UI → HKEYS returns []. No WRONGTYPE.
- Re-add filesystem MCP via UI → HKEYS returns [filesystem]. No WRONGTYPE.
- Restart livinityd → still HASH, [filesystem] still there.

**Commit:** `fix(218-T6): MCP config canonical HASH everywhere + boot-time STRING→HASH guard`

---

### T7 — Force UI cache-bust on subdomain URL changes

**Why:** Operator updated and still sees the OLD dot-format URL (`photos.bruce.livinity.io`) in the store. The UI was fixed (commit `58a4172f`) but the page might be cached client-side. Need automatic cache-busting OR clearer guidance.

**Action:** (small, ~30 LOC)
- Service-worker version bump in `livos/packages/ui/index.html` head — increment a `<meta name="livos-ui-version">` on every UI build (already exists? verify).
- Add a small banner "UI updated — refresh to see latest" when a build-time version differs from server reported version.
- Alternative: livinityd at boot emits `livos:ui:version` in Redis; UI long-polls; on mismatch, show banner.

**Acceptance:**
- After update.sh + UI rebuild, operator sees a "Refresh" banner within 10s without F5.

**Commit:** `feat(218-T7): UI version banner on build change`

---

### T8 — End-to-end smoke + SUMMARY

**Action:**
1. After T1-T7 deployed: install AdGuard fresh via /admin/walkthrough test-install button.
2. Verify: Caddyfile contains adguard-home-bruce.livinity.io block; subdomain returns 200/302 (NOT LivOS UI).
3. Install filesystem MCP via Liv AI panel. Verify HASH primitive + UI shows it.
4. Install Immich (separately diagnose unhealthy container → may need T8b carry).
5. SUMMARY.md with all verification curl outputs + before/after Caddyfile sizes.

**Acceptance:**
- /admin/walkthrough Test-install AdGuard click → 60s later AdGuard subdomain serves AdGuard's UI.
- All 3 install paths (Docker / MCP / native) close their respective bugs.

**Commit:** `ship(218): app routing + MCP reliability — END-TO-END WORKING`

---

## Out of scope (defer)

- **CARRY-V41-IMMICH-HEALTHCHECK** — Immich container itself unhealthy. App-specific. Filed as separate task; needs Docker inspect + likely volume permission fix. Probably 30-60min once isolated. Add a T8b if there's appetite.
- **CARRY-V41-RELAY-DOWN** — Server5 PM2 relay. Doesn't block per-app subdomains (those go through CF tunnel direct, not relay). Defer to operator.
- **CARRY-P215-SECTION-DISPATCH** — partial: T6 addresses MCP-flow specifically. Docker installs already work. Native/webapp/plugin sections each need their own sub-installer wiring. Add as v42-B if needed.

---

## Activation instructions (post-/clear)

When you resume after /clear:

```
Continue executing Phase 218 from .planning/phases/218-app-routing-reliability/218-PLAN.md.
Start at T1. Each task = atomic commit, push, Mini PC update.sh, verify, move on.
Sacred SHA preserved 8/8.
```

Or invoke the GSD workflow:

```
/gsd-execute-phase 218
```

Both work. The plan is self-contained — every task has a precise action list, acceptance criteria, and commit message. No further discussion needed.
