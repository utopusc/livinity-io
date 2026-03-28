# Phase 23: Slash Command Menu - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds a `/` slash command dropdown menu above the AI Chat input. When the user types `/`, a menu appears with built-in commands and dynamic commands fetched from the backend. The user can filter by typing, select a command, and it gets sent.

</domain>

<decisions>
## Implementation Decisions

### Dropdown Behavior
- Dropdown appears above the input field when user types `/` as the first character
- Menu shows built-in commands + dynamic commands from backend
- Typing after `/` filters the visible commands in real-time
- Arrow keys navigate, Enter selects, Escape dismisses
- Selecting a command inserts it into input and auto-sends

### Built-in Commands
- `/usage` — show token/cost usage
- `/new` — start new conversation
- `/help` — show help info
- `/agents` — switch to agents tab
- `/loops` — list active loops
- `/skills` — list available skills

### Dynamic Commands
- Fetched from backend via a new `listSlashCommands` tRPC query
- Backend generates list from: existing handleSlashCommand cases in api.ts + tool names + skill trigger patterns
- Auto-updates when new tools/skills are added (query refetch)

### Claude's Discretion
- Visual design of the dropdown (width, max height, styling)
- Whether to show command descriptions or just names
- Animation for dropdown appear/disappear
- Whether to group commands by category

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleSlashCommand` in nexus api.ts — existing slash command handler
- `chat-input.tsx` — the input component where dropdown attaches
- Skill loader — can list available skills
- Tool registry — can list available tools

### Established Patterns
- ChatInput uses controlled textarea with onKeyDown handlers
- tRPC queries for data fetching
- shadcn/ui Popover/Command components available

### Integration Points
- `chat-input.tsx` — needs slash detection + dropdown rendering
- `routes.ts` — needs `listSlashCommands` tRPC query
- `api.ts` — needs REST endpoint for listing available commands

</code_context>

<specifics>
## Specific Ideas

- Commands from the prompt: `/usage`, `/new`, `/help`, `/agents`, `/loops`, `/skills`
- Dynamic commands from tool names and skill triggers
- Filter as you type after `/`

</specifics>

<deferred>
## Deferred Ideas

None — all features within phase scope

</deferred>

---

*Phase: 23-slash-command-menu*
*Context gathered: 2026-03-28 via smart discuss*
