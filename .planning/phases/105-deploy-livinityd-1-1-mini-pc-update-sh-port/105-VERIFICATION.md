---
status: human_needed
date: 2026-05-12
phase: 105
score: 7/8 autonomous must-haves verified; must-have #8 (live VPS UAT walk) operator-deferred per Plan 105-04 autonomous=false
re_verification: false
note: |
  All 7 autonomous must-haves verified GREEN. Plan 105-04 declares
  autonomous=false and explicitly defers the Task 2 operator walk to the
  human. UAT-EVIDENCE/ directory contains only .gitkeep (zero captured
  evidence). Status `human_needed` reflects the live VPS UAT walk gate.
human_verification:
  - test: "Run UAT-CHECKLIST.md GO-NO-GO-1 through GO-NO-GO-5 on a fresh Ubuntu 24.04 VPS"
    expected: "All 5 criteria PASS — 4 systemd services active, login HTML returned, green padlock, sacred SHA preserved on host, update.sh re-run idempotent"
    why_human: "Requires a fresh paid VPS, real CF credentials, browser-side green-padlock screenshot verification, and operator judgement that cannot be automated"
  - test: "Populate .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/ with systemctl output + curl headers + screenshot + git hash-object output + update.sh re-run log"
    expected: "Directory contains the 5 evidence artifacts referenced by UAT-CHECKLIST.md"
    why_human: "Evidence is captured live on the operator's VPS and uploaded by the operator"
overrides: []
---

# Phase 105: deploy-livinityd 1:1 Mini-PC update.sh Port — Verification Report

**Phase Goal:** Replace `scripts/install/deploy-livinityd.sh` with a faithful 1:1 port of Mini PC's production-tested `update.sh`. Live test on fresh Ubuntu 24.04 VPS produces working LivOS UI + green TLS + 4 active systemd services.

**Verified:** 2026-05-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `deploy-livinityd.sh` contains every step from `update.sh` (helper names traceable to mapping table) | ✓ VERIFIED | 19 `_dld_*` helpers extracted (lines 82-951), file grew 703 → 1038 lines |
| 2 | All 7 first-install-only helpers preserved (PG, Redis, JWT, .env, npmrc, system pkgs, Caddy reload) | ✓ VERIFIED | `_dld_setup_postgres` (L126), `_dld_setup_redis` (L201), `_dld_generate_jwt_secret` (L604), `_dld_write_env_file` (L619), `_dld_write_pnpm_npmrc` (L423), `_dld_install_system_packages` (L82), `_dld_update_caddy_to_livinityd` (L833) — all present |
| 3 | `--exclude='docker/'` unanchored bug FIXED (now `/docker/`) | ✓ VERIFIED | 3 anchored `/docker/` occurrences, 0 unanchored — bug eliminated |
| 4 | `test-deploy-livinityd.sh` PASS count ≥ 115 | ✓ VERIFIED | **117 PASS / 0 FAIL** — target exceeded by 2 |
| 5 | Combined regression 18 + 24 + 117 = 159 PASS across 3 test files | ✓ VERIFIED | `test-mode-hybrid-args.sh`: 18 PASS / 0 FAIL. `test-mode-tunnel-args.sh`: 24 PASS / 0 FAIL. `test-deploy-livinityd.sh`: 117 PASS / 0 FAIL. **Total: 159 PASS, 0 FAIL** |
| 6 | `update.sh` source UNCHANGED in this phase | ✓ VERIFIED | `git diff 78863ae0..HEAD -- update.sh` returns 0 lines |
| 7 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved | ✓ VERIFIED | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (exact match) |
| 8 | Live VPS UAT (Plan 105-04 Task 2 operator walk) | ⏸ DEFERRED | Plan 105-04 declares `autonomous: false`, summary status `checkpoint_human_action`. UAT-EVIDENCE/ contains only `.gitkeep`. Operator walk pending. |

**Score:** 7/7 autonomous truths verified + 1 operator-deferred truth pending = **human_needed**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/install/deploy-livinityd.sh` | 1:1 update.sh port, ~1000 lines, 19 helpers | ✓ VERIFIED | 1038 lines, 19 `_dld_*` helpers, `bash -n` exit 0 |
| `scripts/install/__tests__/test-deploy-livinityd.sh` | ≥115 assertions | ✓ VERIFIED | 879 lines, 117 PASS / 0 FAIL |
| `scripts/install/__tests__/test-mode-hybrid-args.sh` | 18 PASS regression | ✓ VERIFIED | 18 PASS / 0 FAIL |
| `scripts/install/__tests__/test-mode-tunnel-args.sh` | 24 PASS regression | ✓ VERIFIED | 24 PASS / 0 FAIL |
| `.planning/phases/105-*/UAT-CHECKLIST.md` | Scaffolded GO/NO-GO walk doc | ✓ VERIFIED | Present, contains GO-NO-GO-1..5 |
| `.planning/phases/105-*/UAT-EVIDENCE/` | Populated post-operator-walk | ⏸ DEFERRED | Only `.gitkeep` — operator walk not yet executed |
| `update.sh` (canonical reference) | Unchanged this phase | ✓ VERIFIED | 0 diff lines vs phase base `78863ae0` |
| `liv/packages/core/src/sdk-agent-runner.ts` | Sacred SHA preserved | ✓ VERIFIED | SHA matches `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `_dld_verify_build` (L445) | called by `_dld_build_packages` + `_dld_build_liv_packages` | direct function call | ✓ WIRED (1 def, 7 call/refs) |
| `_dld_update_gallery_cache` | invoked in post-build pipeline | function call | ✓ WIRED (2 occurrences) |
| `_dld_install_streaming_packages` (G2) | ydotoold systemd unit heredoc | inline `cat > /etc/systemd/system/ydotoold.service` | ✓ WIRED (13 ydotoold references — function + heredoc + enable) |
| `_dld_cleanup_temp_dir` | invoked at script tail | trap/explicit call | ✓ WIRED (2 occurrences referencing `_DLD_TEMP_DIR`) |
| `.deployed-sha` | written post-build for idempotency check | `_dld_*` helper | ✓ WIRED (10 occurrences across helper + check) |
| `JWT_SECRET` / `_dld_generate_jwt_secret` | bootstraps secret only on first install | conditional in env-write helper | ✓ WIRED (3 occurrences) |

### Anti-Patterns Found

None blocking. No TODO/FIXME/placeholder/stub patterns in the modified install script. All helpers are substantive (multi-line, real commands, no `return null` / no-op stubs).

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| P105-PORT (1:1 update.sh parity) | 105-01, 105-02 | ✓ SATISFIED | 19 helpers ported, G2-G9 gaps closed, anchored exclude fix |
| P105-TEST (≥115 assertions) | 105-03 | ✓ SATISFIED | 117 PASS / 0 FAIL |
| P105-UAT (live VPS walk) | 105-04 | ⏸ DEFERRED | Plan declares autonomous=false; UAT-CHECKLIST scaffolded; evidence dir empty |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| deploy-livinityd.sh syntax valid | `bash -n scripts/install/deploy-livinityd.sh` | exit 0 | ✓ PASS |
| Main test suite green | `bash test-deploy-livinityd.sh \| tail -3` | "117 PASS, 0 FAIL" | ✓ PASS |
| Hybrid args regression green | `bash test-mode-hybrid-args.sh \| tail -3` | "18 PASS, 0 FAIL" | ✓ PASS |
| Tunnel args regression green | `bash test-mode-tunnel-args.sh \| tail -3` | "24 PASS, 0 FAIL" | ✓ PASS |
| update.sh source untouched | `git diff 78863ae0..HEAD -- update.sh \| wc -l` | 0 | ✓ PASS |
| Sacred SHA preserved | `git hash-object liv/.../sdk-agent-runner.ts` | `f3538e1d8...` | ✓ PASS |
| End-to-end live install on Ubuntu 24.04 VPS | bash install.sh --mode hybrid --domain X --cf-token Y --cf-zone-id Z | not yet executed | ? SKIP (needs real VPS — routed to human verification) |

### Human Verification Required

#### 1. Live VPS UAT walk (Plan 105-04 Task 2)

**Test:** Provision a fresh Ubuntu 24.04 VPS (or reuse cleaned `mainserver 154.53.56.75` per RESEARCH §8 R8 caveat), run `bash install.sh --mode hybrid --domain <yours> --cf-token <yours> --cf-zone-id <yours>`, then walk UAT-CHECKLIST.md GO-NO-GO-1 through GO-NO-GO-5.

**Expected:**
- GO-NO-GO-1: `systemctl is-active livos liv-core liv-worker liv-memory` → all 4 print `active`
- GO-NO-GO-2: `curl -sk https://<domain>/` returns LivOS login HTML (not Caddy placeholder, not 502, not build-error page)
- GO-NO-GO-3: Browser shows green padlock + LivOS UI renders (operator screenshot)
- GO-NO-GO-4: `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` on the host → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- GO-NO-GO-5: Re-running `bash /opt/livos/update.sh` on the same box succeeds idempotently (proves parity)

**Why human:** Requires real paid VPS, real CF DNS credentials, browser-side green-padlock visual verification, and operator GO/NO-GO judgement that cannot be automated. Plan 105-04 explicitly declares `autonomous: false` for this exact reason.

#### 2. Populate UAT-EVIDENCE/

**Test:** After walk 1, copy systemctl output, curl headers, screenshot, hash-object output, and update.sh re-run log into `.planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/`.

**Expected:** Directory no longer contains only `.gitkeep` — contains the 5 evidence artifacts referenced by UAT-CHECKLIST.md.

**Why human:** Evidence is captured live on the operator's VPS by the operator.

### Gaps Summary

**No code/test gaps.** All 7 autonomous must-haves verified GREEN:
- 1:1 update.sh port complete (19 helpers, 1038 lines)
- 117 PASS / 0 FAIL on primary test suite (≥115 target met)
- 159 PASS / 0 FAIL combined across 3 test files
- update.sh source untouched (0 diff lines)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- Anchored `/docker/` bug fixed (0 unanchored occurrences remaining)
- `_dld_verify_build` helper extracted and wired into 2+ call sites
- G2-G9 update.sh parity gaps closed (streaming pkgs, ydotoold unit, atomic self-rsync, gallery cache, chown/chmod, temp cleanup, .deployed-sha, UI rm -rf dist)

**Remaining gate:** Operator must walk UAT-CHECKLIST.md on a real VPS and populate UAT-EVIDENCE/. Until that happens, milestone status remains **code-complete pending UAT**, not **shipped**. This deferral is INTENTIONAL — Plan 105-04 declares `autonomous: false` because the live walk requires resources (paid VPS, CF credentials) and judgement (visual verification) that cannot be safely automated by an agent.

### Verification Checks Detail

```text
Check 1: All 3 test suites green
  test-deploy-livinityd.sh:    117 PASS, 0 FAIL  ✓
  test-mode-hybrid-args.sh:     18 PASS, 0 FAIL  ✓
  test-mode-tunnel-args.sh:     24 PASS, 0 FAIL  ✓

Check 2: Sacred SHA
  git hash-object liv/packages/core/src/sdk-agent-runner.ts
  = f3538e1d811992b782a9bb057d1b7f0a0189f95f  ✓ (exact match)

Check 3: update.sh diff
  git diff 78863ae0..HEAD -- update.sh | wc -l = 0  ✓

Check 4: bash -n
  bash -n scripts/install/deploy-livinityd.sh → exit 0  ✓

Check 5: Anchored docker exclude
  grep -c "exclude='/docker/'" = 3   (anchored, present)  ✓
  grep -c "exclude='docker/'"  = 0   (unanchored, absent) ✓

Check 6: _dld_verify_build
  definitions: 1  ✓
  call/refs:   7  ✓ (≥2 required)

Check 7: ydotoold references
  count: 13  ✓ (≥3 required: function name + heredoc + enable)

Check 8: gallery cache
  count: 2  ✓ (≥1 required)

Check 9: chown/chmod helpers
  count: 7  ✓ (≥2 required)

Check 10: temp cleanup
  count: 2  ✓ (≥1 required)
```

### Commits Verified

```
59899db9 docs(105-04): SUMMARY — UAT-CHECKLIST scaffold complete, Task 2 checkpoint deferred to operator
3179733e docs(105-04): UAT-CHECKLIST scaffold + evidence dir
3ba5e698 docs(105-03): SUMMARY — extend test harness with 38 new assertions across 21 TEST blocks
535e4f3c test(105-03): extend test-deploy-livinityd.sh with TESTs 17-32e
19f01fbc docs(105-02): SUMMARY — close G2-G9 update.sh parity gaps in deploy-livinityd
f6406f44 feat(105-02): port G5 gallery + G6 chown/chmod + G7 cleanup + G9 .deployed-sha
2bef633d feat(105-02): port G2 streaming pkgs + G3 atomic self-rsync + G8 UI rm -rf dist
b377d785 docs(105-01): SUMMARY — refactor + helper extraction + anchored exclude
82ff6b6b test(105-01): add TEST 16 + TEST 19 + TEST 31 assertions for refactor
290885bc refactor(105-01): extract _dld_verify_build + anchor docker exclude + reorder pipeline
```

All commits match the phase context commit ranges (105-01 `290885bc..b377d785`, 105-02 `2bef633d..19f01fbc`, 105-03 `535e4f3c..3ba5e698`, 105-04 `3179733e..59899db9`).

---

_Verified: 2026-05-12_
_Verifier: Claude (gsd-verifier)_
