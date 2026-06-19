# Phase 286: App-install end-to-end fix — Research

**Researched:** 2026-06-18 (6 Explore agents this session + Supabase catalog SQL survey + live box diagnostics)
**Status:** RESEARCH COMPLETE

## RESEARCH COMPLETE

### Question answered
"What does it take for ANY of the 535+ store apps to actually WORK (not just container 'Up') after install, on EVERY box (uid-agnostic, root-or-not), Caddy-compatible — and why do n8n/activepieces_db/campfire_redis/syncthing currently crash-loop?"

---

## 1. Root cause — uid mismatch (containers never run)

**Evidence:**
- livinityd runs as the desktop user, **non-root**: `scripts/install/deploy-livinityd.sh:1895` renders the systemd unit with `User=${_DLD_DESKTOP_USER}` / `Group=${_DLD_DESKTOP_USER}`. `update.sh:2260` reads `User=` back. Live box `id` → `uid=1001(everything) gid=1001 groups=...,27(sudo),124(docker)`. `bruce` holds uid 1000.
- Catalog standardized on uid 1000 (Supabase `apps` where section='app'): **476/535 named volumes**, **316 services force `user:1000`**, 5 non-1000 (`5001,927,1001,101,0`), **535 unique ports 41000–41534**.
- Docker creates an **empty named-volume `_data` owned by root(0)** (DB images create their data dir at runtime); livinityd creates **bind dirs owned by its uid (1001)**. A container running as uid 1000 (or an image-baked non-root uid) can write neither → **EACCES** (e.g. n8n `open '/home/node/.n8n/config'`) → crash-loop.
- livinityd's `chown 1000:1000` attempts **silently fail**: a non-root process (uid 1001) cannot chown to a *different* uid → EPERM, swallowed.

**Live box confirmation:** all `/opt/livos/data/app-data/*` dirs are `1001:1001`; n8n's mount is a **bind** `/opt/livos/data/app-data/n8n/data → /home/node/.n8n`, ContainerUser=`node`(1000); the orphan named volume `n8n_n8n_server_data` is `1000`-owned with healthy data (Docker seeded it correctly once ownership matched). Crash-loopers: `n8n_server_1`, `activepieces_db_1`, `campfire_redis_1`, `syncthing_server_1`.

**Broken chown/chmod call sites (all run as non-root livinityd → fail):**
- `apps.ts:273` `chown -R 1000:1000 ${dataDirectory}/app-data` (boot sweep)
- `apps.ts:450` `chown -R 1000:1000 ${appDataDirectory}` (native install)
- `apps.ts:559` `chown -R 1000:1000 ${appDataDirectory}` (post-rsync; chowns the WHOLE app dir incl. management files — would also break livinityd writes if it succeeded)
- `app.ts:330` `chmod -R 777 ${hostPath}` (only for `hostPath.startsWith(this.dataDirectory)`; skipped because the compose path is the *unexpanded* `${APP_DATA_DIR}` token → `startsWith` is false → never runs; that's why the bind dir is 755 not 777)
- `app-script:415` `chown -R 1000:1000 "${app_data}" 2>/dev/null || true`
- `apps.ts:266` `sudo chown ... /tor` — Tor removed in P276; likely dead, verify.

## 2. Root cause — builtin shadows the catalog

`apps.ts:491-513` install resolution: **`generateAppTemplate(appId)` (builtin-apps.ts) is tried FIRST** (`:498`); the Supabase catalog (`fetchPlatformTemplate` → `https://livinity.io/api/apps/${appId}`, `:1007-1069`) is used ONLY on a builtin miss. So an app present in `builtin-apps.ts` installs the **builtin** def, never the catalog one. n8n proof: installed container is the builtin (bind mount, `n8nio/n8n:latest`, port 5678), not the catalog (named volume, pinned `2.26.4`, port 41292). Builtins are inconsistent (bind + unpinned + default port → cross-app port-collision risk; catalog ports are unique 41000-41534).

## 3. Root cause — "Up but not working" (no health verification)

`app.ts:316-353` `install()`: after `await pRetry(() => appScript(...,'install'...), {retries:2})` (`:340`) it sets `this.state = 'ready'` (`:349`) immediately. `compose up --detach` returns when containers are *scheduled*, not *running/healthy*. **No `docker ps`/healthcheck/HTTP poll.** A crash-looping or unhealthy container is reported "ready" → Caddy proxies to a dead upstream → **502**. Healthcheck blocks in composes are docker metadata only, never enforced by livinityd.

## 4. Caddy / reachability pipeline (must stay compatible + be hardened)

- Apps are reached via **host loopback**, not the internal network: `caddy.ts:879` emits `reverse_proxy 127.0.0.1:${sub.port}`. So the app MUST publish a loopback host port. `app.ts:114-147` injects `127.0.0.1:${manifest.port}:${manifest.port}` IF the compose has no existing `${manifest.port}:` mapping. Catalog composes carry an explicit `host:container` mapping (e.g. `41292:5678`) so injection is skipped (correct); builtin injection assumes container-listen-port == manifest.port (can be wrong).
- `app_proxy` (Umbrel) is **deleted** at patch time (`app.ts:108`) — LivOS uses Caddy, not app_proxy.
- Shared network `livinity_main_network` (subnet 10.21.0.0/16): created explicitly + idempotently in `app-environment.ts:34-47` (P276 fix) because the networks-only legacy-compat compose has no services; **bare `catch{}`** swallows ALL errors (a real failure → every app's `external:` attach fails). Each app joins via `legacy-compat/docker-compose.common.yml`.
- Post-up: `apps.ts:715` appEnvironment up → `:716` app.install → CF subdomain provision (`provisionAppSubdomain`, best-effort, Server5) → `registerAppSubdomain` (`:772-781/1783-1841`, writes Redis `livos:domain:subdomains` + calls `rebuildCaddyFromState` `:1340-1450` → `reloadCaddy()` `caddy reload`). **registerAppSubdomain failure is caught and non-fatal** → no Caddy block → 404 even though the container is fine.
- Gating: `caddy.ts:320-326` forward_auth `127.0.0.1:8080 /auth/verify`; WS transport handled (flush_interval -1; http/1.1) for CF Tunnel. Subdomain pattern: canonical `{app}-{user}.livinity.io` (Server5) or fallback `{app}.{domain}`.

## 5. Compose is parsed to a mutable object (where to hook)

`app.ts:84` `readCompose()` = `yaml.load` → `{ services: {name: {user?, image?, volumes?, ports?, container_name?, ...}}, volumes: {key: def} }`; `app.ts:96` `writeCompose()` = `yaml.dump`. `patchComposeFile()` (`:100-303`) already mutates services (container_name `:157`, ports `:114-147`, env `:217-232`, deletes app_proxy `:108`) and persists with `writeCompose` (`:302`) BEFORE the up. → The reconciliation can enumerate `services[*].user/.volumes` + top-level `volumes` here.

**Five `docker compose up` chokepoints (reconcile before each):**
1. `app-script:419` `compose "${app}" up --detach --build` (single-user install AND start — both route through `start_app()`; project-name `${app}` `:336`). Driven by `app.ts patchComposeFile()` (`:320` install / `:396` start).
2. `apps.ts:322` boot per-user restart (`docker compose ... --project-name ${appId}-user-${username} up -d`).
3. `apps.ts:2030` per-user install.
4/5. `apps.ts:839/868` reapply config (`docker compose up -d --force-recreate`).

Named-volume runtime name = `${projectName}_${volumeKey}` (single-user project = `${appId}`; per-user = `${appId}-user-${username}`).

## 6. Catalog patterns (informs the uid-resolution rule)

SQL survey: `user:` uid distribution = 1000×316, then 5001/927/1001/101/0 ×1 each. 199 apps have a numeric `user:`; 34 use PUID/PGID (linuxserver — those images start as root, read PUID, chown internally, drop → self-heal; our pre-chown to 1000 is harmless/aligned). 82 mention postgres, 47 redis (these force user:1000 + named volume → the exact root-owned-volume crash class). → Resolving to the **declared** `user:` uid (default 1000) is correct and covers all observed cases; image-inspect fallback covers no-`user:` images (e.g. builtin n8n = node/1000).

## Implementation guidance (for the planner)
- New `apps/reconcile-volume-ownership.ts` exporting `reconcileAppVolumeOwnership(app, {projectName})`; use existing `execa $` style (import `{$} from 'execa'`), mirror existing `docker` shell-outs. chown via `$\`docker run --rm -v ${target}:/d alpine chown -R ${uid}:${gid} /d\`.catch(log)`. `docker volume create` for named vols (idempotent), `fse.mkdirp` for binds. Skip `external` vols + `user:0`/root + non-app system paths.
- Wire into the 5 chokepoints; centralize + delete the 5 broken chown/chmod sites. Keep management files at livinityd uid.
- Boot backfill: replace `apps.ts:273` with a loop over installed apps calling the helper.
- Health poll: add after `compose up` in `app.ts install()/start()`; `docker inspect` main service for `State.Running` (+`Health.Status` if present); timeout+retry; set error state on failure.
- Catalog>builtin: audit the ~10 builtins vs catalog at `apps.ts:491-513`; prefer catalog or fix shadowing builtins; preserve special builtins.
- Caddy hardening: surface/retry registerAppSubdomain + rebuildCaddyFromState; verify host-port==listen-port; narrow network-create catch.

## Security / threat-model notes (for PLAN <threat_model> blocks)
- The helper runs `docker run alpine chown` = **root inside a container** mounting host paths/volumes. Inputs (image names, volume keys, host paths) come from compose files that admins/catalog control. Mitigations: only operate on paths under `dataDirectory` or declared compose volumes; never interpolate untrusted strings into shell unsafely (execa `$` arg-arrays avoid injection); skip system paths; chown (preserves mode 700 for PGDATA), never chmod 777. App install is already admin-gated (Phase 256). No new external surface.

## Constraints
- tsc baseline **305** (stay ≤305); livinityd via tsx (no compile); ship = release tag → update.sh (boot-backfill self-heals existing boxes). Do NOT touch the operator's box.
