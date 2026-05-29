---
phase: 246
status: SHIPPED-ARTIFACT
artifact_complete_on: 2026-05-28
shipped_on: minipc-pending-operator-deploy
plans: 6
plans_complete: 6
deployed_sha_expected: c72a87d4
sacred_sha_preserved: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_file_sha256: 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe
subsystem: livos/packages/livinityd/pty-sessions + livos/packages/ui/features/v43-terminal + livos/packages/ui/features/v44-admin-terminals
tags: [terminal, multi-session, pty, redis-scrollback, ttl-gc, xterm, websocket, admin-panel, attach-reattach, wave-final]
provides:
  - SessionManager (Map<sessionId, Session> ownership boundary, composition over inheritance)
  - Per-session 10000-line Redis scrollback ring (LIST `livos:pty:session:<id>:scrollback`)
  - WS protocol extension `/livos/terminal/ws?create | ?attach=<id> | (no query)`
  - `{type:'reattached', sessionId, scrollback}` server-emitted frame on `?attach`
  - 4404 close code for unknown attach id (client cleanup signal)
  - PtY-survives-ws.close semantic break (only explicit `{type:'close'}` / PTY exit / admin kill destroys)
  - `createPtySessionsAdminRouter` (listSessions + killSession adminProcedure)
  - `Server.ptySessionManager` per-livinityd-process SessionManager singleton
  - `TerminalTabBar` controlled component (rename + close context menu + "+ New")
  - `PersistentTerminalPanel` multi-tab host (mount-time reattach from localStorage)
  - `TERMINAL_SESSION_STORAGE_PREFIX = 'livos.v44.terminal.session.'` drift-locked
  - `useNewTabKey()` hook — stable per-tab uuidv7
  - TTL GC factory `createTtlGc({...}) → IdleSweep` (start/stop/sweepNow)
  - `TTL_GC_DEFAULT_IDLE_MS = 86400000` (24h drift-lock)
  - `TTL_GC_DEFAULT_SWEEP_MS = 3600000` (1h drift-lock)
  - `Server.ptyTtlGc` constructor-init singleton wired in WS-mount tail
  - `ActiveTerminalsPanel` React admin panel (rows + Kill button + 5s refetchInterval, gated by v43 flag)
  - `SystemSection` wrapper embedded under Settings → Troubleshoot (additive, v36 NO-BOLD-REDESIGNS honored)
requires:
  - Phase 243 single-session MVP (preserved verbatim; v44 is opt-in via tab bar)
  - Phase 243 PtySession factory (composed, never modified)
  - Phase 243 WS handler + cookie auth (extended)
  - Phase 243 Caddy `/livos/terminal/*` matcher (UNCHANGED — D-V44-CADDY-REUSE-226-04)
  - Phase 243 dock entry + TerminalRouteShell flag swap (UNCHANGED)
  - Phase 243 `livos:v43:terminal_panel` Redis flag (preserved; doubles as v44 dock+admin-panel gate)
  - v7.0 adminProcedure / RBAC primitive (Phase 7 multi-user infra)
affects:
  - livos/packages/livinityd/source/modules/pty-sessions/ (8 new files + barrel)
  - livos/packages/livinityd/source/modules/server/index.ts (SessionManager + TTL GC singletons + WS-mount dep)
  - livos/packages/livinityd/source/modules/server/trpc/index.ts (ptySessions sub-router slot)
  - livos/packages/livinityd/source/modules/server/trpc/common.ts (2 httpOnlyPaths entries)
  - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx (major multi-tab refactor)
  - livos/packages/ui/src/features/v43-terminal/* (TerminalTabBar + terminal-session-storage + useNewTabKey)
  - livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.tsx (new)
  - livos/packages/ui/src/modules/settings/system-section.tsx (new wrapper)
  - livos/packages/ui/src/routes/settings/_components/settings-content.tsx (SystemSectionLazy embed under border-t divider)
tech-stack:
  added:
    - uuidv7 → UI deps (already in livinityd from Phase 243)
  patterns:
    - Composition over inheritance (SessionManager wraps PtySession; Session record holds pty)
    - DI seam via ptySessionFactory + nowFn + setIntervalFn + clearIntervalFn (no wall-clock in unit tests)
    - Constructor-init for singletons that need `this.logger` (TTL GC; class-field initializers can't reference instance state)
    - Wrapper logger adapter — `{info(msg, ctx)}` contract bridged to livinityd's `{log,verbose,error}` via JSON.stringify(ctx)
    - Self-gated UI components (hook-first, early-return-after-hooks) — preserves React rules-of-hooks while honoring v43 flag
    - Stateless DI Redis modules (every function takes the redis client — mirrors Phase 243 metadata.ts shape)
    - Ring buffer via RPUSH + LTRIM key -N -1 (Redis-idiomatic bounded LIST)
    - data-testid prefix queries for variable-cardinality lists (`[data-testid^="session-row-"]`)
    - mount-time localStorage scan + parallel reattach (UI tab restore)
    - 4404 close code as client-cleanup signal (stale localStorage entries)
key-files:
  created:
    # Plan 246-01 — Backend SessionManager
    - livos/packages/livinityd/source/modules/pty-sessions/session-manager.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/session-manager.test.ts
    # Plan 246-02 — Redis scrollback ring
    - livos/packages/livinityd/source/modules/pty-sessions/scrollback.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/scrollback.test.ts
    # Plan 246-03 — WS protocol + admin tRPC
    - livos/packages/livinityd/source/modules/pty-sessions/admin-router.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/admin-router.test.ts
    # Plan 246-04 — UI tab bar + reattach
    - livos/packages/ui/src/features/v43-terminal/TerminalTabBar.tsx
    - livos/packages/ui/src/features/v43-terminal/TerminalTabBar.test.tsx
    - livos/packages/ui/src/features/v43-terminal/terminal-session-storage.ts
    - livos/packages/ui/src/features/v43-terminal/use-new-tab-key.ts
    # Plan 246-05 — TTL GC + admin panel
    - livos/packages/livinityd/source/modules/pty-sessions/ttl-gc.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ttl-gc.test.ts
    - livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.tsx
    - livos/packages/ui/src/features/v44-admin-terminals/ActiveTerminalsPanel.test.tsx
    - livos/packages/ui/src/modules/settings/system-section.tsx
    # Plan 246-06 — deploy + UAT
    - .planning/phases/246-terminal-v2-multi-session/246-06-DEPLOY-LOG.md
    - .planning/phases/246-terminal-v2-multi-session/246-06-UAT-CHECKLIST.md
    - .planning/phases/246-terminal-v2-multi-session/246-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/types.ts
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel — repeatedly extended across all 5 code plans)
    - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts (Plan 246-03 routing)
    - livos/packages/livinityd/source/modules/server/index.ts (SessionManager + TTL GC singletons)
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (ptySessions slot in createAppRouter)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (2 httpOnlyPaths entries)
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx (major multi-tab refactor)
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx (rewritten for tabs)
    - livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts (mode + sessionId opts; default mode='create')
    - livos/packages/ui/src/routes/settings/_components/settings-content.tsx (SystemSectionLazy embed)
    - livos/packages/ui/package.json (uuidv7 dep added)
decisions:
  - "L-246-A: SessionManager owns all PTY lifecycle. Composition over inheritance — Session record holds `pty: PtySession`; rename/touch mutate manager-owned fields without touching PtySession class. Keeps Phase 243 single-session unit completely intact, callable as a degenerate case of the v44 multi-session manager."
  - "L-246-B: ws.close → no-kill (deliberate semantic break vs Phase 243). PtY survives ws.close so the same session can be re-attached after browser reload. Only explicit `{type:'close'}` client frame / PTY natural exit / admin Kill terminates the PTY. Trade-off: more PTYs alive at idle → bounded by 24h TTL GC."
  - "L-246-C: D-V44-CADDY-REUSE-226-04 enforced — `caddy.ts` byte-identical across all 26 commits of Phase 246. The new query-string variants (`?create`, `?attach=<id>`) ride the existing `/livos/terminal/*` path matcher emitted by Phase 226-04 (matchers route by path, not query). Verified: `git diff 2b07bed7..c72a87d4 -- caddy.ts | wc -l` = 0."
  - "L-246-D: TTL GC singleton initialized in Server constructor (NOT class field initializer) — needs `this.logger` which is constructor-assigned. Wrapper logger adapter JSON.stringifies ctx into livinityd's `log(msg)` contract so audit trail (T-246-05-03 mit) flows through `journalctl -u livos -t pty-ttl-gc`."
  - "L-246-E: D-V44-SACRED preserved at every commit. `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every Phase 246 plan tip. Pre-commit `sacred-sha` hook `[sacred-sha] PASS: 20 files verified` on every feat/test/docs commit."
  - "L-246-F: LivOS WINDOW-LOGIC + v36 NO-BOLD-REDESIGNS honored throughout. Admin panel embedded inside existing TroubleshootSection (NO new Route, NO Navigate, NO URL launcher); UI tab bar grows on top of existing terminal window content (no menu reshuffle, no existing layout removal)."
metrics:
  duration: ~24h elapsed (single-day milestone burst 2026-05-28; non-blocking overnight)
  plans: 6
  plans_complete: 6
  tasks_total: ~21 (3 + 3 + 4 + 4 + 4 + 3)
  commits_total: ~30 across all 6 plans (incl. RED/GREEN/wire/docs per plan)
  tests_added_cumulative:
    pty-sessions_module: 73 GREEN (12 + 10 + 21 + 4 + 6 + 4 + 16 carryover from 243)
    ui_v43-terminal: ~13 GREEN (rename/close/create/activate + reattach + multi-tab restore)
    ui_v44-admin-terminals: 4 GREEN (flag-gate + list + kill mutation + 2-row render)
    admin-router: 4 GREEN (listSessions + killSession adminProcedure)
  files_created: 18
  files_modified: 11
  completed: 2026-05-28
---

# Phase 246: Terminal v2 — multi-session + reattach + TTL GC — Summary

## One-liner

Take the v43 Phase 243 single-session MVP terminal and ship the v44 production version: **multiple named tabs in one dock window, each session survives browser reload, idle sessions auto-collect at 24h, admin "kill session by id" UI** — all behind the existing `livos:v43:terminal_panel` flag (no new flag) and the existing Caddy `/livos/terminal/*` matcher (D-V44-CADDY-REUSE-226-04).

## Per-plan rollup

| Plan | Wave | Status | Commits | Key delivery |
|---|---|---|---|---|
| 246-01 — Backend SessionManager | 1 | ✅ CODE-COMPLETE | 4 | `SessionManager` Map<sessionId, Session> ownership + 12/12 vitest GREEN; composition-over-inheritance keeps Phase 243 PtySession intact |
| 246-02 — Redis scrollback ring + lastAttachAt | 1 | ✅ CODE-COMPLETE | 4 | 10000-line ring at `livos:pty:session:<id>:scrollback` (RPUSH + LTRIM); `touchLastAttachAt`; 10/10 vitest GREEN |
| 246-03 — WS protocol extension (create/attach) + admin tRPC | 2 | ✅ CODE-COMPLETE | 6 | `?create` / `?attach=<id>` / no-query routing; `{type:'reattached'}` frame; 4404 close code; `createPtySessionsAdminRouter` (listSessions + killSession); SessionManager singleton wired in Server; 21+4 GREEN; ws.close → no-kill semantic break landed |
| 246-04 — UI tab bar + reattach | 3 | ✅ CODE-COMPLETE | 4 | `TerminalTabBar` controlled component; `PersistentTerminalPanel` multi-tab refactor; `TERMINAL_SESSION_STORAGE_PREFIX` drift-lock; mount-time localStorage scan + parallel reattach; uuidv7 dep added to UI; ~13 GREEN |
| 246-05 — TTL GC + admin Active Terminals panel | 3 | ✅ CODE-COMPLETE | 4 | `createTtlGc` factory with DI'd timer (24h idle / 1h sweep drift-locked); Server-constructor singleton; `ActiveTerminalsPanel` admin UI with Kill button; embedded under Settings → Troubleshoot via SystemSection wrapper; 6+4 GREEN |
| 246-06 — Mini PC deploy + smoke probes + UAT | 4 | ⏳ ARTIFACT-COMPLETE / OPERATOR-PENDING DEPLOY | TBD | 26 commits pushed to origin/master; deploy log + 5 smoke probe scripts + 7-item UAT checklist + phase SUMMARY + ROADMAP flip + STATE update; **Mini PC `update.sh` deferred to operator** — SSH unreachable from executor host (TCP completes, ECDH stalls — see 246-06-DEPLOY-LOG.md "SSH reachability gate") |

## Drift-locks cumulative

| Constant | Value | Test source | Locked since |
|---|---|---|---|
| `PTY_SESSION_REDIS_PREFIX` | `'livos:pty:session:'` | Phase 243-01 (preserved) | 243-01 |
| `PTY_SESSION_SCROLLBACK_SUFFIX` | `':scrollback'` | `scrollback.test.ts` | 246-02 |
| `SCROLLBACK_MAX_LINES` | `10000` | `scrollback.test.ts` (D-V44-TERMINAL-SCROLLBACK-RING) | 246-02 |
| `TTL_GC_DEFAULT_IDLE_MS` | `24 * 60 * 60 * 1000` (86_400_000) | `ttl-gc.test.ts` case 1 | 246-05 |
| `TTL_GC_DEFAULT_SWEEP_MS` | `60 * 60 * 1000` (3_600_000) | `ttl-gc.test.ts` case 2 | 246-05 |
| `TERMINAL_SESSION_STORAGE_PREFIX` | `'livos.v44.terminal.session.'` | UI feature tests | 246-04 |
| `4404` close code (unknown attach id) | `4404` | `ws-handler.test.ts` (Phase 246-03) + UI 4404 cleanup test | 246-03 |
| `{type:'reattached', sessionId, scrollback}` single-frame shape | exact literal | `ws-handler.test.ts` + UI test | 246-03 |

## D-V44 invariant verification (executor host, pre-push)

- ✅ **D-V44-SACRED** — sacred git blob `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` matches at executor HEAD `c72a87d4`. Pre-commit hook `[sacred-sha] PASS: 20 files verified` fired on every commit of the 26.
- ✅ **D-V44-MINI-PC-ONLY** — Plan 246-06 only references `bruce@10.69.31.68` (Mini PC). No Server4 reference anywhere in Phase 246. No Server5 reference. Per HARD RULE 2026-04-27.
- ✅ **D-V44-CADDY-REUSE-226-04** — `git diff 2b07bed7..c72a87d4 -- livos/packages/livinityd/source/modules/domain/caddy.ts` returns 0 lines. Caddy emitter byte-identical across all 26 commits.
- ✅ **D-V44-NO-ROOT-PTY** — SessionManager.create() does NOT catch non-bruce throw (Phase 246-01 decision); defense-in-depth preserved through to v44.
- ✅ **D-V44-TERMINAL-SCROLLBACK-RING** — `SCROLLBACK_MAX_LINES = 10000` drift-locked at module-and-test level (Phase 246-02).

## Reversibility

- **Instant rollback:** `redis-cli SET livos:v43:terminal_panel false` atomically hides:
  - the Terminal dock entry (Phase 243-03 gate, preserved)
  - the new `ActiveTerminalsPanel` in Settings → System (Phase 246-05 self-gate)
  - both happen WITHOUT a code revert, WITHOUT a service restart.
- **Code revert:** all 26 commits of Phase 246 are atomic and revertable in reverse-DAG order without disturbing the Phase 243 baseline (Phase 243 single-session unit is composed, never modified — degenerate-case of v44).

## Operator hand-off

After this aggregate SUMMARY lands, the only remaining steps are operator-only:

1. **Step A (deploy):** From a host with reachable SSH to Mini PC (LAN or VPN), run the batched `update.sh` script in `.planning/phases/246-terminal-v2-multi-session/246-06-DEPLOY-LOG.md` "Operator deploy script → Step A". Paste the transcript into the "## Deploy timeline" section of that log.
2. **Step B (smoke probes):** Acquire a fresh `LIVINITY_PROXY_TOKEN` from a browser session, then run the 5 wire-level smoke probes in 246-06-DEPLOY-LOG.md "Operator deploy script → Step B". Paste each probe's transcript into the Probe outcomes table.
3. **Step C (UAT):** Walk `.planning/phases/246-terminal-v2-multi-session/246-06-UAT-CHECKLIST.md` — 7 mandatory + 2 optional items in the browser. Tick `[x]` on PASS. Once all 7 mandatory PASS → flip 246-06-DEPLOY-LOG.md status to ✅ SHIPPED and commit:
   ```
   docs(246-06): Mini PC deploy verified — SHA c72a87d4, sacred SHA preserved, 5/5 smoke probes GREEN, 7/7 UAT PASS
   ```

If any sacred-SHA-mismatch or service-down observed → STOP, do NOT flip ROADMAP, escalate.

## Deferred to v45+

Carried forward from CONTEXT and Plan-04 deferrals:

- Per-user session scoping (admin panel currently lists all sessions regardless of which browser/user opened them — single-user assumption matches v7.0 + Phase 243 baseline).
- Server-side rename (rename label is browser-local in v44; reverts on F5 reload).
- CWD/env preservation across sessions (each PTY starts in `/home/bruce` with stock env).
- Drag-drop file paths into terminal.
- Legacy `/terminal?token=...` route removal — kept for D-243-FLAG-ROLLBACK + Phase 226 token-mint path. Removal is a v45+ cleanup once v44 has been operator-live for ≥ 2 weeks without rollback need.

## Self-Check

| Claim | Verification | Status |
|---|---|---|
| All 5 plans 246-01..05 CODE-COMPLETE on master | `git log --oneline c72a87d4 | grep -E "246-0[1-5]"` shows expected feat/test/docs commits | ✅ |
| Sacred git blob preserved at HEAD | `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d...` | ✅ |
| Caddy emitter byte-identical | `git diff 2b07bed7..c72a87d4 -- ...caddy.ts` empty | ✅ |
| 26 commits pushed to origin/master | `git push` reported `2b07bed7..c72a87d4  master -> master` | ✅ |
| `246-06-DEPLOY-LOG.md` exists | file written | ✅ |
| `246-06-UAT-CHECKLIST.md` exists with 7 items | file written | ✅ |
| `246-SUMMARY.md` exists | THIS file | ✅ |
| Mini PC bytes running | `update.sh` executed on Mini PC | ⏳ OPERATOR-PENDING (SSH unreachable from executor host) |
| 5 wire-level smoke probes GREEN | curl/redis-cli/websocat probes ran | ⏳ OPERATOR-PENDING |
| 7-item UAT walked | browser walk by operator | ⏳ OPERATOR-PENDING |

**Phase 246 status:** ✅ ARTIFACT-COMPLETE (code + tests + docs + UAT-checklist all shipped to master). ⏳ OPERATOR-PENDING (Mini PC deploy + smoke probes + browser UAT walk). Status will flip to **fully SHIPPED** once operator completes Steps A+B+C and commits the verification update to 246-06-DEPLOY-LOG.md.
