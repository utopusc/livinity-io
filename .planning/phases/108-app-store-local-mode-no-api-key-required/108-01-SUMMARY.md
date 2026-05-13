# Phase 108-01 — App Store Local Mode (No API Key Required) — SUMMARY

**Phase:** 108 (v34.0 milestone)
**Plan:** 01 / 01
**Status:** CODE-COMPLETE — pending mainserver UAT
**Atomic commits:** 2 (feat + test) + this docs commit
**Commit range:** `f4ca52e9..HEAD`
**Sacred SHA preserved:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — verified post each commit

## What shipped

- **UI rewire** (`f4ca52e9`): `livos/packages/ui/src/modules/window/app-contents/app-store-content.tsx` now defaults to `<Navigate to='/app-store' replace />` when no API key is configured (local-mode default). The legacy `NoApiKeyMessage` "Connect to Livinity Platform" gate is fully removed. Platform-mode iframe path is preserved as an opt-in branch when an API key is present (refactored into a small `PlatformModeIframe` sub-component so the parent component stays linear).
- **Tests** (`edb568c9`): +6 UI source-text invariant assertions (Vitest, NEW file `app-store-content.test.tsx`) and +2 deploy-script regression assertions (TEST 21B block in `test-deploy-livinityd.sh`) cementing the Phase 108 contract. Combined static-test PASS count: 196 → 204 (UI 6 + deploy-livinityd 156 + mode-hybrid 18 + mode-tunnel 24), 0 FAIL.
- **Comment-only** edits in `scripts/install/deploy-livinityd.sh`: `_dld_update_gallery_cache()` now explicitly references Phase 108 so future engineers know this helper is the App Store window's local-mode data source. Step banner updated to `"105-02 (G5) / 108 — update gallery cache (update.sh:596-610)"`.

## Why no backend work

The local-mode catalog backend ALREADY existed before Phase 108:

- `appStore.registry` tRPC route at `livos/packages/livinityd/source/modules/apps/routes.ts:25` calls `ctx.appStore.registry()`.
- `ctx.appStore.registry()` at `livos/packages/livinityd/source/modules/apps/app-store.ts:83-119` iterates `/opt/livos/data/app-stores/*/livinity-app.yml` (the gallery cache populated by `_dld_update_gallery_cache` since Phase 105-02 G5) and augments with `BUILTIN_APPS` metadata. Returns hydrated manifests with `id, name, icon, category, tagline, installOptions, requiresAiProvider, port`.
- The `/app-store/*` React-Router subtree (`routes/app-store/discover.tsx`, `category-page.tsx`, `app-page/`) is wrapped in `AvailableAppsProvider` (`router.tsx:74`) which already calls `trpcReact.appStore.registry.useQuery()`. Discover, Category, AppPage — all driven from the local catalog with **no API key**.

The blocker was purely the iframe-mode gate inside `AppStoreWindowContent`. Removing it (feat commit) re-exposes the existing native UI.

## Decisions honoured

- **D-108-NO-API-KEY-FOR-LOCAL**: Local-mode flow makes zero outbound HTTP calls to livinity.io or any Server5 endpoint. All data flows through tRPC → `appStore.registry()` → local YAML files on disk.
- **D-108-PLATFORM-OPT-IN-PRESERVED**: Users with an API key still see the `https://livinity.io/store` iframe + postMessage bridge — verified by Vitest assertions 5 (`https:\/\/livinity\.io\/store`) and 6 (`useAppStoreBridge`).
- **D-108-NO-NEW-DEPS**: Only one new import added (`Navigate` from `react-router-dom`, already a top-level dependency of the `ui` package — many sibling files use it).
- **D-NO-PROD-IMPACT** (Mini PC `livos/install.sh` / `livos/update.sh`): No changes — `git diff f4ca52e9~1..HEAD -- livos/install.sh livos/update.sh | wc -l` → 0. Only `scripts/install/deploy-livinityd.sh` (VPS installer) plus UI source/test files touched.
- **Sacred SHA**: `liv/packages/core/src/sdk-agent-runner.ts` unmodified; SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all three Phase 108 commits (re-verified via `git hash-object` after each commit; pre-commit hook gated every commit; no `--no-verify` bypasses).

## Test deltas

| Suite | Pre-Phase-108 | Post-Phase-108 | Delta |
|-------|--------------:|---------------:|------:|
| `test-deploy-livinityd.sh` | 154 PASS | 156 PASS | +2 |
| `test-mode-hybrid-args.sh` | 18 PASS  | 18 PASS  | 0  |
| `test-mode-tunnel-args.sh` | 24 PASS  | 24 PASS  | 0  |
| `app-store-content.test.tsx` (vitest) | n/a | 6 PASS | +6 (new file) |
| **Combined static invariants** | **196** | **204** | **+8** |

0 FAIL across all suites.

## Deviations

NONE. Plan was specific about file contents (verbatim component skeleton), test bodies, deploy-script comment shape, and TEST 21B assertion pairs. One trivial cosmetic adjustment: the source-comment block was rephrased ("platform-connection dead-end prompt" / "legacy platform-connection prompt") to avoid containing the literal substrings `NoApiKeyMessage` and `Connect to Livinity Platform`, which would otherwise have tripped Vitest assertions 3 and 4 against the source-text. Functional behaviour unchanged.

## Mainserver UAT Carry-Forward (operator-only)

Mainserver UAT is the binding gate for closing Phase 108 — until it passes, status is `code-complete-pending-mainserver-uat`, not `shipped`.

**Steps A–F:**

A. **Push & pull:** `git push origin master`; SSH to mainserver `154.53.56.75` as root; `cd /opt/livos/livos && git pull` (or run `bash /opt/livos/update.sh` if the deployed bundle ships its own update path).

B. **Rebuild UI:** `cd /opt/livos/livos && pnpm --filter @livos/config build && pnpm --filter ui build && systemctl restart livos`. Wait `journalctl -u livos.service -n 50 --no-pager` shows steady state (no flap).

C. **Confirm gallery cache populated:** `ls /opt/livos/data/app-stores/utopusc-livinity-apps-github-*/` shows ≥50 subdirectories each with a `livinity-app.yml`. If absent, run `bash /opt/livos/update.sh` once to trigger `_dld_update_gallery_cache`.

D. **Local-mode smoke (no API key):** Open the LivOS UI in a browser, click the App Store dock icon. **Expect:** the native Discover page (banners + featured rows + grid sections) loads — NO "Connect to Livinity Platform" prompt. Browser DevTools → Network: zero requests to `livinity.io` or `apps.livinity.io` while clicking Discover → Category → App Page.

E. **Install smoke:** Click an app (e.g. AdGuard) → Install. Confirm install completes and the app appears in the dock. tRPC mutation `apps.install` must succeed without any API-key error.

F. **Platform-mode opt-in smoke:** Open Settings → Platform → enter a livinity.io API key → save. Re-open App Store window. **Expect:** the iframe of `https://livinity.io/store` loads (regression-free). Clear the key when done to return to local-mode default.

Until all six steps pass, Phase 108 status remains `code-complete-pending-mainserver-uat`.

## Carry-overs

- **Optional Phase 108.1**: Add an explicit `livos:appstore:mode=local|platform` Redis flag + Settings UI toggle so users can force-pin to one mode independently of API-key presence. Deferred — current auto-detect (apiKey absence → local) covers the fresh-VPS UAT acceptance gate and ships smaller.
- **Phase 109** (MCP servers auto-seed) is already SHIPPED (`50438411`). **Phase 110** (WebApp Launcher VNC swap carry-over from Phase 99) is the next scheduled plan in the v34.0 milestone.

## Self-Check: PASSED

- Files: `app-store-content.tsx`, `app-store-content.test.tsx`, `108-01-SUMMARY.md` all on disk.
- Commits: `f4ca52e9` (feat), `edb568c9` (test), `bfbd603d` (docs) all on `master`.
- Sacred SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` post-final-commit (verified via `git hash-object liv/packages/core/src/sdk-agent-runner.ts`).
- D-NO-PROD-IMPACT: `git diff f4ca52e9~1..HEAD -- livos/install.sh livos/update.sh | wc -l` → `0`.
- Combined static tests: 204 PASS, 0 FAIL (vitest 6 + deploy-livinityd 156 + mode-hybrid 18 + mode-tunnel 24).
