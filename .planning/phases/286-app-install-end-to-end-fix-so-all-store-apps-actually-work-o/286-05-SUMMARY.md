# Phase 286 — Plan 05 SUMMARY (Wave 4, verification + ship readiness)

**Status:** ✅ Unit gate PASSED + ship docs produced. Live install-matrix walk = operator-action checkpoint (deferred until opt-in on a clean/test box; the operator's live box self-heals on its own next Update).
**Date:** 2026-06-18

## Gate results (final, ALL 4 waves applied together)
- **tsc:** `npx tsc --noEmit | grep -c "error TS"` → **305 = baseline** (zero net new type errors across 286-01..04). The 3 errors tsc attributes to apps.ts (lines ~193/194/256) are pre-existing baseline errors in binary-copy/cleanDockerState code, unrelated to this phase.
- **Unit tests:** `npx vitest run` on the 3 new files → **34/34 pass** (reconcile-volume-ownership 19, health-poll 9, builtin-precedence 6). 0 failures.
- **Integration suite** (`apps.integration.test.ts`): requires Docker + dbus, unavailable in the dev sandbox (env error `ENOENT /var/run/dbus/system_bus_socket`) — NOT a logic regression; covered by the operator/test-box install-matrix walk.

## Coverage added this plan
- Extracted `namedVolumeRuntimeName(projectName, key)` into reconcile-volume-ownership.ts + explicit test (`n8n`+`n8n_data` → `n8n_n8n_data`; `n8n-user-bruce`+`data` → `n8n-user-bruce_data`) — closes the CONTEXT phase-E required "named-volume runtime name" assertion.
- Non-1000 uid resolution already covered (927, 5001, 1001); root-skip (user:0, empty Config.User) covered; image-inspect name→1000 covered.

## Artifacts
- `286-INSTALL-MATRIX.md` — 5 representative apps (n8n / activepieces-postgres / campfire-redis / a PUID app / a non-1000 `user:927/5001` app), each with exact `docker inspect` / `curl` / `grep reverse_proxy` checks; backfill self-heal check (`docker ps -a --filter status=restarting` empty + journalctl backfill line); uid-agnostic proof; ship notes; operator checkpoint.

## SC coverage (whole phase)
- SC1 reconcile to real uid (286-01) · SC2 broken chowns removed + mgmt files preserved (286-01) · SC3 boot backfill self-heal (286-01) · SC4 health/readiness gate (286-02) · SC5 catalog>builtin precedence (286-03) · SC6 Caddy register retry + port-match + network-create surfacing (286-04) · SC7 uid-agnostic/idempotent/PGDATA-700 (286-01).

## Checkpoint (Task 3 — operator action)
The live end-to-end walk (real container start + HTTP reachability + persistence) cannot run in dev and must not run on the operator's live box. Operator ships the tag → `update.sh` on a clean/test box (or opts in), installs the 5 apps, runs the 4 checks each, reports pass/fail — OR replies "defer live-walk" to mark the phase code-complete pending that walk.

## Whole-phase file inventory (uncommitted)
- NEW: `reconcile-volume-ownership.ts` (+test), `health-poll.ts` (+test), `builtin-precedence.ts` (+test)
- MODIFIED: `app.ts` (reconcile after pull + health gate, chmod-777 removed), `apps.ts` (import + boot backfill + per-user/reapply reconcile + catalog precedence + Caddy retry/port-match + 4 chown removals), `legacy-compat/app-environment.ts` (network-create catch narrowed), `legacy-compat/app-script` (bash chown removed)
- PLANNING: 286-CONTEXT/RESEARCH/01..05-PLAN/01..05-SUMMARY/INSTALL-MATRIX
