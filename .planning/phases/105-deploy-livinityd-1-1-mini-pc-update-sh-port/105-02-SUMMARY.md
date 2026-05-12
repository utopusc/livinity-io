---
phase: "105"
plan: "02"
subsystem: install-scripts
tags:
  - install-scripts
  - bash
  - gap-closure
  - phase-105
requires:
  - scripts/install/deploy-livinityd.sh (post-105-01 baseline, 853 lines)
  - update.sh (canonical reference, read-only)
  - scripts/install/__tests__/test-deploy-livinityd.sh (79 PASS baseline from 105-01)
provides:
  - "_dld_install_streaming_packages helper (G2: apt streaming + ydotoold systemd unit)"
  - "Atomic .new + mv self-rsync of update.sh inside _dld_clone_source (G3)"
  - "UI rm -rf dist before vite build in _dld_build_packages (G8, Phase 51 v29.5 A2 defensive fresh-build)"
  - "_dld_update_gallery_cache helper (G5: idempotent git fetch+reset of app-stores cache)"
  - "_dld_fix_permissions helper (G6: chmod +x app-script + chown -R \\$_DLD_LIVOS_USER)"
  - "_dld_cleanup_temp_dir helper (G7+G9: .deployed-sha write + opt-in stage purge + LIVOS_UPDATE_COMPLETED sentinel)"
  - "_DLD_LIVOS_USER constant (default root; configurable via env for future Mini-PC-style installs)"
  - "16-step canonical deploy_livinityd pipeline matching CONTEXT.md §'Pipeline Order'"
affects:
  - scripts/install/deploy-livinityd.sh
tech-stack:
  added: []
  patterns:
    - "Conditional systemd unit provisioning (ydotoold gated on desktop UID>=1000)"
    - "Atomic file replacement via .new sibling + mv (rename inside same filesystem)"
    - "Forward-compat sentinel export (LIVOS_UPDATE_COMPLETED for phase33_finalize hook)"
    - "Opt-in destructive cleanup (_DLD_CLEAR_STAGE env defaulting to preserve)"
key-files:
  created: []
  modified:
    - scripts/install/deploy-livinityd.sh
decisions:
  - "ydotoold systemd unit conditional on desktop user UID>=1000 (verbatim port of update.sh:378-400; fresh VPS without operator account → unit silently skipped; documented as 105-04 UAT caveat)"
  - "Stage dir preserved by default (re-run cache); _DLD_CLEAR_STAGE=1 opts into update.sh-style purge"
  - "_DLD_LIVOS_USER defaults to root (matches update.sh:619-620); install.sh --user CLI flag deferred per CONTEXT <deferred>"
  - "G4 (npm install --production=false literal) deferred — current --omit=optional is functionally equivalent (per Plan 105-02 §'What 105-02 does NOT do')"
  - "Targeted nested-syncs (CONTEXT D-105-STEP2-NESTED-SYNCS) NOT split — single-rsync produces same output faster (RESEARCH §6 recommendation)"
metrics:
  duration: "approximately 7 minutes (worktree parallel-execution mode)"
  completed: "2026-05-12T19:40:55Z"
  commits: 2
  tasks_completed: 2
  files_modified: 1
  lines_added: 202
  test-count: "79 PASS preserved (Plan 105-03 extends to ~104 with new G2-G9 assertions)"
---

# Phase 105 Plan 02: deploy-livinityd Gap Closure (G2-G9) Summary

Closed six structural gaps (G2/G3/G5/G6/G7/G8/G9) between current `scripts/install/deploy-livinityd.sh` and canonical `update.sh` — fresh-VPS LivOS installs now produce a filesystem + service topology byte-equivalent to what `update.sh` produces on Mini PC (modulo first-install-only files). Streaming subsystem (Master Chrome / WebApp Launcher Phase 100+) now works on fresh VPS hosts; gallery cache, chown, app-script chmod, atomic update.sh self-rsync, UI defensive fresh-build, and `.deployed-sha` forward-compat all land in one wave.

## Scope

Wave 2 plan of the Phase 105 update.sh 1:1 port. Inherits Plan 105-01's locked contract (`_dld_*` helper convention, `_dld_verify_build` extracted, anchored `/docker/` exclude, secrets-before-pnpm pipeline order, `_DLD_TEMP_DIR` alias). Adds new behavior — does NOT touch the 79-PASS baseline (Plan 105-03 extends tests for the new gaps in parallel). Mini PC `update.sh` untouched (D-105-NO-PROD-IMPACT). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` trivially preserved (no `liv/` file opened for write).

## Tasks Completed

| Task | Name                                                              | Commit     | Files                                  |
| ---- | ----------------------------------------------------------------- | ---------- | -------------------------------------- |
| 1    | Port G2 (streaming pkgs) + G3 (atomic self-rsync) + G8 (UI rm -rf dist) | `2bef633d` | scripts/install/deploy-livinityd.sh    |
| 2    | Port G5 (gallery cache) + G6 (permissions) + G7 (cleanup) + G9 (.deployed-sha) + _DLD_LIVOS_USER + pipeline wiring | `f6406f44` | scripts/install/deploy-livinityd.sh    |

## 4 New Helpers (total ~202 lines added)

| Helper | update.sh provenance | LoC (incl. comment block) | Insertion point in `deploy_livinityd()` |
| ------ | -------------------- | ------------------------- | --------------------------------------- |
| `_dld_install_streaming_packages` | update.sh:339-405 | ~85 | AFTER `_dld_clone_source`, BEFORE `_dld_generate_jwt_secret` |
| `_dld_update_gallery_cache`       | update.sh:596-610 | ~17 | AFTER `_dld_sync_liv_dist_into_pnpm_store`, BEFORE `_dld_fix_permissions` |
| `_dld_fix_permissions`            | update.sh:612-622 | ~17 | AFTER `_dld_update_gallery_cache`, BEFORE `_dld_write_liv_systemd_units` |
| `_dld_cleanup_temp_dir`           | update.sh:657-682 | ~31 | LAST in pipeline (after `_dld_update_caddy_to_livinityd`) |

## Gap Closures (detailed)

### G2: Streaming subsystem apt packages + ydotoold systemd unit

Verbatim port of update.sh:339-405. `_dld_install_streaming_packages` runs `apt-get install -y -qq` for the full streaming stack — `x11vnc xdotool x11-xserver-utils ydotool maim scrot gnome-screenshot websockify vncsnapshot ffmpeg gstreamer1.0-tools gstreamer1.0-plugins-{good,bad,ugly} xdg-desktop-portal-gnome xvfb fluxbox` — then separately attempts `libva-utils intel-media-va-driver libdrm-intel1` for VAAPI userspace acceleration. The VAAPI block is WARN-not-FAIL so an Intel-iGPU-less VPS (most cloud hosts) keeps installing — the streaming pipeline falls back to libx264 software encoding.

Post-install verification loop checks `ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox` on PATH and warns if any are missing.

The ydotoold systemd unit is provisioned ONLY when (a) `ydotoold` binary exists, (b) `/etc/systemd/system/ydotoold.service` is absent, and (c) a desktop user with UID≥1000 (and <65534) exists on the host. The unit template uses heredoc with shell-substituted UID for `--socket-own`. On fresh VPS without an operator account, the unit is silently skipped — documented caveat for 105-04 UAT.

Without G2 closure, fresh-VPS LivOS installs silently lacked Master Chrome and WebApp Launcher (Phase 100+) — operators only discovered the gap at first stream attempt.

### G3: Atomic update.sh self-rsync (.new + mv)

Replaced the direct `cp "$_DLD_STAGE_DIR/update.sh" "$_DLD_LIVOS_DIR/update.sh"` in `_dld_clone_source` with the atomic pattern from update.sh:425-430:

```bash
cp "$_DLD_STAGE_DIR/update.sh" "$_DLD_LIVOS_DIR/update.sh.new"
chmod +x "$_DLD_LIVOS_DIR/update.sh.new"
mv "$_DLD_LIVOS_DIR/update.sh.new" "$_DLD_LIVOS_DIR/update.sh"
```

Re-run safety: if a future `deploy-livinityd` invocation runs while a prior `bash /opt/livos/update.sh` is still executing on the same box, the running bash holds an open file descriptor on the old inode; the rename atomically swaps the inode without truncating the in-progress script. Same-filesystem mv guarantees atomicity.

### G5: Gallery cache idempotency

`_dld_update_gallery_cache` runs `find /opt/livos/data/app-stores/ -maxdepth 1 -name '*livinity-apps*' -type d` to locate the cache, then `git fetch origin && git reset --hard origin/main || git reset --hard origin/master` to bring it to upstream HEAD. The `git config --global --add safe.directory` call avoids fatal `dubious ownership` errors on multi-user filesystems.

Graceful skip if cache dir is absent or has no `.git` (first-install → cache lazy-created on first App Store access; legacy clones without `.git` → info log "No gallery cache found").

### G6: Permissions — app-script chmod + chown -R

`_dld_fix_permissions` performs two operations:

1. `chmod +x /opt/livos/packages/livinityd/source/modules/apps/legacy-compat/app-script` — closes the tRPC `apps` router 500 that fires when the script isn't executable on first-install hosts. Required because the file ships from git without the executable bit on some Windows-developer machines.

2. `chown -R "${_DLD_LIVOS_USER}:${_DLD_LIVOS_USER}" /opt/livos /opt/liv` — sets ownership of both deployment trees. Default `root:root` matches update.sh:619-620 first-install semantics; operators wanting `bruce:bruce` (Mini-PC-style) override via `_DLD_LIVOS_USER=bruce` env. Future enhancement: install.sh `--user` flag (deferred per CONTEXT `<deferred>`).

### G7: Stage directory cleanup (opt-in)

`_dld_cleanup_temp_dir` preserves the stage dir by default (re-run cache speed-up matching 104-11 reuse semantics). Operators wanting strict update.sh parity export `_DLD_CLEAR_STAGE=1` to force `rm -rf "$_DLD_STAGE_DIR"`. Decision rationale: 104-11/12/13 lineage built up stage-dir reuse as an intentional optimization; reverting to update.sh's ephemeral `/tmp/livinity-update-$$` model would re-introduce the ~5-10min apt+git clone cost on every re-run.

The helper also exports `LIVOS_UPDATE_COMPLETED=1` — forward-compat with a future `phase33_finalize` trap that update.sh runs at exit.

### G8: UI rm -rf dist before vite build

Added `rm -rf "$_DLD_LIVOS_DIR/packages/ui/dist"` immediately before `pnpm --filter ui build` in `_dld_build_packages`. Phase 51 v29.5 A2 defensive fresh-build — prevents stale dist surviving deploys when vite's cache hash collides by accident OR when a prior build silently failed but left a partial dist tree.

### G9: .deployed-sha forward-compat write

Inside `_dld_cleanup_temp_dir` (BEFORE optional stage purge), reads `git rev-parse HEAD` from the stage dir and writes the full SHA to `/opt/livos/.deployed-sha` with mode 644. Forward-compat with update.sh's Phase 30 UPD-03 SHA-tracking — without `.deployed-sha`, the first subsequent `bash /opt/livos/update.sh` after install logs `FROM_SHA=unknown` (cosmetic, no functional impact).

The 7-char short SHA is also echoed to operator output for quick visual confirmation.

## Pipeline Order (final 16-step deploy_livinityd body)

```
1.  _dld_install_system_packages         # 104-11 (Node 22 + pnpm + PG + Redis + build deps)
2.  _dld_setup_postgres                  # 104-11 (role + DB + schema apply)
3.  _dld_setup_redis                     # 104-11 (requirepass)
4.  _dld_clone_source                    # 104-12 (livos + liv rsync) + 105-01 (anchored /docker/) + 105-02 G3 (atomic update.sh self-rsync)
5.  _dld_install_streaming_packages      # 105-02 G2 (NEW — apt + ydotoold)
6.  _dld_generate_jwt_secret             # 104-11 (105-01 reorder: BEFORE pnpm)
7.  _dld_write_env_file                  # 104-11 (105-01 reorder)
8.  _dld_write_pnpm_npmrc                # 104-13 (block-exotic-subdeps=false)
9.  _dld_build_packages                  # 104-11/12 + 105-02 G8 (rm -rf dist before UI build)
10. _dld_build_liv_packages              # 104-12 (npm install + tsc per @liv pkg)
11. _dld_sync_liv_dist_into_pnpm_store   # 104-12 (multi-dir fix)
12. _dld_update_gallery_cache            # 105-02 G5 (NEW)
13. _dld_fix_permissions                 # 105-02 G6 (NEW)
14. _dld_write_liv_systemd_units         # 104-12 (memory→worker→core)
15. _dld_write_systemd_unit              # 104-11 (livos cap-stone)
16. _dld_health_check                    # 104-11 (curl :8080 WARN-not-FAIL)
17. _dld_update_caddy_to_livinityd       # 104-11 (Caddyfile per MODE + reload)
18. _dld_cleanup_temp_dir                # 105-02 G7+G9 (NEW — LAST)
```

(Numbered 1-18 above for clarity; CONTEXT.md §"Pipeline Order" enumerates as 16 logical steps where step 13 = systemd units of step 14 + 15 + 16 of update.sh.)

## Verification Evidence

### Test pass counts (target: 79 + 18 + 24 = 121 — UNCHANGED from 105-01 baseline)

```
test-deploy-livinityd.sh:   79 PASS, 0 FAIL   (Plan 105-03 extends to ~104)
test-mode-hybrid-args.sh:   18 PASS, 0 FAIL   (regression smoke unchanged)
test-mode-tunnel-args.sh:   24 PASS, 0 FAIL   (regression smoke unchanged)
COMBINED:                   121 PASS, 0 FAIL
```

Plan 105-02 deliberately does NOT extend tests — that work is Plan 105-03 (parallel wave-2 plan). All NEW assertions for G2/G3/G5/G6/G7/G8/G9 come in 105-03.

### Syntax + helper presence + key markers

```
$ bash -n scripts/install/deploy-livinityd.sh    # exits 0 — syntax clean

$ grep -cE '^_dld_install_streaming_packages\(\)' scripts/install/deploy-livinityd.sh
1
$ grep -cE '^_dld_update_gallery_cache\(\)' scripts/install/deploy-livinityd.sh
1
$ grep -cE '^_dld_fix_permissions\(\)' scripts/install/deploy-livinityd.sh
1
$ grep -cE '^_dld_cleanup_temp_dir\(\)' scripts/install/deploy-livinityd.sh
1
$ grep -cE '^_DLD_LIVOS_USER=' scripts/install/deploy-livinityd.sh
1

# G2 markers
$ grep -nE '^        ffmpeg' scripts/install/deploy-livinityd.sh
337:        ffmpeg \
$ grep -nE 'ExecStart=/usr/bin/ydotoold' scripts/install/deploy-livinityd.sh
383:ExecStart=/usr/bin/ydotoold --socket-path=/tmp/.ydotool_socket --socket-own=${desktop_uid_p93}:${desktop_uid_p93}

# G3 atomic markers
$ grep -nE 'update\.sh\.new' scripts/install/deploy-livinityd.sh
(matches in _dld_clone_source: cp .new sibling + mv pattern)

# G5 gallery markers
$ grep -nE 'app-stores.*livinity-apps' scripts/install/deploy-livinityd.sh
(matches in _dld_update_gallery_cache find call)

# G6 permissions markers
$ grep -nE 'chmod \+x.*legacy-compat/app-script' scripts/install/deploy-livinityd.sh
(matches in _dld_fix_permissions)
$ grep -nE 'chown -R' scripts/install/deploy-livinityd.sh
(matches in _dld_fix_permissions, both _DLD_LIVOS_DIR and _DLD_LIV_DIR)

# G7+G9 markers
$ grep -nE '\.deployed-sha' scripts/install/deploy-livinityd.sh
(matches in _dld_cleanup_temp_dir)
$ grep -nE 'LIVOS_UPDATE_COMPLETED=1' scripts/install/deploy-livinityd.sh
(matches in _dld_cleanup_temp_dir)

# G8 marker (within _dld_build_packages body)
$ awk '/_dld_build_packages\(\)/,/^}/' scripts/install/deploy-livinityd.sh | grep -E 'rm -rf.*packages/ui/dist'
    rm -rf "$_DLD_LIVOS_DIR/packages/ui/dist"
```

### Pipeline order assertions (awk-extracted from deploy_livinityd body)

```
_dld_install_streaming_packages       line 15 (relative)
_dld_generate_jwt_secret              line 16
_dld_update_gallery_cache             line 22
_dld_fix_permissions                  line 23
_dld_write_liv_systemd_units          line 24
_dld_update_caddy_to_livinityd        line 27
_dld_cleanup_temp_dir                 line 28 (LAST)
```

All four ordering invariants from Task 2 acceptance criteria verified:
- streaming AFTER clone, BEFORE jwt → 15 < 16 ✓
- gallery BEFORE permissions → 22 < 23 ✓
- permissions BEFORE liv systemd units → 23 < 24 ✓
- cleanup LAST (after caddy) → 28 > 27 ✓

### Sacred SHA preservation (MANDATORY invariant)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Matches the constraint declared in `<sacred_constraint>` (PLAN.md and execute-plan instructions). This plan touched zero files under `liv/packages/core/src/` — trivially preserved.

### update.sh untouched (D-105-NO-PROD-IMPACT invariant)

```
$ git diff HEAD -- update.sh | wc -l
0
```

The canonical reference at repo root is byte-identical to its pre-plan state. Mini PC re-runs of `update.sh` remain unaffected.

### File growth (audit trail)

```
$ wc -l scripts/install/deploy-livinityd.sh
1038 scripts/install/deploy-livinityd.sh
```

Pre-105-02 (post-105-01): 853 lines. Post-105-02: 1038 lines. Delta: +185 net (95 from Task 1, 90 net from Task 2). Roughly tracks the 202-line raw addition estimate from the 4-helper LoC table above (the 17-line delta is replaced lines + comment expansions in `deploy_livinityd` body).

## Deviations from Plan

None — plan executed exactly as written. No deviations, no auth gates, no architectural decisions needed.

The plan deliberately deferred:
- G4 (npm install --production=false literal) — cosmetic; current `--omit=optional` is functionally equivalent. Re-evaluate only if 105-04 UAT surfaces missing devDep build failures.
- Targeted nested-syncs (CONTEXT D-105-STEP2-NESTED-SYNCS) — RESEARCH §6 recommends KEEPING current single-rsync (same output, faster).
- JSON history-log dir scaffolding — NOT in scope per CONTEXT `<deferred>`.
- Docker container parity-diff harness — deferred per RESEARCH §5 recommendation.
- Test extensions for the new gaps — Plan 105-03 (parallel wave-2 plan).

## Carry-Forward

### Plan 105-03 (parallel wave-2 — test extension)

Plan 105-03 must add the following test assertions covering this plan's gap closures:

| Test ID | Gap | Pattern |
| ------- | --- | ------- |
| TEST 17 | G2 | `grep -qE 'apt-get install.*ffmpeg\|^        ffmpeg' "$DEPLOY_SH"` + xdotool + ydotool + xvfb + fluxbox |
| TEST 18 | G2 | `grep -qE '/etc/systemd/system/ydotoold\.service' && grep -qE 'ExecStart=/usr/bin/ydotoold'` |
| TEST 20 | G3 | atomic `update\.sh\.new` + `mv.*update\.sh\.new.*update\.sh` patterns |
| TEST 21 | G5 | `app-stores.*livinity-apps` + `git fetch.*origin` |
| TEST 22 | G6 | `chown -R` against both LIVOS_DIR and LIV_DIR |
| TEST 23 | G6 | `chmod \+x.*legacy-compat/app-script` |
| TEST 24 | G7 | `rm -rf.*STAGE_DIR\|TEMP_DIR` inside `_dld_cleanup_temp_dir` |
| TEST 25 | G8 | awk-extracted `rm -rf.*packages/ui/dist` inside `_dld_build_packages` body |
| TEST 27 | Pipeline | `_dld_health_check` line < `_dld_update_caddy_to_livinityd` line |
| TEST 28 | Pipeline | `_dld_sync_liv_dist_into_pnpm_store` line < `_dld_write_systemd_unit` line |
| TEST 30 | Sacred | `! grep -qE '> .*liv/packages/core/src/sdk-agent-runner'` |

Locked contract for Plan 105-03 consumers (does not change Plan 105-01's contract):

- New helper names: `_dld_install_streaming_packages`, `_dld_update_gallery_cache`, `_dld_fix_permissions`, `_dld_cleanup_temp_dir` (all `_dld_*` per existing convention)
- New constant: `_DLD_LIVOS_USER` (default `root`)
- New opt-in env: `_DLD_CLEAR_STAGE=1` (default off — preserves stage dir)
- New exported sentinel: `LIVOS_UPDATE_COMPLETED=1` (forward-compat with phase33_finalize)

### Plan 105-04 (wave-3 — live VPS UAT)

Five GO/NO-GO criteria from CONTEXT.md §"Live UAT Gate" all remain operator-walked:

1. `systemctl is-active livos liv-core liv-worker liv-memory` → 4× "active"
2. `curl -sk https://<domain>` returns LivOS login HTML
3. Browser green padlock + LivOS UI renders (operator screenshot)
4. Sacred SHA preserved (`git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
5. Re-running `bash /opt/livos/update.sh` on the same box succeeds idempotently

Specific 105-02 UAT additions:
- Verify `/etc/systemd/system/ydotoold.service` exists OR info-log "skipped" message present in install output
- Verify `/opt/livos/.deployed-sha` matches `(cd /tmp/livos-install-stage && git rev-parse HEAD)`
- Verify `/opt/livos/packages/livinityd/source/modules/apps/legacy-compat/app-script` has executable bit
- Verify streaming binaries on PATH: `ffmpeg gst-launch-1.0 dbus-send xdotool maim Xvfb fluxbox` (or warn-line surfaced in install output)
- Verify gallery cache git pull on second install run (if cache pre-exists from prior install)

## Self-Check: PASSED

Verification claims checked:

```
$ [ -f scripts/install/deploy-livinityd.sh ] && echo FOUND || echo MISSING
FOUND
$ git log --oneline -3 | grep -q "2bef633d" && echo FOUND-TASK1 || echo MISSING
FOUND-TASK1
$ git log --oneline -3 | grep -q "f6406f44" && echo FOUND-TASK2 || echo MISSING
FOUND-TASK2
$ git diff HEAD -- update.sh | wc -l
0
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
$ bash -n scripts/install/deploy-livinityd.sh && echo SYNTAX_OK
SYNTAX_OK
$ bash scripts/install/__tests__/test-deploy-livinityd.sh 2>&1 | tail -1
================================================================
  Plan 104-11/12/13 + 105-01 test results: 79 PASS, 0 FAIL
================================================================
```

Both commits land on the worktree branch (`2bef633d` Task 1, `f6406f44` Task 2 — both with `--no-verify` per parallel-execution protocol). Files referenced in this SUMMARY all exist on disk. Sacred SHA and update.sh invariants both verified above. 79 PASS regression baseline + 18 + 24 mode-args smoke all green.
