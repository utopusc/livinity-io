---
phase: 172-livos-cli-skeleton
plan: 04
subsystem: cli
tags: [cli, skills, postinstall, 3-layer-distribution, gsd-pattern, idempotent-installer]

# Dependency graph
requires:
  - phase: 172-01
    provides: "@livos/cli package scaffold (package.json, tsconfig.json, src/cli.ts)"
provides:
  - "3 bundled Claude skill shims (liv-add-item, liv-list-tree, liv-doctor)"
  - "2 bundled expanded workflows (add-item.md, doctor.md)"
  - "Idempotent cross-platform postinstall.js (symlink on Linux/Mac, copy on Windows)"
  - "Workspace-bootstrap gate (prevents accidental install during monorepo pnpm install)"
  - "Smoke test (4 PASS assertion groups: first install, idempotency, win32 branch, win32 idempotency)"
  - "package.json scripts.postinstall wire-up"
affects:
  - "176-main-liv-root-agent (extends skill set)"
  - "177-schedule-engine (adds liv-schedule-* skills)"
  - "173-vault-migrate (workflow installer for ~/.claude/get-livin/ tree)"

# Tech tracking
tech-stack:
  added:
    - "Node.js node:fs/promises symlink + cp (recursive)"
    - "INIT_CWD-based workspace detection pattern"
  patterns:
    - "GSD L2 3-layer skill distribution analog for LivOS"
    - "Bundled prompts/skills/* + scripts/postinstall.js idempotent installer"
    - "Cross-platform symlink-or-copy fallback (Windows admin-free)"
    - "Explicit opt-in (LIV_CLI_INSTALL_SKILLS=1) + opt-out (LIV_CLI_SKIP_POSTINSTALL=1) env-var gates"

key-files:
  created:
    - "livos/packages/cli/prompts/skills/liv-add-item/SKILL.md"
    - "livos/packages/cli/prompts/skills/liv-list-tree/SKILL.md"
    - "livos/packages/cli/prompts/skills/liv-doctor/SKILL.md"
    - "livos/packages/cli/prompts/workflows/add-item.md"
    - "livos/packages/cli/prompts/workflows/doctor.md"
    - "livos/packages/cli/scripts/postinstall.js"
    - "livos/packages/cli/scripts/postinstall.test.js"
  modified:
    - "livos/packages/cli/package.json (additive: scripts.postinstall key)"

key-decisions:
  - "Directory symlinks (not file symlinks) on Linux/Mac so SKILL.md @-includes resolve against the bundled package directory"
  - "Windows copies (not junction points) — admin-free, simpler semantics; updates require manual refresh and we log that explicitly"
  - "Workspace-bootstrap detection via INIT_CWD compare to repo-root + workspace-root (covers both pnpm and npm install at any monorepo level)"
  - "Idempotency check via fs.lstat + fs.readlink (resolve relative readlink against symlink's parent dir)"
  - "Test file uses tmpdir-based home override (never writes to user's actual ~/.claude/skills/)"

patterns-established:
  - "Pattern: cross-platform skill installer with platform-specific branch (symlink vs copy) — re-usable for future bundled-skills packages"
  - "Pattern: workspace-bootstrap gate via INIT_CWD prevents accidental installer firing during monorepo install"
  - "Pattern: DI-friendly installSkills(opts) with {home, platform} overrides for hermetic testing"

requirements-completed: [D-V38-G]

# Metrics
duration: ~12 min
completed: 2026-05-20
---

# Phase 172 Plan 04: Bundled skills + workflows + idempotent postinstall Summary

**3 Claude skill shims (liv-add-item, liv-list-tree, liv-doctor) + 2 expanded workflows + a cross-platform idempotent postinstall script that symlinks (Linux/Mac) or copies (Windows) bundled skills into `~/.claude/skills/` — D-V38-G 3-layer L2 distribution shipped.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-20T11:07:00Z (approx — start of plan execution)
- **Completed:** 2026-05-20T11:19:31Z
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 1 (package.json — additive)

## Accomplishments

- 3 skill shims under `prompts/skills/liv-*/SKILL.md` with YAML frontmatter (`name`, `description`) and `liv` command quick-references
- 2 expanded workflows under `prompts/workflows/` (add-item, doctor) following gsd-sdk workflow shape (purpose + process steps + error patterns)
- `scripts/postinstall.js` — 144-line idempotent cross-platform installer with workspace-bootstrap gate, explicit opt-in/opt-out env vars, exported `installSkills(opts)` for DI testing
- `scripts/postinstall.test.js` — 4 PASS assertion groups covering: first install (3 skills), idempotency (skip on re-run), forced win32 platform branch (copy action), win32 idempotency
- `package.json` extended with `scripts.postinstall: "node scripts/postinstall.js"` — single additive key; all other fields unchanged

## Task Commits

1. **Task 1: 3 skill shims + 2 workflows** — `e85c9b1e` (feat)
2. **Task 2: postinstall.js + tests + package.json wire-up** — `1ecac522` (feat) — see Deviations §1 for the parallel-agent race

## Files Created/Modified

- `livos/packages/cli/prompts/skills/liv-add-item/SKILL.md` — 21 lines, skill shim for vault item create
- `livos/packages/cli/prompts/skills/liv-list-tree/SKILL.md` — 20 lines, skill shim for tree listing
- `livos/packages/cli/prompts/skills/liv-doctor/SKILL.md` — 25 lines, skill shim for integrity check
- `livos/packages/cli/prompts/workflows/add-item.md` — 48 lines, expanded create workflow
- `livos/packages/cli/prompts/workflows/doctor.md` — 43 lines, expanded check workflow
- `livos/packages/cli/scripts/postinstall.js` — 144 lines, cross-platform idempotent installer
- `livos/packages/cli/scripts/postinstall.test.js` — 76 lines, 4-group smoke test using tmpdir
- `livos/packages/cli/package.json` — +1 line (`scripts.postinstall` key, additive only)

## Decisions Made

- **Directory symlink (not file symlink) on Linux/Mac.** This preserves the SKILL.md `@~/.claude/get-livin/workflows/…` @-include semantics; the symlink points at the bundled `prompts/skills/<name>/` dir so the whole skill folder is reachable.
- **Windows copies via `fs.cp({recursive: true})` instead of symlinks.** Windows symlinks require `SeCreateSymbolicLinkPrivilege` (admin or Developer Mode); a copy is admin-free at the cost of needing manual refresh on update — we log this explicitly as `'already copied (Windows; manual refresh required for updates)'`.
- **Workspace-bootstrap gate via `INIT_CWD` compare.** pnpm/npm set `INIT_CWD` to the directory where the operator ran `install`. When `INIT_CWD === repoRoot` (or workspace-root), we're bootstrapping the monorepo and the installer skips. When the package is installed as a real dep, `INIT_CWD` points elsewhere and the installer runs.
- **Test file does NOT write to real `~/.claude/skills/`.** All tests use `fs.mkdtemp(tmpdir())` for a fresh home; `installSkills({home, platform})` takes explicit overrides. The user's actual Claude config is untouched.
- **No vitest dependency for postinstall.test.js.** Uses vanilla `node:assert/strict` and runs via `node scripts/postinstall.test.js` directly. This keeps the test runnable even before the workspace's vitest is installed, and avoids vitest globbing `scripts/` by default (only `src/`).

## Deviations from Plan

### Issue 1: Parallel-agent commit race [Rule 3 — Blocking]

- **Found during:** Task 2 commit step
- **Issue:** Plan 172-02 was running in parallel and committed during the window between my `git restore --staged` and re-`git add`. The parallel agent's `git add` (or `git commit -a` style behaviour) pulled my staged 172-04 files (`postinstall.js`, `postinstall.test.js`, `package.json` mod) into its own commit `1ecac522`, which is labelled `feat(172-02): auth resolver + vitest config` but contains BOTH 172-02 deliverables AND the 172-04 deliverables.
- **Fix:** Non-destructive. The file contents are exactly what 172-04 specified (verified post-commit: `node scripts/postinstall.test.js` still PASSES all 4 groups; package.json `scripts.postinstall` is `node scripts/postinstall.js`). Rather than rewrite shared history mid-parallel-execution (which would corrupt 172-02's commit), I documented the situation here so future archeology can find both plans' work in commit `1ecac522`. Task 1 was committed cleanly as `e85c9b1e feat(172-04): bundle 3 skill shims + 2 workflows`.
- **Files affected:** All 172-04 Task 2 files landed in commit `1ecac522` (172-02's commit) rather than a dedicated 172-04 commit.
- **Verification:** `git show 1ecac522 --stat` confirms `postinstall.js (144 lines)`, `postinstall.test.js (76 lines)`, `package.json (+1 line postinstall key)` all present with full intended content. Test suite passes. Build is clean. Sacred SHA intact.
- **Recommended follow-up:** None required — the deliverables shipped intact. Future plans can reference commit `1ecac522` for 172-04 Task 2 files (this SUMMARY makes the attribution machine-readable via the Task Commits section above).

---

**Total deviations:** 1 [Rule 3 — Blocking parallel-agent race]
**Impact on plan:** Zero functional impact. All 172-04 deliverables shipped exactly as specified; only the commit-message attribution mingles with 172-02. No code rollback or rewrite needed. Sacred SHA and forbidden-tree guards intact.

## Issues Encountered

- See Deviations §1 above. No other issues during planned work.

## Postinstall Behavior on Each Platform

### Linux/Mac (`process.platform !== 'win32'`)

1. Ensures `~/.claude/skills/` exists (`fs.mkdir({recursive: true})`).
2. For each skill (`liv-add-item`, `liv-list-tree`, `liv-doctor`):
   - If target dir exists AND is a symlink to the expected bundled source → `action: 'skip'`, reason `'already linked'`.
   - If target dir exists but is a wrong link/regular dir → `fs.rm({recursive, force})` then create fresh symlink.
   - Otherwise → `fs.symlink(src, destDir, 'dir')` → `action: 'symlink'`.

### Windows (`process.platform === 'win32'`)

1. Ensures `~/.claude/skills/` exists.
2. For each skill:
   - If target dir exists → `action: 'skip'`, reason `'already copied (Windows; manual refresh required for updates)'`.
   - Otherwise → `fs.cp(src, destDir, {recursive: true, force: false, errorOnExist: false})` → `action: 'copy'`.

## Idempotency Proof

`scripts/postinstall.test.js` provides automated proof. Test transcript:

```
[postinstall.test] Test 1 PASS — first install creates 3 skills
[postinstall.test] Test 2 PASS — second install is idempotent (skip)
[postinstall.test] Test 3 PASS — win32 branch uses copy
[postinstall.test] Test 4 PASS — win32 second install is idempotent
[postinstall.test] all assertions passed
```

Method:
- `installSkills({home, platform})` called once → all 3 skills `action='symlink'|'copy'`, target files exist.
- `installSkills({home, platform})` called again with the SAME home dir → all 3 skills `action='skip'`. No filesystem writes. No errors. No duplicate symlinks.
- Test runs once with native platform, once with forced `platform: 'win32'`, both branches verified idempotent.

## Gate-Against-Monorepo-Install Proof

Manual verification (run from `livos/packages/cli/`):

```bash
$ INIT_CWD="C:/Users/hello/Desktop/Projects/contabo/livinity-io" node scripts/postinstall.js
[liv postinstall] skipped (workspace bootstrap or explicit opt-out)

$ LIV_CLI_SKIP_POSTINSTALL=1 node scripts/postinstall.js
[liv postinstall] skipped (workspace bootstrap or explicit opt-out)
```

Both gates resolve correctly:
- `INIT_CWD === repoRoot` → `isWorkspaceBootstrap()` returns true → `shouldRun()` returns false → skip.
- `LIV_CLI_SKIP_POSTINSTALL=1` → `shouldRun()` returns false → skip.
- `LIV_CLI_INSTALL_SKILLS=1` would force-run regardless (explicit opt-in escape hatch).

## Sacred Guard Confirmation

- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:** `git cat-file -e` confirms still reachable in object DB ✅
- **D-09 `luse-system-prompt.ts`:** UNCHANGED ✅
- **Phase 162-171 source files:** `git diff --stat livos/packages/livinityd/ livos/packages/ui/ liv/` is empty ✅
- **Plan 172-01 src/ + tsconfig:** unchanged (this plan touched NO src/ files; the src/auth.ts + vitest.config.ts that appeared in commit 1ecac522 are 172-02's deliverables, not 172-04's)
- **172-04 file disjoint from 172-02:** confirmed by inspection — 172-04 touches `prompts/*`, `scripts/*`, `package.json` ; 172-02 touches `src/auth.ts`, `vitest.config.ts`. No overlap.

## User Setup Required

None — this plan ships installer infrastructure, but the installer itself is gated against firing during the monorepo's `pnpm install`. The actual operator-facing install path (`npm i @livos/cli`) is exercised only when the package is published.

## Next Phase Readiness

- D-V38-G L2 distribution scaffolding shipped. Phase 173+ can layer `~/.claude/get-livin/` workflow tree on top via a sibling postinstall step.
- Phase 176 (Main Liv root agent) can extend the SKILLS array in `postinstall.js` (currently 3 entries) without rewriting the installer.
- No blockers. 172-04 is CODE-COMPLETE.

## Self-Check: PASSED

Files verified present:
- `livos/packages/cli/prompts/skills/liv-add-item/SKILL.md` ✓
- `livos/packages/cli/prompts/skills/liv-list-tree/SKILL.md` ✓
- `livos/packages/cli/prompts/skills/liv-doctor/SKILL.md` ✓
- `livos/packages/cli/prompts/workflows/add-item.md` ✓
- `livos/packages/cli/prompts/workflows/doctor.md` ✓
- `livos/packages/cli/scripts/postinstall.js` ✓
- `livos/packages/cli/scripts/postinstall.test.js` ✓
- `livos/packages/cli/package.json` modified (scripts.postinstall key) ✓

Commits verified present:
- `e85c9b1e` (Task 1 — clean 172-04 commit) ✓
- `1ecac522` (Task 2 — commingled with 172-02 commit per Deviation §1; 172-04 file contents intact) ✓

Test verified:
- `node scripts/postinstall.test.js` exits 0 with 4 PASS lines ✓

---
*Phase: 172-livos-cli-skeleton*
*Plan: 04*
*Completed: 2026-05-20*
