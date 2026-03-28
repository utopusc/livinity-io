# Phase 21: Sidebar Agents Tab - Research

**Researched:** 2026-03-28
**Domain:** React sidebar UI + tRPC data fetching for subagent management
**Confidence:** HIGH

## Summary

Phase 21 adds an "Agents" tab to the AI Chat sidebar, replacing the position currently occupied by "LivHub" (skills). The existing AI Chat sidebar at `livos/packages/ui/src/routes/ai-chat/index.tsx` has a three-tab system (Chat | MCP | LivHub) using a `SidebarView` union type. The "LivHub" tab is mapped to the `'skills'` view and renders `SkillsPanel`. This phase adds a fourth tab (`'agents'`) while keeping LivHub as-is (it is NOT replaced, only its visual position changes -- agents takes the prominent third slot).

The backend already has a `SubagentManager` in `nexus/packages/core/src/subagent-manager.ts` with Redis-backed persistence, and tRPC routes in `livos/packages/livinityd/source/modules/ai/routes.ts` for listing, creating, updating, deleting, and executing subagents. However, two critical gaps exist: (1) there is no tRPC route to fetch a single subagent's full config for the detail view, and (2) there is no API endpoint for subagent message history (`SubagentManager.getHistory()` exists but is not exposed via REST or tRPC). Both need new endpoints.

**Primary recommendation:** Add a `getSubagent` tRPC query and `getSubagentHistory` tRPC query (with matching Nexus REST endpoints), then build an `AgentsPanel` component with list/detail views following the exact same patterns as the existing `SkillsPanel` and subagents page.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rename "LivHub" tab label to "Agents" in the AI Chat sidebar
- Keep the same tab position and icon (or use a robot/agent icon)
- Fetch agents from `listSubagents` tRPC query (already exists)
- Show each agent's status (active/paused/stopped), last run time, and run count
- Use colored status badges matching existing design patterns
- Click an agent to see detail panel within the sidebar
- Show chat history via `SubagentManager.getMessages()` (tRPC route exists) -- NOTE: tRPC route does NOT exist, must be created
- Show last result and configuration
- Back button to return to agent list

### Claude's Discretion
- Exact visual layout of agent cards
- Animation transitions between list and detail views
- How to display agent configuration (expandable section vs separate tab)
- Empty state when no agents exist

### Deferred Ideas (OUT OF SCOPE)
- Sending messages to agents (Phase 22)
- Loop controls (stop/start) (Phase 22)
- New agent creation from sidebar (Phase 22)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGNT-01 | User sees "Agents" tab (renamed from "LivHub") in AI Chat sidebar | Tab system in `index.tsx` lines 78-106 uses `SidebarView` type; add `'agents'` variant, rename LivHub button text to "Agents" |
| AGNT-02 | User can see a list of active agents with status, last run time, and run count | `listSubagents` tRPC query exists, proxies to Nexus `GET /api/subagents`, returns `{id, name, status, schedule?, lastRunAt?, runCount}` -- all fields needed are present |
| AGNT-03 | User can click an agent to view its chat history, last result, and configuration | Requires NEW `getSubagent` tRPC query (for full config with `lastResult`, `description`, `systemPrompt`, `tier`, etc.) and NEW `getSubagentHistory` tRPC query (for `SubagentMessage[]`). Both need Nexus REST endpoints. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18 | UI rendering | Already in project |
| @trpc/react-query | (project version) | Data fetching | Already used for all tRPC queries in the sidebar |
| @tabler/icons-react | (project version) | Icons (IconRobot, IconArrowLeft, etc.) | Already used throughout, including subagents page |
| date-fns | (project version) | `formatDistanceToNow` for time display | Already imported in ai-chat/index.tsx |
| tailwindcss | 3.4 | Styling | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | (project version) | tRPC input validation | For new tRPC route input schemas |
| shadcn/ui components | (project) | Badges, buttons, cards | For status badges and layout |
| framer-motion | (project) | Animation transitions | Optional: list-to-detail transition (Claude's discretion) |

No new packages need to be installed. Everything is already in the project.

## Architecture Patterns

### Recommended Project Structure
```
livos/packages/ui/src/routes/ai-chat/
  index.tsx              # MODIFY: Add 'agents' to SidebarView, add tab button, render AgentsPanel
  agents-panel.tsx       # NEW: Agent list + detail views

livos/packages/livinityd/source/modules/ai/
  routes.ts              # MODIFY: Add getSubagent and getSubagentHistory tRPC queries

nexus/packages/core/src/
  api.ts                 # MODIFY: Add GET /api/subagents/:id/history endpoint
```

### Pattern 1: Sidebar Tab Addition
**What:** Extending the existing sidebar tab system to include an Agents view
**When to use:** Adding a new content area to the AI Chat sidebar
**Example:**
```typescript
// In index.tsx -- current SidebarView type
type SidebarView = 'chat' | 'mcp' | 'skills'

// Change to:
type SidebarView = 'chat' | 'mcp' | 'skills' | 'agents'
```

The tab bar at lines 78-106 currently has three buttons. The "LivHub" button text changes to "Agents" and its `onClick` changes from `'skills'` to `'agents'`. The LivHub/Skills panel remains accessible -- see "Tab Renaming Strategy" below.

### Pattern 2: List-Detail View Within Sidebar
**What:** A panel component that toggles between a list view and a detail view using local state
**When to use:** When the sidebar needs master-detail navigation
**Example:**
```typescript
// agents-panel.tsx pattern (modeled after SkillsPanel)
type AgentsView = { mode: 'list' } | { mode: 'detail'; agentId: string }

export default function AgentsPanel() {
  const [view, setView] = useState<AgentsView>({ mode: 'list' })

  if (view.mode === 'detail') {
    return <AgentDetail agentId={view.agentId} onBack={() => setView({ mode: 'list' })} />
  }
  return <AgentList onSelect={(id) => setView({ mode: 'detail', agentId: id })} />
}
```

### Pattern 3: tRPC Query with Polling (Existing Pattern)
**What:** Using `refetchInterval` for near-real-time data
**When to use:** Agent list needs periodic refresh to show status changes
**Example:**
```typescript
// From existing subagents page (refetches every 5s)
const subagentsQuery = trpcReact.ai.listSubagents.useQuery(undefined, {
  refetchInterval: 5_000,
})
```

### Pattern 4: tRPC Proxy to Nexus API (Existing Pattern)
**What:** tRPC routes in livinityd that proxy to Nexus REST API
**When to use:** All subagent data lives in Nexus; livinityd tRPC routes are thin proxies
**Example:**
```typescript
// Existing pattern from routes.ts
getSubagent: privateProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const nexusUrl = getNexusApiUrl()
    const response = await fetch(`${nexusUrl}/api/subagents/${input.id}`, {
      headers: process.env.LIV_API_KEY ? { 'X-API-Key': process.env.LIV_API_KEY } : {},
    })
    if (!response.ok) throw new TRPCError({ code: 'NOT_FOUND' })
    return await response.json()
  }),
```

### Tab Renaming Strategy
**What:** The CONTEXT.md says "rename LivHub to Agents" but the LivHub tab currently shows the SkillsPanel (skill marketplace). The cleanest approach is:
1. Rename the third tab label from "LivHub" to "Agents"
2. Change its `onClick` to set view to `'agents'`
3. Change its icon from `IconPuzzle` to `IconRobot`
4. The SkillsPanel (LivHub content) becomes accessible from within the AgentsPanel or is moved to a less prominent position. Given Phase 22 will add more agent interaction, the simplest approach is to keep the skills panel accessible as a sub-view or keep it as a separate route at `/subagents`.

**Clarification needed:** The current `'skills'` tab renders `SkillsPanel`. If we rename it to `'agents'` and render `AgentsPanel` instead, the skills/LivHub content becomes unreachable from the sidebar. Since the CONTEXT.md explicitly says "rename LivHub to Agents" and the subagents route at `/routes/subagents/` already exists for full management, the intent is clear: **replace the LivHub tab entirely with Agents content**.

### Anti-Patterns to Avoid
- **Creating a new route page:** The agents tab lives IN the sidebar, not as a new route
- **Fetching all agent data upfront:** Use `listSubagents` for the list (summary data) and lazy-fetch full config + history only when user clicks into detail view
- **Mutating agent state:** Phase 21 is READ-ONLY. No start/stop/send controls (deferred to Phase 22)
- **WebSocket transport for new queries:** New tRPC query routes should work over existing transport; no need to add to `httpOnlyPaths` since they are read-only queries (queries default to WS when connected, which is fine)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time formatting | Custom relative time | `formatDistanceToNow` from date-fns | Already imported in index.tsx, handles edge cases |
| Status badges | Custom color logic | Reuse pattern from existing subagents page | Lines 229-233 of subagents/index.tsx already have active/paused badge colors |
| Data fetching | Manual fetch + state | tRPC `useQuery` with `refetchInterval` | Established pattern, handles loading/error states |
| Loading states | Custom spinners | `IconLoader2` with `animate-spin` | Used everywhere in the project |
| Panel scrolling | Custom scroll logic | `overflow-y-auto` with flex layout | Pattern from SkillsPanel |

**Key insight:** Every UI pattern needed already exists in either the AI Chat sidebar, the SkillsPanel, or the existing subagents page. This is strictly composition of existing patterns.

## Common Pitfalls

### Pitfall 1: Missing Nexus API Endpoint for History
**What goes wrong:** The `SubagentManager.getHistory()` method exists in nexus-core but has NO REST endpoint. Creating only the tRPC route without the Nexus REST endpoint will cause 404 errors.
**Why it happens:** The tRPC routes in livinityd are thin proxies to Nexus API -- they don't directly access SubagentManager.
**How to avoid:** Create `GET /api/subagents/:id/history` in `nexus/packages/core/src/api.ts` FIRST, then create the tRPC query in livinityd routes.
**Warning signs:** Agent detail view shows empty history when agents definitely have run history.

### Pitfall 2: listSubagents Returns Summary, Not Full Config
**What goes wrong:** Using `listSubagents` data for the detail view and finding fields like `description`, `lastResult`, `systemPrompt` are missing.
**Why it happens:** `SubagentManager.list()` intentionally returns only `{id, name, status, schedule?, lastRunAt?, runCount}` for performance. Full config requires `SubagentManager.get(id)`.
**How to avoid:** Use `listSubagents` for the list view, and a separate `getSubagent` query for the detail view.
**Warning signs:** Undefined fields in the detail panel.

### Pitfall 3: Compiled JS Stale After Backend Changes
**What goes wrong:** Adding Nexus REST endpoints but forgetting to rebuild, so the running server doesn't have the new routes.
**Why it happens:** nexus-core runs compiled JS (`dist/index.js`), not source TypeScript.
**How to avoid:** After modifying `nexus/packages/core/src/api.ts`, run `npm run build --workspace=packages/core`.
**Warning signs:** 404 responses from Nexus API after adding new endpoints.

### Pitfall 4: SidebarView Type Not Updated in All Locations
**What goes wrong:** Adding `'agents'` to the type but missing the rendering branch in the main component.
**Why it happens:** The view is checked in multiple places: the tab button condition, the content rendering area (lines 433-692), and the sidebar placeholder (lines 141-144).
**How to avoid:** Search for all uses of `activeView` and `SidebarView` in index.tsx and update each location.
**Warning signs:** Clicking "Agents" tab shows blank content or skills content.

### Pitfall 5: Tab Overflow on Mobile
**What goes wrong:** Adding a 4th tab to the sidebar tab bar causes cramping on mobile screens.
**Why it happens:** Current 3-tab layout uses `flex-1` for equal width. 4 tabs may be too tight.
**How to avoid:** Consider whether to keep 4 tabs or use a different icon-only layout. NOTE: On mobile, the sidebar is rendered in a Drawer that is full-width, so 4 tabs should work. But test with actual text widths.
**Warning signs:** Tab labels getting truncated or wrapping.

## Code Examples

### Existing Tab System (lines 78-106 of index.tsx)
```typescript
// Current 3-tab system in ConversationSidebar
<div className='flex border-b border-border-default'>
  <button onClick={() => onViewChange('chat')} className={cn('flex flex-1 items-center...',
    activeView === 'chat' ? 'border-b-2 border-brand text-text-primary' : 'text-text-tertiary...'
  )}>
    <IconMessageCircle size={14} /> Chat
  </button>
  <button onClick={() => onViewChange('mcp')} className={cn(...)}>
    <IconPlug size={14} /> MCP
  </button>
  <button onClick={() => onViewChange('skills')} className={cn(...)}>
    <IconPuzzle size={14} /> LivHub
  </button>
</div>
```

### Existing Status Badge Pattern (subagents/index.tsx lines 229-233)
```typescript
<span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
  agent.status === 'active'
    ? 'bg-green-500/20 text-green-400'
    : 'bg-yellow-500/20 text-yellow-400'
}`}>
  {agent.status || 'active'}
</span>
```

### SubagentConfig Data Shape (from subagent-manager.ts)
```typescript
interface SubagentConfig {
  id: string
  name: string
  description: string
  tools: string[]
  systemPrompt?: string
  schedule?: string
  timezone?: string
  scheduledTask?: string
  loop?: { intervalMs: number; maxIterations?: number; task: string }
  tier: 'flash' | 'sonnet' | 'opus'
  maxTurns: number
  status: 'active' | 'paused' | 'stopped'
  createdBy: string
  createdVia?: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'matrix' | 'web' | 'mcp'
  createdChatId?: string
  createdAt: number
  lastRunAt?: number
  lastResult?: string
  runCount: number
}
```

### SubagentMessage Data Shape (from subagent-manager.ts)
```typescript
interface SubagentMessage {
  role: 'user' | 'assistant'
  text: string
  ts: number
}
```

### SubagentManager.list() Return Shape
```typescript
// Returns summary only -- suitable for list view
Array<{ id: string; name: string; status: string; schedule?: string; lastRunAt?: number; runCount: number }>
```

### SubagentManager.get() Return Shape
```typescript
// Returns full SubagentConfig -- needed for detail view
SubagentConfig // includes lastResult, description, systemPrompt, tier, etc.
```

### SubagentManager.getHistory() Return Shape
```typescript
// Returns message history -- needed for detail chat history
SubagentMessage[] // {role, text, ts}[]
// Stored in Redis list, keeps last 100, 7-day TTL, returns oldest-first
```

### Existing Lazy Panel Loading Pattern
```typescript
// From index.tsx -- how other panels are loaded
const McpPanel = lazy(() => import('./mcp-panel'))
const SkillsPanel = lazy(() => import('./skills-panel'))

// In render:
{activeView === 'skills' && (
  <div className='flex-1 overflow-hidden'>
    <Suspense fallback={<div className='flex h-full items-center justify-center'>
      <IconLoader2 size={24} className='animate-spin text-text-tertiary' />
    </div>}>
      <SkillsPanel />
    </Suspense>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Subagents managed only from `/routes/subagents/` page | Adding sidebar quick-view for agents (Phase 21) | v21.0 | Users can view agents without leaving AI Chat |
| Skills/LivHub as third sidebar tab | Agents replaces LivHub in third tab position | v21.0 | Skills remain accessible via standalone route or future UI |

## Open Questions

1. **What happens to the SkillsPanel/LivHub content?**
   - What we know: The CONTEXT says "rename LivHub to Agents". The SkillsPanel currently occupies the third tab.
   - What's unclear: Whether LivHub should still be accessible from somewhere in the sidebar (e.g., as a 4th tab) or only via a separate route.
   - Recommendation: Replace the third tab entirely. Change label to "Agents", change icon to `IconRobot`, change view to `'agents'`. LivHub/Skills content remains accessible at the standalone `/routes/subagents/` page or a future sidebar rework. This is the simplest approach and matches the CONTEXT.md directive. If the user wants 4 tabs (Chat | MCP | Agents | LivHub), that's a minor variation.

2. **Should `listSubagents` return more fields for the list view?**
   - What we know: Currently returns `{id, name, status, schedule?, lastRunAt?, runCount}`. Missing `description` which would be nice for list cards.
   - What's unclear: Whether adding `description` to the list endpoint is worth the minor Redis overhead.
   - Recommendation: Add `description` and `tier` to the `SubagentManager.list()` return type. These are small strings already loaded from Redis in the loop. This avoids needing a separate fetch just to show a subtitle on each card.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test framework detected for UI) |
| Config file | none |
| Quick run command | `pnpm --filter ui dev` + manual browser check |
| Full suite command | `pnpm --filter @livos/config build && pnpm --filter ui build` (build verification) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-01 | Agents tab visible in sidebar | manual | Open AI Chat, verify third tab reads "Agents" with robot icon | N/A |
| AGNT-02 | Agent list with status, last run, run count | manual | Create test agent via `/routes/subagents/`, verify it appears in sidebar Agents tab | N/A |
| AGNT-03 | Click agent shows history, last result, config | manual | Click agent in sidebar list, verify detail panel shows data | N/A |

### Sampling Rate
- **Per task commit:** Build UI (`pnpm --filter ui build`) to verify no type/compilation errors
- **Per wave merge:** Full build + manual browser verification
- **Phase gate:** Manual verification of all 3 requirements in browser

### Wave 0 Gaps
None -- no automated test infrastructure exists for UI components in this project, and adding one is out of scope for Phase 21.

## Exact Files to Modify

### Frontend (livos/packages/ui/src/)

1. **`routes/ai-chat/index.tsx`** -- Modifications:
   - Add `'agents'` to `SidebarView` type (line 34)
   - Add lazy import for `AgentsPanel` (near line 31)
   - Change "LivHub" tab: rename label to "Agents", change icon to `IconRobot`, change onClick to `'agents'` (lines 96-105)
   - Add rendering branch for `activeView === 'agents'` (after line 692)
   - Add `IconRobot` to imports (line 1)

2. **`routes/ai-chat/agents-panel.tsx`** -- New file:
   - `AgentsPanel` component with list/detail navigation
   - `AgentList` sub-component: uses `trpcReact.ai.listSubagents.useQuery` with 5s polling
   - `AgentDetail` sub-component: uses `trpcReact.ai.getSubagent.useQuery` + `trpcReact.ai.getSubagentHistory.useQuery`
   - Empty state with `IconRobot` icon
   - Status badges: green for active, yellow for paused, red for stopped
   - Back button using `IconArrowLeft`

### Backend - livinityd (livos/packages/livinityd/source/modules/ai/)

3. **`routes.ts`** -- Add two new tRPC queries:
   - `getSubagent` query: input `{id: string}`, proxies to `GET /api/subagents/:id`, returns full `SubagentConfig`
   - `getSubagentHistory` query: input `{id: string, limit?: number}`, proxies to `GET /api/subagents/:id/history`, returns `SubagentMessage[]`

### Backend - Nexus (nexus/packages/core/src/)

4. **`api.ts`** -- Add one new REST endpoint:
   - `GET /api/subagents/:id/history` -- calls `subagentManager.getHistory(id, limit)`, returns JSON array of `SubagentMessage`
   - Note: `GET /api/subagents/:id` already exists and returns full config

5. **`subagent-manager.ts`** -- Optional enhancement:
   - Add `description` and `tier` to the `list()` return type for richer list view cards

## Sources

### Primary (HIGH confidence)
- `livos/packages/ui/src/routes/ai-chat/index.tsx` -- Read in full, contains tab system (lines 34, 78-106, 141-144, 433-692)
- `livos/packages/ui/src/routes/ai-chat/skills-panel.tsx` -- Read in full, reference for panel structure
- `livos/packages/ui/src/routes/subagents/index.tsx` -- Read in full, reference for agent UI patterns
- `nexus/packages/core/src/subagent-manager.ts` -- Read in full, SubagentConfig/SubagentMessage interfaces, all methods
- `nexus/packages/core/src/api.ts` -- Read subagent endpoints (lines 1005-1041), confirmed no history endpoint exists
- `livos/packages/livinityd/source/modules/ai/routes.ts` -- Read subagent routes (lines 715-885), confirmed no getSubagent/getSubagentHistory queries exist

### Secondary (MEDIUM confidence)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` -- httpOnlyPaths list (read-only queries don't need to be added)
- `livos/packages/ui/src/trpc/trpc.ts` -- tRPC client setup, split link configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already in the project, no new dependencies
- Architecture: HIGH -- All patterns directly observable in existing codebase, exact file paths and line numbers documented
- Pitfalls: HIGH -- Verified by reading source: no history endpoint exists, list() returns summary-only, nexus requires rebuild
- Backend gaps: HIGH -- Confirmed by grep that getSubagentHistory and getSubagent tRPC routes do not exist

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- codebase patterns unlikely to change in 30 days)
