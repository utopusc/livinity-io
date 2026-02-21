# Requirements: LivOS v2.0 — OpenClaw-Class AI Platform

**Defined:** 2026-02-20
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## v2.0 Requirements

### Stability & Process Hardening

- [x] **STAB-01**: nexus-core process runs for 24+ hours without a single PM2 restart under normal load
- [x] **STAB-02**: Unhandled promise rejections and uncaught exceptions are caught globally and logged without crashing the process
- [x] **STAB-03**: setTimeout-based cron jobs (heartbeat, schedule runner) are replaced with BullMQ repeatable jobs
- [x] **STAB-04**: Redis connection failures trigger circuit breaker (exponential backoff reconnect) instead of crashing
- [x] **STAB-05**: grammy Telegram polling offset is persisted to Redis so restarts don't re-deliver old messages
- [x] **STAB-06**: SdkAgentRunner agent turn count is capped (max 15 turns) to prevent runaway execution
- [x] **STAB-07**: PM2 ecosystem config includes max_memory_restart (512MB) and exponential backoff restart delay

### DM Pairing / Activation Security

- [x] **DM-01**: Unknown users who DM the Telegram/Discord bot receive a 6-digit activation code and their message is not processed
- [x] **DM-02**: Activation codes expire after 1 hour with max 3 pending codes per channel
- [x] **DM-03**: Server owner can approve/deny pairing requests via the web UI Settings page
- [x] **DM-04**: Approved users are stored in Redis allowlist and persist across restarts
- [x] **DM-05**: DM policy is configurable per channel: pairing (default), allowlist, open, disabled
- [x] **DM-06**: Group messages bypass DM pairing (use @mention activation instead)

### Chat Commands

- [x] **CMD-01**: User can send `/new [model]` to reset session and optionally switch model tier
- [x] **CMD-02**: User can send `/compact [instructions]` to summarize conversation and report token savings
- [x] **CMD-03**: User can send `/usage [off|tokens|full|cost]` to control usage display in responses
- [x] **CMD-04**: User can send `/activation [mention|always]` in groups to control bot trigger mode
- [x] **CMD-05**: All new commands work identically in Telegram and Discord
- [x] **CMD-06**: Commands are parsed and handled before reaching the AI agent (no token cost)

### Usage Tracking

- [x] **USAGE-01**: Every agent session records input tokens, output tokens, turn count, and tool call count
- [x] **USAGE-02**: Per-user cumulative usage is tracked in Redis with daily rollup to PostgreSQL
- [x] **USAGE-03**: `/usage` command shows current session and cumulative token counts
- [x] **USAGE-04**: `/usage cost` shows estimated cost breakdown by model tier
- [x] **USAGE-05**: Web UI Settings page shows usage dashboard with daily charts
- [x] **USAGE-06**: TTFB (time-to-first-byte) latency is tracked per agent request

### Webhook Triggers

- [x] **HOOK-01**: User can create webhook endpoints via MCP tool (`webhook_create`) with unique URL and optional secret
- [x] **HOOK-02**: Incoming webhook POST requests are authenticated via HMAC-SHA256 signature verification
- [x] **HOOK-03**: Authenticated webhook payloads are queued as BullMQ jobs and processed by the agent
- [x] **HOOK-04**: Webhook jobs are deduplicated by delivery ID to prevent retry storm duplicates
- [x] **HOOK-05**: Rate limiting per webhook source (30 req/min) and payload size limit (1MB)
- [x] **HOOK-06**: User can list, view, and delete webhooks via MCP tools and Settings UI

### Gmail Integration

- [x] **GMAIL-01**: User can authenticate Gmail via OAuth 2.0 flow in the web UI Settings page
- [x] **GMAIL-02**: GmailProvider implements ChannelProvider interface (connect, disconnect, sendMessage, onMessage)
- [x] **GMAIL-03**: ~~Gmail watch is set up via Pub/Sub and auto-renewed every 6 days via BullMQ repeatable job~~ — **Deferred to v2.1** (polling mode satisfies GMAIL-07; Pub/Sub is advanced optimization per STATE.md decision)
- [x] **GMAIL-04**: Incoming emails trigger agent tasks with email content as the message text
- [x] **GMAIL-05**: AI agent can read, reply, send, search, and archive emails via MCP tools
- [x] **GMAIL-06**: OAuth refresh token failures are detected and user is notified via Telegram/Discord
- [x] **GMAIL-07**: Polling mode available as simpler alternative to Pub/Sub (configurable)

### Session Compaction

- [x] **COMP-01**: `SessionManager.compactSession()` summarizes old conversation history using Brain (haiku model)
- [x] **COMP-02**: Last 10 messages are always preserved verbatim; older messages are summarized
- [x] **COMP-03**: Critical facts (file paths, error codes, user preferences) are pinned and never compacted
- [x] **COMP-04**: `/compact` command triggers manual compaction and reports token savings percentage
- [x] **COMP-05**: Auto-compact triggers when session exceeds 100k token threshold
- [x] **COMP-06**: Compacted session state is stored in Redis alongside the session

### Multi-Agent Sessions

- [x] **MULTI-01**: AI agent can spawn sub-agents via `sessions_create` MCP tool with a specific task
- [x] **MULTI-02**: AI agent can list active sessions via `sessions_list` MCP tool
- [x] **MULTI-03**: AI agent can send messages to other sessions via `sessions_send` MCP tool
- [x] **MULTI-04**: AI agent can read session history via `sessions_history` MCP tool
- [x] **MULTI-05**: Sub-agents are limited to max 8 turns and 50k token budget
- [x] **MULTI-06**: Maximum 2 concurrent sub-agents on the VPS (resource constraint)
- [x] **MULTI-07**: DAG topology enforced — sub-agents cannot spawn further sub-agents (fork bomb prevention)

### Voice Pipeline

- [x] **VOICE-01**: User can click a push-to-talk button in the web UI to speak to the AI
- [x] **VOICE-02**: Browser audio is captured via MediaRecorder and streamed over WebSocket to server
- [x] **VOICE-03**: Server relays audio to Deepgram STT via persistent WebSocket and receives transcripts
- [x] **VOICE-04**: Transcribed text is sent to the AI agent via daemon.addToInbox()
- [x] **VOICE-05**: AI response text is streamed to Cartesia TTS via WebSocket and audio is relayed back to browser
- [x] **VOICE-06**: Browser plays TTS audio in real-time via AudioContext/AudioWorklet
- [x] **VOICE-07**: End-to-end voice latency (mic → STT → AI → TTS → speaker) targets p95 < 1200ms
- [x] **VOICE-08**: Deepgram and Cartesia API keys are configured via web UI Settings page
- [x] **VOICE-09**: Voice sessions maintain connection state with keep-alive and exponential reconnect backoff
- [x] **VOICE-10**: Full latency pipeline is instrumented with timestamps at each stage

### Live Canvas

- [x] **CANVAS-01**: AI agent can render interactive HTML/React/charts via `canvas_render` MCP tool
- [x] **CANVAS-02**: Canvas panel appears as split-pane in AI chat route when first artifact is rendered
- [x] **CANVAS-03**: Canvas content is displayed in sandboxed iframe (`sandbox="allow-scripts allow-popups"`, never `allow-same-origin`)
- [x] **CANVAS-04**: iframe loads React 18, Babel standalone, and Tailwind CSS from CDN
- [x] **CANVAS-05**: AI can update existing canvas content via `canvas_update` MCP tool
- [x] **CANVAS-06**: Parent-iframe communication uses typed postMessage protocol with origin validation
- [x] **CANVAS-07**: Supported artifact types: React components, HTML/CSS/JS, Mermaid diagrams, SVG, Recharts charts
- [x] **CANVAS-08**: Error boundary inside iframe posts errors to parent for display

### LivHub Skills Registry

- [x] **HUB-01**: LivHub marketplace UI shows available skills with name, description, version, and required permissions
- [x] **HUB-02**: Skills can be installed from LivHub with permission review before installation
- [x] **HUB-03**: Skills can be uninstalled and immediately removed from agent's available tools
- [x] **HUB-04**: LivHub supports multiple Git-based registries (not just one source)
- [x] **HUB-05**: Skill catalog is cached with configurable TTL and manual refresh

### Onboarding CLI

- [x] **CLI-01**: `npx livinity onboard` runs guided interactive setup on a fresh Ubuntu 22.04+ server
- [x] **CLI-02**: CLI checks system prerequisites (Docker, Node.js ≥22, Redis, PostgreSQL, disk ≥10GB, RAM ≥4GB)
- [x] **CLI-03**: CLI prompts for domain, SSL (Caddy), Claude Code auth, Telegram/Discord bot tokens
- [x] **CLI-04**: CLI optionally configures voice API keys (Deepgram, Cartesia) and Gmail OAuth
- [x] **CLI-05**: CLI generates secure secrets (JWT, API keys) and writes .env file
- [x] **CLI-06**: CLI sets up PM2 services and verifies all processes are running
- [x] **CLI-07**: `livinity status` shows health of all services
- [x] **CLI-08**: Non-interactive mode: `livinity onboard --config setup.json`
- [x] **CLI-09**: Partial install rollback: cleanup completed steps on failure

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

### Advanced Gmail
- **GMAIL-ADV-01**: Gmail Pub/Sub watch with auto-renewal every 6 days via BullMQ (replaces polling for real-time)

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
| STAB-01 | v2.0 Phase 1 | Complete |
| STAB-02 | v2.0 Phase 1 | Complete |
| STAB-03 | v2.0 Phase 1 | Complete |
| STAB-04 | v2.0 Phase 1 | Complete |
| STAB-05 | v2.0 Phase 1 | Complete |
| STAB-06 | v2.0 Phase 1 | Complete |
| STAB-07 | v2.0 Phase 1 | Complete |
| DM-01 | v2.0 Phase 1 | Complete |
| DM-02 | v2.0 Phase 1 | Complete |
| DM-03 | v2.0 Phase 1 | Complete |
| DM-04 | v2.0 Phase 1 | Complete |
| DM-05 | v2.0 Phase 1 | Complete |
| DM-06 | v2.0 Phase 1 | Complete |
| CMD-01 | v2.0 Phase 1 | Complete |
| CMD-02 | v2.0 Phase 1 | Complete |
| CMD-03 | v2.0 Phase 1 | Complete |
| CMD-04 | v2.0 Phase 1 | Complete |
| CMD-05 | v2.0 Phase 1 | Complete |
| CMD-06 | v2.0 Phase 1 | Complete |
| USAGE-01 | v2.0 Phase 1 | Complete |
| USAGE-02 | v2.0 Phase 1 | Complete |
| USAGE-03 | v2.0 Phase 1 | Complete |
| USAGE-04 | v2.0 Phase 1 | Complete |
| USAGE-05 | v2.0 Phase 1 | Complete |
| USAGE-06 | v2.0 Phase 1 | Complete |
| HOOK-01 | v2.0 Phase 2 | Complete |
| HOOK-02 | v2.0 Phase 2 | Complete |
| HOOK-03 | v2.0 Phase 2 | Complete |
| HOOK-04 | v2.0 Phase 2 | Complete |
| HOOK-05 | v2.0 Phase 2 | Complete |
| HOOK-06 | v2.0 Phase 2 | Complete |
| GMAIL-01 | v2.0 Phase 2 | Complete |
| GMAIL-02 | v2.0 Phase 2 | Complete |
| GMAIL-03 | Deferred v2.1 | Deferred |
| GMAIL-04 | v2.0 Phase 2 | Complete |
| GMAIL-05 | v2.0 Phase 2 | Complete |
| GMAIL-06 | v2.0 Phase 2 | Complete |
| GMAIL-07 | v2.0 Phase 2 | Complete |
| COMP-01 | v2.0 Phase 3 | Complete |
| COMP-02 | v2.0 Phase 3 | Complete |
| COMP-03 | v2.0 Phase 3 | Complete |
| COMP-04 | v2.0 Phase 3 | Complete |
| COMP-05 | v2.0 Phase 3 | Complete |
| COMP-06 | v2.0 Phase 3 | Complete |
| MULTI-01 | v2.0 Phase 3 | Complete |
| MULTI-02 | v2.0 Phase 3 | Complete |
| MULTI-03 | v2.0 Phase 3 | Complete |
| MULTI-04 | v2.0 Phase 3 | Complete |
| MULTI-05 | v2.0 Phase 3 | Complete |
| MULTI-06 | v2.0 Phase 3 | Complete |
| MULTI-07 | v2.0 Phase 3 | Complete |
| VOICE-01 | v2.0 Phase 4 | Complete |
| VOICE-02 | v2.0 Phase 4 | Complete |
| VOICE-03 | v2.0 Phase 4 | Complete |
| VOICE-04 | v2.0 Phase 4 | Complete |
| VOICE-05 | v2.0 Phase 4 | Complete |
| VOICE-06 | v2.0 Phase 4 | Complete |
| VOICE-07 | v2.0 Phase 4 | Complete |
| VOICE-08 | v2.0 Phase 4 | Complete |
| VOICE-09 | v2.0 Phase 4 | Complete |
| VOICE-10 | v2.0 Phase 4 | Complete |
| CANVAS-01 | v2.0 Phase 5 | Complete |
| CANVAS-02 | v2.0 Phase 5 | Complete |
| CANVAS-03 | v2.0 Phase 5 | Complete |
| CANVAS-04 | v2.0 Phase 5 | Complete |
| CANVAS-05 | v2.0 Phase 5 | Complete |
| CANVAS-06 | v2.0 Phase 5 | Complete |
| CANVAS-07 | v2.0 Phase 5 | Complete |
| CANVAS-08 | v2.0 Phase 5 | Complete |
| HUB-01 | v2.0 Phase 5 | Complete |
| HUB-02 | v2.0 Phase 5 | Complete |
| HUB-03 | v2.0 Phase 5 | Complete |
| HUB-04 | v2.0 Phase 5 | Complete |
| HUB-05 | v2.0 Phase 5 | Complete |
| CLI-01 | v2.0 Phase 6 | Complete |
| CLI-02 | v2.0 Phase 6 | Complete |
| CLI-03 | v2.0 Phase 6 | Complete |
| CLI-04 | v2.0 Phase 6 | Complete |
| CLI-05 | v2.0 Phase 6 | Complete |
| CLI-06 | v2.0 Phase 6 | Complete |
| CLI-07 | v2.0 Phase 6 | Complete |
| CLI-08 | v2.0 Phase 6 | Complete |
| CLI-09 | v2.0 Phase 6 | Complete |

**Coverage:**
- v2.0 requirements: 83 total
- Mapped to phases: 83
- Unmapped: 0

---
*Requirements defined: 2026-02-20*
*Last updated: 2026-02-20 — roadmap created, traceability updated with v2.0 phase prefix*
