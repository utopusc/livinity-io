# Phase 84 — MCP Single Source of Truth — CONTEXT

**Wave:** 3 (single-phase wave; depends on Wave 2 deliverables)
**Slice:** Backend tRPC + Frontend MCP UI
**Status:** In execution.

---

## Purpose

Close the MCP duplication that v32 §0 enumerates as Pain Point #3:
> "MCP duplicated across 3 places (mcp-panel + /agent-marketplace + capabilities) — wants single source of truth"

Phase 84 collapses MCP discovery, configuration, and per-agent assignment
into a single component family (`BrowseDialog` + `ConfigDialog` +
`ConfiguredMcpList` + `MCPConfigurationNew`) that lives **inside the agent
editor** (P85-UI's `agent-editor.tsx`). The legacy `mcp-panel.tsx` is
unwired from the chat sidebar (file kept on disk for P90 to delete).

A second registry (Smithery) becomes available behind a Redis-key gate
(`liv:config:smithery_api_key`), with a UI source-toggle pill that defaults
to "Official" and disables Smithery when no key is configured.

---

## Dependencies (Wave 2 deliverables consumed)

| From | What we use | How |
|---|---|---|
| **P85-schema** (Wave 1) | `agents.configured_mcps JSONB` column + `Agent` / `ConfiguredMcp` types | Read via `getAgent`, write via `updateAgent` from `database/index.ts` barrel |
| **P85-UI** (Wave 2) | `agents-router.ts` pattern + `agents-api.ts` hook style + `agent-editor.tsx` Manual tab | Mirror the router shape for `mcp-router.ts`; wrap our procedures in `mcp-api.ts`-style hooks; mount `MCPConfigurationNew` as a new section in the Manual tab |
| **P86** (Wave 2) | `marketplace-router.ts` pattern + `MarketplaceFilters.tsx` debounced search | Mirror the publicProcedure/privateProcedure split + 300ms `useDebounce` pattern in `BrowseDialog` search |
| **P83** (Wave 2) | `getMCPServerColor` from `routes/ai-chat/v32/views/get-mcp-server-color.ts` | Import directly into `ConfiguredMcpList` for color pills |
| **liv core** (existing) | `McpRegistryClient` (`liv/packages/core/src/mcp-registry-client.ts`) — primary registry source | Reach via `liv-core` HTTP API at `/api/mcp/registry/search` (existing P78-style pattern) — NOT a direct import; livinityd's `mcp-router.ts` proxies through the liv-core HTTP endpoint OR makes its own fetch to `registry.modelcontextprotocol.io`. **Decision below in §Architecture.** |

---

## Architecture decisions (locked at CONTEXT time)

### D-MCP-SOT (Single Source of Truth)
ALL MCP UI flows through the 4 new components in
`livos/packages/ui/src/components/mcp/`:
- `BrowseDialog.tsx` — discovery
- `ConfigDialog.tsx` — credentials + tool-selection
- `ConfiguredMcpList.tsx` — per-agent display
- `MCPConfigurationNew.tsx` — wrapper consumed by agent editor

No new MCP UI lives elsewhere in the codebase. The legacy `mcp-panel.tsx`
file remains on disk but its sidebar tab is unwired (P90 deletes the file).

### D-DUAL-SOURCE
`BrowseDialog` exposes a source pill: `[Official] [Smithery (key required)]`.
- **Official** (default) — hits `registry.modelcontextprotocol.io` via the
  livinityd `mcp-router.ts` `mcp.search`/`mcp.getServer` procedures
- **Smithery** — hits `server.smithery.ai` via the new
  `mcp-smithery-client.ts`. Requires `liv:config:smithery_api_key` Redis key
  to be set; otherwise the pill is disabled with a tooltip.

The `source: 'official' | 'smithery'` discriminator is **persisted on every
`configured_mcps` row** so re-discovery (e.g. a future "reinstall" UX) can
go back to the right registry.

### D-LIV-STYLED
All UI surfaces use `liv-*` Tailwind tokens (matches P85-UI / P86 lanes).
Hardcoded hex is reserved for per-server identity via `getMCPServerColor`
(palette-classified, not a design token).

### D-PROCEDURE-HTTP
Every new tRPC procedure path is added to `httpOnlyPaths` in `common.ts`:
- `mcp.search` (privateProcedure query) — registry HTTP fetch may take
  seconds; HTTP avoids WS-handshake-delay flicker
- `mcp.getServer` (privateProcedure query) — same
- `mcp.installToAgent` (privateProcedure mutation) — autosave-adjacent
  patches `agents.configured_mcps` JSONB; HTTP for WS-reconnect-survival
  (memory pitfall B-12 / X-04)
- `mcp.removeFromAgent` (privateProcedure mutation) — same
- `mcp.smitheryConfigured` (publicProcedure query) — UI gate for the
  Smithery toggle, returns `{configured: boolean}` only (never leaks key
  value); public so the dialog can render pre-auth-resolution
- `mcp.setSmitheryKey` (adminProcedure mutation) — admin-only, sets the
  Redis key. **Defensive**: even if the eventual Settings UI doesn't exist
  yet, this procedure exists so a future P89/P90 Settings panel can wire
  it up without re-touching this lane.

### D-DEFENSIVE-SMITHERY
`mcp-smithery-client.ts` throws `SMITHERY_NOT_CONFIGURED` (string code in
the Error name field) when no API key is in Redis. The router catches and
returns a clear `TRPCError({code: 'PRECONDITION_FAILED', ...})`. UI displays
a tooltip "Smithery API key required. Add it in Settings > Integrations >
Smithery (coming in P89/P90)."

### D-NO-SACRED-TOUCH
Sacred file `liv/packages/core/src/sdk-agent-runner.ts` is NOT touched.
This phase's surface is entirely:
- livinityd `mcp-router.ts` (new) + `mcp-smithery-client.ts` (new)
- livinityd `trpc/index.ts` + `trpc/common.ts` (mod)
- ui `components/mcp/*` (new, 4 files)
- ui `routes/agents/agent-editor.tsx` (mod — add MCP section)
- ui `routes/ai-chat/v32/ChatComposer.tsx` (mod or skip — `+ MCP` button)
- ui `routes/ai-chat/index.tsx` (mod — unwire mcp-panel sidebar tab)

### D-NO-OTHER-LANES
- ZERO changes to `agents-repo.ts` (Wave 1 lock — consume only)
- ZERO changes to `agents-router.ts` (P85-UI lane)
- ZERO changes to `marketplace-router.ts` (P86 lane)
- ZERO changes to `mcp-registry-client.ts` (preserve as primary source)
- ZERO changes to `routes/agents/agent-card.tsx`, `routes/agents/index.tsx`,
  `routes/agents/agents-api.ts`, `routes/agents/use-debounced-autosave.ts`
  (P85-UI lane — only `agent-editor.tsx` is touched, and only to add a new
  section beneath the existing form)

---

## Source registry HTTP shape (reverse-engineered)

### Official MCP Registry (`registry.modelcontextprotocol.io/v0.1`)
- `GET /servers?q=&cursor=&limit=` → `{servers: RegistryServerRaw[], next_cursor?}`
  - `RegistryServerRaw = {server: RegistryServer, _meta?: {...}}`
- `GET /servers/{name}` → `RegistryServerRaw`
- `RegistryServer` shape: `{name, description, version, repository, packages[], remotes[]}`
  - `packages[]` carries `environmentVariables[]` for credential fields
  - `remotes[]` carries `{type, url}` for HTTP transports

The livinityd `mcp.search` and `mcp.getServer` procedures fetch directly
against this URL (matching the pattern in `liv-core`'s
`mcp-registry-client.ts`) — we do **not** proxy through liv-core HTTP API
because the livinityd-tRPC → liv-HTTP hop adds latency and a failure mode
without buying us anything.

### Smithery (`server.smithery.ai`)
Smithery's API is OpenAPI-style. The endpoints we use:
- `GET /v1/registry?q=&page=&pageSize=` (Bearer auth)
  → `{servers: SmitheryServer[], total, page, pageSize}`
- `GET /v1/registry/{qualifiedName}` (Bearer auth)
  → `SmitheryServer`

The `mcp-smithery-client.ts` normalizes the Smithery shape to the same
`RegistryServer` shape used by the Official client so the UI can render
both registries with one renderer.

`configSchema` for credential fields: Smithery returns
`connections[].configSchema` (JSON Schema). For Official, we map
`packages[0].environmentVariables[]` to a synthetic JSON Schema. The UI
walks the schema to produce form inputs.

---

## Component contracts

### `BrowseDialog`
```ts
interface BrowseDialogProps {
  open: boolean
  onClose: () => void
  agentId: string
  onInstalled: () => void  // parent re-fetches the agent
}
```
- Search input (debounced 300ms via `useDebounce` from `react-use`)
- Source toggle pill: `[Official] [Smithery]` — Smithery disabled when
  `mcp.smitheryConfigured` returns `{configured: false}`
- Categorized sidebar (left, ~25%): list of categories drawn from server
  metadata; click filters the grid
- Server cards grid (right, ~75%): name + description + install_count
  badge + "Configure" button → opens ConfigDialog

### `ConfigDialog`
```ts
interface ConfigDialogProps {
  server: RegistryServer | SmitheryServer
  source: 'official' | 'smithery'
  agentId: string
  onInstalled: () => void
  onCancel: () => void
}
```
- Header: avatar + name + description
- Credentials form: rendered FROM `configSchema` (or synthesized for
  Official). Validates required fields.
- Tool selection: checkbox list of all tools the server exposes (default:
  all checked). `tools_required: string[]` locks specific checkboxes
  always-checked.
- Submit → `mcp.installToAgent` mutation → success closes both dialogs +
  toasts "MCP server installed"

### `ConfiguredMcpList`
```ts
interface ConfiguredMcpListProps {
  configuredMcps: ConfiguredMcp[]
  agentId: string
  onChanged: () => void
}
```
- Each row: server color pill (from `getMCPServerColor`) + name + source
  tag (Official/Smithery) + enabled tool count + "Remove" X button
- Empty state: "No MCP servers configured. Click + MCP Server to add one."

### `MCPConfigurationNew`
```ts
interface MCPConfigurationNewProps {
  agentId: string
  configuredMcps: ConfiguredMcp[]
}
```
- Renders `ConfiguredMcpList` + a "+ MCP Server" button that opens
  `BrowseDialog`
- Mounted inside `routes/agents/agent-editor.tsx` Manual tab, beneath
  the existing form

---

## tRPC procedure surface

| Path | Type | Auth | Input | Output |
|---|---|---|---|---|
| `mcp.search` | query | private | `{query?, source: 'official'\|'smithery', limit?, offset?}` | `{servers: RegistryServer[], total?, hasMore?}` |
| `mcp.getServer` | query | private | `{serverId, source: 'official'\|'smithery'}` | `RegistryServer` (with synthesized `configSchema`) |
| `mcp.installToAgent` | mutation | private | `{agentId, serverId, source, credentials, enabledTools[]}` | `Agent` (the updated agent) |
| `mcp.removeFromAgent` | mutation | private | `{agentId, serverName}` | `Agent` (the updated agent) |
| `mcp.smitheryConfigured` | query | public | none | `{configured: boolean}` |
| `mcp.setSmitheryKey` | mutation | admin | `{apiKey: string}` | `{ok: true}` |

All 6 paths added to `httpOnlyPaths` in `common.ts`.

---

## ChatComposer "+ MCP" decision

The v32 `ChatComposer.tsx` does NOT yet have an agent selector
(`agent-selector` is on the v32-DRAFT roadmap as part of P81 polish or
P88). The button as specified would need to know the "currently selected
agent" — but there is no such state.

**Decision:** SKIP wiring the composer button this phase. Leave a TODO
comment in `ChatComposer.tsx` pointing at this CONTEXT entry. P88 (when
agent selection is wired into the v32 chat surface) is the natural place to
add the button.

This satisfies the prompt: "If you find it too risky to modify ChatComposer
— leave a TODO and SKIP. Don't break P81."

---

## Legacy `mcp-panel` deprecation

In `routes/ai-chat/index.tsx`:
1. Remove the MCP tab button (line 158-166)
2. Remove the `activeView === 'mcp'` branch (lines 838-857)
3. Remove the `'mcp'` member from the `SidebarView` union (line 68)
4. Remove the `McpPanel` lazy import (line 58)
5. Update the union check on line 235 to drop `'mcp'`

The `mcp-panel.tsx` file itself stays on disk. P90 (cutover) deletes it.

The sidebar's MCP tab button is the only entry point in the active UI; no
other route or dock entry references the legacy panel.

---

## Verification gates

| Gate | Method |
|---|---|
| `pnpm --filter ui build` exits 0 | Run after all UI files written |
| livinityd typecheck zero new errors in created files | `cd livos/packages/livinityd && npx tsc --noEmit 2>&1 \| grep -E "mcp-router\|mcp-smithery"` empty |
| Smithery toggle gating | Read the `mcp.smitheryConfigured` procedure code: returns `false` when `redis.get('liv:config:smithery_api_key')` is null/empty; UI disables the pill in that branch |
| Agent editor MCP section renders | `agent-editor.tsx` has `<MCPConfigurationNew agentId={agent.id} configuredMcps={agent.configuredMcps ?? []} />` mounted in Manual tab below the existing form |
| Legacy mcp-panel sidebar removed | `grep -n "McpPanel\|'mcp'" routes/ai-chat/index.tsx` returns only the deleted-file reference (none in active tab list/render path) |

---

## Files to create

### Backend (livinityd)
1. `livos/packages/livinityd/source/modules/mcp/mcp-smithery-client.ts` — NEW client
2. `livos/packages/livinityd/source/modules/server/trpc/mcp-router.ts` — NEW router

### Frontend (ui)
3. `livos/packages/ui/src/components/mcp/BrowseDialog.tsx`
4. `livos/packages/ui/src/components/mcp/ConfigDialog.tsx`
5. `livos/packages/ui/src/components/mcp/ConfiguredMcpList.tsx`
6. `livos/packages/ui/src/components/mcp/MCPConfigurationNew.tsx`
7. `livos/packages/ui/src/components/mcp/mcp-api.ts` — typed tRPC hooks (mirrors `agents-api.ts` pattern)
8. `livos/packages/ui/src/components/mcp/types.ts` — shared types (`McpSource`, normalized `RegistryServer`, etc.)

## Files to modify

9. `livos/packages/livinityd/source/modules/server/trpc/index.ts` — register `mcp` router
10. `livos/packages/livinityd/source/modules/server/trpc/common.ts` — add 6 paths to `httpOnlyPaths`
11. `livos/packages/ui/src/routes/agents/agent-editor.tsx` — mount `MCPConfigurationNew` section
12. `livos/packages/ui/src/routes/ai-chat/index.tsx` — unwire `mcp-panel` from sidebar
13. `livos/packages/ui/src/routes/ai-chat/v32/ChatComposer.tsx` — TODO comment only (skip wiring per §ChatComposer decision)

---

## Out of scope (deferred)

- A real Settings > Integrations > Smithery panel (P89/P90 territory). The
  `mcp.setSmitheryKey` admin mutation exists so that future panel can wire
  to it without re-touching this lane.
- Composer "+ MCP" button (deferred to P88 when agent selection lands)
- Capability registry / LIVINITY_subagents migration to `configured_mcps`
  (P90 cleanup)
- Editing an installed MCP's credentials post-install (only remove + re-
  install for v32; "edit" is a future enhancement)
- Tool-result caching / circuit breaker (Hermes pattern from P87 lane;
  separate phase)
