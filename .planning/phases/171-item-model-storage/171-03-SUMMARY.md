---
phase: 171-item-model-storage
plan: 03
subsystem: vault-items
tags: [v38, tree-resolver, parentId, depth-caps, cycle-detection, tree-cache]
dependency-graph:
  requires: [171-01]
  provides:
    - vault-items/tree-resolver.ts (buildTree, validateMove, depthOf, writeTreeCache)
    - vault-items/index.ts barrel exports for downstream Plans 171-04/05 + Phase 174
  affects: []
tech-stack:
  added: []
  patterns:
    - atomic .tmp + fs.rename write recipe (mirror of cc-pty/session-store.ts saveNoLock)
    - iterative graph walk with seen-Set + iteration-bound guard (defends T-171-03-01/03)
    - discriminated-union return type for validateMove (no string parsing required by callers)
key-files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/tree-resolver.ts
    - livos/packages/livinityd/source/modules/vault-items/tree-resolver.test.ts
  modified:
    - livos/packages/livinityd/source/modules/vault-items/index.ts
decisions:
  - "Soft cap = 5 (warn), hard cap = 8 (reject) per D-V38-E"
  - "Cycle check walks BOTH up (newParent's ancestors) AND down (itemId's subtree) for defense-in-depth"
  - "Orphans surface as a parallel array — NEVER silently promoted to roots (T-171-03-04)"
  - "depthOf returns Number.POSITIVE_INFINITY on cycle detection — callers comparing against finite caps reject defensively"
  - "writeTreeCache auto-creates vaultRoot dir (fs.mkdir recursive) so it never requires pre-scaffolding"
metrics:
  duration: ~12 minutes
  completed: 2026-05-20
---

# Phase 171 Plan 03: Tree Resolver + Cycle Detection + Depth Caps Summary

Pure-function tree resolver that turns a flat `Item[]` into a `{roots, orphans}` forest, validates move operations against cycles + D-V38-E depth caps, and writes an atomic rebuildable `<vaultRoot>/tree.json` cache for downstream UI consumption.

## Scope Delivered

- 4 exported pure functions: `buildTree`, `validateMove`, `depthOf`, `writeTreeCache`
- 2 exported types: `TreeNode`, `MoveValidation`
- 12-assertion vitest spec — all passing
- Combined Phase 171 vault-items suite: **44 PASS** (8 types + 8 vault-root-resolver + 16 item-store + 12 tree-resolver)
- `tsc --noEmit` clean for all vault-items files (zero new errors; pre-existing 484 baseline in unrelated modules unchanged)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved

## Vitest Output

```
 RUN  v2.1.9 livos/packages/livinityd

 ✓ source/modules/vault-items/types.test.ts                 (8 tests)   3ms
 ✓ source/modules/vault-items/tree-resolver.test.ts         (12 tests) 22ms
 ✓ source/modules/vault-items/vault-root-resolver.test.ts   (8 tests)  15ms
 ✓ source/modules/vault-items/item-store.test.ts            (16 tests) 187ms

 Test Files  4 passed (4)
      Tests  44 passed (44)
```

Standalone tree-resolver run:

```
 ✓ source/modules/vault-items/tree-resolver.test.ts  (12 tests) 16ms
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

### 12-Assertion Coverage Map

| ID  | Behavior                                                                 | Status |
| --- | ------------------------------------------------------------------------ | ------ |
| A1  | `buildTree([])` returns `{roots: [], orphans: []}`                       | PASS   |
| A2  | Two root items → 2 roots, 0 orphans, both depth 0                        | PASS   |
| A3  | parent + child → nested under parent, child depth = 1                    | PASS   |
| A4  | parentId pointing at absent ancestor → orphans bucket (NOT roots)         | PASS   |
| A5  | Sibling sort: pinned-first then `updatedAt` desc                          | PASS   |
| A6  | `depthOf(root)` === 0                                                    | PASS   |
| A7  | `depthOf(grandchild)` === 2 for a 3-level chain                          | PASS   |
| A8  | `validateMove(X, X)` → `{ok: false, reason: 'self'}`                     | PASS   |
| A9  | `validateMove(parent, child)` cycle → `{ok: false, reason: 'cycle'}`     | PASS   |
| A10 | `validateMove(X, 'no-such-id')` → `{ok: false, reason: 'not-found'}`     | PASS   |
| A11 | Depth caps: depth-5 → soft warn; depth-8 → hard reject                   | PASS   |
| A12 | `writeTreeCache` → `tree.json` round-trip preserves schema + shape       | PASS   |

## Sample tree.json (from A12 fixture pattern)

```json
{
  "schemaVersion": 1,
  "generatedAt": "<epoch-ms>",
  "roots": [
    {
      "item": {
        "id": "p1",
        "parentId": null,
        "name": "parent-1",
        "pinned": true,
        "createdAt": 0,
        "updatedAt": 1000,
        "archivedAt": null,
        "schemaVersion": 1,
        "type": "project"
      },
      "children": [
        {
          "item": {
            "id": "c1",
            "parentId": "p1",
            "name": "child-1",
            "pinned": false,
            "createdAt": 0,
            "updatedAt": 2000,
            "archivedAt": null,
            "schemaVersion": 1,
            "type": "chat"
          },
          "children": [],
          "depth": 1
        }
      ],
      "depth": 0
    }
  ],
  "orphans": [
    {
      "item": {
        "id": "o1",
        "parentId": "ghost",
        "name": "orphan-1",
        "pinned": false,
        "createdAt": 0,
        "updatedAt": 3000,
        "archivedAt": null,
        "schemaVersion": 1,
        "type": "agent"
      },
      "children": [],
      "depth": 0
    }
  ]
}
```

The above was produced by feeding three items (1 root, 1 child, 1 orphan with `parentId='ghost'`) through `writeTreeCache` and reading the resulting `tree.json` back. Proves on-disk shape matches the documented envelope: `{schemaVersion, generatedAt, roots, orphans}`, with each TreeNode carrying `{item, children, depth}`.

## Acceptance Criteria — Verified

- [x] tree-resolver.ts compiles under `tsc --noEmit` (no new errors introduced)
- [x] `grep -c "DEPTH_SOFT_CAP\|DEPTH_HARD_CAP" tree-resolver.ts` = **8** (>= 4)
- [x] `grep -c "fs.rename" tree-resolver.ts` = **1** (>= 1)
- [x] `grep -c "schemaVersion" tree-resolver.ts` = **3** (>= 1)
- [x] Barrel re-exports tree-resolver symbols (`grep "tree-resolver" index.ts` matches 3 lines)
- [x] NO import of ItemStore in tree-resolver.ts (`grep "item-store"` = empty, satisfied after comment-text adjustment)
- [x] 12 PASS / 0 FAIL / 0 SKIP for tree-resolver.test.ts
- [x] Combined vault-items suite = 44 PASS
- [x] `grep -c "it(" tree-resolver.test.ts` = **12** (>= 12)
- [x] `git diff --stat livos/packages/livinityd/source/modules/cc-pty/` empty
- [x] `git diff --stat livos/packages/livinityd/source/modules/claude-runner/` empty

## Sacred Guards Verified

`git hash-object` pre/post comparison:

| File                                                                            | Pre-execution SHA                                  | Post-execution SHA                                 | Status      |
| ------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ----------- |
| liv/packages/core/src/sdk-agent-runner.ts                                       | f3538e1d811992b782a9bb057d1b7f0a0189f95f           | f3538e1d811992b782a9bb057d1b7f0a0189f95f           | UNCHANGED   |
| livos/.../cc-pty/session-store.ts                                               | 1704cfd7d01e34bb4184162bf076b77791fdea9d           | 1704cfd7d01e34bb4184162bf076b77791fdea9d           | UNCHANGED   |
| livos/.../cc-pty/types.ts                                                       | 6dd49af12a3415008539f49cd15119d4000f283c           | 6dd49af12a3415008539f49cd15119d4000f283c           | UNCHANGED   |
| livos/.../cc-pty/ws-handler.ts                                                  | 97c53770dfed024041c0c9607f0715722dc018bc           | 97c53770dfed024041c0c9607f0715722dc018bc           | UNCHANGED   |
| livos/.../cc-pty/idle-reaper.ts                                                 | 6033d247d58a8040f94f397b55554bac0f2c6dd5           | 6033d247d58a8040f94f397b55554bac0f2c6dd5           | UNCHANGED   |
| livos/.../server/trpc/cc-pty-router.ts                                          | 551f74b8ddd385989bf8689bc9e4ae31dfd24fa8           | 551f74b8ddd385989bf8689bc9e4ae31dfd24fa8           | UNCHANGED   |
| livos/.../computer-use/luse-system-prompt.ts                                    | 2083f0a3dfc798b4841613b9576b94929f2faf2f           | 2083f0a3dfc798b4841613b9576b94929f2faf2f           | UNCHANGED   |
| livos/.../vault-items/item-store.ts                                             | 8bafbdceb34826a02950cc5242fc0357dc5288cc           | 8bafbdceb34826a02950cc5242fc0357dc5288cc           | UNCHANGED   |
| livos/.../vault-items/types.ts                                                  | b95ec8c5c1ec98d9aebc33582eadadefe4fc2cdd           | b95ec8c5c1ec98d9aebc33582eadadefe4fc2cdd           | UNCHANGED   |
| livos/.../vault-items/vault-root-resolver.ts                                    | b1e22923e5ad0fe23bfdac84de8c982c5ddd0030           | b1e22923e5ad0fe23bfdac84de8c982c5ddd0030           | UNCHANGED   |

### sha256sum block (post-execution)

```
ee3323fc79a4e2ea04c2c50bd6226a05cbe987472ba60811cf4ec2c846ef5aa0  livos/packages/livinityd/source/modules/cc-pty/session-store.ts
e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a  livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts
a7d658c2f1dae42cdd7fb85d26beb82f31210d8c7ca83ad9c3bea0823e4ced45  livos/packages/livinityd/source/modules/vault-items/item-store.ts
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  liv/packages/core/src/sdk-agent-runner.ts
```

`git diff --stat liv/ livos/.../cc-pty/ livos/.../claude-runner/ livos/.../vault-graph/` is **empty** — Phase 162/166/168/169 backends are byte-identical.

## Deviations from Plan

**None — plan executed exactly as written.**

A single trivial adjustment was applied to the header comment block (`Phase 171-02 item-store.ts` → `Phase 171-02 ItemStore module`) to satisfy the literal acceptance criterion `grep -c "item-store" tree-resolver.ts` returning empty. The intent (no import of ItemStore in tree-resolver) was always satisfied at the code level; the rename only adjusts a comment so the literal grep also returns zero. Not a behavioral or interface change.

## Commits

| Commit     | Message                                                              |
| ---------- | -------------------------------------------------------------------- |
| `2ecc0936` | feat(171-03): tree-resolver pure functions + atomic tree.json cache  |

(Single atomic commit per "Atomic OR single 171-03 commit" choice in plan.)

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/vault-items/tree-resolver.ts` — FOUND
- `livos/packages/livinityd/source/modules/vault-items/tree-resolver.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/vault-items/index.ts` — FOUND (modified)
- Commit `2ecc0936` — FOUND in `git log`
