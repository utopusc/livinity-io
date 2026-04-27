---
phase: 33
fixed_at: 2026-04-27T11:11:13Z
review_path: .planning/phases/33-update-observability-surface/33-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 33: Code Review Fix Report

**Fixed at:** 2026-04-27T11:11:13Z
**Source review:** .planning/phases/33-update-observability-surface/33-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01 + WR-02: JSON injection via backslash and mid-UTF-8 cut truncation

**Files modified:** `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh`, `.planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl`
**Commit:** b974b98f
**Applied fix:** Changed `| tr -d '"' | cut -c1-200` to `| tr -d '"\\'  | tr -d '\n' | LC_ALL=C cut -c1-200` in both files at the `last_err` extraction pipeline. The `tr -d '"\\'` strips both double-quote and backslash characters, preventing JSON string injection. The `tr -d '\n'` removes embedded newlines from pathological CRLF log lines. `LC_ALL=C cut -c1-200` forces byte-mode cutting to prevent the 200-char boundary from splitting a multi-byte UTF-8 character into invalid bytes. Both files updated in lockstep per the sync requirement documented in the patch script header.

### WR-01: Static imports after React.lazy() declarations

**Files modified:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx`
**Commit:** 67de2f4d
**Applied fix:** Moved the three static imports (`SoftwareUpdateListRow`, `PastDeploysTable`, `MenuItemBadge`) from lines 114-116 (after all `React.lazy()` const declarations) to the top-level import block at lines 87-89 (alongside the other same-directory `./shared`, `./settings-info-card`, `./settings-toggle-row` imports). All `React.lazy()` const declarations now follow the import block as expected. Resolves the `eslint-plugin-import/first` violation.

### WR-03: eval on sandbox paths in log-format.sh

**Files modified:** `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh`
**Commit:** 5df1db53
**Applied fix:** Added a fail-fast guard at the top of `run_scenario()` that exits with a fatal error if the `mktemp -d` sandbox path contains spaces, dollar signs, or backticks. This prevents `eval "$cond"` in `assert()` from silently mis-evaluating assertions on systems where `TMPDIR` contains shell metacharacters (e.g., macOS CI with user home directories). Also added a `# NOTE` comment to `assert()` documenting the safety invariant established by the guard.

### WR-04: Missing 50MB size cap in readUpdateLog

**Files modified:** `livos/packages/livinityd/source/modules/system/routes.ts`, `livos/packages/livinityd/source/modules/system/system.unit.test.ts`
**Commit:** 19e200bb
**Applied fix:** Added a `fsStat(resolved)` call before `fs.readFile` in the `readUpdateLog` handler. If `stat.size > 50 * 1024 * 1024` (52,428,800 bytes), the route throws `TRPCError { code: 'PAYLOAD_TOO_LARGE' }` with a human-readable message showing the actual file size in MB. Used a named import `fsStat` from `node:fs/promises` so vitest's module auto-mock can intercept it in tests. Also updated the pre-existing H1-H4 happy-path tests to mock `fsStat` returning a small file size (1024 bytes), and added two new tests: SC1 (53 MiB file rejects with PAYLOAD_TOO_LARGE and readFile is never called) and SC2 (exactly 50 MiB boundary passes through). All 27 tests pass.

## Skipped Issues

None.

---

_Fixed: 2026-04-27T11:11:13Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
