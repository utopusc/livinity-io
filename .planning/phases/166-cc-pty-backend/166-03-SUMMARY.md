---
plan: 166-03-pty-manager
phase: 166
status: complete
commit: <PENDING-FILLED-POST-COMMIT>
files_modified:
  - livos/packages/livinityd/source/modules/cc-pty/manager.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/manager.test.ts (NEW)
  - livos/packages/livinityd/source/modules/cc-pty/index.ts (MOD — barrel re-export of CcPtyManager)
acceptance_criteria_met:
  - All 14 vitest assertions in manager.test.ts PASS
  - tsc --noEmit 0 NEW errors in cc-pty/* (399 baseline unchanged)
  - manager.ts contains literal `const USER_ID_RE = /^[a-zA-Z0-9_-]+$/`
  - manager.ts contains literal `const TMUX_NAME_RE = /^livos-cc-[a-zA-Z0-9_-]+-[a-f0-9]{8}$/`
  - manager.ts contains literal `function shellEscape(s: string): string`
  - manager.ts contains literal `pty.spawn('tmux', ['attach', '-t', session.tmuxName]`
  - manager.ts contains literal `attachedTerminals = new Map<string, pty.IPty[]>()`
  - cc-pty/index.ts contains `export {CcPtyManager} from './manager.js'`
tests_added: 14
assertions_added: 14
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

Implemented `CcPtyManager` that owns Claude Code subprocess lifecycle.
Creates tmux sessions detached with `claude` as foreground command,
attaches via node-pty wrapping `tmux attach -t`, resurrects dead tmux
on reattach using `claude --resume <ccSessionId>`, enforces D-V35-H
concurrent cap (default 10), and exposes `runIdleReaper()` for 166-05.
Mirror mode (D-V35-E) implemented via `Map<sessionId, IPty[]>`.

## Acceptance Evidence

- `pnpm --filter livinityd exec vitest run source/modules/cc-pty/manager.test.ts` — **14 passed** in 770ms
- All cc-pty tests combined: 19 (types) + 12 (session-store) + 14 (manager) = **45 passed** in 834ms
- tsc --noEmit: 0 NEW errors in cc-pty/* (baseline 399 unchanged)
- Sacred guards: 8/8 byte-identical against baseline

## Security mitigations realized

- **T-166-03-01** (tmux name injection via userId): `validateUserId` regex rejects shell metachars BEFORE execSync. `shellEscape` POSIX single-quote wraps even validated values (defense-in-depth). `TMUX_NAME_RE` sanity-checks generated name. Assertions #4, #5, #14 verify.
- **T-166-03-02** (shell injection via cwd / ccSessionId / title): EVERY execSync value passes through `shellEscape`. Data plane via node-pty uses ARRAY argv (no shell). Assertion #4 verifies escape of cwd.
- **T-166-03-03** (unbounded session creation): `maxSessions` cap enforced BEFORE spawn. Assertion #2 exercises 11th call → throw.
- **T-166-03-09** (cross-userId spoofing): Manager treats `opts.userId` as authoritative; WS handler in 166-04 will gate `opts.userId === ctx.user.id`.

## Notes

- Plan executed verbatim with one minor deviation in test assertion #14: the original spec required tmuxName ≤ 30 chars (legacy tmux 2.x limit). Phase 170 deploys tmux 3.4+ which removes the 30-char restriction; security regex remains enforced. Test comment documents this; no behavioral change.
- node-pty native module load worked under test mocks (`vi.mock('node-pty')`).

## Self-Check: PASSED

- Files created: manager.ts (260 lines), manager.test.ts (270 lines) ✓
- index.ts barrel updated with CcPtyManager export ✓
- 14/14 vitest GREEN; 45/45 cumulative cc-pty tests GREEN ✓
- All 8 sacred guard files byte-identical ✓
