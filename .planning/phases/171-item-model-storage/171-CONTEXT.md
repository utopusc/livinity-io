# Phase 171: Vault Item Model + Storage Layer

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** `.planning/v38-LIV-AGENT-PLATFORM-MASTER.md` § Phase 171 + D-V38-A/B/C/E/F/T/U
**Wave:** 1 (parallel-safe with 172)

<domain>
## Phase Boundary

Build the livinityd backend module that owns the vault Item tree: types, file-backed item-store, tree-resolver, atomic CRUD operations, schema version 1. Expose via tRPC. Publish change events via Redis pub/sub.

**Phase 171 sonu:**
- NEW module `livos/packages/livinityd/source/modules/vault-items/`
- Item super-type discriminated union: `Project | Agent | Chat`
- Vault root resolved from `LIV_VAULT_ROOT` env (default `/root/liv/` post-173, `/root/livinity-vault/` pre-173 — Phase 173 handles the actual filesystem migration)
- Tree edges via `parentId` on each Item; `tree.json` rebuildable cache
- 5 tRPC procedures: `vault.items.{list,get,create,update,move,archive,delete}`
- Redis channel `liv:tree:updated` published on every mutation
- Cycle-check on move; soft warn at depth ≥ 5, hard reject at depth ≥ 8 (D-V38-E)
</domain>

<decisions>

### Plan 171-01: Item types + vault root resolver
- NEW `vault-items/types.ts` — `BaseItem`, `ProjectItem`, `AgentItem`, `ChatItem` discriminated union
- NEW `vault-items/vault-root-resolver.ts` — reads `process.env.LIV_VAULT_ROOT ?? '/root/livinity-vault'`
- NEW `vault-items/index.ts` (barrel)
- Acceptance: 8 vitest assertions — type narrowing, env resolution with fallback, UUID v7 generation via `nanoid`

### Plan 171-02: Item store (file-backed, atomic CRUD)
- NEW `vault-items/item-store.ts` + `.test.ts`
- `<vaultRoot>/items/<uuid>/item.json` per Item
- Atomic writes (`.tmp` + rename)
- Per-type file scaffolding (Project gets `tasks.json`, Agent gets `agent.md` + `tools.json`, Chat gets `transcript.json`)
- Acceptance: 16 vitest assertions — create writes correct files, read parses, update preserves siblings, delete removes dir, atomic .tmp survives mid-save crash

### Plan 171-03: Tree resolver + cycle detection
- NEW `vault-items/tree-resolver.ts` + `.test.ts`
- Walks `items/*/item.json`, derives `tree.json` cache (sorted by `pinned` then `updatedAt` desc)
- `validateMove(itemId, newParentId)` — detects cycles, depth violations
- Acceptance: 12 vitest assertions — cycle rejection, depth caps (warn ≥5, reject ≥8), orphan detection, tree.json refresh

### Plan 171-04: tRPC vault-items router
- NEW `livinityd/source/modules/server/trpc/vault-items-router.ts` + `.test.ts`
- 7 adminProcedure procedures: `list`, `get`, `create`, `update`, `move`, `archive`, `delete`
- Input validation via Zod
- Adds 7 entries to `httpOnlyPaths` in `common.ts`
- Acceptance: 14 vitest assertions — RBAC enforced, payload shapes correct, move rejects cycle

### Plan 171-05: Redis pub/sub + boot wire-up
- NEW `vault-items/pubsub.ts` — publishes `liv:tree:updated` JSON event on every mutation
- MOD `livinityd/source/index.ts` — instantiate VaultItemStore after vault scaffolder
- Acceptance: 8 vitest assertions — event fires on create/update/move/archive/delete, payload shape correct
</decisions>

<canonical_refs>
- `.planning/v38-LIV-AGENT-PLATFORM-MASTER.md` (master plan, D-V38-A..U)
- `livos/packages/livinityd/source/modules/cc-pty/session-store.ts` (Phase 166-02 file-backed store pattern — mirror)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (Phase 166 store + lifecycle pattern)
- `livos/packages/livinityd/source/modules/vault/vault-scaffolder.ts` (Phase 162-01 vault scaffolder — DO NOT MODIFY)
- `livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts` (Phase 168 tRPC router pattern)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 171-01 | NEW vault-items/{types,vault-root-resolver,index}.ts + tests |
| 171-02 | NEW vault-items/item-store.ts + test |
| 171-03 | NEW vault-items/tree-resolver.ts + test |
| 171-04 | NEW server/trpc/vault-items-router.ts + test; MOD trpc/index.ts + common.ts (additive) |
| 171-05 | NEW vault-items/pubsub.ts; MOD livinityd/source/index.ts (additive boot wire-up) |

**Sacred guards:** Sacred SHA + D-09 + Phase 161-02 + Phase 162-01 vault-scaffolder + Phase 162-02 agent-session + Phase 163 + Phase 164 + Phase 165-01 + Phase 166 cc-pty backend + Phase 167 cc-terminal + Phase 169 vault-graph backend — ALL UNCHANGED. Phase 168 cc-pty-router stays in this phase; deletion happens in Phase 173.

</specifics>

<deferred>
- SidebarTree UI → Phase 174
- CLI consumer of these tRPC routes → Phase 172
- Filesystem migration of legacy vault path → Phase 173
- Schedule registry for AgentItem cron → Phase 177
</deferred>

---

*Phase: 171-item-model-storage*
*Wave: 1 (parallel-safe with 172)*
*Estimated: ~2 days agent work*
