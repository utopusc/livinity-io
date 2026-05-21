---
phase: "189"
plan: "01"
status: complete
commit: 4b788b33
files_created:
  - livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.tsx
  - livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.test.tsx
files_modified:
  - livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx
  - livos/packages/ui/src/routes/ai-chat/index.tsx
  - livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx
tests_added: 8
tests_total: 49
---

# Phase 189 Plan 01: AgentTerminalPane + ai-chat routing Summary

## One-liner
New AgentTerminalPane wraps CcTerminal with liv-agent-{id} session + ~/liv/items/{name}/ cwd; ai-chat now routes agent clicks to PTY pane instead of AgentDetail form.

## What was done
- Created `features/agent-terminal/AgentTerminalPane.tsx`: forwardRef component wrapping CcTerminal with derived sessionId + cwd + header
- Added additive `cwd?: string` prop to CcTerminal (backward compatible)
- Updated `routes/ai-chat/index.tsx`: agent type → AgentTerminalPane (AgentDetail stays on disk)
- Updated `ai-chat.test.tsx` Phase 185-02 B3 assertion for new routing behavior
- 8 new assertions pass (A-01..A-06 + B-01..B-02)

## Deviations
None - plan executed exactly as written.
