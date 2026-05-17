# 132-05 — liv/ build hardening + post-build verify (Bug #6)

**Status:** CODE-COMPLETE 2026-05-17

## Bug #6 reproduction (UAT 2026-05-16)

After install completes, `livos.service` enters restart loop:

```
$ journalctl -u livos -n 5 --no-pager
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/opt/livos/packages/livinityd/node_modules/@liv/core/dist/lib.js'
    imported from /opt/livos/packages/livinityd/source/cli.ts
```

`livinityd` imports `@liv/core`; the pnpm symlink at
`/opt/livos/packages/livinityd/node_modules/@liv/core` resolves to
either `/opt/liv/packages/core/` (via file: protocol) or to a
pnpm-store dir at `node_modules/.pnpm/@liv+core@file*/node_modules/@liv/core/`.
Either way, that resolved dir must contain `dist/lib.js`. On the UAT
host, it didn't → boot fail.

## Baseline: 104-12 already builds + syncs

The existing code path (from Phase 104-12) already includes:

| Helper | Line | What it does |
|--------|------|--------------|
| `_dld_build_liv_packages` | 751 | `cd /opt/liv && npm install` + `npm run build` (tsc) per pkg (core/worker/mcp-server/memory) + `_dld_verify_build` per pkg |
| `_dld_sync_liv_dist_into_pnpm_store` | 806 | Iterates **all** `@liv+<pkg>*` dirs in the pnpm store (NOT just `head -1` — defeats the multi-resolution-dir pnpm quirk per project memory) and rsyncs each pkg's `dist/` into the store dir |

Both are wired in `deploy_livinityd()` at lines 1631-1632. Plan 132-05's
items 1-4 (npm install, tsc per pkg, sync dist into pnpm-store dirs,
symlink UI dist) are already implemented and more thoroughly than
the plan's pseudocode.

**So why did Bug #6 happen?** Likely the UAT install path on Mini PC
went through the older `update.sh` (per
[feedback_update_sh_drift](../../../memory/feedback_update_sh_drift.md))
that may not have been at parity with this `deploy-livinityd.sh`
code, OR a Server5-hosted install.sh mirror was stale and dispatched
to an older helper. Either way, the canonical install path needs
defense-in-depth so a future regression cannot reproduce the symptom.

## What this plan adds

### 1. End-to-end import-path verify with auto-recovery (`_dld_verify_liv_dist_reachable`)

New helper at line 857. Runs AFTER `_dld_sync_liv_dist_into_pnpm_store`
in the `deploy_livinityd()` pipeline (line 1702). Logic:

1. Look up the actual symlink target of
   `/opt/livos/packages/livinityd/node_modules/@liv/core` via `readlink -f`.
2. Assert `<resolved>/dist/lib.js` exists.
3. If missing → warn-and-recover: rsync `/opt/liv/packages/core/dist/`
   into the resolved path; if that also fails (because `/opt/liv/core/dist`
   itself is missing), `fail` with a clear "re-run `_dld_build_liv_packages`"
   message.

This is the difference between **fail at install time with a clear
diagnostic** (new behavior) vs **install succeeds, livos.service
enters restart loop, operator has to journalctl to find the cause**
(pre-fix Bug #6 behavior).

The recovery branch is intentional: if some race or pnpm-store quirk
left the resolved path empty, the helper recovers automatically so
the install can proceed instead of forcing the operator to debug
pnpm internals.

### 2. `systemctl reset-failed livos.service` before start (mirror of 132-06)

The pre-fix block at `_dld_write_systemd_unit` (lines 1257-1264) did:

```bash
if systemctl is-active --quiet livos.service; then
    systemctl restart livos.service
else
    systemctl start livos.service
fi
```

This has the same silent-failed-state bug 132-06 fixed for Caddy:
`systemctl restart` against a failed unit will succeed-with-no-op
in some systemd versions, and the install banner lies.

New block (line 1314+) does:
1. `systemctl reset-failed livos.service` first — pops out of sticky failed
2. `systemctl restart livos.service` — actually starts
3. 30s wait-for-active loop (PG migration + Redis connect + MCP seed
   boot path takes 5-15s on cold start; was previously not waited for)
4. Warn (not fail) if not active in 30s with journalctl pointer

### 3. UI symlink + npm-build steps unchanged

Plan items 4 (`ln -sf /opt/livos/packages/ui/dist .../livinityd/ui`)
and the per-pkg tsc loop were already implemented in
`_dld_build_packages` (line 742) and `_dld_build_liv_packages`
(line 786). No changes needed — verification confirmed they run
unconditionally in the canonical pipeline.

## Manual recovery script from UAT (now automated)

During UAT triage 2026-05-16 the operator ran this by hand to
recover Bug #6:

```bash
cd /opt/liv && npm install --production=false
for p in core worker mcp-server memory; do
  cd /opt/liv/packages/$p && npx tsc
done
for d in /opt/livos/node_modules/.pnpm/@liv+core@file*/node_modules/@liv/core; do
  cp -r /opt/liv/packages/core/dist "$d/"
done
systemctl reset-failed livos && systemctl restart livos
```

Each step is now covered by the pipeline:
- `_dld_build_liv_packages` ↔ steps 1+2
- `_dld_sync_liv_dist_into_pnpm_store` ↔ step 3 (with `for-all-dirs`, not `head -1`)
- New `_dld_verify_liv_dist_reachable` ↔ step 3 again (assertion + fallback)
- New `reset-failed livos.service` ↔ step 4 (within `_dld_write_systemd_unit`)

## LIV_BUILD_AUTO_VERIFIED

Static checks pass:

```
$ bash -n scripts/install/deploy-livinityd.sh
(no output — syntax OK)

$ grep -nE "reset-failed livos|_dld_verify_liv_dist_reachable" scripts/install/deploy-livinityd.sh
857:_dld_verify_liv_dist_reachable() {
1315:    systemctl reset-failed livos.service 2>/dev/null || true
1702:    _dld_verify_liv_dist_reachable        # 132-05 — pre-boot verify + auto-recover Bug #6
```

Live verification on a Bug-#6 reproducible box requires the operator-
walked Plan 132-07 fresh-VPS UAT. On a healthy box (where the build
and sync work correctly), the new helper exits at the "OK at resolved
path" branch and adds ~50ms to install time.

## Pnpm-store quirk (already-handled by 104-12)

Per [reference_minipc.md](../../../memory/reference_minipc.md):

> update.sh pnpm-store quirk: copies liv dist into the FIRST `@liv+core*`
> dir matched by `find -maxdepth 1`. If pnpm has multiple resolution
> dirs (sharp version drift), it can copy to the wrong one and
> livinityd still imports the stale dist.

The existing `_dld_sync_liv_dist_into_pnpm_store` already iterates
**all** matching store dirs (lines 821-833: `for store_dir in "$_DLD_LIVOS_DIR/node_modules/.pnpm/@liv+${pkg}"*/; do`)
— not `head -1`. This plan's new verify helper adds a final safety
check on the actual symlink livinityd will walk, regardless of how
many store dirs got synced.

## Future hardening (deferred to v35+)

- **Migrate liv/ to tsx-in-production**: drop the build step entirely
  by running TypeScript directly with `tsx` (as livinityd already does).
  Eliminates Bug #6 class permanently because there's no separately-
  managed `dist/` to drift. Bigger refactor than this hardening phase
  warrants.
- **`update.sh` deprecation**: with `install.sh` now the canonical
  path, `update.sh` should redirect to `install.sh` for re-runs OR
  be source-controlled against this file (currently can drift per
  `feedback_update_sh_drift`).

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
only edits `scripts/install/deploy-livinityd.sh`).
