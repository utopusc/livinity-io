# Phase 50: A1 — Tool Registry Built-in Seed — Context

**Gathered:** 2026-05-02
**Status:** Ready for execution
**Mode:** Auto-generated from ROADMAP + Phase 49 fixture (workflow.skip_discuss=true)

<domain>
## Phase Boundary

**Goal:** Defensive eager seed of the 9 BUILT_IN_TOOL_IDS to `nexus:cap:tool:*` on livinityd boot, idempotent, surviving factory resets and partial syncs.

**In scope:**
- New module `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` exporting `seedBuiltinTools(redis)`
- Integration test `seed-builtin-tools.test.ts` mirroring `capabilities.test.ts` DI pattern (tsx + node:assert + Map-backed fake Redis)
- Wire-in: call `seedBuiltinTools(this.ai.redis)` from livinityd boot in `livos/packages/livinityd/source/index.ts` after `ai.start()` (Promise.all on line 215-222), before `TunnelClient` init on line 225
- Idempotency: re-running the seed produces identical Redis state (SET is naturally idempotent; sentinel `nexus:cap:_meta:lastSeedAt` updates each call)

**Out of scope:**
- Live Mini PC verification (deferred to Phase 55)
- Modifying nexus capability-registry's `syncTools()` flow (Phase 47 D-WAVE5-SYNCALL-STUB tracked separately)
- Adding new tools to BUILT_IN_TOOL_IDS list — uses the existing 9-element list as source-of-truth

</domain>

<decisions>
## Implementation Decisions

### D-50-01 (LOCKED): Single source-of-truth for tool ID list

The 9 IDs come from existing `livos/packages/livinityd/source/modules/diagnostics/capabilities.ts:162` `BUILT_IN_TOOL_IDS` constant. Import it — do NOT duplicate the list. Per ROADMAP success criterion #3.

### D-50-02 (LOCKED): Manifest format compatible with nexus CapabilityRegistry

`nexus/packages/core/src/capability-registry.ts:174-205` writes manifests to `nexus:cap:tool:${name}` (note: just the name, not `tool:name`). The seed module MUST use the same key format AND a manifest schema that survives nexus's later `syncTools()` overwriting it.

Minimal valid `CapabilityManifest` (from nexus):
```typescript
{
  id: `tool:${name}`,
  type: 'tool',
  name: name,
  description: <hardcoded short description>,
  semantic_tags: [],
  triggers: [],
  provides_tools: [name],
  requires: [],
  conflicts: [],
  context_cost: 0,  // updated by syncTools when it runs
  tier: 'any',
  source: 'system',
  status: 'active',
  last_used_at: 0,
  registered_at: <now-ms>,
}
```

Hardcode short fallback descriptions per tool (e.g., `shell: "Execute shell commands on the host"`). When nexus's `syncTools()` runs later, it OVERWRITES these via unconditional `pipeline.set()` with the real tool descriptions. The seed serves as a fallback floor — keys are always present even if `syncTools()` never runs (the v29.4 production state).

### D-50-03 (LOCKED): Sentinel key

After writing all 9 tool manifests, SET `nexus:cap:_meta:lastSeedAt` to current ISO timestamp. This:
- Provides observability ("when was last builtin seed?")
- Tests can assert it was set without depending on real timestamps
- Aligns with existing `nexus:cap:_meta:last_sync_at` convention from Phase 47 atomic-swap

### D-50-04 (LOCKED): Boot wire-in location

In `livos/packages/livinityd/source/index.ts`, immediately after the `Promise.all([... this.ai.start() ...])` block on line 215-222, before line 225 (`this.tunnelClient = new TunnelClient({redis: this.ai.redis})`).

```typescript
// Phase 50 (v29.5 A1) — defensive eager seed of built-in tools to nexus:cap:tool:*
// Survives factory resets and the v29.4 syncAll() stub (D-WAVE5-SYNCALL-STUB).
try {
  await seedBuiltinTools(this.ai.redis)
  this.logger.log('Seeded 9 built-in tool manifests to capability registry')
} catch (err) {
  // Non-fatal — boot continues; tools will be missing until next syncTools()
  this.logger.error('Failed to seed builtin tools', err)
}
```

### D-50-05 (Claude's discretion): Test framework

Mirror `capabilities.test.ts` exactly:
- Bare tsx runner (NO vitest — see file's header comment)
- `node:assert/strict`
- W-15/G-06 production-Redis guard at top
- Map-backed fake Redis (`makeFakeRedis()` from capabilities.test.ts adapted)
- Tests:
  1. After seed: all 9 keys at `nexus:cap:tool:*` exist with valid JSON manifests
  2. Re-seed: Redis state is identical (idempotent), sentinel `lastSeedAt` re-updated
  3. Sentinel `nexus:cap:_meta:lastSeedAt` is set after seed
  4. Each manifest has `type: 'tool'`, valid `id`, `name`, non-empty `description`

</decisions>

<code_context>
## Existing Code Insights

- **`BUILT_IN_TOOL_IDS`** at `livos/packages/livinityd/source/modules/diagnostics/capabilities.ts:162` — 9 IDs each prefixed with `tool:`. Pre-strip prefix when computing the `name` for the Redis key.
- **`CapabilityManifest`** type — defined in `nexus/packages/core/src/capability-registry.ts` (search for `interface CapabilityManifest`). The seed module writes the same shape but doesn't depend on the nexus type at compile time (avoid cross-package import — duplicate the minimal type locally).
- **Boot sequence** — `livos/packages/livinityd/source/index.ts:215-222` runs `Promise.all([files.start, apps.start, appStore.start, dbus.start, server.start, ai.start])`. After this, `this.ai.redis` is the live ioredis client. Insert the seed call between line 222 and line 225.
- **Existing seed pattern** — `seedLocalEnvironment()` at `livos/packages/livinityd/source/modules/docker/environments.ts:71` is a 9-line idempotent function. Mirror its style: short, pure, returns void.
- **Test pattern** — `livos/packages/livinityd/source/modules/diagnostics/capabilities.test.ts` is the canonical reference for Redis-DI tests in this codebase. Lines 22-50 show the production-Redis guard. Lines 60-100 show the Map-backed fake Redis.

## Files to create

- `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` — the seed module (~50 lines)
- `livos/packages/livinityd/source/modules/seed-builtin-tools.test.ts` — integration test (~120 lines)

## Files to modify

- `livos/packages/livinityd/source/index.ts` — add import + boot call (~6 lines added)

</code_context>

<specifics>
## Specific Requirements

- FR-A1-01 (seed module half): module exists, writes 9 builtin tool manifests, idempotent, sentinel set
- FR-A1-02: integration test passes against isolated (Map-backed fake) Redis with all 4 assertions

</specifics>

<deferred>
## Deferred Ideas

- Live Mini PC verification → Phase 55
- Hardening nexus's `syncTools()` flow itself → out of v29.5 scope
- Bumping `BUILT_IN_TOOL_IDS` count or adding new tools → out of scope
- Extracting a shared `CapabilityManifest` type to a shared package → out of scope (premature abstraction)

</deferred>
