# Phase 276 — CONTEXT (investigation findings, pre-plan)

> Originally written 2026-06-17 from two investigation agents. **REVISED 2026-06-17**
> after a verification workflow (5 agents) + a dedicated iframe-vs-native-grid agent
> CORRECTED the central premise. Operator decisions baked in: **WS1 = delete dead code
> (browse stays in the iframe), NOT add a Supabase browse path.** **WS3 = DROPPED.**
> Everything below is evidence-backed with file:line refs (all re-verified by opening files).

---

## ⚠️ CORRECTED PREMISE (this overrides the original framing)

The ORIGINAL CONTEXT said: *"the box marketplace BROWSE does NOT browse Supabase = THE GAP
(blocker); WS1 must ADD a Supabase browse path."* **This is WRONG / stale.** Re-investigation:

- **The live box marketplace is an IFRAME of `https://livinity.io/store`**, which reads Supabase
  on the web side. Component `AppStoreWindowContent` renders
  `<iframe src="https://livinity.io/store?token=<apiKey>&instance=<hostname>">`
  (`livos/packages/ui/src/modules/window/app-contents/app-store-content.tsx:56-66`), mounted when
  `appId === 'LIVINITY_app-store'` (`window-content.tsx:214-215`).
- **The native React grid is DEAD CODE.** All `/app-store/*` routes were intentionally removed
  post-Phase 108 UAT (2026-05-13): `router.tsx:35-38` (commented-out lazy imports) + `router.tsx:159-171`
  (removal explanation). `discover.tsx` (the native grid) is never routed; `cmdk.tsx:251` now opens the
  iframe window instead of the dead `/app-store/<id>` route.
- **`available-apps.tsx` + `AvailableAppsProvider` + `appStore.registry()` are the dead grid's data
  path** — `available-apps.tsx` (`livos/packages/ui/src/providers/available-apps.tsx:23`) queries
  `trpcReact.appStore.registry`, but with no route rendering the grid, the result is never displayed.
- **Install works** via a postMessage bridge: iframe → `use-app-store-bridge.ts` (handleMessage `:583-645`)
  → tRPC `apps.install` / `apps.installV37` / `webapp.create` → `apps.ts` template resolution (`:497-526`).

**Net:** Browse ALREADY comes from Supabase (via the iframe). Operator confirms it works
("iframe çalışıyor, install çalışıyor, sorun yok"). So Phase 276's real WS1 is **removing the dead
git-clone + dead native-grid code**, plus fixing the dead icon fallbacks — NOT building a new browse path.

---

## Finding 1 — App-store data flow (box / livinityd)

**Install BY ID has a Supabase path; the dead native BROWSE grid does not — but browse is the iframe.**

- **Install resolution chain** (`apps.ts:497-526`, mirrored in `installForUser` `:1943-1962`):
  Step 1 `generateAppTemplate` (builtin, network-free) → Step 2 `fetchPlatformTemplate`
  → `GET https://livinity.io/api/apps/<id>` with `X-Api-Key` header (Supabase, gated on Redis
  `livos:platform:api_key`, constant at `apps.ts:67`; body `:1050-1112`) → Step 3
  `appStore.getAppTemplateFilePath` (git clone — **now dead, repo deleted**).
  Native install path (v37) uses `fetchPlatformAppManifest` (`apps.ts:1123-1143`) hitting the same
  `/api/apps/<id>`; `native-installer.ts:234` is a third caller. All three are the per-id endpoint.
- **Live browse = the iframe** (`app-store-content.tsx:56-66`) → `livinity.io/store` → `/api/apps`
  (Supabase). The web store: `platform/web/src/app/store/store-provider.tsx:58` fetches `/api/apps`
  with the token as `X-Api-Key`.
- **Dead native browse grid** is fed by `appStore.registry()` (`app-store.ts:87-123` →
  `app-repository.ts` `readRegistry()` `:146-205`, which git-clones `utopusc/livinity-apps`,
  `constants.ts:2 LIVINITY_APP_STORE_REPO`, seeded `index.ts:429`/`:440`) + `BUILTIN_APPS`
  (**31** apps, `builtin-apps.ts:85`; tRPC `appStore.builtinApps` `routes.ts:38`, `registry` `routes.ts:46`).
- **NO call to the `/api/apps` LIST endpoint anywhere in `livos/`.** Every `/api/apps` ref in livos is
  the per-id form (`apps.ts:1055/1128`, `native-installer.ts:234`). (Moot now: browse is the iframe.)
- Git-clone cache mechanics: `AppRepository.atomicClone()` (`app-repository.ts:83-103`),
  `update()` (`:131-143`), `app-store.ts` default-repo init + `pRetry({retries:5})` (`:31-53`) +
  5-min `runEvery` update loop (`:57`, `updateInterval='5m'` `:12`).

### DEAD CODE (the WS1 removal target — all non-functional)
- `constants.ts:2` `LIVINITY_APP_STORE_REPO` + default-repo seed (`index.ts:429`/`:440`) — repo 404s (gh confirmed).
- `app-repository.ts` `atomicClone()`/`update()`/`readRegistry()` git-clone path.
- `app-store.ts` default-repo init + pRetry (`:31-53`) + 5-min `update()` loop (`:57`).
- `appStore.getAppTemplateFilePath` install Step 3 (community git clone) — repo deleted, always fails.
- Dead UI: `discover.tsx` + all `/app-store/*` routes (already unrouted, `router.tsx:35-38`/`:159-171`),
  `available-apps.tsx` + `AvailableAppsProvider`, `appStore.registry`/`builtinApps` tRPC routes IF nothing
  else consumes them (verify).
- `platform/web/src/app/api/admin/sync-catalog/route.ts` — one-way GitHub→Supabase importer
  (`REPO='utopusc/livinity-apps'`); source gone → dead. Same for `store_sync_catalog` MCP tool.
- **3 dead gallery icon fallbacks** → `utopusc/livinity-apps-gallery` (also deleted, gh 404):
  `app-repository.ts:195`, `routes.ts:112`, `routes.ts:652`. (NOTE the original CONTEXT wrongly said
  `apps.ts:112` — that line is `hostFromUrl()`; the third fallback is `routes.ts:652`.)

### LOAD-BEARING — MUST keep
- `builtin-apps.ts` + `compose-generator.ts` (`generateAppTemplate` `:13-166`) — network-free install Step 1.
- `fetchPlatformTemplate` (`apps.ts:1050-1112`) + `fetchPlatformAppManifest` (`:1123-1143`) +
  `native-installer.ts:227 fetchCatalogIconUrl` — the Supabase READ path for install-by-id. Needs
  `livos:platform:api_key`; absent → all silently no-op (`if (!apiKey) return null/undefined`).
- The iframe + `use-app-store-bridge.ts` (browse + install) — the live marketplace. DO NOT touch.

### WS1 (REDEFINED) — delete the dead code; browse stays in the iframe
1. Remove the git-clone browse mechanism (`app-repository.ts` clone/update, `app-store.ts` init/retry/loop,
   `constants.ts:2`, `index.ts:429/440`) + install Step 3.
2. Remove the dead native grid (`discover.tsx` etc., `available-apps.tsx`/provider) — only if no live
   consumer remains.
3. Fix the 3 dead gallery icon fallbacks → point at Supabase `icon_url` / a live CDN, or drop the synthesized
   URL (else icon-less apps render 404 tiles — applies even in the iframe world, box renders its own tiles).
4. **CAUTION before deleting:** `available-apps.tsx:30-31` HARD-THROWS `'Failed to fetch apps.'` on any
   registry error. Verify ON THE BOX whether `AvailableAppsProvider` is still mounted in the React tree and
   whether `registry()` currently errors vs. gracefully returns builtin-only (the official-repo meta-hack in
   `readRegistry()` may return empty `apps` without erroring). Also verify no user-added community git store
   relies on the clone mechanism before removing it wholesale.

---

## Finding 2 — Umbrel docker images (auth-server + tor) = DEAD, removable

Both images are pulled+retagged at install AND `docker compose up`'d via legacy-compat — nothing routes to
them. LivOS auth = livinityd `/auth/verify` + Caddy `forward_auth 127.0.0.1:8080` (`caddy.ts:320`, also
`:871`/`:977`); legacy `app_proxy` stripped (`app.ts:117-121`); remote access = Cloudflare Tunnel.

| Item | Verdict |
|---|---|
| `livos/auth-server` (from `getumbrel/auth-server:1.0.5`) | **DEAD — remove.** `auth` service `legacy-compat/docker-compose.yml:17-41`; secret env is **`UMBREL_AUTH_SECRET`** (`:24`, image-required name) fed by `$LIVINITY_AUTH_SECRET='DEADBEEF'` "Not used, compat only" (`app-environment.ts:33`); `AUTH_IP`/`AUTH_PORT` only in legacy-compat. **Delete the service — do NOT rename `UMBREL_AUTH_SECRET`.** |
| `livos/tor` (from `getumbrel/tor:0.4.7.8`) | **DEAD — remove.** `tor_proxy` service (`docker-compose.yml:4-16`) starts UNCONDITIONALLY on any legacy-compat `up` (`app-environment.ts:40-43`); `torEnabled` (default false, `apps.ts:165-167`) only switches the torrc file, NOT whether the container runs. **VERIFIED: no shipped app uses it** (see Q2). |
| `docker/build-images.sh` (clones `getumbrel/umbrel.git`) | **DEAD — orphaned**, no caller. |
| npm `@homebridge/dbus-native` (`package.json:69`) | **KEEP** — imported `dbus/dbus.ts:4`. |
| npm `systeminformation` (`package.json:141`) | **KEEP** — imported `system.ts`/`monitoring.ts`/`is-livinity-home.ts`. |

### WS2 — pull/retag sites + full removal file list
- Pull/retag (DUPLICATED — edit both in lockstep): `scripts/install/deploy-livinityd.sh`
  `_dld_setup_docker_images()` (`:787`, table `:799-802`, `docker tag` `:833-839`, call `:2922`);
  `livos/install.sh` `setup_docker_images()` (`:408-443`, table `:413-414`, call `:1813`).
  ⚠️ These shell scripts live at REPO ROOT `scripts/install/` (and `livos/install.sh`), **not** under a
  `livos/scripts/install/` path.
- Runtime (the actual fix — delete the two dead SERVICES so the images are unreferenced):
  `legacy-compat/docker-compose.yml` `auth` (`:17-41`) + `tor_proxy` (`:4-16`) services; dead env in
  `app-environment.ts:23-37` (keep `NETWORK_IP`). **Do NOT drop the `appEnvironment 'up'` call** — see the
  ⚠️ correction below; it creates the load-bearing network.
  - ⚠️ **CORRECTED (adversarial re-verify, 2 agents 95–99%) — legacy-compat is the LIVE app launcher, not dead:**
    `app-script` (called for EVERY app start/stop/install via `app.ts:406`→`app-script.ts`→`app-script:500`)
    UNCONDITIONALLY merges `--file docker-compose.common.yml` (`app-script:356`) into every `docker compose up`;
    `docker-compose.common.yml` is the ONLY place apps attach to `livinity_main_network` (`compose-generator.ts`
    emits NO network). **KEEP `docker-compose.common.yml`, the `networks:` block, `app-script(.ts)`,
    `app-environment.ts` NETWORK_IP.** Deleting common.yml breaks ALL app launches (`docker compose: no such file`).
  - **Safe to delete ONLY:** the `auth` service (276-01) + `tor_proxy` service (276-05). Tor fragments
    (`docker-compose.tor.yml`, `tor-entrypoint.sh`, `tor-*-torrc`) merge only when `REMOTE_TOR_ACCESS=='true'`
    (`app-script:350`) → delete only AFTER removing that app-script branch + tor confirmed OFF. **KEEP**
    `docker-compose.app_proxy.yml` (app.ts:117 strips app_proxy → never merged → harmless) and `docker-compose.common.yml`.
  - ⚠️ **tor is a LIVE feature, not dead cruft:** the "Remote Tor Access" toggle (Settings→Advanced
    `advanced.tsx` + `setTorEnabled` `apps.ts:993`) publishes real `.onion` services when enabled (default OFF,
    `torEnabled` `apps.ts:165`). Removing tor deletes a real feature → GATED on operator decision + box check
    (Remote Tor Access OFF). The `torEnabled`-gated read paths (`app.ts:88`, `routes.ts:104/139/168`,
    `system/routes.ts:234`) are part of that feature, removed in 276-05 Task 5 (or kept if the feature is kept).
- Tests (WILL FAIL if not updated, same change): `scripts/install/__tests__/test-deploy-livinityd.sh`
  TEST 39 (`:943-954`), TEST 40 (`:956-964`), TEST 41 (`:966-975`).
- Docs/packaging: `docker-images/README.md`, `docker-images/push-to-dockerhub.sh` (`:82-130`),
  orphaned `docker/build-images.sh`. Prose ref `SECURITY-AUDIT.md:552`.

---

## Finding 3 — libva-utils (WS3) = DROPPED, no action

The original premise was INVERTED. `libva-utils` is the **CORRECT** Ubuntu/Debian apt package — it PROVIDES
the `vainfo` binary. `vainfo` is NOT an installable package name (installing it would FAIL). Code comment
`update.sh:1054` states this explicitly; install is already non-fatal with libx264 fallback
(`update.sh:1056-1059`, `deploy-livinityd.sh:899-901`). **No fix needed — drop WS3.** (If a box logs
"Unable to locate package libva-utils" it is a transient apt index / mirror issue, not a wrong name — a box
runtime check, not a code change.)

---

## Open questions — RESOLVED

- **Q1 — Is `/api/apps` (LIST) public or key-gated? Is `livos:platform:api_key` on every box?**
  BOTH `/api/apps` LIST (`platform/web/src/app/api/apps/route.ts:11-15`) and `/api/apps/[id]`
  (`[id]/route.ts:11-14`) are **API-KEY-GATED** (→ 401 without `x-api-key`; `liv_k_` prefix + bcrypt vs
  `api_keys.key_hash`, `api-auth.ts:18-50`). The key is provisioned only CONDITIONALLY: install `--api-key`
  (`install.sh:1890-1898`), `_dld_seed_platform_api_key` (`deploy-livinityd.sh:1896-1939`, no-op without
  `LIVOS_API_KEY`), or runtime `platform.setApiKey` tRPC (`platform/routes.ts:25-33`). **`update.sh` NEVER
  seeds it.** So NOT every box has it — but the operator confirms it IS set on the target box. (Moot for
  WS1 since browse is the iframe, which carries the token in its URL.)
- **Q2 — Any shipped app compose using `tor_proxy`/9050/SOCKS/onion?** **NO.** Zero references in
  `builtin-apps.ts`, `compose-generator.ts`, or any test-fixture compose. All hits are dead legacy-compat
  infra or `torEnabled`-gated read paths (default false, return `''`). Tor removal is NOT blocked. (HIGH)
- **Q3 — Are the GitHub repos deleted?** **YES, both** (`gh repo view` → 404 repo-not-found, authenticated).
  `utopusc/livinity-apps` (breaks git-clone browse) AND `utopusc/livinity-apps-gallery` (breaks the 3 icon
  fallbacks). (HIGH)
- **Supabase `apps` table shape:** **634 rows.** Columns: `id`(uuid PK), `slug`, `name`, `tagline`,
  `description`, `category`, `version`, `docker_compose`, `manifest`(jsonb), `icon_url`, `featured`,
  `verified`, `section`(app|webapp|native|ai|plugin), `sort_order`, `created_at`, `updated_at`. `/api/apps`
  returns a FLAT array with `id` aliased to `slug` (`route.ts:29`). Of 634 rows: only 1 still references the
  dead gallery icon; 365 use `getumbrel/umbrel-apps` raw icon URLs (an external dep that could also break).

## Corrections to the original CONTEXT (for the record)
- Original WS1 premise WRONG (see CORRECTED PREMISE) — native grid is dead, browse is the iframe.
- WS3 premise INVERTED — `libva-utils` is correct, dropped.
- `BUILTIN_APPS` = **31**, not ~28. `available-apps.tsx` is BOX UI (`livos/packages/ui/...`), not platform/web.
- 3rd gallery icon fallback is `routes.ts:652`, not `apps.ts:112`. "404-retry" is mis-attributed — it's a
  generic `pRetry({retries:5})` in `app-store.ts:36-49`, not in `app-repository.ts`, not 404-specific.
- Install/deploy shell scripts are at REPO ROOT, not under `livos/`. Two distinct api-key pointers exist:
  `livos:platform:api_key` (App Store/install) vs the account heartbeat key (`/etc/livos/secrets/api-key` +
  `livos:account:api_key_path`, written by `mode-tunnel.sh`) — do NOT conflate.

## Constraints
- Box deploy is **release-based** (tag → `update.sh`); livinityd runs via **tsx** (no build).
- WS1 is now LOW blast radius (deleting already-dead code) but `available-apps.tsx`'s hard-throw + any live
  `registry()` consumer must be verified first. WS2 touches the install/boot path — careful + box-verify.

## Recommended sequencing (for the planner)
1. WS2 auth-server removal (safe, independent quick win; lockstep both scripts + TESTs 39/40/41).
2. WS1 dead-code removal (git-clone + native grid + 3 icon fallbacks) — verify the throw/consumer/community-store first.
3. WS2 tor removal (after a live `docker ps` / runtime check).
4. WS3 — none (dropped).

## MUST CHECK ON THE BOX (cannot be answered from the repo)
1. `redis-cli GET livos:platform:api_key` — confirm set (operator says yes).
2. Is `AvailableAppsProvider` still mounted? Does `registry()` error or return builtin-only? (gates safe WS1 deletion).
3. `docker ps` — are `livos/auth-server:1.0.5` / `livos/tor:0.4.7.8` running; is legacy-compat `up` invoked (any legacy Umbrel app installed)?
4. Do any installed-app tiles currently render 404 icons (dead gallery fallback)?
5. Any user-added community git store relying on the clone mechanism?
