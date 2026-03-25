# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v16.0 Multi-Provider AI -- restore Claude (Anthropic) as a second AI provider alongside Kimi, with full feature parity (streaming, tool calling, vision), authentication, config schema, and a Settings UI toggle to switch between providers.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [x] **v10.0 App Store Platform** - Phases 16-25 (shipped 2026-03-21)
- [x] **v11.0 Nexus Agent Fixes** - Phases 26-34 (shipped 2026-03-22)
- [x] **v12.0 Server Management Dashboard** - Phases 35-40 (shipped 2026-03-22)
- [x] **v13.0 Portainer-Level Server Management** - Phases 41-46 (shipped 2026-03-23)
- [x] **v14.0 Remote PC Control Agent** - Phases 47-53 (shipped 2026-03-24)
- [x] **v14.1 Agent Installer & Setup UX** - Phases 1-4 (shipped 2026-03-24)
- [x] **v15.0 AI Computer Use** - Phases 5-9 (shipped 2026-03-24)
- [ ] **v16.0 Multi-Provider AI** - Phases 1-4 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)
- v16.0 uses reset phase numbering (starts at 1)

<details>
<summary>v10.0 App Store Platform (Phases 16-25) - SHIPPED 2026-03-21</summary>

### Phase 16: Install Script Docker Fix
**Status**: Complete

### Phase 17: Backend API Extensions
**Status**: Complete

### Phase 18: Store UI
**Status**: Complete

### Phase 19: postMessage Bridge Protocol
**Status**: Complete

### Phase 20: LivOS iframe Embedding
**Status**: Complete

### Phase 21: Install History & Profile
**Status**: Complete

### Phase 22: App Store Integration Fix
**Status**: Complete

### Phase 23: LivOS-Native App Compose System
**Status**: Complete

### Phase 24: App Store Expansion
**Status**: Complete

### Phase 25: Native Chrome Browser
**Status**: Complete

</details>

<details>
<summary>v11.0 Nexus Agent Fixes (Phases 26-34) - SHIPPED 2026-03-22</summary>

**Milestone Goal:** Fix 27 issues across the Nexus AI agent system -- sub-agent scheduling, cron persistence, tool profiles, session cleanup, multi-channel routing, naming consistency, system prompts, and dead code removal.

- [x] **Phase 26: Sub-agent Scheduler Coupling Fix** (completed 2026-03-22)
- [x] **Phase 27: Cron Tool BullMQ Migration** (completed 2026-03-22)
- [x] **Phase 28: Tool Profile Name Mismatch Fix** (completed 2026-03-22)
- [x] **Phase 29: MultiAgentManager Cleanup** (completed 2026-03-22)
- [x] **Phase 30: Multi-Channel Notification Routing** (completed 2026-03-22)
- [x] **Phase 31: Skills->Tools Naming Fix** (completed 2026-03-22)
- [x] **Phase 32: Native System Prompt Improvements** (completed 2026-03-22)
- [x] **Phase 33: progress_report Multi-Channel** (completed 2026-03-22)
- [x] **Phase 34: Miscellaneous Fixes** (completed 2026-03-22)

</details>

<details>
<summary>v12.0 Server Management Dashboard (Phases 35-40) - SHIPPED 2026-03-22</summary>

**Milestone Goal:** Build a comprehensive server management UI in LivOS -- full Docker container lifecycle, images/volumes/networks, PM2 process management, and enhanced system monitoring.

- [x] **Phase 35: Docker Backend + Container List/Actions UI** (completed 2026-03-22)
- [x] **Phase 36: Container Detail View + Logs + Stats** (completed 2026-03-22)
- [x] **Phase 37: Images, Volumes, Networks** (completed 2026-03-22)
- [x] **Phase 38: PM2 Process Management** (completed 2026-03-22)
- [x] **Phase 39: Enhanced System Monitoring + Overview Tab** (completed 2026-03-22)
- [x] **Phase 40: Polish, Edge Cases & Deployment** (completed 2026-03-22)

</details>

<details>
<summary>v13.0 Portainer-Level Server Management (Phases 41-46) - SHIPPED 2026-03-23</summary>

**Milestone Goal:** Match every Portainer feature -- container creation with full config, container edit + recreate, exec terminal, compose stack management, enhanced image/network/volume CRUD, bulk operations, Docker events, and engine info.

- [x] **Phase 41: Container Creation** (completed 2026-03-23)
- [x] **Phase 42: Container Edit & Recreate** (completed 2026-03-23)
- [x] **Phase 43: Exec Terminal + Enhanced Logs** (completed 2026-03-23)
- [x] **Phase 44: Bulk Ops + Enhanced Images + Networks + Volumes** (completed 2026-03-23)
- [x] **Phase 45: Docker Compose Stacks** (completed 2026-03-23)
- [x] **Phase 46: Events + Engine Info + Polish** (completed 2026-03-23)

</details>

<details>
<summary>v14.0 Remote PC Control Agent (Phases 47-53) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Build a cross-platform agent (Windows/Mac/Linux) that users install on their PCs, authenticates via livinity.io OAuth Device Authorization Grant, connects through the existing relay server, and exposes local PC capabilities as AI-callable tools in Nexus.

- [x] **Phase 47: Platform OAuth + Relay Device Infrastructure** (completed 2026-03-24)
- [x] **Phase 48: Agent Binary + Authentication** (completed 2026-03-24)
- [x] **Phase 49: Relay Message Routing + DeviceBridge** (completed 2026-03-24)
- [x] **Phase 50: Agent Core Tools -- Shell + Files** (completed 2026-03-24)
- [x] **Phase 51: Agent Extended Tools -- Processes + Screenshot + System Info** (completed 2026-03-24)
- [x] **Phase 52: My Devices UI** (completed 2026-03-24)
- [x] **Phase 53: Audit Logging + Security Hardening** (completed 2026-03-24)

</details>

<details>
<summary>v14.1 Agent Installer & Setup UX (Phases 1-4) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Replace CLI-only agent setup with polished native installers (Windows .exe, macOS .dmg, Linux .deb) and a web-based setup wizard that opens in the browser. Users double-click to install, the agent opens a beautiful setup page for OAuth, then runs silently in the background with auto-start on boot.

- [x] **Phase 1: Web Setup Wizard** (completed 2026-03-24)
- [x] **Phase 2: System Tray Icon** (completed 2026-03-24)
- [x] **Phase 3: Platform Installers** (completed 2026-03-24)
- [x] **Phase 4: Download Page** (completed 2026-03-24)

</details>

<details>
<summary>v15.0 AI Computer Use (Phases 5-9) - SHIPPED 2026-03-24</summary>

**Milestone Goal:** Enable the AI to see the screen, click, type, and navigate applications on connected devices -- Claude Computer Use style. The AI takes screenshots, analyzes them with multimodal vision, determines coordinates, and executes mouse/keyboard actions in a screenshot-analyze-action loop with live monitoring and security controls.

- [x] **Phase 5: Agent Mouse & Keyboard Tools** (completed 2026-03-24)
- [x] **Phase 6: Screen Info & Screenshot Extensions** (completed 2026-03-24)
- [x] **Phase 7: Computer Use Loop** (completed 2026-03-24)
- [x] **Phase 8: Live Monitoring UI** (completed 2026-03-24)
- [x] **Phase 9: Security & Permissions** (completed 2026-03-24)

</details>

### v16.0 Multi-Provider AI

**Milestone Goal:** Add Claude (Anthropic) as a second AI provider alongside Kimi, with full feature parity and a Settings UI toggle. ClaudeProvider is restored from git history (467 lines, commit 1ea5513^), not built from scratch. The agent loop already uses Anthropic message format internally, so Claude needs no message conversion.

- [ ] **Phase 1: Provider Restore & Registration** - Restore ClaudeProvider from git, add SDK, register in ProviderManager
- [ ] **Phase 2: Feature Parity** - Streaming, tool calling, vision, and model tier mapping for Claude
- [ ] **Phase 3: Auth & Config** - API key management, OAuth PKCE, config schema, fallback loop
- [ ] **Phase 4: Settings UI & Integration** - Provider toggle, status display, conversation routing

## Phase Details

### Phase 1: Provider Restore & Registration
**Goal**: ClaudeProvider exists in the codebase, compiles, and is registered in ProviderManager as an available provider alongside Kimi
**Depends on**: Nothing (first phase)
**Requirements**: PROV-01, PROV-02
**Success Criteria** (what must be TRUE):
  1. ClaudeProvider class is restored from git history and lives at its canonical path in nexus/packages/core/src/providers/
  2. `@anthropic-ai/sdk` is listed in package.json dependencies and installs without errors
  3. ProviderManager.getProvider('claude') returns an instance of ClaudeProvider
  4. `npm run build --workspace=packages/core` succeeds with zero TypeScript errors
**Plans:** 1 plan
Plans:
- [x] 01-01-PLAN.md -- Restore ClaudeProvider, add SDK, register in ProviderManager

### Phase 2: Feature Parity
**Goal**: Claude provider handles all AI capabilities identically to Kimi -- streaming responses, tool calling, vision/multimodal input, and model tier routing
**Depends on**: Phase 1 (ClaudeProvider must exist and compile)
**Requirements**: FEAT-01, FEAT-02, FEAT-03, FEAT-04
**Success Criteria** (what must be TRUE):
  1. User sends a message with Claude as the active provider and receives a streaming response that appears token-by-token in the AI chat UI
  2. AI can call tools (shell, files, etc.) through Claude provider using Anthropic native tool_use format, with results flowing back correctly
  3. User sends an image (screenshot, uploaded file) and Claude analyzes it and responds with visual understanding
  4. Model tier selection (fast/balanced/quality) maps to Claude models (haiku/sonnet/opus) and requests use the correct model
**Plans:** 1 plan
Plans:
- [ ] 02-01-PLAN.md -- Enable native tool calling for Claude, fix image format conversion, verify model tier mapping

### Phase 3: Auth & Config
**Goal**: Users can authenticate Claude with their API key (or OAuth), the key is securely stored, the config schema supports provider selection, and fallback between providers works
**Depends on**: Phase 1 (provider must be registered), Phase 2 (provider must be functional to test fallback)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, PROV-04, PROV-03
**Success Criteria** (what must be TRUE):
  1. User opens Settings, enters a Claude API key, and it is accepted and validated against the Anthropic API
  2. Claude API key is stored in Redis (not plaintext in config files) and persists across server restarts
  3. User can optionally authenticate via OAuth PKCE flow instead of pasting an API key
  4. Config schema includes `primary: 'claude' | 'kimi'` and changing it switches which provider handles new requests
  5. When the primary provider fails (rate limit, auth error), ProviderManager automatically falls back to the secondary provider
**Plans**: TBD

### Phase 4: Settings UI & Integration
**Goal**: Users can switch between Claude and Kimi from the Settings UI, see which provider is active, and new conversations use the selected provider
**Depends on**: Phase 3 (config schema and auth must exist for the toggle to control)
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Settings page has a provider selection control (toggle or dropdown) showing Claude and Kimi with their authentication status
  2. Active provider is visible in the AI chat interface (indicator showing whether Claude or Kimi is responding)
  3. After switching providers in Settings, the next new conversation uses the newly selected provider
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Provider Restore & Registration | v16.0 | 0/1 | Planning complete | - |
| 2. Feature Parity | v16.0 | 0/1 | Planning complete | - |
| 3. Auth & Config | v16.0 | 0/0 | Not started | - |
| 4. Settings UI & Integration | v16.0 | 0/0 | Not started | - |
