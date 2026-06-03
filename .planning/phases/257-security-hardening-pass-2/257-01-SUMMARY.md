---
phase: 257-security-hardening-pass-2
plan: 01
subsystem: supply-chain-integrity
tags: [security, supply-chain, update, installer, skills, apt]
requires: []
provides:
  - update.sh verify-before-deploy commit pin (LIVOS-011)
  - update.sh missing-binary-gated apt install (LIVOS-040)
  - verifySkillBundle() MARKETPLACE origin/checksum gate (LIVOS-012)
  - install.sh / livos/install.sh opt-in SHA pin + sha256 logging (LIVOS-026)
affects:
  - update.sh
  - liv/packages/core/src/skill-loader.ts
  - liv/packages/core/src/skill-installer.ts
  - liv/packages/core/src/index.ts
  - install.sh
  - livos/install.sh
  - README.md
tech-stack:
  added: []
  patterns:
    - opt-in-strict guard (warn+proceed when no pin material; fail-closed once a pin/key is shipped)
    - trusted-by-origin vs checksum-verify for downloaded code
key-files:
  created:
    - liv/packages/core/src/skill-signature.ts
    - liv/packages/core/src/skill-signature.test.ts
  modified:
    - update.sh
    - liv/packages/core/src/skill-loader.ts
    - liv/packages/core/src/skill-installer.ts
    - liv/packages/core/src/index.ts
    - install.sh
    - livos/install.sh
    - README.md
decisions:
  - "update.sh + installers use opt-in-strict pinning: warn+proceed when no pin material exists (preserve the current unpinned Mini PC deploy), fail-closed once LIVOS_EXPECTED_SHA / EXPECTED_RELEASE / maintainer.gpg is shipped."
  - "Skill import gate scoped to the MARKETPLACE loadSkillLazy path ONLY; the BUILTIN loadSkill (this.skillsDir) path is trusted-by-origin and left byte-unchanged so first-party bundled skills keep loading (regression guard)."
  - "Registry-of-origin is the only trust signal available today; persist it in InstalledSkillMeta + resolve it from Redis on boot reload so official-registry skills stay trusted across restarts."
  - "apt-install gating only changes the run-condition (missing-binary check); package lists / apt sources unchanged. OS-package version pinning is out of scope (T-257B follow-up)."
metrics:
  duration: ~35m
  tasks: 4
  files_changed: 9
  commits: 4
  completed: 2026-06-03
---

# Phase 257 Plan 01: Supply-chain Integrity (WS-B) Summary

Closed the four WS-B supply-chain findings with verify-before-deploy / verify-before-import
gates that are opt-in-strict (loud now, fail-closed the moment pin material is shipped) so the
current unpinned Mini PC keeps updating and every first-party bundled skill keeps loading.

## What shipped (per finding)

- **LIVOS-011 (update.sh commit-pin):** `livos_verify_fetched_ref()` runs right after the
  `git clone` + `rev-parse HEAD`, BEFORE the first rsync into `/opt/livos` / `/opt/liv`. Resolves
  an expected ref in priority order — env `LIVOS_EXPECTED_SHA` → pin file
  `scripts/install/EXPECTED_RELEASE` (SHA or `refs/tags/<tag>`) → signed-tag `git verify-tag`
  against a shipped `scripts/install/maintainer.gpg`. On mismatch it `fail`s (exit non-zero)
  with "Refusing to deploy …" before any destructive step. When NO pin material exists it warns
  loudly and proceeds (no deploy regression).
- **LIVOS-040 (apt every-run):** the three `apt-get install` blocks (streaming, VAAPI, luse) are
  each wrapped in a `command -v` missing-binary check; when all named binaries are present the
  apt call is skipped with a "streaming/VAAPI/luse deps already present — skipping apt install"
  log. Package lists and apt sources are unchanged — only the run-condition.
- **LIVOS-012 (marketplace import RCE):** new `skill-signature.ts::verifySkillBundle()` — builtin
  origin returns ok immediately (never gated); marketplace origin is ok only when from the pinned
  OFFICIAL registry (derived from the SAME `SKILL_REGISTRY_URL || default` source, normalized like
  `SkillRegistryClient.addRegistry`) or when a SHA-256 of the entry file matches a recorded
  `manifestChecksum` (constant-time compare); otherwise fails closed. `skill-loader.loadSkillLazy`
  (MARKETPLACE path) calls the gate before `await import()` and returns false on `ok===false`.
  `skill-installer` threads `entry.repoUrl` in and persists it in `InstalledSkillMeta`;
  `loadMarketplaceSkills` + `index.ts` re-resolve it from Redis on boot reload. The BUILTIN
  `loadSkill` import at `skill-loader.ts:81` is **left untouched**.
- **LIVOS-026 (curl|bash installer):** `install.sh` (after self-clone, before re-exec) and
  `livos/install.sh` (after clone, before the destructive `rm -rf $LIVOS_DIR` + `cp -a`) log the
  entry-script `sha256sum` and refuse on `LIVOS_INSTALL_EXPECTED_SHA` / `EXPECTED_RELEASE`
  mismatch; warn+proceed when unset. README gained a "Verify before running (recommended)"
  download→verify→run subsection + the pin-env documentation.

## Still-exists verification (current code, at execution time)

| Finding | Re-verified open? | Evidence |
|---------|-------------------|----------|
| LIVOS-011 | YES | `update.sh` `git clone` (was :342) + `LIVOS_UPDATE_TO_SHA=$(… rev-parse HEAD)` (was :344) captured but never compared before rsync. |
| LIVOS-040 | YES | three `DEBIAN_FRONTEND=noninteractive apt-get install -y -qq` blocks ran unconditionally on every run. |
| LIVOS-012 | YES | `skill-loader.ts` marketplace `loadSkillLazy` `const mod = await import(moduleUrl)` had no verification; manifest carries no checksum/registryUrl; no exported official-registry constant. |
| LIVOS-026 | YES | `install.sh` self-clone → `exec bash install.sh`; `livos/install.sh` clone → `cp -a` into /opt, both with zero integrity check. |

## Tests + results

- **skill-signature.test.ts** (tsx + node:assert/strict, sibling to sandbox.test.ts) — RED first
  (module not found), then GREEN. 5/5 PASS:
  1. builtin origin verifies ok without checksum/registry (regression guard — bundled skills load)
  2. official marketplace registry verifies ok (incl. `.git/` normalization)
  3. marketplace bundle with a matching SHA-256 checksum verifies ok
  4. marketplace bundle with a mismatched checksum fails closed
  5. unverifiable marketplace bundle (non-official, no checksum / undefined registry) fails closed
- `tsc --noEmit` on `@liv/core` — **0 errors** (touched skill-loader / skill-signature /
  skill-installer / index all clean).
- `bash -n` clean on `update.sh`, `install.sh`, `livos/install.sh`.
- Verify greps: `update.sh` pin markers = 14; `update.sh` "skipping apt"/`command -v` = 15;
  `install.sh` `LIVOS_INSTALL_EXPECTED_SHA`/`sha256sum` = 6; README "verify before" = 1.

## Builtin-skill regression confirmation

**No regression.** The BUILTIN import site (`skill-loader.ts:81`, `loadSkill` over
`this.skillsDir`) is byte-unchanged — no `verifySkillBundle` call. Only the MARKETPLACE
`loadSkillLazy` path (now :496, gated by the verdict at :481) was touched. Test 1 locks the
invariant that `verifySkillBundle({ origin:'builtin' })` always returns ok. `grep` confirms two
`await import` sites: the builtin one is ungated, the marketplace one is gated.

## Deviations from Plan

### Auto-added critical functionality

**1. [Rule 2 - Missing critical functionality] Boot-reload trust resolution for marketplace skills**
- **Found during:** Task 3
- **Issue:** The plan scoped the gate to `loadSkillLazy`, but a SECOND caller —
  `loadMarketplaceSkills` (index.ts:481, boot-time reload from disk) — also calls `loadSkillLazy`
  with no registry-of-origin. With the gate added, every previously-installed marketplace skill
  (including official-registry ones) would have failed closed on reboot = a live regression of
  the operator's installed skills.
- **Fix:** Persisted `registryUrl: entry.repoUrl` in `InstalledSkillMeta`; added an optional
  `resolveTrust` callback to `loadMarketplaceSkills`; `index.ts` reads `liv:skills:installed:{name}`
  from Redis to re-thread the origin. Official-registry skills stay trusted across restarts;
  genuinely unverifiable bundles correctly fail closed.
- **Files modified:** liv/packages/core/src/skill-loader.ts, skill-installer.ts, index.ts
- **Commit:** a01e2902

**2. [Plan adaptation] livos/install.sh has no re-exec — gate placed before the destructive deploy**
- The plan describes "before re-exec of the cloned entry script". `install.sh` does re-exec, but
  `livos/install.sh` clones then directly `rm -rf $LIVOS_DIR` + `cp -a` (no re-exec). The
  integrity check was placed after the clone and before that destructive `rm -rf` instead, which
  is the equivalent trust boundary. No behavioral deviation from intent.

## TDD Gate Compliance

Task 3 followed RED (module-not-found failure captured) → GREEN (`verifySkillBundle` implemented,
5/5 pass) → loader wiring. The test commit + feature are folded into one atomic per-task commit
(a01e2902) per the plan's one-commit-per-task contract; RED was demonstrated in-session before
GREEN.

## Notes / follow-ups (accepted, out of scope)

- T-257B-05: full signed-tag enforcement is opt-in until a maintainer key + `EXPECTED_RELEASE` are
  shipped in a follow-up commit (flips the guard fail-closed).
- LIVOS-040: OS-package version pinning (apt source pinning) deliberately out of scope — only the
  every-run condition was fixed.
- No deploy performed (257-07 owns deploy). Mini PC only; local code + tests.

## Commits

| SHA | Type | Finding | Description |
|-----|------|---------|-------------|
| f400781d | feat | LIVOS-011 | update.sh verify-before-deploy commit pin |
| 275268bb | perf | LIVOS-040 | update.sh apt installs gated on missing-binary check |
| a01e2902 | feat | LIVOS-012 | MARKETPLACE skill import origin/checksum gate (builtin exempt) |
| 9253a5bf | feat | LIVOS-026 | installer integrity check + verify-then-run docs |

## Self-Check: PASSED

All created files exist (skill-signature.ts, skill-signature.test.ts, 257-01-SUMMARY.md) and all 4 task commits (f400781d, 275268bb, a01e2902, 9253a5bf) are present in git history.
