---
phase: 223-vendor-aionui-install
plan: 01
subsystem: liv-assistant-install
tags: [v42, aionui, vendor, installer, bash, idempotent, apache-2.0]
requires:
  - phase-222-spike-verdict-proceed
  - pinned-tarball-sha256
provides:
  - scripts/install-liv-assistant.sh
  - liv-assistant-mini-pc-install-path
affects:
  - /opt/liv-assistant/ (Mini PC, at deploy time — Phase 223-05)
tech_stack:
  added: []
  patterns:
    - "bash set -euo pipefail strict mode"
    - "SHA256 hard gate before extraction (anti-supply-chain)"
    - "idempotent download/extract guarded by content fingerprint"
    - "ln -sfn atomic symlink swap for versioned install"
    - "vendor-and-wrap (no source fork) per Phase 222 spike verdict"
key_files:
  created:
    - scripts/install-liv-assistant.sh
  modified: []
decisions:
  - "Vendor binary tarball, no source fork (Phase 222 spike verdict)"
  - "Hard-fail on SHA256 mismatch; delete tarball before abort (no half-extract)"
  - "Fetch LICENSE from upstream raw GitHub if tarball omits it (legal preservation)"
  - "Install bun only if missing — check /home/bruce/.bun/bin/bun OR PATH"
  - "UPSTREAM.md timestamp preserved across re-runs to keep find/diff zero-diff"
metrics:
  duration: "~2.5 minutes (single-task plan, no live install)"
  completed: 2026-05-27T08:31:28Z
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 223 Plan 01: Vendored AionUi Installer Script Summary

**One-liner:** Idempotent Bash installer (`scripts/install-liv-assistant.sh`) that downloads AionUi v2.1.4, SHA256-verifies, extracts to `/opt/liv-assistant/aionui-web-2.1.4/`, manages a stable `current` symlink, installs bun for the Claude Code ACP bridge, preserves Apache LICENSE/NOTICE, and writes `UPSTREAM.md` provenance — pure file-write plan, no live install yet.

## Objective Recap

Land the install scaffolding for Liv Assistant (the v42 AionUi-based replacement for OpenClawOS) without touching any existing source. The script is the foundation for Plans 223-02 (systemd unit), 223-03 (password capture helper), 223-04 (docs), and 223-05 (Mini PC live deploy + UAT).

Strategy: **vendor-and-wrap** — no source fork, per the Phase 222 spike PROCEED verdict (commit `b2be397f`). The pinned tarball SHA gives us a deterministic, hash-verified, supply-chain-safe install path.

## What Shipped

| Artifact | Location | Mode | Purpose |
|---|---|---|---|
| Installer script | `scripts/install-liv-assistant.sh` | 0755 | Idempotent install of AionUi v2.1.4 |

### Script structure (13 numbered sections, all present)

1. Shebang + `set -euo pipefail` + `IFS=$'\n\t'`
2. Pinned constants (version 2.1.4, SHA `0bb02d00...6778`, paths)
3. `log()` / `die()` helpers
4. Pre-flight: root check, 8-command dep check, bruce user exists
5. Directory bootstrap (`install -d` — idempotent for `INSTALL_ROOT`, `CACHE_DIR`, `DATA_DIR`)
6. Download tarball if missing OR cached SHA mismatch (`curl --retry 3`, `.partial` atomic mv)
7. **Hard SHA256 gate** — mismatch deletes tarball and aborts (no half-extract garbage)
8. Extract (idempotent — skips if `${VERSION_DIR}/aionui-web/aionui-web` already executable)
9. `ln -sfn` atomic symlink update to `${VERSION_DIR}/aionui-web`
10. Preserve Apache LICENSE + NOTICE — tarball → upstream raw URL → stub fallback chain
11. Install bun via `bun.sh/install` only if missing (skip if `/home/bruce/.bun/bin/bun` exists OR `bun` on PATH)
12. Write `UPSTREAM.md` provenance (timestamp-stable: only rewrites when pinned-input fingerprint changes, so repeated runs preserve install date for `find | diff` cleanliness)
13. Final summary log lines

## Verification

All 9 acceptance criteria from the plan passed via grep / `bash -n` / `test -x`:

| Check | Result |
|---|---|
| `bash -n` syntactic | OK |
| `test -x` executable | OK |
| Contains pinned SHA literal | OK |
| Contains `AIONUI_VERSION="2.1.4"` | OK |
| Contains `SHA256 mismatch` abort path | OK |
| Contains `UPSTREAM.md` generation | OK |
| Contains `bun.sh/install` | OK |
| Contains `ln -sfn` symlink | OK |
| Contains `set -euo pipefail` | OK |

Sacred SHA invariant (D-V42-SACRED): pre-commit hook `[sacred-sha] PASS: 20 files verified` confirms no path under `liv/packages/core/` was modified. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.

## Commits

| Hash | Type | Message |
|---|---|---|
| `d1276e12` | feat | `feat(223-01): idempotent install-liv-assistant.sh — vendor AionUi v2.1.4` |

## Deviations from Plan

None — plan executed exactly as written. The single task's 13 numbered sub-steps were all implemented as specified. Minor scope-additive choices (all defensible as Rule 2 hardening, not deviations):

- **NOTICE fetch fallback** added (plan said "may not exist upstream — if HTTP 404, write a minimal NOTICE.md crediting upstream"). Implemented as in-tarball → upstream-raw → minimal-stub chain, exactly matching the plan's intent.
- **Timestamp stability** for `UPSTREAM.md`: the plan's acceptance test is `find /opt/liv-assistant > before; ./install; find /opt/liv-assistant > after; diff before after` returning empty. Because `date -u +%Y...Z` would change on each run and break that test, the script compares a fingerprint that strips the `Vendored on` line and only rewrites when pinned inputs actually change. This preserves the FIRST-install date as documentation. Defensible Rule 2 correctness fix (zero-diff acceptance requires it).

## Authentication Gates

None — script is repo-side file write only. No live install, no Mini PC SSH, no API calls.

## Known Limitations / Carries

- **No live install executed.** Plan 223-01 is scaffolding only — actual `/opt/liv-assistant/` materialization happens in Plan 223-05 when the script is deployed to the Mini PC. The "running twice produces zero diff" acceptance (success criterion #1) is only verifiable AFTER live deploy. Code-side review confirms the idempotency design is sound; live verification is deferred to 223-05.
- **Port 3020 collision check** is NOT in this script (success criterion noted only in ROADMAP risk register, not in 223-01 plan action). Belongs in 223-02 systemd or 223-05 deploy preflight.
- **First-boot admin password capture** is Plan 223-03's `scripts/capture-liv-assistant-password.sh`, not this installer.

## Self-Check: PASSED

- File `scripts/install-liv-assistant.sh` exists (FOUND)
- Commit `d1276e12` exists in `git log` (FOUND)
- All 9 acceptance grep checks pass (verified above)
- Sacred SHA hook PASSED at commit time (20 files verified, no liv/packages/core touched)

## Threat Flags

None — the script introduces no new network endpoints, auth paths, or trust boundaries at runtime (it's an installer that runs once during deploy, only fetches from pinned upstream URLs, and writes to `/opt/liv-assistant/` under root). The SHA256 hard gate is a defense, not a new surface.

## Next Step

Plan 223-02: write `systemd/liv-assistant.service` unit file (port 3020, ExecStart, Environment PATH for bun).
