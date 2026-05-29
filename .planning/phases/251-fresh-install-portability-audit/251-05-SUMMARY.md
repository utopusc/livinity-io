---
phase: 251-fresh-install-portability-audit
plan: 05
subsystem: infra
tags: [audit, portability, install-root, sandbox, luse, computer-use, redis, xdg-runtime-dir, dataDirectory]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: 251-RESEARCH.md verified leads (server.ts:124 fallback, tools.ts sandbox allowlist, _DLD_LIVOS_DIR default)
provides:
  - "Install-root & sandbox-path portability findings (12-row absolute-path table, literal-vs-derived classification, /tmp multi-user race analysis, /opt/livos leaky-parameter verdict)"
affects: [251-09, 252-remediation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Audit findings doc with file:line evidence + PRE-EXISTING/NEW + hard-literal/derived classification"]

key-files:
  created: [.planning/phases/251-fresh-install-portability-audit/findings/251-05-FINDINGS.md]
  modified: []

key-decisions:
  - "Verdict: /opt/livos is a leaky half-declared parameter, not a clean contract — installer root hard-pinned, daemon dataDirectory movable, luse paths re-hardcode the root"
  - "/tmp/livos-active-webapp-wid + /tmp/luse- recommended fix is $XDG_RUNTIME_DIR per-uid namespacing"

patterns-established:
  - "Classify each absolute path as hard-literal vs dataDirectory/env/config-derived and cite the daemon's good pattern (JWT under dataDirectory) as the model the luse code should mirror"

requirements-completed: [PORT-251-PATHS]

# Metrics
duration: ~12min
completed: 2026-05-29
---

# Phase 251 Plan 05: Install-Root & Sandbox-Path Portability Summary

**Read-only audit proving `/opt/livos` is a leaky half-declared parameter — the daemon's `dataDirectory` is movable via `--data-directory`, but the NEW luse Redis fallback (`server.ts:124`) and the sandbox uploads allowlist (`tools.ts:454`) re-hardcode the install root and ignore it, while the installer's `_DLD_LIVOS_DIR` is itself unmovable; plus a `/tmp/livos-active-webapp-wid` multi-user collision+symlink-race surface.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-29
- **Completed:** 2026-05-29
- **Tasks:** 2 (both `auto`)
- **Files modified:** 1 created (findings doc); zero source/script files (D-251-READONLY honored)

## Accomplishments
- **Task 1** — Enumerated every absolute-path literal in the luse/sandbox change neighbourhood as a 12-row table with hard-literal-vs-derived classification, NEW/PRE-EXISTING tags, and exact break mode on a differently-rooted install. Separately documented the `/tmp/livos-active-webapp-wid` (`tools.ts:278`) + `/tmp/luse-` (`tools.ts:453`) shared-`/tmp` multi-user collision + TOCTOU symlink-race surface with a `$XDG_RUNTIME_DIR` per-uid fix.
- **Task 2** — Assessed the install-root contract: traced `dataDirectory` from CLI flag (`cli.ts:59`) → `path.resolve` (`index.ts:400`) → env-overridable installer var (`deploy-livinityd.sh:1461`), then showed the MISMATCH — `_DLD_LIVOS_DIR="/opt/livos"` (`:61`) is hard-pinned (no `${VAR:-default}`, unlike `_DLD_LIVOS_USER`/`_DLD_DESKTOP_USER`), and luse `server.ts:124` + `tools.ts:454` re-hardcode the root independently of `dataDirectory`. Confirmed README documents no install-root override.

## Task Commits

1. **Tasks 1 + 2: Install-root & sandbox-path findings doc** - `cd236b88` (docs)

**Plan metadata:** (this SUMMARY + STATE + ROADMAP) committed separately.

_Both audit tasks landed in the single findings doc + one commit, matching the prior 251-0N findings-doc convention._

## Files Created/Modified
- `.planning/phases/251-fresh-install-portability-audit/findings/251-05-FINDINGS.md` - The dimension's findings: 12-row path-assumption table, `/tmp` multi-user race analysis, `/opt/livos` leaky-parameter verdict, remediation recommendations, evidence index.

## Decisions Made
- **`/opt/livos` classified as a leaky half-declared parameter** (not "fixed contract so literals are fine", not "clean parameter"). Rationale: installer root is unmovable, daemon data dir IS movable, luse paths re-hardcode the root — the three layers disagree, so the literals only "work" by everyone landing at `/opt/livos`.
- **Recommended `$XDG_RUNTIME_DIR` per-uid for the `/tmp` markers** rather than chmod/lockfile hardening, because per-uid 0700 tmpfs closes both the collision and the symlink-race in one move.
- These are recommendations for the future Phase 252 remediation backlog (251-09 will aggregate); no fixes applied here per D-251-READONLY.

## Deviations from Plan

None - plan executed exactly as written. Read-only audit; only the prescribed `findings/251-05-FINDINGS.md` was created; no `livos/`/`liv/`/`scripts/` edits. The `[sacred-sha] PASS: 20 files verified` pre-commit hook confirmed D-V44-SACRED held trivially (no source touched).

## Issues Encountered
- `.planning/PROJECT.md` exceeds the 256KB read cap; read the first page (sufficient for context — v44 milestone + 251 phase context were on it). `.planning/STATE.md` also exceeds the cap; updated via targeted edits rather than a full read.
- `.planning/ROADMAP.md` exceeds the 256KB read cap; located the Phase 251 section via Grep and edited surgically. Noted (out of scope) that 251-03/251-04 prose+checkbox rows were not updated by their executors — left untouched per scope boundary; only advanced the header count to 5/9 and updated this plan's own rows.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- One of the eight Wave-1 findings docs (251-01, 251-02, 251-03, 251-04, 251-05 now complete) feeding the Wave-2 synthesis (251-09).
- This dimension's GAP/RISK items for the 251-09 `REMEDIATION-BACKLOG.md`: (1) `server.ts:124` hardcoded `/opt/livos` Redis-fallback root [NEW, MEDIUM]; (2) `tools.ts:454` hardcoded uploads-sandbox root [PRE-EXISTING, MEDIUM]; (3) `/tmp/livos-active-webapp-wid` + `/tmp/luse-` multi-user collision+symlink-race [PRE-EXISTING, LOW-today/MEDIUM-under-multi-user]; (4) installer `_DLD_LIVOS_DIR` unmovable [PRE-EXISTING, LOW]; (5) dangling `<LIV_DATA_ROOT>` comment inconsistency [PRE-EXISTING, INFO].

## Self-Check: PASSED
- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-05-FINDINGS.md` (138 lines, exceeds 35 min-lines)
- FOUND commit: `cd236b88`

---
*Phase: 251-fresh-install-portability-audit*
*Completed: 2026-05-29*
