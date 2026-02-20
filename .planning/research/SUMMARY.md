# Project Research Summary

**Project:** LivOS v2.0 — OpenClaw-Class AI Platform
**Domain:** Self-hosted AI home server OS with voice, multi-agent, and automation capabilities
**Researched:** 2026-02-20
**Confidence:** HIGH (stack and architecture verified via direct codebase analysis; pitfalls verified against official docs and live GitHub issues)

---

## Executive Summary

LivOS v2.0 is a significant feature expansion of an already-functional self-hosted AI platform. The milestone adds voice interaction (Cartesia TTS + Deepgram STT), a live canvas for AI-generated artifacts, multi-agent session orchestration, Gmail integration, webhooks, DM security pairing, session compaction, usage tracking, an onboarding CLI, and stability hardening. Research across all four dimensions confirms the existing architecture — Daemon inbox pattern, SdkAgentRunner with MCP tools, ChannelManager provider abstraction, Redis state layer, Express API — provides clean integration seams for every v2.0 feature. No architectural rewrites are required. Most features are either new MCP tools, new Express routes, new channel providers, or new UI components. Voice is the only feature requiring a genuinely novel component pattern (bidirectional WebSocket audio relay), and even it calls `daemon.addToInbox()` as its final step, making it "just another source" in the existing processing pipeline.

The recommended implementation strategy is to front-load stability and security work before adding high-complexity features. The nexus-core process currently restarts approximately 3.3 times per hour (153 restarts in 47 hours per project data), which would cause catastrophic degradation if voice WebSockets, multi-agent sub-processes, or canvas rendering are added before root causes are fixed. DM pairing is a critical security gap: without it, anyone who discovers the bot token can run commands on the server. These two concerns define Phase 1 — stabilize and secure before expanding. The subsequent phase order is driven by dependency chains: webhooks must precede Gmail (Pub/Sub pushes to webhook infrastructure), compaction should precede multi-agent (sub-agents burn tokens faster), and voice and canvas should come last because they carry the highest integration risk but are independent of all other features.

The principal risk to the entire v2.0 effort is scope without sequencing. Voice alone has four distinct CRITICAL-rated failure modes: latency stacking, STT credit burn, browser autoplay policy blocking audio output, and WebSocket connection churn. Canvas has an iframe XSS trap that, if misconfigured, undermines the security of the entire application. Multi-agent has a recursive deadlock trap that can exhaust the Claude Code subscription window in minutes. None of these risks are exotic — all are well-documented and all have clear prevention patterns detailed in the research. The roadmap must keep voice, canvas, and multi-agent in separate phases so problems in one do not block the others.

---

## Key Findings

### Recommended Stack

The existing stack requires minimal additions. Only four new npm packages are needed for core v2.0 functionality: `@cartesia/cartesia-js@^2.2.9` and `@deepgram/sdk@^4.11.3` for voice, `googleapis@^144.0.0` for Gmail OAuth and API calls, and `@google-cloud/pubsub@^4.8.0` for Gmail push notifications. The onboarding CLI is a new package (`nexus/packages/cli`) adding `commander@^13.1.0` and `@clack/prompts@^1.0.1`. The frontend requires zero new npm dependencies — voice uses browser-native `MediaRecorder` and `AudioContext`; canvas uses native `<iframe sandbox srcdoc>` with CDN-loaded React and Tailwind inside the sandbox.

Two important constraints discovered in research: (1) LivOS uses Claude Code Auth (subscription mode) via `SdkAgentRunner`, not direct Anthropic API keys. This means the native Compaction API (`compact-2026-01-12` beta header) cannot be used — session compaction must be implemented as a `SessionManager` method and MCP tool. (2) A2UI (Google's declarative agent UI protocol) is at v0.8 public preview with v0.9 already introducing breaking changes. It should not be adopted until v1.0 stabilizes. Live Canvas must use the proven `srcdoc` iframe approach.

**Core technologies:**
- `@cartesia/cartesia-js` v2.2.9: TTS via persistent WebSocket — sub-100ms TTFB, Sonic-3 model, `context_id` maintains prosody across streaming text chunks
- `@deepgram/sdk` v4.11.3: STT via WebSocket — Nova-3 model, interim results, VAD events, 50+ languages, $200 free credit
- `googleapis` v144+: Gmail API + OAuth2 — official Google client, handles token refresh, widely used
- `@google-cloud/pubsub` v4.8.0: Gmail push notifications — or polling fallback (simpler, no GCP dependency; recommended for self-hosted)
- `commander` v13.1.0 + `@clack/prompts` v1.0.1: Onboarding CLI — clack chosen over Inquirer for modern UX, less boilerplate
- `<iframe sandbox="allow-scripts" srcdoc>`: Canvas rendering — zero new dependencies, browser-native isolation, proven by Claude.ai Artifacts pattern

**What NOT to add:**
- `@anthropic-ai/sdk` direct API access: conflicts with subscription auth model; would require bypassing SdkAgentRunner
- Sandpack / CodeSandbox: too heavy (5MB+); native iframe is sufficient and zero-dependency
- tldraw: whiteboard framework, wrong tool for AI artifact rendering
- Whisper or Piper (local STT/TTS): quality gap vs cloud APIs, GPU requirement, 500ms+ latency vs 40ms Cartesia
- LangChain / LangGraph / CrewAI: conflicts with existing Daemon + SdkAgentRunner orchestration pattern
- WebRTC for voice: WebSocket is sufficient for single-user self-hosted; WebRTC adds STUN/TURN complexity with no benefit
- A2UI v0.8/v0.9: pre-stable spec, v0.9 already has breaking changes; migration cost high when v1.0 lands

---

### Expected Features

Research benchmarked v2.0 against OpenClaw (the reference AI platform) and identified a clear two-tier feature structure.

**Must have (table stakes — missing makes product feel incomplete vs. OpenClaw):**
- DM Pairing / Activation Code Security — critical security gap; without it anyone who discovers the bot token controls the server
- Chat Commands `/new`, `/compact`, `/usage`, `/activation` — completes the command set; `/help`, `/think`, `/reset`, `/status` already exist
- Session Compaction — without it, long conversations exhaust context windows and waste subscription rolling window budget
- Usage Tracking — visibility into token consumption, turn counts, session costs; needed to detect and prevent rolling window exhaustion
- Webhook Triggers — enables automation use cases; without webhooks the agent can only respond to direct messages

**Should have (differentiators that set LivOS apart):**
- Voice Mode (push-to-talk first, VAD later) — browser-based voice without app installation; OpenClaw requires native desktop app
- Live Canvas (simplified artifacts via iframe srcdoc) — transforms chat from text terminal to dynamic workspace
- Multi-Agent Sessions (`sessions_list`, `sessions_send`, sub-agent spawning) — structured coordination beyond basic parallel task execution
- Gmail Integration (OAuth + Pub/Sub + MCP tools) — killer feature for personal AI assistant; few self-hosted alternatives do this well
- Onboarding CLI (`livinity onboard`) — reduces "time to first chat" from hours to minutes

**Defer to v2.1+:**
- A2UI protocol (spec pre-stable, v1.0 not released)
- Always-listening wake word detection (constant mic, privacy concern, on-device ML model — massive scope for marginal value)
- Native desktop or mobile apps for voice (PWA + WebSocket from browser is sufficient; eliminates distribution burden)
- Real-time voice for Telegram or Discord channels (bot APIs not designed for AI voice; web UI is the right surface)
- Voice mode supporting multiple simultaneous users (single-user self-hosted context in v2.0)

---

### Architecture Approach

Architecture research (based on direct reading of 10+ production source files) confirms that v2.0 is purely additive. The Daemon with inbox pattern is the central integration seam: `daemon.addToInbox()` is called by every message source and `processInboxItem()` routes to commands, skills, or agent. Voice becomes "just another source" after STT transcription. Gmail becomes a new `ChannelProvider` implementing the same interface as Telegram and Discord. Webhooks extend the existing `/api/webhook/git` route pattern already present in `api.ts`. Multi-agent sessions are new MCP tools plus Redis schema. Session compaction is a new `SessionManager.compactSession()` method with an auto-trigger hook in `processInboxItem`.

**Major components and integration points:**
1. **VoiceGateway** (`nexus/packages/core/src/voice-gateway.ts`) — NEW. Binary WebSocket on `/ws/voice`. Manages `DeepgramRelay` (STT), `CartesiaRelay` (TTS), and `VoiceSession` lifecycle. Calls `daemon.addToInbox()` on final transcript. Must run inside nexus-core process (not a separate container) to avoid inter-process latency hops on the VPS.
2. **GmailProvider** (`nexus/packages/core/src/channels/gmail.ts`) — NEW. Implements `ChannelProvider` interface identically to `TelegramProvider`. Manages OAuth tokens, Gmail watch renewal (BullMQ repeatable job every 6 days), Pub/Sub notifications, and email-to-IncomingMessage conversion.
3. **Canvas Tool + Panel** — NEW `canvas_render` MCP tool stores artifact HTML in Redis keyed by conversation ID; NEW `CanvasPanel` React component in ai-chat route renders it in `<iframe sandbox="allow-scripts" srcdoc>`. Panel is hidden until `canvas_render` is first called.
4. **Session MCP Tools** — NEW `sessions_list`, `sessions_create`, `sessions_send`, `sessions_history` registered in `daemon.ts` `registerTools()`. Pure Redis reads/writes; no new infrastructure.
5. **Extended `commands.ts`** — EXTENDED switch cases for `/compact`, `/usage`, `/activation`, `/pair`. Trivial additions to the existing pattern.
6. **Extended `SessionManager`** — EXTENDED with `compactSession()` using Brain to summarize old history, plus auto-trigger at 100k token threshold in daemon.
7. **Stability Hardening** — `process.on('unhandledRejection')` global handlers, replace `setTimeout`-based crons with BullMQ repeatable jobs, Redis circuit breaker, PM2 `max_memory_restart` config.

---

### Critical Pitfalls

Research identified 24 domain-specific and 4 integration-specific pitfalls. The top 5 that can cause rewrites or sustained outages:

1. **P-07 — Process instability (153 PM2 restarts in 47 hours):** The existing crash rate must be reduced before adding voice WebSockets, canvas rendering, or multi-agent sub-processes. Each new feature multiplies the blast radius of each restart — voice calls will drop mid-sentence, multi-agent sessions will lose progress. Prevention: add `process.on('unhandledRejection')` global handler, replace `setTimeout`-based crons with BullMQ repeatable jobs, add Redis circuit breaker, set PM2 `max_memory_restart`. Must be done before any other Phase 1 work.

2. **P-01 — Voice pipeline latency stacking:** STT (150-300ms) + LLM (500-2000ms) + TTS (40-150ms) + network round-trips compound to 800ms-2800ms total. At the high end, conversations feel unnatural and users talk over the AI. Prevention: stream everything end-to-end (never wait for a complete LLM response before starting TTS), use Cartesia `context_id` continuations for prosody across streamed text chunks, instrument the full pipeline with timestamps from day one, target p95 < 1200ms end-to-end.

3. **P-05 — iframe sandbox XSS trap:** `sandbox="allow-scripts"` is safe; adding `allow-same-origin` to the same sandbox effectively eliminates security (the iframe can remove its own sandbox attribute via the parent DOM). This combination is explicitly warned against in the HTML spec. Prevention: use `srcdoc` attribute (null origin), `sandbox="allow-scripts allow-popups"` only, never add `allow-same-origin`. Verify via security scan before any canvas code ships.

4. **P-06 — Multi-agent recursive deadlock and token explosion:** Two agents can create circular dependencies and self-reinforcing reasoning loops that exhaust the Claude Code subscription window in minutes. Token costs multiply: 2 agents produce roughly 3-4x the tokens of 1 agent (not 2x), because of coordination overhead. Prevention: strict DAG topology (no agent delegates back to its parent), per-agent turn limits (5-8 max), session-level token budget hard stop (50k tokens for the entire multi-agent session), maximum 2 concurrent agents on the VPS.

5. **P-11/P-12 — Gmail OAuth token expiry + watch expiration silent failures:** Google OAuth refresh tokens silently expire (password reset, 6-month inactivity, "Testing" consent screen status). Gmail watch expires after exactly 7 days with zero warning from Google. Prevention: BullMQ repeatable job to renew watch every 6 days, proactive access token refresh every 30 minutes, immediate alert via Telegram/Discord on `invalid_grant` error, graceful degradation when authentication fails (stop queuing email tasks, do not allow Pub/Sub notifications to pile up as failed jobs).

---

## Implications for Roadmap

Based on combined research across all four dimensions, the following phase structure is recommended. It is intentionally opinionated: stability and security must come first, then automation infrastructure, then intelligence enhancements, then high-complexity user-facing differentiators.

---

### Phase 1: Stability and Security Foundation

**Rationale:** The 153-restart problem (P-07) and Redis cascade risk (P-20) are blocking conditions for every subsequent phase, not optional fixes. Voice calls drop mid-sentence on each restart. Multi-agent sessions lose all progress. Adding features to an unstable base multiplies technical debt exponentially. DM pairing (TS-02) is a critical security gap that must be closed before the user base grows. Chat commands and usage tracking are low-risk, high-utility completions that require no new infrastructure.

**Delivers:**
- Stable nexus-core process: `unhandledRejection` and `uncaughtException` global handlers, BullMQ repeatable jobs replacing `setTimeout`-based crons, Redis circuit breaker, PM2 `max_memory_restart`, Grammy polling offset persisted to Redis
- DM pairing/activation code security for Telegram and Discord (6-digit code, 1-hour TTL, admin-only approval, Redis allowlist)
- Chat commands: `/new`, `/usage` (full), `/activation`, `/compact` (stub wiring only)
- Usage tracking: Redis counters per user/day, `/usage` command, PostgreSQL daily aggregate table

**Features addressed:** TS-01, TS-02, TS-04 (infrastructure)
**Pitfalls mitigated:** P-07, P-09 (turn limits stub), P-15, P-16, P-19, P-20
**Research flag:** Standard patterns — skip research-phase. All fixes are codebase-specific and already analyzed. DM pairing is directly adapted from OpenClaw's documented model (HIGH confidence).

---

### Phase 2: Automation Infrastructure (Webhooks + Gmail)

**Rationale:** Webhooks are the dependency that unlocks Gmail — Gmail Pub/Sub pushes notifications to the webhook endpoint infrastructure. Both are additive Express route extensions of the existing `/api/webhook/git` pattern. Webhook security (HMAC signature verification, BullMQ job deduplication, rate limiting) must be implemented correctly before any webhook endpoint goes live — P-10 is HIGH severity and the existing Git webhook has no authentication. Gmail is more complex, requiring OAuth flow, GmailProvider implementation, watch renewal, and MCP tool registration, but builds cleanly on the webhook infrastructure from the same phase.

**Delivers:**
- Generic webhook receiver (`POST /api/webhooks/:hookId`) with HMAC-SHA256 signature verification and timing-safe comparison
- BullMQ job deduplication using delivery ID as job ID (eliminates retry storm duplicates)
- Rate limiting per webhook source (30 req/min), payload size limit (1MB)
- Webhook CRUD via MCP tools (`webhook_create`, `webhook_list`, `webhook_delete`) and Settings UI
- Gmail OAuth flow and Settings panel (Google Cloud project credentials, consent screen)
- `GmailProvider` implementing `ChannelProvider` interface (push notifications, watch renewal, email-to-message)
- Gmail MCP tools: `gmail_read`, `gmail_reply`, `gmail_send`, `gmail_search`, `gmail_archive`
- BullMQ repeatable job for Gmail watch renewal every 6 days

**Features addressed:** TS-05, DF-04
**Pitfalls mitigated:** P-10, P-11, P-12
**Stack additions:** `googleapis@^144.0.0`, `@google-cloud/pubsub@^4.8.0` (polling fallback as default)
**Research flag:** Execution review recommended before Gmail sub-phase. OAuth self-hosted flow for Google Cloud projects has documented edge cases (P-11). Implement polling mode first, add Pub/Sub as advanced option for users who want instant notifications.

---

### Phase 3: Intelligence Enhancements (Compaction + Multi-Agent)

**Rationale:** Session compaction is infrastructure that all higher-complexity features depend on — multi-agent sessions burn tokens 3-4x faster than single-agent sessions and hit context limits rapidly without compaction. Compaction must be fully implemented before multi-agent ships. Multi-agent starts minimal: maximum 2 concurrent agents, DAG topology enforced, per-agent turn limits — because of the deadlock and token explosion risks (P-06).

**Delivers:**
- `SessionManager.compactSession()` with tiered strategy: keep last 10 messages verbatim, summarize older messages using Brain (haiku model for cost), pin critical facts (file paths, error codes, user preferences) as a separate section that is never compacted
- Auto-compact trigger in daemon at 100k token threshold
- `/compact` command fully implemented (previously a stub from Phase 1)
- Multi-agent MCP tools: `sessions_list`, `sessions_create`, `sessions_send`, `sessions_history`
- Sub-agent spawning via BullMQ with max-depth-1 enforcement, 5-8 turn limit per sub-agent, 50k token session budget
- Session token budget tracking (extends usage tracking from Phase 1)

**Features addressed:** TS-03, DF-03
**Pitfalls mitigated:** P-06, P-08 (tool leak), P-13, P-14
**Research flag:** Research-phase review recommended before planning. SDK token visibility in subscription mode is MEDIUM confidence (P-14) — verify whether `SdkAgentRunner` result objects expose per-request token counts before committing to the usage schema. Multi-agent deadlock topology requires deliberate design review.

---

### Phase 4: Voice Pipeline

**Rationale:** Voice is the most complex feature in v2.0, with four CRITICAL-rated pitfalls, all specific to the voice phase. It is deliberately isolated as its own phase so problems here do not block canvas or other features. By Phase 4, nexus-core is stable (Phase 1), BullMQ infrastructure is mature, and voice has no dependencies on compaction, multi-agent, or Gmail.

**Delivers:**
- `VoiceGateway` WebSocket server on `/ws/voice` (binary frame support)
- `DeepgramRelay` class: persistent Deepgram WebSocket, keep-alive every 5s, exponential reconnect backoff, connection state machine
- `CartesiaRelay` class: single Cartesia WebSocket reused across utterances (one `context_id` per utterance for prosody), reconnect logic
- `VoiceSession` lifecycle: ties one browser WebSocket to one Deepgram connection and one Cartesia connection
- Push-to-talk UI component in ai-chat route (`MediaRecorder` at 48kHz → downsampled to 16kHz PCM for Deepgram; `AudioContext` + `AudioWorkletNode` for 24kHz PCM playback from Cartesia)
- Voice configuration in Redis: `deepgram_api_key`, `cartesia_api_key`, `voice_id`, `voice_enabled`
- End-to-end latency instrumentation: timestamp at mic start, Deepgram transcript, LLM first chunk, TTS first audio, browser playback; target p95 < 1200ms

**Features addressed:** DF-01
**Pitfalls mitigated:** P-01, P-02, P-03, P-04, P-21
**Stack additions:** `@cartesia/cartesia-js@^2.2.9`, `@deepgram/sdk@^4.11.3` (nexus/packages/core)
**Research flag:** Research-phase review recommended before planning. Deepgram keep-alive protocol details, Cartesia `context_id` and continuation behavior, and AudioWorklet PCM scheduling edge cases all require API reference review before architecture is finalized. Plan for a latency measurement/tuning sprint within the phase.

---

### Phase 5: Live Canvas

**Rationale:** Canvas is placed after voice because it is independent of voice but shares the "high-risk UI feature" profile. Isolating them in separate phases means voice issues do not delay canvas delivery. Canvas is architecturally simpler than voice (no external APIs, no WebSocket management, zero new npm dependencies) but the iframe XSS trap (P-05) requires security architecture decisions before any rendering code is written.

**Delivers:**
- `canvas_render` and `canvas_update` MCP tools (store artifact HTML/code in Redis keyed by `nexus:canvas:{conversationId}`)
- `CanvasPanel` React component: split-pane layout in ai-chat route, hidden until first `canvas_render` call, draggable divider
- Sandboxed iframe renderer: `sandbox="allow-scripts allow-popups"` on `srcdoc` content (null origin, never `allow-same-origin`)
- CDN template injected into `srcdoc`: React 18 standalone, Babel standalone (for JSX), Tailwind CSS CDN, Recharts/Mermaid loaded on demand
- `postMessage` typed protocol between parent and iframe (versioned `CanvasMessage` union type, origin validation)
- Error boundary inside iframe that posts errors to parent instead of silently failing
- tRPC endpoints: `ai.getCanvasContent`, `ai.clearCanvas`
- Artifact type support: React components, HTML/CSS/JS, Mermaid diagrams, SVG, Chart.js/Recharts charts

**Features addressed:** DF-02
**Pitfalls mitigated:** P-05, P-18
**Stack additions:** None (browser-native)
**Research flag:** Standard patterns — skip research-phase. iframe sandbox security is well-documented, proven by Claude.ai Artifacts and LibreChat. Main risk is implementation discipline (never adding `allow-same-origin`), not research gaps.

---

### Phase 6: Onboarding CLI

**Rationale:** The onboarding CLI is fully independent of all other features but must be built last — when all v2.0 features are stable and their configuration requirements are final. A CLI built before the feature set is complete requires constant updates. By Phase 6, the installer can wire up voice API keys, Gmail OAuth credentials, webhook secrets, and DM pairing in a single guided flow with full knowledge of what each step entails.

**Delivers:**
- New `nexus/packages/cli` npm package (`livinity` binary)
- `livinity onboard` guided interactive setup: system prerequisite checks (Docker, Node, Redis, PostgreSQL, disk ≥10GB, RAM ≥4GB), domain + SSL (Caddy), Claude Code authentication, Telegram/Discord channel setup, optional voice configuration, optional Gmail setup guide, service startup and health verification
- `livinity status` command (health check all services)
- `livinity restart` command (PM2 restart wrapper)
- Non-interactive mode: `livinity onboard --non-interactive --config setup.json`
- Partial install rollback: cleanup stack that undoes completed steps on failure
- Target scope: Ubuntu 22.04+, Debian 12+; Docker-first approach for other distributions

**Features addressed:** DF-05
**Pitfalls mitigated:** P-17
**Stack additions:** `commander@^13.1.0`, `@clack/prompts@^1.0.1` (new package only)
**Research flag:** Standard patterns — CLI frameworks are well-understood. Main complexity is Linux distribution detection and partial install rollback (P-17).

---

### Phase Ordering Rationale

The ordering is driven by three principles from combined research:

1. **Dependency chain enforcement:** Stability precedes everything (P-07). Webhooks precede Gmail (Pub/Sub uses webhook endpoint). Compaction precedes multi-agent (sub-agents exhaust tokens without it). CLI must be last (needs complete, stable feature set to wire up correctly).

2. **Risk isolation:** Voice and Canvas are high-risk, high-reward features that are independent of each other and the automation stack. Placing each in its own phase means a problem in voice does not delay canvas delivery, and neither delays the automation features.

3. **Quick wins first:** Phase 1 delivers visible, testable improvements — a stable system, closed security gap, extended commands, usage visibility — within the first iteration. This builds confidence and provides a stable foundation before tackling high-complexity features.

---

### Research Flags

**Phases needing research-phase review during planning:**
- **Phase 3 (Compaction + Multi-Agent):** SDK token visibility in subscription mode is MEDIUM confidence (P-14). Verify `SdkAgentRunner` result metadata against actual SDK response objects before designing usage schema. Multi-agent deadlock topology requires deliberate design review before implementation tasks are written.
- **Phase 4 (Voice):** Deepgram keep-alive protocol, Cartesia `context_id` continuation behavior, and AudioWorklet PCM scheduling all have edge cases requiring API reference review. Plan explicit latency measurement sprint.

**Phases with standard patterns (research complete, skip research-phase):**
- **Phase 1 (Stability + Security):** Fixes are codebase-specific; research is done. DM pairing is directly adapted from OpenClaw's documented model (HIGH confidence).
- **Phase 2 (Webhooks + Gmail):** HMAC webhook pattern is industry standard. Gmail API is comprehensively documented. Main risk is execution (OAuth edge cases), not research gaps.
- **Phase 5 (Canvas):** iframe sandbox security pattern is proven by Claude.ai Artifacts and LibreChat. Security properties are well-documented in the HTML spec.
- **Phase 6 (CLI):** Commander + clack patterns are straightforward. Linux detection patterns are well-understood.

---

## Technology Decisions Table

| Decision | Choice | Alternative Considered | Rationale |
|----------|--------|----------------------|-----------|
| TTS service | Cartesia Sonic-3 | Piper (local), ElevenLabs, AWS Polly | Sub-100ms TTFB, WebSocket streaming, `context_id` prosody continuity across chunks. Local TTS quality gap is significant for conversational use. |
| STT service | Deepgram Nova-3 | Whisper (local), AssemblyAI, Google STT | Best streaming accuracy, VAD events built-in, $200 free tier generous for personal use. Local Whisper requires GPU; batch mode adds 500ms+. |
| Canvas rendering | `<iframe sandbox srcdoc>` | Sandpack, tldraw, A2UI | Zero new dependencies, browser-native, proven security model. A2UI spec pre-stable (v0.8 with breaking v0.9). Sandpack is 5MB+ overkill. |
| CLI framework | Commander + @clack/prompts | Oclif, Inquirer, Ink | clack is modern-looking and minimal (released 7 days ago, v1.0.1). Oclif is enterprise overkill. Inquirer is dated-looking with more boilerplate. |
| Gmail notifications | Polling default, Pub/Sub advanced | IMAP IDLE | Polling is simpler for self-hosted (no GCP dependency). Pub/Sub is faster but requires Google Cloud project setup. Offer both. |
| Session compaction | `SessionManager` method + MCP tool | Native Compaction API | Native API requires raw Anthropic API; LivOS uses Claude Code subscription SDK. Manual compaction via Brain call is reliable fallback. |
| Multi-agent topology | DAG with orchestrator pattern | Peer-to-peer mesh | Prevents circular deadlocks. Simpler to reason about. Matches OpenClaw's documented architecture for sub-agent isolation. |
| Voice transport | WebSocket (new `/ws/voice` endpoint) | WebRTC | WebSocket is sufficient for single-user. No STUN/TURN infrastructure needed. Binary frame support in `ws` library is already available. |
| Voice gateway location | Inside nexus-core process | Separate `nexus-voice` PM2 process | Latency-critical path: direct `daemon.addToInbox()` call eliminates inter-process hop. Single-user VPS doesn't need process isolation. |
| Usage storage | Redis counters (real-time) + PostgreSQL (history) | Redis only | Redis for fast per-request increments. PostgreSQL for daily aggregates, long-term dashboards, and data that survives Redis flush. |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via official npm registries, API documentation, and existing codebase. Minor gap: Cartesia docs page didn't fully render; WebSocket format verified via third-party references. |
| Features | HIGH | OpenClaw documentation verified directly for slash commands, DM pairing model, and session tools. A2UI research is HIGH but decision to defer is a judgment call based on spec maturity. |
| Architecture | HIGH | Based on direct reading of 10+ production source files including `daemon.ts`, `sdk-agent-runner.ts`, `channels/types.ts`, `session-manager.ts`, `commands.ts`, `api.ts`. Integration points verified by reading actual function signatures. |
| Pitfalls | HIGH | Voice/canvas/webhook/Gmail pitfalls verified against official documentation, GitHub issues, and community reports. One MEDIUM: SDK token visibility in subscription mode (P-14) requires live verification. |

**Overall confidence:** HIGH

---

### Gaps to Address

- **SDK token visibility (P-14, MEDIUM confidence):** The exact fields available in `SdkAgentRunner` result objects when using Claude Code subscription mode may not include per-request token counts. Before finalizing the usage tracking and compaction schemas in Phase 3, inspect actual SDK result objects in the development environment. Fallback options: estimate tokens from text length using tiktoken; or track turns and total characters as proxy metrics for budget enforcement.

- **Cartesia `context_id` continuation behavior (MEDIUM confidence):** The Cartesia docs page did not fully render during research. The `context_id` feature for prosody continuity across streaming text chunks is documented in secondary sources. During Phase 4 planning, verify `context_id` and continuation behavior with a direct API call test before designing the `CartesiaRelay` architecture. Also verify the `max_buffer_delay_ms` parameter default (3000ms is too high for real-time conversation — needs lowering to 500-1000ms).

- **Gmail OAuth "Testing" vs. "Published" consent screen:** Google's OAuth consent screen in "Testing" mode expires refresh tokens after 7 days. Self-hosted users who set up their own Google Cloud project will hit this unless they set the consent screen to "Published" (internal). Add explicit instruction during Phase 2 planning: move consent screen status before first production token is issued.

- **nexus-core restart root causes:** The 153-restart count is documented in project context but root causes are partially known (setTimeout cron leak documented in CONCERNS.md, unhandled rejections suspected). Full root cause analysis requires a targeted diagnostic sprint with `pm2 logs nexus-core --err` and `process.memoryUsage()` monitoring. Phase 1 planning should include this diagnostic session before fix tasks are written.

- **A2UI spec trajectory:** The recommendation to defer A2UI is sound for v2.0, but monitor the v1.0 release timeline. If A2UI v1.0 ships before v2.1 planning begins, reassess the canvas architecture — migrating from `srcdoc` iframe to A2UI declarative components may be worthwhile for the security and flexibility benefits at that point.

---

## Sources

### Primary (HIGH confidence)
- Codebase analysis (direct reading): `daemon.ts`, `sdk-agent-runner.ts`, `channels/types.ts`, `channels/index.ts`, `session-manager.ts`, `commands.ts`, `api.ts`, `ws-gateway.ts`, `ai-chat/index.tsx`, `livinityd/modules/ai/index.ts`
- [Deepgram Live Audio API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) — WebSocket STT streaming, events, VAD, keep-alive protocol
- [Deepgram Pricing](https://deepgram.com/pricing) — Nova-3 per-minute rates, $200 free tier
- [Gmail Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push) — Pub/Sub watch setup, historyId, 7-day expiration
- [Gmail Watch API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch) — 7-day renewal requirement confirmed
- [Claude Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction) — beta header, SDK constraints clarified
- [@cartesia/cartesia-js npm](https://www.npmjs.com/package/@cartesia/cartesia-js) — v2.2.9 stable
- [@deepgram/sdk npm](https://www.npmjs.com/package/@deepgram/sdk) — v4.11.3 stable
- [@clack/prompts npm](https://www.npmjs.com/package/@clack/prompts) — v1.0.1, API surface
- [OpenClaw Security Docs](https://docs.openclaw.ai/gateway/security) — DM pairing, allowlist, activation codes, DM policy modes
- [OpenClaw Session Tools](https://docs.openclaw.ai/concepts/session-tool) — `sessions_list`, `sessions_send`, `sessions_history` full API
- [Claude Agent SDK Issue #115](https://github.com/anthropics/claude-agent-sdk-typescript/issues/115) — `allowedTools` bypass confirmed, built-in tools not blocked by `tools: []`
- [MDN Autoplay Guide](https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide) — AudioContext policy, browser restrictions
- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication) — webhook idempotency via job ID
- [Anthropic Context Engineering Guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — compaction strategy, tiered approach
- [Context Rot Research](https://research.trychroma.com/context-rot) — compaction quality degradation benchmarks
- [HackTricks iframe XSS Analysis](https://book.hacktricks.xyz/pentesting-web/xss-cross-site-scripting/iframes-in-xss-and-csp) — `allow-scripts + allow-same-origin` attack vector confirmed

### Secondary (MEDIUM confidence)
- [Cartesia TTS Docs](https://docs.cartesia.ai/api-reference/tts/websocket) — WebSocket format (page didn't fully render; verified via Cartesia JS SDK source and third-party references)
- [Cartesia Pricing](https://cartesia.ai/pricing) — credit tiers (JS-rendered page, verified via community references)
- [LangChain open-canvas](https://github.com/langchain-ai/open-canvas) — artifact rendering patterns and iframe approach validation
- [Google ADK Compaction](https://google.github.io/adk-docs/context/compaction/) — auto-compaction at 80% threshold, tiered strategy
- [Multi-Agent 17x Error Trap](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) — token explosion and coordination overhead analysis
- [Google OAuth invalid_grant Analysis](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked) — refresh token expiry triggers
- [Voice AI Infrastructure Guide 2025](https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025) — end-to-end latency benchmarks
- [Node.js WebSocket Memory Leak Patterns](https://oneuptime.com/blog/post/2026-01-24-websocket-memory-leak-issues/view) — listener accumulation without cleanup

### Tertiary (LOW confidence — needs live verification)
- [Claude Code SDK Cost Tracking](https://platform.claude.com/docs/en/agent-sdk/cost-tracking) — token visibility in subscription mode; must verify against actual SDK response objects
- `googleapis` v144 exact minor version — latest stable on npm but verify with `npm install` before pinning

---

*Research completed: 2026-02-20*
*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
*Ready for roadmap: yes*
