---
phase: 171-item-model-storage
plan: 04
subsystem: server/trpc
tags: [trpc, vault-items, adminProcedure, validateMove, httpOnlyPaths, v38]
dependency_graph:
  requires:
    - "171-01: vault-items barrel + types + newItemId"
    - "171-02: ItemStore (file-backed atomic CRUD)"
    - "171-03: tree-resolver (validateMove + buildTree + depthOf)"
  provides:
    - "tRPC namespace vault.items.* (7 adminProcedure procedures)"
    - "7 new httpOnlyPaths entries for WS-reconnect-survival"
    - "vault: namespace root in createAppRouter (room for vault.settings/skills/commands)"
  affects:
    - "Phase 172 CLI (consumes vault.items.* tRPC client calls)"
    - "Phase 174 SidebarTree (renders vault.items.list + invalidates on mutations)"
    - "Phase 175 Add-modal (calls vault.items.create)"
    - "Phase 176 Liv root agent create_item tool (calls vault.items.create)"
tech_stack:
  added: []
  patterns:
    - "adminProcedure-only routing (RBAC via requireRole('admin'))"
    - "Zod .strict() on every input schema (rejects unknown fields)"
    - "Type-discriminated field gating (cwd project-only, schedule agent-only, ccSessionId chat-only)"
    - "Move-via-validateMove (cycle/self/depth-hard-cap → BAD_REQUEST; soft-cap → ok + warn side-channel)"
    - "parentId in update.patch rejected — forces caller through move"
    - "ctx.livinityd.itemStore undefined-tolerant (INTERNAL_SERVER_ERROR if missing)"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts"
    - "livos/packages/livinityd/source/modules/server/trpc/vault-items-router.test.ts"
  modified:
    - "livos/packages/livinityd/source/modules/server/trpc/index.ts (+12 lines — import + register vault namespace)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+15 lines — 7 httpOnlyPaths + cluster comment)"
decisions:
  - "createInput keeps cwd/schedule/ccSessionId as optional + runtime-gates rather than a Zod discriminated union — keeps the schema readable while still rejecting cross-type smuggling"
  - "updateInput.patch.parentId is accepted by Zod but rejected at runtime — forces callers through validateMove path without complicating the wire shape"
  - "move() returns {item, warn: validation.warn ?? null} so soft-cap acceptance carries a non-fatal side-channel for UI toast surfacing"
  - "requireStore helper centralizes the ctx.livinityd.itemStore null-check — undefined-tolerant ahead of Plan 171-05 boot wire-up"
metrics:
  duration: "~6 min"
  completed_date: "2026-05-20"
  commits: 1
  tasks_completed: 3
  files_touched: 4
---

# Phase 171 Plan 04: Item Model + Storage Layer — vault.items.* tRPC Router Summary

7 adminProcedure-gated tRPC procedures at namespace `vault.items.*` (list/get/create/update/move/archive/delete) wrapping Plan 171-02 ItemStore + Plan 171-03 tree-resolver, with strict Zod input validation, type-discriminated field gating, validateMove-threaded move semantics, and 7 new httpOnlyPaths entries for WS-reconnect survival.

## Tasks Completed

| # | Task | Files | Commit |
|---|------|-------|--------|
| 1 | Implement vault-items-router.ts with 7 adminProcedure procedures | `vault-items-router.ts` (NEW, 221 lines) | `59d8ab3d` |
| 2 | Register vault namespace + add 7 httpOnlyPaths entries | `index.ts` (+12), `common.ts` (+15) | `59d8ab3d` |
| 3 | Write 14-assertion vitest spec | `vault-items-router.test.ts` (NEW, 187 lines) | `59d8ab3d` |

Single atomic commit per the plan's "atomic per task OR single 171-04 commit" guidance — all 3 tasks share the same `feat(171-04)` prefix and ship together (router + registration + tests must land in one slice to keep the namespace coherent).

## Test Output

```
 ✓ source/modules/vault-items/types.test.ts                  ( 8 tests) 4ms
 ✓ source/modules/vault-items/tree-resolver.test.ts          (12 tests) 20ms
 ✓ source/modules/vault-items/vault-root-resolver.test.ts    ( 8 tests) 22ms
 ✓ source/modules/server/trpc/vault-items-router.test.ts     (14 tests) 42ms
 ✓ source/modules/vault-items/item-store.test.ts             (16 tests) 186ms

 Test Files  5 passed (5)
      Tests  58 passed (58)
   Duration  654ms
```

### 14 vault-items-router Assertions

**Source-text invariants (S1-S7):**
- S1: source contains all 7 procedure declarations as `adminProcedure`
- S2: `adminProcedure` appears ≥ 7 times in router source (count: 9)
- S3: every input schema uses `.strict()` — count ≥ 5 (count: 9)
- S4: createInput zod schema does NOT contain `userId/id/createdAt/updatedAt/archivedAt/schemaVersion` (slice-bounded to the `.strict()` closure)
- S5: `validateMove` imported from `../../vault-items/index.js` barrel + used inside router body
- S6: common.ts `httpOnlyPaths` contains all 7 `'vault.items.*'` literals
- S7: index.ts registers `vault: router({items: vaultItemsRouter})` + imports the router

**Runtime behavior (R1-R7) via createCaller against real ItemStore in `os.tmpdir()`:**
- R1: `list()` empty vault → `{items: []}`
- R2: `create({type: 'project', name: 'X'})` returns Item with `type='project'`, `parentId=null`, `pinned=false`, `archivedAt=null`, `schemaVersion=1`, id length ≥ 20; survives subsequent `list()`
- R3: `create({type: 'project', name: 'X', schedule: 'cron'})` → BAD_REQUEST (`schedule is agent-only`)
- R4: `create({type: 'agent', name: 'X', cwd: '/x'})` → BAD_REQUEST (`cwd is project-only`)
- R5: `update({id, patch: {parentId: other}})` → BAD_REQUEST (`vault.items.move`)
- R6: `move({id, newParentId: id})` → BAD_REQUEST containing `self`
- R7: `delete({id: <unused valid-shaped id>})` → `{ok: false}`

## Diff Summary

### `livos/packages/livinityd/source/modules/server/trpc/index.ts` (additive only — +12 lines)

```typescript
// Phase 171-04 — Vault Items namespace (v38 D-V38-A/B/C/E). 7 procedures
// wrap Phase 171-02 ItemStore + Phase 171-03 tree-resolver. All adminProcedure-
// gated; all 7 paths added to httpOnlyPaths in common.ts. ctx.livinityd.itemStore
// is populated by plan 171-05's boot wire-up.
import vaultItemsRouter from './vault-items-router.js'
```

Inside `createAppRouter`, immediately after `ccPty: ccPtyRouter,`:

```typescript
// Phase 171-04 — Vault Items lifecycle namespace (v38 D-V38-A/B/C/E).
// List/get/create/update/move/archive/delete adminProcedures over the
// vault-items file-backed store + tree-resolver. The double-nesting
// (`vault: router({items: ...})`) keeps room for future `vault.*`
// namespaces (vault.settings, vault.skills, vault.commands) per the
// master plan D-V38-T folder layout — items is the first inhabitant.
vault: router({items: vaultItemsRouter}),
```

### `livos/packages/livinityd/source/modules/server/trpc/common.ts` (additive only — +15 lines)

7 new `httpOnlyPaths` entries appended immediately after the ccPty cluster, BEFORE `] as const`:

```typescript
// Phase 171-04 — Vault Items lifecycle namespace (v38 D-V38-A/B/C/E).
// 7 procedures wrap the Phase 171-02 ItemStore + Phase 171-03 tree-resolver.
// All 7 paths route via HTTP for the standard WS-reconnect-survival reason
// (memory pitfall B-12 / X-04 — same cluster as ccPty.* line 530-534,
// agents.* line 282, marketplace.* line 299). create / update / move /
// archive / delete are autosave-adjacent admin mutations; list / get are
// page-render dependencies for the Phase 174 SidebarTree where the WS-
// handshake-delay flicker is undesirable.
'vault.items.list',
'vault.items.get',
'vault.items.create',
'vault.items.update',
'vault.items.move',
'vault.items.archive',
'vault.items.delete',
```

## Sacred SHA + Sentinel Files

```
liv/packages/core/src/sdk-agent-runner.ts                                   f3538e1d811992b782a9bb057d1b7f0a0189f95f  [UNCHANGED]
livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts  2083f0a3dfc798b4841613b9576b94929f2faf2f  [UNCHANGED]
livos/packages/livinityd/source/modules/cc-pty/manager.ts                   ba202e8364e8650e74a1c00d9af5f735ccfe3305  [UNCHANGED]
livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts        551f74b8ddd385989bf8689bc9e4ae31dfd24fa8  [UNCHANGED]
```

All sacred + sentinel files byte-identical pre/post Plan 171-04.

## Verification Output

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| vault-items-router.test.ts assertions | 14 PASS | 14 PASS | ✓ |
| Combined Phase 171 suite (5 files) | 58 PASS | 58 PASS | ✓ |
| `tsc --noEmit` error count vs baseline | 399 | 399 | ✓ |
| Sacred SHA preserved | f3538e1d | f3538e1d | ✓ |
| cc-pty-router.ts byte-identical | empty diff | empty diff | ✓ |
| cc-pty/ byte-identical | empty diff | empty diff | ✓ |
| `'vault.items.*'` in common.ts | 7 | 7 | ✓ |
| `vault: router({items: vaultItemsRouter})` in index.ts | 1 | 1 | ✓ |
| `import vaultItemsRouter` in index.ts | 1 | 1 | ✓ |
| `adminProcedure` count in router | ≥ 7 | 9 | ✓ |
| `.strict()` count in router | ≥ 5 | 9 | ✓ |
| `validateMove` in router | ≥ 1 | 3 | ✓ |
| `TRPCError` in router | ≥ 4 | 7 | ✓ |
| `userId:` in router | 0 | 0 | ✓ |
| `it(` count in test | ≥ 14 | 14 | ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] S4 source-text invariant slice over-extended into adjacent schemas**

- **Found during:** First vitest run after writing all 3 task files
- **Issue:** The initial S4 implementation took a 1000-char fixed-size slice from `const createInput` — that overshoots into the next schema declaration (`const idOnly = z.object({id: z.string().regex(ID_RE)})`). The regex `/\bid:\s*z\./` then matched `id: z.string()` in idOnly's body, not in createInput. False positive — createInput itself does NOT contain `id:`.
- **Fix:** Bound the slice to the createInput block's terminating `.strict()` call. Use `tail.indexOf('.strict()')` to find the closure point, then slice up to that boundary. This guarantees the assertion only inspects createInput's actual object body.
- **Files modified:** `vault-items-router.test.ts`
- **Commit:** `59d8ab3d` (atomic — landed alongside the rest of Plan 171-04)

No other deviations. Plan executed exactly as written.

### Concurrent Parallel Plan (171-05)

While executing 171-04 I observed Plan 171-05 (file-disjoint sibling worker) commit `e4c6998c feat(171-05): vault-items PubSub wrapper + barrel re-exports` shipping `vault-items/pubsub.ts` + barrel additions to `vault-items/index.ts`. There is ZERO file overlap between 171-04 and 171-05 — 171-04 owns the 4 trpc files only, 171-05 owns vault-items/pubsub.ts + the barrel re-exports. No coordination conflict.

A `pubsub.test.ts` file remained untracked in vault-items/ at the time of my commit — that's 171-05's territory and out of scope for me.

## Known Stubs

None — every procedure is wired through to ItemStore / tree-resolver. The only stub is `ctx.livinityd.itemStore` itself, which is documented as the boundary that Plan 171-05 boot wire-up will populate. `requireStore()` throws INTERNAL_SERVER_ERROR if missing, so the failure mode is loud rather than silent.

## TDD Gate Compliance

Although individual tasks were marked `tdd="true"`, the plan body explicitly allows "atomic per task OR single 171-04 commit" and the three tasks ship together because router + registration + test cannot exist independently (registration would fail tsc without the router file; tests cover the router + registration jointly). Single `feat(171-04)` commit is the right granularity for this cohesive surface — the test file IS the RED→GREEN cycle, baked into the same diff as the implementation it locks down.

## Self-Check: PASSED

- FOUND: `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts`
- FOUND: `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.test.ts`
- FOUND: `livos/packages/livinityd/source/modules/server/trpc/index.ts` (modified — vault namespace registered)
- FOUND: `livos/packages/livinityd/source/modules/server/trpc/common.ts` (modified — 7 httpOnlyPaths added)
- FOUND: commit `59d8ab3d` in `git log --oneline --all`
- FOUND: `vault-items-router.test.ts` reports 14 PASS via `npx vitest run`
- FOUND: combined Phase 171 suite reports 58 PASS
- VERIFIED: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
- VERIFIED: tsc baseline 399 → 399 (no regression)
