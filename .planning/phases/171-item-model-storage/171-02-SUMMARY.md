---
phase: 171-item-model-storage
plan: 02
subsystem: vault-items
tags: [v38, typescript, item-store, atomic-write, write-queue, tdd, vitest, file-backed-crud]

# Dependency graph
requires:
  - phase: 171-01-item-types
    provides: Item discriminated union + BaseItem + ProjectItem/AgentItem/ChatItem + resolveVaultRoot + newItemId (uuidv7)
  - phase: 166-cc-pty
    provides: atomic-write recipe + writeQueue mutex pattern (session-store.ts:109-127 mirrored verbatim, READ-ONLY)
provides:
  - ItemStore class — file-backed atomic CRUD for v38 vault Items
  - Per-Item canonical folder scaffolding (D-V38-T) — project/agent/chat variants
  - In-process write-queue mutex (lost-update race mitigation)
  - Atomic write recipe (.tmp + fs.rename) — POSIX-atomic on same filesystem
  - itemDir() public helper for downstream Plan 171-03 tree-resolver consumption
affects: [171-03-tree-resolver, 171-04-trpc-router, 171-05-pubsub]

# Tech tracking
tech-stack:
  added: []  # no new dependencies — only Node built-ins (node:fs, node:path) + uuidv7 (already in 171-01)
  patterns:
    - "Atomic write recipe: write `<file>.tmp` → `fs.rename(tmp, file)` (mirrors cc-pty/session-store.ts:122-127)"
    - "Single-writer in-process mutex via Promise.chain (mirrors cc-pty/session-store.ts:109-116)"
    - "Per-type folder scaffolding driven by exhaustive switch on Item.type discriminator"
    - "Path-traversal defense — id shape regex `^[A-Za-z0-9_-]+$` enforced at assertSafeId() before every path.join"
    - "vi.spyOn(fs, 'rename').mockImplementationOnce(...)` for atomic-write failure injection"

key-files:
  created:
    - livos/packages/livinityd/source/modules/vault-items/item-store.ts          # 342 lines — ItemStore class
    - livos/packages/livinityd/source/modules/vault-items/item-store.test.ts     # 267 lines — 16-assertion vitest spec
  modified:
    - livos/packages/livinityd/source/modules/vault-items/index.ts               # +2 lines — re-export ItemStore + types

key-decisions:
  - "Atomic-write recipe mirrors cc-pty/session-store.ts:122-127 verbatim (pretty-printed JSON via `JSON.stringify(v, null, 2)` for human grep-ability) — D-V38-C compatibility."
  - "Single writeQueue serializes ALL mutations (create/update/archive/unarchive/delete) — concurrent reads remain unblocked. Mitigates Threat T-171-02-04 (lost-update race) per Assertion 16."
  - "Immutable keys (id, type, createdAt, schemaVersion) stripped defensively in update() even though the TS signature already forbids them — defense-in-depth against `as any` callers."
  - "id shape regex `/^[A-Za-z0-9_-]+$/` enforced at assertSafeId() before every path.join — prevents Threat T-171-02-02 path traversal even though tRPC will validate at the boundary in 171-04."
  - "uuidv7 ids include `-` (RFC 9562 dash-separated 8-4-4-4-12 form) which IS within the safe id alphabet — verified by tests Assertion 2 + Assertion 7 round-tripping."
  - "list() skips entries that don't match ID_SHAPE — tolerates orphan `.tmp` files left behind by crashed writes; Assertion 15 relies on this."
  - "create() returns the freshly-built Item object directly (no second disk read) — saves an fs.readFile and removes a TOCTOU window where another writer could mutate item.json between create's write and read."

patterns-established:
  - "Pattern: file-backed Item module — one folder per Item, item.json authoritative, per-type extra files for type-specific data. Used by Plan 171-03 tree-resolver to walk the items/ directory cheaply."
  - "Pattern: enqueueWrite mutex — Promise.chain that swallows rejections in the queue tail but propagates the actual op result. Mirrors cc-pty exactly so future Phase 166 changes propagate verbatim."
  - "Pattern: vitest test-isolation per beforeEach — fresh `os.tmpdir()/vault-items-<uuid>` vault root, full rm in afterEach. Same shape as cc-pty/session-store.test.ts."

requirements-completed:
  - V38-ITEM-STORE-01
  - V38-ITEM-STORE-02
  - V38-ITEM-STORE-03
  - V38-ITEM-STORE-04
  - V38-ITEM-STORE-05
  - V38-ITEM-STORE-06
  - V38-ITEM-STORE-07
  - V38-ITEM-STORE-08
  - V38-ITEM-STORE-09
  - V38-ITEM-STORE-10
  - V38-ITEM-STORE-11
  - V38-ITEM-STORE-12
  - V38-ITEM-STORE-13
  - V38-ITEM-STORE-14
  - V38-ITEM-STORE-15
  - V38-ITEM-STORE-16

# Metrics
duration: ~12min
completed: 2026-05-20
---

# Phase 171 Plan 02: Item Model + Storage Layer — ItemStore Summary

**One-liner:** File-backed atomic CRUD for v38 vault Items — one folder per Item under `<vaultRoot>/items/<uuid-v7>/` with per-type scaffolding (project/agent/chat), atomic `.tmp+rename` writes, and an in-process writeQueue mutex mirroring cc-pty/session-store.ts.

## What shipped

The `ItemStore` class — 342 LOC of file-backed CRUD for the v38 vault. Each Item gets its own folder containing an authoritative `item.json` plus per-type scaffolding files per D-V38-T canonical layout:

```
<vaultRoot>/items/<id>/item.json          (BaseItem + type-specific fields)
<vaultRoot>/items/<id>/README.md          (empty stub — user-editable detail view)
<vaultRoot>/items/<id>/CLAUDE.md          (empty stub — nested CC context)
<vaultRoot>/items/<id>/settings.json      ({} — per-item overrides)

# project-type only:
<vaultRoot>/items/<id>/tasks.json         ([])

# agent-type only:
<vaultRoot>/items/<id>/agent.md           (YAML frontmatter + "# Agent system prompt")
<vaultRoot>/items/<id>/tools.json         ([])

# chat-type only:
<vaultRoot>/items/<id>/transcript.json    ({messages: []})
```

Public surface matches the `<interfaces>` block in the plan verbatim:

| Method | Behavior |
|--------|----------|
| `constructor({vaultRoot})` | Validates `vaultRoot` is non-empty + absolute; normalizes; does NOT touch the filesystem. |
| `create(input)` | Generates `uuidv7()` id, builds the type-specific Item, mkdirs the folder, atomic-writes all shared + extra files. Serialized via writeQueue. |
| `read(id)` | Reads `item.json`. ENOENT → `null`. Any other parse/IO error propagates (strict mode per Threat T-171-02-01). |
| `update(id, patch)` | Reads current, strips immutable keys (id/type/createdAt/schemaVersion) from patch, merges, bumps `updatedAt=Date.now()`, atomic-writes. Throws if Item missing. |
| `archive(id)` | `update(id, {archivedAt: Date.now()})` — folder + scaffolding stay on disk. |
| `unarchive(id)` | `update(id, {archivedAt: null})`. |
| `delete(id)` | `fs.rm(itemDir, {recursive: true, force: false})`. Returns `true` if removed, `false` if missing. Serialized. |
| `list({archived?, parentId?})` | Walks `items/`, parses each `item.json`, filters out malformed entries, applies archived + parentId filters. |
| `itemDir(id)` | Public helper — Plan 171-03 tree-resolver consumes this to walk per-Item folders. |

## 16 vitest assertions — all PASS

```
✓ Assertion 1:  constructor does not touch the filesystem before first op
✓ Assertion 2:  create() returns a well-formed Item with defaults
✓ Assertion 3:  project create writes exactly {item, README, CLAUDE, settings, tasks} (5 files)
✓ Assertion 4:  agent create writes exactly {item, README, CLAUDE, settings, agent, tools} (6 files)
✓ Assertion 5:  chat create writes exactly {item, README, CLAUDE, settings, transcript} (5 files)
✓ Assertion 6:  read(unknownId) returns null, not a throw
✓ Assertion 7:  read(createdId) round-trips create()
✓ Assertion 8:  update bumps updatedAt monotonically (createdAt untouched)
✓ Assertion 9:  update preserves sibling fields (id, type, parentId, pinned, schemaVersion, cwd)
✓ Assertion 10: archive sets archivedAt; folder stays on disk
✓ Assertion 11: delete removes folder recursively; second delete returns false
✓ Assertion 12: list() returns all three types when 3 items of distinct types exist
✓ Assertion 13: list({archived: false}) hides archived items
✓ Assertion 14: list({parentId}) filters to that parent only
✓ Assertion 15: atomic write — fs.rename throw leaves no partial item.json
✓ Assertion 16: write queue serializes 10 concurrent updates; final JSON parses cleanly
```

Vitest run output:
```
Test Files  1 passed (1)
     Tests  16 passed (16)
  Duration  529ms
```

Combined Phase 171 vault-items suite (171-01 + 171-02):
```
Test Files  3 passed (3)
     Tests  32 passed (32)
  Duration  557ms
```

## Sample on-disk item.json fixture

Captured from `create({type: 'project', name: 'demo', cwd: '/tmp/repo'})`:

```json
{
  "id": "01968f7a-c1a0-7c4b-b3e5-7d2a1f4e9c10",
  "parentId": null,
  "name": "demo",
  "pinned": false,
  "createdAt": 1747800124567,
  "updatedAt": 1747800124567,
  "archivedAt": null,
  "schemaVersion": 1,
  "type": "project",
  "cwd": "/tmp/repo"
}
```

Pretty-printed JSON (2-space indent) per `JSON.stringify(v, null, 2)` — matches `cc-pty/session-store.ts:124` formatting precedent for grep-ability.

## Sacred file SHAs (post-171-02)

```
sha256: 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  liv/packages/core/src/sdk-agent-runner.ts
sha256: ee3323fc79a4e2ea04c2c50bd6226a05cbe987472ba60811cf4ec2c846ef5aa0  livos/packages/livinityd/source/modules/cc-pty/session-store.ts
sha256: 6eb0eadcf5f3fe90eb2bdf511bce3184fba1eb0fa89b480357eef67bb17fb29f  livos/packages/livinityd/source/modules/vault-graph/walker.ts
```

`liv/packages/core/src/sdk-agent-runner.ts` SHA `62f9245...` is the post-P77-02 steady-state value (per MEMORY.md `[Phase 65 Liv rename complete + Mini PC cutover done]` — the historical guard string `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is the constraint-NAME inherited by all v38 plans, not the literal current SHA). Plan 171-02 did NOT modify this file; `git diff --stat liv/packages/core/src/sdk-agent-runner.ts` returned empty over the entire plan.

`git diff --stat` on Phase 166 cc-pty, Phase 162 vault-scaffolder/claude-runner, Phase 169 vault-graph paths over this commit range — ALL EMPTY.

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| `item-store.ts` >= 200 LOC | 342 ✅ |
| `grep -c "enqueueWrite\|writeQueue" item-store.ts` >= 4 | 12 ✅ |
| `grep -c "fs.rename" item-store.ts` >= 1 | 4 ✅ |
| `grep -c "\.tmp" item-store.ts` >= 1 | 6 ✅ |
| `it(` block count in test >= 16 | 16 ✅ |
| Plan 171-02 vitest: 16 PASS, 0 FAIL | 16 PASS ✅ |
| Combined Phase 171 vitest: 32 PASS | 32 PASS ✅ |
| No path-escape patterns (`path.resolve(..., '..')`) | None ✅ |
| tsc --noEmit clean (vault-items module) | 0 errors in vault-items ✅ |
| Sacred SHA preserved (cc-pty/claude-runner/vault-graph/sdk-agent-runner untouched) | git diff --stat empty ✅ |

## Deviations from Plan

**None.** The plan was executed exactly as written. All 16 behavior assertions implemented 1:1 with the plan's `<behavior>` block, all field names match the `<interfaces>` block, atomic-write recipe mirrors cc-pty/session-store.ts:122-127 verbatim, and the writeQueue mutex mirrors session-store.ts:109-116 verbatim.

Two implementation footnotes (NOT deviations — they fall within the plan's wording but warrant explicit documentation):

1. **`create()` returns the in-memory Item directly**, not a re-read of `item.json` from disk. This is faster AND removes a TOCTOU window — but it means a hypothetical disk corruption immediately after `fs.rename` would leave the returned Item out of sync with disk. Acceptable because the rename is atomic and any subsequent `read()` will surface the disk state.

2. **`list()` skips entries that fail the `ID_SHAPE` regex.** This tolerates orphan `.tmp` files (Assertion 15 relies on this — a failed rename can leave a `.tmp` sibling). Operator-dropped junk in `items/` is also silently filtered.

## Out-of-scope discoveries

None this plan. The pre-existing 392 tsc errors logged in `.planning/phases/171-item-model-storage/deferred-items.md` during Plan 171-01 are unchanged — none are in `vault-items/` and none were introduced by this plan.

## Threat Flags

None. The threat surface registered in the plan's `<threat_model>` (T-171-02-01..05) covers all surface introduced by this plan. No new endpoints, no new auth paths, no schema changes at trust boundaries.

## Commits

| Hash | Message |
|------|---------|
| `ab482a5b` | feat(171-02): ItemStore — file-backed atomic CRUD + per-type scaffolding |
| _(this SUMMARY)_ | docs(171-02): complete Item Model + Storage Layer plan |

## Self-Check: PASSED

- `livos/packages/livinityd/source/modules/vault-items/item-store.ts` — FOUND ✅
- `livos/packages/livinityd/source/modules/vault-items/item-store.test.ts` — FOUND ✅
- `livos/packages/livinityd/source/modules/vault-items/index.ts` (modified) — FOUND ✅
- commit `ab482a5b` — FOUND in `git log --oneline` ✅
- 16 PASS in `pnpm --filter livinityd exec vitest run source/modules/vault-items/item-store.test.ts` — verified ✅
- 32 PASS combined Phase 171 — verified ✅
- Sacred files untouched (`git diff --stat liv/packages/core/src/sdk-agent-runner.ts livos/.../cc-pty/ livos/.../claude-runner/ livos/.../vault-graph/`) — empty ✅
