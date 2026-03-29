# Phase 35: Marketplace UI & Auto-Install - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds three UI features to the capabilities panel: (1) auto-install dialog when AI recommends capabilities, (2) system prompt editor with template library, (3) analytics view for tool usage. All are new sub-views/components within the existing capabilities-panel.tsx from Phase 30.

</domain>

<decisions>
## Implementation Decisions

### Auto-Install Dialog
- Chat message type: AI sends a special `capability_recommendation` block that triggers a dialog in the chat UI
- Dialog shows: capability name, description, tools provided, and approve/reject buttons
- Approve calls `livinity_install` via tRPC, reject dismisses
- Integration: new message renderer in chat for recommendation blocks

### System Prompt Editor
- New tab in capabilities panel: "Prompts" alongside Skills/MCPs/Hooks/Agents
- Template library: predefined prompt templates stored as JSON in nexus/config/prompt-templates.json
- Custom builder: textarea with capability instruction insertion via tag buttons
- Save: stores custom prompts in Redis `nexus:prompts:{name}`

### Analytics View
- New tab in capabilities panel: "Analytics"
- Shows: tool usage frequency (bar chart), popular combinations (list), success rates (table)
- Data source: Redis stream `nexus:tool_calls` — Phase 36 will populate; show empty state until then
- Placeholder implementation: basic stats from CapabilityRegistry metadata (last_used_at, provides_tools count)

### Claude's Discretion
- Exact dialog styling and positioning
- Chart library choice (if any — could use pure CSS bars)
- Prompt template content
- Analytics time range selector design

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `capabilities-panel.tsx` (Phase 30): Tabbed panel with list/detail views, tRPC integration
- Chat message rendering in `ai-chat/index.tsx`: handles different message types
- `trpcReact.ai.*` hooks for all capability operations
- Tailwind CSS for styling, Tabler Icons for iconography
- `cn()` utility for className merging

### Established Patterns
- Tab-based navigation within capabilities panel
- Compact sidebar layout with list rows
- tRPC queries with refetchInterval for real-time data
- Message rendering with different block types (text, tool calls, status)

### Integration Points
- `capabilities-panel.tsx`: Add Prompts and Analytics tabs
- Chat message rendering: New renderer for capability_recommendation blocks
- tRPC routes: May need new routes for prompt CRUD and analytics data
- Backend: New REST endpoints for prompt templates and tool call stats

</code_context>

<specifics>
## Specific Ideas

- Auto-install dialog as a styled card within chat messages, not a modal
- Prompt templates: "Coding Assistant", "DevOps Engineer", "Content Creator", "Research Analyst"
- Analytics: simple table with columns [Tool Name, Calls, Success %, Last Used] — no charting library needed
- CSS-only bar charts using div widths for frequency visualization

</specifics>

<deferred>
## Deferred Ideas

- Rich analytics with time series charts — future
- Prompt sharing between users — future
- A/B testing UI for different prompts — Phase 36
- Marketplace ratings/reviews UI — future

</deferred>
