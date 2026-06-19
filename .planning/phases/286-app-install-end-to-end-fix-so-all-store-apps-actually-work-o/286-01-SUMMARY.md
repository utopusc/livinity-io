# Phase 286 — Plan 01 SUMMARY (Wave 1, CORE)

**Status:** ✅ DONE + verified (tsc 305 = baseline, 18/18 unit tests pass)
**Date:** 2026-06-18

## What was built
The central volume-ownership reconciler — the core fix that makes the 4 crash-looping apps (and all uid-mismatch classes) start correctly on any box regardless of the desktop uid (1000/1001) or whether livinityd runs as root.

### New file
- `livos/packages/livinityd/source/modules/apps/reconcile-volume-ownership.ts`
  - `reconcileAppVolumeOwnership(app, {projectName, appDataDir?, rootDir?})` — before a `docker compose up`, for each service resolve its real uid:gid and chown each volume (named + bind) via a root `alpine` helper container (`docker run --rm -v <target>:/d alpine chown -R <uid>:<gid> /d`) — works through the `docker` group even though livinityd is non-root. **Runs the chown for n8n only after pull** (image inspect needs the image).
  - `resolveServiceUidGid(service, inspectUser)` — compose `user:` (numeric) → image `Config.User` (numeric) → default 1000; returns null (skip) for root services.
  - `classifyVolumeEntry()` — named vs bind-under-appDataDir vs skip (system paths / out-of-scope).
  - `expandVolumeTokens()` — expands `${APP_DATA_DIR}`/`${UMBREL_ROOT}`/`${LIVINITY_ROOT}` so builtin bind tokens classify as binds, not skip.
  - Security: execa `$` arg-arrays only (no `shell:true`); uid/gid are regex-validated integers; bind targets path-scoped under the app data dir; system paths hard-skipped; chown (not chmod) → PGDATA mode 700 preserved.
- `reconcile-volume-ownership.test.ts` — 18 vitest assertions (resolver 9, classify 5, token-expansion 4). All pass.

### Wiring (all 5 `docker compose up` chokepoints)
- `app.ts` `install()` — reconcile AFTER `pull()`, BEFORE app-script up (deviation from plan's before-pull placement, fixes first-install of no-`user:` images like n8n=node where image inspect needs the pulled image).
- `app.ts` `start()` — reconcile after `patchComposeFile()`, before the start chokepoint.
- `apps.ts` boot — **backfill loop** (concurrency-capped 5) over all installed apps → existing broken boxes self-heal on restart/Update.
- `apps.ts` per-user boot restart + per-user install — reconcile before each up (minimal app-shaped object reading the on-disk compose; `appDataDir`/`rootDir` set to the per-user subtree).
- `apps.ts` reapply (broker + local-ai force-recreate) — reconcile before each recreate (try/catch — `getApp` throws for unregistered).

### Removed (all silently-failing as non-root)
- `apps.ts`: tor `sudo chown`, blanket boot `chown /app-data`, native-install chown, post-rsync whole-dir chown.
- `app.ts`: the `chmod -R 777` volume block.
- `app-script`: the bash `chown -R 1000:1000 "${app_data}"`.
- Management files (compose/.env/yml) now stay owned by livinityd's user → reinstall/update never breaks (SC2).

## Verification
- `npx vitest run reconcile-volume-ownership.test.ts` → 18/18 pass.
- `npx tsc --noEmit` → 305 errors = baseline (no net new type errors; the new file + edits are type-clean).
- Greps: no executable `chown -R 1000:1000` / `chmod -R 777` / `sudo chown` remain (only explanatory comments); `reconcileAppVolumeOwnership` wired at 6 sites in apps.ts (import + 5 calls) + 3 in app.ts (import + 2 calls).

## SC coverage
SC1 (reconcile to real uid), SC2 (broken chowns removed, mgmt files preserved), SC3 (boot backfill self-heal), SC7 (uid-agnostic, idempotent, PGDATA chown-not-chmod).

## Deviation
- Reconcile placed AFTER `pull()` in `install()` (plan said before) — required so `docker image inspect` resolves `Config.User` for no-`user:` images on first install. More correct; acceptance criteria otherwise met.

## Not yet done (later waves / runtime-only verification)
- The chown logic's live effect (named-volume + bind on a real box) is runtime — covered by Plan 286-05's representative install matrix. Unit tests cover the pure logic; the Docker calls are integration-verified in 05.
