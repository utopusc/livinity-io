# Phase 286: App-install end-to-end fix — Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Source:** Operator request + 6-agent investigation (this session) + Supabase catalog survey + live box diagnostics. Approved plan: `C:\Users\hello\.claude\plans\snug-bubbling-oasis.md`.

<domain>
## Phase Boundary

**In scope:** Make ANY store app (all 535+ — both `builtin-apps.ts` and Supabase catalog) actually WORK after install, on EVERY box, regardless of the desktop user's uid (1000/1001) or whether livinityd is root. "Work" = container starts with the right uid (no EACCES crash-loop), is verified healthy before being marked ready, and is reachable end-to-end through Caddy. Source-code fix in livinityd; existing broken boxes self-heal on the next Update.

**Out of scope / explicit NON-goals:**
- **NO changes to the operator's live box** (no manual chown/recreate). The operator explicitly forbade touching their PC. The fix is source-code only; their box recovers via the boot-backfill on Update.
- Not re-architecting the store/catalog, the CF Tunnel/subdomain provisioning (Server5), or the auth/gating model.
- Not migrating away from bind-mount-under-app-data toward pure named volumes (LivOS deliberately keeps data under `/opt/livos/data/app-data` for backups/Files — preserve that).
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Root cause (evidence-backed — do not re-litigate)
- livinityd runs as the desktop user (`everything`, uid **1001**), **NOT root** (`deploy-livinityd.sh:1895` `User=${_DLD_DESKTOP_USER}`; live box `id` → `uid=1001(everything)`, in `docker`+`sudo` groups; `bruce` holds uid 1000).
- The catalog is Umbrel-derived and standardized on uid **1000**: Supabase shows **476/535 named volumes**, **316 services force `user:1000`** (only 5 apps use a non-1000 uid: 5001/927/1001/101/0), and **all 535 host-ports are unique (41000–41534)**.
- Docker creates an **empty named-volume `_data` owned by root(0)** (all DB images init at runtime); livinityd creates **bind dirs owned by 1001**. A container forced to uid 1000 (or an image-baked non-root uid) cannot write either → **EACCES → crash-loop**.
- livinityd's existing `chown 1000:1000` calls **silently fail**: a non-root process (1001) cannot chown a file to a *different* uid (EPERM, swallowed by `.catch(()=>{})` / `2>/dev/null || true`).

### Fix strategy (LOCKED)
1. **Volume ownership reconciliation via the docker group (root helper container).** Before every `docker compose up`, for each service, derive the target uid:gid and chown each of its volumes (named AND bind) to that uid via `docker run --rm -v <target>:/d alpine chown -R <uid>:<gid> /d`. This runs as root *inside the container* → always succeeds even though livinityd is non-root (only `docker` group membership is needed — the box has it; **NO sudo**).
2. **Target uid resolution (per service):** compose `user:` directive (`^(\d+)(?::(\d+))?$`) → else `docker image inspect <image> -f '{{.Config.User}}'` (numeric → use it; a name like `node`/`postgres` → default 1000; empty → root → SKIP, root writes anything) → else **default 1000:1000** (the Umbrel convention covering 316+ services). Chowning to the *declared* uid (not blindly 1000) is what makes the 5 non-1000 apps correct too.
3. **Named volumes:** `docker volume create ${projectName}_${volumeKey}` (idempotent) then chown its mountpoint. **Bind mounts:** `fse.mkdirp(hostPath)` then chown. Skip `external: true` volumes and system paths (`/var/run/docker.sock`, etc.).
4. **Only data volumes are chowned — never the app dir / management files.** compose.yml/.env/livinity-app.yml stay owned by livinityd's user (1001) so reinstall/update can still rewrite them.
5. **Remove the broken hardcoded calls** (`apps.ts:273/450/559`, `app.ts:330` chmod 777, `app-script:415`) and centralize into the new helper.
6. **Boot backfill:** replace the failing blanket `apps.ts:273` boot chown with a loop that reconciles ALL installed apps → existing broken boxes self-heal on the next livinityd restart/Update.
7. **Health/readiness verification:** after `compose up --detach`, poll the main service container (`docker inspect`) until Running (and `Health.Status==healthy` if a healthcheck exists), with timeout + retry; do NOT set `state='ready'` while crash-looping — surface an error state. (Fixes the "Up but 502" lie at `app.ts:349`.)
8. **Catalog > builtin precedence:** audit the ~10 `builtin-apps.ts` apps that shadow the catalog (`apps.ts:498` tries builtin first); prefer the catalog def (named volume + pinned image + unique port) for apps present in both, OR fix the shadowing builtins. Preserve AI-broker / special-mount builtins.
9. **Caddy/reachability hardening:** make `registerAppSubdomain`/`rebuildCaddyFromState` failures visible + retried (not silently swallowed → 404); verify published host port == container listen port == `SubdomainConfig.port`; narrow the network-create bare-catch (`app-environment.ts:44`) so a real failure is surfaced.

### Rejected alternatives (do not revisit)
- `chmod 0777` on data dirs — breaks postgres (refuses world-readable PGDATA). ❌
- chown always to fixed 1000 — breaks the 5 non-1000-uid apps (we chown to the *declared* uid). ❌
- Make the desktop user uid 1000 — `bruce` already holds 1000; invasive on existing boxes. ❌
- Force every container to `user: 1001` — breaks images needing root setup / specific uids. ❌
- Mass-edit 476 catalog composes in Supabase — they're already correct (Umbrel-standard); the gap is runtime ownership = livinityd's job. ❌

### Operator constraints (LOCKED)
- Do NOT touch the operator's box. Fix is source-code only.
- Must work on EVERY PC (uid-agnostic, root-or-not).
- Must be Caddy-compatible and deliver real end-to-end functionality ("container Up ≠ app works").
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Install / compose pipeline (livinityd)
- `livos/packages/livinityd/source/modules/apps/apps.ts` — install orchestration (`install()` ~:435-787, `:715` appEnvironment up, `:716` app.install), template resolution (`:491-513`), platform/catalog fetch (`fetchPlatformTemplate` ~:1007-1069), boot per-user restart (`:322`), per-user install (`:2030`), reapply (`:839/:868`), boot chown sweep (`:273`), native install chown (`:450`), post-rsync chown (`:559`), volume pre-create regex (`:551-556`), Caddy register (`registerAppSubdomain` ~:772-781/1783-1841, `rebuildCaddyFromState` ~:1340-1450).
- `livos/packages/livinityd/source/modules/apps/app.ts` — `readCompose()`/`writeCompose()` (`:84/:96`, yaml.load/dump), `patchComposeFile()` (`:100-303`, container_name `:157`, port inject `:114-147`, .env write `:217-232`, app_proxy delete `:108`, writeCompose `:302`), `install()` (`:316-353`, pRetry `:340`, state='ready' `:349`), volume chmod 777 (`:322-330`), `pull()` (`:305-314`).
- `livos/packages/livinityd/source/modules/apps/compose-generator.ts` — `generateAppTemplate()` (`:13-150`), `getBuiltinApp` lookup.
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` — BUILTIN_APPS registry (~:85-1554), n8n builtin (~:86-217, bind `${APP_DATA_DIR}/data:/home/node/.n8n`, image `n8nio/n8n:latest`).
- `livos/packages/livinityd/source/modules/apps/legacy-compat/app-script` — bash `install`/`start_app`/`compose` (~:290-476): chown `:415`, `compose up --detach --build` `:419`, project-name `${app}` `:336`.
- `livos/packages/livinityd/source/modules/apps/legacy-compat/app-environment.ts` — network create (`:34-47`, `docker network create --subnet 10.21.0.0/16 livinity_main_network`).
- `livos/packages/livinityd/source/modules/apps/legacy-compat/docker-compose.common.yml` — external `livinity_main_network` attach.
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — subdomain block gen (~:784-956), `reverse_proxy 127.0.0.1:${sub.port}` (`:879`), forward_auth gate (`:320-326`), `reloadCaddy()` (~:1160).
- `livos/packages/livinityd/source/modules/apps/desktop-user.ts` — `getDesktopUser()/getDesktopHome()/getDesktopUid()` (no `getDesktopGid()` yet).
- `scripts/install/deploy-livinityd.sh:1895` — `User=${_DLD_DESKTOP_USER}` (livinityd runs as desktop user, non-root).

### Approved plan
- `C:\Users\hello\.claude\plans\snug-bubbling-oasis.md` — the operator-approved 5-phase plan this CONTEXT derives from.
</canonical_refs>

<specifics>
## Specific Ideas / evidence anchors
- Live box diagnostics: app-data dirs all `1001:1001`; n8n container = `bind /opt/livos/data/app-data/n8n/data → /home/node/.n8n`, ContainerUser=`node`; orphan named volume `n8n_n8n_server_data` is `1000`-owned with healthy data (proves Docker seeds correctly when ownership matches); crash-loopers: `n8n_server_1`, `activepieces_db_1`, `campfire_redis_1`, `syncthing_server_1`.
- Supabase survey: 535 app-section apps; 476 named-volume; 316 `user:1000`; 5 non-1000 uids; 535 unique ports 41000–41534 (no collisions in catalog).
- `n8n` catalog vs builtin: catalog = named volume `n8n_data`, pinned `2.26.4`, port 41292; builtin = bind mount, `:latest`, port 5678. Builtin shadows catalog → the worse def was installed.
- tsc baseline = 305 (stay ≤305); livinityd runs via tsx (no compile); ship is release-tag → update.sh.
</specifics>

<deferred>
## Deferred Ideas
- Optional post-Caddy-reload HTTP reachability probe (nice-to-have observability; can land with Phase D or later).
- Pure-named-volume migration / dropping bind-under-app-data — explicitly NOT done (breaks backups/Files).
- Per-app uid override UI — not needed (resolution is automatic from compose/image).
</deferred>

---

*Phase: 286-app-install-end-to-end-fix*
*Context gathered: 2026-06-18*
