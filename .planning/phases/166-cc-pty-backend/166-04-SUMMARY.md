---
plan: 166-04-ws-handler
phase: 166
status: complete
commit: 6e9e2bc6
files_modified:
  - livos/packages/livinityd/source/modules/cc-pty/ws-handler.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/ws-handler.test.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/index.ts (MOD — barrel re-export of createCcPtyWsHandler)
  - livos/packages/livinityd/source/modules/server/index.ts (MOD — mount /ws/cc-pty + import createCcPtyWsHandler)
  - livos/packages/livinityd/source/index.ts (MOD — add ccPtyManager? + ccPtySessionStore? typed optional fields)
acceptance_criteria_met:
  - All 10 vitest assertions in ws-handler.test.ts PASS
  - tsc --noEmit 0 NEW errors in cc-pty/* or server/index.ts mount block (baseline 399 unchanged)
  - ws-handler.ts contains literal `MAX_STDIN_BYTES = 1024 * 1024`
  - ws-handler.ts contains literal `ws.close(WS_CLOSE_POLICY` (1008 auth/ownership)
  - ws-handler.ts contains literal `ws.close(WS_CLOSE_OVERSIZE` (1009 oversize)
  - ws-handler.ts contains literal `chunk.toString('base64')` (stdout encoding)
  - ws-handler.ts contains literal `session.userId !== user.id` (ownership check)
  - cc-pty/index.ts contains `export {createCcPtyWsHandler} from './ws-handler.js'`
  - server/index.ts contains `/ws/cc-pty` exactly once (in the new mount block, line 1436)
  - git diff livos/.../server/ws-agent.ts is EMPTY (Phase 163 byte-identical)
tests_added: 10
assertions_added: 10
sacred_guards_verified:
  - liv/packages/core/src/sdk-agent-runner.ts hash == f3538e1d (Sacred SHA)
  - livos/.../computer-use/luse-system-prompt.ts hash == 2083f0a3 (D-09)
  - livos/.../ai/agent-prompt-builder.ts hash == dc1831f5 (Phase 161-02)
  - livos/.../claude-runner/vault-scaffolder.ts hash == 5ddfd065 (Phase 162-01)
  - liv/packages/core/src/agent-session.ts hash == 7c690d59 (Phase 162-02)
  - livos/.../server/ws-agent.ts hash == 8fee9a1d (Phase 163 surface UNCHANGED)
  - livos/.../autonomous-scheduler/scheduler.ts hash == f7c03317 (Phase 164 core)
  - livos/.../claude-runner/idle-reaper.ts hash == 8eea049e (Phase 165-01)
---

## Summary

Built `/ws/cc-pty` WebSocket endpoint that authenticates clients via JWT
(cookie / Bearer / url-param — pattern mirrored from ws-agent.ts BUT
ws-agent.ts itself UNCHANGED), validates session ownership (cross-user
attach rejected with 1008), and plumbs the 4 client→server envelope
types into `CcPtyManager.attachSession`. Mounted in `server/index.ts`
right after `/ws/ssh-sessions`. The `ccPtyManager` + `ccPtySessionStore`
fields on Livinityd are declared TYPED but UNDEFINED — Plan 166-05
instantiates them at boot. Until then the connection handler closes
with 1011 ("cc-pty backend not ready").

## Acceptance Evidence

- `pnpm --filter livinityd exec vitest run source/modules/cc-pty/ws-handler.test.ts` — **10 passed** in 437ms
- All cc-pty tests combined: 19 + 12 + 14 + 10 = **55 passed** in 748ms
- tsc --noEmit: 0 NEW errors (baseline 399 unchanged; no tsc errors mention cc-pty / `/ws/cc-pty` / `ccPtyManager` / `ccPtySessionStore` / `createCcPtyWsHandler`)
- Sacred guards: 8/8 byte-identical against baseline
- ws-agent.ts: byte-identical — `git hash-object` returns `8fee9a1d75593a5c467a4868739ff56c0073b4b2` (baseline)

## Security mitigations realized (STRIDE)

- **T-166-04-01** unauthenticated connection → `ws.close(1008, 'unauthorized')` BEFORE manager.attachSession (assertion #1)
- **T-166-04-02** cross-user attach → log + error frame + `ws.close(1008, 'cross-user attach forbidden')` (assertion #3)
- **T-166-04-03** oversize stdin (>1MB) → error frame + `ws.close(1009, 'stdin oversize')` BEFORE pty.write (assertion #6)
- **T-166-04-04** malformed JSON → `{type:'error',message:'malformed JSON'}` without socket close (assertion #10)
- **T-166-04-05** invalid resize dims → error frame, no resize call (validation: finite + 1..1000)
- **T-166-04-06** Phase 163 ws-agent.ts UNCHANGED — JWT pattern COPIED into the mount block (no shared helper, no refactor)
- **T-166-04-10** detached handle reuse → after `detach`, subsequent stdin returns `{type:'error',message:'not attached'}` (assertion #7)

## Notes

- The mount block in `server/index.ts` references `this.livinityd.ccPtyManager` and `.ccPtySessionStore` — both typed optional fields declared on the Livinityd class in this same commit. Plan 166-05 will REPLACE the type-only placeholder imports with value imports + instantiate the manager/store at boot.
- Plan executed verbatim. No deviations.

## Self-Check: PASSED

- Files created: ws-handler.ts (180 lines), ws-handler.test.ts (210 lines) ✓
- server/index.ts: cc-pty import + mount block added, no other lines touched ✓
- livinityd/source/index.ts: type-only imports extended + 2 optional class fields added ✓
- 10/10 vitest GREEN; 55/55 cumulative cc-pty tests GREEN ✓
- All 8 sacred guard files byte-identical ✓
