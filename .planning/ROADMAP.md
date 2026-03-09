# Roadmap: LivOS v6.0 — Claude Code to Kimi Code Migration

## Overview

This milestone replaces Claude Code with Kimi Code as the sole AI backbone across the Nexus backend and LivOS frontend. The migration follows a four-phase dependency chain: build the new provider first (lowest risk, gets chat working), wire up configuration UI and API routes second, tackle the complex CLI subprocess agent runner third, and clean up all Claude/Anthropic/Gemini dead code last. This ordering ensures the system is never deployed in a half-migrated state -- Claude stays intact until Kimi is fully verified.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions if needed (marked with INSERTED)

- [ ] **Phase 1: KimiProvider** - Implement Kimi AI provider with OpenAI-compatible API for chat and tool calling
- [ ] **Phase 2: Configuration Layer** - API routes, tRPC proxies, and Settings UI for Kimi auth and model selection
- [ ] **Phase 3: KimiAgentRunner** - CLI subprocess agent runner with MCP tool bridging and streaming events
- [ ] **Phase 4: Onboarding and Cleanup** - Update setup wizard, remove all Claude/Anthropic/Gemini code

## Phase Details

### Phase 1: KimiProvider
**Goal**: Users can chat with Kimi AI through the existing web UI with tool calling working end-to-end
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):
  1. User sends a message in the chat UI and receives a streaming response from Kimi's API
  2. AI can call existing MCP tools (shell, docker, files) through the Kimi provider with correct argument parsing
  3. Model tier dropdown (fast/balanced/powerful) maps to actual Kimi K2.5 model IDs and the selection persists
  4. Token usage (input/output counts) displays correctly in chat after each response
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md -- KimiProvider class with chat, streaming, tool format translation, and argument parsing
- [ ] 01-02-PLAN.md -- Wire KimiProvider into ProviderManager and update config schema defaults

### Phase 2: Configuration Layer
**Goal**: Users can configure Kimi credentials, view auth status, and select models through the Settings UI and API
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, UI-01, UI-02, UI-03, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. User can enter a Kimi API key in Settings and it persists in Redis across server restarts
  2. Settings AI Configuration page shows Kimi auth status (connected/disconnected) and has no Claude or Gemini sections
  3. Express routes `/api/kimi/status`, `/api/kimi/login`, `/api/kimi/logout` respond correctly
  4. tRPC routes for Kimi status/login/logout work through the livinityd proxy
  5. User can select between Kimi model tiers (fast/balanced/powerful) in the Settings UI
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md -- Express and tRPC API routes for Kimi auth (API-01, API-02, AUTH-01, AUTH-02)
- [ ] 02-02-PLAN.md -- Settings UI redesign for Kimi configuration (UI-01, UI-02, UI-03)

### Phase 3: KimiAgentRunner
**Goal**: AI agent tasks execute through Kimi CLI subprocess with full MCP tool access and streaming output
**Depends on**: Phase 2
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Kimi CLI is installed on the production server and `kimi --version` returns successfully
  2. Agent stream endpoint (`/api/agent/stream`) spawns Kimi CLI subprocess and streams events to the UI in real time
  3. MCP tools (shell, docker, files, browser) are passed to Kimi CLI via `--mcp-config` and the agent can invoke them
  4. System prompt is written as temporary YAML + markdown files per session and cleaned up after completion
  5. Token usage from Kimi CLI responses is extracted and tracked correctly
**Plans**: TBD

Plans:
- [ ] 03-01: Server setup (Python 3.12, uv, Kimi CLI installation)
- [ ] 03-02: KimiAgentRunner implementation with JSONL event parsing and MCP bridging

### Phase 4: Onboarding and Cleanup
**Goal**: New users can set up Kimi through the onboarding wizard, and zero Claude/Anthropic/Gemini references remain in the codebase
**Depends on**: Phase 3
**Requirements**: ONBOARD-01, ONBOARD-02, AUTH-04, CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07
**Success Criteria** (what must be TRUE):
  1. Setup wizard AI step accepts Kimi API key or device auth and validates the connection before proceeding
  2. `grep -r "claude\|anthropic\|Claude\|Anthropic" --include="*.ts" --include="*.tsx"` returns zero matches in active source files
  3. `@anthropic-ai/sdk` and `@anthropic-ai/claude-agent-sdk` are absent from package.json and node_modules
  4. No Redis keys with "claude" or "anthropic" prefix exist in production
  5. End-to-end test passes: fresh onboarding -> Kimi setup -> chat message -> tool execution -> streaming response
**Plans**: TBD

Plans:
- [ ] 04-01: Onboarding wizard update and device auth flow
- [ ] 04-02: Full Claude/Anthropic/Gemini cleanup and verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. KimiProvider | 0/2 | Planned | - |
| 2. Configuration Layer | 0/2 | Planned | - |
| 3. KimiAgentRunner | 0/2 | Not started | - |
| 4. Onboarding and Cleanup | 0/2 | Not started | - |
