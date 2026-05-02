---
phase: 50
plan: 01
status: complete
date: 2026-05-02
---

# Plan 50-01 — A1 Tool Registry Built-in Seed

## Outcome

**COMPLETE** — defensive eager seed module shipped, integration test passing 4/4, livinityd boot wire-in landed.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` | 90 | Seed module exporting `seedBuiltinTools(redis)` — writes 9 BUILT_IN_TOOL_IDS manifests to `nexus:cap:tool:*` + sentinel `nexus:cap:_meta:lastSeedAt` |
| `livos/packages/livinityd/source/modules/seed-builtin-tools.test.ts` | 134 | tsx-runnable integration test (4 cases) — Map-backed fake Redis, W-15/G-06 production guard |

## Files Modified

| File | Change |
|------|--------|
| `livos/packages/livinityd/source/index.ts` | +1 import line, +9 lines try/catch boot wire-in between `Promise.all` and `TunnelClient` init |

## Test Output

```
  PASS  seed writes 9 tool keys
  PASS  each manifest has required fields
  PASS  sentinel key is set
  PASS  idempotent re-seed

4 passed, 0 failed
```

Run command: `npx tsx source/modules/seed-builtin-tools.test.ts` from `livos/packages/livinityd/`

## TypeScript Check

`tsc --noEmit` shows zero errors in the 3 files touched by Plan 50-01. Pre-existing TS errors in other files (`skills/*.ts`, `source/modules/ai/routes.ts`) are out of scope for v29.5.

## Locked Decisions Encoding

- **D-50-01** ✓ Imports `BUILT_IN_TOOL_IDS` from `./diagnostics/capabilities.js` — no duplication of the 9-element list
- **D-50-02** ✓ Manifest shape mirrors nexus `CapabilityManifest` but is duplicated locally — no cross-package compile dependency on nexus
- **D-50-03** ✓ Sentinel `nexus:cap:_meta:lastSeedAt` SET to ISO timestamp after each seed run
- **D-50-04** ✓ Boot wire-in inserted between `await Promise.all([...ai.start()...])` and `this.tunnelClient = new TunnelClient(...)` at the exact location specified
- **D-50-05** ✓ Test mirrors `capabilities.test.ts` — bare tsx + `node:assert/strict`, W-15/G-06 production-Redis guard at top, Map-backed fake Redis

## Deviations

NONE. The plan was authoritative; the code was effectively pre-written in the plan's `<action>` blocks. Inline execution skipped the gsd-executor agent overhead.

## Requirement Coverage

- **FR-A1-01** (root cause + seed module half) — module exists, writes 9 builtin tool manifests, idempotent, sentinel set ✓
- **FR-A1-02** (idempotent integration test) — `4 passed, 0 failed` confirms ≥9 keys, identical re-seed state, sentinel set, manifest shape ✓
- **FR-A1-03** (live ≥9 keys post-deploy) — DEFERRED to Phase 55
- **FR-A1-04** (live tool invocation succeeds) — DEFERRED to Phase 55

## Phase 50 status

Phase 50 mechanism complete. Live verification deferred to Phase 55 per ROADMAP success criterion #4.
