---
phase: 166
status: passed
commits:
  - 4dd30c83  # 166-01 cc-pty module scaffold (types + barrel + placeholder import)
  - 3e72db4a  # 166-02 SessionStore — file-backed CcPtySession metadata
  - 8827d2a9  # 166-03 CcPtyManager — tmux + node-pty bridge
  - 6e9e2bc6  # 166-04 /ws/cc-pty WebSocket handler — JWT auth + ownership gate
  - 64596174  # 166-05 boot wire-up + cc-pty idle reaper — Phase 166 close
test_assertions_total: 71
must_haves:
  - "createSession spawns tmux detached with claude as init command — PASSED (manager.test.ts assertion #4: tmux new-session command string contains shell-escaped cwd + literal 'HOME=/root claude')"
  - "attachSession resurrects dead tmux with --resume — PASSED (manager.test.ts assertion #8: has-session non-zero → new-session BEFORE pty.spawn; assertion #9: --resume <ccSessionId> when set, bare claude otherwise)"
  - "WS endpoint /ws/cc-pty mounted and JWT-validated — PASSED (server/index.ts grep: '/ws/cc-pty' present exactly once at line 1436; ws-handler.test.ts assertion #1: resolveUser→null closes 1008)"
  - "Idle reaper kills 24h+ sessions — PASSED (manager.test.ts assertion #13: runIdleReaper kills entries where max(lastAttachedAt, lastMessageAt, createdAt) < now - idleHours*3600000 ms; returns {reaped:2/3} for the 2-stale-1-fresh fixture)"
  - "Boot order regression: scaffoldVault → smokeAuthCheck → AutonomousScheduler → IdleSessionReaper → CcPtyManager → CcPtyIdleReaper → drainInstallPendingRedisKeys — PASSED (index.boot-order.test.ts 8/8 assertions)"
sacred_guards_post_phase:
  - "sdk-agent-runner.ts SHA256: f3538e1d811992b782a9bb057d1b7f0a0189f95f — PRESERVED (Sacred SHA)"
  - "D-09 luse-system-prompt.ts: 2083f0a3 — PRESERVED"
  - "Phase 161-02 agent-prompt-builder.ts: dc1831f5 — PRESERVED"
  - "Phase 162-01 vault-scaffolder.ts: 5ddfd065 — PRESERVED"
  - "Phase 162-02 agent-session.ts: 7c690d59 — PRESERVED"
  - "Phase 163 ws-agent.ts surface routing: 8fee9a1d — PRESERVED (the JWT auth pattern is COPIED into the /ws/cc-pty mount block, not extracted into a shared helper)"
  - "Phase 164 autonomous-scheduler core: f7c03317 — PRESERVED"
  - "Phase 165-01 claude-runner/idle-reaper.ts: 8eea049e — PRESERVED (new cc-pty/idle-reaper.ts is a SEPARATE file mirroring the pattern, not modifying 165-01)"
human_verification:
  - "Real tmux smoke test on Mini PC (deferred to Phase 170 deploy + UAT — vitest uses execSync + node-pty stubs locally)"
  - "Real `claude` binary spawn with --resume flag (Phase 170)"
  - "Real WebSocket round-trip from xterm.js (Phase 167/168 once frontend lands)"
  - "Boot livinityd on Mini PC and observe log lines:  '[cc-pty] tmux available: tmux 3.4', '[cc-pty/reaper] boot one-shot reaped=N', '[cc-pty/reaper] started — poll every 300s' (Phase 170)"
deferred_items:
  - "399 pre-existing tsc baseline errors (see deferred-items.md) — out of scope per SCOPE BOUNDARY; existed on baseline master before Phase 166; unchanged by all 5 plans"
---

# Phase 166 — VERIFICATION

## Summary

Phase 166 (CC PTY Backend) is **CODE-COMPLETE** on master. 5 plans shipped
in 5 atomic commits (one per plan), 71 vitest assertions added, all 8
sacred guard files byte-identical, 0 new tsc errors. The livinityd-side
infrastructure for tmux/node-pty-backed Claude Code sessions is wired and
ready for Mini PC deploy in Phase 170.

## Files Created / Modified (15 files total)

| Plan | Files | Lines | Tests |
|------|-------|-------|-------|
| 166-01 | cc-pty/{types,index,types.test}.ts + livinityd/source/index.ts (placeholder) | +175 | 19 |
| 166-02 | cc-pty/{session-store,session-store.test}.ts + index.ts (barrel) | +335 | 12 |
| 166-03 | cc-pty/{manager,manager.test}.ts + index.ts (barrel) | +535 | 14 |
| 166-04 | cc-pty/{ws-handler,ws-handler.test}.ts + server/index.ts (mount) + source/index.ts (fields) | +470 | 10 |
| 166-05 | cc-pty/{idle-reaper,idle-reaper.test}.ts + index.ts + source/index.ts (boot+shutdown) + index.boot-order.test.ts | +465 | 16 |
| **Total** | **15 new + 3 modified** | **~1980** | **71** |

## Boot Order Lock (post-166-05)

```
1. scaffoldVault(                              [Phase 162-01]
2. smokeAuthCheck(                             [Phase 162-03]
3. new AutonomousScheduler( + .start()         [Phase 164-02]
4. new IdleSessionReaper(    + .start()        [Phase 165-01]
5. new CcPtyManager(         + .start()        ← Phase 166-05
6. new CcPtyIdleReaper(      + .start()        ← Phase 166-05
7. drainInstallPendingRedisKeys(               [Phase 141-01]
```

Source-text regression test (`source/index.boot-order.test.ts`, 8 assertions)
locks this ordering across future commits.

## Security Mitigations Realized (STRIDE Highlights)

| Threat ID | Component | Mitigation | Test |
|-----------|-----------|------------|------|
| T-166-03-01 | tmux session name injection via userId | USER_ID_RE regex + shellEscape defense-in-depth + TMUX_NAME_RE sanity check | manager.test.ts #4 / #5 / #14 |
| T-166-03-02 | shell injection via cwd / ccSessionId / title | shellEscape on every execSync arg; node-pty array argv (no shell) | manager.test.ts #4 |
| T-166-03-03 | unbounded session creation | maxSessions cap (default 10) BEFORE spawn | manager.test.ts #2 |
| T-166-04-01 | unauth WS connection | ws.close(1008) BEFORE manager.attachSession | ws-handler.test.ts #1 |
| T-166-04-02 | cross-user attach | log + error + ws.close(1008) | ws-handler.test.ts #3 |
| T-166-04-03 | oversize stdin (>1MB) | error + ws.close(1009) BEFORE pty.write | ws-handler.test.ts #6 |
| T-166-04-04 | malformed JSON | error frame, no socket close | ws-handler.test.ts #10 |
| T-166-04-06 | Phase 163 ws-agent.ts | UNCHANGED — JWT pattern COPIED into mount block | git hash-object: 8fee9a1d |
| T-166-05-01 | Phase 165-01 idle-reaper.ts | UNCHANGED — new file mirrors pattern | git hash-object: 8eea049e |
| T-166-05-02 | tmux-missing host blocks boot | non-fatal try/catch wraps wire-up | wire-up code review + Phase 170 live verification |

## Pre-existing tsc baseline

399 pre-existing tsc errors documented in `deferred-items.md`. All 5
Phase 166 plans add ZERO new tsc errors anywhere in cc-pty/ or in the
livinityd boot wire-up sites.

## Outstanding human verification

Phase 170 (Mini PC apt install tmux + deploy + UAT walk) is required to
prove the runtime side: real tmux 3.4+, real `claude` binary spawn with
`--resume`, real WebSocket round-trip from xterm.js (which Phase 167
will deliver).

## Phase 166 Close

Ready for:
- Phase 167 (xterm.js frontend — parallel, different files)
- Phase 169 (vault memory graph — parallel, different files)
- Phase 168 (session sidebar — Wave 2, depends on 166 + 167)
- Phase 170 (Mini PC deploy + UAT — Wave 3, depends on all)
