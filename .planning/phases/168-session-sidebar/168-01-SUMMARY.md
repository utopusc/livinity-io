---
phase: 168
plan: 168-01
subsystem: livinityd/trpc + cc-pty
status: code-complete
date-completed: 2026-05-19
commit: 36b5c662
files:
  created:
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.test.ts
  modified:
    - livos/packages/livinityd/source/modules/cc-pty/manager.ts (+2 additive methods)
    - livos/packages/livinityd/source/modules/cc-pty/manager.test.ts (+4 assertions)
    - livos/packages/livinityd/source/modules/server/trpc/index.ts (+1 import, +1 router slot)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (+5 httpOnlyPaths entries)
acceptance:
  vitest:
    manager: "18/18 PASS (14 baseline + 4 new)"
    router: "22/22 PASS (11 source-text invariants + 11 runtime behavior via createCaller)"
    cumulative: "40/40"
  tsc: "0 NEW errors in cc-pty/manager.ts, cc-pty-router.ts, cc-pty-router.test.ts, trpc/index.ts, trpc/common.ts (pre-existing WebSocketServer type drift unaffected)"
  grep-invariants:
    - "adminProcedure in cc-pty-router.ts: 5 hits (one per procedure)"
    - "ccPty.* paths in common.ts: 5 entries (list, create, rename, delete, getPreview)"
    - "ccPty: ccPtyRouter in trpc/index.ts: 1 hit"
    - "path.basename defense-in-depth in cc-pty-router.ts: 1 hit"
    - "FORBIDDEN throw in requireOwnedSession: 1 hit"
sacred-guards-verified:
  - "liv/packages/core/src/sdk-agent-runner.ts: byte-identical (Sacred SHA f3538e1d)"
  - "All Phase 162-165 server modules: byte-identical"
  - "Phase 166 cc-pty/{types,session-store,ws-handler,idle-reaper}.ts: byte-identical"
  - "Phase 166 manager.ts: ONLY additive changes (renameSession + getSession appended after listSessions)"
  - "Phase 167 features/cc-terminal/*: byte-identical"
  - "Phase 169 vault-graph/* (server + client): byte-identical"
---

# Phase 168 Plan 168-01: CC PTY tRPC Router Summary

5 adminProcedure-gated tRPC procedures (list / create / rename / delete / getPreview) wrap Phase 166's `CcPtyManager` and expose CC PTY session lifecycle to the Phase 168-02 sidebar UI. Cross-user RBAC enforced via FORBIDDEN guard; all 5 paths routed via HTTP for WS-reconnect-survival; manager.ts gains 2 additive methods (`renameSession`, `getSession`) without touching any of the 14 baseline test assertions.

## Summary

- **`cc-pty-router.ts` (NEW)** — 5 procedures, all `adminProcedure`-gated:
  - `list` → `ctx.livinityd.ccPtyManager.listSessions(ctx.currentUser.id)`
  - `create` → derives `userId` from ctx (server-authoritative; `.strict()` zod rejects spoof attempts)
  - `rename` / `delete` → `requireOwnedSession(ctx, id)` first throws FORBIDDEN if `session.userId !== ctx.currentUser.id`
  - `getPreview` → reads `/root/.claude/projects/-home-bruce-livinity-vault/<basename(ccSessionId)>.jsonl`; returns first user message truncated to 120 chars; ENOENT / missing ccSessionId → `{preview: null}` (no file-existence probe)
- **`cc-pty-router.test.ts` (NEW)** — 22 assertions:
  - 11 source-text invariants (procedure names, adminProcedure ≥5, path.basename, FORBIDDEN, .strict(), CC project dir constant, slice(0,120))
  - 11 runtime behaviors via `ccPtyRouter.createCaller(ctx)`:
    - B1 list filters by ctx.currentUser.id
    - B2 create returns server-derived userId
    - B3 spoof userId rejected by zod .strict()
    - B4 rename persists title via manager
    - B5 cross-user rename → 403
    - B6 delete invokes killSession + removes from list
    - B7 cross-user delete → 403
    - B8 getPreview parses jsonl, returns first user message
    - B9 getPreview ENOENT → null
    - B10 getPreview missing ccSessionId → null
    - B11 cross-user getPreview → 403
- **`cc-pty/manager.ts` (MOD)** — 2 additive methods appended after `listSessions`, before `runIdleReaper`:
  - `renameSession(id, title)` → `store.update(id, {title})` (no-op for unknown ids)
  - `getSession(id)` → `store.getById(id)` (returns null for unknown ids)
- **`manager.test.ts` (MOD)** — 4 new assertions (15-18) on top of the 14 baseline:
  - rename persists, rename unknown id is no-op, getSession returns shape, getSession unknown returns null
- **`trpc/index.ts` (MOD)** — import `ccPtyRouter` + register as `ccPty: ccPtyRouter`
- **`trpc/common.ts` (MOD)** — 5 new entries in `httpOnlyPaths` (`ccPty.list`, `ccPty.create`, `ccPty.rename`, `ccPty.delete`, `ccPty.getPreview`) clustered after `chatConfig.*`

## Acceptance Evidence

- **vitest manager**: `pnpm --filter livinityd exec vitest run source/modules/cc-pty/manager.test.ts` → 18/18 PASS in 271ms (14 baseline preserved + 4 new)
- **vitest router**: `pnpm --filter livinityd exec vitest run source/modules/server/trpc/cc-pty-router.test.ts` → 22/22 PASS in 11ms
- **vitest combined**: 40/40 GREEN, 756ms total
- **tsc**: `pnpm --filter livinityd exec tsc --noEmit | grep -E "cc-pty-router|cc-pty/manager|trpc/index|trpc/common"` → 0 hits for new errors. The pre-existing `trpc/index.ts(N,3): error TS2322` WebSocketServer type drift moved from line 282 → 288 (line delta only, identical error, unchanged baseline).

## Threat Mitigations Realized

| Threat ID | Mitigation | Asserted by |
|-----------|------------|-------------|
| T-168-01-01 (Elevation) | `adminProcedure` on every procedure (5 hits) | Source-text invariant S2 |
| T-168-01-02 (Tampering userId) | userId derived from ctx; zod .strict() rejects extras | Behavior tests B2 + B3 |
| T-168-01-03 (Cross-user mut/read) | `requireOwnedSession` → FORBIDDEN | Behavior tests B5 + B7 + B11 |
| T-168-01-04 (Path traversal in getPreview) | `path.basename(ccSessionId)` + uuid input + swallow errors | Source-text invariant S3; B9/B10 |
| T-168-01-05 (DoS unbounded jsonl read) | accepted — bounded by CC log rotation; admin-only | Documented in plan |
| T-168-01-06 (Repudiation on delete) | accepted — manager logs killSession; per-user audit is v37 | Plan §accept |
| T-168-01-07 (Stale list after restart) | accepted — file-backed store reloads from disk; 10s polling | Plan §accept |
| T-168-01-08 (Spoofing transport replay) | All 5 paths in httpOnlyPaths → cookie+JWT cluster | Source-text invariant H1 |

## Sacred-Guard Byte-Identity Proof

Git diff scope: only the 6 files in `files_modified` changed. All 9 sacred guard files (sdk-agent-runner, luse-system-prompt, agent-prompt-builder, vault-scaffolder, agent-session, ws-agent, autonomous-scheduler/scheduler, claude-runner/idle-reaper, Phase 166 cc-pty/types+session-store+ws-handler+idle-reaper) UNTOUCHED. Phase 167 features/cc-terminal/* UNTOUCHED. Phase 169 vault-graph/* (server + client) UNTOUCHED.

## Self-Check: PASSED

- Files exist: ✓ cc-pty-router.ts + .test.ts created; manager.ts + .test.ts + trpc/index.ts + trpc/common.ts patched
- Commit exists: ✓ `36b5c662`
- 40/40 vitest GREEN ✓
- 0 NEW tsc errors ✓
- Sacred-guard byte-identity ✓
