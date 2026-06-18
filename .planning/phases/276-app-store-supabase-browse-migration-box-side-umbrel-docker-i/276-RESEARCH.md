# Phase 276: App-store dead-code removal + Umbrel image cleanup — Research

**Researched:** 2026-06-17
**Domain:** LivOS box (livinityd / ui) dead-code deletion on the marketplace + install + boot paths; install-script docker-image cleanup
**Confidence:** HIGH (every claim re-verified by opening the file; cited file:line)

---

> ⚠️ **CORRECTION (2026-06-17, adversarial re-verify — 2 independent agents, 95–99%). This OVERRIDES any
> WS2 guidance below that says to delete `docker-compose.common.yml` or treats legacy-compat as dead:**
> - **`legacy-compat/docker-compose.common.yml` is LOAD-BEARING — DO NOT DELETE.** The live launcher
>   `app-script` (run for EVERY app start/stop/install via `app.ts:406`→`app-script.ts`→`app-script:500`)
>   UNCONDITIONALLY merges `--file docker-compose.common.yml` (`app-script:356`); it is the ONLY place apps
>   attach to `livinity_main_network` (`compose-generator.ts` emits no network). Deleting it → `docker compose:
>   no such file` → ALL app start/stop/install break.
> - **legacy-compat `app-script` / `app-environment.ts` / the `networks:` block are the LIVE app launcher +
>   network for ALL apps — not dead.** Only the `auth` + `tor_proxy` SERVICES inside the compose are dead.
> - **KEEP:** `docker-compose.common.yml`, the `networks:` block, `app-script(.ts)`, `app-environment.ts`
>   NETWORK_IP, `docker-compose.app_proxy.yml` (never merged — app.ts strips app_proxy). **Delete ONLY:** the
>   `auth` service (276-01) + `tor_proxy` service + its fragments/torrc (276-05, after removing the
>   `app-script` REMOTE_TOR_ACCESS branch).
> - **tor is a LIVE feature** ("Remote Tor Access" toggle, default OFF), not dead cruft → removal is GATED on
>   operator decision + box check. See 276-01-PLAN (auth, safe now) and 276-05-PLAN (tor, DEFERRED-GATED).

---

<user_constraints>
## User Constraints (from CONTEXT.md — operator decisions, locked)

### Locked Decisions
- **WS1 = DELETE dead code; do NOT add a Supabase browse path.** Browse already works via the
  iframe of `https://livinity.io/store` (`app-store-content.tsx:56-66`). The native React grid
  (`discover.tsx`, `available-apps.tsx`, `appStore.registry` git-clone) is dead (routes removed
  post-Phase 108). Install works via the postMessage bridge → `apps.install`/`installV37`.
- **WS2 = remove the dead Umbrel docker images end-to-end** (`livos/auth-server` from
  `getumbrel/auth-server:1.0.5` + `livos/tor` from `getumbrel/tor:0.4.7.8`).
- **WS3 (libva-utils) is DROPPED** — the package name is already correct (`libva-utils` PROVIDES
  `vainfo`; `vainfo` is not an installable package). No action.
- Do NOT rename `UMBREL_AUTH_SECRET` (image-required env name) — delete the whole `auth` service.
- Do NOT conflate `livos:platform:api_key` (App Store/install) with the account heartbeat key
  (`/etc/livos/secrets/api-key`).

### Claude's Discretion
- HOW to stub/keep `appStore.registry`/`builtinApps` so live consumers don't break (this research
  resolves it — see WS1 §"Safe-deletion dependency graph").
- The icon-fallback replacement strategy (this research resolves it — see WS1 §"Icon fallback").
- Whether to keep a minimal git-clone Step 3 vs. rework the test harness (this research surfaces a
  test-blast-radius constraint CONTEXT did not — see WS1 §"Install Step 3 & the test harness").

### Deferred Ideas (OUT OF SCOPE)
- Adding a native Supabase browse grid (browse is the iframe — explicitly NOT this phase).
- CF-SaaS custom-hostnames / community-app-store rework (the git-clone feature is being removed, not reworked).
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal REQ-IDs are mapped to Phase 276 (`.planning/REQUIREMENTS.md` covers v41 phases 209-217;
276 is a later cleanup phase). The de-facto requirements derived from CONTEXT decisions:

| ID (proposed) | Description | Research Support |
|----|-------------|------------------|
| WS1-A | Remove the dead git-clone browse mechanism (AppRepository clone/update/readRegistry, AppStore init/retry/loop) | `app-store.ts` / `app-repository.ts` fully read; consumer graph mapped |
| WS1-B | Remove/neutralize install Step 3 (`getAppTemplateFilePath` git-clone) | `apps.ts:497-526` read; test-harness dependency surfaced |
| WS1-C | Remove dead native grid UI (discover/community-app-store/app-store-routes) ONLY if no live consumer | full UI consumer grep done |
| WS1-D | Stub (not delete) `appStore.registry`/`builtinApps` tRPC routes — they have LIVE consumers | iframe bridge + cmdk + app-icon + RegistryApp type all proven live |
| WS1-E | Fix dead `utopusc/livinity-apps-gallery` icon URLs | onError-placeholder fallback confirmed; Supabase `icon_url` is the live replacement |
| WS2-A | Remove `auth` + `tor_proxy` services from legacy-compat compose | `docker-compose.yml:4-41` read |
| WS2-B | Remove the pull/retag tables in both install scripts (lockstep) | `deploy-livinityd.sh:799-802`, `install.sh:413-414` read |
| WS2-C | Update/remove install TESTs 39/40/41 | `test-deploy-livinityd.sh:943-975` read |
| WS2-D | Delete sibling dead tor/auth fragments | dir listing done |
</phase_requirements>

## Summary

CONTEXT's corrected premise holds: browse is the iframe, the native grid is unrouted, and the
git-clone repo + gallery repo are both deleted on GitHub. **However, re-verification of the actual
consumer graph found that several things CONTEXT flagged as "dead, delete if no consumer" DO have
live consumers, and the test blast radius of removing install Step 3 is much larger than CONTEXT's
3-file list.** The phase is still LOW user-facing risk, but it is NOT a clean "delete everything"
job — two routes must be **stubbed**, not deleted, and the install-test harness must be reworked or
Step 3 minimally preserved.

**Three findings that override CONTEXT's clean-deletion framing:**

1. **`appStore.registry` and `appStore.builtinApps` tRPC routes have LIVE consumers and must be
   STUBBED, not deleted.** Live callers: the iframe install bridge (`use-app-store-bridge.ts:386-387`,
   resilient via `.catch`), the command palette (`cmdk.tsx:104` → `useDebugInstallRandomApps` →
   `useAvailableApps`), `app-icon.tsx:340` (context-menu "Go to store page"), `install-button-connected.tsx:43`,
   and — critically — the `RegistryApp` TYPE (`trpc.ts:149`) is derived from
   `RouterOutput['appStore']['registry']` and is imported by ~20 UI files. Deleting the route breaks
   the type across the UI. **`AvailableAppsProvider` is mounted at `router.tsx:83` wrapping the ENTIRE
   authenticated desktop**, and `available-apps.tsx:30-31` HARD-THROWS on `registry()` error → a
   throwing/removed `registry` route crashes the whole desktop to the ErrorBoundary.

2. **Removing install Step 3 (git-clone) breaks the entire `apps.integration.test.ts` lifecycle
   suite** (~40 assertions), because the test harness (`create-test-livinityd.ts:20-27`) wires a
   local git server as the default repo and installs `sparkles-hello-world` — which is NOT a builtin,
   so it resolves ONLY via Step 3. This is beyond CONTEXT's named test files.

3. **The dead gallery URL is already cosmetically handled** — both `LauncherIcon` (desktop/dock,
   `launcher-icon.tsx:236`) and `components/app-icon.tsx:31` already do
   `onError → APP_ICON_PLACEHOLDER_SRC`. A 404 gallery icon renders the local placeholder, not a
   broken image. Plus there are **12 hard-coded gallery URLs in `builtin-apps.ts`** (not just the 3
   "fallbacks" CONTEXT listed) — 10 builtin apps point their `icon:` directly at the dead gallery.

**Primary recommendation:** Sequence WS2-auth → WS1 → WS2-tor. In WS1, **stub** `registry()` to
return `[]` and **keep** `builtinApps`; delete the git-clone classes + dead UI cluster; replace
gallery URLs with the Supabase `icon_url` (live, carried by the platform install path) and lean on
the existing onError placeholder. **Decide explicitly** whether to keep a minimal Step-3 path for the
test harness or rework the harness to a builtin app — recommend the latter (clean removal).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App marketplace browse | Frontend (iframe → web) | API (Supabase `/api/apps`) | Live path is the iframe of livinity.io/store; box renders nothing for browse |
| App install-by-id | Backend (livinityd `apps.ts`) | API (Supabase `/api/apps/[id]`) | Step 1 builtin (network-free) + Step 2 platform-by-id cover the catalog |
| Installed-app tiles (icons) | Frontend (box UI `app-icon`/`LauncherIcon`) | Backend (`routes.ts` `apps.list`/`myApps`) | Box renders its OWN tiles from `apps.list`; icon URL comes from manifest/builtin |
| Legacy Umbrel auth | (none — removed) | — | LivOS auth = Caddy forward_auth → livinityd `/auth/verify` (`domain/caddy.ts`); auth-server unused |
| Tor hidden services | (none — removed) | — | No shipped app uses tor (CONTEXT Q2: zero refs); `torEnabled` default false |
| Docker image provisioning | Install scripts (bash) | — | `deploy-livinityd.sh` + `install.sh` pull/retag at install time |

---

# WS1 — Remove dead app-store code (box) + fix icon fallbacks

## Safe-deletion dependency graph

### Tier A — SAFE TO DELETE OUTRIGHT (no live consumer)

| File / symbol | Verified status | Why safe |
|---------------|-----------------|----------|
| `livos/packages/ui/src/routes/app-store/` (discover.tsx, category-page.tsx, app-page/, use-discover-query.tsx) | Unrouted since Phase 108 (`router.tsx:159-171` removal note; lazy imports commented `router.tsx:35-38`) | No route renders them |
| `livos/packages/ui/src/routes/community-app-store/` (index.tsx, app-page/) | Unrouted (same removal) | No route renders them |
| `livos/packages/ui/src/modules/window/app-contents/app-store-routes/` (discover-window, category-page-window, app-page-window, app-store-layout-window, marketplace-app-window, shared-components) | `marketplace-app-window` only self-references; window-content.tsx:214-215 renders ONLY the iframe (`AppStoreWindowContent`) | Orphan cluster — window-content never imports them |
| `livos/packages/ui/src/components/install-button-connected.tsx` | Imported ONLY by the dead clusters above (app-store-routes + routes/app-store + community-app-store) | All importers are Tier A |
| `livos/packages/ui/src/modules/app-store/discover/` (apps-three-column-section, apps-row-section, apps-grid-section) | Consumed only by dead app-store routes | Tier A |
| `livos/packages/ui/src/modules/app-store/community-app-store-dialog.tsx` | Consumed only by `layouts/app-store.tsx` (itself dead — uses `useAvailableApps` for the dead grid) | Verify `layouts/app-store.tsx` has no live importer before deleting |
| `livos/packages/ui/src/hooks/use-debug-install-random-apps.ts` | Consumed by `cmdk.tsx:104` (LIVE) → **see Tier B caveat** | Move to Tier B — do NOT delete blindly |
| `platform/web/src/app/api/admin/sync-catalog/route.ts` | `REPO='utopusc/livinity-apps'` (`:5`) — source gone (404) | Dead one-way importer; admin caller is `platform/web/src/app/admin/store/page.tsx` (admin-only, also dead path) |

### Tier B — MUST STUB or ADJUST (live consumers; deleting breaks runtime/types)

| Symbol | Live consumer(s) | Required action |
|--------|------------------|-----------------|
| **`appStore.registry` route** (`apps/routes.ts:46`) | `use-app-store-bridge.ts:386` (iframe install, `.catch`-resilient); `available-apps.tsx:23` (provider mounted desktop-wide at `router.tsx:83`, HARD-THROWS on error at `:30-31`); `app-icon.tsx:340` via `utils.ts:20`; `cmdk.tsx` via `useAvailableApps`; **`RegistryApp` type `trpc.ts:149`** | **STUB** `ctx.appStore.registry()` to return `[]` (keep the route + its output shape). Do NOT delete the route — it breaks the `RegistryApp` type across ~20 UI files and crashes the desktop provider. |
| **`appStore.builtinApps` route** (`apps/routes.ts:38`) | `use-app-store-bridge.ts:387` (env-override resolution for builtin apps at install — LOAD-BEARING); `install-button-connected.tsx:43` (Tier A, dies with it) | **KEEP** — returns `BUILTIN_APPS`, no git dependency, drives env-override prompts in the live install bridge. |
| **`appStore.searchBuiltin`** (`apps/routes.ts:41`) | No UI consumer found (`searchBuiltin` grep empty in ui/src) | Safe to delete OR keep (harmless; no git dependency). Recommend keep — trivial, no cost. |
| **`AppStore.registry()` method** (`app-store.ts:87-123`) | Called by the stubbed route + `getAppTemplateFilePath` (Step 3) | Replace body with `return []` (drops `getRepositories()`/`readRegistry()` calls). Keep the method signature for the route. |
| **`useAvailableApps`/`AvailableAppsProvider`** (`available-apps.tsx`) | `router.tsx:83` (LIVE, desktop-wide); `cmdk.tsx`; `not-found.tsx`; `error-boundary-page-fallback.tsx`; `install-first-app.tsx`; dead app-store routes | If registry returns `[]`, the provider returns `{repos:[],...}` without throwing → safe. **Option 1 (low-risk):** keep the provider, let it resolve to empty. **Option 2 (full cleanup):** remove the provider AND fix all 5 live mount points (`router.tsx`, `not-found.tsx`, `error-boundary-page-fallback.tsx`, `cmdk.tsx` via the debug hook, `install-first-app.tsx`). Option 1 is the safer first ship; Option 2 is a follow-up. |
| **`use-debug-install-random-apps.ts`** | `cmdk.tsx:104` (hook called every render; UI gated behind `DebugOnlyBare` at `cmdk.tsx:276`) | The hook calls `useAvailableApps()` on every cmdk render. If `useAvailableApps` is kept (Option 1) it returns empty → hook is harmless. If you delete `useAvailableApps`, you must also remove the `cmdk.tsx:104` call + the `DebugOnlyBare` block. |
| **`factory-reset.ts:525-529`** | Resets `appRepositories` store key to `LIVINITY_APP_STORE_REPO` on factory reset | If you remove the constant, update factory-reset to set `appRepositories` to `[]` (or remove that reset line). |

### Tier C — install resolution chain (`apps.ts:497-526`, mirrored `installForUser:1943-1962`)

```
install(appId):
  Step 1  generateAppTemplate(appId)        ← builtin, network-free  [KEEP — load-bearing]
  Step 2  fetchPlatformTemplate(appId)       ← GET /api/apps/<id> (Supabase, X-Api-Key)  [KEEP — load-bearing]
  Step 3  appStore.getAppTemplateFilePath()  ← git-clone community repo  [REMOVE — repo deleted]
          catch → throw `App ${appId} not found: no builtin..., not in any app repository`
```

**Removing Step 3:** Step 1 (builtin) + Step 2 (Supabase-by-id, 634 rows) cover the live catalog.
Step 3's only function now is the test harness (sparkles) + any user-added community git repo (the
feature being removed by operator decision). **Action:** replace the Step 3 try/catch with a direct
throw so the "not found" path is preserved:

```ts
// after Step 2 returns null:
throw new Error(`App ${appId} not found: no builtin definition and no platform compose`)
```

This keeps `apps.integration.test.ts:68-69` (`install unknown-app-id → throws 'not found'`) green —
the assertion only matches `/not found/`.

### Install Step 3 & the test harness (CONSTRAINT CONTEXT MISSED)

`create-test-livinityd.ts:20-27` spins up a local git server (`run-git-server.js`) and sets it as
`defaultAppStoreRepo`. `apps.integration.test.ts` installs `sparkles-hello-world` (NOT a builtin —
grep of `builtin-apps.ts` for `sparkles` is empty) across its ENTIRE lifecycle suite (install →
state → restart → update → stop → start → uninstall → backup-ignore → auto-reinstall, ~40
assertions, lines 94-302). **All of these resolve via Step 3 git-clone.** Removing Step 3 fails this
whole file, not just the 3 files CONTEXT named.

**Planner decision (recommend Option B):**
- **Option A (minimal):** Keep `getAppTemplateFilePath` + AppRepository + the test harness; only
  change the DEFAULT repo away from the dead `utopusc/livinity-apps`. Smaller diff, but leaves the
  git-clone machinery (and its 5-min update loop) alive — contradicts the operator's "delete dead
  code" intent.
- **Option B (clean removal, recommended):** Remove Step 3 + AppRepository + git-clone, AND rework
  `create-test-livinityd.ts` + `apps.integration.test.ts` to install a BUILTIN app (Step 1 path) or
  a mocked-platform app (Step 2 path) instead of `sparkles`. Also delete `app-store.integration.test.ts`,
  `app-repository.test.ts`, `app-repository.integration.test.ts` (they test only the deleted machinery).
  Note: `run-git-server.js` is ALSO used by `widget.integration.test.ts` and `create-test-livinityd.ts`
  — do NOT delete the utility; only stop using it for the default app store repo.

`run-git-server` consumers (verified): `app-repository.integration.test.ts`, `app-store.integration.test.ts`,
`apps.integration.test.ts`, `widget.integration.test.ts`, `create-test-livinityd.ts`.

## Icon fallback (WS1-E) — DECISION

### What CONTEXT said vs. what's actually there
CONTEXT listed 3 "dead gallery fallbacks": `app-repository.ts:195`, `routes.ts:112`, `routes.ts:652`.
Re-verification found **12 gallery references in `builtin-apps.ts`** plus the 2 live route fallbacks:

| Location | Type | Consumer | Live? |
|----------|------|----------|-------|
| `builtin-apps.ts` ×10 hard-coded `icon:` (lines 96,147,185,224,263,304,347,382,424,465 — n8n, portainer, home-assistant, jellyfin, nextcloud, code-server, uptime-kuma, gitea, grafana, postgresql) + suna (1344) + bytebot (1509) = **12** | Direct icon value | `apps.list`/`myApps` → tiles | **LIVE** (these are real installed-app icons) |
| `routes.ts:112` (`apps.list`) `icon ?? builtinApp?.icon ?? <gallery>` | Synthesized fallback | Installed-app tile | **LIVE** |
| `routes.ts:652` (`apps.myApps`) `if (!icon) icon = <gallery>` | Synthesized fallback | Per-user app tile | **LIVE** |
| `app-repository.ts:195` `app.icon ?? <gallery>` | Synthesized fallback inside `readRegistry()` | dead grid (registry) | **DEAD** (dies with WS1-A) |
| `apps.ts:1087` | COMMENT only (the platform path already uses `data.icon_url || data.icon`, `:1089`) | — | benign |

### Why the tile is NOT broken today
`LauncherIcon` (`launcher-icon.tsx:236`) and `components/app-icon.tsx:31` both render
`<img onError={() => setImgSrc(APP_ICON_PLACEHOLDER_SRC)}>` → a 404 gallery URL shows the local
placeholder (`/figma-exports/app-icon-placeholder.svg`), not a broken image. So the gallery breakage
is a **correctness/aesthetics** issue (placeholder instead of the real logo), not a hard 404 render.

### Recommended fix
1. **`routes.ts:112` and `:652` (live fallbacks):** drop the synthesized gallery URL — let it fall
   through to `undefined`/`''` and rely on the existing onError placeholder. The desktop tile already
   handles empty/missing icons. (Simplest, removes the dead URL, no new dependency.)
   - `routes.ts:112` → `const appIcon = icon ?? builtinApp?.icon ?? undefined`
   - `routes.ts:652` → delete the line (leave `icon` as `''`; `LauncherIcon` falls back to placeholder)
2. **`builtin-apps.ts` ×12 (the real breakage):** these are the icons actually shown for n8n, jellyfin,
   etc. Replace each dead `utopusc/livinity-apps-gallery/.../icon.svg` with the matching upstream raw
   URL already used by other builtin entries (the file ALREADY uses upstream URLs for ollama, open-webui,
   vaultwarden, immich, syncthing, filebrowser, paperless, adguard, wg-easy — lines 506-822). For the
   10 + 2 gallery-bound apps, point at the app's own upstream raw icon, OR at the **Supabase `icon_url`**
   (the catalog has icon_url for these — they exist in the 634-row table). The cleanest source-of-truth
   match is the Supabase `icon_url`, but that requires a network lookup at build/edit time; for a
   static file, the upstream-raw-URL pattern (already used in the same file) is the pragmatic choice.
   **Recommend:** replace the 12 with verified upstream raw icon URLs (one per app), matching the
   existing pattern. The planner should confirm each upstream URL resolves before committing.
3. **`app-repository.ts:195`:** deleted with the file (Tier A/WS1-A) — no separate action.

**Supabase context (CONTEXT-verified, not re-queried this session):** `apps` table = 634 rows with
`icon_url`; only 1 row still references the dead gallery; 365 use `getumbrel/umbrel-apps` raw URLs
(an external dep that could also break later — out of scope but worth a follow-up note). `/api/apps`
returns a flat array with `id` aliased to `slug`. The platform install path already carries
`data.icon_url` into the installed manifest (`apps.ts:1089`), so platform-installed apps already get
the right icon — the gap is ONLY the 12 hard-coded builtin icons.

## WS1 file edit list (ordered)

1. `apps.ts:497-526` — remove Step 3 try/catch; direct throw on Step 2 null (keeps 'not found').
   Mirror in `installForUser` (`apps.ts:1943-1962`).
2. `app-store.ts` — replace `registry()` body with `return []`; delete `start()` git-clone init +
   `pRetry` + 5-min `update()` loop (`:22-58`), `update()` (`:75-85`), `getRepositories()`,
   `addRepository`/`removeRepository`, `getAppTemplateFilePath` (`:181-202`). Keep the class shell +
   `registry()` stub + `stop()`. (Or delete the file and inline a `registry: () => []` resolver — but
   `index.ts:440` constructs `new AppStore` and `:551` calls `appStore.start()` / `:2238` `appStore.stop()`,
   so keeping a thin class is less invasive.)
3. `app-repository.ts` — DELETE the file (Tier A). Remove its importers: `app-store.ts` (import line 5).
4. `apps/routes.ts:46` — keep route, now resolves the stubbed `registry()`. Keep `:38` `builtinApps`.
   Fix `:112` + `:652` gallery fallbacks.
5. `builtin-apps.ts` — replace the 12 dead gallery icon URLs (lines 96,147,185,224,263,304,347,382,424,465,1344,1509).
6. `constants.ts:2` — remove `LIVINITY_APP_STORE_REPO` (then fix importers: `index.ts:429/440`,
   `factory-reset.ts:16/525/529`). `index.ts` `defaultAppStoreRepo` param + AppStore construction can
   be simplified or left with a dummy value if the class shell is kept.
7. `index.ts:429,440,551,2238` — remove/adjust `defaultAppStoreRepo` + AppStore wiring per #2 choice.
8. UI Tier A deletions: `routes/app-store/`, `routes/community-app-store/`, `app-store-routes/`,
   `install-button-connected.tsx`, `modules/app-store/discover/`, `community-app-store-dialog.tsx`,
   and (if Option 2) `available-apps.tsx` + 5 mount points + `use-debug-install-random-apps.ts` + cmdk debug block.
9. `modules/app-store/utils.ts:14-26` — `getAppStoreAppFromInstalledApp` calls `appStore.registry`;
   with the stub returning `[]` it returns `undefined` → `app-icon.tsx:340` opens the iframe (correct).
   Leave as-is OR simplify to always open the iframe.
10. `platform/web/src/app/api/admin/sync-catalog/route.ts` — delete (dead importer); remove its admin
    caller (`admin/store/page.tsx` syncCatalog button + `admin-api.ts:494-504`).
11. Tests: rework `create-test-livinityd.ts` + `apps.integration.test.ts` (Option B); delete
    `app-store.integration.test.ts`, `app-repository.test.ts`, `app-repository.integration.test.ts`.

## WS1 acceptance checks

| Check | How |
|-------|-----|
| Desktop still loads | Box: open desktop after deploy; `AvailableAppsProvider` must not throw (registry stub returns `[]`). Highest-risk gate. |
| Install-by-id works | Box: install a builtin (n8n) + a platform-only app via the iframe; both succeed via Step 1/Step 2. |
| Env-override prompt fires | Box: install an app with `installOptions.environmentOverrides` (e.g. n8n) — dialog appears (`builtinApps` route intact). |
| Icons render | Box: installed n8n/jellyfin/portainer tiles show real logos (not placeholder) after `builtin-apps.ts` fix. |
| No dead-ref compile error | `pnpm --filter ui build` (UI is vite-built) + `tsc` typecheck — `RegistryApp` type still resolves (registry route kept). |
| Tests green | `apps.integration.test.ts` (reworked), `redis-platform-keys.test.ts` (unaffected — platform key constants kept), no orphan import errors. |
| Grep dead refs | `rg "livinity-apps-gallery" livos/ platform/` returns only stories/ + the intentionally-kept comment; `rg "getAppTemplateFilePath\|LIVINITY_APP_STORE_REPO\|atomicClone" livos/` clean. |

---

# WS2 — Remove dead Umbrel docker images (auth-server + tor)

## Mechanics

LivOS auth = Caddy `forward_auth` → livinityd (`modules/domain/caddy.ts`; legacy `app_proxy`
stripped at `app.ts:114-121`). Remote access = Cloudflare Tunnel. The `auth` + `tor_proxy` services
are pulled+retagged at install AND `docker compose up`'d at boot/install via legacy-compat, but
nothing routes to them. No shipped app uses tor (CONTEXT Q2: zero refs in builtin-apps/compose-generator/fixtures).

### The actual fix (runtime — unreferences the images)
`livos/packages/livinityd/source/modules/apps/legacy-compat/docker-compose.yml`:
- DELETE `tor_proxy` service (`:4-16`, `image: livos/tor:0.4.7.8`).
- DELETE `auth` service (`:17-41`, `image: livos/auth-server:1.0.5`, env `UMBREL_AUTH_SECRET` at `:24` —
  delete the whole service, do NOT rename the env).
- The file then contains only the `networks:` block (`:43-49`, creates `livinity_main_network`).

**`livinity_main_network` decision:** the network is referenced ONLY by this compose file +
`docker-compose.common.yml:6` (a dead fragment). No app/caddy joins it (grep confirms only these two
files). Options:
- (a) Keep the empty-services compose with just `networks:` so `appEnvironment 'up'` still creates the
  network harmlessly (lowest churn). A compose `up` with no services is a no-op + network create.
- (b) Stop calling `appEnvironment 'up'` entirely (remove calls at `apps.ts:250,256,728`; keep `down`
  at `:412` for cleanup, or remove both) and delete the legacy-compat compose machinery.
- **Recommend (a) for the first ship** (smallest blast radius on the boot path), with (b) as a
  follow-up. CONTEXT lists (b) as "consider" — flag it but don't force it.

### Install-script pull/retag (LOCKSTEP — edit BOTH)
- `scripts/install/deploy-livinityd.sh` `_dld_setup_docker_images()` (`:787`):
  - table `:799-802` (the two `getumbrel/*|livos/*` entries) — remove both → the for-loop is empty.
  - Recommend: delete the whole `_dld_setup_docker_images()` function + its call at `:2922` (pipeline).
- `livos/install.sh` `setup_docker_images()` (`:408-443`):
  - table `:413-414` — remove both entries.
  - Recommend: delete the whole `setup_docker_images()` function + its call at `:1813`.
  - NOTE `install.sh` uses `fail` on pull failure (`:430`) — removing it also removes a hard-abort
    failure mode on fresh installs (a bonus reliability win).

### Tests (WILL FAIL — same change, INVERT or REMOVE)
`scripts/install/__tests__/test-deploy-livinityd.sh`:
- TEST 39 (`:943-954`) asserts `_dld_setup_docker_images() {` is DEFINED → will fail when removed.
- TEST 40 (`:956-964`) asserts the two `getumbrel/*|livos/*` table entries exist → will fail.
- TEST 41 (`:966-975`) asserts the pipeline CALLS `_dld_setup_docker_images` after streaming pkgs → will fail.
- **Action:** delete these 3 tests (the function is gone), OR invert to assert ABSENCE
  (`! grep -qE '^_dld_setup_docker_images'`). Recommend delete — they tested a now-removed step.

### Sibling dead files to DELETE
`livos/packages/livinityd/source/modules/apps/legacy-compat/`:
- `docker-compose.tor.yml` (dperson/torproxy fragment — orphan, no caller found)
- `docker-compose.app_proxy.yml` (busybox echo "deprecated" — orphan)
- `docker-compose.common.yml` (external `livinity_main_network` fragment — orphan if network kept inline)
- `tor-entrypoint.sh`, `tor-proxy-torrc`, `tor-server-torrc` (tor config — dead once tor service gone)
- `docker/build-images.sh` (clones `getumbrel/umbrel.git` — orphan, no caller)
- `docker-images/` packaging: `README.md`, `livos-auth-server-1.0.5.tar.gz`, `livos-tor.tar.gz`,
  `push-to-dockerhub.sh` (`:82-130`) — the offline image tarballs + push script for the deleted images.

### Dead env / torEnabled read paths (optional cleanup — harmless if left)
- `app-environment.ts:23-37` — `AUTH_IP/AUTH_PORT/TOR_*/LIVINITY_AUTH_SECRET='DEADBEEF'` env now unused.
  Safe to delete the auth/tor env keys once services are gone. `LIVINITY_TORRC` (`:36`) points at a
  deleted torrc — remove it.
- `apps.ts:164-167` (`torEnabled` default-false seed), `apps.ts:993-1020` (`setTorEnabled`/`getTorEnabled`),
  `app.ts:88-92` (`readHiddenService`), `routes.ts:74/104/139/168` (`torEnabled`/`hiddenService`/`torOnly`),
  `system/routes.ts:234` — all gated false → return `''`/no-op. **Keep or remove; harmless either way.**
  Recommend leaving the `torEnabled` store/route plumbing for the first ship (lower churn) and dropping
  it in the same follow-up as compose machinery (b).
- `apps.ts:270-273` `chown ${dataDirectory}/tor` (post-up) — references the tor data dir; remove with tor.

## WS2 acceptance checks

| Check | How |
|-------|-----|
| Services unreferenced | `rg "livos/auth-server\|livos/tor\|getumbrel" livos/ scripts/install/ livos/install.sh` → only docs/tarballs (deleted) or clean. |
| Compose valid | `docker compose -f legacy-compat/docker-compose.yml config` parses (only networks, or removed). |
| No images pulled | Box (fresh deploy via update.sh / release): `docker images | grep -E 'livos/(auth-server|tor)'` → absent on a clean box. |
| No containers run | Box: `docker ps -a | grep -E 'auth|tor_proxy'` → none. |
| Install tests pass | `bash scripts/install/__tests__/test-deploy-livinityd.sh` green (TESTs 39/40/41 removed/inverted). |
| Boot clean | Box: `journalctl -u livos` — no "Failed to start app environment" / image-pull errors after deploy. |
| livinityd live without build | tsx runs source directly — compose/env edits live on deploy (no compile). Confirmed `index.ts` runs via tsx. |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Broken icon fallback | A new icon-proxy/synthesized URL | Existing `onError → APP_ICON_PLACEHOLDER_SRC` (already in `LauncherIcon:236`, `app-icon.tsx:31`) | The placeholder fallback already exists box-wide; don't reinvent it |
| App browse on the box | A native Supabase browse grid | The existing iframe of livinity.io/store | Operator decision — browse is the iframe; building a grid is explicitly out of scope |
| Removing a route with a derived type | Deleting `appStore.registry` | Stub it to return `[]` | `RegistryApp` type (`trpc.ts:149`) + desktop-wide provider depend on the route shape |

## Common Pitfalls

### Pitfall 1: Deleting `appStore.registry` crashes the whole desktop
**What goes wrong:** Removing the route makes `available-apps.tsx:23` `useQuery` error →
`:30-31` HARD-THROWS `'Failed to fetch apps.'` → `router.tsx:83` provider throws → ErrorBoundary →
blank desktop.
**Why:** The provider wraps the entire authenticated tree and has no graceful-empty path on ERROR
(only on empty data).
**Avoid:** STUB `registry()` to return `[]` (resolves, doesn't error). Never delete the route.
**Warning sign:** Desktop renders the ErrorBoundary fallback after deploy.

### Pitfall 2: Removing install Step 3 silently breaks the whole integration suite
**What goes wrong:** `apps.integration.test.ts` (install/state/restart/update/uninstall lifecycle)
installs `sparkles-hello-world`, resolvable ONLY via git-clone Step 3.
**Why:** The shared harness `create-test-livinityd.ts:20-27` wires a test git server as the default repo.
**Avoid:** Rework the harness + test to a builtin/mocked-platform app (Option B), or keep a minimal
Step 3 (Option A).
**Warning sign:** `pnpm test` red across the apps integration file after Step 3 removal.

### Pitfall 3: Editing one install script but not the other
**What goes wrong:** `deploy-livinityd.sh` (fresh-install path) and `livos/install.sh` (Mini PC path)
BOTH have the pull/retag table. Editing one leaves the image alive on the other path.
**Avoid:** Lockstep edit + lockstep test (TESTs 39/40/41 only cover deploy-livinityd; manually verify install.sh).
**Warning sign:** Image present on one install type but not the other.

### Pitfall 4: Removing the compose `networks:` block when an app joins it
**What goes wrong:** If any installed legacy Umbrel app's compose references `livinity_main_network`,
removing the network breaks its `up`.
**Avoid:** Box-check `docker network inspect livinity_main_network` for attached containers before
removing the network; prefer keeping the empty-services compose (Option a).
**Warning sign:** App container fails to start with "network livinity_main_network not found".

## Runtime State Inventory (rename/cleanup phase)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `appRepositories` FileStore key (`livinity.yaml`) holds `[LIVINITY_APP_STORE_REPO]`; `torEnabled` key (default false) | Code: factory-reset.ts:529 resets `appRepositories` — change to `[]` if constant removed. `torEnabled` can stay (harmless). No data migration needed (no user data). |
| Live service config | None — browse config lives in the iframe URL (carries token), not on-box | None. Verified: no on-box repo registry state matters once git-clone removed. |
| OS-registered state | Docker images `livos/auth-server:1.0.5`, `livos/tor:0.4.7.8` (+ `:latest` tags) on existing boxes | Existing boxes keep stale images until manually pruned. Optional: add a one-time `docker rmi` cleanup, OR leave (harmless, just disk). Fresh installs won't pull them. |
| Secrets/env vars | `LIVINITY_AUTH_SECRET='DEADBEEF'` (`app-environment.ts:33`, fake/unused); `livos:platform:api_key` (KEEP — load-bearing) | Delete the fake auth env with the auth service. Do NOT touch `livos:platform:api_key`. |
| Build artifacts | livinityd runs via **tsx** (no compiled dist) → source edits live on deploy. No egg-info/dist to clean. `docker-images/*.tar.gz` offline image tarballs | Delete the tarballs (`docker-images/`). No build-artifact rebuild needed (tsx). |

**Cross-check:** After every repo file is updated, what runtime state holds the old thing? → (1) stale
Docker images on EXISTING boxes (cosmetic, disk only; fresh installs clean), (2) `appRepositories`
store key pointing at the dead repo (harmless once registry() stubs to `[]`; factory-reset still
re-seeds it unless updated).

## Sequencing + risk

CONTEXT's order is sound, with one ordering hazard flagged:

1. **WS2 auth-server removal** — safe, independent. Remove `auth` service + both script table entries
   + TESTs. **HAZARD:** remove the compose `auth` service BEFORE/together-with the pull/retag entry,
   not after — but since neither is "referenced by" the other at runtime (the service references the
   image; the image is just pre-pulled), order within WS2-auth doesn't actually break anything. Do
   them in the same commit to keep the tree consistent.
2. **WS1 dead-code removal** — stub `registry`, keep `builtinApps`, remove Step 3 + AppRepository +
   dead UI cluster + fix 12+2 icons. Verify the desktop loads (Pitfall 1) and tests reworked (Pitfall 2).
3. **WS2 tor removal** — after a box `docker ps` / `docker network inspect` confirms nothing attached
   (Pitfall 4). Remove `tor_proxy` service + tor sibling files + torrc env.
4. **WS3** — none (dropped).

**Ordering hazard (the one to watch):** Do NOT remove the compose services LAST after deleting the
sibling fragments/torrc — the compose file references `${LIVINITY_TORRC}` env; remove the service and
its env reference together. Within a single commit per WS the order is safe.

**Overall risk:** WS1 is LOW user-facing but has the desktop-crash trap (Pitfall 1) and the test trap
(Pitfall 2) — both fully mapped here. WS2 touches boot + install scripts — box-verify (`docker ps`,
`journalctl`, fresh release deploy).

## Release / deploy mechanics

- Box deploy is **release-based** (MEMORY.md, Phase 266): push a `vX.Y` tag → `release.yml`
  auto-publishes → `update.sh` deploys the latest RELEASE tag (NOT master). Merging to master does
  NOT deploy. A release is required to land these changes on a box.
- **livinityd runs via tsx** (no compile) — `apps.ts`/`routes.ts`/`app-store.ts`/`builtin-apps.ts`/
  legacy-compat compose edits are live on the next deploy with no build step. (`liv-core` is compiled,
  but nothing in this phase touches liv-core.)
- **UI** (`livos/packages/ui`) is **vite-built** — UI deletions (dead routes, install-button-connected,
  available-apps) require the UI build in update.sh's pipeline. update.sh already builds UI on every
  deploy, so no special handling — but a UI compile/typecheck error (e.g. dangling `RegistryApp`
  import) WILL fail the build. This is why `appStore.registry` must be stubbed (type preserved), not deleted.
- **update.sh implications for these files:** install-script changes (`deploy-livinityd.sh`,
  `livos/install.sh`) affect FRESH installs and the bootstrap path, not the in-place `update.sh` run
  on an existing box. The docker-image removal therefore only takes effect for NEW boxes; existing
  boxes keep the stale images (harmless). `update.sh` itself does NOT pull these images, so no
  update.sh edit is needed for WS2 unless you want an explicit `docker rmi` cleanup step (optional).
- Box SSH for verification: Tailscale `bruce@100.112.68.1` (ZeroTier 10.69.31.68 flaky under load).

## MUST CHECK ON THE BOX (cannot be answered from the repo)

1. `redis-cli GET livos:platform:api_key` — confirm set (operator says yes; required for the iframe + install-by-id).
2. Desktop loads after deploy (registry stub didn't break `AvailableAppsProvider`) — the #1 risk gate.
3. `docker ps -a` + `docker network inspect livinity_main_network` — confirm auth/tor not running and
   nothing attached to the network before removing it (Pitfall 4).
4. Installed-app tiles show real icons (n8n/jellyfin/portainer) after the `builtin-apps.ts` fix.
5. Install a builtin + a platform-only app via the iframe end-to-end (Step 1 + Step 2 cover the catalog).

## Security Domain

`security_enforcement` not explicitly set in `.planning/config.json` (treat as enabled). This phase is
deletion, not new attack surface, but two notes:

| Item | STRIDE | Note |
|------|--------|------|
| Removing AppRepository git-clone | (reduces) Tampering/SSRF | Deletes the SSRF-validated git-clone (Phase 257-02 / LIVOS-024 hardening). Removing the feature removes the attack surface — net security improvement. The `app-repository.test.ts` SSRF gate test is deleted WITH the feature (expected). |
| Removing the `auth` Umbrel service | (none) | Already unused — LivOS auth is Caddy forward_auth → livinityd. No auth path depends on it. |
| `livos:platform:api_key` | Info disclosure | KEEP — load-bearing for install + iframe. Do NOT log/delete. Distinct from the account heartbeat key. |

No new V5 input-validation / V6 crypto surface introduced (pure deletion).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase `icon_url` is populated for the 12 builtin apps (n8n, jellyfin, etc.) | WS1 icon fix | LOW — fallback is the existing onError placeholder; recommend upstream-raw URLs (verified per-app) as the static-file source instead of icon_url to avoid a network lookup |
| A2 | No installed legacy Umbrel app joins `livinity_main_network` on the target box | WS2 network removal | MED — box `docker network inspect` resolves it (MUST CHECK #3); mitigated by keeping the network inline (Option a) |
| A3 | `update.sh` does not pull the Umbrel images (only fresh-install scripts do) | Release mechanics | LOW — verified the pull is only in `deploy-livinityd.sh`/`install.sh`, not `update.sh`; existing boxes keep stale images harmlessly |

## Open Questions (RESOLVED — by plan creation 2026-06-17)

1. **Option A vs B for install Step 3 / test harness** (keep minimal git-clone vs. rework harness to
   builtin). — Recommend B (clean removal); planner to confirm appetite for harness rework.
   **RESOLVED → Option B.** Implemented by plan 276-04: `create-test-livinityd.ts` reworked off the
   git-clone default repo; `apps.integration.test.ts` resolves `sparkles-hello-world` via a `vi.spyOn`
   mock on `fetchPlatformTemplate` (Step 2); all 40 lifecycle assertions retained; `run-git-server.js`
   kept for `widget.integration.test.ts`; the 3 git-clone-machinery test files deleted.
2. **Option a vs b for `appEnvironment 'up'`** (keep empty-services compose vs. stop calling it). —
   Recommend a for first ship, b as follow-up.
   **RESOLVED → Option a (first ship).** Implemented by plan 276-05 Task 1: the legacy-compat compose
   becomes networks-only so `appEnvironment 'up'` still creates `livinity_main_network` harmlessly; the
   `appEnvironment 'up'/'down'` calls in apps.ts are LEFT in place. Option b (stop calling it) is an
   explicit deferred follow-up, NOT this phase.
3. **Stale Docker image cleanup on existing boxes** — add a `docker rmi livos/auth-server livos/tor`
   step to update.sh, or leave (disk-only). — Operator preference; default leave.
   **RESOLVED → leave (default).** No plan adds a `docker rmi` step to update.sh; fresh installs no
   longer pull the images (plan 276-01) and existing boxes keep the stale images harmlessly (disk-only).
   An optional update.sh cleanup remains an operator-preference follow-up.

## Sources

### Primary (HIGH confidence — files opened this session)
- `livos/packages/livinityd/source/modules/apps/{app-store.ts, app-repository.ts, apps.ts, routes.ts, builtin-apps.ts}` — install chain, registry, gallery icons
- `livos/packages/livinityd/source/modules/apps/legacy-compat/{docker-compose.yml, app-environment.ts, docker-compose.tor.yml, docker-compose.app_proxy.yml, docker-compose.common.yml}` — Umbrel services
- `livos/packages/ui/src/{router.tsx, providers/available-apps.tsx, hooks/use-app-store-bridge.ts, components/install-button-connected.tsx, components/launcher-icon.tsx, modules/desktop/app-icon.tsx, modules/app-store/utils.ts, modules/window/window-content.tsx, modules/window/app-contents/app-store-content.tsx}` — UI consumer graph
- `livos/packages/ui/src/trpc/trpc.ts:149` — `RegistryApp` type derivation
- `scripts/install/deploy-livinityd.sh` (`:787-842`, `:2922`), `livos/install.sh` (`:408-443`, `:1813`), `scripts/install/__tests__/test-deploy-livinityd.sh` (`:943-975`)
- `livos/packages/livinityd/source/modules/apps/{apps.integration.test.ts, app-store.integration.test.ts, app-repository.test.ts, app-repository.integration.test.ts, redis-platform-keys.test.ts}` + `test-utilities/create-test-livinityd.ts`
- `livos/packages/livinityd/source/{constants.ts:2, index.ts:429/440/551/2238, modules/system/factory-reset.ts:16/525/529, modules/platform/routes.ts, modules/apps/app.ts:88-121}`
- `platform/web/src/app/api/admin/sync-catalog/route.ts:5`, `platform/web/src/app/admin/lib/admin-api.ts:494`

### Secondary (from CONTEXT.md, verified-by-prior-agent, not re-run this session)
- Supabase `apps` table shape (634 rows, `icon_url`, 365 getumbrel URLs, 1 dead-gallery row)
- GitHub repos deleted (both `utopusc/livinity-apps` + `utopusc/livinity-apps-gallery` → 404)

## Metadata

**Confidence breakdown:**
- WS1 dependency graph: HIGH — every consumer opened and traced; the registry-must-stub + test-harness
  findings are direct contradictions of CONTEXT's "delete if no consumer" framing, proven by file refs.
- WS1 icon fix: HIGH — onError placeholder confirmed in both icon components; 12 gallery refs counted;
  icon_url replacement source noted as A1 assumption (recommend upstream-raw URLs for static file).
- WS2 removal: HIGH — both compose services, both script tables, all 3 tests, sibling files opened.
- Sequencing/risk: HIGH — ordering hazard + 4 pitfalls each tied to a file ref.

**Research date:** 2026-06-17
**Valid until:** ~2026-07-17 (stable internal codebase; re-verify if the marketplace/install path is touched before planning)
