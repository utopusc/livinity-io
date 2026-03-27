# Phase 15: Live Tool Call Visualization - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Render tool calls as expandable cards within the chat — showing tool name, inputs, execution status (running spinner, complete checkmark, error indicator), and output. Cards appear in real-time as the agent works.

</domain>

<decisions>
## Implementation Decisions

### Tool Call Card Design
- Collapsible cards inline within assistant messages
- Header: tool icon + tool name + status indicator (spinner/checkmark/error)
- Collapsed: one-line summary (tool name + status)
- Expanded: input parameters + output (truncated with "show more")
- Animated expand/collapse with Framer Motion

### Status Indicators
- Running: animated spinner (consistent with existing UI patterns)
- Complete: green checkmark
- Error: red X with error message

### Tool-Specific Rendering
- Shell commands: show command in monospace, output in scrollable pre block
- File reads: show filename, content with syntax highlighting
- Docker operations: show container name + action + result
- Default: JSON display of inputs/outputs

### Claude's Discretion
- Exact card styling, colors, animations
- Whether to group sequential tool calls
- Output truncation threshold

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentToolCallDisplay` stub already in chat-messages.tsx (Phase 14)
- `useAgentSocket` provides ChatMessage with toolCalls array
- Framer Motion for animations
- Existing collapsible pattern from old ToolCallDisplay component

### Integration Points
- `chat-messages.tsx` — AssistantMessage renders tool calls
- Tool call data comes from SDK messages (tool_use + tool_result content blocks)
- useAgentSocket reducer already processes TOOL_USE and TOOL_RESULT events

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond professional, real-time tool visualization.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
