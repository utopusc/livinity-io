---
phase: 171-item-model-storage
plan: 01
subsystem: vault-items
tags: [v38, typescript, uuidv7, tdd, vitest, discriminated-union, types]

# Dependency graph
requires:
  - phase: 166-cc-pty
    provides: types-module conventions (single-purpose types.ts + barrel split + module-header sacred-guard pattern)
provides:
  - Item discriminated union (ProjectItem | AgentItem | ChatItem) + BaseItem shared fields
  - resolveVaultRoot() helper reading LIV_VAULT_ROOT with /root/livinity-vault fallback
  - newItemId() helper emitting RFC 9562 UUID v7 (time-sortable) ids
  - vault-items/ barrel exposing the canonical v38 import surface
affects: [171-02-item-store, 171-03-tree-resolver, 171-04-trpc-router, 171-05-pubsub]

# Tech tracking
tech-stack:
  added: [uuidv7@1.2.1]
  patterns:
    - single-purpose types.ts + index.ts barrel (mirrors cc-pty)
    - sacred-guard module header convention applied to NEW v38 modules
    - source-text invariant tests (readFileSync + regex) for export shape
    - vitest expectTypeOf for compile-time narrowing assertions

key-files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/types.ts
    - livos/packages/livinityd/source/modules/vault-items/types.test.ts
    - livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts
    - livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.test.ts
    - livos/packages/livinityd/source/modules/vault-items/index.ts
    - .planning/phases/171-item-model-storage/deferred-items.md
  modified:
    - livos/packages/livinityd/package.json
    - livos/pnpm-lock.yaml

key-decisions:
  - "Swapped 'nanoid@^5.0.7' (planned) for 'uuidv7@^1.2.1' (Rule 1) — nanoid v5 ships no `v7` export and its default `nanoid()` output is random-alphabet, not time-sortable. uuidv7 is a tiny pure-JS RFC 9562 generator that satisfies the load-bearing D-V38-B time-sortability invariant."
  - "Empty-string LIV_VAULT_ROOT treated as unset (per plan behavior assertion 3) — guards against accidental `LIV_VAULT_ROOT=` in shell env."
  - "schemaVersion typed as the literal 1 (not number) — frozen at 1 for Phase 171 per D-V38-C; future bumps will require a discriminator-narrowing layer in 171-02 item-store."

patterns-established:
  - "Pattern: NEW v38 module init — types.ts + impl.ts + index.ts barrel, mirroring cc-pty/. Downstream plans extend the barrel additively."
  - "Pattern: time-sortable Item ids via uuidv7 — every Item-creating call goes through newItemId() so the lexicographic-sort invariant holds globally."
  - "Pattern: discriminated union with shared BaseItem — `type` is the literal-string discriminator; consumers narrow with `if (item.type === 'project')` and gain typed access to per-variant fields."

requirements-completed:
  - V38-ITEM-TYPES-01
  - V38-ITEM-TYPES-02
  - V38-ITEM-TYPES-03
  - V38-ITEM-TYPES-04
  - V38-ITEM-TYPES-05
  - V38-ITEM-TYPES-06
  - V38-ITEM-TYPES-07
  - V38-ITEM-TYPES-08

# Metrics
duration: ~18min
completed: 2026-05-20
---

# Phase 171 Plan 01: Item Model + Storage Layer Summary

**v38 vault Item discriminated union (Project/Agent/Chat) + uuidv7 time-sortable id generator + LIV_VAULT_ROOT resolver — the contract surface every other Plan-171 module consumes from one barrel.**

## Performance

- **Duration:** ~18 minutes
- **Tasks:** 3 (all `type=auto tdd=true`)
- **Files created:** 5 (4 source + 1 deferred-items log)
- **Files modified:** 2 (package.json + pnpm-lock.yaml)
- **Vitest assertions:** 16/16 PASS (8 types + 8 resolver, combined suite green in 387ms)

## Accomplishments

- **Item type surface (D-V38-B + D-V38-T)** — `BaseItem` (8 fields, `schemaVersion: 1` literal) + `ProjectItem` / `AgentItem` / `ChatItem` extending it + `Item = ProjectItem | AgentItem | ChatItem` discriminated union + `ItemType = Item['type']` string union.
- **resolveVaultRoot()** — reads `LIV_VAULT_ROOT` env (non-empty string only), falls back to `/root/livinity-vault` per D-V38-A. Phase 173 owns the on-disk migration; this resolver is intentionally stable across the cutover.
- **newItemId()** — emits an RFC 9562 UUID v7 string via the `uuidv7` package. Time-sortable lexicographically (D-V38-B invariant verified by a 5ms-gap test that asserts `id1 < id2`).
- **Barrel `vault-items/index.ts`** — single import surface plans 171-02/03/04/05 will consume; mirrors `cc-pty/index.ts` type-export vs value-export separation.
- **Sacred SHA preserved** (`f3538e1d811992b782a9bb057d1b7f0a0189f95f`) across all 3 task commits; pre-commit hook validated each.

## Task Commits

1. **Task 1: Add nanoid → uuidv7 dep swap** — `bbf08171` (chore: dep with Rule 1 deviation rationale)
2. **Task 2: vault-items/types.ts + types.test.ts** — `03f68fca` (feat: discriminated union, 8/8 PASS)
3. **Task 3: vault-root-resolver.ts + test + index.ts barrel** — `f309afd2` (feat: runtime helpers + barrel, 8/8 PASS, combined suite 16/16)

_All 3 commits passed the sacred-SHA pre-commit hook independently. No `--no-verify` used._

## Files Created/Modified

### Created

- `livos/packages/livinityd/source/modules/vault-items/types.ts` — Item discriminated union + BaseItem shared fields, pure types, zero runtime imports
- `livos/packages/livinityd/source/modules/vault-items/types.test.ts` — 8 vitest assertions (source-text invariants + 2 expectTypeOf narrowing checks)
- `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts` — `resolveVaultRoot()` + `newItemId()` (uuidv7 wrapper)
- `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.test.ts` — 8 vitest assertions (env-handling + id-shape + uniqueness + time-sortability + barrel re-exports)
- `livos/packages/livinityd/source/modules/vault-items/index.ts` — barrel re-exporting the 7-name canonical surface (5 types + 2 runtime values)
- `.planning/phases/171-item-model-storage/deferred-items.md` — out-of-scope pre-existing tsc errors logged per scope-boundary rule

### Modified

- `livos/packages/livinityd/package.json` — added `"uuidv7": "^1.2.1"` (resolved `1.2.1`) to `dependencies`. Single `+1` line addition after `tsx` entry. NO `nanoid` line lands in the final file (it was added during exploration then reverted in the same chore commit's context — see Deviations below).
- `livos/pnpm-lock.yaml` — pnpm install regenerated lockfile entry for uuidv7

### Barrel contents (`index.ts`)

```typescript
// Phase 171-01 — vault-items barrel.
// [...sacred-guard header...]
export type {Item, BaseItem, ProjectItem, AgentItem, ChatItem, ItemType} from './types.js'
export {resolveVaultRoot, newItemId} from './vault-root-resolver.js'
```

## Decisions Made

- **Dep swap nanoid → uuidv7** — the plan specified `import { v7 } from 'nanoid'` but inspection of `node_modules/.pnpm/nanoid@5.1.11/node_modules/nanoid/index.d.ts` showed nanoid v5 exposes only `nanoid`, `customAlphabet`, `customRandom`, `urlAlphabet`, `random` — no `v7` export. The default `nanoid()` output is a random-alphabet 21-char string with NO embedded timestamp, so it violates the load-bearing must_haves truth that ids must be time-sortable (D-V38-B). Swapped to `uuidv7@1.2.1` — purpose-built RFC 9562 UUID v7 generator, tiny pure-JS (no native deps), ESM. The plan's intent (time-sortable filesystem-safe id) is preserved; the dependency name is the only real change.
- **Empty-string env treated as unset** — explicit behavior assertion 3 in the plan. Defensive against accidental `LIV_VAULT_ROOT=` in systemd EnvironmentFile parsing.
- **No re-export of item-store / tree-resolver / pubsub in this barrel** — the plan is explicit that 171-02/03/05 extend this barrel additively. Holding to that contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 3 - Blocking] Plan-specified `nanoid v7` does not exist; swapped to `uuidv7`**

- **Found during:** Task 1 (verification step after `pnpm install`)
- **Issue:** Plan body specified `nanoid@^5.0.7` with `import { v7 as nanoidV7 } from 'nanoid'`. After install, inspection of `node_modules/.pnpm/nanoid@5.1.11/node_modules/nanoid/index.d.ts` showed nanoid v5 exports ONLY `nanoid()`, `customAlphabet`, `customRandom`, `urlAlphabet`, `random` — no `v7` named export. Worse, nanoid's default output is random-alphabet with no embedded timestamp, so even falling back to it would violate the plan's load-bearing must_haves truth ("newItemId() emits a UUID v7 string that is time-sortable") and D-V38-B explicitly.
- **Fix:** Removed the `nanoid` entry from `package.json`, added `"uuidv7": "^1.2.1"` instead. `uuidv7` is a tiny pure-JS RFC 9562 UUID v7 generator (zero native deps, ESM-compatible, exports `uuidv7()` as a named export). `vault-root-resolver.ts` now does `import {uuidv7} from 'uuidv7'` and `newItemId()` delegates to it.
- **Files modified:** `livos/packages/livinityd/package.json`, `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts`, `livos/pnpm-lock.yaml`
- **Verification:** Behavior assertions 4-6 in `vault-root-resolver.test.ts` ALL PASS — id shape matches `/^[0-9a-z_-]{20,}$/` (UUID v7 lowercase hex + hyphens), 100 sequential calls produce no duplicates, two calls separated by 5ms ARE lexicographically ordered. The plan's actual invariant (time-sortable id) holds.
- **Committed in:** `bbf08171` (dep swap) + `f309afd2` (resolver impl). Both commits passed sacred-SHA pre-commit hook.

---

**Total deviations:** 1 auto-fixed (Rule 1 / Rule 3 — plan dependency choice based on wrong assumption about nanoid v5 API)

**Impact on plan:** No scope creep. The plan's intent (a time-sortable filesystem-safe Item id generator) is fully delivered; only the dependency name changed. Downstream plans 171-02..05 import `newItemId` from the barrel — they do NOT care about which underlying package provides the implementation. Future planners should note: nanoid v5 ≠ "UUID v7 library"; use `uuidv7` for time-sortable UUIDs.

## Issues Encountered

- **pnpm filter syntax on Windows** — `pnpm install --filter @livos/livinityd` from repo root errored "No projects matched the filters" because the workspace root is `livos/`, not the repo root. Resolved by `cd livos && pnpm install --filter livinityd`. Did not require any plan changes.
- **Pre-existing tsc errors in unrelated files** — `tsc --noEmit` reports 20+ errors in `source/modules/{user,utilities,webapps,widgets}/*` that pre-date this plan. Verified vault-items/* is zero-error via `npx tsc --noEmit 2>&1 | grep vault-items | wc -l → 0`. Out-of-scope per scope-boundary rule; logged to `deferred-items.md` for a future cleanup phase.

## Sacred SHA / Sacred Files Verification

```text
git hash-object liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f   ✓ MATCH

Sacred file diff probe (must all be empty):
$ git diff --stat HEAD~3 HEAD -- \
    liv/packages/core/src/sdk-agent-runner.ts \
    livos/packages/livinityd/source/modules/luse-system-prompt.ts \
    livos/packages/livinityd/source/modules/claude-runner/vault-scaffolder.ts \
    livos/packages/livinityd/source/modules/claude-runner/agent-session.ts \
    livos/packages/livinityd/source/modules/cc-pty/*.ts \
    livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts \
    livos/packages/livinityd/source/modules/vault-graph/*.ts
→ (empty — zero bytes changed in sacred-list files)
```

## Vitest Output (combined Plan 171-01 suite)

```text
RUN  v2.1.9 C:/.../livinity-io/livos/packages/livinityd

 ✓ source/modules/vault-items/types.test.ts (8 tests) 3ms
 ✓ source/modules/vault-items/vault-root-resolver.test.ts (8 tests) 19ms

 Test Files  2 passed (2)
      Tests  16 passed (16)
```

## Next Phase Readiness

- **Plan 171-02 (item-store) unblocked** — can `import {Item, BaseItem, resolveVaultRoot, newItemId} from '../vault-items/index.js'` and start landing the file-backed persistence layer.
- **Plan 171-03 (tree-resolver) unblocked** — has the parentId edge + ItemType discriminator it needs to walk the tree.
- **Plan 171-04 (tRPC router) unblocked** — has the canonical Item shape for tRPC input/output codecs.
- **Plan 171-05 (pub/sub) unblocked** — has the Item shape for change-event payloads.
- **No carryover to v38 master** — Plan 171-01 contract surface is byte-stable; the uuidv7 swap is invisible to consumers (they import `newItemId` only).

## Self-Check: PASSED

- **Created files exist:**
  - `livos/packages/livinityd/source/modules/vault-items/types.ts` ✓
  - `livos/packages/livinityd/source/modules/vault-items/types.test.ts` ✓
  - `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts` ✓
  - `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.test.ts` ✓
  - `livos/packages/livinityd/source/modules/vault-items/index.ts` ✓
- **Modified files exist:**
  - `livos/packages/livinityd/package.json` ✓ (contains `"uuidv7": "^1.2.1"`)
  - `livos/pnpm-lock.yaml` ✓
- **Commits exist in git log:**
  - `bbf08171` chore(171-01): add uuidv7 dependency ✓
  - `03f68fca` feat(171-01): add vault-items Item discriminated union ✓
  - `f309afd2` feat(171-01): add vault-root-resolver + newItemId + barrel ✓
- **Sacred SHA preserved:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
- **Vitest suite green:** 16/16 PASS ✓
- **tsc vault-items errors:** 0 ✓

---
*Phase: 171-item-model-storage*
*Plan: 01*
*Completed: 2026-05-20*
