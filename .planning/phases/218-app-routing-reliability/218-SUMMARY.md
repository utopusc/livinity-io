# Phase 218 — SUMMARY (T1–T7 code-complete, awaiting Mini PC UAT)

**Status:** CODE-COMPLETE 2026-05-26
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 7 commits.
**Branch:** `master` — ready to push and deploy.

## What shipped

| T# | Commit | Title | Files |
|----|--------|-------|-------|
| T3 | `e3078019` | add user_app_subdomains to Mini PC schema | schema.sql + migration audit record |
| T2 | `2ebb49fc` | buildCaddyConfigFromState helper | caddy-state.ts + 9 unit tests |
| T1 | `c14136fb` | wire caddy regenerate into install/uninstallForUser | apps.ts (rebuildCaddyFromState + 2 call sites) |
| T4 | `869b963a` | reconcile orphan Docker containers | apps.ts (reconcileOrphanInstances on boot) |
| T5 | `a6484cbd` | regenerate caddyfile on livinityd boot | apps.ts (rebuildCaddyFromState wired at end of start) |
| T6 | `fb70f0ac` | MCP config canonical HASH everywhere + STRING→HASH guard | mcp-config-manager.ts + 12 unit tests |
| T7 | `cfb68375` | UI version banner on build change | vite.config.ts + LivosVersionBanner + init.tsx wiring |

7/8 plan tasks. T8 = this document + the operator UAT walk that follows the deploy.

## Real-world bugs closed

Operator's 2026-05-26 verbatim dogfood frustrations and the T# that closes each:

1. **"bolt-diy-bruce.livinity.io … hala livos u aciyor"** → T1 + T4 + T5. installForUser was committing the DB row but never touching Caddy; the per-app subdomain fell through to the apex catch-all. Now: install regenerates Caddyfile, boot regenerates Caddyfile, orphan containers from pre-multi-user installs get back-filled into `user_app_instances` so they participate in the regen too.
2. **"MCP ler eklenmiyor files eklenmisti onu da kaldirdim ama WRONGTYPE"** → T6. Two writers raced on `liv:mcp:config` (UI router = HASH, agent runtime = STRING). HDEL'ing the last entry auto-removed the HASH; a subsequent STRING write claimed the empty key; the next UI HSET WRONGTYPE'd. Now both writers HASH; existing STRING values self-heal on first read.
3. **"store dan open diyorum bu seferde buraya yonlendiriyor https://photos.bruce.livinity.io/"** → previously hot-fixed (`58a4172f` dot→hyphen UI patch). T7 closes the residual "but I updated and still see the old URL" → operator was on a stale cached UI bundle. The new banner detects the build-version mismatch and prompts a refresh within 30s.
4. **"Her yer baska bir yere yonlendiriyor. Bir sikim yapmamissin acikcasi!!!"** → cumulative effect of 1+2+3. Each was an independent failure; together they made every install/MCP flow flaky. T1–T7 turn each into a verifiable invariant rather than a documented behavior.

## What changed — by subsystem

### Mini PC database schema
- New table: `user_app_subdomains (id, user_id, app_id, app_slug, subdomain, cf_dns_record_id, port, created_at)`. UNIQUE (user_id, app_slug). Idempotent boot apply via `schema.sql`.

### Apps module (`apps.ts`)
- New method: `Apps#rebuildCaddyFromState()` — derives a `CaddyConfig` from `user_app_instances` ⋈ `users` + `user_app_subdomains` + Redis main-domain config, merges with the legacy Redis-stored single-user subdomain registry, then writes + reloads Caddy. Non-fatal: any failure logs and returns.
- New method: `Apps#reconcileOrphanInstances()` — boot-time walk of `docker ps`, matches container names against single-user (`<slug>_<service>_<N>`) and multi-user (`<slug>_<service>_user_<username>_<N>`) shapes, INSERTs missing `user_app_instances` rows. System containers (caddy, livinityd, postgres, redis, ephemeral `_run_` shells) are filtered out before any matching.
- `installForUser()` and `uninstallForUser()` now call `rebuildCaddyFromState()` after their DB write so the new/removed subdomain takes effect immediately.
- `Apps#start()` ends with `reconcileOrphanInstances()` → `rebuildCaddyFromState()` so existing boxes self-heal on next restart.

### Caddy state helper (`caddy-state.ts`, new file)
- Pure dependency-injected `buildCaddyConfigFromState(deps)` — production wires DB + Redis; tests pass static arrays. 9 unit tests covering: status filter, multi-user same-slug distinct hosts, cached-vs-compute precedence, missing-table tolerance, null mainDomain edge cases, lowercase normalization.
- Apex inference: strips the first label of `mainDomain` so the fallback compute path produces `<slug>-<user>.livinity.io` (Phase 140 mint shape), not `<slug>-<user>.<user>.livinity.io`.

### MCP config (`mcp-config-manager.ts`, rewritten)
- Switched from STRING (SET / GET) to HASH (HSET / HGETALL / HDEL) so it shares a primitive with the livinityd tRPC router. The Phase 211 dual-writer guard is now dead code and removed.
- `ensureHashPrimitive()` runs at the top of every read: if the existing value is a STRING, parses the blob (tolerating both new `mcpServers` and legacy `servers` shapes), DELs the key, and HSETs each entry. One-time `STRING → HASH (N servers)` log line. Malformed STRINGs are DEL'd as recovery.
- Pub/sub semantics preserved: every mutation publishes `'mcp_config'` on `liv:config:updated` AND a structured `{op,name,ts}` envelope on `liv:mcp:updated`.

### UI version banner (`livos-version-banner.tsx`, new component)
- `__LIVOS_BUILD_VERSION__` frozen at build time via `vite.config.ts define`.
- `dist/version.txt` written at `closeBundle` with the same value (inline vite plugin `writeVersionFile`).
- Banner polls `/version.txt?t=<now>` every 30s with `cache: 'no-store'`. Mismatch → fixed-position bottom-right banner with Refresh + × dismiss.
- `/version.txt` added to PWA SW `navigateFallbackDenylist` so workbox can't shadow it.

## Verification — operator UAT script (post-deploy)

After running `bash /opt/livos/update.sh` on Mini PC:

### 1. Schema migration landed
```
sudo -u postgres psql -d livos -c '\d user_app_subdomains'
```
Expected: 8 columns including `app_slug TEXT NOT NULL` and `UNIQUE (user_id, app_slug)`.

### 2. Orphan reconciliation
```
sudo -u postgres psql -d livos -c "SELECT app_id, container_name, port, status FROM user_app_instances ORDER BY app_id;"
```
Expected: `bolt-diy` and `immich` rows appear alongside the existing `adguard-home` row (volume_path = `/opt/livos/data/orphan-reconciled`). Check livinityd journal for `[recon] inserted user_app_instances for orphan <name>` lines.

### 3. Caddyfile regenerated
```
sudo cat /etc/caddy/Caddyfile | grep -E '^(http://)?(bolt-diy|immich|adguard-home)-bruce\.livinity\.io'
```
Expected: one host block per installed app, hyphen pattern.

### 4. End-to-end subdomain routing
```
curl -sI https://bolt-diy-bruce.livinity.io/ | head -5
curl -sI https://immich-bruce.livinity.io/ | head -5
curl -sI https://adguard-home-bruce.livinity.io/ | head -5
```
Expected: 200/302 from the actual app (Server header should NOT be `livinityd` or `Caddy → 8080`). LivOS UI fallthrough would show a Vite-served HTML body — Immich/Bolt should redirect to their login page.

Note: Immich's container may still be unhealthy due to volume permissions (`CARRY-V41-IMMICH-HEALTHCHECK` defer per PLAN.md). T1–T7 fix the ROUTING; the app-specific healthcheck is a separate ticket.

### 5. MCP HASH primitive
```
sudo redis-cli -a "$(grep '^password' /etc/redis/redis.conf | awk '{print $2}')" TYPE liv:mcp:config
```
Expected: `hash` (NOT `string`, NOT `none` if any MCP servers are configured).

If a STRING value exists from a pre-T6 box, the first read after restart auto-migrates it. Check journalctl for `migrated liv:mcp:config STRING → HASH (N servers)`.

### 6. MCP delete/re-add cycle (the original bug)
In LivOS UI → Settings → MCP:
- Add `filesystem` MCP server (stdio, command `npx`, args `["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]`, enabled). Expected: appears in list, NO WRONGTYPE error.
- Delete it. Expected: list empties, NO WRONGTYPE.
- Add it again. Expected: appears again, still no WRONGTYPE.
- `redis-cli HKEYS liv:mcp:config` after each step matches UI state.

### 7. UI version banner
- Open LivOS UI in browser.
- Wait for fully loaded state.
- Re-run `update.sh` (or manually `bash /opt/livos/update.sh`).
- Within ~30s the bottom-right shows "LivOS UI updated — refresh to see the latest" with Refresh + × buttons.
- Click Refresh → page reloads to the new bundle, banner doesn't reappear.

### 8. Fresh install via /admin/walkthrough
- Navigate to `/admin/walkthrough` → Test install AdGuard (or another idle app).
- Within 60s the app's subdomain should serve its login (`adguard-home-bruce.livinity.io` → AdGuard UI, NOT LivOS UI).
- `user_app_instances` row appears, Caddyfile has the host block (verify via §3/§4 above).

## Carries / out of scope

- **CARRY-V41-IMMICH-HEALTHCHECK** — Immich container unhealthy from a volume-permission issue. App-specific. Not in T1–T7 scope; needs `docker inspect` + likely a `chown` on the upload volume.
- **CARRY-V41-RELAY-DOWN** — Server5 PM2 relay status. Doesn't block per-app subdomains (those traverse CF tunnel direct, not relay). Operator-side restart of relay.
- **CARRY-P215-SECTION-DISPATCH** — T6 fixes the MCP install flow. Native/webapp/plugin section sub-installers each need their own wiring; can land in v42 if operator hits any of those during UAT.

## Sacred SHA verification

```
git log --format='%H %s' de279e43..HEAD | wc -l
```
8 commits (plan + T1–T7). The pre-commit hook ran `[sacred-sha] PASS: 20 files verified` on every one — `liv/packages/core/src/sdk-agent-runner.ts` SHA-256 still `f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every step.

## Resume point if UAT fails

Each task ships a self-healing primitive, so partial failures are recoverable:

- Caddy block missing → run `sudo systemctl restart livos` (re-runs boot regen).
- MCP STRING leftover → first `mcp.config.list` call self-migrates (check journalctl for the migration log line).
- Orphan row missing → confirm container is in `docker ps`, that its name matches one of the two known shapes (no exotic naming), restart livinityd.
- Version banner not appearing → confirm `dist/version.txt` exists post-build, confirm `/version.txt` returns 200 with the new stamp.

Push commit chain (`git push origin master`) → `ssh bruce@10.69.31.68 sudo bash /opt/livos/update.sh` → operator walks §1–§8 above. End-to-end "install app → click desktop icon → app opens in browser at its subdomain" should hold for every app in `user_app_instances`.
