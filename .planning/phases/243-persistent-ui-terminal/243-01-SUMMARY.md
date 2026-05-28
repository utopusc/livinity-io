---
phase: 243
plan: 01
subsystem: livinityd
tags: [pty, terminal, redis, tdd, xterm-prep]
requires:
  - node-pty@^1.0.0 (pre-existing in livos/packages/livinityd/package.json)
  - uuidv7@^1.2.1 (pre-existing)
provides:
  - PtySession class (node-pty wrapper, bruce-only)
  - writeSessionMetadata / readSessionMetadata / deleteSessionMetadata
  - PTY_SESSION_REDIS_PREFIX const = 'livos:pty:session:'
  - PtySessionMetadata / PtySpawnOptions / SessionEventMap / PtyMetadataRedisClient types
affects:
  - Plan 243-02 (WS endpoint at /livos/terminal/ws will consume this module)
tech-stack:
  added: []
  patterns:
    - DI-friendly factory seam (ptyFactory) — mirrors cli-installer spawnFn pattern (Phase 239-01)
    - Module barrel `.js` extension convention (NodeNext / ESM resolution)
    - Vitest fake mock via `vi.fn()`-backed MinimalPty
key-files:
  created:
    - livos/packages/livinityd/source/modules/pty-sessions/types.ts
    - livos/packages/livinityd/source/modules/pty-sessions/session.ts
    - livos/packages/livinityd/source/modules/pty-sessions/metadata.ts
    - livos/packages/livinityd/source/modules/pty-sessions/index.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/session.test.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/metadata.test.ts
  modified: []
decisions:
  - D-243-NO-ROOT enforced at type level (PtySpawnOptions.username = 'bruce' literal) AND at runtime (PtySession.start() throws on non-bruce username) — defense in depth
  - D-243-PER-USER-READY honored: PtySessionMetadata.user_id present from day one
  - PTY_SESSION_REDIS_PREFIX literal drift-locked by metadata.test.ts case 1
  - MOTD bash literal copied verbatim from legacy terminal-socket.ts line 102 for behavioral parity
  - Lazy spawn: constructor does NOT spawn; caller (Plan 243-02) invokes start() after auth gate
  - Idempotent kill: second kill() no-op (T-243-01-04 DoS mitigation)
metrics:
  duration: ~25 min
  completed: 2026-05-28
  tasks: 3
  commits: 5
  tests_added: 16
  tests_passing: 16
---

# Phase 243 Plan 01: livinityd pty-sessions module Summary

One-liner: PtySession node-pty wrapper (bruce-only, lazy-spawn, EventEmitter) + Redis session metadata writer at `livos:pty:session:{id}`, fully TDD-driven with 16/16 vitest GREEN.

## What Was Built

Four module source files + two vitest files in `livos/packages/livinityd/source/modules/pty-sessions/`:

- **types.ts** — `PtySessionMetadata`, `PtySpawnOptions` (username literal `'bruce'`), `SessionEventMap`, `PtyMetadataRedisClient` interface.
- **metadata.ts** — `writeSessionMetadata` / `readSessionMetadata` / `deleteSessionMetadata` functions + the drift-locked `PTY_SESSION_REDIS_PREFIX = 'livos:pty:session:'` const. `readSessionMetadata` returns `null` on missing-key (`hgetall` → `{}`) per ioredis contract.
- **session.ts** — `PtySession` class. Constructor lazy (does not spawn). `start()` throws `non-bruce username rejected: <name>` synchronously when `opts.username !== 'bruce'` (D-243-NO-ROOT). On valid input, spawns via `ptyFactory('sudo', ['--user','bruce','--login','bash','-c', MOTD_LITERAL], { name:'xterm-color', cols, rows, cwd? })`. Forwards data/exit events through Node's `EventEmitter`. `write`/`resize` forward to the underlying pty. `kill()` is idempotent (second call no-op). `sessionId` getter exposes the uuidv7 generated in constructor.
- **index.ts** — Module barrel exporting 4 runtime symbols (PtySession, write/read/deleteSessionMetadata, PTY_SESSION_REDIS_PREFIX) + 6 type names (PtySessionDeps, MinimalPty, PtySessionMetadata, PtySpawnOptions, SessionEventMap, PtyMetadataRedisClient).
- **__tests__/metadata.test.ts** — 6 cases: prefix drift-lock, hset key prefix, 5-field string serialization, missing-key null, full-hash parse, del prefix.
- **__tests__/session.test.ts** — 10 cases: 2× username guard (`root` + `ubuntu`), argv[0..3] contract, cols/rows forward, cwd forward, on('data') forward, write forward, resize forward, kill idempotency, on('exit') forward.

## Drift-Locks

| Anchor | Location | Test |
|---|---|---|
| `PTY_SESSION_REDIS_PREFIX === 'livos:pty:session:'` | `metadata.ts` line 21 | `metadata.test.ts` case 1 |
| `PtySession.start()` rejects `username='root'` BEFORE any spawn | `session.ts` `start()` guard | `session.test.ts` case 1 |
| `PtySession.start()` rejects `username='ubuntu'` BEFORE any spawn | same guard | `session.test.ts` case 2 |
| argv shape: `['sudo','--user','bruce','--login',...]` | `session.ts` `start()` | `session.test.ts` case 3 |
| MOTD bash literal `'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash'` | `session.ts` `MOTD_BASH_LITERAL` const | verbatim copy of legacy `terminal-socket.ts` line 102 |

## node-pty Verification

`grep "node-pty" livos/packages/livinityd/package.json` → `"node-pty": "^1.0.0"` already present in `dependencies` (no edit committed in this plan). If Mini PC `update.sh` `pnpm install` fails to build the native module in Plan 243-04, fall back to `node-pty-prebuilt-multiarch` per **L-243-A** — this is the documented escape hatch.

## Commits

5 atomic commits, conventional prefixes per D-239-TDD pattern:

| # | Hash | Subject |
|---|---|---|
| 1 | `ad7be47e` | `test(243-01): RED - pty-sessions metadata writer tests (6 cases failing)` |
| 2 | `71bcd0cc` | `feat(243-01): GREEN - pty-sessions metadata writer (6/6 tests pass)` |
| 3 | `4ef23534` | `test(243-01): RED - PtySession class tests (10 cases failing)` |
| 4 | `2200803b` | `feat(243-01): GREEN - PtySession bruce-only PTY wrapper (10/10 tests pass)` |
| 5 | `3b3c03cf` | `feat(243-01): module barrel + typecheck baseline preserved` |

## Verification (Success Criteria)

- **SC-01** ✅ `pnpm vitest run source/modules/pty-sessions/__tests__/` → **16/16 PASS** (10 session + 6 metadata)
- **SC-02** ✅ `pnpm tsc --noEmit` filtered to `source/modules/pty-sessions` → **zero new errors**
- **SC-03** ✅ 5 atomic commits in order (RED meta → GREEN meta → RED session → GREEN session → barrel)
- **SC-04** ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED (pre-commit hook PASS on every commit; `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` confirmed post-commit)
- **SC-05** ✅ D-243-NO-ROOT (L-243-B) drift-locked: PtySession throws synchronously on non-'bruce' (tests 1+2)
- **SC-06** ✅ D-243-PER-USER-READY (L-243-E) honored: `PtySessionMetadata.user_id` present in `types.ts`
- **SC-07** ✅ `node-pty: ^1.0.0` confirmed pre-existing in `package.json` (no edit committed)

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed in declared order. REFACTOR step skipped both times (Task 1 and Task 2) per plan's "only if duplication appears" gate; the 3-function and 4-method implementations were already minimal.

## TDD Gate Compliance

- **Task 1:** RED commit `ad7be47e` (test only, 6 failures) → GREEN commit `71bcd0cc` (impl, 6/6 pass). Gate sequence: PASS.
- **Task 2:** RED commit `4ef23534` (test only, 10 failures) → GREEN commit `2200803b` (impl, 10/10 pass). Gate sequence: PASS.
- **Task 3:** Non-TDD (barrel + typecheck baseline). Commit `3b3c03cf`. No RED/GREEN required.

## Known Stubs

None. Module is fully wired and consumed-ready for Plan 243-02 (WS endpoint).

## Threat Surface

All threats per `<threat_model>` are addressed in code:
- T-243-01-01 (E): runtime guard in `start()` + compile-time literal type on `username`.
- T-243-01-02 (T): argv is fixed array literal; only `cols`/`rows`/`cwd` flow through `options` (typed primitives).
- T-243-01-03 (I): metadata fields are non-secret (user_id, name, timestamps, cwd).
- T-243-01-04 (D): `kill()` idempotent (test case 9 drift-locks).
- T-243-01-05 (R): accepted — operator visibility via journalctl on `livos.service` is MVP-sufficient.
- T-243-01-06 (S): uuidv7 (unguessable + monotonic) for sessionId.

No new threat surface beyond the plan's register.

## Next

Plan 243-02 will mount this module under a raw `ws` upgrade handler at `/livos/terminal/ws`, with JWT cookie auth and Caddy `@liv_ws` block extension.

## Self-Check: PASSED

- ✅ `livos/packages/livinityd/source/modules/pty-sessions/types.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/pty-sessions/session.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/pty-sessions/metadata.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/pty-sessions/index.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/pty-sessions/__tests__/session.test.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/pty-sessions/__tests__/metadata.test.ts` — FOUND
- ✅ Commit `ad7be47e` (RED meta) — FOUND in git log
- ✅ Commit `71bcd0cc` (GREEN meta) — FOUND in git log
- ✅ Commit `4ef23534` (RED session) — FOUND in git log
- ✅ Commit `2200803b` (GREEN session) — FOUND in git log
- ✅ Commit `3b3c03cf` (barrel) — FOUND in git log
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED
- ✅ `grep -c "PTY_SESSION_REDIS_PREFIX" metadata.ts` → 2 (≥2 expected)
- ✅ `grep "node-pty" package.json` → `"node-pty": "^1.0.0"` confirmed
- ✅ 16/16 vitest cases pass under combined run
- ✅ Zero new tsc errors in pty-sessions module
