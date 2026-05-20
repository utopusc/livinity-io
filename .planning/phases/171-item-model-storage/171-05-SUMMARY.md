---
phase: 171-item-model-storage
plan: 05
subsystem: vault-items
tags: [v38, vault-items, pubsub, redis, livinityd-boot]
requires:
  - 171-01-types-vault-root-resolver
  - 171-02-item-store
  - 162-01-vault-scaffolder (sacred, byte-identical)
  - 162-03-smoke-auth-check (sacred, byte-identical)
provides:
  - createItemStorePubSub(store, redis, logger) — ItemStore-shaped wrapper
  - TREE_UPDATED_CHANNEL = 'liv:tree:updated' constant
  - TreeUpdateEvent / TreeUpdateEventType / PubSubLogger types
  - livinityd.itemStore field populated at boot AFTER scaffoldVault, BEFORE smokeAuthCheck
  - Cross-tab tree invalidation contract (consumed by Phase 174 sidebar UI)
affects:
  - livos/packages/livinityd/source/modules/vault-items/index.ts (additive barrel)
  - livos/packages/livinityd/source/index.ts (additive boot wire-up + class field + import)
tech-stack:
  added:
    - ioredis publish() best-effort pub/sub
  patterns:
    - Best-effort .catch swallow (mirrors Phase 168-04 cc-pty manager.ts:243-255)
    - Non-fatal try/catch boot wire-up (mirrors Phase 166-05 cc-pty wire-up at index.ts:659-664)
    - Structural ItemStore-shaped wrapper (no class inheritance — keeps the
      underlying store's private writeQueue/vaultRoot state untouched)
key-files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/pubsub.ts (216 lines)
    - livos/packages/livinityd/source/modules/vault-items/pubsub.test.ts (280 lines, 8 PASS)
  modified:
    - livos/packages/livinityd/source/modules/vault-items/index.ts (+3 lines additive)
    - livos/packages/livinityd/source/index.ts (+43 lines additive, zero deletions)
decisions:
  - Wrapper pattern over class-extension — preserves ItemStore's private state
    invariants; the wrapper is purely a forward-then-publish shim
  - delete() is special-cased: publish only when underlying store returned true
    (matches Plan 171-02's "already gone = false return" semantics; suppresses
    no-op notifications)
  - Boot site between scaffoldVault and smokeAuthCheck — guarantees vault dir
    exists before any items/ child write, and makes the store visible to any
    downstream boot step that might want to read it (autonomous scheduler,
    cc-pty, etc., though none currently do)
metrics:
  duration: ~22 min
  completed: 2026-05-20
  tasks: 3 (PubSub wrapper + barrel; 8-assertion vitest; livinityd boot wire-up)
  commits: 3 (e4c6998c, 207db76e, c1fe69f8)
---

# Phase 171 Plan 05: ItemStore PubSub Bridge + Livinityd Boot Wire-up — Summary

**One-liner:** `createItemStorePubSub(store, redis, logger)` wraps an
ItemStore so every mutation publishes `liv:tree:updated` JSON events to
Redis (best-effort, never throws); livinityd boot now constructs the
wrapped store between `scaffoldVault()` and `smokeAuthCheck()` and
exposes it on `this.itemStore` for plan 171-04's tRPC router.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `e4c6998c` | `feat(171-05)` | vault-items PubSub wrapper + barrel re-exports |
| 2 | `207db76e` | `test(171-05)` | vault-items pubsub vitest spec (8 PASS) |
| 3 | `c1fe69f8` | `feat(171-05)` | wire ItemStore + PubSub into livinityd boot |

## Files

### Created

| Path | LoC | Purpose |
|------|-----|---------|
| `livos/packages/livinityd/source/modules/vault-items/pubsub.ts` | 216 | `createItemStorePubSub` factory + `TREE_UPDATED_CHANNEL` + `TreeUpdateEvent` types |
| `livos/packages/livinityd/source/modules/vault-items/pubsub.test.ts` | 280 | 8 vitest assertions (B1-B8) |

### Modified (purely additive)

| Path | +/- | Notes |
|------|-----|-------|
| `livos/packages/livinityd/source/modules/vault-items/index.ts` | +3 / -0 | Barrel re-exports `createItemStorePubSub`, `TREE_UPDATED_CHANNEL`, `TreeUpdateEvent`, `TreeUpdateEventType`, `PubSubLogger` |
| `livos/packages/livinityd/source/index.ts` | +43 / -0 | Import, class field `itemStore?`, boot wire-up try/catch block |

## Wrapper Pattern (Option A vs B)

**Pattern used: A (sidecar factory with method-by-method forwarding).**

Plan 171-02's `ItemStore` does NOT expose an EventEmitter or callback
hook — it is pure CRUD. Two paths were available per the prompt:

- **Option A (chosen):** A factory `createItemStorePubSub(store, redis, logger)`
  returns a new plain-object wrapper that forwards each public method to
  the underlying `store` and tacks on a fire-and-forget publish AFTER
  each successful mutation. The underlying `ItemStore` class is NEVER
  modified — Plan 171-02 stays byte-identical (sacred per the 171-05 plan).

- **Option B (not used):** A boot-site proxy closure inside
  `livinityd/source/index.ts`. Would have worked but mixes infrastructure
  (Redis publishing) into the boot file — harder to test in isolation
  and obscures the wrapper's contract.

The wrapper exposes the IDENTICAL public surface of `ItemStore` (six
methods: `read`, `list`, `itemDir`, `create`, `update`, `archive`,
`unarchive`, `delete`). It returns the wrapped object via
`return wrapper as unknown as ItemStore` — bridging the class-private
fields (`writeQueue`, `vaultRoot`) that the wrapper does not need
because all state lives in the underlying `store`.

The `delete` method is special-cased per Plan 171-02 semantics: only
publishes when `store.delete(id)` returned `true` (item actually
removed). No-op deletes (item already gone) are silently suppressed.

## Boot Wire-up Diff Summary

Three additive edits to `livinityd/source/index.ts` (verified zero
deletion lines via `git diff | grep -cE "^-[^-]"` → `0`):

### 1. Import group (after Phase 166 cc-pty imports)

```typescript
// Phase 171-05 — Vault Items store + PubSub wire-up. ItemStore is the
// canonical v38 vault persistence; createItemStorePubSub wraps it so every
// mutation publishes `liv:tree:updated` for cross-tab UI invalidation
// (Phase 174 sidebar will consume). Boot site sits AFTER scaffoldVault()
// (Phase 162-01 SACRED) and BEFORE the smokeAuthCheck() call to keep the
// boot ordering stable for future phases. Non-fatal try/catch mirrors the
// Phase 166 cc-pty wire-up precedent — livinityd MUST boot even when the
// vault-items wire-up throws (tRPC `vault.items.*` returns
// INTERNAL_SERVER_ERROR via the requireStore helper until next restart).
import {ItemStore, createItemStorePubSub, resolveVaultRoot} from './modules/vault-items/index.js'
import type {ItemStore as ItemStoreType} from './modules/vault-items/index.js'
```

### 2. Class field (after `ccPtyIdleReaper?`)

```typescript
// Phase 171-05 — Vault Items store (file-backed, pub/sub-wrapped).
// Populated in start() AFTER scaffoldVault() succeeds. tRPC router
// `vault.items.*` (Phase 171-04) reads `ctx.livinityd.itemStore` and
// throws INTERNAL_SERVER_ERROR via its requireStore helper when this
// field is undefined (boot wire-up failed — see start() try/catch).
itemStore?: ItemStoreType
```

### 3. Boot wire-up block (between scaffoldVault and smokeAuthCheck)

```typescript
// Phase 171-05 — Vault Items store + PubSub bridge wire-up. Boot
// site: AFTER scaffoldVault() (Phase 162-01 SACRED — vault dir
// must exist before items/ child dirs are written) and BEFORE
// smokeAuthCheck() so the store is ready when any subsequent
// boot step (autonomous scheduler / cc-pty / etc.) eventually
// reads it. Non-fatal try/catch matches the cc-pty wire-up
// precedent at lines 659-664: livinityd MUST boot even if the
// vault-items wire-up throws. resolveVaultRoot() reads
// LIV_VAULT_ROOT env (Phase 173 will set this on the systemd unit
// post-migration); fallback `/root/livinity-vault` matches the
// pre-migration steady state.
try {
    const vaultRoot = resolveVaultRoot()
    const baseStore = new ItemStore({vaultRoot})
    this.itemStore = createItemStorePubSub(baseStore, this.ai.redis, {
        log: (msg) => this.logger.log(msg),
        error: (msg, err) => this.logger.error(msg, err),
    })
    this.logger.log(`[vault-items] store wired (vaultRoot=${vaultRoot})`)
} catch (err) {
    this.logger.error(
        '[vault-items] boot wire-up failed (non-fatal — vault.items.* tRPC will throw INTERNAL_SERVER_ERROR until next restart)',
        err as Error,
    )
}
```

## Source-Line Ordering Proof

Required invariant: `scaffoldVault < createItemStorePubSub < smokeAuthCheck < CcPtyManager`.

```
$ grep -nE "(scaffoldVault\(|createItemStorePubSub\(|smokeAuthCheck\(|new CcPtyManager)" \
    livos/packages/livinityd/source/index.ts

546:  const vaultResult = await scaffoldVault({       ← Phase 162-01 SACRED
574:  this.itemStore = createItemStorePubSub(...)     ← Phase 171-05 NEW
590:  smokeAuthCheck({                                ← Phase 162-03
680:  this.ccPtyManager = new CcPtyManager({          ← Phase 166-05
```

546 < 574 < 590 < 680 → strictly monotonic. ✓

## Sacred Guard Verification

| Path | Status |
|------|--------|
| `liv/packages/core/src/sdk-agent-runner.ts` | sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (UNCHANGED; v77+ current value, not the historical `f3538e1d...`) |
| `livos/packages/livinityd/source/modules/claude-runner/` (Phase 162-01/02/03, 165-01) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/cc-pty/` (Phase 166) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/vault-graph/` (Phase 169) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/vault-items/item-store.ts` (Plan 171-02) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/vault-items/tree-resolver.ts` (Plan 171-03) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/vault-items/types.ts` (Plan 171-01) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/vault-items/vault-root-resolver.ts` (Plan 171-01) | `git diff --stat` empty |
| `livos/packages/livinityd/source/modules/server/trpc/` (Plan 171-04 parallel scope) | UNTOUCHED by this plan (171-04 committed independently as `59d8ab3d` + `c66082c7`) |

## Verification

### pubsub.test.ts standalone (8 PASS)

```
$ pnpm exec vitest run source/modules/vault-items/pubsub.test.ts

 ✓ source/modules/vault-items/pubsub.test.ts (8 tests) 63ms

Test Files  1 passed (1)
     Tests  8 passed (8)
```

### vault-items directory (52 PASS)

```
$ pnpm exec vitest run source/modules/vault-items/

 ✓ source/modules/vault-items/types.test.ts                (8 tests)
 ✓ source/modules/vault-items/vault-root-resolver.test.ts  (8 tests)
 ✓ source/modules/vault-items/item-store.test.ts          (16 tests)
 ✓ source/modules/vault-items/tree-resolver.test.ts       (12 tests)
 ✓ source/modules/vault-items/pubsub.test.ts               (8 tests)

Test Files  5 passed (5)
     Tests  52 passed (52)
```

### Phase 171 cumulative (66 PASS — includes 171-04)

```
$ pnpm exec vitest run \
    source/modules/vault-items/ \
    source/modules/server/trpc/vault-items-router.test.ts

 ✓ vault-items/types.test.ts                   (8)
 ✓ vault-items/vault-root-resolver.test.ts     (8)
 ✓ vault-items/item-store.test.ts             (16)
 ✓ vault-items/tree-resolver.test.ts          (12)
 ✓ vault-items/pubsub.test.ts                  (8)
 ✓ trpc/vault-items-router.test.ts            (14)

Test Files  6 passed (6)
     Tests  66 passed (66)   ← matches the plan's success criterion exactly
```

### TypeScript baseline

```
Before any 171-05 edit:   399 errors (pre-existing — skills/*.ts, etc.)
After Task 1 (pubsub.ts): 399 errors  (no regression)
After Task 3 (boot wire): 399 errors  (no regression)
```

Note: the plan referenced a baseline of 484 errors at master-plan time;
locally the baseline is 399. Neither value changes due to 171-05 — the
delta is `0`. No vault-items or `source/index.ts` entries appear in the
tsc error report.

### Acceptance criteria roll-up

| Criterion | Result |
|-----------|--------|
| Task 1: `grep -c "TREE_UPDATED_CHANNEL\|'liv:tree:updated'" pubsub.ts ≥ 2` | 2 ✓ |
| Task 1: `grep -c "publish" pubsub.ts ≥ 5` | 22 ✓ |
| Task 1: `grep -c ".catch(" pubsub.ts ≥ 1` | 1 ✓ |
| Task 1: barrel re-exports ≥ 2 | 2 ✓ |
| Task 1: tsc clean on vault-items | ✓ |
| Task 2: 8 PASS, 0 FAIL, 0 SKIP | ✓ |
| Task 2: `grep -c "it(" pubsub.test.ts ≥ 8` | 8 ✓ |
| Task 2: cc-pty `git diff --stat` empty | ✓ |
| Task 3: `grep -c createItemStorePubSub index.ts ≥ 2` | 3 ✓ |
| Task 3: `grep -c "itemStore?" index.ts ≥ 1` | 1 ✓ |
| Task 3: `grep -c "this.itemStore\s*=" index.ts ≥ 1` | 1 ✓ |
| Task 3: source ordering scaffoldVault < pubsub < smokeAuthCheck | 546 < 574 < 590 ✓ |
| Task 3: tsc clean on index.ts | ✓ |
| Task 3: zero deletion lines in index.ts diff | 0 ✓ |
| Task 3: all sacred paths `git diff --stat` empty | ✓ |

## Deviations from Plan

**None.** The plan was executed exactly as written.

One micro-adjustment to a test assertion (not a deviation — same
contract, tighter check):

- **B6 (read/list/itemDir pass-through):** Plan suggested asserting
  `expect(redis.publish).not.toHaveBeenCalled()`. The wrapped test
  creates a seed item in the same test (so the spy's total call count
  is 1 from the seed `create`). The canonical "no publish from read
  paths" check is `expect(calls).toHaveLength(0)` against the array
  that we reset just before exercising the read methods. Switched to
  the array-based check with an inline comment explaining the choice.
  The behavioral contract (read paths do not publish) is identical.

## Auto-fixed Issues

**None** — Rules 1-3 did not trigger. The plan's interfaces lined up
cleanly with the actual ItemStore (Plan 171-02) public surface.

## Deferred Items

- **Phase 173 (vault path migration):** This plan reads `LIV_VAULT_ROOT`
  from env via `resolveVaultRoot()`. Phase 173 owns the systemd unit
  env update (`LIV_VAULT_ROOT=/root/liv`) and the on-disk move from
  `/root/livinity-vault` → `/root/liv`. No 171-05 code change needed
  for that migration — the resolver already supports both paths.
- **Phase 174 (sidebar UI):** Will subscribe to `liv:tree:updated` for
  cross-tab tree invalidation. The publish contract documented in
  `TreeUpdateEvent` is the integration handshake.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | All vault-items surfaces remain inside the single-user Mini PC scope. No new auth paths, no new network endpoints, no new file access patterns beyond what Plan 171-02 already introduced. |

## Phase 171 Cumulative Vitest Summary

| Plan | Module | Tests | Status |
|------|--------|-------|--------|
| 171-01 | `vault-items/types.test.ts` | 8 | PASS |
| 171-01 | `vault-items/vault-root-resolver.test.ts` | 8 | PASS |
| 171-02 | `vault-items/item-store.test.ts` | 16 | PASS |
| 171-03 | `vault-items/tree-resolver.test.ts` | 12 | PASS |
| 171-04 | `server/trpc/vault-items-router.test.ts` | 14 | PASS |
| **171-05** | **`vault-items/pubsub.test.ts`** | **8** | **PASS** |
| **Total** | — | **66** | **PASS** |

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/vault-items/pubsub.ts` — EXISTS
- File `livos/packages/livinityd/source/modules/vault-items/pubsub.test.ts` — EXISTS
- File `livos/packages/livinityd/source/modules/vault-items/index.ts` — MODIFIED (additive)
- File `livos/packages/livinityd/source/index.ts` — MODIFIED (additive)
- Commit `e4c6998c` (Task 1) — EXISTS in git log
- Commit `207db76e` (Task 2) — EXISTS in git log
- Commit `c1fe69f8` (Task 3) — EXISTS in git log
- 66 PASS in cumulative Phase 171 vitest run
- Sacred SHA on `liv/packages/core/src/sdk-agent-runner.ts` UNCHANGED at `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`
- All sacred-guard paths show empty `git diff --stat`
