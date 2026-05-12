# Phase 105: deploy-livinityd 1:1 Mini-PC update.sh Port — Research

**Researched:** 2026-05-12
**Domain:** Bash deploy-script porting / Linux service bootstrap / pnpm + npm dependency graph
**Confidence:** HIGH (canonical reference + current target are both bash files in the repo and were read line-by-line)

## Summary

Phase 105 replaces `scripts/install/deploy-livinityd.sh` (829 lines, shipped through Plans 104-11/12/13) with a faithful 1:1 port of Mini PC's production-tested `update.sh` (703 lines at repo root). The current deploy-livinityd was written **inside-out** — Plan 104-11 invented helpers from scratch, 104-12 patched a path bug, 104-13 patched a pnpm bug. The result is a script that *mostly* matches update.sh but has six concrete gaps and one structural drift. update.sh is *outside-in* — produced by 30+ phases of Mini-PC firefighting and includes invariants (verify_build, atomic self-rsync, gallery cache, anchored excludes, chown, app-script chmod) that deploy-livinityd silently omits.

This research traces every line range of update.sh to its corresponding helper in current deploy-livinityd.sh, identifies the 6 gaps + 1 hazard, lists the 7 first-install-only helpers that must be preserved, and proposes a 4-plan decomposition with a wave-parallel-friendly split.

**Primary recommendation:** Land Plan 105-01 first as a non-behavioral refactor (rename helpers to `step_N_*` style mirroring update.sh, reorder pipeline, no new logic) so Plans 105-02 (gap closure) and 105-03 (test extension) can be reviewed against a clean baseline. Plan 105-04 is the operator-walked live VPS UAT. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is trivially preserved (deploy-livinityd never opens any liv source file for write) — verify in the live UAT, not in code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Code rsync to /opt/livos + /opt/liv | install-time bash | — | Filesystem-side; same tier as update.sh canonical |
| apt streaming packages (ffmpeg, xdotool, ydotoold) | install-time bash | systemd | ydotoold needs a unit file; rest is plain apt-get |
| pnpm install + tsc/vite builds | install-time bash | Node toolchain | Outputs to dist/ — feeds systemd ExecStart |
| systemd unit write + enable --now | install-time bash | systemd | Service bootstrap |
| Caddyfile rewrite + reload | install-time bash | Caddy daemon | TLS termination — touches Caddy only, not LE/CF wiring |
| PG bootstrap + Redis requirepass + JWT + .env | install-time bash | (first-install-only) | Not in update.sh — wraps around port |
| Live UAT (browser/HTTPS check) | operator (manual) | — | autonomous: false plan; human-walked |
| Sacred-SHA invariant check | git pre-commit hook | bash test harness | Already in place; phase verifies, doesn't modify |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Canonical reference:** `update.sh` at repo root (703 lines) is the canonical source-of-truth. Every step in deploy-livinityd.sh MUST trace to a corresponding section in update.sh. Where they diverge, document WHY in a header comment.

**Step mapping (update.sh → deploy-livinityd.sh):**
- D-105-PREFLIGHT-OMIT: cgroup escape, PIPE trap, JSON log emission, precheck(), record_previous_sha() — OMIT in first-install case
- D-105-PREFLIGHT-KEEP: verify_build() helper (lines 282-295) — KEEP, port as `_dld_verify_build`
- D-105-PREFLIGHT-EUID-CHECK: root check (line 302) — already present in 104-11
- D-105-PREFLIGHT-CONSTANTS: LIVOS_DIR=/opt/livos, LIV_DIR=/opt/liv, TEMP_DIR=/tmp/livinity-update-$$ — match update.sh:174-178
- D-105-STEP1-CLONE-NOT-PULL: Replace `git pull` with `git clone` for first-install
- D-105-STEP1B-PORT-VERBATIM: Port apt streaming-packages block including ydotoold systemd unit (update.sh:339-405)
- D-105-STEP2-RSYNC-DIRECT: `rsync -a --delete --exclude='.git' "$TEMP_DIR/livos/" "$LIVOS_DIR/"`
- D-105-STEP2-EXCLUDE-ANCHORED: Use `--exclude='/docker/'` (anchored), NEVER `--exclude='docker/'`
- D-105-STEP2-SELF-RSYNC: Port update.sh self-deploy (lines 425-430) using atomic mv via `.new` sibling
- D-105-STEP2-COPY-LOCKFILES: pnpm-lock.yaml + pnpm-workspace.yaml separately copied
- D-105-STEP2-NESTED-SYNCS: UI public + config + routes targeted nested syncs (update.sh:446-465)
- D-105-STEP3-LIV-SIBLING: `rsync -a --delete --exclude='.git' "$TEMP_DIR/liv/" "$LIV_DIR/"`
- D-105-STEP4-PNPM: `pnpm install --frozen-lockfile 2>/dev/null || pnpm install`
- D-105-STEP4-NPMRC-PNPM11: Write `/opt/livos/.npmrc` with `block-exotic-subdeps=false` BEFORE pnpm install
- D-105-STEP4-NPM-LIV: `npm install --omit=optional` in $LIV_DIR
- D-105-STEP5-LIVOS-BUILD: pnpm filter builds + verify_build guards
- D-105-STEP5-LIV-BUILD: For each of core/worker/mcp-server/memory: cd + npm run build + verify_build
- D-105-STEP5-DIST-COPY-MULTI: Iterate ALL `@liv+core*`, `@liv+worker*`, `@liv+memory*`, `@liv+mcp-server*` dirs (104-12's `_dld_sync_liv_dist_into_pnpm_store` extends update.sh's @liv+core-only loop)
- D-105-STEP5-DIST-COPY-FAIL: If ZERO matching dirs found, FAIL loudly
- D-105-STEP6-GALLERY: Port verbatim (idempotent on missing `.git`)
- D-105-STEP7-CHOWN: chown -R $LIVOS_USER:$LIVOS_USER /opt/livos /opt/liv (default user = root for first-install)
- D-105-STEP8-DAEMON-RELOAD: systemctl daemon-reload first
- D-105-STEP8-ENABLE-NOW: Use `enable --now` (NOT `restart`) for first-install
- D-105-STEP8-UNIT-FILES: Write all 4 systemd unit files (livos + liv-core + liv-worker + liv-memory) BEFORE enable --now
- D-105-STEP8-NO-MCP-UNIT: liv-mcp-server intentionally has NO systemd unit (P77 on-demand spawn)
- D-105-STEP8-START-ORDER: memory → worker → core → livos
- D-105-STEP8-HEALTH-CHECK: curl :8080 with 30s timeout — WARN-not-FAIL
- D-105-STEP9-CLEANUP: rm -rf "$TEMP_DIR"

**First-install-only additions (wrap around update.sh logic):**
- D-105-INFRA-PG, D-105-INFRA-REDIS, D-105-INFRA-NODE-PNPM, D-105-INFRA-JWT, D-105-INFRA-ENV, D-105-INFRA-CADDY-MODE, D-105-INFRA-CADDY-RELOAD

**Pipeline order:** root check → infra (apt + PG + Redis + Node/pnpm) → clone → apt streaming → rsync (livos+liv) → JWT + .env → .npmrc → pnpm/npm install → builds + verify + dist-copy → gallery → chown → systemd units → enable --now (memory→worker→core→livos) → health check → Caddyfile + reload → cleanup

**Test strategy:** Extend test-deploy-livinityd.sh from 71 → ~100+ assertions. Add Docker container parity-diff harness (D-105-TEST-EQUIV-HARNESS). 104-08 + 104-09 regression smoke MUST pass.

**Live UAT gate (5 GO/NO-GO):** services 4× active; HTTPS returns LivOS HTML; browser green padlock; sacred SHA preserved; update.sh re-run idempotent.

### Claude's Discretion

- Helper naming convention: `_dld_*` (104-11 style) vs `step_N_*` (matching update.sh names) — pick one consistently
- Internal refactor of existing 104-11 helpers if they don't cleanly map
- Comment-header style match-to-update.sh phase citations or not
- Test file decomposition: keep monolithic or split per step group

### Deferred Ideas (OUT OF SCOPE)

- Docker compose alternative (Path B) — deferred indefinitely
- Ansible playbook (Path C) — deferred
- `--user` install.sh flag — infrastructure built, CLI flag follow-up
- Mini PC update.sh refactor — Mini PC keeps running update.sh as-is
- Backup/restore before/after deploy
- Full deploy-time JSON history-log event emission

## 1. update.sh → deploy-livinityd Helper Mapping Table

Line ranges cited against `update.sh` at HEAD. "Current helper" cites `scripts/install/deploy-livinityd.sh` at HEAD (829 lines, post-104-13). "Action" tags: **PORT-VERBATIM** = copy logic 1:1, **ADAPT** = port with first-install adjustments, **OMIT** = first-install doesn't need this, **KEEP-FIRST-INSTALL** = exists in deploy-livinityd but NOT in update.sh (wrap).

| update.sh lines | Section / purpose | Current deploy-livinityd helper | Action | Notes |
|---|---|---|---|---|
| 15-29 | Cgroup escape via `systemd-run --scope` | — (absent) | **OMIT** | First-install has no running livos.service to escape from. D-105-PREFLIGHT-OMIT [VERIFIED: 105-CONTEXT.md] |
| 45 | `trap '' PIPE` (survive livinityd death) | — | **OMIT** | Same rationale as cgroup escape |
| 47-172 | JSON history-log directory + per-deploy log + finalize trap | — | **OMIT** | Deferred per CONTEXT `<deferred>`. Could optionally write the dir scaffold so future update.sh runs find it pre-created (TBD; not blocking) |
| 174-178 | Constants `LIVOS_DIR`, `LIV_DIR`, `REPO_URL`, `TEMP_DIR` | `_DLD_LIVOS_DIR`, `_DLD_LIV_DIR`, `_DLD_REPO_URL`, `_DLD_STAGE_DIR` | **ADAPT** | Name match: rename `_DLD_STAGE_DIR` to `_DLD_TEMP_DIR` and use `/tmp/livinity-update-$$` pattern matching update.sh. Currently `/tmp/livos-install-stage` — diverges (lines 65 in deploy-livinityd) |
| 180-190 | Colors + info/ok/warn/fail helpers | sourced from `_logging.sh` | **PORT-VERBATIM** equivalent | Already equivalent via separate file. Verify: `step()` function (update.sh:297) is also exported from `_logging.sh` |
| 192-268 | `precheck()` (disk + writable + GitHub) | — | **OMIT** | First-install has no /opt/livos to disk-check yet. GitHub reachability is implicit via git clone failure. D-105-PREFLIGHT-OMIT |
| 270-280 | `record_previous_sha()` | — | **OMIT** | No prior .deployed-sha on first-install |
| 282-295 | `verify_build()` helper | INLINED 3× in `_dld_build_packages` + `_dld_build_liv_packages` | **PORT-VERBATIM as helper** | **GAP #1**: currently inlined as ad-hoc `find ... | head -1` checks. Port as named helper `_dld_verify_build` for reuse + parity grep |
| 297 | `step()` colorful banner | sourced from `_logging.sh` | **PORT-VERBATIM** equivalent | Verify match |
| 299-314 | Pre-flight: EUID check + dir/env existence checks | `install.sh` line 63 (`EUID -ne 0` check) | **ADAPT** | First-install asserts EUID=root in install.sh, NOT in deploy-livinityd. update.sh's `[[ ! -d "$LIVOS_DIR" ]]` / `[[ ! -f "$LIVOS_DIR/.env" ]]` checks are INVERTED for first-install (we EXPECT them missing). D-105-PREFLIGHT-EUID-CHECK |
| 316-317 | precheck() call | — | **OMIT** | |
| 319-330 | Step 1: `git clone --depth 1` + capture target SHA | `_dld_clone_source` (lines 236-297) | **PORT** with adjustment | Current does git-fetch-update-if-exists; first-install can be simpler `rm -rf "$TEMP_DIR"; git clone --depth 1`. **HAZARD**: current uses `$_DLD_STAGE_DIR = /tmp/livos-install-stage` (persistent) — update.sh uses `/tmp/livinity-update-$$` (PID-scoped, ephemeral). Stage-dir persistence between install.sh re-runs is an *intentional* feature (faster re-runs) — preserve but rename for clarity |
| 332-337 | `LIVOS_UPDATE_TO_SHA` capture | — | **PORT** | Capture the SHA for use in a future `.deployed-sha` write (forward-compat with update.sh's expectation) |
| 339-405 | **Step 1b: apt streaming packages** (ffmpeg, x11vnc, xdotool, x11-xserver-utils, ydotool, maim, scrot, gnome-screenshot, websockify, vncsnapshot, gstreamer plugins, xdg-desktop-portal-gnome, xvfb, fluxbox, libva-utils, intel-media-va-driver, libdrm-intel1) + ydotoold systemd unit | — | **PORT-VERBATIM** | **GAP #2** [VERIFIED: grep "ffmpeg\|xvfb\|ydotool" deploy-livinityd.sh returns 0 hits]. Idempotent (apt-get install no-ops on installed pkgs). Closes the streaming-subsystem gap on first-install hosts. D-105-STEP1B-PORT-VERBATIM |
| 406-414 | Step 2 livinityd source rsync | `_dld_clone_source` (lines 260-269 — top-level livos/ rsync) | **ADAPT** | Current rsyncs entire `livos/` tree once. update.sh does TARGETED rsyncs per subdir (livinityd source / ui src / ui public / config). Current is FASTER (one walk) but doesn't match update.sh's section structure. **DECISION POINT**: do we match update.sh's targeted-syncs verbatim (cleaner mapping) or keep the single rsync (faster, identical output)? Recommend: match update.sh exactly for parity — they produce identical filesystems |
| 416-432 | **update.sh self-rsync** (atomic via `.new` sibling + `mv`) | `_dld_clone_source` line 277-279 — direct `cp` | **ADAPT** | **GAP #3**: current uses direct `cp`, update.sh uses atomic `.new` + `mv`. First-install can use plain `cp` (no running script to crash) BUT for parity (re-runs of deploy-livinityd) use update.sh's `.new` pattern. D-105-STEP2-SELF-RSYNC |
| 434-442 | Package manifest copies (root + livinityd + ui + config package.json + pnpm-lock + pnpm-workspace) | `_dld_clone_source` lines 272-276 (pnpm-* only) | **ADAPT** | Current covers `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` at root. Update.sh ALSO copies per-package package.json files separately. The big rsync covers them already, so this is belt-and-braces — port for parity but mark as redundant in comment |
| 444-458 | UI source rsync + vite/tailwind/tsconfig copies + ui/public sync | top-level livos/ rsync | **PORT-EQUIVALENT** | Current's top-level rsync already covers ui/src + configs + ui/public. Keep current OR split into matching subdir-syncs per D-105-STEP2-NESTED-SYNCS |
| 460-465 | Config package rsync | top-level rsync | **PORT-EQUIVALENT** | Same |
| 467-491 | Step 3: liv sibling sync per-package + root files | `_dld_clone_source` lines 288-296 (single rsync of entire `liv/` tree) | **PORT-EQUIVALENT** | Identical result. Match update.sh's per-package loop for code-symmetry (or document the divergence) |
| 493-506 | Step 4: pnpm install + npm install | `_dld_build_packages` lines 354-363, `_dld_build_liv_packages` lines 403-415 | **PORT** | Already matches. **GAP #4 (minor)**: update.sh runs `npm install --production=false` (line 504); current uses `npm install --omit=optional` (line 408). Functionally similar; document the divergence or align |
| 508-516 | Build @livos/config | `_dld_build_packages` lines 366-372 | **PORT** | Already covered |
| 518-538 | Build UI (rm -rf dist first per Phase 51, then `npm run build`, then verify_build) | `_dld_build_packages` lines 375-385 | **ADAPT** | **MINOR GAP**: current uses `pnpm --filter ui build` (different invocation, same outcome). update.sh `rm -rf dist` BEFORE build is missing. Phase 51 (v29.5 A2) defensive-fresh-build is documented in update.sh:519-528. Port the `rm -rf dist` to match |
| 540-563 | Build Liv core/memory/worker/mcp-server with verify_build per package | `_dld_build_liv_packages` lines 421-437 | **PORT** with helper extraction | **GAP #1 reprise**: extract `verify_build` to helper. Currently the 4-pkg loop does the BUILD-FAIL check inline (lines 429-432) |
| 564-594 | dist-copy iteration into pnpm-store (Phase 31 BUILD-02 multi-dir fix) | `_dld_sync_liv_dist_into_pnpm_store` lines 451-489 | **PORT-EQUIVALENT** | 104-12 already extends update.sh's @liv+core-only loop to all 4 packages. Keep. Verify pattern parity: rsync -a --delete, mkdir -p target_parent, post-copy verify |
| 596-610 | **Gallery cache** (app-stores/livinity-apps git pull) | — | **PORT-VERBATIM** | **GAP #5** [VERIFIED: grep GALLERY_CACHE deploy-livinityd.sh returns 0 hits]. Idempotent on missing `.git`. D-105-STEP6-GALLERY |
| 612-622 | **Permissions**: chmod +x app-script + chown -R | — | **PORT-VERBATIM** | **GAP #6** [VERIFIED: grep chown deploy-livinityd.sh returns 0 hits]. Two parts: (a) chmod +x app-script for legacy-compat, (b) chown -R $LIVOS_USER for /opt/livos + /opt/liv. D-105-STEP7-CHOWN. Default user = `root` for first-install (update.sh defaults `root:root` per line 619-620, so this matches even without the configurable flag — `bruce:bruce` on Mini PC was a Mini-PC-specific manual chown post-install) |
| 624-655 | Step 8: systemd daemon-reload + restart services | `_dld_write_systemd_unit` (livos.service) lines 553-596 + `_dld_write_liv_systemd_units` lines 609-680 | **ADAPT** | Current uses `enable + start` (first-install) instead of update.sh's `restart` (update flow). D-105-STEP8-ENABLE-NOW. **MINOR PARITY GAP**: update.sh restarts in order `livos → liv-core → liv-worker → liv-memory` (lines 629-641); current's enable order is `liv-memory → liv-worker → liv-core → livos` (lines 663-678). For first-install, the latter order is CORRECT (deps go up); for update-style re-run the order doesn't matter (all running). Document the divergence |
| 657-670 | .deployed-sha write | — | **OMIT** (or port for forward-compat) | First-install has no prior SHA to compare. Optional: write `/opt/livos/.deployed-sha` with the just-cloned SHA so first subsequent `bash /opt/livos/update.sh` finds it. Recommend: PORT (zero-cost forward-compat) |
| 672-682 | Step 9: rm -rf "$TEMP_DIR" + LIVOS_UPDATE_COMPLETED sentinel | — | **PORT** | Cleanup missing in current deploy-livinityd. **GAP**: temp dir leaks. D-105-STEP9-CLEANUP |
| 684-703 | "Done" banner | `show-banner.sh` print_banner | **PORT-EQUIVALENT** | Already via install.sh tail call to print_banner |

## 2. Gap Analysis

These are present in update.sh but absent (or weakly present) in current deploy-livinityd.sh — Plan 105-02 closes them:

| # | Gap | update.sh lines | Risk if not closed | Plan to close |
|---|-----|-----------------|--------------------|---------------|
| **G1** | `verify_build()` as a named helper (currently inlined ad-hoc) | 282-295 | Future build steps invent their own checks → drift. Test harness can't grep for one canonical "BUILD-FAIL" guard call | 105-02 |
| **G2** | apt streaming packages (ffmpeg + xdotool + xvfb + fluxbox + ydotoold systemd unit + libva-utils + ~15 more) | 339-405 | Master Chrome / WebApp Launcher (Phase 100+) features silently broken on fresh VPS. Operator only discovers at first stream attempt | 105-02 |
| **G3** | Atomic update.sh self-rsync via `.new` + `mv` | 416-432 | First-install: no risk (no running script). Re-runs: low risk but parity-breaking | 105-02 |
| **G4** | `npm install --production=false` literal (current uses `--omit=optional`) | 504 | Functionally similar; cosmetic divergence. Could mask future driftif liv adds devDeps that we silently skip | 105-02 |
| **G5** | Gallery cache git pull (`/opt/livos/data/app-stores/*livinity-apps*`) | 596-610 | App Store gallery shows stale apps on first install. Self-heals on first store access per update.sh fallback line 609 — but explicit pull is the canonical pattern | 105-02 |
| **G6** | Permissions: chmod +x app-script + chown -R | 612-622 | (a) `app-script` legacy-compat path may not execute → tRPC apps-router 500. (b) Mini-PC-style operator-owned-by-bruce installs need configurable user (deferred — root default is fine for fresh VPS) | 105-02 |
| **G7** | rm -rf "$TEMP_DIR" cleanup | 674-675 | /tmp/livos-install-stage leaks ~500MB across re-runs. Disk pressure | 105-02 |
| **G8** | UI `rm -rf dist` before vite build (Phase 51 defensive fresh-build) | 531 | Stale dist on re-runs if vite cache hash matches. Phase 51 v29.5 A2 root cause | 105-02 |
| **G9** | `.deployed-sha` write (forward-compat with update.sh) | 657-670 | First `bash /opt/livos/update.sh` after install will compute `LIVOS_UPDATE_FROM_SHA=unknown` — cosmetic, no functional impact | 105-02 (optional) |

## 3. First-Install Wrap Analysis (Preserve in deploy-livinityd, NOT in update.sh)

These are first-install-only because update.sh assumes infra already exists. They must survive the rewrite:

| Helper | Current location | Purpose | Pipeline insertion point |
|--------|------------------|---------|--------------------------|
| `_dld_install_system_packages` | lines 69-100 | Node 22 LTS via NodeSource + pnpm via `npm -g` + postgresql + redis-server + build-essential + python3 + git + rsync + openssl | BEFORE all update.sh steps (first stage) |
| `_dld_setup_postgres` | lines 113-185 | PG role + DB + `PGPASSWORD` env-based schema.sql apply (with sudo -u postgres peer-auth fallback). Idempotent via `pg_roles`/`pg_database` queries | BEFORE source clone (Step 1) |
| `_dld_setup_redis` | lines 188-230 | Redis requirepass via sed-strip-then-append. Idempotent | BEFORE source clone |
| `_dld_generate_jwt_secret` | lines 492-504 | openssl rand -base64 32 → /opt/livos/data/secrets/jwt mode 0600. Reuse on rerun via `[[ -s ]]` test | AFTER rsync (file lives under /opt/livos) and BEFORE pnpm install (.env references it) |
| `_dld_write_env_file` | lines 507-549 | Generate /opt/livos/.env with PG/Redis URLs + JWT path + mode/domain/host_ip. **REUSE-NOT-ROTATE** semantics via grep-back from existing .env. Write .env.bak backup before any modification | AFTER JWT secret, BEFORE pnpm install (some build steps may read env) |
| `_dld_write_pnpm_npmrc` | lines 322-337 | `block-exotic-subdeps=false` for baileys → libsignal git-repo subdep on pnpm 11+. Idempotent via `grep -q` | AFTER source clone (file lives under /opt/livos), BEFORE pnpm install |
| `_dld_update_caddy_to_livinityd` | lines 721-789 | Caddyfile rewrite per `$MODE` (hybrid / tunnel / local-lan / cloud). caddy validate + systemctl reload | LAST (after systemd units enabled, so reverse_proxy target is live) |
| `_dld_health_check` | lines 683-715 | curl :8080 with 30s timeout, WARN-not-FAIL semantics | AFTER livos.service start, BEFORE Caddy reload (so health is visible before Caddy gates traffic) |

**Pipeline position is load-bearing.** See Section 4.

## 4. Pipeline Order Hazards

The current `deploy_livinityd` (lines 803-829) pipeline matches CONTEXT.md's proposed order with three exceptions worth flagging:

### Hazard #1: `.env` written AFTER pnpm install — but schema.sql apply reads DATABASE_URL [LOW]

Current order:
```
clone → npmrc → build_packages (pnpm install) → build_liv → sync_dist → jwt → env → liv_units → livos_unit → health → caddy
```

But `_dld_setup_postgres` (called BEFORE clone — line 814) writes `_DLD_PG_PASS` to a shell-scope variable, then schema.sql is applied INSIDE `_dld_setup_postgres` via PGPASSWORD env — NOT via reading .env. **So this is actually correct** [VERIFIED: lines 169-176]. .env timing matters only for livinityd's systemd-launched runtime, not for the schema apply step. **No change needed.**

However: if the planner reorders to write .env BEFORE pnpm install (because the 105-CONTEXT.md proposed pipeline mentions "Bootstrap secrets BEFORE pnpm install"), they must keep `_dld_setup_postgres` calling schema.sql apply with the SHELL-SCOPE password, NOT from a re-read of .env. Add a test assertion: `_dld_setup_postgres` references `$_DLD_PG_PASS` (not `grep DATABASE_URL "$_DLD_ENV_FILE"`) at the schema-apply point.

### Hazard #2: Caddy reload BEFORE livos.service is verified up [MEDIUM]

Current order (line 826): `_dld_update_caddy_to_livinityd` runs AFTER `_dld_health_check`. **Correct.**

If a future refactor accidentally swaps these, Caddy will start reverse-proxying to 127.0.0.1:8080 before livinityd is bound → 502 Bad Gateway during a 5-30s window. Health check WARN-not-FAIL means the install still "succeeds" but the browser-side UAT will fail intermittently.

**Test assertion needed:** in `deploy_livinityd` body, `_dld_health_check` line number < `_dld_update_caddy_to_livinityd` line number.

### Hazard #3: dist-copy timing [LOW]

Current order (line 820): `_dld_sync_liv_dist_into_pnpm_store` runs AFTER `_dld_build_liv_packages` (line 819) and BEFORE `_dld_write_systemd_unit` (line 824). **Correct.**

If reordered to run AFTER livos.service start, livinityd will boot with stale or missing `@liv/core` dist symlinks and crash on first SDK runner spawn. Add test assertion: dist-copy line < livos-unit line.

### Hazard #4: streaming apt block timing [LOW]

If Plan 105-02 inserts the apt streaming block AFTER `_dld_clone_source` (intuitive — "Step 1b" follows "Step 1"), the ydotoold systemd unit gets `daemon-reload` + `enable` at a point BEFORE deploy-livinityd writes its own liv-* units. update.sh runs systemctl daemon-reload at line 396 inside the step-1b block — this is fine, daemon-reload is idempotent and can run N times. Just don't `disable` ydotoold by accident later.

## 5. Test Extension Strategy

**Current state:** 71 PASS in `test-deploy-livinityd.sh`, 18 PASS in `test-mode-hybrid-args.sh`, 24 PASS in `test-mode-tunnel-args.sh` = **113 combined** [VERIFIED: grep `pass_count` + manual count of tests].

**Target:** ~100+ in test-deploy-livinityd.sh (+ ~30 net new assertions). 18 + 24 (regression smoke) untouched.

### Patterns to keep verbatim (from 104-11/12/13 tests)

- `bash -n` syntax smoke (TEST 2)
- Function-defined grep (TEST 3)
- install.sh wiring + SKIP_DEPLOY gating (TEST 4)
- parse-cli.sh flag handling (TEST 5)
- mode-cloud.sh negative-grep for D-104-NO-PROD-IMPACT (TEST 6)
- Security negative-greps: PGPASSWORD env, chmod 0600 .env, chmod 0600 JWT (TEST 8)
- Idempotency: .env DATABASE_URL/REDIS_URL reuse + .env.bak backup (TEST 9)
- Path-bug fix: no live /opt/livos/livos/ (TEST 12)
- liv-stack build pipeline + call order (TEST 13 + TEST 14)
- npmrc helper (TEST 15)
- Regression smoke for 104-08 + 104-09 (TEST 11)

### New test patterns needed for Phase 105

| New test | Pattern | Why |
|----------|---------|-----|
| **TEST 16: verify_build helper exists** | `grep -qE '^_dld_verify_build\(\)' "$DEPLOY_SH"` + count call sites ≥ 5 | G1 closure — assert helper exists AND is used at every build step |
| **TEST 17: apt streaming block ports update.sh:343-353** | `grep -qE 'apt-get install.*ffmpeg' && grep -qE 'apt-get install.*xdotool' && grep -qE 'apt-get install.*ydotool' && grep -qE 'apt-get install.*xvfb' && grep -qE 'apt-get install.*fluxbox'` | G2 closure |
| **TEST 18: ydotoold systemd unit template present** | `grep -qE '/etc/systemd/system/ydotoold.service' && grep -qE 'ExecStart=/usr/bin/ydotoold'` | G2 closure |
| **TEST 19: anchored docker exclude** | Negative: `! grep -qE "exclude='docker/'" "$DEPLOY_SH"` AND positive: `grep -qE "exclude='/docker/'" "$DEPLOY_SH"` | D-105-STEP2-EXCLUDE-ANCHORED — **CURRENT VIOLATION** (line 263 uses `--exclude='docker/'`) |
| **TEST 20: atomic self-rsync via `.new`** | `grep -qE 'update\.sh\.new' "$DEPLOY_SH" && grep -qE 'mv .*\.new.*update\.sh' "$DEPLOY_SH"` | G3 closure |
| **TEST 21: gallery cache helper present** | `grep -qE 'app-stores.*livinity-apps' "$DEPLOY_SH" && grep -qE 'git fetch.*origin' "$DEPLOY_SH"` | G5 closure |
| **TEST 22: chown helper present** | `grep -qE 'chown -R .*LIVOS_DIR' "$DEPLOY_SH" && grep -qE 'chown -R .*LIV_DIR' "$DEPLOY_SH"` | G6 closure |
| **TEST 23: app-script chmod +x present** | `grep -qE 'chmod \+x.*legacy-compat/app-script' "$DEPLOY_SH"` | G6 closure |
| **TEST 24: temp dir cleanup present** | `grep -qE 'rm -rf .*TEMP_DIR|rm -rf .*STAGE_DIR' "$DEPLOY_SH"` | G7 closure |
| **TEST 25: UI rm -rf dist before build** | `awk '/_dld_build_packages\(\)/,/^}/' "$DEPLOY_SH" \| grep -qE 'rm -rf.*packages/ui/dist'` | G8 closure |
| **TEST 26: update.sh untouched by phase** | `git diff $(git merge-base HEAD master) -- update.sh \| wc -l` should be 0 (BUT only meaningful in PR-mode; for local test use static check: `! grep -qE '> update\.sh\|cat .*> update\.sh' "$DEPLOY_SH"` to assert deploy-livinityd never opens update.sh for write) | D-105-NO-PROD-IMPACT |
| **TEST 27: pipeline order — health BEFORE caddy** | awk-extract `deploy_livinityd()` body, assert `_dld_health_check` line < `_dld_update_caddy_to_livinityd` line | Hazard #2 |
| **TEST 28: pipeline order — dist-copy BEFORE livos unit** | awk-extract, assert `_dld_sync_liv_dist_into_pnpm_store` line < `_dld_write_systemd_unit` line | Hazard #3 |
| **TEST 29: pipeline order — env BEFORE pnpm install** (if Plan 105-01 reorders) | awk-extract, assert `_dld_write_env_file` line < `_dld_build_packages` line. **Caveat**: requires Plan 105-01 to actually reorder; SKIP this assertion if the planner keeps current order (env-after-build) | Pipeline-Order Hazard |
| **TEST 30: sacred SHA — deploy-livinityd never opens any liv source for write** | `! grep -qE '> .*liv/packages/core/src/sdk-agent-runner|cat .*> .*sdk-agent-runner' "$DEPLOY_SH"` | Sacred constraint |
| **TEST 31: TEMP_DIR matches update.sh convention** | `grep -qE 'TEMP_DIR.*livinity-update' "$DEPLOY_SH"` | Naming parity with update.sh:322 |
| **TEST 32: 4 systemd unit files written** | `grep -cE 'cat > .*/etc/systemd/system/.+\.service' "$DEPLOY_SH"` ≥ 4 | livos + liv-core + liv-worker + liv-memory |
| **TEST 33: no liv-mcp-server.service** | Negative: `! grep -qE 'liv-mcp-server\.service' "$DEPLOY_SH"` (comments OK if not in heredoc body) | D-105-STEP8-NO-MCP-UNIT |

### How to verify "update.sh is not modified by this phase"

Two complementary mechanisms:

1. **Static grep on deploy-livinityd.sh**: assert no `>`-redirection or `cat >`-heredoc targets `update.sh` as the WRITE destination. Allowed reads: `cp "$_DLD_STAGE_DIR/update.sh" ...` (READ from temp, WRITE to /opt). Blocked patterns: `cat > update.sh`, `echo ... > update.sh`, `sed -i ... update.sh`. **TEST 26** above.

2. **Git-diff check (CI-mode only)**: `git diff $(git merge-base HEAD master) -- update.sh` should be empty. This catches anyone editing update.sh in the phase's PR. Cannot be a bash test (only meaningful in CI / PR context) — document as a checklist item in 105-04 UAT plan.

### Docker container parity-diff harness (D-105-TEST-EQUIV-HARNESS)

This is a stretch goal — proposed for Plan 105-04 (optional) NOT Plan 105-03. Rationale: it requires Docker installed on the test host (CI or operator) and a long-running container. Out-of-band from the host-side static tests. Recommend deferring unless Plan 105-04 catches a real divergence we can't detect statically.

If shipped, the harness shape:

```bash
# Spawn fresh Ubuntu 24.04 container
docker run --rm -v "$PWD:/work" ubuntu:24.04 bash -c '
  apt-get update && apt-get install -y rsync git curl
  # Run update.sh against a pre-populated /opt/livos
  cd /tmp && git clone --depth 1 https://github.com/utopusc/livinity-io a
  mkdir -p /opt/livos-from-update && rsync -a a/livos/ /opt/livos-from-update/
  bash /work/update.sh   # would need a pre-deployed /opt/livos baseline
  mv /opt/livos /opt/livos-from-update

  # Run deploy-livinityd against parallel /opt
  bash /work/scripts/install.sh --mode hybrid --domain test --cf-token X --cf-zone-id Y --skip-deploy
  mv /opt/livos /opt/livos-from-deploy

  # Diff (modulo first-install-only files)
  diff -rq /opt/livos-from-update /opt/livos-from-deploy \
    | grep -vE "\.env|data/|jwt|deployed-sha|update-history"
'
```

This is expensive (~5 min per run) and finicky. **Recommend: defer to follow-up unless 105-04 UAT fails for non-obvious reasons.**

## 6. Recommended Plan Decomposition

4-plan split, wave-parallel-friendly. Plan numbers cite the phase prefix `105-`:

### Plan 105-01: Pipeline refactor + constant rename (PURE STRUCTURAL — NO BEHAVIOR CHANGE)

**Why first:** Plans 105-02 (gap-closure) and 105-03 (test extension) reviewers need a clean baseline. A combined "refactor + gaps" PR is unreviewable.

**Scope:**
- Rename `_DLD_STAGE_DIR` → `_DLD_TEMP_DIR` and use `/tmp/livinity-update-$$` pattern (matches update.sh:322)
- Optional: Rename `_dld_*` helpers to `step_N_*` matching update.sh section names — OR keep `_dld_*` and add a `# Maps to update.sh step N (lines A-B)` header comment to each. **Recommend the comment route** — less code churn, same parity-grep utility.
- Extract `verify_build()` from inlined ad-hoc checks into named helper `_dld_verify_build` (closes G1 in this plan since extracting is structural, not new behavior)
- Add header banner to deploy-livinityd documenting the 1:1 update.sh port relationship
- Test impact: TEST 16 (verify_build helper) added; existing tests untouched

**Wave 1, autonomous: true**

### Plan 105-02: Gap closure (NEW BEHAVIOR — closes G2-G9)

**Scope:**
- G2: Port update.sh:339-405 apt streaming block + ydotoold systemd unit verbatim. New helper `_dld_install_streaming_packages`
- G3: Port atomic update.sh self-rsync (lines 416-432) via `.new` + `mv`. Patch `_dld_clone_source`
- G4: Align `npm install` flag with update.sh (`--production=false` literal)
- G5: New helper `_dld_update_gallery_cache` per update.sh:596-610
- G6: New helper `_dld_fix_permissions` per update.sh:612-622 (chmod +x app-script + chown -R, configurable $LIVOS_USER defaulting to root)
- G7: New helper `_dld_cleanup_temp_dir` per update.sh:672-682. Add `LIVOS_UPDATE_COMPLETED=1` sentinel write
- G8: Add `rm -rf "$_DLD_LIVOS_DIR/packages/ui/dist"` before vite build in `_dld_build_packages`
- G9 (optional): Write `/opt/livos/.deployed-sha` from `LIVOS_UPDATE_TO_SHA` capture
- D-105-STEP2-EXCLUDE-ANCHORED: change `--exclude='docker/'` to `--exclude='/docker/'` in `_dld_clone_source` rsync
- D-105-STEP2-NESTED-SYNCS: optionally split top-level livos/ rsync into update.sh's targeted-syncs (livinityd source / ui src / ui public / config). **Recommend KEEPING current single rsync** — same output, faster, less code. Document divergence in helper header
- Pipeline insertion: streaming-packages BETWEEN clone + .npmrc; gallery cache + permissions BETWEEN dist-sync and JWT; cleanup LAST
- Test impact: TESTS 17-25 added (apt streaming, ydotoold, anchored exclude, atomic self-rsync, gallery cache, chown, chmod app-script, cleanup, UI rm -rf dist)

**Wave 2 (depends on 105-01), autonomous: true**

### Plan 105-03: Test harness extension + regression validation

**Scope:**
- Add TESTS 16-33 from Section 5 (some overlap with 105-01/02 but only the assertion logic; test scaffolding goes here)
- Document anti-regression checklist: 104-08 + 104-09 + 104-11/12/13 tests MUST stay green
- Update test summary header from "Plan 104-11/12/13" → "Plan 104-11/12/13/105-01/02/03"
- Final PASS count target: ~33 added → 71 + 33 ≈ **104 assertions** (matching the "~100+" target). Combined with regression: 18 + 24 + 104 = **146 total**

**Wave 2 (parallel with 105-02, depends on 105-01 helper-name freeze), autonomous: true**

### Plan 105-04: Live VPS UAT (autonomous: false — OPERATOR WALK)

**Scope:**
- Provision (or reuse cleaned mainserver 154.53.56.75) a fresh Ubuntu 24.04 VPS
- Run `bash install.sh --mode hybrid --domain <operator-domain> --cf-token <token> --cf-zone-id <zone>` end-to-end
- Verify all 5 GO/NO-GO criteria:
  1. `systemctl is-active livos liv-core liv-worker liv-memory` → 4× "active"
  2. `curl -sk https://<domain>` returns LivOS login HTML
  3. Browser-side green padlock + LivOS UI renders (operator screenshot)
  4. `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
  5. Re-run `bash /opt/livos/update.sh` on the same box — idempotent success (proves parity)
- Cleanup target box after UAT (rm /opt/livos /opt/liv, drop PG db, remove Caddy, delete CF DNS A-record)
- Document evidence (screenshots, journalctl outputs, command runs) in `105-04-UAT-EVIDENCE/`

**Wave 3 (depends on 105-02 + 105-03 merged), autonomous: false**

### Wave summary

| Wave | Plans | Can run in parallel? |
|------|-------|----------------------|
| 1 | 105-01 | n/a — single plan |
| 2 | 105-02, 105-03 | YES (105-03 freezes test names against 105-01's renamed helpers; 105-02 closes the gaps that 105-03 asserts. Either order works if helper names are frozen in 105-01) |
| 3 | 105-04 | n/a — operator walk |

### Why not 3 plans? Why not 5?

- **3 plans** would conflate refactor with gap-closure → unreviewable PR
- **5 plans** would split 105-02 into per-gap plans (G2-streaming, G5-gallery, G6-permissions, etc.) → 6+ trivial PRs with no merge value. Coarse-grained for net-new behavior is fine; the test harness catches each gap independently anyway.

## 7. Validation Architecture

> `workflow.nyquist_validation` is not explicitly disabled in `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bash + grep + awk (host-side static tests) |
| Config file | none (bash scripts) |
| Quick run command | `bash scripts/install/__tests__/test-deploy-livinityd.sh` |
| Full suite command | `for f in scripts/install/__tests__/*.sh; do bash "$f"; done` |

### Phase Requirements → Test Map

No formal REQ-IDs for Phase 105 (per additional context "No REQ-IDs explicitly mapped"). Mapping decisions (D-105-*) to tests:

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| D-105-PREFLIGHT-KEEP | verify_build helper defined + 5+ call sites | static grep | `bash test-deploy-livinityd.sh` (TEST 16) | ❌ Wave 1 (105-01) |
| D-105-STEP1B-PORT-VERBATIM | apt streaming block + ydotoold unit | static grep | (TEST 17 + 18) | ❌ Wave 2 (105-02) |
| D-105-STEP2-EXCLUDE-ANCHORED | `--exclude='/docker/'` not `'docker/'` | static grep | (TEST 19) | ❌ Wave 2 |
| D-105-STEP2-SELF-RSYNC | atomic .new + mv | static grep | (TEST 20) | ❌ Wave 2 |
| D-105-STEP6-GALLERY | gallery cache helper | static grep | (TEST 21) | ❌ Wave 2 |
| D-105-STEP7-CHOWN | chown + app-script chmod | static grep | (TEST 22 + 23) | ❌ Wave 2 |
| D-105-STEP9-CLEANUP | rm -rf TEMP_DIR | static grep | (TEST 24) | ❌ Wave 2 |
| Pipeline order (Hazards #2/3) | health < caddy, dist-copy < livos-unit | awk-extracted line numbers | (TEST 27 + 28) | ❌ Wave 2 (105-03) |
| D-105-NO-PROD-IMPACT (update.sh untouched) | no `> update.sh` write in deploy-livinityd | negative grep | (TEST 26) + CI git-diff | ❌ Wave 2 |
| Sacred SHA | no liv/packages/core/src/* write | negative grep | (TEST 30) | ❌ Wave 2 |
| Live UAT | services + HTTPS + UI + sacred + update.sh re-run | manual | operator walk | ❌ Wave 3 (105-04) |

### Sampling Rate

- **Per task commit:** `bash scripts/install/__tests__/test-deploy-livinityd.sh` (~5s)
- **Per wave merge:** all three test files (~10s combined)
- **Phase gate:** Wave 3 operator UAT walk → 5 GO/NO-GO criteria

### Wave 0 Gaps

- `scripts/install/__tests__/test-deploy-livinityd.sh` exists (71 PASS) — extends in 105-03
- No new framework install needed
- No conftest equivalents needed (bash)

**Net:** existing test infrastructure covers all phase requirements via extension. Wave 0 (test scaffolding) is implicitly Plan 105-01 setup.

## 8. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Rollback path |
|---|------|------------|--------|------------|---------------|
| **R1** | pnpm version drift between Mini PC (older) and fresh Ubuntu 24.04 (pnpm 11+) introduces a NEW failure mode not seen in 104-13 | MEDIUM | Re-deploy fails at pnpm install; UAT-blocking | Re-test on fresh container BEFORE 105-04 UAT. Add a TEST that asserts `npm install -g pnpm@latest` was the install vector (forces parity check) | Revert deploy-livinityd.sh to 104-13 SHA; relevant PR can be reverted independently |
| **R2** | Node 22 LTS on fresh VPS vs Mini PC's Node version drift breaks tsc or vite build | LOW | Build fail | `_dld_install_system_packages` already pins Node 22; Mini PC manually upgraded post-65 to Node 22 too per memory | Pin specific Node minor in NodeSource setup script (`setup_22.x` → fixed minor) |
| **R3** | rsync `--exclude` syntax difference between Ubuntu 24.04 rsync 3.2.7 and Mini PC rsync 3.2.x | LOW | Silent exclude mismatch | Anchored patterns (`/docker/` not `docker/`) work across all rsync 3.x. Test TEST 19 catches divergence | Document rsync version in `_dld_install_system_packages` apt-version pin (or just `rsync` since default-in-base-image is fine) |
| **R4** | npm install `--omit=optional` vs `--production=false` divergence causes liv-memory to silently miss better-sqlite3 native deps on fresh VPS | LOW-MEDIUM | liv-memory.service in restart loop (matches existing Mini PC pre-existing breakage per memory: "liv-memory.service in restart loop because dist/index.js never compiled") | Align with update.sh literal (`--production=false`) in 105-02 (G4) | Same as R1 |
| **R5** | Plan 105-01 helper rename breaks `install.sh` source-call chain or test grep patterns | LOW | All tests fail | Keep `_dld_*` names; use comment-headers for update.sh mapping. **Already recommended above.** | Revert 105-01 PR |
| **R6** | Plan 105-02 apt streaming block fails on hosts without Intel iGPU (VAAPI userspace install) | LOW | Best-effort branch (update.sh has `\|| warn` per line 360) | Port update.sh's WARN-not-FAIL semantics verbatim | Per-helper revert |
| **R7** | Caddy reload while livos.service is still booting → 502 window during install | LOW | Cosmetic — install completes, browser may see 502 for 5-30s | Health check before Caddy reload (current order — Hazard #2 keeps this safe) | n/a |
| **R8** | mainserver 154.53.56.75 not fully cleaned up between 105-04 attempts → state from 104-13 leaks | LOW | Confusing UAT results | Operator runs explicit cleanup before each attempt (`rm -rf /opt/livos /opt/liv && sudo -u postgres dropdb livos && apt-get remove --purge caddy`) | Standard cleanup is documented in CONTEXT.md |
| **R9** | Operator runs install.sh on a host with EXISTING /opt/livos from a manual setup (not from install.sh) — `.env` reuse logic doesn't match pre-existing schema | MEDIUM | Re-run resets PG password to a value the operator-set DB doesn't recognize | `_dld_setup_postgres` does `ALTER USER` to align cluster to .env value (line 148). Idempotent. But if PG data dir has un-migrated tables, schema.sql apply will fail | Operator UAT runs against truly fresh VPS, NOT against pre-existing /opt/livos hosts (documented in 105-04 plan) |
| **R10** | Sacred SHA constraint violated by an unrelated commit during the phase (e.g., update.sh edit accidentally touches sdk-agent-runner symlink) | LOW | Pre-commit hook catches it | Pre-commit hook is live per memory; phase touches only `scripts/install/` + `.planning/` | Pre-commit hook auto-rejects |

### Rollback path (general)

Each plan ships as a separate commit. If a regression surfaces post-merge:
1. `git revert <plan-105-N-commit-sha>` — single-commit revert returns to prior PASS-ing state
2. 104-08 + 104-09 + 104-11/12/13 tests all stay PASS-green throughout — they are the regression smoke that signals "deploy-livinityd is broken"
3. Mini PC is untouched (D-105-NO-PROD-IMPACT) so no production rollback ever required

## 9. Open Questions

1. **Should the JSON history-log scaffolding (update.sh:47-172) be partially ported?**
   - What we know: CONTEXT.md `<deferred>` says "JSON history-log scaffolding is preserved but full deploy-time event emission is deferred"
   - What's unclear: does "scaffolding preserved" mean WRITE the dir + emit a stub JSON, or just KEEP the convention so update.sh re-runs find the dir? Both are valid.
   - Recommendation: Emit a stub `update-history/install-<iso-ts>-success.json` on success in 105-02 (cheap forward-compat with Phase 33 OBS-01 UI hook) — but ONLY the JSON, not the tee/finalize trap. Planner can defer if too much

2. **Should Plan 105-02's targeted-nested-sync match update.sh exactly OR keep the single top-level rsync?**
   - What we know: same output, current approach is faster
   - What's unclear: parity-grep on test side benefits from "rsync count = N" assertion matching update.sh's count
   - Recommendation: keep single rsync; document the divergence in `_dld_clone_source` header. Planner chooses

3. **For the dist-copy iteration: does `@liv+mcp-server*` actually exist in `/opt/livos/node_modules/.pnpm/`?**
   - What we know: 104-12's `_dld_sync_liv_dist_into_pnpm_store` iterates 4 packages (core, worker, mcp-server, memory) but the warn line says "non-fatal if no @liv+<pkg>* dir"
   - What's unclear: livinityd may not directly import `@liv/mcp-server` — it spawns it as a subprocess. The pnpm-store dir for mcp-server may never exist
   - Recommendation: keep 4-pkg loop with WARN-not-FAIL on missing dirs (current behavior). No action needed for 105

4. **Does the Docker container parity-diff harness (D-105-TEST-EQUIV-HARNESS) ship in 105-03 or 105-04?**
   - What we know: CONTEXT.md mentions it but doesn't specify which plan
   - What's unclear: it requires Docker installed + ~5 min runtime per check — heavy for a per-commit test
   - Recommendation: defer (don't ship in 105). If 105-04 UAT surfaces a divergence we can't catch statically, ship a follow-up plan. Static test harness in 105-03 catches all the named gaps.

5. **Should deploy-livinityd write the streaming-packages systemd unit (ydotoold.service) or skip on fresh VPS?**
   - What we know: update.sh writes it only if a desktop user (UID>=1000) exists (line 378-400)
   - What's unclear: fresh Ubuntu 24.04 VPS may have NO non-system user → ydotoold unit never gets written → first WebApp launch on the box silently fails until a user is added
   - Recommendation: port the conditional logic verbatim. If no desktop user, write a WARN line; this is acceptable for an install gate. Documented as a known caveat in 105-04 UAT plan section.

## Assumptions Log

> Track every claim tagged `[ASSUMED]` that needs verification before becoming a locked decision.

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Mini PC `update.sh` at repo HEAD is identical to the on-Mini-PC version | §1 mapping | LOW — memory `feedback_update_sh_drift.md` documents PRIOR drift but Phase 30+ commits brought repo update.sh up to date. If drift returns, the mapping table is wrong | [ASSUMED — based on STATE.md "104-13 SHIPPED" + CONTEXT.md D-105-NO-PROD-IMPACT saying "Mini PC keeps running update.sh exactly as-is"] |
| A2 | pnpm 11+ `block-exotic-subdeps` semantics from 104-13 still apply at Phase 105 time | §3 helpers | LOW — pnpm release cadence is monthly; the gate has only ever been enabled-by-default since 11.0 | [VERIFIED: 104-13 shipped 2026-05-12 same-day as 105 research; pnpm 11.1.1+ at that time] |
| A3 | Fresh Ubuntu 24.04 VPS has rsync 3.2.7+ in default apt repository | §8 risks (R3) | LOW — 24.04 ships rsync 3.2.7 in base archive [CITED: packages.ubuntu.com/noble/rsync] | [VERIFIED: Ubuntu 24.04 noble main has rsync 3.2.7] |
| A4 | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at HEAD | §1 mapping (Sacred) | HIGH if wrong — the sacred constraint pre-commit hook gates every commit. If hook is missing on a planner's machine, they could accidentally rename and break the SHA | [ASSUMED] Verify in 105-04 UAT via direct `git hash-object` check |
| A5 | Mini PC PostgreSQL stores db `livos` with `livos` role; password rotates via `_dld_setup_postgres`'s ALTER USER pattern | §3 helpers | LOW — memory `reference_minipc.md` confirms layout; 104-11's `_dld_setup_postgres` already handles this | [VERIFIED: memory + deploy-livinityd lines 113-185] |
| A6 | Current `deploy-livinityd.sh` line numbers (829 total) match HEAD | §1 mapping | LOW | [VERIFIED: read 1-829 inclusive] |
| A7 | Phase 105 has NO formal REQ-IDs mapped | §7 Validation | LOW — per "additional context" in the research prompt | [CITED: additional context says "No REQ-IDs explicitly mapped to Phase 105 yet"] |
| A8 | mainserver 154.53.56.75 is fully cleaned up and available for 105-04 UAT | §6 105-04 | MEDIUM — if stale state leaks, UAT results are confusing | [ASSUMED — per "Live test cleanup status" in additional context] Verify by operator before 105-04 start |

## Environment Availability

> Phase 105 ships changes to install-time bash scripts. The relevant "environment" is the **target UAT host** (fresh Ubuntu 24.04 VPS), not the developer machine.

| Dependency | Required by | Available on dev (Windows) | Available on fresh Ubuntu 24.04 VPS | Fallback |
|------------|-------------|---------------------------|-------------------------------------|----------|
| bash 5+ | All tests | ✓ (Git for Windows) | ✓ | — |
| grep / awk / sed | All tests | ✓ | ✓ | — |
| rsync 3.2+ | install at runtime | ✓ (Git for Windows) | ✓ default | — |
| Node 22 LTS via NodeSource | `_dld_install_system_packages` | n/a (host-side test only) | installs via curl from deb.nodesource.com | — |
| pnpm 11+ | `_dld_build_packages` | n/a | installs via `npm install -g pnpm@latest` | — |
| PostgreSQL 16 | `_dld_setup_postgres` | n/a | apt-get install postgresql | — |
| Redis | `_dld_setup_redis` | n/a | apt-get install redis-server | — |
| Caddy 2.11+ (xcaddy with cloudflare-dns module) | `_dld_update_caddy_to_livinityd` | n/a | installed by `common-deps.sh` already | — |
| Docker (for D-105-TEST-EQUIV-HARNESS) | optional parity-diff | n/a | optional (operator can skip) | Static tests cover all gaps |
| git 2.40+ | clone + `git hash-object` for sacred SHA | ✓ | ✓ | — |

**No missing blocking dependencies.** All apt + npm + curl install vectors are operator-resolvable via standard Ubuntu archives + NodeSource + npm registry.

## Security Domain

> `security_enforcement` is not explicitly disabled in `.planning/config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT secret bootstrap (`_dld_generate_jwt_secret`), API key persistence (`/etc/livos/secrets/api-key`) |
| V3 Session Management | no (deferred — livinityd handles at runtime) | — |
| V4 Access Control | partial | File permissions: `.env` 0600, JWT 0600, secrets dir 0700 |
| V5 Input Validation | no (deploy script is operator-invoked with whitelisted flags) | parse-cli.sh whitelists `--mode` against [cloud, local-lan, hybrid, tunnel] |
| V6 Cryptography | yes | openssl rand -base64 (for PG/Redis/JWT secrets) — `urandom`-backed, 24/32 byte entropy |
| V14 Configuration | yes | `block-exotic-subdeps=false` is a relaxation (104-13 documented tradeoff) |

### Known threat patterns for bash deploy scripts

| Pattern | STRIDE | Standard Mitigation | Coverage in Phase 105 |
|---------|--------|---------------------|-----------------------|
| Secrets on argv (visible in `ps auxww`) | Information Disclosure | Env-var or stdin (`curl -K -`) instead of argv | T-104-11-1 (PGPASSWORD env) — TEST 8 catches regressions. Inherited from 104-11/12/13 |
| Secret files world-readable | Information Disclosure | chmod 0600 (file) + 0700 (dir) | T-104-11-2/3 — TEST 8 catches regressions |
| CF API token in argv | Information Disclosure | `curl -K -` config-from-stdin | 104-08 hotfix — outside Phase 105 scope |
| Stale dist files trigger arbitrary-code-via-import | Tampering | `rm -rf dist` before build (Phase 51 v29.5 A2) | G8 — closed in 105-02 |
| Self-modifying script crashes mid-run | DoS | Atomic `.new` + `mv` (different inode) | G3 — closed in 105-02 |
| Supply-chain via `block-exotic-subdeps=false` | Tampering | Documented audit checklist in 104-13 helper source; deferred review | Inherited from 104-13 — no Phase 105 change |
| Pre-commit hook bypass via `git commit --no-verify` | Tampering | Documented warning in CLAUDE.md / orchestrator instructions; sacred SHA hook is mandatory | Out of Phase 105 scope |

## Project Constraints (from CLAUDE.md)

- **Sacred SHA invariant**: `liv/packages/core/src/sdk-agent-runner.ts` must hash to `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook gates all commits. Phase 105 never writes to this file (only deploys it).
- **Server4 hard rule**: NEVER apply patches to Server4. NEVER list as deploy target. Phase 105 UAT target = fresh VPS (mainserver 154.53.56.75 reuse) or Mini PC re-deploy. No Server4 involvement.
- **Server5 minimal touch**: D-104-RELAY-ZERO-DATA-PLANE preserved — deploy-livinityd has zero Server5 / livinity.io / nexus.livinity / relay.livinity references. Only network calls are git clone (GitHub), apt-get (Ubuntu archive + NodeSource + Cloudsmith), and optional 104-10 heartbeat. Phase 105 introduces no new Server5 references.
- **Subscription-only**: `sdk-subscription` mode is sacred (deploy-livinityd doesn't touch the subscription path; it deploys files, livinityd at runtime reads them).
- **No emojis** in commits or file contents unless explicitly requested.

## Sources

### Primary (HIGH confidence)
- `update.sh` (repo root, 703 lines) — canonical reference; line-by-line read [VERIFIED: file read 1-703]
- `scripts/install/deploy-livinityd.sh` (829 lines) — current target [VERIFIED: file read 1-829]
- `scripts/install/__tests__/test-deploy-livinityd.sh` (457 lines, 71 PASS) — test harness [VERIFIED: file read 1-457]
- `scripts/install.sh` (99 lines) — entry point [VERIFIED: file read 1-99]
- `.planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/105-CONTEXT.md` — locked decisions [VERIFIED: file read 1-244]
- `.planning/ROADMAP.md` lines 665-708 — Phase 105 entry [VERIFIED: read]
- `.planning/STATE.md` — current Phase 104 state context [VERIFIED: lines 1-119 read]
- `.planning/config.json` — workflow config [VERIFIED: read; nyquist_validation absent → enabled; security_enforcement absent → enabled]

### Secondary (MEDIUM confidence)
- Project memory `feedback_update_sh_drift.md` — drift warning context [CITED via summary in research prompt]
- Project memory `project_p104_deploy_gap.md` — Path A decision rationale [CITED via summary in research prompt]
- Project memory `reference_minipc.md` — Mini PC layout reference [CITED via CLAUDE.md auto-loaded memory]
- Project memory `feedback_milestone_uat_gate.md` — UAT gate requirement [CITED via CLAUDE.md]

### Tertiary (LOW confidence — none in this research)

None. All claims grounded in the repo files above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bash + apt + systemd + pnpm + npm are repo-internal canonical
- Step mapping table: HIGH — both files read line-by-line; line ranges directly cited
- Gap analysis (G1-G9): HIGH — each gap negative-grep verified during research
- Pipeline order hazards: HIGH — current pipeline order read directly; consequences inferred from standard systemd + bash semantics
- Test patterns: HIGH — existing tests read line-by-line; new patterns follow same grep/awk style
- Plan decomposition: MEDIUM — recommendation reasoned from gap distribution + reviewability heuristic; alternative splits are defensible
- Risk register: MEDIUM — most risks identified by analogy to Phase 104 live-test failures; LOW-MEDIUM likelihood for most
- Sacred SHA assumption (A4): ASSUMED — verify before 105-01 lands

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days for stable; revisit if Mini PC update.sh changes or fresh-VPS pnpm version moves)
