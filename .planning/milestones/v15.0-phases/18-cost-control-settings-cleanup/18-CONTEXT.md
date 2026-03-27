# Phase 18: Cost Control + Settings Cleanup - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Show real-time cost tracking per conversation based on SDK token usage. Remove the old Nexus AI Settings panel (token limits, tool limits, model tier selection). Minimal settings remain: API key + model preference only.

</domain>

<decisions>
## Implementation Decisions

### Cost Display
- Show estimated cost per conversation in the chat (from SDK result messages)
- Use total_cost_usd from SDK result messages when available
- Fallback: estimate from token counts (input/output) with known pricing
- Display as a subtle badge/label, not intrusive

### Settings Cleanup
- Remove the entire Nexus AI Settings page (nexus-config.tsx)
- Remove or simplify the AI config page (ai-config.tsx) — keep only API key entry
- Remove token limit, tool limit, model tier, retry, heartbeat, session, advanced settings
- maxBudgetUsd already enforced server-side (Phase 11)

### Claude's Discretion
- Exact cost display format and placement
- Whether to show per-message or per-conversation costs
- Settings page layout after cleanup

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- SDK result messages include token usage and total_cost_usd
- useAgentSocket already tracks totalCost in state
- Existing settings routes in livos/packages/ui/src/routes/settings/
- nexus-config.tsx — the page to remove
- ai-config.tsx — the page to simplify

### Integration Points
- chat-messages.tsx — add cost badge to assistant messages or conversation header
- settings router — remove nexus-config route
- ai-config.tsx — simplify to API key only

</code_context>

<specifics>
## Specific Ideas

User directive: "token limiti tool limi ayarladigimiz bunlarida kaldirmak istiyorum" — remove all those settings completely.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
