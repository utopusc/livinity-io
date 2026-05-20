---
plan: 166-05-boot-wireup-and-idle-reaper
phase: 166
status: complete
commit: 64596174
files_modified:
  - livos/packages/livinityd/source/modules/cc-pty/idle-reaper.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/idle-reaper.test.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/index.ts (MOD — barrel re-export of CcPtyIdleReaper)
  - livos/packages/livinityd/source/index.ts (MOD — replace placeholder import with value-import; add CcPtyManager + SessionStore + CcPtyIdleReaper boot wire-up + shutdown hooks)
  - livos/packages/livinityd/source/index.boot-order.test.ts (NEW — source-text regression test, 8 assertions)
acceptance_criteria_met:
  - All 8 vitest assertions in cc-pty/idle-reaper.test.ts PASS
  - All 8 vitest assertions in source/index.boot-order.test.ts PASS
  - tsc --noEmit 0 NEW errors in cc-pty/* or source/index.ts (baseline 399 unchanged)
  - cc-pty/idle-reaper.ts contains literal `const DEFAULT_POLL_INTERVAL_MS = 5 * 60_000`
  - cc-pty/idle-reaper.ts contains literal `setInterval(() =>`
  - cc-pty/index.ts contains `export {CcPtyIdleReaper} from './idle-reaper.js'`
  - livinityd/source/index.ts contains literal `import {CcPtyManager, SessionStore, CcPtyIdleReaper} from './modules/cc-pty/index.js'`
  - livinityd/source/index.ts does NOT contain `_CcPtyTypeProbe` (placeholder removed)
  - livinityd/source/index.ts contains `new CcPtyManager(` exactly once + `new CcPtyIdleReaper(` exactly once
  - livinityd/source/index.ts contains `await this.ccPtyManager?.stop()` (shutdown hook)
  - Source-text ordering: `new CcPtyManager(` appears between `new IdleSessionReaper(` and `drainInstallPendingRedisKeys(`
  - git diff livos/.../claude-runner/idle-reaper.ts is EMPTY (Phase 165-01 byte-identical)
  - All 8 sacred guard files byte-identical
tests_added: 16
assertions_added: 16
sacred_guards_verified:
  - liv/packages/core/src/sdk-agent-runner.ts hash == f3538e1d (Sacred SHA)
  - livos/.../computer-use/luse-system-prompt.ts hash == 2083f0a3 (D-09)
  - livos/.../ai/agent-prompt-builder.ts hash == dc1831f5 (Phase 161-02)
  - livos/.../claude-runner/vault-scaffolder.ts hash == 5ddfd065 (Phase 162-01)
  - liv/packages/core/src/agent-session.ts hash == 7c690d59 (Phase 162-02)
  - livos/.../server/ws-agent.ts hash == 8fee9a1d (Phase 163 surface)
  - livos/.../autonomous-scheduler/scheduler.ts hash == f7c03317 (Phase 164 core)
  - livos/.../claude-runner/idle-reaper.ts hash == 8eea049e (Phase 165-01 UNCHANGED — new cc-pty/idle-reaper.ts is a SEPARATE file)
---

## Summary

Final plan of Phase 166. Wires `CcPtyManager` + `SessionStore` +
`CcPtyIdleReaper` into livinityd boot ordering between `IdleSessionReaper.start()`
and `drainInstallPendingRedisKeys`. New `cc-pty/idle-reaper.ts` MIRRORS the
Phase 165-01 `claude-runner/idle-reaper.ts` pattern but is a SEPARATE FILE —
the 165-01 reaper is byte-identical (different concern: native CC sessions
vs PTY-backed CC sessions). Shutdown hook registers
`ccPtyIdleReaper.stop()` + `await ccPtyManager.stop()` so the 5-min interval
timer winds down cleanly; tmux sessions OUTLIVE livinityd by design (D-V35-A),
so manager.stop() only detaches in-process pty handles.

## Acceptance Evidence

- `pnpm --filter livinityd exec vitest run source/modules/cc-pty/idle-reaper.test.ts` — **8 passed**
- `pnpm --filter livinityd exec vitest run source/index.boot-order.test.ts` — **8 passed**
- Combined cc-pty + boot-order: **71 passed** (19 types + 12 store + 14 manager + 10 ws + 8 idle-reaper + 8 boot-order)
- tsc --noEmit: 0 NEW errors (baseline 399 unchanged; no tsc errors mention cc-pty / CcPtyManager / CcPtyIdleReaper / ccPtyManager / ccPtySessionStore / ccPtyIdleReaper / SessionStore / index.boot-order)
- Sacred guards: 8/8 byte-identical against baseline
- Phase 165-01 `claude-runner/idle-reaper.ts` SPECIFICALLY: hash `8eea049e` unchanged — new `cc-pty/idle-reaper.ts` is a SEPARATE file

## Boot Order Transcript

Canonical 7-step start() sequence verified by source-text grep:

```
1. scaffoldVault(                              ─┐
2. smokeAuthCheck(                             ─┤  pre-existing boot stages
3. new AutonomousScheduler( + .start()          │  (Phase 162/163/164/165-01)
4. new IdleSessionReaper(    + .start()        ─┘
5. new CcPtyManager(         + .start()        ─┐
6. new CcPtyIdleReaper(      + .start()        ─┤  Phase 166-05 NEW
                                                │  (this commit)
7. drainInstallPendingRedisKeys(               ─┘  pre-existing post-boot
```

Shutdown order (in `async stop()`):
```
backups.stop → autonomousScheduler?.stop → idleReaper?.stop →
ccPtyIdleReaper?.stop → await ccPtyManager?.stop → stopHeartbeat? →
nativeAppIdleReaperStop? → webappWindowManager?.stopIdleCleanup →
fluxboxHandle?.stop → xvfbHandle?.stop → ...
```

## Notes

- Plan executed verbatim — no deviations.
- `vaultResult` (referenced in plan-spec) is local to the scaffoldVault try/catch; used the hardcoded `/home/bruce/livinity-vault` (same value scaffoldVault uses).
- Logger adapter wraps livinityd's logger to provide both `log` and `warn` (warn falls back to log on the livinityd logger which only exposes log/verbose/error).

## Self-Check: PASSED

- Files created: cc-pty/idle-reaper.ts, cc-pty/idle-reaper.test.ts, source/index.boot-order.test.ts ✓
- cc-pty/index.ts barrel updated with CcPtyIdleReaper export ✓
- livinityd/source/index.ts: placeholder removed, value-import added, 3 class fields, wire-up block, shutdown hooks ✓
- 16/16 new vitest GREEN (8 idle-reaper + 8 boot-order); 71/71 cumulative ✓
- All 8 sacred guard files byte-identical (incl. Phase 165-01 idle-reaper.ts) ✓
