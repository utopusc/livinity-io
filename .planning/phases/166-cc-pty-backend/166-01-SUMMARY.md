---
plan: 166-01-tmux-apt-and-scaffold
phase: 166
status: complete
commit: <PENDING-FILLED-POST-COMMIT>
files_modified:
  - livos/packages/livinityd/source/modules/cc-pty/types.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/index.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/types.test.ts (NEW)
  - livos/packages/livinityd/source/index.ts (MOD — placeholder type-only import)
acceptance_criteria_met:
  - types.ts exports CcPtySession (10 fields, 3 optional) + CcPtyManagerOptions (5 fields, 2 optional)
  - index.ts barrel re-exports types only (manager/store/ws-handler/idle-reaper added in 166-02..05)
  - types.test.ts source-text invariant — 19 assertions all PASS
  - livinityd/source/index.ts contains placeholder import `import type {CcPtySession as _CcPtySession}`
  - tsc --noEmit zero NEW errors in cc-pty/* or source/index.ts (pre-existing 399 errors are out-of-scope; see deferred-items.md)
tests_added: 19
assertions_added: 19
sacred_guards_verified:
  - liv/packages/core/src/sdk-agent-runner.ts SHA256 == f3538e1d811992b782a9bb057d1b7f0a0189f95f
  - livos/.../computer-use/luse-system-prompt.ts hash == 2083f0a3 (D-09 byte-identical)
  - livos/.../ai/agent-prompt-builder.ts hash == dc1831f5 (Phase 161-02 byte-identical)
  - livos/.../claude-runner/vault-scaffolder.ts hash == 5ddfd065 (Phase 162-01 byte-identical)
  - liv/packages/core/src/agent-session.ts hash == 7c690d59 (Phase 162-02 byte-identical)
  - livos/.../server/ws-agent.ts hash == 8fee9a1d (Phase 163 surface routing UNCHANGED)
  - livos/.../autonomous-scheduler/scheduler.ts hash == f7c03317 (Phase 164 core UNCHANGED)
  - livos/.../claude-runner/idle-reaper.ts hash == 8eea049e (Phase 165-01 byte-identical)
---

## Summary

Scaffolded the `cc-pty` module under livinityd with the canonical `CcPtySession` (10-field) and `CcPtyManagerOptions` (5-field) TypeScript interface contracts, a barrel re-export, and a type-only placeholder import in `livinityd/source/index.ts`. Pure types — no runtime imports of `node-pty` or shell-command literals.

## Acceptance Evidence

- `pnpm --filter livinityd exec vitest run source/modules/cc-pty/types.test.ts` — **19 passed** in 365ms
- `pnpm --filter livinityd exec tsc --noEmit` — 0 NEW errors introduced (399 pre-existing errors documented in deferred-items.md; before-vs-after delta = 0)
- `grep -E "(cc-pty|source/index\\.ts)" tsc_output` — empty (no errors in our new files)
- Source-text grep evidence:
  - `livinityd/source/index.ts` contains `import type {CcPtySession as _CcPtySession} from './modules/cc-pty/index.js'` (placeholder inserted at line 41-46)
  - `types.ts` contains both `export interface CcPtySession` and `export interface CcPtyManagerOptions`
  - `index.ts` barrel re-exports `CcPtySession, CcPtyManagerOptions, CcPtyLogger`

## Notes on CONTEXT.md "9 fields" interpretation

CONTEXT.md §166-01 says CcPtySession has "9 fields exactly". The literal interface count is 10 (id, userId, tmuxName, ccSessionId, cwd, model, createdAt, lastAttachedAt, lastMessageAt, title). Per the plan's own clarification block, this is interpreted as "9 required canonical fields + optional title". The types.test.ts asserts every canonical field name is present (10 individual assertions), which honors the spirit (canonical fields all present + nothing extra slipped in).

## Notes

- Added `CcPtyLogger` structural interface inline (mirroring `IdleReaperLogger` from Phase 165-01) so cc-pty has zero coupling to the `claude-runner` module.
- Pre-existing tsc errors (399, in `user/`, `webapps/`, `widgets/`, `file-store.ts`) are documented in deferred-items.md — they exist on baseline master and are unrelated to Phase 166.

## Self-Check: PASSED

- Files created: types.ts, index.ts, types.test.ts ✓
- Placeholder import inserted at livinityd/source/index.ts:41-46 ✓
- All 8 sacred guard files byte-identical against baseline (verified via `git hash-object`) ✓
- Tests: 19/19 passed ✓
