# Requirements: LivOS v2.0 — OpenClaw-Class AI Platform

**Defined:** 2026-02-20
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## v2.0 Requirements

### Stability & Process Hardening

- [ ] **STAB-01**: nexus-core process runs for 24+ hours without a single PM2 restart under normal load
- [ ] **STAB-02**: Unhandled promise rejections and uncaught exceptions are caught globally and logged without crashing the process
- [ ] **STAB-03**: setTimeout-based cron jobs (heartbeat, schedule runner) are replaced with BullMQ repeatable jobs
- [ ] **STAB-04**: Redis connection failures trigger circuit breaker (exponential backoff reconnect) instead of crashing
- [ ] **STAB-05**: grammy Telegram polling offset is persisted to Redis so restarts don't re-deliver old messages
- [ ] **STAB-06**: SdkAgentRunner agent turn count is capped (max 15 turns) to prevent runaway execution
- [ ] **STAB-07**: PM2 ecosystem config includes max_memory_restart (512MB) and exponential backoff restart delay

### DM Pairing / Activation Security

- [ ] **DM-01**: Unknown users who DM the Telegram/Discord bot receive a 6-digit activation code and their message is not processed
- [ ] **DM-02**: Activation codes expire after 1 hour with max 3 pending codes per channel
- [ ] **DM-03**: Server owner can approve/deny pairing requests via the web UI Settings page
- [ ] **DM-04**: Approved users are stored in Redis allowlist and persist across restarts
- [ ] **DM-05**: DM policy is configurable per channel: pairing (default), allowlist, open, disabled
- [ ] **DM-06**: Group messages bypass DM pairing (use @mention activation instead)

### Chat Commands

- [ ] **CMD-01**: User can send `/new [model]` to reset session and optionally switch model tier
- [ ] **CMD-02**: User can send `/compact [instructions]` to summarize conversation and report token savings
- [ ] **CMD-03**: User can send `/usage [off|tokens|full|cost]` to control usage display in responses
- [ ] **CMD-04**: User can send `/activation [mention|always]` in groups to control bot trigger mode
- [ ] **CMD-05**: All new commands work identically in Telegram and Discord
- [ ] **CMD-06**: Commands are parsed and handled before reaching the AI agent (no token cost)

### Usage Tracking

- [ ] **USAGE-01**: Every agent session records input tokens, output tokens, turn count, and tool call count
- [ ] **USAGE-02**: Per-user cumulative usage is tracked in Redis with daily rollup to PostgreSQL
- [ ] **USAGE-03**: `/usage` command shows current session and cumulative token counts
- [ ] **USAGE-04**: `/usage cost` shows estimated cost breakdown by model tier
- [ ] **USAGE-05**: Web UI Settings page shows usage dashboard with daily charts
- [ ] **USAGE-06**: TTFB (time-to-first-byte) latency is tracked per agent request

### Webhook Triggers

- [ ] **HOOK-01**: User can create webhook endpoints via MCP tool (`webhook_create`) with unique URL and optional secret
- [ ] **HOOK-02**: Incoming webhook POST requests are authenticated via HMAC-SHA256 signature verification
- [ ] **HOOK-03**: Authenticated webhook payloads are queued as BullMQ jobs and processed by the agent
- [ ] **HOOK-04**: Webhook jobs are deduplicated by delivery ID to prevent retry storm duplicates
- [ ] **HOOK-05**: Rate limiting per webhook source (30 req/min) and payload size limit (1MB)
- [ ] **HOOK-06**: User can list, view, and delete webhooks via MCP tools and Settings UI

### Gmail Integration

- [ ] **GMAIL-01**: User can authenticate Gmail via OAuth 2.0 flow in the web UI Settings page
- [ ] **GMAIL-02**: GmailProvider implements ChannelProvider interface (connect, disconnect, sendMessage, onMessage)
- [ ] **GMAIL-03**: Gmail watch is set up via Pub/Sub and auto-renewed every 6 days via BullMQ repeatable job
- [ ] **GMAIL-04**: Incoming emails trigger agent tasks with email content as the message text
- [ ] **GMAIL-05**: AI agent can read, reply, send, search, and archive emails via MCP tools
- [ ] **GMAIL-06**: OAuth refresh token failures are detected and user is notified via Telegram/Discord
- [ ] **GMAIL-07**: Polling mode available as simpler alternative to Pub/Sub (configurable)

### Session Compaction

- [ ] **COMP-01**: `SessionManager.compactSession()` summarizes old conversation history using Brain (haiku model)
- [ ] **COMP-02**: Last 10 messages are always preserved verbatim; older messages are summarized
- [ ] **COMP-03**: Critical facts (file paths, error codes, user preferences) are pinned and never compacted
- [ ] **COMP-04**: `/compact` command triggers manual compaction and reports token savings percentage
- [ ] **COMP-05**: Auto-compact triggers when session exceeds 100k token threshold
- [ ] **COMP-06**: Compacted session state is stored in Redis alongside the session

### Multi-Agent Sessions

- [ ] **MULTI-01**: AI agent can spawn sub-agents via `sessions_create` MCP tool with a specific task
- [ ] **MULTI-02**: AI agent can list active sessions via `sessions_list` MCP tool
- [ ] **MULTI-03**: AI agent can send messages to other sessions via `sessions_send` MCP tool
- [ ] **MULTI-04**: AI agent can read session history via `sessions_history` MCP tool
- [ ] **MULTI-05**: Sub-agents are limited to max 8 turns and 50k token budget
- [ ] **MULTI-06**: Maximum 2 concurrent sub-agents on the VPS (resource constraint)
- [ ] **MULTI-07**: DAG topology enforced — sub-agents cannot spawn further sub-agents (fork bomb prevention)

### Voice Pipeline

- [ ] **VOICE-01**: User can click a push-to-talk button in the web UI to speak to the AI
- [ ] **VOICE-02**: Browser audio is captured via MediaRecorder and streamed over WebSocket to server
- [ ] **VOICE-03**: Server relays audio to Deepgram STT via persistent WebSocket and receives transcripts
- [ ] **VOICE-04**: Transcribed text is sent to the AI agent via daemon.addToInbox()
- [ ] **VOICE-05**: AI response text is streamed to Cartesia TTS via WebSocket and audio is relayed back to browser
- [ ] **VOICE-06**: Browser plays TTS audio in real-time via AudioContext/AudioWorklet
- [ ] **VOICE-07**: End-to-end voice latency (mic → STT → AI → TTS → speaker) targets p95 < 1200ms
- [ ] **VOICE-08**: Deepgram and Cartesia API keys are configured via web UI Settings page
- [ ] **VOICE-09**: Voice sessions maintain connection state with keep-alive and exponential reconnect backoff
- [ ] **VOICE-10**: Full latency pipeline is instrumented with timestamps at each stage

### Live Canvas

- [ ] **CANVAS-01**: AI agent can render interactive HTML/React/charts via `canvas_render` MCP tool
- [ ] **CANVAS-02**: Canvas panel appears as split-pane in AI chat route when first artifact is rendered
- [ ] **CANVAS-03**: Canvas content is displayed in sandboxed iframe (`sandbox="allow-scripts allow-popups"`, never `allow-same-origin`)
- [ ] **CANVAS-04**: iframe loads React 18, Babel standalone, and Tailwind CSS from CDN
- [ ] **CANVAS-05**: AI can update existing canvas content via `canvas_update` MCP tool
- [ ] **CANVAS-06**: Parent-iframe communication uses typed postMessage protocol with origin validation
- [ ] **CANVAS-07**: Supported artifact types: React components, HTML/CSS/JS, Mermaid diagrams, SVG, Recharts charts
- [ ] **CANVAS-08**: Error boundary inside iframe posts errors to parent for display

### LivHub Skills Registry

- [ ] **HUB-01**: LivHub marketplace UI shows available skills with name, description, version, and required permissions
- [ ] **HUB-02**: Skills can be installed from LivHub with permission review before installation
- [ ] **HUB-03**: Skills can be uninstalled and immediately removed from agent's available tools
- [ ] **HUB-04**: LivHub supports multiple Git-based registries (not just one source)
- [ ] **HUB-05**: Skill catalog is cached with configurable TTL and manual refresh

### Onboarding CLI

- [ ] **CLI-01**: `npx livinity onboard` runs guided interactive setup on a fresh Ubuntu 22.04+ server
- [ ] **CLI-02**: CLI checks system prerequisites (Docker, Node.js ≥22, Redis, PostgreSQL, disk ≥10GB, RAM ≥4GB)
- [ ] **CLI-03**: CLI prompts for domain, SSL (Caddy), Claude Code auth, Telegram/Discord bot tokens
- [ ] **CLI-04**: CLI optionally configures voice API keys (Deepgram, Cartesia) and Gmail OAuth
- [ ] **CLI-05**: CLI generates secure secrets (JWT, API keys) and writes .env file
- [ ] **CLI-06**: CLI sets up PM2 services and verifies all processes are running
- [ ] **CLI-07**: `livinity status` shows health of all services
- [ ] **CLI-08**: Non-interactive mode: `livinity onboard --config setup.json`
- [ ] **CLI-09**: Partial install rollback: cleanup completed steps on failure

## Future Requirements (v2.1+)

### Advanced Voice
- **VOICE-ADV-01**: Always-listening VAD (voice activity detection) mode with wake word
- **VOICE-ADV-02**: Voice mode for Telegram/Discord channels (bot API voice support)
- **VOICE-ADV-03**: Multiple voice profiles (different Cartesia voice IDs)

### Advanced Canvas
- **CANVAS-ADV-01**: A2UI protocol support when v1.0 stabilizes
- **CANVAS-ADV-02**: Persistent artifacts (save/load canvas state across sessions)
- **CANVAS-ADV-03**: Multi-canvas support (tabs/windows)

### Advanced Multi-Agent
- **MULTI-ADV-01**: Agent-to-agent negotiation protocol
- **MULTI-ADV-02**: Shared knowledge base between agents
- **MULTI-ADV-03**: Visual multi-agent orchestration in UI

### Channels
- **CHAN-ADV-01**: WhatsApp re-integration
- **CHAN-ADV-02**: Signal channel
- **CHAN-ADV-03**: iMessage channel (macOS node)

## Out of Scope

| Feature | Reason |
|---------|--------|
| WhatsApp channel | Disabled for v2.0, only Telegram + Discord |
| Slack/Matrix new features | Already built in v1.5, maintenance only |
| Native desktop/mobile apps | Web-based only, no distribution burden |
| WebRTC for voice | WebSocket sufficient for single-user self-hosted |
| A2UI protocol | Spec pre-stable (v0.8), breaking changes in v0.9 |
| Always-listening wake word | Constant mic, privacy concern, massive scope |
| Local STT/TTS (Whisper/Piper) | Quality gap, GPU requirement, latency penalty |
| Self-hosted LLM | Claude Code Auth only |
| Gemini/OpenAI as primary | Claude Code Auth exclusively |
| Sandpack for canvas | 5MB+ overkill, native iframe is sufficient |
| LangChain/CrewAI | Conflicts with existing Daemon + SdkAgentRunner |
| Centralized marketplace server | Git-based registries, no server dependency |
| Multi-user support | Single-user self-hosted focus |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAB-01 | Phase 1 | Pending |
| STAB-02 | Phase 1 | Pending |
| STAB-03 | Phase 1 | Pending |
| STAB-04 | Phase 1 | Pending |
| STAB-05 | Phase 1 | Pending |
| STAB-06 | Phase 1 | Pending |
| STAB-07 | Phase 1 | Pending |
| DM-01 | Phase 1 | Pending |
| DM-02 | Phase 1 | Pending |
| DM-03 | Phase 1 | Pending |
| DM-04 | Phase 1 | Pending |
| DM-05 | Phase 1 | Pending |
| DM-06 | Phase 1 | Pending |
| CMD-01 | Phase 1 | Pending |
| CMD-02 | Phase 1 | Pending |
| CMD-03 | Phase 1 | Pending |
| CMD-04 | Phase 1 | Pending |
| CMD-05 | Phase 1 | Pending |
| CMD-06 | Phase 1 | Pending |
| USAGE-01 | Phase 1 | Pending |
| USAGE-02 | Phase 1 | Pending |
| USAGE-03 | Phase 1 | Pending |
| USAGE-04 | Phase 1 | Pending |
| USAGE-05 | Phase 1 | Pending |
| USAGE-06 | Phase 1 | Pending |
| HOOK-01 | Phase 2 | Pending |
| HOOK-02 | Phase 2 | Pending |
| HOOK-03 | Phase 2 | Pending |
| HOOK-04 | Phase 2 | Pending |
| HOOK-05 | Phase 2 | Pending |
| HOOK-06 | Phase 2 | Pending |
| GMAIL-01 | Phase 2 | Pending |
| GMAIL-02 | Phase 2 | Pending |
| GMAIL-03 | Phase 2 | Pending |
| GMAIL-04 | Phase 2 | Pending |
| GMAIL-05 | Phase 2 | Pending |
| GMAIL-06 | Phase 2 | Pending |
| GMAIL-07 | Phase 2 | Pending |
| COMP-01 | Phase 3 | Pending |
| COMP-02 | Phase 3 | Pending |
| COMP-03 | Phase 3 | Pending |
| COMP-04 | Phase 3 | Pending |
| COMP-05 | Phase 3 | Pending |
| COMP-06 | Phase 3 | Pending |
| MULTI-01 | Phase 3 | Pending |
| MULTI-02 | Phase 3 | Pending |
| MULTI-03 | Phase 3 | Pending |
| MULTI-04 | Phase 3 | Pending |
| MULTI-05 | Phase 3 | Pending |
| MULTI-06 | Phase 3 | Pending |
| MULTI-07 | Phase 3 | Pending |
| VOICE-01 | Phase 4 | Pending |
| VOICE-02 | Phase 4 | Pending |
| VOICE-03 | Phase 4 | Pending |
| VOICE-04 | Phase 4 | Pending |
| VOICE-05 | Phase 4 | Pending |
| VOICE-06 | Phase 4 | Pending |
| VOICE-07 | Phase 4 | Pending |
| VOICE-08 | Phase 4 | Pending |
| VOICE-09 | Phase 4 | Pending |
| VOICE-10 | Phase 4 | Pending |
| CANVAS-01 | Phase 5 | Pending |
| CANVAS-02 | Phase 5 | Pending |
| CANVAS-03 | Phase 5 | Pending |
| CANVAS-04 | Phase 5 | Pending |
| CANVAS-05 | Phase 5 | Pending |
| CANVAS-06 | Phase 5 | Pending |
| CANVAS-07 | Phase 5 | Pending |
| CANVAS-08 | Phase 5 | Pending |
| HUB-01 | Phase 5 | Pending |
| HUB-02 | Phase 5 | Pending |
| HUB-03 | Phase 5 | Pending |
| HUB-04 | Phase 5 | Pending |
| HUB-05 | Phase 5 | Pending |
| CLI-01 | Phase 6 | Pending |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 6 | Pending |
| CLI-04 | Phase 6 | Pending |
| CLI-05 | Phase 6 | Pending |
| CLI-06 | Phase 6 | Pending |
| CLI-07 | Phase 6 | Pending |
| CLI-08 | Phase 6 | Pending |
| CLI-09 | Phase 6 | Pending |

**Coverage:**
- v2.0 requirements: 80 total
- Mapped to phases: 80
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 — initial definition*
