---
phase: 165-cc-integration-polish
plan: 03
subsystem: claude-runner / vault-templates
tags:
  - phase-165
  - vault-doctor
  - skill-template
  - v34
  - polish
  - report-only
requires:
  - Phase 162-01 vault-scaffolder.ts recursive copy
provides:
  - vault-templates/.claude/skills/livos-vault-doctor/SKILL.md
  - Regression test asserting scaffoldVault drops the skill into the vault
affects:
  - vault-scaffolder.test.ts (additive — new assertion in Test 1 + new Test 5b)
tech-stack:
  added: []
  patterns:
    - "Project-level skill — CC SDK auto-loads via settingSources:['project']"
    - "Recursive idempotent template copy (Phase 162-01) auto-propagates new subdirs"
key-files:
  created:
    - livos/packages/livinityd/source/data/vault-templates/.claude/skills/livos-vault-doctor/SKILL.md
  modified:
    - livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.test.ts
decisions:
  - "SKILL.md body locked verbatim from 165-PLAN.md (Step 1–5 + Constraints) for unambiguous model behavior"
  - "Report inline in chat — no file mutation — matches Phase 165 master design (report-only utility)"
  - "Hard cap 500 files in skill prompt to bound token budget"
  - "Rule 3 fix: stale Phase 164 livos-agents/.gitkeep assertion replaced with nightly-backup-audit.md + pr-watcher.md (the actual shipped files)"
metrics:
  duration_min: 9
  tasks_total: 1
  tasks_completed: 1
  files_created: 1
  files_modified: 1
  tests_added: 1
  tests_passing: 7
  date: 2026-05-19
---

# Phase 165 Plan 03: livos-vault-doctor SKILL Summary

Adds the `livos-vault-doctor` Claude Code skill to the LivOS vault-templates tree. After the next `update.sh` + livinityd boot, `/home/bruce/livinity-vault/.claude/skills/livos-vault-doctor/SKILL.md` exists on the Mini PC vault, invocable from Main Chat as `/livos-vault-doctor`. The skill audits all vault `.md` files for broken `[[wikilinks]]` and orphan files under `memory/`, then emits a single inline Markdown report — no file mutations, no auto-fix.

## Commits

| Hash       | Type    | Description                                                                 |
| ---------- | ------- | --------------------------------------------------------------------------- |
| `6712405a` | feat    | add livos-vault-doctor SKILL.md template (vault audit, report-only)         |

## What Was Built

**New skill prompt** at `vault-templates/.claude/skills/livos-vault-doctor/SKILL.md` — 60 lines of operator-grade instructions:

1. Glob `**/*.md` (exclude `inbox/`)
2. Extract `[[<target>]]` references from each file
3. Resolve targets via 3-tier lookup: `memory/<target>.md` → `memory/<subdir>/<target>.md` → `<target>.md`
4. List orphan files under `memory/**` that nothing links to
5. Emit inline Markdown report (no file write); fallback `_All clean_` when both sections empty
6. Hard constraints: Read + Glob only — no Bash/Edit/Write — 500-file cap — ≤12 turns

**Regression test** — extended `vault-scaffolder.test.ts`:
- Added assertion in Test 1 (clean-create) that `.claude/skills/livos-vault-doctor/SKILL.md` exists post-scaffold.
- New Test 5b (Phase 165-03 regression) asserts file body shape:
  - Frontmatter declares `name: livos-vault-doctor`
  - Body contains `Vault Doctor` heading
  - Body contains the `Report-only` invariant (case-insensitive)
  - Body mentions both `Glob` and `Read` tools (no FS mutations)

Test suite: **7/7 PASS** (was 5/7 before — Phase 164 left a stale assertion; see Deviations).

## Guardrails Verified

| Guard                                                        | Status                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`        | UNCHANGED (verified via `git ls-files -s` post-commit)       |
| `vault-scaffolder.ts` SHA `5ddfd06508e11554ae80a7a57b269a4835bf6cdb` | UNCHANGED — only its TEMPLATES tree gained a file       |
| `git diff HEAD~1 -- vault-scaffolder.ts`                     | 0 lines                                                      |
| D-09 `luse-system-prompt.ts`                                 | UNCHANGED                                                    |
| Phase 161-02 helper                                          | UNCHANGED                                                    |
| `liv/packages/core/src/agent-session.ts`                     | UNCHANGED                                                    |
| `livos/packages/livinityd/package.json` + `pnpm-lock.yaml`   | UNCHANGED (D-NO-NEW-DEPS satisfied)                          |
| Phase 163 `surface-context.ts`                               | UNCHANGED                                                    |
| Phase 164 `autonomous-scheduler/*.ts`                        | UNCHANGED                                                    |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Pre-existing Phase 164 stale test assertion**
- **Found during:** Verification gate (`npm run test:run -- vault-scaffolder.test.ts`)
- **Issue:** Test 1 (clean-create) asserted `existsSync(join(vaultPath, 'livos-agents/.gitkeep'))` but Phase 164 had replaced that `.gitkeep` placeholder with real agent definitions (`nightly-backup-audit.md`, `pr-watcher.md`) — never updating the test. Test suite reported `1 failed | 5 passed` BEFORE Plan 165-03 touched anything (confirmed by stashing my changes and re-running).
- **Fix:** Replaced the stale `livos-agents/.gitkeep` line with two assertions on the actual shipped Phase 164 files. Plan 165-03's `acceptance_criteria` demands 100% PASS on this suite; the stale assertion blocked that gate through no fault of this plan.
- **Files modified:** `vault-scaffolder.test.ts` (only the assertion line, +3 lines net)
- **Commit:** `6712405a` (same commit as the planned work)
- **Scope:** SAFE — only fixes a test assertion to match what Phase 164 actually shipped. No production code touched.

**Path discrepancy:** PLAN's `<verify><automated>` uses `cd livos && npm run test:run` but the `test:run` script lives in `livos/packages/livinityd/` (the `livos/` root has no `test:run`). Ran from the correct location. Plan author's path was a minor typo — no scope change.

### Authentication Gates

None — this plan touches no auth surface.

## Acceptance Criteria (verbatim from plan)

- File `livos/packages/livinityd/source/data/vault-templates/.claude/skills/livos-vault-doctor/SKILL.md` exists — **PASS**
- File starts with `---\nname: livos-vault-doctor` — **PASS**
- File contains `Report-only` — **PASS** (line 3, frontmatter `description:`)
- File contains `Glob` AND `Read` instructions — **PASS** (Step 1 + Step 2)
- `vault-scaffolder.test.ts` has at least one assertion containing `livos-vault-doctor` — **PASS** (3 in Test 1 + 5 in Test 5b)
- `npm run test:run -- modules/claude-runner/vault-scaffolder.test.ts` — **PASS** (7/7)
- `git diff HEAD~1 -- vault-scaffolder.ts` — **0 lines (PASS)**
- `git diff HEAD~1 -- liv/packages/core/src/sdk-agent-runner.ts` — **0 lines (PASS)**
- `git diff HEAD~1 -- liv/packages/core/src/agent-session.ts` — **0 lines (PASS)**
- `git diff HEAD~1 -- luse-system-prompt.ts` — **0 lines (PASS)**
- `git diff HEAD~1 -- package.json pnpm-lock.yaml` — **0 lines (PASS)**

## Live Deploy Note (next Mini PC `update.sh`)

After the next `bash /opt/livos/update.sh` on the Mini PC:
1. `vault-templates/` tree (including the new vault-doctor skill) rsyncs into `/opt/livos/`.
2. On `systemctl restart livos`, livinityd boots, calls `scaffoldVault({vaultPath: '/home/bruce/livinity-vault'})`.
3. Phase 162-01's idempotent recursive copy drops `~/livinity-vault/.claude/skills/livos-vault-doctor/SKILL.md` (existing user files preserved).
4. CC SDK auto-loads project skills via `settingSources:['project']` — `/livos-vault-doctor` becomes available in Main Chat (vault mode).

Live verification of this end-to-end path is owned by **Plan 165-04** (v34.x consolidated VERIFICATION).

## Self-Check: PASSED

- File `livos/packages/livinityd/source/data/vault-templates/.claude/skills/livos-vault-doctor/SKILL.md` — **FOUND**
- File `livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.test.ts` — **FOUND** (modified)
- Commit `6712405a` — **FOUND** in `git log`
- Sacred SHA preserved — **VERIFIED**
- vault-scaffolder.ts byte-identical — **VERIFIED** (diff HEAD~1 = 0 lines)
