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
**Plans**: TBD

Plans:
- [ ] v1.5-01-01: AIProvider interface, provider-neutral message format, message normalization layer
- [ ] v1.5-01-02: ClaudeProvider implementation with streaming, model tier mapping
- [ ] v1.5-01-03: GeminiProvider extraction from Brain class, fallback logic, Brain refactor as thin wrapper

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
**Plans**: TBD

Plans:
- [ ] v1.5-02-01: ToolRegistry.toClaudeTools(), dual-mode AgentLoop (native tool_use + JSON-in-text)
- [ ] v1.5-02-02: tool_use_id tracking, parallel tool call handling, extended thinking UI
- [ ] v1.5-02-03: Settings UI for API keys, provider selection, key validation, install.sh update

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
**Plans**: TBD

Plans:
- [ ] v1.5-03-01: Automatic memory extraction (BullMQ job), deduplication, session binding, temporal scoring
- [ ] v1.5-03-02: Context window optimization (relevance-scored memory assembly within token budget)
- [ ] v1.5-03-03: SlackProvider, MatrixProvider, ChannelId update, per-channel Settings UI, routing race fix

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
**Plans**: TBD

Plans:
- [ ] v1.5-04-01: JSON-RPC 2.0 framing, WebSocket auth, method routing, multiplexed sessions
- [ ] v1.5-04-02: Server-initiated notifications (Redis pub/sub to WebSocket push)
- [ ] v1.5-04-03: Tool approval metadata, agent loop pause/resume, cross-channel approval, audit trail

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
**Plans**: TBD

Plans:
- [ ] v1.5-05-01: SKILL.md manifest schema, directory-based format, Git registry client
- [ ] v1.5-05-02: Skill install/uninstall flow, permission review, progressive loading, marketplace UI
- [ ] v1.5-05-03: BullMQ parallel agent tasks, status monitoring API, cancellation, resource-aware scheduling

### v1.5 Progress

**Execution Order:**
Phases execute sequentially: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Provider Abstraction + Claude Integration | 0/3 | Not started | - |
| 2. Native Tool Calling + Auth UI | 0/3 | Not started | - |
| 3. Hybrid Memory + Channel Expansion | 0/3 | Not started | - |
| 4. WebSocket Gateway + Human-in-the-Loop | 0/3 | Not started | - |
| 5. Skill Marketplace + Parallel Execution | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-03*
*Total phases: 10 (v1.0) + 3 (v1.2) + 3 (v1.3) + 5 (v1.5) | Total plans: 51 (estimated)*
*Coverage: 29/29 v1.0 + 21/21 v1.3 + 54/54 v1.5 requirements mapped*
