---
phase: 262-security-hardening-pass-3
plan: 262-02
subsystem: security
tags: [trpc, adminProcedure, apt, sudoers, sha256, ssrf, gpg, native-installer, allowlist]

# Dependency graph
requires:
  - phase: 256-security-hardening-contained-autonomy
    provides: assertInstallAllowed install-admin-gate (256-03) + requireRole/legacySingleUser ctx pattern (256-04)
  - phase: 259-native-app-ux-polish
    provides: the native installer apt/deb/appimage/apt-repo/script methods this plan hardens
  - phase: 261-security-research-pass
    provides: SECURITY-RESEARCH-PASS-3.md findings LIVOS-042/044/045/055 with exploit sketches
provides:
  - installV37/uninstallV37 as adminProcedure with server-side trusted-manifest re-fetch (client manifest DISCARDED for section==='native')
  - apps.fetchPlatformAppManifest(appId) — trusted catalog manifest fetch (fail-closed null)
  - APT_PACKAGE_RE + validateAptPackages pre-spawn charset gate in apt + apt-repo branches
  - single #aptInstall fixed-argv helper (pinned flags, '--' end-of-options)
  - SHA256_RE mandatory fail-closed checksums for deb/script/appimage
  - NATIVE_DOWNLOAD_HOST_ALLOWLIST + assertAllowedDownloadUrl (https-only) on all 5 URL inputs
  - aptKeyFingerprint 40-hex pin verified via gpg --show-keys --with-colons pre-helper
  - downloadToFile per-hop scheme+SSRF+allowlist re-validation, redirect cap 5
  - livos-add-apt-repo.sh Pin-Priority de-escalated 1000→500
affects: [262-05 deploy walk, native catalog curation (Server5 apps DB rows need sha256 + aptKeyFingerprint), store bridge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fail-closed validator exports (pure, unit-locked) consumed by privileged install branches"
    - "per-redirect-hop URL re-validation by recursing through the validating function entry"
    - "server-side manifest re-fetch by appId — client manifest never reaches privileged dispatchers"

key-files:
  created:
    - livos/packages/livinityd/source/modules/apps/native-installer.unit.test.ts
  modified:
    - livos/packages/livinityd/source/modules/apps/routes.ts
    - livos/packages/livinityd/source/modules/apps/apps.ts
    - livos/packages/livinityd/source/modules/apps/native-installer.ts
    - scripts/install/livos-add-apt-repo.sh

key-decisions:
  - "installV37 gate runs BEFORE the progress seed so a refused install never leaves a dangling done:false progress record for the bridge poll"
  - "Allowlist seeded from GitHub release infra + canonical vendor hosts (Brave/Signal/Spotify/Microsoft/Google) — repo grep found no catalog URL literals in-repo (catalog lives in the Server5 apps DB)"
  - "gpg fingerprint check uses the module's execCmd spawn helper (same no-shell semantics the plan's 'via execa' intended; execa is not imported in this module)"
  - "deb branch also gets '--' end-of-options (server-built /tmp path, belt-and-suspenders)"

patterns-established:
  - "Privileged install inputs validated by exported pure functions so vitest locks them without network/spawn"

requirements-completed: [LIVOS-042, LIVOS-044, LIVOS-045, LIVOS-055]

# Metrics
duration: 14min
completed: 2026-06-09
---

# Phase 262 Plan 02: WS2 Native Installer Lockdown Summary

**installV37/uninstallV37 are admin-only with the client manifest discarded for native installs (server re-fetch from the trusted catalog, fail-closed 'manifest_unresolved'); aptPackages charset-gated pre-spawn behind one pinned-argv #aptInstall helper; checksums mandatory; https-only host allowlist on every download URL incl. the aptRepoLine token; apt-repo keys fingerprint-pinned via gpg before the root helper; downloadToFile SSRF-re-validated on every redirect hop with a cap of 5; Pin-Priority de-escalated 1000→500.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-09T21:20:15Z
- **Completed:** 2026-06-09T21:34:00Z
- **Tasks:** 3/3
- **Files modified:** 5 (1 created)

## Accomplishments

- **LIVOS-042 (Critical) closed:** `installV37`/`uninstallV37` are `adminProcedure` (member/guest → FORBIDDEN; LIV_API_KEY + legacy single-user still admit via `requireRole`'s `ctx.legacySingleUser` path). For `section==='native'` the client-supplied `manifest` is DISCARDED and re-fetched server-side by appId via the new `apps.fetchPlatformAppManifest` (exact `fetchPlatformTemplate` endpoint + `X-Api-Key` plumbing); a null result returns `ok:false 'manifest_unresolved'` before any dispatch. `assertInstallAllowed` runs pre-dispatch with the 256-04 ctx-resolved `isAdmin` (`InstallForbidden` → `TRPCError FORBIDDEN`, not a 500) as defense-in-depth under `adminProcedure`.
- **LIVOS-044 (High) closed:** every `aptPackages` element validated against `APT_PACKAGE_RE /^[a-z0-9][a-z0-9+._-]*$/` pre-spawn in BOTH the apt and apt-repo branches; both branches route through ONE private `#aptInstall` helper whose argv is `['-n','/usr/bin/apt-get','install','-y',...APT_CONFOLD,'--',...pkgs]` — pinned constants + `--` end-of-options, so `-o DPkg::Pre-Invoke` hook injection through the sudoers `install -y *` wildcard is structurally impossible.
- **LIVOS-045 (High) closed:** `debSha256`/`scriptSha256` now required in the type AND fail-closed at runtime via `SHA256_RE` (the `if (sha && sha.length === 64)` optional idiom is gone everywhere, including the appimage silent-skip); `assertAllowedDownloadUrl` (https-only + `NATIVE_DOWNLOAD_HOST_ALLOWLIST`) applied to `scriptUrl`, `debUrl`, `appimageUrl`, `aptKeyUrl`, AND the URL token parsed out of `aptRepoLine` (closes the http:// repo-line MITM hole); apt-repo requires a 40-hex `aptKeyFingerprint`, with the downloaded key verified via `gpg --show-keys --with-colons` `fpr` records BEFORE `livos-add-apt-repo.sh` is invoked; `Pin-Priority 1000 → 500` in the helper script (vendor repos can provide but no longer shadow Ubuntu packages).
- **LIVOS-055 (Medium) closed:** `downloadToFile(url, dest, redirectsLeft = 5)` enforces https-only + `validateUrl` SSRF guard (loopback/RFC1918/link-local/metadata/ULA) + host allowlist at entry, and every redirect hop recurses through that entry (relative `Location` resolved against the current URL); chain capped at 5; the wrong "Follow one redirect" comment fixed.
- 20 new vitest cases (35+ assertions) regression-lock the validators, with RED demonstrated against the pre-Task-2 revision (20/20 fail on missing exports) → GREEN at HEAD (20/20 pass).

## Task Commits

1. **Task 1: adminProcedure + server-side manifest re-fetch + assertInstallAllowed pre-dispatch** — `997fe2a9` (feat)
2. **Task 2: native-installer fail-closed validation (apt charset / fixed helper / mandatory sha256 / host allowlist / fingerprint pin / hardened downloadToFile)** — `dc6a272b` (feat)
3. **Task 3: RED→GREEN validator unit tests + Pin-Priority 1000→500** — `93acb06a` (fix)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/apps/routes.ts` — installV37/uninstallV37 → adminProcedure; native manifest re-fetch + 'manifest_unresolved' fail-closed; assertInstallAllowed pre-dispatch (FORBIDDEN conversion); dispatcher receives the server-resolved `manifest`, never `input.manifest` for native
- `livos/packages/livinityd/source/modules/apps/apps.ts` — new public `fetchPlatformAppManifest(appId)` next to `fetchPlatformTemplate`, returns the catalog row's `manifest` jsonb or null fail-closed
- `livos/packages/livinityd/source/modules/apps/native-installer.ts` — APT_PACKAGE_RE/validateAptPackages/SHA256_RE/GPG_FINGERPRINT_RE/NATIVE_DOWNLOAD_HOST_ALLOWLIST/assertAllowedDownloadUrl exports; `#aptInstall` fixed-argv helper; per-branch fail-closed checks; fingerprint pin; hardened downloadToFile
- `livos/packages/livinityd/source/modules/apps/native-installer.unit.test.ts` — NEW: 20 vitest cases locking injection/allowlist/checksum/fingerprint shapes (exploit strings copied verbatim from the research report)
- `scripts/install/livos-add-apt-repo.sh` — Pin-Priority 1000 → 500 with updated rationale comment; keyring/sources logic byte-identical; `bash -n` clean

## Decisions Made

- **Gate placement:** the LIVOS-042 gate + re-fetch run after the dispatcher/pool checks but BEFORE the opening `recordProgress` seed, so a refused install never leaves a dangling `done:false` progress record for the store bridge poll.
- **Allowlist seed:** the plan's repo grep for `scriptUrl|debUrl|appimageUrl|aptKeyUrl|aptRepoLine` literals found NO catalog hosts in this repo (catalog rows live in the Server5/Supabase `apps` DB). Seeded with the plan's mandated GitHub minimum (`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `raw.githubusercontent.com`) + canonical official vendor hosts for the Phase 259 catalog apps: `brave-browser-apt-release.s3.brave.com`, `updates.signal.org`, `repository.spotify.com`, `download.spotify.com`, `packages.microsoft.com`, `dl.google.com`. **Operator note:** any catalog row using another host fails closed until the host is deliberately added.
- **gpg via execCmd:** the fingerprint check spawns `gpg --show-keys --with-colons` through the module's existing `execCmd` helper (no-shell spawn — the semantics the plan's "via execa" asked for; execa is not imported in this module and adding it would be an unneeded dependency shift).
- **deb branch `--`:** also added the `--` end-of-options marker before the server-built `/tmp/...deb` path (belt-and-suspenders consistency with `#aptInstall`).

## Deviations from Plan

### Verification adaptations (not code deviations)

**1. install-admin-gate.test.ts runs under node:test, not vitest**
- **Found during:** Task 1 verification
- **Issue:** the plan's verify command runs `npx vitest run ... install-admin-gate.test.ts`, but that file is written in the package's older `node:test` convention — vitest reports "No test suite found" (its assertions still execute on import and pass)
- **Fix:** ran it via its native convention `npx tsx --test` (explicitly permitted fallback) — 6/6 pass; vitest covers routes.test.ts + the new unit file (28/28)
- **Verification:** both runners green

**2. tsc delta accounting (baseline 399 → 398, no new error classes)**
- Task 1 adds +1 instance of the pre-existing `TS18048 'ctx.apps' is possibly 'undefined'` noise in routes.ts (the new `ctx.apps.fetchPlatformAppManifest` call; the same file already had 49 identical instances from the same idiom — the named accepted baseline class).
- Task 2 REMOVES the 2 pre-existing native-installer.ts baseline errors (the old http/https `lib.get` union noted in 259-02 deferred-items) because downloadToFile is now https-only.
- Net: 399 → 398; stash-diff confirmed no new error class at any step.

---

**Total deviations:** 2 verification adaptations, 0 functional deviations. No scope creep; all edits within the plan's `files_modified`.

## TDD Gate Compliance

The plan's wave ordering put the implementation (Task 2, `feat dc6a272b`) before the test task (Task 3), so the commit sequence is feat → test rather than test → feat. The RED gate was honored by demonstration: the new unit file was run against the pre-Task-2 revision (`997fe2a9` checkout of native-installer.ts) — **20/20 FAIL on missing exports (RED)** — then against HEAD — **20/20 PASS (GREEN)**. No failing-test commit exists in history (single-atomic-commit-per-task directive); the RED evidence is recorded here and in the Task 3 commit message.

## Issues Encountered

None beyond the verification adaptations above.

## Known Behavior Changes (intentional, fail-closed — for the 262-05/operator walk)

- **Builtin/off-catalog native apps now refuse to install:** `section==='native'` ALWAYS re-fetches the manifest from the platform catalog; an app absent from the catalog (or with no platform API key in Redis) returns `'manifest_unresolved'`. This is the locked fail-closed direction — a native app must have a trusted catalog row.
- **Catalog curation required before deploy walk:** existing native catalog rows must gain `debSha256`/`scriptSha256` (now mandatory) and apt-repo rows must gain `aptKeyFingerprint` (40-hex) — rows without them fail closed with `signature_invalid`. Rows whose URLs use non-allowlisted hosts fail with `manifest_invalid` until the host is added to `NATIVE_DOWNLOAD_HOST_ALLOWLIST`.
- **Residual (accepted):** the fingerprint pin verifies livinityd's OWN download of the key; `livos-add-apt-repo.sh` re-curls the same https/allowlisted URL as root (helper interface is sudoers-pinned to `<name> <keyUrl> <repoLine>`). A TOCTOU would require an allowlisted vendor host serving different keys to back-to-back requests — bounded by the allowlist + https; matches the plan's "verify BEFORE the helper is invoked" design. Also T-262-13 (maintainer scripts of legit pinned packages run as root) remains accepted per the threat model.

## Next Phase Readiness

- WS2 code complete; live success-criteria walk (member installV37 → FORBIDDEN, injected `-o` rejected pre-spawn, no-sha/non-allowlisted artifact refused, private/http redirect blocked) is an operator deploy item (262-05 / WS6).
- Cross-plan note: WS3 (262-03) owns the sudoers provisioning; the `#aptInstall` `--` marker is compatible with the existing `apt-get install -y *` wildcard, and any future fixed-wrapper sudoers tightening should keep `--` in the granted pattern.

---
*Phase: 262-security-hardening-pass-3*
*Completed: 2026-06-09*

## Self-Check: PASSED

All 5 claimed files + the SUMMARY exist on disk; commits 997fe2a9 / dc6a272b / 93acb06a present in git log.
