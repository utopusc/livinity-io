# Phase 21: Sidebar Agents Tab - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase renames the "LivHub" tab in the AI Chat sidebar to "Agents" and populates it with a live agent list showing status, last run time, and run count. Clicking an agent shows its chat history, last result, and configuration. Backend infrastructure (SubagentManager, tRPC routes) already exists.

</domain>

<decisions>
## Implementation Decisions

### Tab Rename
- Rename "LivHub" tab label to "Agents" in the AI Chat sidebar
- Keep the same tab position and icon (or use a robot/agent icon)

### Agent List
- Fetch agents from `listSubagents` tRPC query (already exists)
- Show each agent's status (active/paused/stopped), last run time, and run count
- Use colored status badges matching existing design patterns

### Agent Detail View
- Click an agent to see detail panel within the sidebar
- Show chat history via `SubagentManager.getMessages()` (tRPC route exists)
- Show last result and configuration
- Back button to return to agent list

### Claude's Discretion
- Exact visual layout of agent cards
- Animation transitions between list and detail views
- How to display agent configuration (expandable section vs separate tab)
- Empty state when no agents exist

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `listSubagents` tRPC query — returns all subagents
- `getSubagentHistory` / `getSubagentMessages` tRPC queries — agent message history
- `SubagentManager` — Redis-backed agent persistence (config, history, run count)
- Existing AI Chat sidebar with tab system (Chat | MCP | LivHub)

### Established Patterns
- Sidebar tabs use simple state toggle in AI Chat index.tsx
- tRPC queries with useQuery for data fetching
- shadcn/ui components for cards, badges, buttons
- Tabler icons throughout

### Integration Points
- `index.tsx` — AI Chat sidebar tab definitions
- `/routes/subagents/index.tsx` — existing full agent management page (reference for UI patterns)
- `livinityd/source/modules/ai/routes.ts` — tRPC subagent routes

</code_context>

<specifics>
## Specific Ideas

- User wants quick access to agents from AI Chat without navigating to separate Agents app
- Agent status should update in real-time or with reasonable polling interval
- This is a read-only listing + detail view (interaction/management in Phase 22)

</specifics>

<deferred>
## Deferred Ideas

- Sending messages to agents (Phase 22)
- Loop controls (stop/start) (Phase 22)
- New agent creation from sidebar (Phase 22)

</deferred>

---

*Phase: 21-sidebar-agents-tab*
*Context gathered: 2026-03-28 via smart discuss*
