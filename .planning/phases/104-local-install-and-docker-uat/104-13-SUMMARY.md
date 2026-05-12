---
phase: 104
plan: "13"
subsystem: install-scripts
tags: [install, deploy-livinityd, pnpm, npmrc, baileys, libsignal, hotfix]
type: hotfix
requires:
  - 104-12 (path-bug fix + liv-stack — last-known good deploy-livinityd.sh baseline)
provides:
  - scripts/install/deploy-livinityd.sh (EDIT) — new `_dld_write_pnpm_npmrc` helper + pipeline wiring between clone and build
  - scripts/install/__tests__/test-deploy-livinityd.sh (EDIT) — TEST 15 (5 new assertions) covering helper definition, literal directive, target path, idempotency, call order
affects:
  - scripts/install/deploy-livinityd.sh (1 new helper + pipeline insertion + header comment update)
  - scripts/install/__tests__/test-deploy-livinityd.sh (66 → 71 assertions)
tech-stack:
  added: []
  patterns:
    - "Write /opt/livos/.npmrc with `block-exotic-subdeps=false` BEFORE pnpm install — relaxes pnpm 11+'s default supply-chain check so the legitimate baileys → libsignal git-repository subdep installs cleanly."
    - "Idempotent .npmrc append — helper greps for existing `^block-exotic-subdeps=` line and short-circuits with `ok` log when present; only appends when absent."
key-files:
  created:
    - .planning/phases/104-local-install-and-docker-uat/104-13-PLAN.md (Commit 1)
    - .planning/phases/104-local-install-and-docker-uat/104-13-SUMMARY.md (this file)
  modified:
    - scripts/install/deploy-livinityd.sh (Commit 1 — new helper + pipeline call + header comment update)
    - scripts/install/__tests__/test-deploy-livinityd.sh (Commit 2 — TEST 15 added)
    - .planning/STATE.md (Commit 2 — Phase 104 plan count 12 → 13 + 104-13 status block)
    - .planning/ROADMAP.md (Commit 2 — Phase 104 plan row 104-13 added)
decisions:
  - "D-104-13-RELAX-EXOTIC-SUBDEPS: relax pnpm's blockExoticSubdeps gate at install time rather than vendoring libsignal or pinning baileys. Rationale: the alternative paths (vendoring, version pinning) need substantive research and likely a separate libsignal-client port — out of scope for a 2-commit hotfix. The gate is meant to catch typo-squat / takeover risk on git-resolved subdeps; in our tree, the only git-resolved subdep is the known-good upstream libsignal that ships with baileys."
  - "D-104-13-SECURITY-TRADEOFF: setting block-exotic-subdeps=false relaxes the gate for ALL git-resolved subdeps in the tree, not just libsignal. Deferred audit: (a) review every git-resolved subdep in pnpm-lock.yaml, (b) pin baileys to a libsignal-free version when one becomes available, (c) consider switching to npm-published libsignal-client wrapper so the gate can be re-enabled. Tracked in the helper's source comment + this SUMMARY."
  - "D-104-13-IDEMPOTENT-APPEND: helper greps for existing directive before appending — no double-write on re-run. Rationale: install.sh is supposed to be re-runnable; if the operator runs install.sh twice (e.g. to pick up a Caddy fix) we must not produce a malformed .npmrc with two `block-exotic-subdeps=` lines."
  - "Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits (verified via `git hash-object` post each commit)."
metrics:
  duration: "~20min"
  completed: "2026-05-12T00:00:00.000Z"
  commits: 2
  tests_added: 5
  test_files: 1
  source_files: 1
  helper_functions: 1
---

# Phase 104 Plan 13: pnpm blockExoticSubdeps hotfix for deploy-livinityd.sh Summary

Hotfix for the second mainserver `154.53.56.75` re-deploy failure on Plan 104-12's `deploy-livinityd.sh`. pnpm 11.1.1 (installed via `npm install -g pnpm@latest` on modern Ubuntu 24.04) enforces the `blockExoticSubdeps` supply-chain check by default. The check refuses to install `libsignal`, which `baileys@6.7.21` (Phase 25 WhatsApp integration) pulls in via a `git-repository` URL:

```
[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "libsignal" (resolved via git-repository)
is not allowed in subdependencies when blockExoticSubdeps is enabled
This error happened while installing the dependencies of @liv/core@1.0.0
 at baileys@6.7.21
[FAIL]  pnpm install failed
```

The Mini PC (older pnpm without the gate) is unaffected; the deploy-livinityd.sh path on fresh Ubuntu hits this every time.

## Fix

New helper `_dld_write_pnpm_npmrc` in `scripts/install/deploy-livinityd.sh` writes `block-exotic-subdeps=false` to `/opt/livos/.npmrc` before pnpm install runs. The helper:

1. Targets `${_DLD_LIVOS_DIR}/.npmrc` (i.e. `/opt/livos/.npmrc` — pnpm's project-level config file location).
2. Is idempotent — greps for an existing `^block-exotic-subdeps=` line and short-circuits with an `ok` log when present.
3. Is wired into `deploy_livinityd` AFTER `_dld_clone_source` (so `/opt/livos/` exists) and BEFORE `_dld_build_packages` (so pnpm sees the file at install time).
4. Carries a security-note comment block in its header documenting the supply-chain tradeoff and listing the deferred audit checklist.

## Security tradeoff (explicit)

Setting `block-exotic-subdeps=false` relaxes pnpm's supply-chain safety for **ALL** git-resolved subdeps in the dep tree — not just the `libsignal` one we actually need. The gate exists to catch typo-squat and repo-takeover attacks on git-resolved subdeps. We accept the relaxation because:

- In our `pnpm-lock.yaml`, the only currently git-resolved subdep is the known-good upstream `libsignal` that ships with `baileys` (Phase 25 WhatsApp).
- Re-enabling the gate would require either vendoring `libsignal`, pinning `baileys` to a `libsignal`-free version (none currently available), or switching to the npm-published `libsignal-client` package — substantive work outside this hotfix's scope.

**Deferred audit checklist** (production review before scaling install.sh to more hosts):

- [ ] Walk every git-resolved subdep in `pnpm-lock.yaml`, confirm each is the known-good upstream (no typo-squat / takeover signal).
- [ ] Pin `baileys` to a `libsignal`-free version when one becomes available, OR adopt npm-published `libsignal-client` as a drop-in.
- [ ] Re-enable `blockExoticSubdeps` once the tree has zero git-resolved subdeps.

## Test results

- `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 71 PASS, 0 FAIL (66 prior + 5 new TEST 15 assertions for helper definition, literal directive, target path, idempotency, call order).
- `bash scripts/install/__tests__/test-mode-hybrid-args.sh` → 18 PASS, 0 FAIL (104-08 regression smoke).
- `bash scripts/install/__tests__/test-mode-tunnel-args.sh` → 24 PASS, 0 FAIL (104-09 regression smoke).
- **Combined: 18 + 24 + 71 = 113 PASS across 3 test files** (up from 108 after 104-12).

## Sacred SHA

`liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits (verified via `git hash-object` post each commit).

## Deviations

None. Two-commit hotfix landed exactly as planned:

- **Commit 1 — `fix(104-13)`:** `scripts/install/deploy-livinityd.sh` (new `_dld_write_pnpm_npmrc` helper + pipeline wire + header comment update) + `.planning/phases/104-local-install-and-docker-uat/104-13-PLAN.md`.
- **Commit 2 — `docs(104-13)`:** test extension (TEST 15) + SUMMARY + STATE + ROADMAP.

## Carry-forward

- **mainserver `154.53.56.75` re-deploy** is the orchestrator's NEXT step. Re-run `bash install.sh --mode hybrid --domain test.livinity.live --cf-token X --cf-zone-id Y` and confirm: pnpm install succeeds (no more `[ERR_PNPM_EXOTIC_SUBDEP]`); all 4 systemd services active (`systemctl is-active livos liv-core liv-worker liv-memory` returns 4× `active`); `https://test.livinity.live` shows the LivOS login screen. **This remains the GO/NO-GO gate for closing Phase 104.**
- **Deferred audit** (see Security tradeoff section above) is tracked here, not promoted to a near-term plan — orthogonal to the install.sh ship path.

## Self-Check: PASSED

- `scripts/install/deploy-livinityd.sh` modified — present at HEAD.
- `scripts/install/__tests__/test-deploy-livinityd.sh` modified — present at HEAD, 71 PASS.
- `.planning/phases/104-local-install-and-docker-uat/104-13-PLAN.md` created — present at HEAD.
- Sacred SHA verified `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- Commit 1 hash recorded below post-commit.
