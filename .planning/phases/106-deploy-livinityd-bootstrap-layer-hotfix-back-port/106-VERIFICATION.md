---
status: human_needed
phase: 106
verified: 2026-05-12
must_haves_total: 11
must_haves_passed: 11
must_haves_failed: 0
human_verification:
  - description: "operator-walked mainserver 154.53.56.75 re-install — confirm no manual hotfix needed after fresh install"
    expected: "all 5 services active + livinityd NRestarts ≤ 3 + register/login UI works + 168→174+ PASS combined"
gaps: []
---

# Phase 106: deploy-livinityd Bootstrap-Layer Hotfix Back-Port — Verification Report

**Phase Goal:** Back-port 6 in-scope deploy bugs (Bugs #7-#12) into `deploy-livinityd.sh` + `user.ts` so fresh-VPS installs are byte-equivalent to manually-hotfixed mainserver `154.53.56.75` state.

**Verified:** 2026-05-12
**Status:** human_needed (all 11 automated must-haves PASS; mainserver UAT walk deferred per plan Task 8 `checkpoint:human-verify`)
**Re-verification:** No — initial verification

## Must-Have Verification Table

| #   | Must-Have | Status | Evidence |
| --- | --------- | ------ | -------- |
| 1   | Bug #7 — `mender-client4` WARN-not-FAIL group | ✓ PASS | `deploy-livinityd.sh:130` — `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mender-client4 ... \|\| warn "..."` (5 mentions in helper) |
| 2   | Bug #8 — `samba samba-common-bin` in main apt array | ✓ PASS | `deploy-livinityd.sh:122` — `samba samba-common-bin` inside `_dld_install_system_packages` apt array |
| 3   | Bug #9 — `_dld_install_google_chrome` defined + wired | ✓ PASS | Helper defined at L572; wired between streaming (L1304) and docker_images (L1306) at L1305 |
| 4   | Bug #10 — `_dld_create_desktop_user` (uid=1000, sudo+docker, 0440, visudo -cf) | ✓ PASS | Helper at L276-340; uid=`_DLD_DESKTOP_UID:-1000`; `useradd -m -u`; `usermod -aG sudo,docker`; `chmod 0440`; `visudo -cf` validates tmp before mv |
| 5   | Bug #11 — JWT uses `openssl rand -hex 32` + `tr -d '\n'`, NOT base64 | ✓ PASS | L865 active code: `openssl rand -hex 32 \| tr -d '\n' > "$_DLD_JWT_FILE"`; only L830 `base64` reference is in comment (historical doc); regex `[0-9a-fA-F]{64}` present in rotation gate (L849) + self-check (L870) |
| 6   | Bug #12 — `user.exists()` returns `Boolean(user?.hashedPassword)` | ✓ PASS | `user.ts:34` — `return Boolean(user?.hashedPassword)`; provenance comment L26-31 references Phase 106 Bug #12 |
| 7   | `test-deploy-livinityd.sh` ≥ 132 PASS, 0 FAIL | ✓ PASS | Live run: **148 PASS, 0 FAIL** (16 above target) |
| 8   | Combined static tests ≥ 174 PASS, 0 FAIL | ✓ PASS | Combined: 148 (deploy) + 18 (hybrid) + 24 (tunnel) = **190 PASS, 0 FAIL** (16 above target) |
| 9   | Sacred SHA `f3538e1d8...` preserved | ✓ PASS | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`; verified IDENTICAL across all 8 phase-106 commits (c3f13dd2, f31dc494, ba6e084d, 3fd11273, 1bc488a9, 4205b902, 262e28f4, 2138c51b) |
| 10  | D-104-NO-PROD-IMPACT — `livos/install.sh` + `livos/update.sh` unchanged | ✓ PASS | `git diff 9c66cdb0..HEAD -- livos/install.sh livos/update.sh \| wc -l` → 0 |
| 11  | SUMMARY.md exists | ✓ PASS | `.planning/phases/106-deploy-livinityd-bootstrap-layer-hotfix-back-port/106-01-SUMMARY.md` present (291 lines, frontmatter `status: code-complete-pending-mainserver-uat`) |

**Score:** 11/11 automated must-haves verified

## Pipeline Order Verification (Bug #9 + Bug #10)

Lines 1301-1306 of `deploy_livinityd` confirm correct ordering:
```
1301  _dld_setup_redis
1302  _dld_create_desktop_user          ← Bug #10 (after redis, before clone)
1303  _dld_clone_source
1304  _dld_install_streaming_packages
1305  _dld_install_google_chrome        ← Bug #9 (after streaming, before docker_images)
1306  _dld_setup_docker_images
```

## Behavioral Spot-Checks (Step 7b)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Bash syntax — deploy-livinityd.sh parses cleanly | `bash -n scripts/install/deploy-livinityd.sh` | exit 0 (implied by 148 PASS test run executing helpers) | ✓ PASS |
| test-deploy-livinityd.sh fully exercised | live execution | `148 PASS, 0 FAIL` | ✓ PASS |
| test-mode-hybrid-args.sh regression-safe | live execution | `18 PASS, 0 FAIL` | ✓ PASS |
| test-mode-tunnel-args.sh regression-safe | live execution | `24 PASS, 0 FAIL` | ✓ PASS |
| Sacred SHA at HEAD | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ PASS |

## Anti-Patterns Scan

No blockers. Only finding:
- L830 comment text mentions `openssl rand -base64 32` for historical context (describing the bug being fixed). Active code at L865 uses `openssl rand -hex 32 | tr -d '\n'`. Not a stub, not a regression — comment is provenance documentation.

## Human Verification Required (Task 8 — DEFERRED per plan)

The plan explicitly marks Task 8 as `checkpoint:human-verify`. The mainserver `154.53.56.75` re-install walk is deferred to the human operator.

### 1. Mainserver 154.53.56.75 fresh-install UAT

**Test:**
```bash
ssh -i pem/contabo_master root@154.53.56.75
cd /opt/livos && git pull origin master
bash install.sh --mode hybrid --domain test.livinity.live --cf-token <token> --cf-zone-id <zone>
```

**Expected:**
- 4× `systemctl is-active livos liv-core liv-worker liv-memory` → `active`
- `systemctl show livos.service -p NRestarts --value` → `0` (no flap)
- `journalctl -u livos.service -n 50` → no `spawn ENOENT` / `Invalid JWT` / `user is already registered`
- `id bruce` → `uid=1000(bruce) gid=1000(bruce) groups=...,27(sudo),998(docker)`
- `ls -la /etc/sudoers.d/99-bruce` → `-r--r----- 1 root root`
- `wc -c < /opt/livos/data/secrets/jwt` → `64` AND matches `^[0-9a-fA-F]{64}$`
- Browser at `https://test.livinity.live` → green padlock + **register screen** (not login) → registration succeeds

**Why human:** Requires SSH access to live mainserver + real DNS/Cloudflare creds + browser-driven UX validation; cannot be automated without bricking a production-shaped host.

## Gaps Summary

**No code gaps.** All 11 automated must-haves PASS on first verification. The single outstanding item is the mainserver UAT walk, which is an explicit `checkpoint:human-verify` gate per plan Task 8 — by design, not a gap.

---

_Verified: 2026-05-12_
_Verifier: Claude (gsd-verifier)_
