# Phase 84 — MCP Single Source of Truth — SUMMARY

**Wave:** 3 (single-phase wave; depends on Wave 2 deliverables)
**Status:** Complete. UI build green (35.28s); livinityd typecheck zero new
errors in created files; backend wired into root router; httpOnlyPaths
updated; legacy mcp-panel sidebar tab unwired (file kept on disk for P90).

---

## Files Created (8 total)

### Backend (livinityd)
- `livos/packages/livinityd/source/modules/mcp/mcp-smithery-client.ts`
  — Secondary registry client. Points at `server.smithery.ai/v1`. API key
  read from Redis key `liv:config:smithery_api_key` on every call (stateless
  by design so a key rotation doesn't require process restart). Methods:
  `searchServers(query, limit, offset)`, `getServer(qualifiedName)`,
  `isConfigured()`, `setApiKey(apiKey)`. Throws
  `SmitheryNotConfiguredError` (`name = 'SMITHERY_NOT_CONFIGURED'`) when
  API key is missing/empty. Normalizes Smithery's native response shape to
  `NormalizedRegistryServer` (same fields the Official client exposes) so
  the UI dialog renderers stay source-agnostic.
- `livos/packages/livinityd/source/modules/server/trpc/mcp-router.ts`
  — Six tRPC procedures (V32-MCP-01..09):
    - `mcp.search` (privateProcedure query) — dispatches to either Official
      registry (inline fetch to `registry.modelcontextprotocol.io/v0.1`) or
      Smithery client; returns `NormalizedSearchResult`
    - `mcp.getServer` (privateProcedure query) — single server detail incl.
      synthesized `configSchema` (Official: from
      `packages[0].environmentVariables[]`; Smithery: from
      `connections[0].configSchema`)
    - `mcp.installToAgent` (privateProcedure mutation) — appends a
      `ConfiguredMcp` row (extended with `source` + `credentials` fields
      that pass through the agents-repo's untyped JSONB) to
      `agents.configured_mcps`. De-dupes by `name` (treats install as
      upsert). FORBIDDEN when caller is not the agent owner.
    - `mcp.removeFromAgent` (privateProcedure mutation) — filters out the
      named entry. Idempotent: removing a non-existent name is a no-op.
    - `mcp.smitheryConfigured` (publicProcedure query) — returns
      `{configured: boolean}`. Never leaks the key value. Public so the
      BrowseDialog can render the source toggle pre-auth-resolution.
    - `mcp.setSmitheryKey` (adminProcedure mutation) — sets/clears the
      Redis key. Pass empty string to clear (which disables Smithery
      source).

### Frontend (ui)
- `livos/packages/ui/src/components/mcp/types.ts`
  — Shared types (`McpSource`, `McpConfigSchemaProperty`,
  `McpConfigSchema`, `McpRegistryServer`, `ConfiguredMcp`). Hand-typed
  (NOT derived from `RouterOutput`) to keep the dialog renderers stable
  against backend type drift.
- `livos/packages/ui/src/components/mcp/mcp-api.ts`
  — Typed tRPC hook wrappers (mirrors `agents-api.ts` pattern):
  `useMcpSearch`, `useMcpServer`, `useSmitheryConfigured`,
  `useInstallMcpToAgent`, `useRemoveMcpFromAgent`, `useSetSmitheryKey`.
  Mutations invalidate `agents.get` for the affected agentId so the
  editor + ConfiguredMcpList re-render with the fresh array.
- `livos/packages/ui/src/components/mcp/BrowseDialog.tsx`
  — Modal dialog (h-[80vh] max-w-5xl). Toolbar: source pill toggle
  ([Official] [Smithery]) + 300ms debounced search input (via
  `react-use`'s `useDebounce`, same pattern as P86's `MarketplaceFilters`).
  Body: 25%/75% split — categorized sidebar (drawn from result tags) and
  3-col server card grid. Smithery pill disabled with `Tooltip` "Smithery
  API key required. Add it in Settings > Integrations > Smithery." when
  `mcp.smitheryConfigured` returns `{configured: false}`. Click "Configure"
  on a card → opens `ConfigDialog`. `onInstalled` fires the parent's
  refetch + closes both dialogs.
- `livos/packages/ui/src/components/mcp/ConfigDialog.tsx`
  — Modal dialog (max-h-[85vh] max-w-2xl). Re-fetches the server detail
  via `useMcpServer` (search results lack the full configSchema for
  Official). Two sections:
    - **Credentials form** — rendered FROM `configSchema.properties`. Each
      property → `<Input>` with `type='password'` if `isSecret: true`.
      Required fields validated against `configSchema.required[]`.
    - **Tool selection** — checkbox list of all `tools[]`. Default: all
      checked. Tools with `required: true` lock checked. Empty-tool-list
      fallback: "All tools will be enabled by default once the server is
      connected."
  Submit → `mcp.installToAgent` mutation → toast on success → calls
  `onInstalled` (closes both dialogs).
- `livos/packages/ui/src/components/mcp/ConfiguredMcpList.tsx`
  — Per-agent row list. Each row: color pill (from P83's
  `getMCPServerColor` — IMPORTED from
  `@/routes/ai-chat/v32/views/get-mcp-server-color`) + server name +
  source tag (Official/Smithery) + enabled tool count + Remove X button.
  Empty state: "No MCP servers configured. Click + MCP Server to add one."
  Remove uses `useRemoveMcpFromAgent` mutation; per-row spinner via
  `removeMutation.variables.serverName === mcp.name`.
- `livos/packages/ui/src/components/mcp/MCPConfigurationNew.tsx`
  — Wrapper component. Renders header ("MCP Servers" + descriptor) +
  ConfiguredMcpList + a "+ MCP Server" button that opens BrowseDialog.
  `disabled` prop locks the add button + propagates to the list (read-only
  mode for system seeds / non-owned public agents).

## Files Modified (5 total)

- `livos/packages/livinityd/source/modules/server/trpc/index.ts`
  — Imported `mcpRouter`; registered as `mcp` namespace alongside
  existing `agents` and `marketplace`.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts`
  — Added 6 procedure paths to `httpOnlyPaths`:
    - `mcp.search`, `mcp.getServer` (privateProcedure queries — registry
      HTTP fetches can take seconds; HTTP avoids WS-handshake-delay flicker)
    - `mcp.installToAgent`, `mcp.removeFromAgent` (privateProcedure
      mutations — autosave-adjacent, must survive WS reconnect after
      `systemctl restart livos`; precedent: agents.update at line 257)
    - `mcp.smitheryConfigured` (publicProcedure — must work pre-auth so
      BrowseDialog renders correctly when no JWT is present)
    - `mcp.setSmitheryKey` (adminProcedure — settings-page mutation
      consistency cluster)
- `livos/packages/ui/src/routes/agents/agent-editor.tsx`
  — Added `MCPConfigurationNew` import + mounted as a section beneath
  the Manual tab's `ManualForm`. Reads `agent.configuredMcps` from the
  live agent (NOT the in-flight form snapshot — MCPs are managed via
  dedicated install/remove mutations, not the autosave path).
  `disabled={isReadOnly}` propagates so system seeds + non-owned public
  agents render the list (visible) but lock install/remove affordances.
  Also changed `<TabsContent value='manual' className='mt-4'>` → `'mt-4
  space-y-4'` so the new section spaces nicely from the form.
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — DEPRECATED legacy
  MCP panel sidebar tab. Specifically:
    - Commented out the `McpPanel` lazy import (line ~58)
    - Removed `'mcp'` from the `SidebarView` union (line ~71)
    - Removed the MCP tab `<button onClick={() => onViewChange('mcp')}>`
      from the sidebar nav (line ~158)
    - Removed the `activeView === 'mcp'` render branch (line ~838)
    - Updated the multi-view filler check (line ~234) to drop `'mcp'`
    - Removed the unused `IconPlug` import
  The `mcp-panel.tsx` FILE remains on disk; P90 cutover deletes it.
- `livos/packages/ui/src/routes/ai-chat/v32/ChatComposer.tsx`
  — TODO comment only. The "+ MCP" button is deferred to P88 (when agent
  selection lands in this composer) per the CONTEXT decision: "Skipped
  for P84 because the v32 chat surface does not yet have an agent
  selector — adding the button without one would render a no-op (or
  worse, hardcode an agent id)."

---

## Hard Constraints — Verified

| Constraint | Status |
|---|---|
| ZERO changes to `agents-repo.ts` (Wave 1 lock — consume only) | Confirmed by `git diff agents-repo.ts` returning empty |
| ZERO changes to `agents-router.ts` (P85-UI lane) | Confirmed |
| ZERO changes to `marketplace-router.ts` (P86 lane) | Confirmed |
| ZERO changes to v32/ chat surface OTHER THAN the optional composer button (TODO comment only — no functional change) | Confirmed |
| ZERO changes to `liv-core/mcp-registry-client.ts` (preserve as primary source) | Confirmed |
| D-MCP-SOT — ALL MCP UI flows through 4 new components in `components/mcp/` | Confirmed (BrowseDialog + ConfigDialog + ConfiguredMcpList + MCPConfigurationNew) |
| D-DUAL-SOURCE — Official (default) and Smithery (gated) per-session | Confirmed; `source` discriminator persisted on every `configured_mcps` row written |
| D-LIV-STYLED — `liv-*` Tailwind tokens only | Confirmed (no hardcoded hex; per-server color pills come from P83's `getMCPServerColor` palette) |
| D-PROCEDURE-HTTP — every new tRPC path in httpOnlyPaths | All 6 paths added to common.ts |
| D-DEFENSIVE-SMITHERY — clear PRECONDITION_FAILED when key missing | `mapClientError` translates `SmitheryNotConfiguredError` → `TRPCError({code: 'PRECONDITION_FAILED', message: 'Smithery API key required. Add it in Settings > Integrations > Smithery.'})` |

---

## Verification Gates Run

```
# UI build
cd livos/packages/ui && pnpm build
✓ built in 35.28s              # exit 0

# Backend typecheck (own files)
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep -E "mcp-router|mcp-smithery"
(empty)                        # zero new errors in created files

# Legacy mcp-panel sidebar removal
grep -n "McpPanel\|'mcp'" routes/ai-chat/index.tsx
(only deprecation-comment hits — no active tab/render branch references)
```

Pre-existing baseline noise unchanged: `ctx.logger` possibly-undefined at
`server/trpc/index.ts:118`, `WebSocketServer` type mismatch at
`server/trpc/index.ts:132` — both predate this phase and live in code I did
not touch. The error count delta on changed files is zero.

Smithery toggle gating verified by reading the procedure code:
`McpSmitheryClient.isConfigured()` returns `Boolean(key && key.trim().length
> 0)` — when the Redis key is unset OR set to empty, the procedure returns
`{configured: false}` and the UI's `<Tooltip>` wraps the disabled pill.
Setting `redis-cli SET liv:config:smithery_api_key "test-key"` makes the
gate true; deleting it (or setting to empty) makes it false. The
`mcp.setSmitheryKey` admin mutation invokes `redis.del` for empty input
which keeps the gate honest.

---

## Key Implementation Notes

### Why `mcp-smithery-client.ts` lives in livinityd, not liv-core
The official `McpRegistryClient` lives in liv-core (`liv/packages/core/`)
because it predates the v32 lane and is consumed by the legacy `/api/mcp/*`
Express routes. Per D-NO-OTHER-LANES we don't touch liv-core in this
phase — but a livinityd-side smithery client is exactly the right shape:
it sits next to the new tRPC `mcp-router.ts`, reads the livinityd-managed
Redis (`ctx.livinityd.ai.redis`), and survives the eventual liv-core
deprecation cleanly.

### Why the Official registry fetch is inlined into mcp-router instead of imported from liv-core
Same D-NO-OTHER-LANES + the liv-core client lives in a separately-built
package whose dist would need to be re-published before livinityd could
import it. The fetch wrapper is ~40 lines and straightforward — keeping
it inline removes a build-order dependency without losing functionality.
The two clients can be unified later (probably during v33 when the legacy
`/api/mcp/*` surface is retired).

### Why credentials live on `configured_mcps` rows (extension of `ConfiguredMcp` repo type)
The agents-repo type is `{name, enabledTools}` — but the JSONB column
serializes whatever the router writes. The router types the extended
shape (`ConfiguredMcp & {source, credentials}`) at the install boundary
and casts back to `ConfiguredMcp[]` at the `updateAgent` call, so the
extras pass through the repo without a schema change. The UI types in
`components/mcp/types.ts` declare the extended shape directly so reads see
the full row.

A future cleanup might lift `source` + `credentials` into the agents-repo
`ConfiguredMcp` type proper. We leave that for a follow-up phase to keep
the Wave 1 repo lock honored.

### Why `BrowseDialog` doesn't render `ConfigDialog` inside its own DOM tree
Both use Radix `Dialog`. Stacking two open Radix Dialogs causes focus-trap
weirdness (the second dialog's autoFocus competes with the first's
restoreFocus). The implementation closes the BrowseDialog (`open && !
selectedServer` gate) when the ConfigDialog opens, then the ConfigDialog's
`onCancel` re-opens BrowseDialog. The user perceives a single nested flow;
the DOM has only one dialog mounted at a time.

### Why ChatComposer "+ MCP" was skipped
The v32 `ChatComposer.tsx` does not yet have an agent selector. The
button as specified would open BrowseDialog "scoped to the CURRENTLY
SELECTED agent" — but there is no such state in v32 chat today. Adding
the button without agent selection would either render a no-op or
hardcode an agent id (both worse than skipping). The TODO comment in
`ChatComposer.tsx` documents the deferral and points at this phase's
CONTEXT.

### Why `mcp-panel.tsx` file kept on disk
The prompt specifies "Leave the `mcp-panel.tsx` FILE in place (P90 may
delete it). Just unwire from the UI tree." Done. The file is
untouched; only the call sites in `routes/ai-chat/index.tsx` are unwired.

---

## tRPC Procedure Surface (final)

| Path | Type | Auth | Input | Output |
|---|---|---|---|---|
| `mcp.search` | query | private | `{query?, source: 'official'\|'smithery', limit?, offset?}` | `{servers: NormalizedRegistryServer[], total?, hasMore?}` |
| `mcp.getServer` | query | private | `{serverId, source: 'official'\|'smithery'}` | `NormalizedRegistryServer` (NOT_FOUND if missing) |
| `mcp.installToAgent` | mutation | private | `{agentId, serverId, source, credentials?, enabledTools[]}` | `Agent` (FORBIDDEN if not owner) |
| `mcp.removeFromAgent` | mutation | private | `{agentId, serverName}` | `Agent` (FORBIDDEN if not owner) |
| `mcp.smitheryConfigured` | query | public | none | `{configured: boolean}` |
| `mcp.setSmitheryKey` | mutation | admin | `{apiKey: string}` | `{ok: true}` |

All 6 paths registered in `httpOnlyPaths` (D-PROCEDURE-HTTP).

---

## Out of Scope (deferred per CONTEXT)

- Real Settings > Integrations > Smithery panel (P89/P90). The
  `mcp.setSmitheryKey` admin mutation exists so the future panel can
  wire to it without re-touching this lane.
- Composer "+ MCP" button (deferred to P88 when agent selection lands).
- Capability registry / LIVINITY_subagents migration to `configured_mcps`
  (P90 cleanup).
- Editing an installed MCP's credentials post-install. v32 currently
  requires remove + re-install; "edit" is a future enhancement.
- Tool-result caching / circuit breaker (Hermes pattern from P87 lane).
- Lifting `source` + `credentials` into the agents-repo `ConfiguredMcp`
  type proper. Currently lives at the JSONB layer (extras pass through
  untyped); future repo migration cleans this up.

---

## Commit

ONE commit (per prompt protocol). NOT pushed — orchestrator batches Wave 3.
