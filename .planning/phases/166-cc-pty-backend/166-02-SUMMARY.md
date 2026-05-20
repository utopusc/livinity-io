---
plan: 166-02-session-store
phase: 166
status: complete
commit: <PENDING-FILLED-POST-COMMIT>
files_modified:
  - livos/packages/livinityd/source/modules/cc-pty/session-store.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/session-store.test.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/index.ts (MOD — barrel re-export of SessionStore)
acceptance_criteria_met:
  - All 12 vitest assertions in session-store.test.ts PASS
  - tsc --noEmit 0 NEW errors in cc-pty/* (399 pre-existing baseline unchanged)
  - session-store.ts literal substrings present: `JSON.stringify({schemaVersion: 1, sessions}`, `await fs.rename(tmp, this.filePath)`, `schemaVersion !== 1`
  - cc-pty/index.ts contains `export {SessionStore} from './session-store.js'`
  - Sacred SHA preserved
tests_added: 12
assertions_added: 12
sacred_guards_verified:
  - liv/packages/core/src/sdk-agent-runner.ts hash == f3538e1d (Sacred SHA)
  - livos/.../computer-use/luse-system-prompt.ts hash == 2083f0a3 (D-09)
  - livos/.../ai/agent-prompt-builder.ts hash == dc1831f5 (Phase 161-02)
  - livos/.../claude-runner/vault-scaffolder.ts hash == 5ddfd065 (Phase 162-01)
  - liv/packages/core/src/agent-session.ts hash == 7c690d59 (Phase 162-02)
  - livos/.../server/ws-agent.ts hash == 8fee9a1d (Phase 163 surface)
  - livos/.../autonomous-scheduler/scheduler.ts hash == f7c03317 (Phase 164 core)
  - livos/.../claude-runner/idle-reaper.ts hash == 8eea049e (Phase 165-01)
---

## Summary

Implemented file-backed `SessionStore` for `CcPtySession` metadata at
`<vaultPath>/.claude/livos-cc-sessions.json` with schemaVersion=1 envelope,
atomic `.tmp` + rename writes, single-writer in-process Promise-chain
mutex, schemaVersion guard, and `.claude/` directory auto-creation.

## Acceptance Evidence

- `pnpm --filter livinityd exec vitest run source/modules/cc-pty/session-store.test.ts` — **12 passed** in 412ms
- All cc-pty tests combined: 19 (types) + 12 (session-store) = **31 passed** in 423ms
- tsc --noEmit: 0 NEW errors in cc-pty/* (baseline 399 unchanged)
- Sacred guards: 8/8 byte-identical against baseline

## Notes

- Initial GREEN attempt failed assertion 11 (single-writer serialization, 5 parallel `add()` → only 1 entry preserved). Fixed by moving the load+mutate+save read-modify-write cycle INSIDE `enqueueWrite()` instead of only serializing the save call. This is a Rule 1 auto-fix (bug — concurrent `add()` had a TOCTOU race; the spec required no lost writes).
- The `enqueueWrite()` helper swallows rejections only on the queue-tail capture (so a failed write doesn't poison subsequent writes), while propagating the actual op result to the awaiting caller.
- Plan executed verbatim otherwise.

## Self-Check: PASSED

- Files created: session-store.ts, session-store.test.ts ✓
- index.ts barrel updated with SessionStore export ✓
- 12/12 vitest GREEN ✓
- All 8 sacred guard files byte-identical ✓
