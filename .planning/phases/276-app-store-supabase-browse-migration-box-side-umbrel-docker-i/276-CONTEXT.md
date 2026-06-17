# Phase 276 — CONTEXT (investigation findings, pre-plan)

> Written 2026-06-17 from two parallel investigation agents this session. Feed
> this to the researcher/planner so it BUILDS ON this rather than rediscovering.
> Everything below is evidence-backed with file:line refs (verify before edit).

## Corrected premise (operator clarified)
`livinity.io/store` (platform/web) **already reads Supabase** (`apps` table) — the
WEB side is DONE. The GAP is the **LivOS BOX (livinityd)** marketplace, which does
NOT browse Supabase. So this phase is mostly box-side.

---

## Finding 1 — App-store data flow (box / livinityd)

**Install BY ID has a Supabase path; catalog BROWSE does NOT.**

- **Install resolution chain** (`apps.ts:497-526`, mirrored `:1943-1962`):
  Step 1 `generateAppTemplate` (builtin, network-free) → Step 2 `fetchPlatformTemplate`
  → `GET https://livinity.io/api/apps/<id>` (Supabase, gated by Redis `livos:platform:api_key`,
  `apps.ts:1050-1112`) → Step 3 `appStore.getAppTemplateFilePath` (git clone).
- **Browse / marketplace grid** is fed ONLY by:
  - `appStore.registry()` (`app-store.ts:87-123`) = git clone of `utopusc/livinity-apps`
    (`constants.ts:2` `LIVINITY_APP_STORE_REPO`, seeded `index.ts:429`/`:440`/`:551`).
  - `builtin-apps.ts` (`BUILTIN_APPS`, ~28 hardcoded apps; tRPC `appStore.builtinApps` `routes.ts:38`).
  - **NO call to `/api/apps` (the list endpoint) anywhere in `livos/`.** That endpoint exists
    (`platform/web/src/app/api/apps/route.ts`) but the box never calls it.
- Git-clone + `.tmp` cache mechanics: `AppRepository` (`app-repository.ts`), `atomicClone()`
  (`:83-103` → `${dataDirectory}/app-stores/.tmp/<randomToken(64)>` then `fse.move` to
  `app-stores/<cleanUrl-hash>`), `update()` (`:131-143`, listServerRefs HEAD check), `readRegistry()`
  (`:146-205`, globs `*/livinity-app.yml`).

**THE GAP (blocker):** removing the git-clone WITHOUT adding a Supabase browse path collapses
the box marketplace to builtins-only. Every web-admin-added Supabase app becomes
invisible + un-discoverable from the desktop (install-by-exact-id still works only if the box
has `livos:platform:api_key` AND the user already knows the id).

### Dead code (non-functional now `utopusc/livinity-apps` GitHub repo is deleted)
- `constants.ts:2` `LIVINITY_APP_STORE_REPO` + default-repo seed (`index.ts:429`).
- `app-repository.ts` `atomicClone()` (`.tmp`), `update()`/`checkLatestCommit` (404-retry forever),
  the official-repo meta-hack in `readRegistry()` (`:154-166` → always empty `apps`).
- `app-store.ts` default-repo init/retry (`:31-53`) + 5-min `update()` loop (`:57`).
- `platform/web/src/app/api/admin/sync-catalog/route.ts` — one-way GitHub→Supabase importer
  (`REPO='utopusc/livinity-apps'`); GitHub source gone → 404/502, now fully dead. Same for the
  `store_sync_catalog` MCP tool (livinity-store MCP).
- Icon fallbacks → `utopusc/livinity-apps-gallery` (`app-repository.ts:195`, `routes.ts:112`,
  `apps.ts:112`) — a SEPARATE *gallery* repo; confirm whether it too was deleted before touching.

### Load-bearing — MUST keep
- `builtin-apps.ts` + `compose-generator.ts` (`generateAppTemplate`, `:13-166`) — network-free
  install (step 1) + builtin browse for ~28 apps.
- `fetchPlatformTemplate` (`apps.ts:1050-1112`) + `fetchPlatformAppManifest` (`:1123-1143`) +
  `native-installer.ts:227 fetchCatalogIconUrl` — the ONLY Supabase read path (install). Requires
  `livos:platform:api_key` in Redis; absent → all three silently no-op.
- `registry()` must keep returning a valid (possibly builtin-only) `{url, meta, apps}` shape —
  `available-apps.tsx:30-31` THROWS "Failed to fetch apps." if the `appStore.registry` query *errors*.

### Proposed fix (WS1)
Add a Supabase-backed browse source to livinityd: a new `AppRepository`-equivalent (or a
`registry()` branch) that `GET https://livinity.io/api/apps`, maps rows → the `{url, meta, apps}`
shape `available-apps.tsx` expects. THEN remove the dead git-clone code.
- **OPEN Q (verify in plan):** does `/api/apps` (list) require the api-key, or is it public? Is
  `livos:platform:api_key` provisioned on every box? (Browse+install both depend on it.)

---

## Finding 2 — Umbrel docker images (auth-server + tor) = DEAD, removable

Both images are **pulled+retagged at install AND `docker compose up`'d every boot — but nothing
routes to them.** LivOS auth = livinityd `/auth/verify` + Caddy `forward_auth 127.0.0.1:8080`
(`caddy.ts:320/430`); legacy `app_proxy` is explicitly stripped (`app.ts:117-120`); remote access =
Cloudflare Tunnel.

| Item | Verdict |
|---|---|
| `livos/auth-server` (from `getumbrel/auth-server:1.0.5`) | **DEAD — remove.** `auth` service in `legacy-compat/docker-compose.yml:17-41`; `LIVINITY_AUTH_SECRET='DEADBEEF'` "Not used, compat only" (`app-environment.ts:33`); `AUTH_IP/PORT` referenced nowhere else. |
| `livos/tor` (from `getumbrel/tor:0.4.7.8`) | **DEAD — remove (1 live-check).** `tor_proxy` service (`docker-compose.yml:4-16`) starts unconditionally; `torEnabled` defaults false (`apps.ts:165`), gates only legacy onion hidden-service. ⚠️ LIVE CHECK: confirm no shipped app compose uses `tor_proxy`/SOCKS `9050` (legacy Bitcoin-style apps did). |
| `docker/build-images.sh` (clones `getumbrel/umbrel.git`) | **DEAD — orphaned**, no caller. |
| npm `@homebridge/dbus-native` (`package.json:69`) | **KEEP** — imported `dbus/dbus.ts:4`. Real lib (umbrel fork). |
| npm `systeminformation` (`package.json:141`) | **KEEP** — imported `system.ts`/`monitoring.ts`/`is-livinity-home.ts`. Real lib. |

### Pull/retag sites + full removal file list (WS2)
- Pull/retag: `scripts/install/deploy-livinityd.sh` `_dld_setup_docker_images()` (`:787`, table `:799-802`,
  `docker tag` `:833-839`, call `:2922`); `livos/install.sh` `setup_docker_images()` (`:408-443`, call `:1813`).
- Runtime (the actual fix — delete services so images are unreferenced):
  `legacy-compat/docker-compose.yml` `auth` (`:17-41`) + `tor_proxy` (`:4-16`) services; consider whether
  `Apps.start()` (`apps.ts:248-268`) + install-time (`:728`) should drop the `appEnvironment 'up'` call
  entirely; dead env in `app-environment.ts:23-37`. Sibling dead fragments: `docker-compose.tor.yml`,
  `docker-compose.app_proxy.yml`, `docker-compose.common.yml`, `tor-entrypoint.sh`, `tor-*-torrc`.
- Tests (will FAIL if not updated): `scripts/install/__tests__/test-deploy-livinityd.sh` TEST 39
  (`:943-954`), TEST 40 (`:956-964`), TEST 41 (`:966-975`).
- Docs/packaging: `docker-images/README.md` (whole file), `docker-images/push-to-dockerhub.sh` (`:82-130`),
  orphaned `docker/build-images.sh`. Prose ref `SECURITY-AUDIT.md:552`.

---

## Finding 3 — libva-utils apt (minor)
`E: Unable to locate package libva-utils` → VAAPI userspace install fails → libx264 fallback (non-fatal).
Package name wrong/renamed on the box's Ubuntu (likely `vainfo`). Fix the package name or make the skip
clean. In the streaming-deps apt step (`update.sh` ~339-405 / `deploy-livinityd.sh` `_dld_install_streaming_packages`).

---

## Constraints
- Box deploy is **release-based** (tag → `update.sh`); livinityd runs via **tsx** (no build).
- **High blast radius:** marketplace + install + boot path. Needs careful sequencing + box verification.
- Operator wants the box marketplace to BROWSE Supabase apps.

## Recommended sequencing (for the planner)
1. WS2 auth-server removal (safe, independent quick win).
2. WS1 add Supabase browse path → THEN remove dead git-clone (the real work; verify api_key first).
3. WS2 tor removal (after the `tor_proxy`/9050 live-box check).
4. WS3 libva-utils.

## Open questions to resolve in planning / on the box
- Is `/api/apps` (list) public or api-key-gated? Is `livos:platform:api_key` set on every box?
- Does any shipped app compose reference `tor_proxy` / SOCKS `9050`?
- Was `utopusc/livinity-apps-gallery` (icon gallery repo) also deleted?
