# Phase 24: Tool Conditional Registration - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure infrastructure phase. Gate tool registration in daemon.ts behind connection-state checks so disconnected integration tools (WhatsApp, Telegram/Discord/Slack, Gmail) are not loaded into the tool registry.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `daemon.ts` — registers all 40+ tools in a single function
- `tool-registry.ts` — ToolRegistry with register/unregister methods
- Environment variables and Redis config for service connection state

### Integration Points
- `daemon.ts` — tool registration section only
- Tool implementations remain unchanged

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 24-tool-conditional-registration*
*Context gathered: 2026-03-28 via smart discuss (infrastructure skip)*
