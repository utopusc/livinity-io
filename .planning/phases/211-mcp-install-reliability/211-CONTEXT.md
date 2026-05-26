# Phase 211 — MCP/App install reliability + auto-install MCP — Context

**Gathered:** 2026-05-26
**Status:** 🟡 PARTIAL — 211.1 defensive coexistence shipped; 211.2 + 211.3 filed as carries for next session.
**Mode:** Auto-generated (skip_discuss=true)

## Phase Boundary (per v41-DRAFT.md)

Three sub-features:
- **211.1** — Dual-writer collision at `liv:mcp:config` (livinityd HASH vs liv-core STRING).
- **211.2** — `EnvironmentOverridesDialog` for AI installs (replace opaque `dependency_missing` toast with envSchema-driven modal).
- **211.3** — Admin-only install gate (depends on Phase 212 Supabase migration).

## What shipped this session

**211.1 defensive coexistence (atomic):**
- `liv/packages/core/src/mcp-config-manager.ts` — added pre-SET Redis-TYPE check that refuses writes when the key is already a HASH (the livinityd-owned primitive), logs a loud error referencing CARRY-P211-UNIFY.
- Added cross-publish to `liv:mcp:updated` so liv-core mutations also notify livinityd's `mcp-bridge` (which subscribes on that channel).
- `liv/packages/core/src/mcp-config-manager.test.ts` — 4 vitest cases (refuses-on-hash, writes-on-none, writes-on-string, dual-channel-publish).

This is **NOT the full unification** — it's a defensive guard so writers don't WRONGTYPE-crash each other. Proper unification (pick a single primitive, migrate every caller, delete the loser) is filed as **CARRY-P211-UNIFY**.

## Live Mini PC state (probed 2026-05-26)

```
$ redis-cli TYPE liv:mcp:config
none
```

Neither writer has actually written this key in production yet. The dual-writer bug is latent — the moment any UI Settings → MCP action lands on Mini PC, livinityd writes a HASH; the moment any liv-core MCP install lands, it tries to SET. Whichever lands first wins; the other crashes on next attempt. This phase's guard catches the liv-core side; the inverse guard (livinityd refusing HSET on a STRING type) is left as part of CARRY-P211-UNIFY.

## Carries for next session

### CARRY-P211-UNIFY — Full unification of `liv:mcp:config` storage

**Recommended fix path:** Pick **HASH** (livinityd's choice — more atomic for partial updates, each server is its own field). Rewrite `McpConfigManager` to use `HSET/HGETALL/HDEL` primitives instead of `SET/GET`. All callers of liv-core API routes at `liv/packages/core/src/api.ts:938..1030` (installServer / updateServer / removeServer / setRawConfig / listServers) keep their TS surface but the implementation reads/writes HASH fields. Delete the type-check guard once unified (the guard is a transitional aid, not a permanent solution).

**Files to touch:**
- `liv/packages/core/src/mcp-config-manager.ts` (rewrite storage primitives)
- `liv/packages/core/src/mcp-config-manager.test.ts` (update assertions for HASH)
- `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` (no change — already HASH)
- Migration helper for any pre-CARRY-P211-UNIFY production deploys that may have a STRING value (delete-then-rewrite-as-HASH).

**Effort:** ~2 hours.

### CARRY-P211-DIALOG — `EnvironmentOverridesDialog`

Today: missing env var → `fail('dependency_missing')` → generic toast → user blocked.
Fix: read `envSchema` from app manifest; modal prompts for each `required: true` env; saves to per-user env file before install proceeds.

**Files to touch:**
- `livos/packages/ui/src/components/EnvironmentOverridesDialog.tsx` (NEW)
- `livos/packages/livinityd/source/modules/apps/apps.ts` (`install()` — surface `envSchema` to UI before failing)
- `livos/packages/livinityd/source/modules/server/trpc/apps-router.ts` (new tRPC query for app envSchema)
- Test cases.

**Effort:** ~6-8 hours.

### CARRY-P211-ADMIN-GATE — admin-only install gate

Today: `apps.install` / `installV37` are `privateProcedure` (any authenticated user); `/api/admin/apps` accepts any valid `liv_k_…` API key.
Fix: enforce `is_admin=true` on these routes (depends on the Supabase `is_admin` column landing in **Phase 212**).

**Files to touch:**
- `livos/packages/livinityd/source/modules/server/trpc/apps-router.ts` (replace `privateProcedure` with new `adminProcedure` for `install` / `installV37`)
- `platform/web/app/api/admin/apps/route.ts` (require `is_admin=true` from Supabase Auth context, not just a valid API key)
- Test cases — non-admin gets 403, admin gets 200.

**Effort:** ~2 hours, blocked on Phase 212.

## Decisions

- **D-211-01** — Pick livinityd HASH as canonical primitive for `liv:mcp:config` once unified. Rationale: per-server-field atomicity, simpler partial updates, already in active production use via Settings UI.
- **D-211-02** — Defensive guard is transitional. Remove it when CARRY-P211-UNIFY ships.
- **D-211-03** — 211.2 and 211.3 deferred from this session because they require either a UI component buildout (~6-8 hours) or a Supabase migration owned by Phase 212. Phase 211's atomic deliverable this session is the latent-collision-crash guard.

## Invariants

- **INV-211-01** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` untouched.
- **INV-211-02** — Vitest 4/4 PASS for `mcp-config-manager.test.ts`.
- **INV-211-03** — liv-core typecheck clean (`npx tsc --noEmit -p packages/core`).
