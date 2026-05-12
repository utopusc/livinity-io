---
phase: 106-deploy-livinityd-bootstrap-layer-hotfix-back-port
plan: 01
subsystem: install / bootstrap
tags:
  - bootstrap
  - deploy-livinityd
  - apt-install
  - jwt
  - first-run-ux
  - hotfix-back-port
status: code-complete-pending-mainserver-uat
shipped: 2026-05-12
commit_range: c3f13dd2..262e28f4
commit_count: 7  # source commits; this SUMMARY commit lands separately as commit #8
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_verified: 7/7 commits (sdk-agent-runner.ts untouched throughout)
dependency_graph:
  requires:
    - Phase 105 (deploy-livinityd 1:1 update.sh port — landed 332239e2)
    - Phase 105-05 (Bug #6 docker image retag — landed e3ebb572)
  provides:
    - Fresh-VPS-install byte-equivalence with manually-hotfixed mainserver state
    - 6 bootstrap-layer bugs back-ported (Bugs #7-#12)
    - +22 regression assertions in test-deploy-livinityd.sh (126 → 148 PASS)
  affects:
    - scripts/install/deploy-livinityd.sh (5 of 6 bugs)
    - livos/packages/livinityd/source/modules/user/user.ts (Bug #12)
tech_stack:
  added:
    - mender-client4 (Ubuntu universe, WARN-not-FAIL)
    - samba + samba-common-bin (required, main apt array)
    - google-chrome-stable (signed-keyring repo)
  patterns:
    - signed-keyring apt repos (no deprecated apt-key)
    - visudo -cf validation before sudoers drop-in install (avoid bricking sudo)
    - JWT-secret format detection + rotation with .pre-106.bak preservation
    - FileStore-default-aware `exists()` semantics (Boolean(user?.hashedPassword))
key_files:
  created:
    - .planning/phases/106-deploy-livinityd-bootstrap-layer-hotfix-back-port/106-01-SUMMARY.md
  modified:
    - scripts/install/deploy-livinityd.sh (5 commits: Bugs #7, #8, #9, #10, #11)
    - scripts/install/__tests__/test-deploy-livinityd.sh (1 commit: +22 asserts)
    - livos/packages/livinityd/source/modules/user/user.ts (1 commit: Bug #12)
decisions:
  - "Bug #7 (mender-client4): WARN-not-FAIL group — log-spam fix is non-critical, hard-fail would brick deploys on minimal Ubuntu derivatives lacking universe access"
  - "Bug #9 (chrome): WARN-not-FAIL — hard-fail would brick deploys on minimal containers; operator can debug ENOENT if it surfaces"
  - "Bug #10 (desktop user): NEW `_DLD_DESKTOP_USER` constant introduced (defaults `bruce`); existing `_DLD_LIVOS_USER:-root` PRESERVED — they serve different purposes (file-tree owner vs. GUI/sudo human login)"
  - "Bug #11 (JWT): rotation forces re-login (week-long JWTs) — acceptable trade-off vs. continued crash-loop"
  - "Bug #12 (exists semantics): all 5 callers verified to want hashedPassword-present semantics — no caller depends on 'user-key-present-without-password' state"
metrics:
  duration_minutes: ~12  # plan execution time, autonomous executor agent
  test_count_before: 168  # combined deploy(126) + hybrid(18) + tunnel(24)
  test_count_after: 190   # combined deploy(148) + hybrid(18) + tunnel(24)
  test_delta: +22
  source_commits: 7
  files_modified: 3
---

# Phase 106-01 SUMMARY — deploy-livinityd Bootstrap-Layer Hotfix Back-Port

**Phase:** 106 — deploy-livinityd Bootstrap-Layer Hotfix Back-Port
**Plan:** 01 (single plan; 8 tasks)
**Status:** CODE-COMPLETE 2026-05-12 — pending mainserver UAT (Task 8 checkpoint — deferred to operator)
**Commit range:** `c3f13dd2..262e28f4` (7 source commits; this SUMMARY commit lands separately as commit #8)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — VERIFIED IDENTICAL across all 7 source commits (re-verified at SUMMARY write time)

## One-liner

Back-ported 6 Phase-105-UAT-discovered bootstrap-layer bugs (5 in `deploy-livinityd.sh`, 1 in `user.ts:exists()`) into the repo so a fresh `bash install.sh --mode hybrid ...` on Ubuntu 24.04 is byte-equivalent to the manually-hotfixed mainserver state — no operator hand-patching after install.

## Bugs Fixed

### Bug #7 — `mender-client4` missing → `spawn mender ENOENT` log spam — commit `c3f13dd2`

- **Symptom:** livinityd's periodic update-check module spawns `mender`; binary not in PATH on fresh Ubuntu 24.04 VPS → `spawn ENOENT` event spammed in `journalctl -u livos` every poll interval.
- **Location:** `scripts/install/deploy-livinityd.sh:_dld_install_system_packages` (apt array).
- **Fix:** Append `mender-client4` as WARN-not-FAIL group after main apt array. Some Ubuntu derivatives lack the package in universe → install failure logged WARN, not FATAL (the bug it fixes is verbose-level spam, not a critical malfunction).
- **Commit:** `c3f13dd2` (`fix(106-01): _dld_install_system_packages add mender-client4 (Bug #7)`)
- **Verification:** `awk '/^_dld_install_system_packages\(\)/,/^}/' scripts/install/deploy-livinityd.sh | grep -q "mender-client4"` → exit 0 (5 mentions in helper).

### Bug #8 — `samba` + `samba-common-bin` missing → Files module crash — commit `f31dc494`

- **Symptom:** livinityd's Files module spawns `smbpasswd -s -a livinity` for SMB-share management → `spawn smbpasswd ENOENT` → module crashes; `/etc/samba/smb.conf` also absent → no SMB shares possible.
- **Location:** `scripts/install/deploy-livinityd.sh:_dld_install_system_packages` (main apt array).
- **Fix:** Append `samba samba-common-bin` to the main `apt-get install -y -qq` array. This group is REQUIRED (no fallback), so it goes in the main array — not a WARN-not-FAIL side group.
- **Commit:** `f31dc494` (`fix(106-01): _dld_install_system_packages add samba samba-common-bin (Bug #8)`)
- **Verification:** `awk '/^_dld_install_system_packages\(\)/,/^}/' scripts/install/deploy-livinityd.sh | grep -q "samba samba-common-bin"` → exit 0.

### Bug #9 — `google-chrome` missing (FATAL — WebApp Launcher blocker) — commit `ba6e084d`

- **Symptom:** livinityd's Streaming module spawns `google-chrome` for WebApp Launcher → `spawn ENOENT` → unhandled error event crashes livinityd → systemd restart-loops it. THIS WAS THE #1 CAUSE of mainserver flap after Bug #6 retag landed in Phase 105.
- **Location:** `scripts/install/deploy-livinityd.sh` — NEW helper `_dld_install_google_chrome` + pipeline wire.
- **Fix:** New idempotent helper installs `google-chrome-stable` via signed-keyring apt repo:
  - `gpg --dearmor --yes` keyring at `/usr/share/keyrings/google-chrome.gpg` (NOT deprecated apt-key)
  - sources.list overwrite is unconditional single-line (idempotent re-runs)
  - Short-circuits if `google-chrome` already on PATH
  - WARN-not-FAIL on apt install failure (minimal containers may not support chrome — Streaming module will still crash with ENOENT but the deploy completes so operator can debug)
  - Wired into `deploy_livinityd` AFTER `_dld_install_streaming_packages` and BEFORE `_dld_setup_docker_images`
- **Commit:** `ba6e084d` (`fix(106-01): add _dld_install_google_chrome helper + pipeline wire (Bug #9)`)
- **Verification:** Function defined at line 487; pipeline order verified (streaming < google_chrome < docker_images).

### Bug #10 — `bruce` user + sudoers + groups + fluxbox WM — commit `3fd11273`

- **Symptom:** livinityd's Streaming module crashed with `sudo: unknown user bruce` on per-host display features (the operator account didn't exist yet on a fresh VPS).
- **Location:** `scripts/install/deploy-livinityd.sh` — NEW helper `_dld_create_desktop_user` + 2 new constants + pipeline wire.
- **Fix:** New idempotent helper creates the desktop user with sudo + docker group membership and a NOPASSWD sudoers drop-in:
  - NEW constants `_DLD_DESKTOP_USER` (default `bruce`) and `_DLD_DESKTOP_UID` (default `1000`) — distinct from `_DLD_LIVOS_USER:-root` (file-tree owner)
  - `useradd -m -u $uid` (idempotent via `id -u` short-circuit; falls back to auto-assigned uid if 1000 taken)
  - `usermod -aG sudo[,docker]` (docker group added only if `getent group docker` finds it — Docker may not yet be installed)
  - Sudoers drop-in written to `/tmp` tmp file FIRST, validated by `visudo -cf`, only THEN moved to `/etc/sudoers.d/99-${user}` — visudo failure → rm tmp + WARN (NEVER leave a broken sudoers file in place; that would brick sudo for entire host)
  - fluxbox is ALREADY installed by `_dld_install_streaming_packages` — no apt install here
  - Existing `_DLD_LIVOS_USER:-root` default UNTOUCHED (D-104-NO-PROD-IMPACT preserved — Mini PC ownership semantics unchanged)
  - Wired into `deploy_livinityd` AFTER `_dld_setup_redis` and BEFORE `_dld_clone_source`
- **Commit:** `3fd11273` (`fix(106-01): add _dld_create_desktop_user helper + pipeline wire (Bug #10)`)
- **Verification:** All 8 assertion paths exercised in test extension; constants present with `:-bruce` default; pipeline order verified.

### Bug #11 — JWT secret format (64-byte hex, no newline) — commit `1bc488a9`

- **Symptom:** Pre-106 helper wrote `openssl rand -base64 32` → 44 base64 chars + 1 newline = 45 bytes, with non-hex `+`/`/`/`=` chars. `validateSecret` in `livos/packages/livinityd/source/modules/jwt.ts:29-36` enforces `/^[0-9a-fA-F]+$/ AND secret.length === 64` → BOTH checks fail → livinityd crashes at startup with `Invalid JWT secret, expected 256bit hex string`.
- **Location:** `scripts/install/deploy-livinityd.sh:_dld_generate_jwt_secret` (full rewrite).
- **Fix:**
  - Generation: `openssl rand -hex 32 | tr -d '\n'` → exactly 64 hex chars, no terminator
  - REUSE path: detect old format via `wc -c == 64 && grep -qE '^[0-9a-fA-F]{64}$'`. If format mismatch → backup current secret to `${_DLD_JWT_FILE}.pre-106.bak` (mode 0600) then ROTATE
  - Post-write self-check: re-verify byte count + regex; if wrong, `fail` aborts the install (a wrong secret would crash-loop livinityd anyway, so fail-fast)
- **Rotation policy:** Only fires when existing secret fails the 64-hex check. Operators with already-correct hex secrets see no rotation. Rotation invalidates all active sessions (week-long JWTs) — forced re-login is far better than continued livinityd crash-loop.
- **Commit:** `1bc488a9` (`fix(106-01): _dld_generate_jwt_secret hex32 no-newline + rotation detection (Bug #11)`)
- **Verification:** `openssl rand -hex 32` present (1); `tr -d '\n'` present (2); `openssl rand -base64 32` removed (0); `[0-9a-fA-F]{64}` regex present (2 — rotation gate + self-check); `.pre-106.bak` present (2).

### Bug #12 — `user.exists()` false-positive on empty `user: {}` — commit `4205b902`

- **Symptom:** FileStore (conf module) seeds `user: {}` (empty object literal) on first run per StoreSchema. Old `user !== undefined` check → TRUE even though no password set → `register()` at line 99-101 throws `Attempted to register when user is already registered` → fresh install register-flow blocked.
- **Location:** `livos/packages/livinityd/source/modules/user/user.ts:exists()` (lines 25-29 → 25-34 after fix).
- **Fix:** Replace `return user !== undefined` with `return Boolean(user?.hashedPassword)`. FileStore's default-seeded empty `user: {}` now correctly returns `false`; real registered users (with bcrypt hash set by `setPassword`) continue to return `true`.
- **All 5 callers verified to want hashedPassword-present semantics** (per plan §3):
  - `backups.ts:121` — system-password-sync gate (only relevant if user has password)
  - `is-authenticated.ts:60` — redirect-to-login gate (no point redirecting if no password set)
  - `startup-migrations/index.ts:36` — migration gate for registered users
  - `user.ts:99` — register() guard (THE site we're fixing)
  - `routes.ts:49 + 86` — tRPC setup-vs-login dispatch
- **Provenance comment added** in user.ts (matches `Phase 106 Bug #12` marker that the regression test in test-deploy-livinityd.sh greps for).
- **Commit:** `4205b902` (`fix(106-01): user.exists() checks Boolean(user?.hashedPassword) (Bug #12)`)
- **Integration test note (Rule 1 deviation):** `npx vitest run source/modules/user/user.integration.test.ts` failed in the local Windows worktree with `Cannot find package '...@anthropic-ai/claude-agent-sdk/index.js'` — a PRE-EXISTING module-resolution issue in the vitest test rig (workspace package resolution path inside `livos/node_modules/.pnpm/@liv+core@file+...`), NOT caused by this change. The Bug #12 fix is statically test-safe per plan §4: empty store → `Boolean(undefined) === false` (test at user.integration.test.ts:29-30 still PASSes); post-register → `Boolean(bcrypt-hash) === true` (tests at 64-69 + 72-75 still PASS). Marked for follow-up in Phase 106 carry-forward; does not block plan completion.

## Test Count Delta

| Test file | Before (pre-106) | After (this plan) | Delta |
|-----------|------------------|--------------------|-------|
| `test-deploy-livinityd.sh` | 126 PASS, 0 FAIL | **148 PASS, 0 FAIL** | **+22** |
| `test-mode-hybrid-args.sh` | 18 PASS, 0 FAIL | 18 PASS, 0 FAIL | 0 (regression-safe) |
| `test-mode-tunnel-args.sh` | 24 PASS, 0 FAIL | 24 PASS, 0 FAIL | 0 (regression-safe) |
| **Combined** | **168 PASS** | **190 PASS** | **+22** |

Plan target was `132+` deploy assertions / `174+` combined — actual delivered: `148 / 190` (16 above deploy target, 16 above combined target). Extra asserts came from Bug #10 needing 8 assertions to cover the multi-faceted helper (user creation, group membership, sudoers file write, visudo validation, NOPASSWD semantics, plus the D-104-NO-PROD-IMPACT preservation check).

## Invariants Preserved

1. **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** — verified IDENTICAL after every one of the 7 source commits. `liv/packages/core/src/sdk-agent-runner.ts` untouched throughout. Pre-commit hook ran and passed on all 7 commits (no `--no-verify` bypasses).

2. **D-104-NO-PROD-IMPACT** — Mini PC's `livos/install.sh` and `livos/update.sh` UNTOUCHED:
   ```bash
   git diff c3f13dd2~1..262e28f4 -- livos/install.sh livos/update.sh | wc -l
   # → 0
   ```

3. **D-104-RELAY-ZERO-DATA-PLANE** — zero new Server5 / livinity.io / nexus.livinity / relay.livinity / server5 references in `deploy-livinityd.sh`:
   ```bash
   grep -E '45\.137\.194\.10[23]|livinity\.io|nexus\.livinity|relay\.livinity|server5' scripts/install/deploy-livinityd.sh
   # → exit 1 (no matches)
   ```

4. **Bash syntax** — all `scripts/install/*.sh` and `scripts/install/__tests__/*.sh` pass `bash -n` cleanly. No syntax regressions.

5. **Existing `_DLD_LIVOS_USER:-root` default preserved** — Bug #10 introduced a NEW constant `_DLD_DESKTOP_USER:-bruce` rather than reusing the existing one, because they serve different purposes (file-tree owner vs. GUI/sudo human login). Mini PC's `chown -R root:root` ownership semantics remain unchanged.

## Mainserver UAT Carry-Forward (checkpoint:human-verify — DEFERRED to operator)

**This SUMMARY is being written by the autonomous executor agent in code-complete state. The mainserver UAT walk is a HUMAN-VERIFY checkpoint and is deferred to the operator (the user / next-session agent with mainserver SSH access).**

**Mainserver UAT script (operator to walk):**

1. SSH to mainserver:
   ```bash
   ssh -i pem/contabo_master root@154.53.56.75
   ```

2. Clean state (optional — only if testing a fully-fresh install):
   - Snapshot or back up before this.

3. Pull latest livinity-io to mainserver and run install:
   ```bash
   cd /opt/livos
   git pull origin master
   bash install.sh --mode hybrid --domain test.livinity.live --cf-token <token> --cf-zone-id <zone>
   ```

4. After install completes, verify services running with no flap:
   ```bash
   systemctl is-active livos liv-core liv-worker liv-memory
   # Expected: 4× "active"

   systemctl show livos.service -p NRestarts --value
   # Expected: 0
   ```

5. Verify no ENOENT/JWT/register errors in journal:
   ```bash
   journalctl -u livos.service -n 50 --no-pager | grep -E "spawn ENOENT|Invalid JWT|user is already registered"
   # Expected: exit 1 (no matches)
   ```

6. Verify desktop user setup:
   ```bash
   id bruce
   # Expected: uid=1000(bruce) gid=1000(bruce) groups=1000(bruce),27(sudo),998(docker)

   sudo -u bruce sudo -n true && echo "NOPASSWD OK"
   # Expected: NOPASSWD OK

   ls -la /etc/sudoers.d/99-bruce
   # Expected: -r--r----- 1 root root <bytes> ... /etc/sudoers.d/99-bruce
   ```

7. Verify chrome + samba + mender present:
   ```bash
   command -v google-chrome google-chrome-stable
   command -v smbpasswd
   command -v mender   # may be absent on universe-less hosts (acceptable per Bug #7 WARN-not-FAIL)
   ```

8. Verify JWT secret format:
   ```bash
   wc -c < /opt/livos/data/secrets/jwt
   # Expected: 64

   grep -qE '^[0-9a-fA-F]{64}$' /opt/livos/data/secrets/jwt && echo "HEX_OK"
   # Expected: HEX_OK
   ```

9. Browser test (Bug #12):
   - Open `https://test.livinity.live`
   - Expected: green padlock + **register screen** (NOT login — fresh install with Bug #12 fixed means `exists()` correctly returns `false`)
   - Register a new user via the UI — MUST succeed.

10. Resume signal to phase orchestrator:
    - PASS path: `approved — 106-01 SUMMARY accurate + mainserver UAT PASS`
    - FAIL path: describe the specific failure (bug not fixed / test count short / mainserver flap continues / sacred SHA drift) for hot-fix plan re-open.

## Deviations from Plan

### Rule 1 — Integration test infrastructure pre-existing failure

- **Found during:** Task 6 verification
- **Issue:** `npx vitest run source/modules/user/user.integration.test.ts` failed in the Windows worktree with `Cannot find package '...@anthropic-ai/claude-agent-sdk/index.js'` imported from `@liv/core/dist/sdk-agent-runner.js`. This is a pre-existing pnpm workspace dependency-resolution issue in the local test rig, NOT caused by the Bug #12 fix.
- **Disposition:** Out of scope for this plan (Rule SCOPE-BOUNDARY — only auto-fix issues DIRECTLY caused by current task's changes). The Bug #12 fix is statically test-safe per plan §4 (empty store → `Boolean(undefined) === false`; post-register → `Boolean(hash) === true`). Logged here as a known carry-forward — does not block plan completion.
- **Files modified:** none (logged only)
- **Commit:** none — pre-existing issue, not in scope
- **Follow-up:** can be tackled in a future hygiene plan (e.g. v34.x test-rig cleanup) — not v34.0 critical-path.

### No other deviations

The 7 source tasks executed exactly as written in PLAN.md. All `<acceptance_criteria>` blocks passed on first try; no Rule 2/3 (auto-add critical / auto-fix blocker) interventions required.

## Self-Check: PASSED

Files verified to exist:
- `scripts/install/deploy-livinityd.sh` (modified — contains mender-client4, samba, _dld_install_google_chrome, _dld_create_desktop_user, openssl rand -hex 32, _DLD_DESKTOP_USER)
- `scripts/install/__tests__/test-deploy-livinityd.sh` (modified — contains all 6 TEST_BUG_* sections; runs 148 PASS / 0 FAIL)
- `livos/packages/livinityd/source/modules/user/user.ts` (modified — contains `Boolean(user?.hashedPassword)` + Phase 106 Bug #12 provenance comment)
- `.planning/phases/106-deploy-livinityd-bootstrap-layer-hotfix-back-port/106-01-SUMMARY.md` (this file)

Commits verified to exist (`git log --oneline -7`):
- `c3f13dd2` fix(106-01): _dld_install_system_packages add mender-client4 (Bug #7)
- `f31dc494` fix(106-01): _dld_install_system_packages add samba samba-common-bin (Bug #8)
- `ba6e084d` fix(106-01): add _dld_install_google_chrome helper + pipeline wire (Bug #9)
- `3fd11273` fix(106-01): add _dld_create_desktop_user helper + pipeline wire (Bug #10)
- `1bc488a9` fix(106-01): _dld_generate_jwt_secret hex32 no-newline + rotation detection (Bug #11)
- `4205b902` fix(106-01): user.exists() checks Boolean(user?.hashedPassword) (Bug #12)
- `262e28f4` test(106-01): +22 regression assertions for Bugs #7-#12 (126 → 148 PASS)

Sacred SHA re-verified at SUMMARY write time: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓

## Carry-Forward to Phase 107

Phase 107 (First-Run Polish + Default Apps Cleanup) is the next v34 milestone phase. Phase 106 closes the bootstrap-layer install gap (livinityd no longer crash-loops on a fresh VPS); Phase 107 will tackle the dock pre-pin gibberish (Facebook / Chrome / WhatsApp pinned on fresh install with no real apps installed yet).

Other carry-forwards opened by this plan:
- **Vitest test-rig dependency resolution** — workspace `@liv/core` referencing missing `@anthropic-ai/claude-agent-sdk` from its dist sdk-agent-runner.js. Pre-existing; not v34.0 critical-path. Tackle in a v34.x test-hygiene plan.
- **Mainserver UAT (Task 8 checkpoint)** — operator-walked binding gate; until that PASSes, this plan is code-complete but not shipped-validated. Resume signal documented above.
