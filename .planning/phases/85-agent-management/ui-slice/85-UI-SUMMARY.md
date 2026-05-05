# Phase 85 — UI Slice — SUMMARY

**Wave:** 2 (parallel with P81, P82, P83, P86)
**Slice:** UI surface + new tRPC `agents` router
**Depends on:** Wave 1 P85-schema (commit `9a276a11`) — `agents` table + `agents-repo` + 5 seed UUIDs
**Status:** Complete. UI build green; backend typecheck zero new errors in created files.

---

## Files Created

### Backend
- `livos/packages/livinityd/source/modules/server/trpc/agents-router.ts`
  — 8 tRPC procedures (list/get/create/update/delete/publish/unpublish/clone), all Zod-validated, all `privateProcedure`-based, all scoped to `ctx.currentUser` via the agents-repo's user_id filter. Public agents (`is_public=TRUE`) and system seeds (`user_id IS NULL`) are visible via the repo's `includePublic` flag (default true on the UI list call).

### Frontend
- `livos/packages/ui/src/routes/agents/index.tsx`
  — `/agents` grid route. Header (h1 + count + "+ New" + search + sort) + 4-col responsive grid (sm:2 md:3 lg:4 xl:5) + StaggerList entrance + 4 page states (loading skeleton / error retry / empty CTAs / data).
- `livos/packages/ui/src/routes/agents/agent-card.tsx`
  — `AgentCard` component. `rounded-2xl overflow-hidden`, h-50 color zone (inline `style.backgroundColor` from `avatar_color`), centered emoji `text-6xl`, top-right backdrop-blur badges (model_tier + default? + public?), group-hover delete X (hidden for system seeds, AlertDialog-confirmed). Two sizes: `default` (grid) and `large` (editor preview).
- `livos/packages/ui/src/routes/agents/agent-editor.tsx`
  — `/agents/:id` two-pane editor. Top bar (Back · name · save-status pill · Publish/Unpublish · Delete with confirm). 40%/60% split — left pane = AgentCard preview (large) + system prompt excerpt; right pane = `Tabs` ["Manual", "Agent Builder Beta"]. Manual tab fields: name, description (textarea), system prompt (textarea-mono), model_tier (RadioGroup: haiku/sonnet/opus), avatar emoji (Input), avatar color (Input type=color + hex Input). 500ms debounced autosave. Read-only mode for system seeds + non-owned public agents (banner + "Clone to my library" CTA via `agents.clone`).
- `livos/packages/ui/src/routes/agents/agent-builder-beta.tsx`
  — Placeholder right-pane tab content. Decorative chat-bubble wireframe (pure divs, no interactivity) + "Coming Soon — use Manual for now" copy.
- `livos/packages/ui/src/routes/agents/agents-api.ts`
  — Typed tRPC hook wrappers (`useAgents`, `useAgent`, `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent`, `usePublishAgent`, `useUnpublishAgent`, `useCloneAgent`). Type aliases (`Agent`, `AgentList`, `SaveStatus`) derived from `RouterOutput['agents']['get']` so the UI never reaches into the livinityd repo type space directly. Each mutation handles cache invalidation: `setData` for `agents.get` cache, `invalidate` for `agents.list`.
- `livos/packages/ui/src/routes/agents/use-debounced-autosave.ts`
  — Pure useEffect+setTimeout debounce hook. AUTOSAVE_DELAY_MS = 500 constant (D-DEBOUNCED-AUTOSAVE — NOT 250, NOT 1000). Skips first render (initial-mount hydration). Skips no-op saves via JSON-snapshot equality guard. No external debounce library (D-NO-NEW-DEPS).

## Files Modified

- `livos/packages/livinityd/source/modules/server/trpc/index.ts`
  — Imported `agentsRouter` and registered as `agents` namespace alongside existing `apiKeys`, `computerUse`, etc.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts`
  — Added 8 procedure paths to `httpOnlyPaths`: `agents.list`, `agents.get`, `agents.create`, `agents.update`, `agents.delete`, `agents.publish`, `agents.unpublish`, `agents.clone`. (D-PROCEDURE-HTTP). Comment block above the entries explains the WS-reconnect-survival rationale and cites the precedent (`apiKeys.*` Phase 59 Plan 04).
- `livos/packages/ui/src/router.tsx`
  — Added two `React.lazy` imports for `AgentsRoute` + `AgentEditorRoute` and registered `/agents` and `/agents/:id` route entries inside the `EnsureLoggedIn` parent (NOT inside `SheetLayout` — first-class routes per v32-DRAFT §C). Both Lazy + ErrorBoundary-wrapped, mirroring the existing `/marketplace` and playground entries.

---

## Hard Constraints — Verified

| Constraint | Status |
|---|---|
| D-NO-REPO-CHANGE — agents-repo.ts untouched | Confirmed by `git diff agents-repo.ts` returning empty |
| D-NO-OTHER-ROUTERS — only agents-router.ts created | Confirmed |
| D-V32-LANE — no edits to v32 chat dir or marketplace dir | Confirmed |
| D-LIV-STYLED — `liv-*` Tailwind tokens only (avatar_color is per-row data, not a token) | Confirmed |
| D-DEBOUNCED-AUTOSAVE — 500ms trailing-edge | Constant `AUTOSAVE_DELAY_MS = 500` in `use-debounced-autosave.ts` |
| D-CASCADE-CONFIRM — delete uses AlertDialog | AlertDialog wired in BOTH AgentCard (grid) and editor top bar |
| D-PROCEDURE-HTTP — every new procedure path in httpOnlyPaths | All 8 paths added to common.ts; build green |
| D-NO-NEW-DEPS — only existing primitives | All UI imports point to existing shadcn-components / @tabler/icons-react / sonner / react-router-dom |

---

## Verification Gates Run

```
# UI build
cd livos/packages/ui && pnpm build
✓ built in 36.03s — exit 0

# UI typecheck (own files)
cd livos/packages/ui && npx tsc --noEmit 2>&1 | grep -E "agents-router|routes/agents|use-debounced-autosave"
(empty — zero new errors)

# Backend typecheck (own files)
cd livos/packages/livinityd && npx tsc --noEmit 2>&1 | grep "agents-router"
(empty — zero new errors)
```

Pre-existing errors in `ai/routes.ts`, `server/trpc/index.ts:107` (ctx.logger), and `index.ts:121` (ws version mismatch) are unchanged baseline noise (out of scope per Wave 1 SUMMARY discipline). The error counts before vs after my changes are identical for those non-touched files.

Visual smoke test was NOT performed on Mini PC per Wave 2 protocol — orchestrator handles end-of-Wave deploy. Local dev smoke is a follow-up step.

---

## Key Implementation Notes

### Read-only public agents
The editor detects three states via `currentUser.userId === agent.userId`:
- **Owner** — full edit, publish/unpublish, delete buttons, autosave active
- **System seed** (userId === null) — read-only banner "This is a system agent. Clone it to your library to customize." + Clone CTA replaces edit toolbar
- **Other-user public** — read-only banner "This agent belongs to another user. Clone it to your library to customize." + Clone CTA

The agents-repo's `getAgent` permits all three reads (returns the row when user owns it OR system seed OR is_public). The `updateAgent` repo helper enforces `user_id = $userId` so a malicious patch attempt against a non-owned agent returns null, surfaced as `NOT_FOUND` by the router's `update` handler.

### Save status pill state machine
- `idle` — no recent activity (small "Saved" muted pill)
- `saving` — debounced timer fired; mutation in flight (amber pill, spinning loader)
- `saved` — mutation succeeded; pill cycles back to idle after 2 seconds (emerald pill, check icon)
- `error` — mutation failed; pill stays until next successful save (red pill, plus toast.error notification)

### CRLF discovery
`livos/packages/ui/src/router.tsx` uses CRLF line endings (Windows convention for that specific file). The Edit tool's tab-matching had repeated failures until the route registration was inserted via a Node fallback that accounted for `\r\n`. Other files in the slice (newly written) use LF as the Write tool's default.

### Dock entry skipped (per CONTEXT.md note)
The dock currently maps the legacy `LIVINITY_subagents` AppId → `/subagents` to the "Agents" label. Adding a new dock entry for `/agents` would require coordinating with Dock + DockItem + system-app registration, which risks breaking the existing window-only contract. Per the prompt's permission ("if unclear how to add to sidebar/dock without breaking, just add the routes and skip the dock"), this slice ships routes only. P90 cutover will rewire the dock holistically per v32-DRAFT.

### Out of scope (deferred to later slices)
- agentpress_tools toggle UI (8 LivOS native tools toggle map) — schema column exists, defaults `{}`. Card/editor render no Tools badge for now. P85-future-slice.
- configured_mcps editor — punted to P84 MCP single-source-of-truth.
- Avatar emoji picker — plain text input for v32. Real picker is later.
- "Live preview chat" pane (chat with the agent in left pane) — depends on P81/P82/P88 chat surface; preview-only AgentCard ships in this slice.

---

## Procedure surface (final)

| Path | Type | Input | Output |
|---|---|---|---|
| `agents.list` | query | `{search?, sort?, order?, limit?, offset?, includePublic?: default true}` | `{rows: Agent[], total: number}` |
| `agents.get` | query | `{agentId: uuid}` | `Agent` (NOT_FOUND if missing) |
| `agents.create` | mutation | `{name, description?, systemPrompt?, modelTier?, configuredMcps?, agentpressTools?, avatar?, avatarColor?, isDefault?, tags?}` | `Agent` |
| `agents.update` | mutation | `{agentId: uuid, partial: nonEmpty<Partial>}` | `Agent` (NOT_FOUND if missing/not-owner) |
| `agents.delete` | mutation | `{agentId: uuid}` | `{deleted: boolean}` |
| `agents.publish` | mutation | `{agentId: uuid}` | `Agent` |
| `agents.unpublish` | mutation | `{agentId: uuid}` | `Agent` |
| `agents.clone` | mutation | `{sourceAgentId: uuid}` | `Agent` (the new clone in caller's library) |

All 8 paths registered in `httpOnlyPaths` (D-PROCEDURE-HTTP).

---

## Commit

ONE commit (per prompt protocol). NOT pushed — orchestrator batches Wave 2.
