# Phase 85 — UI Slice (CONTEXT)

**Wave:** 2 (parallel with P81, P82, P83, P86)
**Depends on:** Wave 1 P85-schema (commit `9a276a11`) — `agents` table + `agents-repo` + 5 seed UUIDs
**Slice scope:** UI surface + new tRPC `agents` router. Schema is locked.

---

## 1. Goal

Ship the user-facing surface that consumes the Wave 1 `agents-repo` API:

- `/agents` route — grid of all user's agents + 5 system seeds, search + sort + "+ New Agent" CTA
- `/agents/:id` route — two-pane editor (preview + Manual tab + Agent Builder Beta placeholder), 500 ms debounced autosave
- `agents.*` tRPC router — list/get/create/update/delete/publish/unpublish/clone, all Zod-validated, scoped to current user, public agents readable by all

User experience target: when they open `/agents` they see the 5 seed agents (Liv Default, Researcher, Coder, Computer Operator, Data Analyst) immediately, can clone any to their library, can create a new blank one, can edit name/description/system_prompt/model_tier/avatar/color with autosave, can publish to marketplace.

---

## 2. Wave 1 contract (READ-ONLY consumed surface)

From `livos/packages/livinityd/source/modules/database/agents-repo.ts` (verbatim API surface):

```ts
type Agent = {
  id: string
  userId: string | null            // null for system seeds
  name: string
  description: string
  systemPrompt: string
  modelTier: 'haiku' | 'sonnet' | 'opus'
  configuredMcps: ConfiguredMcp[]
  agentpressTools: Record<string, boolean>
  avatar: string | null            // emoji
  avatarColor: string | null       // hex color
  isDefault: boolean
  isPublic: boolean
  marketplacePublishedAt: Date | null
  downloadCount: number
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

listAgents(pool, userId, opts?) -> {rows: Agent[], total: number}
listPublicAgents(pool, opts?)   -> {rows: Agent[], total: number}
getAgent(pool, agentId, userId) -> Agent | null
createAgent(pool, userId, dto)  -> Agent
updateAgent(pool, agentId, userId, partial) -> Agent | null
deleteAgent(pool, agentId, userId) -> boolean
cloneAgentToLibrary(pool, sourceAgentId, targetUserId) -> Agent | null
setMarketplacePublished(pool, agentId, userId, published) -> Agent | null
```

5 seed UUIDs (stable):
- `11111111-1111-4111-8111-111111111111` — 🤖 Liv Default
- `22222222-2222-4222-8222-222222222222` — 🔬 Researcher
- `33333333-3333-4333-8333-333333333333` — 💻 Coder
- `44444444-4444-4444-8444-444444444444` — 🖥️ Computer Operator
- `55555555-5555-4555-8555-555555555555` — 📊 Data Analyst

System seeds have `userId === null` and `isPublic === true`. Visible to every user via the `includePublic: true` flag on `listAgents`.

---

## 3. Files I will create

### Backend
- `livos/packages/livinityd/source/modules/server/trpc/agents-router.ts` — NEW tRPC router file (location chosen because it's a self-contained "namespace" that doesn't fit any existing module; mirrors how `computer-use/routes.ts` is co-located with its module but registered in `server/trpc/index.ts`. Since `agents-repo` lives in `database/`, I keep the router under `server/trpc/` next to the other v32-specific surface).

### Frontend
- `livos/packages/ui/src/routes/agents/index.tsx` — `/agents` grid route
- `livos/packages/ui/src/routes/agents/agent-card.tsx` — single AgentCard component
- `livos/packages/ui/src/routes/agents/agent-editor.tsx` — `/agents/:id` two-pane editor route component
- `livos/packages/ui/src/routes/agents/agent-builder-beta.tsx` — "Coming Soon" placeholder
- `livos/packages/ui/src/routes/agents/agents-api.ts` — typed tRPC hook wrappers
- `livos/packages/ui/src/routes/agents/use-debounced-autosave.ts` — 500 ms trailing-edge debounce hook (no external dep)

## 4. Files I will modify

- `livos/packages/livinityd/source/modules/server/trpc/index.ts` — register `agentsRouter` under `agents` namespace
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — add 8 procedure paths to `httpOnlyPaths` (D-PROCEDURE-HTTP)
- `livos/packages/ui/src/router.tsx` — add `/agents` and `/agents/:id` lazy routes inside `EnsureLoggedIn` parent

---

## 5. Hard constraints (from prompt + memory)

- **D-NO-REPO-CHANGE:** Zero edits to `agents-repo.ts` — consume only.
- **D-NO-OTHER-ROUTERS:** Only my new `agents-router.ts`. Do NOT touch `apps`, `users`, `ai`, etc.
- **D-V32-LANE:** No edits to `routes/ai-chat/v32/` (P81/P82/P83) or `routes/marketplace/` (P86).
- **D-LIV-STYLED:** Use `liv-*` Tailwind tokens (already wired in tailwind.config.ts). No raw hex except `avatar_color` row data.
- **D-DEBOUNCED-AUTOSAVE:** 500 ms trailing-edge — NOT 250, NOT 1000. Status pill: "Saving" amber → "Saved" green → "Error" red.
- **D-CASCADE-CONFIRM:** Delete uses `AlertDialog` confirm. Best-effort warn if agent is currently selected in any chat session — too tricky to detect cross-session reliably; settle for plain confirm copy "This will permanently delete the agent. Any chat sessions using it will fall back to Liv Default."
- **D-PROCEDURE-HTTP:** Every new procedure path added to `httpOnlyPaths` in `common.ts`. tRPC mutations hang on disconnected WS otherwise (memory pitfall B-12 / X-04).
- **D-NO-NEW-DEPS:** All UI components use existing shadcn primitives (Button, Card, Input, Textarea, RadioGroup, AlertDialog, Tabs) and existing motion (FadeIn, StaggerList).

---

## 6. Routing convention

Repo uses `react-router-dom` v6+ with `createBrowserRouter`. Param syntax: `/agents/:id` (not `$id`). Hooks: `useParams`, `useNavigate`. Routes are lazy via `React.lazy(() => import('./routes/agents/...'))`. New routes go inside the existing `EnsureLoggedIn` parent so auth is handled.

I will NOT mount inside `SheetLayout` (where `agent-marketplace` sits) — `/agents` is a primary first-class route, not a sheet drawer. It will be a sibling under the EnsureLoggedIn root, similar to the playground entries. This matches the spirit of v32-DRAFT.md §C ("new `/agents` (list+grid) and `/agents/:id` (two-pane editor)").

---

## 7. tRPC procedure surface

Eight procedures, all `privateProcedure`-based (RBAC: scoped to current user; system/public agents visible to all via `includePublic: true` on the underlying repo call). Full surface:

| Path | Type | Input | Output |
|---|---|---|---|
| `agents.list` | query | `{search?, sort?, order?, limit, offset, includePublic?}` | `{rows: Agent[], total: number}` |
| `agents.get` | query | `{agentId: uuid}` | `Agent` (NOT_FOUND if missing) |
| `agents.create` | mutation | `{name, description?, systemPrompt?, modelTier?, configuredMcps?, agentpressTools?, avatar?, avatarColor?, tags?}` | `Agent` |
| `agents.update` | mutation | `{agentId: uuid, partial: Partial<Agent fields>}` | `Agent` (NOT_FOUND if missing or not owner) |
| `agents.delete` | mutation | `{agentId: uuid}` | `{deleted: boolean}` |
| `agents.publish` | mutation | `{agentId: uuid}` | `Agent` |
| `agents.unpublish` | mutation | `{agentId: uuid}` | `Agent` |
| `agents.clone` | mutation | `{sourceAgentId: uuid}` | `Agent` (the new clone in caller's library) |

All 8 procedures are added to `httpOnlyPaths` because:
- Mutations (create/update/delete/publish/unpublish/clone) — autosave + delete are user-driven; HTTP guarantees delivery through WS half-broken windows.
- Queries (list/get) — list is the page-render dependency; HTTP avoids the WS-handshake-delay flicker; get is identical reasoning. (Precedent: `apiKeys.list` is HTTP-only.)

Defensive guard: every procedure that mutates checks `ctx.currentUser` is set (matches `apiKeys`/`usage-tracking` defensive pattern), throws `UNAUTHORIZED` otherwise. Legacy single-user tokens that map to admin via `getAdminUser()` work transparently because `is-authenticated.ts` already populates `ctx.currentUser` in that case.

---

## 8. Frontend behavior contract

### `/agents` (grid)
- Top bar: "Agents" h1 + count subtitle + "[+] New Agent" button (Button variant `liv-primary`) + search Input + sort dropdown
- Grid: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6` (per CONTEXT prompt)
- Cards wrapped in `StaggerList staggerMs={50}` for entrance animation
- Empty state: "No agents yet" + 2 CTAs ("Create your first agent" → calls `agents.create` then navigate; "Browse the marketplace" → navigates `/agent-marketplace` while it still exists this wave)
- Loading state: 5 placeholder cards animated-pulse

### AgentCard
- `Card` wrapper, `rounded-2xl overflow-hidden` (Suna pattern)
- Top: 200 px (`h-50`) color zone — bg uses inline `style={{backgroundColor: agent.avatarColor ?? <fallback>}}` because avatar_color is per-row data (cannot be a Tailwind token)
- Centered avatar emoji `text-6xl` over color zone
- Top-right corner: backdrop-blur `bg-white/15 text-white` badges:
  - Model badge (model_tier: haiku/sonnet/opus)
  - Default badge (if `isDefault`)
  - Public badge (if `isPublic`)
- Below color zone: white bg `bg-liv-card`, `p-4`, agent name (`font-semibold text-liv-card-foreground`), description `text-sm text-liv-muted-foreground line-clamp-2`
- `group-hover:opacity-100 opacity-0` delete button bottom-right (X icon, `text-liv-destructive`) → opens AlertDialog confirm
- onClick (anywhere except delete): `navigate('/agents/' + agent.id)`

### `/agents/:id` (editor)
- Two-pane: `grid grid-cols-1 lg:grid-cols-[40%_60%]` — left preview, right tabs
- Top bar: `[<- Back]` button + title (current agent name) + Publish toggle button + Delete button + Save status pill
- Left pane: large AgentCard preview (re-uses AgentCard component with bigger sizing, plus shows `system_prompt` excerpt in a card below the visual preview)
- Right pane: `Tabs` shadcn component
  - Tab 1 "Manual": form (Input name, Textarea description, Textarea system_prompt large, RadioGroup model_tier, Input avatar emoji, Input type=color avatarColor)
  - Tab 2 "Agent Builder Beta": `<AgentBuilderBeta />` placeholder
- Autosave: each form field's onChange updates local state; a `useDebouncedAutosave(localState, 500ms)` hook calls `agents.update` after 500 ms idle. State pill: "Saving…" (amber) → "Saved ✓" (green, 2s) → idle (transparent). Error → "Save failed" (red).

### Agent Builder Beta placeholder
- Card with "Coming Soon" headline, ASCII-style decorative wireframe (chat bubbles, no real interactivity)
- Subtitle: "Use Manual tab for now"

---

## 9. Verification gates (per prompt)

1. `pnpm --filter ui build` exits 0
2. `cd livos/packages/livinityd && npx tsc --noEmit` zero NEW errors in my created files (pre-existing errors in routes/skills are out of scope per Wave 1 SUMMARY)
3. Visual smoke (manual on local dev): open `/agents` → see 5 seed agents → click "+ New" → editor opens with blank → type name → "Saved" pill appears within ~700ms → back → see new card → delete → confirm → gone

I will NOT deploy to Mini PC (per Wave 2 protocol — orchestrator handles end-of-Wave deploy). I will NOT touch `agents-repo.ts` test suite (it is locked).

---

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Date round-trip — pg returns Date, JSON-over-tRPC sends ISO string. UI must accept both. | UI types use `string \| Date` for date fields, identical pattern to AgentCard in agent-marketplace (76-04) |
| Autosave triggers before user finishes typing → flickering pill | 500 ms trailing-edge debounce, only fires when state actually changes from last-saved snapshot |
| Delete of system seed (user_id=NULL) returns false silently | UI hides delete button when `agent.userId === null` (system seeds are immutable). Per agents-repo: deleteAgent only matches `user_id = $userId`. |
| Concurrent autosave races (user types fast, prior request not yet returned) | Use react-query's `useMutation` — multiple in-flight is fine; last-write-wins matches user intent |
| Public-but-not-owned agent (cloned source) — user tries to edit it | UI hides edit form for public+not-owned agents, shows read-only preview + "Clone to edit" CTA. agents.update returns null in that case anyway (defense-in-depth). |
| Dock entry — adding "Agents" risks breaking dock layout | Skip dock changes per prompt note; rely on direct URL `/agents` for now. v32 cutover phase (P90) will rewire dock holistically. |

---

## 11. Out of scope (explicit non-goals)

- agentpress_tools toggle UI — schema column exists, defaults `{}`, but the per-tool toggle map (8 LivOS tools) is P85-future-slice or P84 MCP work. Card/editor renders a "Tools: 0" badge for now.
- configured_mcps editor — likewise punted to P84 MCP single-source-of-truth. Card renders "MCPs: 0" badge.
- Avatar emoji picker — v32 spec accepts a plain text input for now. Real emoji picker is later.
- "Reset to default" affordance on system seeds — surfaced in P85-future-slice if needed.
- "Live preview chat" pane (chat with the agent in left pane) — v32-DRAFT mentions it but P85-UI ships preview-only (the AgentCard big version). The "actually chat with this agent" wiring depends on P81/P82/P88 chat surface, so it's P88+ work.
- Dock entry — see Risks. Routes only.

---

## 12. Commit plan

ONE commit at end of slice:

```
feat(85-ui): v32 agent management UI + tRPC router (consumes Wave 1 agents-repo)

Backend:
- trpc/agents-router.ts: list/get/create/update/delete/publish/unpublish/clone procedures (Zod-validated, scoped to current user, public agents readable by all)
- common.ts: agents.* procedure paths added to httpOnlyPaths
- root router: agents-router registered

Frontend:
- routes/agents/index.tsx: 4-col responsive grid + search + sort + "+ New" CTA
- AgentCard: rounded-2xl + h-50 color zone (avatar_color) + avatar emoji + backdrop-blur badges (model/default/public) + group-hover delete
- routes/agents/[id]: two-pane editor (preview + Manual tab + Agent Builder Beta placeholder), 500ms debounced autosave
- agents-api.ts: tRPC hooks wrapper
- router.tsx: /agents + /agents/:id lazy routes

Phase: 85-agent-management (UI slice)
Wave: 2 (paralel with P81, P82, P83, P86)
Depends on: Wave 1 P85-schema (commit 9a276a11)
```

NOT pushed — orchestrator batches Wave 2.
