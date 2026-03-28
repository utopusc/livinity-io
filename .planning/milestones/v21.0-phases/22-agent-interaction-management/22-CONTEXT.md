# Phase 22: Agent Interaction & Management - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds interactive capabilities to the Agents tab built in Phase 21: sending messages to agents, viewing/controlling loop agents, and creating new agents from a compact form. Builds on the AgentsPanel component and backend tRPC routes from Phase 21.

</domain>

<decisions>
## Implementation Decisions

### Agent Messaging
- Add a message input field in the agent detail view
- Use existing `sendMessageToSubagent` tRPC mutation to send messages
- Show the response in the agent's chat history (already rendered from Phase 21)
- Polling or refetching history after send to show new messages

### Loop Controls
- In agent detail view, show loop-specific info: current iteration, last state
- Add stop/start buttons for loop agents (use existing `loop_manage` tool or tRPC route)
- Loop status from LoopRunner (check if tRPC route exists, if not create one)

### Agent Creation
- Compact form in the Agents tab sidebar (not a full page)
- Minimum fields: name, description, model tier, tools (optional)
- Use existing `createSubagent` tRPC mutation
- After creation, refresh the agent list

### Claude's Discretion
- Form layout and styling details
- Whether loop controls are inline or in a dropdown
- Animation for message send/receive
- Validation UX for create form

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sendMessageToSubagent` tRPC mutation
- `createSubagent` tRPC mutation
- `agents-panel.tsx` from Phase 21 (AgentDetail component to extend)
- `LoopRunner` — manages active loops in nexus-core
- `/routes/subagents/index.tsx` — full agent creation form (reference for fields)

### Established Patterns
- tRPC mutations with useMutation + invalidation
- Input fields with Tailwind styling
- Button components from shadcn/ui

### Integration Points
- `agents-panel.tsx` — AgentDetail component needs messaging, loop controls
- `agents-panel.tsx` — AgentList needs "create agent" button + form
- `routes.ts` — may need loop management tRPC routes

</code_context>

<specifics>
## Specific Ideas

- Keep the create form compact — sidebar space is limited
- Loop controls should be prominent for loop agents (they're the primary interaction)
- Message send should feel like a mini chat within the agent detail

</specifics>

<deferred>
## Deferred Ideas

None — all features are within phase scope

</deferred>

---

*Phase: 22-agent-interaction-management*
*Context gathered: 2026-03-28 via smart discuss*
