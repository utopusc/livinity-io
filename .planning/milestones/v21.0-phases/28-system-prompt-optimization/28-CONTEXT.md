# Phase 28: System Prompt Optimization - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure infrastructure phase. Optimize the agent system prompt in agent.ts for conciseness and context window efficiency. Shorten tool descriptions to essentials. Add self-awareness instructions (capabilities, limits, when to escalate).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/optimization phase. Key goals:
- Reduce system prompt token count while preserving all behavioral instructions
- Shorten verbose tool descriptions in daemon.ts
- Add self-awareness section (what AI can do, what it can't, when to ask user)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `NATIVE_SYSTEM_PROMPT` in agent.ts (~400+ lines after Phases 25-27 additions)
- Tool descriptions in daemon.ts `registerTools()`
- Existing prompt structure with section headers

### Integration Points
- `agent.ts` — system prompt optimization
- `daemon.ts` — tool description shortening

</code_context>

<specifics>
## Specific Ideas

No specific requirements — optimization phase

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 28-system-prompt-optimization*
*Context gathered: 2026-03-28 via smart discuss (infrastructure skip)*
