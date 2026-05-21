---
phase: "189"
plan: "all"
status: CODE-COMPLETE
commit_range: "4b788b33..f1264920"
subsystem: "agent-terminal"
tags: ["cc-pty", "vault-items", "mcp-tools", "ui-routing", "transcript"]
dependency_graph:
  requires: ["Phase 166 cc-pty/manager.ts", "Phase 167 CcTerminal.tsx", "Phase 171 vault-items", "Phase 174 SidebarTree", "Phase 176 liv-tools", "Phase 177 agent-runner", "Phase 188 .agent/config.json seed"]
  provides: ["AgentTerminalPane", "agent_config_set MCP tool", "setup-wizard-prompt", "agent-session-hooks", "StarterChips", "session transcript writer"]
  affects: ["routes/ai-chat/index.tsx", "cc-pty/manager.ts"]
tech_stack:
  added: []
  patterns: ["forwardRef+useImperativeHandle", "TDD red-green", "additive hooks pattern", "atomic filesystem write"]
key_files:
  created:
    - livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.tsx
    - livos/packages/ui/src/features/agent-terminal/AgentTerminalPane.test.tsx
    - livos/packages/ui/src/features/agent-terminal/StarterChips.tsx
    - livos/packages/ui/src/features/agent-terminal/StarterChips.test.tsx
    - livos/packages/livinityd/source/modules/vault-items/setup-wizard-prompt.ts
    - livos/packages/livinityd/source/modules/vault-items/setup-wizard-prompt.test.ts
    - livos/packages/livinityd/source/modules/cc-pty/agent-session-hooks.ts
    - livos/packages/livinityd/source/modules/cc-pty/agent-session-hooks.test.ts
    - livos/packages/livinityd/source/modules/vault-items/tools/agent-setup-tools.ts
    - livos/packages/livinityd/source/modules/vault-items/tools/agent-setup-tools.test.ts
  modified:
    - livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx
    - livos/packages/ui/src/routes/ai-chat/index.tsx
    - livos/packages/ui/src/routes/ai-chat/ai-chat.test.tsx
    - livos/packages/livinityd/source/modules/cc-pty/manager.ts
    - livos/packages/livinityd/source/modules/vault-items/tools/liv-tools.ts
decisions:
  - "agent sessions use deterministic tmux name liv-agent-{id} (id immutable; name mutable)"
  - "wizard injection is additive in agent-session-hooks.ts (not in manager.ts core)"
  - "agent_config_set gated by agentDir param in LivToolsOptions (not globally exposed)"
  - "TRANSCRIPT_MARKER Set provides process-scoped idempotency for session flush"
  - "Phase 189-05 transcript code pre-shipped in 189-02 commit; 189-05 only added test assertions"
metrics:
  completed: "2026-05-20"
  plans: 5
  new_vitest_assertions: 37
  files_created: 10
  files_modified: 5
---

# Phase 189: Agent Click → CC PTY + Chat-Based Setup Wizard Summary

## One-liner
Clicking an agent in the sidebar now mounts CcTerminal in a new AgentTerminalPane (liv-agent-{id} session, ~/liv/items/{name}/ cwd); first-open injects a setup wizard via --append-system-prompt; wizard persists answers via agent_config_set MCP tool; starter chips reduce blank-terminal intimidation; every session writes a transcript to .agent/sessions/<runId>.md.

## Plans Executed

| Plan | Name | Commit | Assertions Added |
|------|------|--------|-----------------|
| 189-01 | AgentTerminalPane + routing | 4b788b33 | 8 (A-01..A-06, B-01..B-02) |
| 189-02 | Setup wizard prompt injection | 793bde8f | 9 (W-01..W-04+MARKER, H-01..H-04) |
| 189-03 | agent_config_set MCP tool | 144cc022 | 7 (T-01..T-06+NAMES) |
| 189-04 | StarterChips empty-state | 22684809 | 6 (S-01..S-04, P-01..P-02) |
| 189-05 | Session transcript writer | 23c14b11 | 6 (R-01..R-06) |

**Total new assertions: 36** (plus 1 updated assertion B3 in ai-chat.test.tsx)

## Key Changes Per Plan

### Plan 189-01: AgentTerminalPane
- NEW `features/agent-terminal/AgentTerminalPane.tsx`: forwardRef wrapping CcTerminal with sessionId=`liv-agent-{id}`, cwd=`~/liv/items/{name}/`, header row with agent name
- `CcTerminal.tsx`: additive `cwd?: string` prop (backward compatible)
- `routes/ai-chat/index.tsx`: agent type → AgentTerminalPane (AgentDetail stays on disk for Phase 191)
- Updated B3 assertion in ai-chat.test.tsx to match new routing behavior

### Plan 189-02: Setup Wizard Prompt Injection
- NEW `vault-items/setup-wizard-prompt.ts`: `getSetupWizardPrompt()` with 7-step interview template
- NEW `cc-pty/agent-session-hooks.ts`: `isAgentSession()`, `resolveAgentSpawnArgs()`, transcript recorder exports
- `manager.ts`: ONE new import + ONE createSession call site (wizard args) + ONE attachSession recorder + ONE killSession flush + `getMcpNames()` private helper

### Plan 189-03: agent_config_set MCP Tool
- NEW `tools/agent-setup-tools.ts`: Zod-validated tool writes setup_done:true + all fields to .agent/config.json; idempotent ## Agent Guidelines in claude.md; path traversal guard; Redis audit log
- `liv-tools.ts`: additive `agentDir?` option — conditionally registers agent_config_set

### Plan 189-04: StarterChips
- NEW `features/agent-terminal/StarterChips.tsx`: 4 chip buttons, STARTER_CHIP_PROMPTS export, hidden prop
- `AgentTerminalPane.tsx`: chipsVisible state + handleChipPick sends stdin + hides chips

### Plan 189-05: Session Transcript Writer
- `agent-session-hooks.ts`: `createAgentSessionRecorder` (1MB cap, ANSI strip, secrets scrub) + `flushAgentSessionTranscript` (YAML frontmatter, atomic write, idempotent)
- 6 new R-01..R-06 assertions added to agent-session-hooks.test.ts

## Deviations from Plan

### Auto-shipped Plan 189-05 implementation in Plan 189-02

**Rule 2 - Missing critical functionality (pre-ship)**
- **Found during:** Plan 189-02
- **Issue:** Plans 189-05 transcript recorder exports (createAgentSessionRecorder + flushAgentSessionTranscript) and manager.ts call sites were all implemented as part of the 189-02 commit since they belong in the same agent-session-hooks.ts module
- **Fix:** Pre-shipped both the recorder implementation AND manager.ts call sites in 189-02; Plan 189-05 only added 6 test assertions (R-01..R-06) as the GREEN phase was already live
- **Impact:** Zero — tests pass, sacred guards pass, same behavior as if shipped separately

### Pre-existing test failure in liv-tools.test.ts T9
- **Found during:** Plan 189-03 verification
- **Issue:** `liv-tools.test.ts` T9 was already failing before Phase 189 due to an em dash (`—`) encoding mismatch in the assertion string
- **Verified:** `git stash` confirmed the failure existed at baseline commit b42e2fa8
- **Action:** No fix required — pre-existing, out of scope per SCOPE BOUNDARY rule

## Test Results

- Phase 189 new tests: **36 passing** across 5 test files
- UI test suite: 981 passing (11 pre-existing failures in docker/* and webapp-stream-window — unchanged)
- livinityd test suite: 1899 passing (68 pre-existing failures — unchanged)
- Sacred SHA check: **25/25 PASS**

## Deferred Items (to Phase 191+)

- `<ToolTimeline>` custom UI overlay → CC PTY shows tools natively
- Slash command menu → Claude already has `/`
- Auto-title → operator names agents explicitly (Phase 188 modal)
- Settings gear `⚙` in PTY pane header → Phase 191 (AgentDetail absorption)
- AgentDetail.tsx deletion → Phase 191
- Direct typing detection to auto-hide chips → Phase 191 (needs CcTerminal onData prop)
- Tool restrictions UI → Phase 191
- Per-session cost tracking dashboard → v38.x

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries beyond those documented in per-plan threat models.

## Known Stubs

None — AgentTerminalPane connects to the existing CcTerminal PTY infra; wizard prompt is injected via --append-system-prompt on actual first-open. No placeholder UI text.

## Self-Check: PASSED
