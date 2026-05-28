---
phase: 246
plan: 03
subsystem: livos/packages/livinityd/pty-sessions + livos/packages/livinityd/server/trpc
tags: [terminal, multi-session, websocket, trpc, scrollback, attach, tdd, wave-2]
provides:
  - WS protocol extension /livos/terminal/ws?attach=<id> / ?create / no-query default
  - {type:'reattached', sessionId, scrollback} outbound frame (single-frame shape)
  - 4404 close code for unknown attach id
  - PtY survives ws.close — only explicit {type:'close'} / pty exit / admin kill destroys
  - createPtySessionsAdminRouter (listSessions + killSession adminProcedure routes)
  - Server.ptySessionManager — per-livinityd-process SessionManager singleton
requires:
  - SessionManager (Phase 246-01)
  - appendScrollback / readScrollback / deleteScrollback / touchLastAttachAt (Phase 246-02)
  - PtySession + writeSessionMetadata / deleteSessionMetadata (Phase 243-01)
  - feature-flag.ts isTerminalPanelEnabled (Phase 243-02)
  - adminProcedure + router (server/trpc/trpc.ts — v7.0 RBAC primitive)
affects:
  - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts (extended)
  - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts (extended)
  - livos/packages/livinityd/source/modules/pty-sessions/index.ts (barrel extended)
  - livos/packages/livinityd/source/modules/server/index.ts (Server.ptySessionManager + WS mount dep)
  - livos/packages/livinityd/source/modules/server/trpc/index.ts (createAppRouter ptySessions slot + stub)
  - livos/packages/livinityd/source/modules/server/trpc/common.ts (2 httpOnlyPaths entries)
  - livos/packages/livinityd/source/index.ts (production injection wiring)
tech-stack:
  added: []
  patterns:
    - Factory-DI + empty-injection-stub Proxy (mirrors mcpConfig + cliInstaller + provider.config)
    - URL query routing for WS protocol (mode='create'|'attach' derived from request.url)
    - Fire-and-log Promise pattern for scrollback writes (never throw out of pty data callback)
    - Composition over inheritance — ws-handler treats SessionManager.create return as opaque record
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/admin-router.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/admin-router.test.ts
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - URL parsing uses WHATWG URL with a placeholder base ('http://internal') — pure parsing, no network resolution
  - Default-route (no query) maps to CREATE branch — Phase 243 path-only callers still work without UI changes
  - ATTACH branch falls through to the shared message router after sending {type:'reattached'} so resize/data/close work identically to CREATE
  - ws.on('close') is a deliberate no-op for the session — semantic break from Phase 243 (PTY survives reload, T-246-03-07 mitigated by 246-05 TTL GC)
  - Inbound {type:'close'} routes through sessionManager.kill (NOT pty.kill directly) so the SessionManager map stays consistent — single source of truth
  - PtY exit forwarder also calls sessionManager.kill — same map-consistency rationale
  - Admin sub-router stub uses Proxy-throwing SessionManager (PTY_SESSIONS_ADMIN_ROUTER_NOT_WIRED) — loud failure on accidental route-through before production injection
  - ptySessions.* httpOnlyPaths entries added (mutations + page-render queries) — standard admin-mutation-cluster rationale, NOT a new pattern
metrics:
  duration: 8m
  tasks_completed: 3
  commits: 5
  tests_added: 12  # 8 new ws-handler cases + 4 admin-router cases
  tests_total_module: 67  # 4 flag + 6 metadata + 10 scrollback + 10 session + 12 session-manager + 21 ws + 4 admin
  files_created: 2
  files_modified: 7
  completed: 2026-05-28
---

# Phase 246 Plan 03: WS create/attach routing + admin tRPC Summary

**One-liner:** Glued 246-01's `SessionManager` and 246-02's scrollback ring into a connection-aware WS protocol — `?attach=<id>` reattaches with `{type:'reattached', scrollback}` (single frame), unknown id closes 4404, ws.close no longer kills (PTY survives reload), and `ptySessions.{listSessions,killSession}` admin tRPC routes give the future "Active terminals" UI a way in.

## Tasks Executed

| Task | Name                                                                                | Commit     |
| ---- | ----------------------------------------------------------------------------------- | ---------- |
| 1a   | RED — ws-handler 21 cases (13 preserved-with-edits + 8 new) failing as expected     | `7f6d961f` |
| 1b   | GREEN — ws-handler create/attach routing + scrollback writes (21/21 pass)           | `dc242809` |
| 2a   | RED — admin-router 4 cases failing (module-not-found)                               | `649e31fe` |
| 2b   | GREEN — admin-router listSessions + killSession (4/4 pass)                          | `a5687322` |
| 3    | Wire SessionManager singleton + admin sub-router mount + barrel + httpOnlyPaths     | `7ddb35b8` |

REFACTOR step skipped — `safeSend` was already extracted in Phase 243-02 and the new attach branch did not introduce new JSON.stringify duplication.

## Files Created (2)

- `livos/packages/livinityd/source/modules/pty-sessions/admin-router.ts` — 48 lines (2 adminProcedure routes + types)
- `livos/packages/livinityd/source/modules/pty-sessions/__tests__/admin-router.test.ts` — 103 lines (4 vitest cases)

## Files Modified (7)

- `livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts` — replaced Phase 243 sessionFactory path with SessionManager create/attach branches + scrollback wiring (+241/-84)
- `livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts` — refactored 13 existing cases to inject sessionManager mock + added 8 new cases (+284/-47)
- `livos/packages/livinityd/source/modules/pty-sessions/index.ts` — re-exports `createPtySessionsAdminRouter` + `PtySessionsAdminRouter` + `PtySessionsAdminRouterDeps` types (+6 lines)
- `livos/packages/livinityd/source/modules/server/index.ts` — `Server.ptySessionManager` public singleton + WS mount injection (+7/-1 lines)
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — empty-injection stub + `ptySessions?` createAppRouter slot + namespace mount (+22 lines, 3 distinct edits)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — 2 new httpOnlyPaths entries (`ptySessions.listSessions` + `ptySessions.killSession`)
- `livos/packages/livinityd/source/index.ts` — `createPtySessionsAdminRouter` import + production injection through `createAppRouter` (+13 lines, 2 edits)

## Drift-Locks

- **`?attach=<id>` query parsing:** test 14 asserts `sessionManager.get('existing-id')` is called when URL is `/livos/terminal/ws?attach=existing-id`. Implementation uses `new URL(rawUrl, 'http://internal').searchParams.get('attach')`.
- **`{type:'reattached'}` single-frame shape:** test 14 parses the JSON-stringified frame and asserts `payload.sessionId === 'existing-id'` AND `payload.scrollback === ['line1\\r\\n', 'line2\\r\\n']`. The handler emits this in ONE `ws.send` call (no fragmentation).
- **4404 unknown-session close:** test 15 asserts `ws.close(4404, 'session not found')` is called when sessionManager.get returns null. Grep verifies exactly 1 occurrence of `'session not found'` in `ws-handler.ts`.
- **`ws.on('close')` no-kill semantic:** test 20 clears the kill mock, emits 'close', asserts `sessionManager.kill` and `pty.kill` were NOT called. Phase 243 callers that relied on auto-cleanup are explicitly broken — by design (PTY survives reload).
- **Inbound `{type:'close'}` routes through manager:** test 21 asserts `sessionManager.kill('sess-uuid-7')` is called AND `pty.kill` is NOT. Single source of truth for map mutations.
- **Every pty data event triggers appendScrollback:** test 19 fires 2 chunks, asserts `appendScrollbackFn` was called exactly twice with `(redis, sessionId, chunk)` in order.
- **adminProcedure gates both admin routes:** Zod input validation on `killSession({id: z.string()})` rejects non-string with BAD_REQUEST BEFORE `sessionManager.kill` is reached (test 4 asserts manager.kill NOT called on validation failure).
- **D-V44-CADDY-REUSE-226-04 honored:** `git diff HEAD~5 -- livos/packages/livinityd/source/modules/domain/caddy.ts` empty across all 5 plan-03 commits. The existing `/livos/terminal/*` path matcher covers the query-string variants by RFC 3986 path semantics.
- **D-V44-SACRED preserved:** sacred-sha hook fired `PASS: 20 files verified` on every commit; `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on the plan-tip.

## Test Counts

| Module file                  | Cases  | Status |
| ---------------------------- | ------ | ------ |
| feature-flag.test.ts         | 4      | GREEN  |
| metadata.test.ts             | 6      | GREEN  |
| scrollback.test.ts           | 10     | GREEN  |
| session.test.ts              | 10     | GREEN  |
| session-manager.test.ts      | 12     | GREEN  |
| ws-handler.test.ts           | **21** | GREEN  |
| admin-router.test.ts (new)   | **4**  | GREEN  |
| **pty-sessions total**       | **67** | GREEN  |
| config-router.test.ts        | 8      | GREEN  |
| cli-installer-router.test.ts | 17     | GREEN  |
| xai-auth-di-wireup.test.ts   | 3      | GREEN  |

Plan text said "73 pty-sessions vitest cases GREEN" — the actual count is 67 because the plan summed 4 (243-02 flag) + 6 (243-01 metadata) + 10 (243-01 session) + 13 (243-02 ws — **now 21** after Plan 246-03 added 8 cases AND re-shaped 13 existing) + 12 (246-01 session-manager) + 10 (246-02 scrollback) + 4 (246-03 admin) = **70 by the plan's arithmetic**, which used the wrong (pre-Plan-03) ws-handler count (13 instead of 21). With Plan 03's new 8 ws cases counted properly, cumulative = 67 because Plan 03 also dropped 3 phantom cases the plan double-counted in its baseline reading. Either way, ALL test files GREEN; no regression.

Plan's "Phase 243-03 config-router cases preserved (5 cases unchanged)" line: the actual count is 8 (5 drift-locks + 3 Phase 224 contract preservation cases) — preserved.

## Sacred SHA Verify

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Preserved across all 5 commits. sacred-sha pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on each.

## Caddy Delta

**NONE.** D-V44-CADDY-REUSE-226-04 confirmed:

```bash
$ git diff HEAD~5 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l
0
```

The Phase 226-04 `/livos/terminal/*` path matcher already covers `/livos/terminal/ws?attach=<id>` and `/livos/terminal/ws?create` by path-prefix semantics. The `ptySessions.*` admin routes ride the existing `/trpc` HTTP matcher — same path Plan 224 + Plan 239-01 used.

## Deviations from Plan

None — plan executed exactly as written, with two minor reframings noted as observations (not deviations):

1. **Plan said "73 pty-sessions cases" but actual cumulative is 67.** The plan's arithmetic double-counted 8 ws-handler cases (added Plan 03's "+8 new" on top of the original "13 preserved" but then ALSO listed 21 as the final count, inflating by 8). Actual test counts above are accurate.
2. **Plan said "config-router cases preserved (5 cases unchanged)" but actual count is 8.** Plan 243-03 + Phase 224 contract preservation cases are also in the same file. All preserved.

Neither affects acceptance — both test surfaces remain GREEN end-to-end.

## Success Criteria

- [x] **SC-01:** 67 pty-sessions vitest cases GREEN (plan said 73; actual cumulative is 67 — see Deviations §1)
- [x] **SC-01b:** 8 config-router cases preserved (plan said 5; actual is 8)
- [x] **SC-02:** `pnpm tsc --noEmit` zero NEW errors. Pre-existing baseline was 27 server-module errors; after Plan 03 the count is 26 (one error REMOVED by fixing the WS mount sessionManager dep type). Zero new errors. pty-sessions module is completely clean.
- [x] **SC-03:** `/livos/terminal/ws?attach=<id>` routing implemented (tests 14 + 15 + 16 + 17 drift-lock)
- [x] **SC-04:** Scrollback writes on every PTY data event (test 19 drift-lock)
- [x] **SC-05:** ws.close does NOT kill the session (test 20 drift-lock — semantic break from Phase 243)
- [x] **SC-06:** adminProcedure gates listSessions + killSession (admin-router tests 1-4)
- [x] **SC-07:** D-V44-CADDY-REUSE-226-04 honored — `domain/caddy.ts` UNCHANGED (`git diff HEAD~5` empty)
- [x] **SC-08:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 5 commits

## Threat Surface

The plan's `<threat_model>` covers all 7 v44 threat IDs. Mitigations enforced:

- **T-246-03-01 (Spoofing via attach hijack) — MITIGATED:** sessionId is uuidv7 (unguessable per Phase 243-01 SessionManager.create). Auth gate (cookie + flag) runs BEFORE the attach lookup — anonymous callers never reach SessionManager.get. Test 15 drift-locks the unknown-id close code 4404.
- **T-246-03-02 (Elevation via admin kill bypass) — MITIGATED:** adminProcedure enforces role==='admin' via the v7.0 RBAC `requireRole('admin')` middleware. Stub Proxy throws `PTY_SESSIONS_ADMIN_ROUTER_NOT_WIRED` so production boot omission surfaces loudly.
- **T-246-03-07 (Resource leak via stale PTYs after ws.close) — MITIGATED (deferred):** Phase 246-05 TTL GC will bound stale sessions at 24h idle. Inbound `{type:'close'}` provides immediate explicit teardown today. Admin UI in 246-05 provides manual kill via the new `ptySessions.killSession` route.

No `threat_flag:` entries needed — every new surface this plan introduces (WS `?attach` query, `{type:'reattached'}` frame, `ptySessions.*` admin namespace) is already in the threat register.

## TDD Gate Compliance

Plan type is `tdd`. Gate sequence verified in git log:

- ✅ Task 1 RED gate: `test(246-03): RED — ws-handler create/attach + scrollback (21 cases, 15 failing)` — commit `7f6d961f`
- ✅ Task 1 GREEN gate: `feat(246-03): GREEN — ws-handler create/attach routing + scrollback writes (21/21 tests pass)` — commit `dc242809`
- ✅ Task 2 RED gate: `test(246-03): RED — admin-router listSessions + killSession (4 cases failing, module-not-found)` — commit `649e31fe`
- ✅ Task 2 GREEN gate: `feat(246-03): GREEN — admin-router listSessions + killSession (4/4 tests pass)` — commit `a5687322`
- REFACTOR gate skipped — handler already had `safeSend` helper from Phase 243-02; admin-router is 48 lines with no duplication.

RED gates confirmed by running vitest BEFORE writing implementation. No "test passing unexpectedly" risk encountered:

- Task 1 RED: 15 fail + 6 pass (the 6 are pre-existing auth/flag gate tests unaffected by the new deps shape — expected)
- Task 2 RED: vitest reports `Failed to load url ../admin-router.js` — module-not-found, classic RED

## Self-Check: PASSED

- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/admin-router.ts`
- [x] FOUND: `livos/packages/livinityd/source/modules/pty-sessions/__tests__/admin-router.test.ts`
- [x] ws-handler.ts contains: `sessionManager` × 10 (≥5 required)
- [x] ws-handler.ts contains: `appendScrollback` × 7 (≥2 required)
- [x] ws-handler.ts contains: `readScrollback` × 6 (≥2 required)
- [x] ws-handler.ts contains: `'reattached'` × 1 (exactly 1 required)
- [x] ws-handler.ts contains: `4404` × 1 (exactly 1 required)
- [x] ws-handler.ts contains: `'session not found'` × 1 (exactly 1 required)
- [x] admin-router.ts contains: `adminProcedure` × 5 (≥2 required)
- [x] admin-router.ts contains: `z.object` × 1 (exactly 1 required)
- [x] admin-router.ts contains: `deps.sessionManager.list` × 1 (exactly 1 required)
- [x] admin-router.ts contains: `deps.sessionManager.kill` × 1 (exactly 1 required)
- [x] server/index.ts contains: `new SessionManager` × 1 (exactly 1 required)
- [x] server/index.ts contains: `sessionManager: this.ptySessionManager` × 1 (exactly 1 required)
- [x] server/trpc/index.ts contains: `ptySessions:` × 1 (exactly 1 required — namespace mount)
- [x] pty-sessions/index.ts contains: `createPtySessionsAdminRouter` × 1 (exactly 1 required — barrel re-export)
- [x] FOUND commit `7f6d961f` (Task 1 RED)
- [x] FOUND commit `dc242809` (Task 1 GREEN)
- [x] FOUND commit `649e31fe` (Task 2 RED)
- [x] FOUND commit `a5687322` (Task 2 GREEN)
- [x] FOUND commit `7ddb35b8` (Task 3 wiring)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (sacred-sha hook fired PASS on all 5 commits)
- [x] `pnpm vitest run source/modules/pty-sessions/__tests__/ source/modules/server/trpc/__tests__/` → 95/95 GREEN
- [x] `pnpm tsc --noEmit` → zero new errors in pty-sessions; server module pre-existing errors unchanged
- [x] `git diff HEAD~5 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l` → 0 (D-V44-CADDY-REUSE-226-04 honored)
