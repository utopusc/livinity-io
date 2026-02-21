# Roadmap: LivOS Open Source Release

## Overview

This roadmap transforms LivOS from a production codebase with hardcoded values and duplicate AI implementations into a clean, secure, open-source project that anyone can install with a single command. The journey moves through foundation work (config system, cleanup), security hardening, AI consolidation, code quality improvements, documentation, and finally the installer script that makes it all accessible.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Config system and repository cleanup ✓
- [x] **Phase 2: Security Foundation** - Remove exposed secrets and prevent future leaks ✓
- [x] **Phase 3: AI Exports** - Export shared managers from Nexus for LivOS consumption ✓
- [ ] **Phase 4: AI Migration** - Update imports and delete duplicate packages
- [x] **Phase 5: Configurability** - Remove hardcoded domains and paths ✓
- [x] **Phase 6: TypeScript Quality** - Reduce any types and fix error handling ✓
- [x] **Phase 7: Security Hardening** - API authentication and secret rotation ✓
- [x] **Phase 8: Documentation** - README, CONTRIBUTING, and community files ✓
- [x] **Phase 9: Installer** - One-command install script with setup wizard ✓
- [ ] **Phase 10: Release** - Final validation and public release preparation

## Phase Details

### Phase 1: Foundation
**Goal**: Establish centralized configuration system and clean up repository cruft
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-03, AICON-08
**Success Criteria** (what must be TRUE):
  1. Centralized config module exists that other code can import
  2. Config module supports paths, domains, and service URLs
  3. All .bak files removed from repository
  4. Repository is clean of temporary/backup artifacts
**Plans**: 2 plans in 1 wave (parallel execution)

Plans:
- [x] 01-01-PLAN.md - Create @livos/config package with Zod schemas for paths, domains, services
- [x] 01-02-PLAN.md - Delete 4 .bak files and add *.bak to .gitignore

### Phase 2: Security Foundation
**Goal**: Remove exposed secrets and establish secure configuration patterns
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. No hardcoded secrets exist in committed .env files
  2. .env.example exists with all required variables documented
  3. .env is in .gitignore preventing future secret commits
  4. Developer can set up environment from .env.example alone
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md - Complete .gitignore coverage and create canonical .env.example template

### Phase 3: AI Exports
**Goal**: Export SubagentManager, ScheduleManager, and AgentEvent from Nexus
**Depends on**: Phase 1
**Requirements**: AICON-03, AICON-04, AICON-05
**Success Criteria** (what must be TRUE):
  1. SubagentManager is exported from Nexus core package
  2. ScheduleManager is exported from Nexus core package
  3. AgentEvent type is exported from Nexus core package
  4. Exports are importable by external packages
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md - Create lib.ts exports and update package.json with exports field

### Phase 4: AI Migration
**Goal**: Migrate LivOS to use Nexus exports and delete duplicate packages
**Depends on**: Phase 3
**Requirements**: AICON-06, AICON-07, AICON-01, AICON-02
**Success Criteria** (what must be TRUE):
  1. LivOS AiModule imports from Nexus exports (not livcoreai)
  2. AI chat functionality works end-to-end after migration
  3. livcoreai package (1,499 LOC) is deleted
  4. liv/core package (2,039 LOC) is deleted
  5. No orphaned imports or broken references remain
**Plans**: TBD

Plans:
- [ ] 04-01: Update LivOS imports to use Nexus
- [ ] 04-02: Delete duplicate AI packages

### Phase 5: Configurability
**Goal**: Remove all hardcoded domains and paths, use config system
**Depends on**: Phase 1
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. No hardcoded "livinity.cloud" references in codebase
  2. No hardcoded "/opt/livos" or "/opt/nexus" paths in codebase
  3. All domains and paths read from centralized config
  4. Application works with custom domain/path configuration
**Plans**: 4 plans in 2 waves

Plans:
- [x] 05-01-PLAN.md - Extend @livos/config and replace backend domain references
- [x] 05-02-PLAN.md - Replace frontend domains and infrastructure paths
- [x] 05-03-PLAN.md - Replace Nexus hardcoded paths
- [x] 05-04-PLAN.md - Replace skills hardcoded output paths

### Phase 6: TypeScript Quality
**Goal**: Improve type safety and error handling across codebase
**Depends on**: Phase 4 (proceeding independently - typing work is isolated)
**Requirements**: QUAL-04, QUAL-05, QUAL-06, QUAL-07
**Success Criteria** (what must be TRUE):
  1. any type usage reduced in Nexus daemon modules
  2. any type usage reduced in livinityd modules
  3. Catch blocks have proper error logging (not silent swallowing)
  4. Error aggregation hooks exist for monitoring
**Plans**: 3 plans in 2 waves

Plans:
- [x] 06-01-PLAN.md - Error infrastructure: aggregation hooks and fix silent catch
- [x] 06-02-PLAN.md - Nexus type improvements: daemon.ts, api.ts, router.ts
- [x] 06-03-PLAN.md - livinityd type improvements: ai/routes.ts, ai/index.ts, logger.ts

### Phase 7: Security Hardening
**Goal**: Add authentication to internal APIs and rotate production secrets
**Depends on**: Phase 2
**Requirements**: SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. Memory service (port 3300) requires API key authentication
  2. Internal Nexus endpoints require API key authentication
  3. All production secrets have been rotated
  4. New secrets are documented in .env.example
  5. Daemon memory service calls include X-API-Key header
**Plans**: 4 plans in 2 waves

Plans:
- [x] 07-01-PLAN.md - Add API key auth to Memory service (port 3300)
- [x] 07-02-PLAN.md - Add API key auth to Nexus API (port 3200)
- [x] 07-03-PLAN.md - Rotate production secrets (GEMINI_API_KEY, JWT_SECRET, LIV_API_KEY)
- [x] 07-04-PLAN.md - Update daemon.ts memory service calls with X-API-Key header

### Phase 8: Documentation
**Goal**: Create comprehensive documentation for open source release
**Depends on**: Phase 5, Phase 6
**Requirements**: OSS-06, OSS-07, OSS-08, OSS-09, OSS-10, OSS-11, OSS-12, OSS-13
**Success Criteria** (what must be TRUE):
  1. README.md exists with quick start, features, and configuration docs
  2. CONTRIBUTING.md exists with development setup and PR process
  3. LICENSE file exists (AGPL-3.0)
  4. SECURITY.md exists with vulnerability reporting process
  5. CHANGELOG.md exists with version history
**Plans**: 3 plans in 2 waves

Plans:
- [x] 08-01-PLAN.md — Rewrite README.md with comprehensive documentation
- [x] 08-02-PLAN.md — Create CONTRIBUTING.md and CODE_OF_CONDUCT.md
- [x] 08-03-PLAN.md — Create LICENSE, SECURITY.md, and CHANGELOG.md

### Phase 9: Installer
**Goal**: Create one-command install script with interactive setup
**Depends on**: Phase 2, Phase 5, Phase 7, Phase 8
**Requirements**: OSS-01, OSS-02, OSS-03, OSS-04, OSS-05, OSS-14
**Success Criteria** (what must be TRUE):
  1. install.sh detects OS and architecture
  2. install.sh checks and installs dependencies (Docker, Node.js)
  3. install.sh runs interactive configuration wizard
  4. install.sh sets up systemd service
  5. install.sh generates secure secrets automatically
  6. .env.example includes all installer-required variables
  7. Fresh install works end-to-end on Ubuntu 22.04
**Plans**: 3 plans in 3 waves (sequential)

Plans:
- [x] 09-01-PLAN.md — Core installer with OS detection, error handling, and dependencies
- [x] 09-02-PLAN.md — Interactive configuration wizard with whiptail TUI
- [x] 09-03-PLAN.md — systemd services, Redis config, and complete installation flow

### Phase 10: Release
**Goal**: Final validation and preparation for public GitHub release
**Depends on**: All previous phases
**Requirements**: None (validation phase)
**Success Criteria** (what must be TRUE):
  1. All 29 v1 requirements marked complete
  2. Install script tested on fresh Ubuntu 22.04 VPS
  3. AI chat works end-to-end on fresh install
  4. No hardcoded secrets or personal references in codebase
  5. Repository ready for public visibility
**Plans**: TBD

Plans:
- [ ] 10-01: End-to-end validation on fresh VPS
- [ ] 10-02: Final cleanup and release preparation

---

## Milestone: v1.2 — Visual Impact Redesign

**Overview**: v1.1 established semantic tokens but kept identical CSS output. v1.2 changes actual token VALUES to make every component visibly improved.

### v1.2 Phases

- [x] **Phase 1: Token Foundation** - Update semantic token values for surfaces, borders, text, and shadows
- [x] **Phase 2: Component Visual Fixes** - Apply targeted visual fixes to components that need more than token value changes
- [x] **Phase 3: Design Enhancements** - Add new tokens (radius-2xl/3xl, info/warning colors) and AI chat accent

### Phase 1: Token Foundation
**Goal**: Change the actual CSS values behind semantic tokens so every component in the UI becomes visibly improved
**Depends on**: Nothing (first phase)
**Requirements**: TF-01, TF-02, TF-03, TF-04, TF-05, TF-06
**Success Criteria** (what must be TRUE):
  1. Surface opacities increased: surface-base 0.06, surface-1 0.10, surface-2 0.16, surface-3 0.22
  2. Border opacities increased: border-subtle 0.10, border-default 0.16, border-emphasis 0.30
  3. Elevation shadows have white inset glow highlights and stronger outer opacity
  4. Text secondary/tertiary more readable: 0.65 and 0.45
  5. Sheet-shadow and dialog shadow insets use proper top-edge highlight technique
**Plans**: 1 plan in 1 wave

Plans:
- [x] 01-01-PLAN.md — Update all token values in tailwind.config.ts (TF-01 to TF-06)

### Phase 2: Component Visual Fixes
**Goal**: Apply targeted visual fixes to components that need more than just token value changes
**Depends on**: Phase 1
**Requirements**: CV-01, CV-02, CV-03, CV-04, CV-05, CV-06, CV-07, CV-08
**Success Criteria** (what must be TRUE):
  1. Dock has 1px border, surface-1 background, 12px padding
  2. Dock items have 60% icon ratio, visible glow, smoother spring
  3. Sheet shows wallpaper color (brightness 0.38), has top border
  4. Dialog uses border-default for visible edges
  5. File list has hover states and larger icons
  6. Menus have visible hover and larger radius
  7. Windows have border-emphasis for clear floating edges
  8. Buttons have 1px highlight and taller desktop heights
**Plans**: 4 plans in 1 wave (parallel execution)

Plans:
- [x] 02-01-PLAN.md — Dock container + dock items visual fixes (CV-01, CV-02)
- [x] 02-02-PLAN.md — Sheet + Dialog + Window visual fixes (CV-03, CV-04, CV-07)
- [x] 02-03-PLAN.md — File Manager + Menu visual fixes (CV-05, CV-06)
- [x] 02-04-PLAN.md — Button highlight and height adjustments (CV-08)

### Phase 3: Design Enhancements
**Goal**: Add new semantic tokens and visual enhancements
**Depends on**: Phase 1
**Requirements**: DE-01, DE-02, DE-03
**Success Criteria** (what must be TRUE):
  1. radius-2xl (24px) and radius-3xl (28px) semantic tokens exist
  2. info (#3B82F6) and warning (#F59E0B) colors with surface variants defined
  3. AI Chat assistant messages have left border accent
**Plans**: 1 plan in 1 wave

Plans:
- [x] 03-01-PLAN.md — Add radius/color tokens and AI chat assistant accent (DE-01, DE-02, DE-03)

## Progress

### v1.0 Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete | 2026-02-04 |
| 2. Security Foundation | 1/1 | Complete | 2026-02-04 |
| 3. AI Exports | 1/1 | Complete | 2026-02-03 |
| 4. AI Migration | 0/2 | Not started | - |
| 5. Configurability | 4/4 | Complete | 2026-02-04 |
| 6. TypeScript Quality | 3/3 | Complete | 2026-02-04 |
| 7. Security Hardening | 4/4 | Complete | 2026-02-04 |
| 8. Documentation | 3/3 | Complete | 2026-02-04 |
| 9. Installer | 3/3 | Complete | 2026-02-05 |
| 10. Release | 0/2 | Not started | - |

### v1.2 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Token Foundation | 1/1 | Complete | 2026-02-07 |
| 2. Component Visual Fixes | 4/4 | Complete | 2026-02-07 |
| 3. Design Enhancements | 1/1 | Complete | 2026-02-07 |

---

## Milestone: v1.3 — Browser App

**Overview**: Add a persistent Docker-based Chromium browser as an App Store app. Access via subdomain (browser.domain.com), AI controls via Playwright MCP, SOCKS5/HTTP proxy support. No LivOS UI embedding — pure App Store template with gallery hooks for MCP registration.

### v1.3 Phases

- [ ] **Phase 1: Container & App Store** - Docker image, gallery template, builtin-apps entry, installable from store
- [ ] **Phase 2: MCP Integration** - Playwright MCP auto-registration, CDP connection, AI browser control
- [ ] **Phase 3: Proxy & Anti-Detection** - SOCKS5/HTTP proxy support, anti-detection flags, security hardening

### Phase 1: Container & App Store
**Goal**: Create installable Chromium browser app in LivOS App Store with persistent sessions and subdomain access
**Depends on**: Nothing (first phase)
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, STORE-01, STORE-02, STORE-03, STORE-04, SEC-01, SEC-02, SEC-04
**Success Criteria** (what must be TRUE):
  1. User can find "Chromium Browser" in App Store
  2. User can install the app and it builds the custom Docker image
  3. User can assign subdomain and access browser at browser.domain.com
  4. Browser sessions persist across container restarts (logged-in sites stay logged in)
  5. Container recovers from crashes (stale lock files cleaned, restart policy works)
**Plans**: 2 plans in 1 wave

Plans:
- [ ] v1.3-01-01-PLAN.md — Gallery template (Dockerfile, docker-compose.yml, livinity-app.yml, clean-singletonlock.sh)
- [ ] v1.3-01-02-PLAN.md — builtin-apps.ts entry + verify install flow works

### Phase 2: MCP Integration
**Goal**: Enable AI agent to control the browser via Playwright MCP with auto-registration lifecycle
**Depends on**: Phase 1
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, SEC-03
**Success Criteria** (what must be TRUE):
  1. When browser app starts, Playwright MCP server is auto-registered in Nexus
  2. When browser app stops, Playwright MCP server is auto-deregistered
  3. AI agent can navigate to URLs via MCP tools
  4. AI agent can click, type, and take screenshots via MCP tools
  5. CDP port 9222 is internal only (not exposed to host network)
**Plans**: 2 plans in 2 waves

Plans:
- [ ] v1.3-02-01-PLAN.md — Update hooks for MCP registration/deregistration via Redis + verify CDP security
- [ ] v1.3-02-02-PLAN.md — Verify Playwright MCP connection, tool discovery, and AI agent browser control

### Phase 3: Proxy & Anti-Detection
**Goal**: Add SOCKS5/HTTP proxy support and anti-detection flags for privacy and automation
**Depends on**: Phase 1
**Requirements**: PROXY-01, PROXY-02, PROXY-03, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. User can configure SOCKS5 proxy via environment variable
  2. User can configure HTTP proxy via environment variable
  3. Anti-detection flags prevent basic automation fingerprinting
  4. Browser remains stable with all flags enabled
**Plans**: 1 plan in 1 wave

Plans:
- [ ] v1.3-03-01-PLAN.md — Dynamic CHROME_CLI assembly with PROXY_URL support, anti-detection flags, builtin-apps.ts update

### v1.3 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Container & App Store | 0/2 | Not started | - |
| 2. MCP Integration | 0/2 | Not started | - |
| 3. Proxy & Anti-Detection | 0/1 | Not started | - |

---

## Milestone: v1.5 — Claude Migration & AI Platform

**Overview**: Replace Gemini as the sole AI backend with a multi-provider architecture where Claude is primary and Gemini serves as fallback. Integrate OpenClaw-inspired features: hybrid memory with automatic extraction, skill marketplace with Git-based registries, expanded channel support (Slack, Matrix), WebSocket RPC gateway, human-in-the-loop tool approval, and parallel agent execution. The result is LivOS as a serious AI platform, not just a Gemini wrapper.

### v1.5 Phases

- [ ] **Phase 1: Provider Abstraction + Claude Integration** - Multi-provider AI backend with Claude primary, Gemini fallback
- [ ] **Phase 2: Native Tool Calling + Auth UI** - Claude native tool_use, dual-mode AgentLoop, API key management UI
- [ ] **Phase 3: Hybrid Memory + Channel Expansion** - Automatic memory extraction, Slack and Matrix channels
- [ ] **Phase 4: WebSocket Gateway + Human-in-the-Loop** - JSON-RPC 2.0 over WebSocket, tool approval system
- [ ] **Phase 5: Skill Marketplace + Parallel Execution** - Git-based skill registry, concurrent agent tasks

### Phase 1: Provider Abstraction + Claude Integration
**Goal**: Users can chat with Claude as the primary AI and automatically fall back to Gemini when Claude is unavailable, with no change to the existing UI or streaming experience
**Depends on**: Nothing (first v1.5 phase)
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06, PROV-07, CLAUDE-01, CLAUDE-02, CLAUDE-03, CLAUDE-04, CLAUDE-05, GEM-01, GEM-02, GEM-03
**Success Criteria** (what must be TRUE):
  1. User can send a message in web chat and receive a streaming response from Claude (Sonnet by default)
  2. If the Claude API returns 429/503 or times out, the same message automatically retries with Gemini and the user sees a response (not an error)
  3. Existing Gemini conversations continue to work identically after the migration (no regression)
  4. Token usage (input/output tokens) is displayed consistently regardless of which provider handled the request
  5. The AI chat streaming experience (chunks appearing, tool call indicators, done events) is visually identical to before the migration
**Plans**: 3 plans in 3 waves (sequential)

Plans:
- [ ] v1.5-01-01-PLAN.md — AIProvider interface, provider-neutral message types, message normalization layer
- [ ] v1.5-01-02-PLAN.md — ClaudeProvider implementation with streaming, model tier mapping, SDK upgrade
- [ ] v1.5-01-03-PLAN.md — GeminiProvider extraction, ProviderManager fallback logic, Brain refactor as thin wrapper

### Phase 2: Native Tool Calling + Auth UI
**Goal**: AI agent uses Claude's native tool calling for reliable tool execution, and users can configure API keys and provider preferences through the Settings UI
**Depends on**: Phase 1 (provider abstraction must exist)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User asks the AI to perform a tool action (e.g., "list my Docker containers") and sees the tool call execute successfully with Claude's native tool_use format
  2. When the AI uses extended thinking, the user can expand a collapsible section in the chat UI to see the reasoning
  3. User can navigate to Settings, enter an Anthropic API key, and the system validates it before saving
  4. User can select a primary provider (Claude or Gemini) and configure a fallback chain in Settings
  5. A fresh install via install.sh prompts for an Anthropic API key during the setup wizard
**Plans**: 3 plans in 2 waves

Plans:
- [ ] v1.5-02-01-PLAN.md — ToolRegistry.toClaudeTools(), ClaudeProvider native tool_use support (TOOL-01) [Wave 1]
- [ ] v1.5-02-02-PLAN.md — Dual-mode AgentLoop, Brain/ProviderManager tools passthrough, extended thinking (TOOL-02, TOOL-03, TOOL-04, TOOL-05) [Wave 2]
- [ ] v1.5-02-03-PLAN.md — Settings UI for API keys, provider selection, key validation, install.sh update (AUTH-01, AUTH-02, AUTH-03, AUTH-04) [Wave 1]

### Phase 3: Hybrid Memory + Channel Expansion
**Goal**: The AI remembers important facts from past conversations automatically, and users can interact with the AI through Slack and Matrix in addition to existing channels
**Depends on**: Phase 1 (needs provider abstraction for memory extraction LLM calls)
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, CHAN-01, CHAN-02, CHAN-03, CHAN-04, CHAN-05
**Success Criteria** (what must be TRUE):
  1. After a conversation where the user mentions a preference (e.g., "I prefer dark mode"), the AI recalls this in a future conversation without being reminded
  2. Duplicate memories are not accumulated (telling the AI the same fact twice does not create two memory entries)
  3. Recent memories are prioritized over old ones in the AI's context (time-decay scoring)
  4. User can add a Slack workspace in Settings and send messages to the AI via Slack, receiving responses in the same Slack channel
  5. User can configure a Matrix room in Settings and interact with the AI through Matrix messages
**Plans**: 5 plans in 2 waves

Plans:
- [ ] v1.5-03-01-PLAN.md — Memory extraction (BullMQ job), deduplication, session binding, temporal scoring [Wave 1]
- [ ] v1.5-03-02-PLAN.md — Context window optimization (/context endpoint, memory injection into agent prompt) [Wave 2]
- [ ] v1.5-03-03-PLAN.md — SlackProvider, ChannelId update, register in ChannelManager [Wave 1]
- [ ] v1.5-03-04-PLAN.md — MatrixProvider, matrix-js-sdk install, register in ChannelManager [Wave 1]
- [ ] v1.5-03-05-PLAN.md — Per-channel Settings UI (Slack + Matrix panels), response routing race fix [Wave 2]

### Phase 4: WebSocket Gateway + Human-in-the-Loop
**Goal**: External clients can interact with the AI agent over a standardized WebSocket protocol, and destructive tool operations require explicit user approval before execution
**Depends on**: Phase 2 (needs tool calling infrastructure for approval gates)
**Requirements**: WS-01, WS-02, WS-03, WS-04, WS-05, HITL-01, HITL-02, HITL-03, HITL-04, HITL-05
**Success Criteria** (what must be TRUE):
  1. A client can connect to the WebSocket endpoint with a valid API key or JWT, send a JSON-RPC request to run an agent task, and receive streaming results
  2. Multiple concurrent agent tasks can run over a single WebSocket connection (multiplexed by session ID)
  3. When the AI attempts to run a destructive tool (e.g., delete a file), the user receives an approval prompt and the agent pauses until the user approves or denies
  4. A user can approve a pending tool action from any connected channel (web, Telegram, Slack), not just the channel where the task originated
  5. All tool approval decisions are logged with who approved, what was approved, and when
**Plans**: 4 plans in 2 waves

Plans:
- [ ] v1.5-04-01-PLAN.md — JSON-RPC 2.0 WebSocket gateway: auth, framing, method routing, multiplexed sessions (WS-01, WS-02, WS-03, WS-04)
- [ ] v1.5-04-02-PLAN.md — Server-initiated notifications via Redis pub/sub to WebSocket push (WS-05)
- [ ] v1.5-04-03-PLAN.md — HITL core: tool approval metadata, ApprovalManager, agent loop pause/resume (HITL-01, HITL-02, HITL-03)
- [ ] v1.5-04-04-PLAN.md — HITL wiring: approval policy config, API endpoints, audit trail, destructive tool marking (HITL-04, HITL-05)

### Phase 5: Skill Marketplace + Parallel Execution
**Goal**: Users can discover and install community skills from a Git-based marketplace, and the AI can run multiple independent tasks in parallel
**Depends on**: Phase 2 (needs tool calling for skills), Phase 4 (needs WebSocket for task monitoring)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, PARA-01, PARA-02, PARA-03, PARA-04
**Success Criteria** (what must be TRUE):
  1. User can browse available skills in a marketplace UI within LivOS, seeing name, description, and required permissions for each skill
  2. User can install a skill from the marketplace and it becomes immediately available to the AI agent without restart
  3. Installed skills declare permissions upfront and the user reviews them before confirming installation
  4. User can ask the AI to perform two independent tasks simultaneously (e.g., "scan my Docker containers AND check disk usage") and both run in parallel
  5. User can view the status of running tasks and cancel any task mid-execution
**Plans**: 3 plans in 2 waves

Plans:
- [ ] v1.5-05-01-PLAN.md -- SKILL.md manifest schema, directory-based format, Git registry client [Wave 1]
- [ ] v1.5-05-02-PLAN.md -- Skill install/uninstall flow, permission review, progressive loading, marketplace UI [Wave 2]
- [ ] v1.5-05-03-PLAN.md -- BullMQ parallel agent tasks, status monitoring API, cancellation, resource-aware scheduling [Wave 1]

### v1.5 Progress

**Execution Order:**
Phases execute sequentially: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Provider Abstraction + Claude Integration | 0/3 | Not started | - |
| 2. Native Tool Calling + Auth UI | 0/3 | Not started | - |
| 3. Hybrid Memory + Channel Expansion | 0/3 | Not started | - |
| 4. WebSocket Gateway + Human-in-the-Loop | 0/4 | Not started | - |
| 5. Skill Marketplace + Parallel Execution | 0/3 | Not started | - |

---

## Milestone: v2.0 — OpenClaw-Class AI Platform

**Overview**: Transform LivOS into an OpenClaw-class personal AI platform. Phase 1 stabilizes the crashing nexus-core process, closes the DM security gap, adds chat commands, and instruments usage tracking. Phase 2 builds automation infrastructure with webhook receivers and Gmail as a channel. Phase 3 adds session compaction to prevent context window exhaustion, then multi-agent session orchestration on top. Phase 4 delivers a full voice pipeline (Deepgram STT + Cartesia TTS) via push-to-talk in the web UI. Phase 5 creates Live Canvas for AI-generated visual artifacts and upgrades the LivHub skill marketplace. Phase 6 wraps everything in a guided onboarding CLI for one-command deployment.

### v2.0 Phases

- [x] **Phase 1: Stability & Security Foundation** - Process hardening, DM pairing security, chat commands, usage tracking ✓
- [ ] **Phase 2: Automation Infrastructure** - Webhook triggers with HMAC auth, Gmail as a channel provider
- [x] **Phase 3: Intelligence Enhancements** - Session compaction to manage context, multi-agent session orchestration ✓
- [x] **Phase 4: Voice Pipeline** - Push-to-talk voice interaction via Deepgram STT and Cartesia TTS ✓
- [x] **Phase 5: Live Canvas + LivHub** - AI-generated visual artifacts in sandboxed iframe, upgraded skill marketplace ✓
- [ ] **Phase 6: Onboarding CLI** - Guided interactive server setup with livinity CLI tool

### Phase 1: Stability & Security Foundation
**Goal**: The server runs reliably for days without crashing, unknown users cannot interact with the bot without activation, and every user has visibility into their token consumption and session control via chat commands
**Depends on**: Nothing (first v2.0 phase)
**Requirements**: STAB-01, STAB-02, STAB-03, STAB-04, STAB-05, STAB-06, STAB-07, DM-01, DM-02, DM-03, DM-04, DM-05, DM-06, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, USAGE-01, USAGE-02, USAGE-03, USAGE-04, USAGE-05, USAGE-06
**Success Criteria** (what must be TRUE):
  1. nexus-core process runs for 24+ hours under normal usage without a single PM2 restart (verified via `pm2 show nexus-core` uptime)
  2. An unknown Telegram/Discord user who DMs the bot receives a 6-digit activation code prompt instead of having their message processed by the AI, and the server owner can approve or deny the pairing in the web UI
  3. User can send `/new`, `/compact`, `/usage`, and `/activation` commands in both Telegram and Discord, and each command executes without hitting the AI agent (zero token cost)
  4. After any AI conversation, user can send `/usage` and see input tokens, output tokens, turn count, and estimated cost for the current session and cumulative totals
  5. Web UI Settings page shows a usage dashboard with daily token consumption charts
**Plans**: 4 plans in 3 waves

Plans:
- [x] v2.0-01-01-PLAN.md — Process stability: global error handlers, BullMQ repeatable crons, Redis circuit breaker, PM2 config, grammy offset persistence, agent turn cap [Wave 1]
- [x] v2.0-01-02-PLAN.md — DM pairing security: activation code flow, TTL/rate limit, admin approval UI, Redis allowlist, per-channel DM policy, group bypass [Wave 2]
- [x] v2.0-01-03-PLAN.md — Chat commands: /new, /compact (stub), /activation, cross-channel parity, pre-agent command parsing [Wave 2]
- [x] v2.0-01-04-PLAN.md — Usage tracking: per-session metrics, Redis counters, /usage command, TTFB tracking, Settings dashboard [Wave 3]

### Phase 2: Automation Infrastructure
**Goal**: External services can trigger AI agent tasks via authenticated webhooks, and the AI can read, reply, search, and manage Gmail as a full communication channel
**Depends on**: Phase 1 (stable process required before adding webhook/email event sources)
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06, GMAIL-01, GMAIL-02, GMAIL-04, GMAIL-05, GMAIL-06, GMAIL-07
**Success Criteria** (what must be TRUE):
  1. User can create a webhook endpoint via MCP tool, send a signed POST request to the generated URL, and the AI agent receives and processes the payload as a task
  2. Duplicate webhook deliveries (retries from the same source) are silently deduplicated and do not trigger multiple agent tasks
  3. User can authenticate their Gmail account via OAuth flow in Settings, and incoming emails appear as messages to the AI agent
  4. AI agent can reply to, send, search, and archive emails via MCP tools, and the user sees the results in their Gmail inbox
  5. If Gmail OAuth credentials expire or are revoked, the user receives a notification in Telegram/Discord prompting re-authentication
**Status**: COMPLETE (2026-02-20)
**Plans**: 4 plans in 2 waves
- [x] v2.0-02-01-PLAN.md — Webhook receiver: WebhookManager, HMAC-SHA256, BullMQ queue, Redis dedup, Express route [Wave 1]
- [x] v2.0-02-02-PLAN.md — Webhook management: MCP tools (create/list/delete), rate limiting, CRUD endpoints, tRPC, Settings UI [Wave 2]
- [x] v2.0-02-03-PLAN.md — Gmail OAuth + GmailProvider: OAuth 2.0 flow, polling-based email channel, Settings UI [Wave 1]
- [x] v2.0-02-04-PLAN.md — Gmail MCP tools: read/reply/send/search/archive, token failure alerting [Wave 2]

Plans:
- [ ] v2.0-02-01-PLAN.md — Webhook receiver: WebhookManager class, HMAC-SHA256 verification, BullMQ job queuing, Redis deduplication [Wave 1]
- [ ] v2.0-02-02-PLAN.md — Webhook management: MCP tools (create/list/delete), rate limiting (30/min), REST CRUD, Settings UI [Wave 2]
- [ ] v2.0-02-03-PLAN.md — Gmail OAuth + GmailProvider: OAuth flow in Settings, ChannelProvider polling, token refresh, Gmail Settings UI [Wave 1]
- [ ] v2.0-02-04-PLAN.md — Gmail MCP tools: read, reply, send, search, archive tools, token refresh failure alerting [Wave 2]

### Phase 3: Intelligence Enhancements
**Goal**: Long conversations are automatically summarized to prevent context window exhaustion, and the AI agent can spawn and coordinate sub-agents for complex multi-step tasks
**Depends on**: Phase 1 (usage tracking needed for token budget enforcement), Phase 2 (not strictly required, but stable BullMQ patterns established)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, MULTI-01, MULTI-02, MULTI-03, MULTI-04, MULTI-05, MULTI-06, MULTI-07
**Success Criteria** (what must be TRUE):
  1. When a conversation exceeds 100k tokens, older messages are automatically summarized while the last 10 messages and critical facts (file paths, error codes, user preferences) are preserved verbatim
  2. User can send `/compact` and see a report showing how many tokens were saved and what percentage of the conversation was compressed
  3. AI agent can spawn a sub-agent to perform a specific task (e.g., "research this topic") and receive results back, visible in the chat as a coordinated workflow
  4. Sub-agents are limited to 8 turns and 50k tokens, and cannot spawn further sub-agents (no fork bombs)
  5. Maximum 2 sub-agents can run concurrently on the VPS, with additional requests queued until a slot opens
**Status**: COMPLETE (2026-02-20)
**Plans**: 3 plans in 2 waves
- [x] v2.0-03-01-PLAN.md — Session compaction: compactSession(), critical fact pinning, auto-compact at 100k, /compact command [Wave 1]
- [x] v2.0-03-02-PLAN.md — Multi-agent MCP tools: sessions_create/list/send/history, MultiAgentManager, Redis session schema [Wave 1]
- [x] v2.0-03-03-PLAN.md — Sub-agent execution: BullMQ worker, SdkAgentRunner integration, DAG enforcement, concurrency cap [Wave 2]

### Phase 4: Voice Pipeline
**Goal**: Users can press a button in the web UI to talk to the AI and hear spoken responses in real-time, with end-to-end latency under 1.2 seconds
**Depends on**: Phase 1 (stable process required — voice WebSocket connections drop on every restart)
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, VOICE-06, VOICE-07, VOICE-08, VOICE-09, VOICE-10
**Success Criteria** (what must be TRUE):
  1. User can click a push-to-talk button in the AI chat, speak a question, and hear the AI respond with natural-sounding voice within ~1 second of finishing their sentence
  2. Voice audio streams in real-time — the user hears the AI's response word-by-word as it is generated, not after the full response is complete
  3. User can configure Deepgram and Cartesia API keys in the web UI Settings page, and voice mode activates only when both keys are present
  4. Voice sessions maintain stable WebSocket connections with automatic reconnection on network interruptions (no manual page refresh needed)
  5. A latency dashboard (or log) shows timestamps at each pipeline stage: mic capture, STT transcript, LLM first token, TTS first audio, browser playback
**Plans**: 4 plans in 3 waves
**Status**: COMPLETE (2026-02-20)
Plans:
- [x] v2.0-04-01-PLAN.md — Voice WebSocket gateway: /ws/voice binary endpoint, VoiceSession state machine, VoiceGateway class, voice config schema [Wave 1]
- [x] v2.0-04-02-PLAN.md — STT integration: DeepgramRelay class, persistent WebSocket to Deepgram, audio relay, transcript events, daemon.addToInbox() wiring [Wave 2]
- [x] v2.0-04-03-PLAN.md — TTS integration: CartesiaRelay class, text-to-speech streaming, context_id continuity, sentence buffering, audio relay back to browser [Wave 2]
- [x] v2.0-04-04-PLAN.md — Voice UI + instrumentation: VoiceButton push-to-talk component, MediaRecorder capture, AudioContext playback, API key settings, latency pipeline timestamps [Wave 3]

### Phase 5: Live Canvas + LivHub
**Goal**: The AI can generate and update interactive visual content (React components, charts, diagrams) displayed alongside the chat, and users can discover and manage skills through an improved marketplace
**Depends on**: Phase 1 (stable process), Phase 3 (compaction prevents canvas sessions from exhausting context)
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05, CANVAS-06, CANVAS-07, CANVAS-08, HUB-01, HUB-02, HUB-03, HUB-04, HUB-05
**Success Criteria** (what must be TRUE):
  1. User asks the AI to "create a dashboard showing my Docker containers" and a live, interactive React component appears in a split-pane next to the chat
  2. The AI can update the canvas content in-place (e.g., "add a memory usage chart to the dashboard") without replacing the entire artifact
  3. Canvas content runs in a sandboxed iframe that cannot access the parent page's cookies, localStorage, or DOM (security verified by attempting postMessage with same-origin access)
  4. User can browse the LivHub marketplace, see skill names, descriptions, versions, and required permissions, and install or uninstall skills with immediate effect on the AI's available tools
  5. LivHub supports multiple Git-based registries, and the skill catalog refreshes on a configurable schedule
**Status**: COMPLETE (2026-02-21)
**Plans**: 4 plans in 3 waves

Plans:
- [x] v2.0-05-01-PLAN.md — Canvas MCP tools: CanvasManager class, canvas_render + canvas_update tools, Redis artifact storage, REST endpoints, tRPC proxy routes [Wave 1]
- [x] v2.0-05-02-PLAN.md — Canvas UI: CanvasPanel split-pane, CanvasIframe sandboxed renderer, CDN template injection, postMessage protocol, error boundary [Wave 2]
- [x] v2.0-05-03-PLAN.md — Canvas artifact types: per-type srcdoc templates (React/HTML/SVG/Mermaid/Recharts), type auto-detection, enhanced tool descriptions [Wave 3]
- [x] v2.0-05-04-PLAN.md — LivHub marketplace: LivHub branding, multi-registry management, catalog refresh, Registries tab [Wave 1]

### Phase 6: Onboarding CLI
**Goal**: A new user can run a single command on a fresh Ubuntu server and have LivOS fully installed and configured through a guided interactive wizard, with all v2.0 features wired up
**Depends on**: Phase 1 through Phase 5 (CLI must know the complete feature set to configure it)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09
**Success Criteria** (what must be TRUE):
  1. Running `npx livinity onboard` on a fresh Ubuntu 22.04+ server launches a guided interactive setup that installs all prerequisites, configures the domain, and starts all services
  2. The CLI checks system requirements (Docker, Node.js 22+, Redis, PostgreSQL, disk 10GB+, RAM 4GB+) and clearly reports what is missing before proceeding
  3. After setup completes, `livinity status` shows the health of all PM2 services with green/red indicators
  4. Non-interactive mode (`livinity onboard --config setup.json`) completes the full installation without any user prompts
  5. If the installation fails partway through, completed steps are rolled back (created files removed, started services stopped) leaving the server in a clean state
**Plans**: 3 plans in 3 waves (sequential)

Plans:
- [ ] v2.0-06-01-PLAN.md — CLI package scaffolding: nexus/packages/cli with commander + picocolors, system prerequisite checks (Node/Docker/Redis/PM2/disk/RAM), livinity status command with PM2 health table [Wave 1]
- [ ] v2.0-06-02-PLAN.md — Interactive onboard wizard: @clack/prompts UX, domain/SSL config, Telegram/Discord tokens, optional voice/Gmail, secret generation (crypto.randomBytes), .env writer [Wave 2]
- [ ] v2.0-06-03-PLAN.md — Service setup + resilience: PM2 ecosystem generation, dep install + build + start, health verification, non-interactive mode (--config setup.json), RollbackStack for partial failure cleanup [Wave 3]

### v2.0 Progress

**Execution Order:**
Phases execute sequentially: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stability & Security Foundation | 4/4 | Complete | 2026-02-20 |
| 2. Automation Infrastructure | 4/4 | Complete | 2026-02-20 |
| 3. Intelligence Enhancements | 3/3 | Complete | 2026-02-20 |
| 4. Voice Pipeline | 4/4 | Complete | 2026-02-20 |
| 5. Live Canvas + LivHub | 4/4 | Complete | 2026-02-21 |
| 6. Onboarding CLI | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-03*
*Total phases: 10 (v1.0) + 3 (v1.2) + 3 (v1.3) + 5 (v1.5) + 6 (v2.0) | Total plans: 73 (estimated)*
*Coverage: 29/29 v1.0 + 21/21 v1.3 + 54/54 v1.5 + 83/83 v2.0 requirements mapped*
