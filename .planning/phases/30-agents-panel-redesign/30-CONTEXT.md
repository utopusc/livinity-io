# Phase 30: Agents Panel Redesign - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the current agents-only sidebar panel with a unified capabilities panel that shows Skills, MCPs, Hooks, and Agents in tabbed views, all populated from the Phase 29 unified registry. Existing panels (agents-panel.tsx, skills-panel.tsx, mcp-panel.tsx) are retired from the sidebar in favor of a single capabilities-panel.tsx.

</domain>

<decisions>
## Implementation Decisions

### Layout & Navigation
- 4 tabs: Skills, MCPs, Hooks, Agents — matches visible capability types
- Replace agents-panel.tsx with new unified `capabilities-panel.tsx` — retire old panels from sidebar rendering
- Default active tab: Skills — most commonly used capability type
- Detail view: slide-over within panel — click card → detail view replaces list, back arrow to return (same pattern as current agents-panel)

### Card Design
- Compact list rows — sidebar is narrow (~320px), name + status + type icon per row
- Status indicator: colored dot — green (active), yellow (inactive), red (error), matching existing StatusBadge pattern
- Metadata in list: name, status dot, tier badge, tool count — minimal for scanning, full details on click
- Type differentiation: Tabler icon per type — IconRobot (agent), IconCode (skill), IconPlug (mcp), IconWebhook (hook)

### Data & Integration
- Data source: unified registry tRPC — `listCapabilities` + `searchCapabilities` from Phase 29
- Skills marketplace: keep separate as nested sub-view in skills tab, registry shows installed only
- Refresh: 5s polling on active tab — matches existing `refetchInterval: 5_000` pattern
- Single search input at top — filters all capabilities via `searchCapabilities` tRPC

### Claude's Discretion
- Exact component structure and state management patterns
- Animation/transitions between tabs and detail views
- Empty state designs per tab
- Error handling UI patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents-panel.tsx` (547 lines): AgentsView state pattern, StatusBadge component, AgentList, AgentDetail, CreateAgentForm, LoopControls, MessageInput
- `skills-panel.tsx` (771 lines): SkillsView with marketplace/installed/registries sub-views, PermissionDialog, skill install/uninstall flows
- `mcp-panel.tsx` (1404 lines): McpPanelView, featured servers, search, config editor, install/uninstall
- `trpcReact.ai.listSubagents` with refetchInterval: 5_000 pattern
- New tRPC routes: `ai.listCapabilities`, `ai.searchCapabilities`, `ai.getCapability` (from Phase 29)
- Tabler Icons used throughout: @tabler/icons-react
- `cn()` utility from shadcn for className merging

### Established Patterns
- View state as discriminated union: `type View = {mode: 'list'} | {mode: 'detail'; id: string}`
- Back arrow navigation between list and detail views
- 5-second polling for real-time data
- Compact sidebar layout with rounded cards and hover states
- Text colors: text-text-primary, text-text-secondary, text-text-tertiary
- Background: bg-background-primary, bg-background-secondary

### Integration Points
- Sidebar tab rendering in ai-chat/index.tsx — currently renders agents-panel, needs to render capabilities-panel instead
- tRPC hooks from @/trpc/trpc — `trpcReact.ai.*` queries
- Existing install/uninstall flows in skills-panel and mcp-panel should remain accessible from within their respective tabs

</code_context>

<specifics>
## Specific Ideas

- Tab bar at top of panel with pill-style active indicator
- Search bar below tabs, above list — searches across all capabilities
- Each tab filters by capability type from the registry
- Detail view shows full manifest: semantic_tags as pill badges, provides_tools as chip list, requires/conflicts as linked items
- Skills tab has a "Marketplace" button to open the existing marketplace sub-view
- Hooks tab shows empty state with message about Phase 34

</specifics>

<deferred>
## Deferred Ideas

- Auto-install dialog (UIP-03) — deferred to Phase 35
- System prompt editor (UIP-04) — deferred to Phase 35
- Analytics view (UIP-05) — deferred to Phase 35
- Drag-drop agent builder — out of scope

</deferred>
