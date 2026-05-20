---
phase: 174-sidebartree-component
plan: 02
subsystem: sidebar-tree-ui
tags: [v38, sidebar-tree, react-arborist, trpc, tree-rendering, tdd]
dependency-graph:
  requires:
    - 171-04 vault.items.list tRPC query (read-only consumer)
    - 174-01 sidebar-tree scaffold (SidebarTree.tsx stub replaced; ItemTreeRow stub re-used)
  provides:
    - tree-shape.ts buildArboristTree + MAIN_LIV_ID + TreeNode (consumed by 174-04 drag handler + 174-05 footer slot)
    - SidebarTree.tsx with tRPC + react-arborist render + Main Liv pin + empty state
  affects:
    - 174-03 (consumes Item type narrowing inside ItemTreeRow; no direct file overlap)
    - 174-04 (will extend SidebarTree.tsx with onMove handler)
    - 174-05 (will add footer Settings gear slot to SidebarTree.tsx)
tech-stack:
  added: []
  patterns:
    - react-arborist <Tree> via mock-friendly Node renderer pattern
    - tRPC useQuery refetchInterval 5_000 (v1 real-time fallback)
    - Pure transformer (tree-shape.ts) isolated from render (testable independently)
    - jsdom + react-dom/client + act() (no @testing-library; matches SessionSidebar.test.tsx)
    - vi.mock('react-arborist') captures `data` prop so render layer is testable without virtualised layout
key-files:
  created:
    - livos/packages/ui/src/features/sidebar-tree/tree-shape.ts
    - livos/packages/ui/src/features/sidebar-tree/tree-shape.test.ts
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx
  modified:
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx
decisions:
  - "Main Liv synthetic root id = literal string 'main-liv' (downstream plans depend on this exact value)"
  - "5s refetchInterval is the v1 real-time path; subscribeTree is deferred to a future plan (does not exist in 171-04 router)"
  - "Archived items (archivedAt !== null) filtered out by the transformer (sidebar shows live only)"
  - "Orphan items (parentId references missing id) are promoted to root level — never throw"
  - "react-arborist Tree mocked in tests so virtualised internals don't require real layout in jsdom"
metrics:
  duration_minutes: 9
  completed_date: "2026-05-20"
  tasks_completed: 3
  files_changed: 4
  vitest_assertions: 18
---

# Phase 174 Plan 02: Tree Rendering from tRPC Summary

**One-liner:** Wired `<SidebarTree>` to `vault.items.list` tRPC query with a 5-second polling fallback, transformed the flat `Item[]` into react-arborist's tree shape via a pure `buildArboristTree` transformer (Main Liv synthetic root pinned at the top, archived filtered out, orphans promoted to root, root + child siblings sorted by `createdAt` ASC), and shipped a centered "talk to Liv in terminal ↓" empty-state hint — covered by 8 transformer unit tests + 10 jsdom render tests, all green.

## What Shipped

### Task 1 — `tree-shape.ts` Pure Transformer
- NEW `livos/packages/ui/src/features/sidebar-tree/tree-shape.ts` (~75 LOC) exporting:
  - `MAIN_LIV_ID = 'main-liv' as const` — synthetic pin id
  - `type ItemType` and `interface Item` — UI-side mirror of the SACRED `vault-items/types.ts` discriminated union (field names byte-identical so Phase 178 graph integration won't drift; types.ts itself is sacred-frozen at `b95ec8c5...` and NOT re-imported on the UI side)
  - `interface TreeNode` — `{id, name, type?, item?, children?}` matching react-arborist's `<Tree>` consumer shape; Main Liv synthetic root has NO `item` field
  - `buildArboristTree(items: readonly Item[]): TreeNode[]` — filter archived → bucket by parentId (orphans promoted to `__root__` bucket) → sort each sibling bucket by `createdAt` ASC → recursively build nodes → prepend Main Liv pin
- NEW `tree-shape.test.ts` — 8 vitest assertions (`describe('buildArboristTree', ...)`):
  - Test 1 — empty input returns `[MainLivRoot]` only
  - Test 2 — single root item renders `[MainLiv, item]` in that order
  - Test 3 — siblings sorted by `createdAt` ASC
  - Test 4 — parent + child nest under `parent.children`
  - Test 5 — orphan (parentId → missing) promoted to root, no throw
  - Test 6 — `MAIN_LIV_ID === 'main-liv'` literal
  - Test 7 — TreeNode shape (synthetic root has no `item`, real rows have `item`)
  - Test 8 — archived items filtered out

### Task 2 — `SidebarTree.tsx` Body
- MOD `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` (replaced 174-01 stub `return null` body):
  - Calls `trpcReact.vault.items.list.useQuery(undefined, {refetchInterval: 5_000})`
  - Empty branch (`items.length === 0`): centered "talk to Liv in terminal ↓" hint (no empty tree shell)
  - Populated branch: `<Tree<TreeNode>` from react-arborist with `width='100%'`, `height={400}`, `rowHeight={32}`
  - Internal `TreeNodeRow` Node renderer — branches on `node.id === MAIN_LIV_ID` to render an inline `"Main Liv"` label, otherwise delegates to `<ItemTreeRow item={node.data.item} />` (174-01 stub; 174-03 fills the real per-type body)
  - `SidebarTreeProps.onSelect` interface preserved from 174-01 (Plan 175 will wire it)

### Task 3 — `SidebarTree.test.tsx` Behaviour Suite
- NEW `SidebarTree.test.tsx` — 10 jsdom assertions following the SessionSidebar.test.tsx canonical pattern (RTL-absent, direct `createRoot` + `act()`):
  - Mocks `@/trpc/trpc` — captures `useQuery` options arg into `useQueryOptionsCapture`, returns mutable `listData`
  - Mocks `react-arborist` — `<Tree>` captures `props.data` into `lastTreeData` and renders `<div data-testid='arborist-tree' />`
  - Mocks `./ItemTreeRow` — keeps the suite decoupled from Plan 174-03's per-type body
  - B1 — empty list shows hint, not tree
  - B2 — populated list shows tree, not hint
  - B3 — Main Liv always first in `lastTreeData`
  - B4 — `refetchInterval` captured equals `5_000`
  - B5 — sort order `[B(200), A(100)]` → `[MainLiv, A, B]`
  - B6 — parent-child nesting (no child at root)
  - B7 — archived excluded
  - B8 — loading state (data === undefined) shows hint, no crash
  - B9 — source-text invariant: `from 'react-arborist'` import present
  - B10 — source-text invariant: `vault.items.subscribeTree` NOT called (defensive — it does not exist yet)

## Test Output

```
$ cd livos/packages/ui && npx vitest run src/features/sidebar-tree/
 ✓ src/features/sidebar-tree/tree-shape.test.ts          (8 tests)  4ms
 ✓ src/features/sidebar-tree/ItemContextMenu.test.tsx    (4 tests)  2ms  ← 174-05 wave-2 sibling
 ✓ src/features/sidebar-tree/SidebarTree.test.tsx        (10 tests) 25ms
 ✓ src/features/sidebar-tree/ItemTreeRow.test.tsx        (8 tests)  24ms ← 174-03 wave-2 sibling

 Test Files  4 passed (4)
      Tests  30 passed (30)
   Duration  1.37s
```

Plan 174-02 owns the 8 + 10 = **18 PASS** (verification requirement); the additional 4 + 8 from the wave-2 sibling plans confirm the file-disjoint parallelism worked.

## Commits

| # | Hash      | Type | Message                                                                                     |
|---|-----------|------|---------------------------------------------------------------------------------------------|
| 1 | b04aa2ed  | test | test(174-02): add failing tree-shape transformer test (8 assertions) [RED]                  |
| 2 | 5a2bfcf1  | feat | feat(174-02): wire SidebarTree to tRPC vault.items.list + 5s poll + react-arborist render + empty state |
| 3 | f10f699f  | test | test(174-02): add SidebarTree behaviour suite (10 jsdom assertions, mocked tRPC + react-arborist + ItemTreeRow) |
| 4 | 9dea770b  | feat | feat(174-02): tree-shape transformer (buildArboristTree + MAIN_LIV_ID + TreeNode) [GREEN — committed late due to bookkeeping bug, see Deviations §1] |

TDD gate sequence (effective): `test(b04aa2ed)` [RED, fails] → `feat(9dea770b)` [GREEN — tree-shape.ts impl was written + tested green in-session but a silent gsd-sdk commit miss kept it untracked until the final pass] → `feat(5a2bfcf1)` [SidebarTree.tsx body] → `test(f10f699f)` [SidebarTree jsdom suite — already-green-on-impl]. RED/GREEN cycle preserved; only the commit-ordering of `9dea770b` is out of plan-spec sequence (it landed AFTER the SidebarTree commits rather than directly after the RED test).

## Deviations from Plan

### 1. [Rule 3 — Tooling Bug] Silent gsd-sdk commit miss when staging not done explicitly

**Found during:** Task 1 GREEN commit attempt (right after `tree-shape.test.ts` turned green).

**Issue:** I wrote `tree-shape.ts` to disk after the RED commit, the tests turned green (8/8 PASS), and I ran `gsd-sdk query commit "feat(174-02): ..." livos/packages/ui/src/features/sidebar-tree/tree-shape.ts`. The SDK responded `committed:false, reason:"[sacred-sha] PASS: 25 files verified", exitCode:1`. The PASS message in `reason` was misleading — what actually happened is the file was untracked (never `git add`-ed), the SDK helper ran the sacred-SHA hook (which passed because there's nothing for it to object to on a file the hook doesn't see), then either skipped the commit or `git commit -- <path>` no-op'd because the path wasn't in the index. I misread the success-looking `reason` as a real success and moved on to Task 2.

The discrepancy surfaced at the end of the plan when `git ls-files` showed `tree-shape.ts` was untracked AND `git status` listed it as `??`. I had also been initially confused by `git ls-tree b2022501 -- sidebar-tree/` showing `tree-shape.ts` as a blob — that was a stale tree-listing artifact from a misread of the wave-2 sibling commit (`b2022501` only added `ItemTreeRow.test.tsx`, NOT `tree-shape.ts`; `git log -- tree-shape.ts` returned empty until I committed it explicitly).

**Fix:** Explicitly `git add livos/packages/ui/src/features/sidebar-tree/tree-shape.ts` then re-ran `gsd-sdk query commit` → produced commit `9dea770b`. Combined sidebar-tree vitest suite still green: 34/34 PASS across 5 test files.

**Files modified:** none (only the original `tree-shape.ts` was finally staged + committed)

**Commit:** `9dea770b feat(174-02): tree-shape transformer (buildArboristTree + MAIN_LIV_ID + TreeNode)`

**Operational lesson for future executors:** When `gsd-sdk query commit` returns `committed:false` for any reason, treat it as a hard error — never assume the `reason` field's positive-looking text means the commit happened. Always confirm with `git log --oneline -1 -- <path>` before moving on. Better: stage explicitly via `git add <files>` before calling the SDK helper.

### 2. None other

The plan executed exactly as written for Tasks 2 and 3. No bugs auto-fixed, no missing functionality added, no architectural decisions raised.

## Sacred SHA + Byte-Identical Verification

- `sh scripts/check-sacred.sh` → `[sacred-sha] PASS: 25 files verified`
- `git diff HEAD~6..HEAD -- livos/packages/ui/src/features/cc-sessions/` → empty (Phase 168 untouched)
- `git diff HEAD~6..HEAD -- livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts` → empty (171-04 router untouched; 174-04 will additively extend it for `move` plumbing)
- vault-items/types.ts (sacred `b95ec8c5...`) — UI-side mirror in tree-shape.ts is byte-identical for field names; types.ts itself never re-imported

## Note for 174-04

The `<Tree>` render currently uses the children-form `{TreeNodeRow}` WITHOUT an `onMove` prop. Plan 174-04 will add:

```typescript
<Tree<TreeNode>
  data={treeData}
  // ... existing props
  onMove={({dragIds, parentId}) => {
    moveMutation.mutate({id: dragIds[0], newParentId: parentId})
  }}
>
```

…and wire up the toast on `validateMove` rejection (cycle / depth-hard-cap from server-side `validateMove()`).

## Note for 174-05

The footer Settings gear slot belongs BELOW the `<Tree>` wrapper `div` in `SidebarTree.tsx` — the current layout is `flex h-full flex-col gap-2 p-3 > [flex-1 overflow-y-auto > <Tree>]`. Plan 174-05 adds a sibling `<footer>` below the `flex-1` wrapper.

## Self-Check: PASSED

**Files created/modified — disk verification:**
- FOUND: `livos/packages/ui/src/features/sidebar-tree/tree-shape.ts`
- FOUND: `livos/packages/ui/src/features/sidebar-tree/tree-shape.test.ts`
- FOUND: `livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx`
- FOUND: `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` (replaced body)

**Commits — git verification:**
- FOUND: `b04aa2ed` test(174-02): add failing tree-shape transformer test [RED]
- FOUND: `5a2bfcf1` feat(174-02): wire SidebarTree to tRPC vault.items.list
- FOUND: `f10f699f` test(174-02): add SidebarTree behaviour suite
- FOUND: `9dea770b` feat(174-02): tree-shape transformer [GREEN, late-committed — see Deviation 1]

**Combined vitest:** `5 test files, 34 passed (34)` across the entire `src/features/sidebar-tree/` suite (8 tree-shape + 10 SidebarTree + 8 ItemTreeRow + 4 ItemContextMenu + 4 SidebarFooter — Plan 174-02 owns the first two = 18 PASS as required).
