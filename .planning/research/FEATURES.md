# Feature Landscape: LivOS v2.0 -- OpenClaw-Class AI Platform Features

**Domain:** Self-hosted AI home server with voice, multi-agent, and automation capabilities
**Researched:** 2026-02-20
**Overall confidence:** MEDIUM-HIGH

---

## Table Stakes

Features users expect from an OpenClaw-class AI platform. Missing = product feels incomplete compared to OpenClaw.

### TS-01: Chat Commands (/status, /think, /new, /reset, /compact, /usage, /activation)

**Why Expected:** OpenClaw ships with 20+ slash commands. LivOS already has /help, /think, /verbose, /model, /reset, /status, /stats. The gap is /compact, /usage, /new (with model hint), and /activation.
**Complexity:** Low
**Dependencies:** Existing `commands.ts`, `session-manager.ts`, `user-session.ts`
**Confidence:** HIGH (codebase already implements the pattern)

**What each missing command should do:**

| Command | Behavior | Backend State |
|---------|----------|---------------|
| `/new [model]` | Reset session, optionally switch model. Alias for `/reset` with model hint. Text after model hint becomes first message. | Calls `sessionManager.resetSession()` + optional `userSession.setModelTier()` |
| `/compact [instructions]` | Summarize conversation history to reduce token usage. Optional custom instructions for the summarization model. | Requires new compaction logic (see TS-03) |
| `/usage [off\|tokens\|full\|cost]` | Control response footer showing token counts/costs. `/usage cost` prints cumulative session cost summary. | New `usageMode` field in UserSession |
| `/activation [mention\|always]` | Group-only. Controls whether bot responds to all messages or only when @mentioned. | New `activationMode` field per group chat in Redis |

**Implementation notes:**
- The existing `handleCommand()` switch statement in `commands.ts` makes adding new commands trivial -- each is a new case
- grammy (Telegram) and discord.js both receive raw text; the existing `isCommand()` function already detects `/` and `!` prefixed messages
- No special framework support needed -- commands are parsed before messages reach the agent
- OpenClaw also has /stop (abort current operation), /context (show context sizes), /export-session, /elevated (privilege level), /approve (resolve pending approvals), /queue (message queue config). These are lower priority but worth noting.

### TS-02: DM Pairing / Activation Code Security

**Why Expected:** OpenClaw defaults to pairing mode for unknown DM senders. Without this, any random person who discovers the bot token can DM the bot and run commands on your server. This is a critical security gap.
**Complexity:** Medium
**Dependencies:** Existing `channels/telegram.ts`, `channels/discord.ts`, `auth.ts`, Redis
**Confidence:** HIGH (OpenClaw's model is well-documented via official docs)

**How OpenClaw's activation code model works (verified via docs.openclaw.ai/gateway/security):**

1. **Unknown user sends DM** -- Bot generates a 6-digit code, sends it to the user, then ignores the message
2. **Code expires after 1 hour** -- Max 3 pending codes per channel to prevent abuse
3. **Owner approves via CLI or UI** -- `openclaw pairing approve <channel> <code>`
4. **User is added to allowlist** -- Stored in credentials JSON; persists across restarts
5. **Subsequent messages** -- Paired users pass through normally

**DM policy modes (from OpenClaw docs):**

| Mode | Behavior |
|------|----------|
| `pairing` (default) | Unknown senders get a code, ignored until approved |
| `allowlist` | Unknown senders blocked immediately, no code offered |
| `open` | Anyone can DM (requires explicit opt-in with `"*"` allowlist) |
| `disabled` | All DMs ignored |

**For LivOS implementation:**
- Store allowlist in Redis hash: `nexus:dm:allowlist:<channel>` with userId as field
- Store pending codes in Redis with TTL: `nexus:dm:pending:<channel>:<userId>` = `{code, createdAt}`, EX 3600
- Generate codes with `crypto.randomInt(100000, 999999)`
- Approval endpoint: tRPC mutation `channels.approvePairing({channel, code})` or REST endpoint
- Web UI approval: Settings > Integrations > Pending Approvals list with approve/deny buttons
- Per-user session isolation: Add `session.dmScope: "per-channel-peer"` option to prevent cross-user context leakage (OpenClaw supports this)
- Group checks run in order: `groupPolicy`/group allowlists first, mention/reply activation second

### TS-03: Session Compaction

**Why Expected:** Long conversations exhaust context windows. Claude Code SDK subscription mode bills by tokens. Without compaction, sessions become expensive and eventually hit context limits.
**Complexity:** Medium
**Dependencies:** Existing `session-manager.ts`, Claude Code SDK
**Confidence:** HIGH (pattern well-established across OpenCode, Goose, Google ADK)

**How compaction typically works (verified across multiple projects):**

1. **Trigger:** Either manual (`/compact` command) or automatic (when token count hits 80% of context window -- Google ADK default)
2. **Process:** A summarization LLM call condenses the older conversation history into a compact summary
3. **Preservation:** Keep the last N messages verbatim (typically 5-10) plus the summary of everything older
4. **Tool calls:** Replace full tool results with compact representations -- "Tool X called with args Y, returned Z (success)" rather than the full multi-KB output
5. **System prompt:** Always preserved in full (never compacted)

**Recommended approach for LivOS:**

```
Session State:
  - systemPrompt (always full)
  - compactedSummary (null initially, grows with compactions)
  - recentMessages[] (last 8-10 messages in full)
  - totalTokensBefore / totalTokensAfter (tracking savings)
```

**Compaction prompt template:**
```
Summarize the following conversation history, preserving:
- Key decisions made
- Important facts learned
- Current task state and goals
- Tool calls and their outcomes (name, success/failure, key results)
- Any commitments or promises made
Omit: greetings, filler, verbose tool outputs, repeated information.
[optional user instructions from /compact command]
```

**Key considerations:**
- Use a smaller/faster model for compaction (haiku) to minimize cost
- Auto-compact should be configurable: `session.autoCompact: true`, `session.compactThreshold: 0.8`
- The `/compact` command should report token savings: "Compacted: 45,000 -> 3,200 tokens (93% reduction)"
- Store compacted state in Redis alongside the session (update `SessionState` interface)
- Benchmarks show intelligent compaction can deliver 26% improvement in response quality while reducing tokens by 90%+

### TS-04: Usage Tracking and Metrics

**Why Expected:** Claude subscription mode means users need visibility into consumption. OpenClaw shows token counts in `/status` and has `/usage cost` for cost summaries.
**Complexity:** Medium
**Dependencies:** Existing `UserSession.totalTokens`, `SessionState.inputTokens/outputTokens`, Redis, PostgreSQL
**Confidence:** HIGH (existing code already tracks tokens per session)

**What to track:**

| Metric | Granularity | Storage | Notes |
|--------|-------------|---------|-------|
| Input tokens | Per-message | Redis (session) | Already tracked in `SessionState.inputTokens` |
| Output tokens | Per-message | Redis (session) | Already tracked in `SessionState.outputTokens` |
| Turn count | Per-session | Redis (session) | Already tracked in `SessionState.messageCount` |
| Tool call count | Per-session | Redis (session) | New field needed |
| Latency (TTFB) | Per-message | Redis (session) | Time from user message to first agent chunk |
| Cost estimate | Per-session | Redis + PostgreSQL | Calculated from token counts and model pricing |
| Daily aggregates | Per-day | PostgreSQL | Rolled up from session data on cleanup |
| Per-user totals | Per-user | Redis (user session) | Already tracked in `UserSession.totalTokens` |

**Existing infrastructure to build on:**
- `UserSessionManager.recordUsage(jid, tokens)` already increments per-user counts
- `SessionManager.updateSession()` already tracks inputTokens/outputTokens per session
- `SdkAgentRunner` already receives `usage.input_tokens` and `usage.output_tokens` from SDK results

**What is missing:**
- Cost calculation (model pricing table -- note: subscription mode does not have per-token billing, but tracking tokens is still valuable for context window management and usage visibility)
- Daily/monthly aggregation (PostgreSQL table: `usage_daily(date, user_id, input_tokens, output_tokens, turns, tool_calls)`)
- `/usage` command response formatting with the different verbosity levels (off/tokens/full/cost)
- Web UI usage dashboard (charts showing daily token usage, session counts, tool call frequency)

### TS-05: Webhook Triggers

**Why Expected:** Automation is the point of a home server AI. Without webhooks, the agent can only respond to direct messages -- it cannot react to external events like code pushes, email arrivals, or service health changes.
**Complexity:** Medium
**Dependencies:** Existing Express API (`api.ts`), `task-manager.ts` (BullMQ), Redis
**Confidence:** HIGH (standard pattern, well-understood)

**What events should trigger agent tasks:**

| Source | Event | Example Payload |
|--------|-------|-----------------|
| GitHub | push, PR opened, issue created | `{repo, branch, commits[], sender}` |
| Custom HTTP | Any POST to `/api/webhooks/:name` | User-defined JSON body |
| Cron/Schedule | Timer-based | Existing `scheduler.ts` already handles this |
| System | Disk full, service down, backup complete | Internal events from LivOS monitoring |
| Docker | Container health change, OOM | Docker event stream |
| Gmail | New email (via Pub/Sub) | `{emailAddress, historyId}` |

**Authentication for incoming webhooks (HMAC-SHA256 -- industry standard):**

```
1. Each webhook gets a unique secret stored in Redis: nexus:webhook:<name>:secret
2. Sender includes: X-Webhook-Signature: sha256=<hmac(secret, rawBody)>
3. Server computes HMAC over raw body (CRITICAL: use raw bytes, not parsed JSON)
4. Use crypto.timingSafeEqual() for comparison (prevents timing attacks)
5. Include timestamp validation (+/- 5 minutes) to prevent replay attacks
6. Use express.json() with verify callback to capture raw body before parsing
```

**Queueing strategy:**
- Webhook events go directly into BullMQ via existing `TaskManager.submit()`
- Rate limit: Max 10 webhook events per minute per source (configurable)
- Burst handling: BullMQ already has concurrency limits (default 4 concurrent)
- Deduplication: Use event ID or content hash as Redis key with short TTL
- Each webhook has a configurable `taskTemplate` string: "New push to {repo}/{branch} by {sender}: {message}"

**API design:**
```
GET    /api/webhooks                  -- List registered webhooks
POST   /api/webhooks/register         -- Register new webhook {name, secret, taskTemplate, enabled}
DELETE /api/webhooks/:name            -- Unregister webhook
POST   /api/webhooks/receive/:name    -- Incoming webhook endpoint (public, HMAC-verified)
```

---

## Differentiators

Features that set LivOS apart from OpenClaw. Not expected, but add significant competitive value.

### DF-01: Voice Wake / Talk Mode (Cartesia TTS + Deepgram STT)

**Value Proposition:** OpenClaw has voice mode on native desktop apps, but LivOS can deliver voice from the web browser, making it accessible from any device without app installation. Voice transforms the AI from a typing tool into a conversational companion.
**Complexity:** High
**Dependencies:** New WebSocket endpoint, browser MediaStream API, Cartesia API key, Deepgram API key
**Confidence:** MEDIUM (architecture well-understood, but integration complexity is high)

**How the real-time voice pipeline works:**

```
Browser Mic --> [VAD] --> WebSocket --> [Deepgram STT] --> text
                                                          |
                                                    [Claude Agent]
                                                          |
                                              text response stream
                                                          |
                                              [Cartesia TTS] --> audio chunks
                                                          |
                                              WebSocket <-- audio
                                                          |
                                              Browser Speaker <-- [AudioWorklet]
```

**Push-to-talk vs always-listening:**

| Mode | UX | Implementation | Recommended? |
|------|-----|----------------|-------------|
| Push-to-talk | User holds button, speaks, releases | Simple: send audio while button held | YES for v1 |
| Always-listening (VAD) | Hands-free, detects speech automatically | Requires client-side VAD (Silero via @ricky0123/vad) | Defer to later |
| Wake word | "Hey Nexus" triggers listening | Requires on-device wake word model | Out of scope |

**Voice Activity Detection (VAD):**
- For always-listening mode, use **client-side VAD** via `@ricky0123/vad` (runs Silero VAD v5 in browser via ONNX Runtime Web/WASM)
- Client-side VAD is preferred: no wasted bandwidth sending silence, lower latency, privacy (silence never leaves browser)
- Silero VAD produces a number 0-1 indicating speech probability per audio frame
- @ricky0123/vad requires serving ONNX model files and WebAssembly files (from CDN by default, can self-host)

**Latency targets (verified from industry benchmarks):**

| Component | Target | Acceptable | Poor |
|-----------|--------|------------|------|
| VAD detection | <100ms | <200ms | >500ms |
| STT (Deepgram) | <300ms | <500ms | >1s |
| LLM first token | <500ms | <1s | >2s |
| TTS first audio (Cartesia) | <40ms | <100ms | >300ms |
| Total voice-to-voice | <800ms | <1.5s | >2.5s |

Key benchmark: Human turn-taking threshold is approximately 800ms. Responses over 2 seconds feel unnatural. Over 3 seconds, users assume the system has failed.

**Technology choices:**

| Component | Technology | Why |
|-----------|-----------|-----|
| STT | Deepgram Nova-3 (`@deepgram/sdk` v5) | Best accuracy, WebSocket streaming, interim transcripts, endpointing detection |
| TTS | Cartesia Sonic-3 (`@cartesia/cartesia-js` v3) | 40ms time-to-first-audio, WebSocket multiplexing, context_id for prosody continuity |
| VAD | `@ricky0123/vad` (Silero ONNX) | Runs in browser, no server cost, high accuracy, WASM-based |
| Browser audio | AudioWorklet + AudioContext | Low-latency playback, no MediaElement overhead |
| Transport | WebSocket (new `/ws/voice` endpoint) | Bidirectional, low overhead vs HTTP |

**Audio formats:**
- Browser to server: PCM 16-bit, 16kHz mono (Deepgram's preferred input)
- Server to browser: PCM 16-bit, 24kHz mono (Cartesia default output)
- Cartesia supports: container (raw, wav), encoding (pcm_s16le, pcm_f32le, pcm_mulaw, pcm_alaw)
- Cartesia WebSocket uses context_id for multiplexing -- each conversation turn gets a context, maintaining prosody across chunks

**Server-side architecture:**
```
/ws/voice WebSocket handler:
  1. Receive audio chunks from browser
  2. Forward to Deepgram WebSocket (server holds persistent connection)
  3. Receive interim/final transcripts from Deepgram
  4. On final transcript: send to SdkAgentRunner
  5. Stream agent text response to Cartesia WebSocket
  6. Cartesia returns audio chunks
  7. Forward audio chunks to browser via WebSocket
```

**Important: API keys required.** Unlike the Claude Code SDK subscription mode, Cartesia and Deepgram require separate API keys with usage-based billing. These should be stored in Redis: `nexus:config:deepgram_api_key`, `nexus:config:cartesia_api_key`.

### DF-02: Live Canvas (A2UI-Inspired Artifacts)

**Value Proposition:** Instead of the agent returning only text, it can render interactive UI: charts, forms, dashboards, code previews. This transforms the chat from a text terminal into a dynamic workspace.
**Complexity:** Very High (full A2UI), Medium (simplified artifacts)
**Dependencies:** New React component, iframe sandboxing or A2UI renderer, agent convention for canvas output
**Confidence:** MEDIUM (A2UI is v0.8 preview; simpler artifact approach is proven by LibreChat)

**Two approaches -- choose one:**

#### Approach A: Simplified Artifacts (Recommended for v2.0)

Modeled after LibreChat/Claude.ai artifacts. The agent outputs structured code blocks that the UI renders in a sandboxed preview panel.

**How it works:**
1. Agent includes a special artifact marker in its response (e.g., `<artifact type="html" title="Dashboard">...code...</artifact>`)
2. UI detects the artifact block during message rendering
3. Content is rendered in a sandboxed iframe using Sandpack (`@codesandbox/sandpack-react`)
4. User can view, interact with, copy, or download the rendered output

**Content types:**

| Type | Rendering | Complexity |
|------|-----------|------------|
| HTML + CSS + JS | Sandpack iframe | Low |
| SVG diagrams | Inline `<svg>` render | Low |
| Mermaid charts | mermaid.js library render | Low |
| React components | Sandpack with React preset | Medium |
| Charts (Chart.js/D3) | Sandpack iframe with library | Medium |
| Interactive forms | Sandpack iframe with postMessage bridge | High |

**Sandboxing (critical for security):**
- Use Sandpack (`@codesandbox/sandpack-react`) for code rendering
- iframe with `sandbox="allow-scripts"` (no allow-same-origin -- prevents DOM access to parent)
- Content-Security-Policy: `frame-src 'self'` when self-hosting bundler
- LibreChat approach: can self-host CodeSandbox bundler for complete air-gapping
- Communication via `window.postMessage()` only for user interactions back to parent
- No network access from sandbox (prevents data exfiltration)

#### Approach B: A2UI Protocol (Aspirational, v2.1+)

Google's A2UI (December 2025, Apache 2.0 license) is a declarative JSON format where the agent sends component descriptions and the client renders them natively.

**How A2UI works (verified from Google Developers Blog and a2ui.org):**
1. A2UI is a **declarative data format, not executable code** -- this is the key security property
2. Agent sends `surfaceUpdate` messages describing components from a pre-approved catalog
3. Client maintains a catalog of trusted React components mapped to A2UI component names (Card, Button, TextField, Chart, etc.)
4. Client renders the A2UI JSON using its own React components, maintaining full control over styling
5. Agent can send `dataModelUpdate` messages to update data without re-rendering structure
6. Component structure uses a "flat list of components with ID references" -- easy for LLMs to generate incrementally
7. Supports progressive rendering via streaming

**Why defer A2UI to v2.1:**
- A2UI spec is v0.8 (public preview), actively evolving -- v0.9 already introduces breaking changes
- Requires building a complete component catalog and A2UI renderer
- Simplified artifacts deliver 80% of the value with 20% of the complexity
- Can migrate to A2UI later as the spec reaches v1.0

### DF-03: Multi-Agent Sessions

**Value Proposition:** Run specialized agents (coder, researcher, reviewer) that coordinate on complex tasks. Goes beyond basic sub-agent spawning to offer structured inter-session communication.
**Complexity:** High
**Dependencies:** Existing `subagent-manager.ts`, `task-manager.ts`, `session-manager.ts`
**Confidence:** MEDIUM (OpenClaw's session tools are documented; coordination complexity is real)

**OpenClaw's session tool API (verified from docs.openclaw.ai/concepts/session-tool):**

| Tool | Purpose | Key Parameters | Returns |
|------|---------|----------------|---------|
| `sessions_list` | List all sessions with metadata | `kinds?` (main/group/cron/hook/node), `limit?`, `activeMinutes?`, `messageLimit?` | Array of session rows with key, kind, channel, model info, token counts |
| `sessions_history` | Fetch transcript for one session | `sessionKey` (required), `limit?`, `includeTools?` | Message array in raw transcript format |
| `sessions_send` | Send message to another session, optionally wait | `sessionKey` (required), `message` (required), `timeoutSeconds?` (0 = fire-and-forget) | `{runId, status, reply?}` |
| `sessions_spawn` | Launch isolated sub-agent run | Task description, auto-reports results back | Results flow back to parent |
| `session_status` | Get status of a specific session | `sessionKey` | Status metadata |

**Coordination patterns:**

| Pattern | Description | Use Case |
|---------|-------------|----------|
| Supervisor | Main agent delegates to sub-agents, aggregates results | "Research X, code Y, review Z" |
| Peer-to-peer | Agents send messages to each other via `sessions_send` | Two agents collaborating |
| Fire-and-forget | `sessions_send` with `timeoutSeconds: 0` | Background tasks, notifications |
| Reply-back loop | Agents alternate responding up to 5 turns, then announce results | Complex multi-turn collaboration |

**Context isolation (from OpenClaw docs):**
- Each sub-agent has its own conversation history (separate session)
- Sub-agents do NOT see the parent's full context (prevents leaking private data)
- Parent sends only the specific task/context needed via `sessions_send`
- Sub-agents cannot spawn further sub-agents (prevents fork bombs)
- Sandboxed sessions: visibility defaults to spawned subagents only
- Inter-session messages tagged with `message.provenance.kind = "inter_session"` for audit
- Agents can reply `REPLY_SKIP` to stop ping-ponging or `ANNOUNCE_SKIP` to suppress output

**For LivOS implementation:**
- Existing `SubagentManager` already manages sub-agent lifecycle
- Existing `TaskManager` already provides BullMQ-based parallel execution with concurrency limits
- Need to add: session tools exposed as MCP tools via `ToolRegistry`
- Need to add: `sessions_list`, `sessions_history`, `sessions_send` implementations that query Redis session data
- Send policy: block outbound messages by channel/chat type, configurable per-session

### DF-04: Gmail Integration

**Value Proposition:** The AI assistant can manage your email -- read, reply, draft, label, search. This is a killer feature for a personal AI assistant that few self-hosted alternatives offer well.
**Complexity:** High
**Dependencies:** Google Cloud project, OAuth 2.0 credentials, Pub/Sub topic, webhook system (TS-05), new Nexus MCP tools
**Confidence:** MEDIUM (Gmail API is well-documented; OAuth flow for self-hosted is tricky)

**Gmail Pub/Sub Watch -- end-to-end flow (verified from developers.google.com):**

```
1. Setup (one-time):
   - Create Google Cloud project with Gmail API + Pub/Sub API enabled
   - Create Pub/Sub topic: projects/<project>/topics/gmail-notifications
   - Grant publish to: gmail-api-push@system.gserviceaccount.com
   - Create push subscription -> https://livinity.cloud/api/webhooks/receive/gmail

2. OAuth 2.0 Flow:
   - User clicks "Connect Gmail" in Settings > Integrations
   - Redirect to Google OAuth consent screen
   - Scopes: gmail.readonly, gmail.send, gmail.modify, gmail.labels
   - Receive authorization code -> exchange for access_token + refresh_token
   - Store tokens encrypted in Redis: nexus:gmail:tokens:<userId>

3. Activate Watch:
   - POST gmail.users.watch({userId: "me", topicName, labelIds: ["INBOX"]})
   - Response: {historyId, expiration}
   - CRITICAL: Must renew watch every 7 days (use existing scheduler.ts)

4. Receive Notifications:
   - Gmail pushes to Pub/Sub when inbox changes
   - Pub/Sub pushes to webhook endpoint (uses TS-05 infrastructure)
   - Webhook extracts: {emailAddress, historyId} from base64 Pub/Sub message
   - Fetch changes since last historyId: gmail.users.history.list()

5. Agent Processing:
   - New email trigger -> submit task via TaskManager
   - Agent has gmail MCP tools for all operations
```

**What the agent can do with emails (as MCP tools):**

| Action | Gmail API Method | MCP Tool Name |
|--------|-----------------|---------------|
| List inbox | `messages.list` | `gmail_inbox` |
| Read email | `messages.get` | `gmail_read` |
| Reply | `messages.send` (with In-Reply-To) | `gmail_reply` |
| Draft | `drafts.create` | `gmail_draft` |
| Send new | `messages.send` | `gmail_send` |
| Label | `messages.modify` | `gmail_label` |
| Search | `messages.list` with q parameter | `gmail_search` |
| Archive | `messages.modify` (remove INBOX) | `gmail_archive` |

**OAuth 2.0 self-hosted considerations:**
- Need Google Cloud project with OAuth consent screen configured
- Redirect URI must match server domain (e.g., `https://livinity.cloud/api/auth/google/callback`)
- Store client_id/client_secret in Redis config (separate from user tokens)
- Google may rotate refresh tokens -- always store the latest one received
- Token encryption at rest is important for self-hosted security
- The agent should NEVER see raw OAuth tokens (security -- see anti-features)

### DF-05: Onboarding CLI (`livinity onboard`)

**Value Proposition:** Makes LivOS accessible to non-technical users. A guided setup wizard that handles system checks, dependency installation, configuration, and service startup. Reduces the "time to first chat" from hours to minutes.
**Complexity:** Medium
**Dependencies:** New npm package or script, `@inquirer/prompts`, system detection utilities
**Confidence:** HIGH (well-established pattern, Inquirer.js is mature)

**What a guided CLI setup looks like:**

```
$ livinity onboard

  Welcome to LivOS Setup
  =======================

  Step 1/6: System Check
  ----------------------
  [check] Node.js v22.x .............. OK (v22.11.0)
  [check] Docker ..................... OK (v27.4.1)
  [check] Docker Compose ............ OK (v2.32.1)
  [check] Redis ..................... NOT FOUND
    -> Install Redis? (Y/n): Y
    -> Installing via apt... done.
  [check] PostgreSQL ................ OK (v16.4)
  [check] Available disk space ...... OK (45 GB free)
  [check] Available memory .......... OK (4 GB)

  Step 2/6: Domain Setup
  ----------------------
  ? Enter your domain (or press Enter to skip): livinity.cloud
  ? Enable HTTPS with Let's Encrypt? (Y/n): Y
  [setup] Configuring Caddy reverse proxy... done.

  Step 3/6: AI Configuration
  --------------------------
  ? Choose AI provider:
    > Claude (subscription mode, no API key needed)
      Claude (API key)
      Gemini (Google)
  ? Run 'claude login' to authenticate? (Y/n): Y
  [auth] Opening browser for Claude authentication...
  [auth] Authentication successful.

  Step 4/6: Channel Setup (optional)
  -----------------------------------
  ? Set up Telegram bot? (y/N): y
  ? Enter Telegram Bot Token: ****
  [test] Telegram connection... OK (@NexusBot)

  Step 5/6: Security
  ------------------
  ? Create admin password: ********
  [setup] JWT secret generated.
  [setup] API key generated: nxs_****

  Step 6/6: Start Services
  ------------------------
  [start] Redis .................... running
  [start] PostgreSQL ............... running
  [start] LivOS (UI) ............... running on :3000
  [start] Nexus (Core) ............. running on :3200
  [start] Nexus (Worker) ........... running

  Setup Complete!
  Access your server at https://livinity.cloud
```

**Implementation approach:**
- Use `@inquirer/prompts` (modern ESM version, not legacy `inquirer` package)
- Commander.js for CLI framework: `livinity onboard`, `livinity status`, `livinity restart`, `livinity logs`
- System checks: spawn `docker --version`, `node --version`, etc.
- Package as separate entry point or script within the monorepo
- Support flags for non-interactive mode: `livinity onboard --non-interactive --config setup.json`

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

### AF-01: Do NOT build a native desktop/mobile app for voice

**Why avoid:** OpenClaw has native macOS/Windows apps (WKWebView, Electron), which is a massive engineering and distribution burden. LivOS runs in the browser. Voice via WebSocket from the browser is sufficient and works cross-platform.
**What to do instead:** PWA with WebSocket voice. The browser's MediaStream API provides microphone access. AudioWorklet provides low-latency playback. No native code needed.

### AF-02: Do NOT build your own STT or TTS

**Why avoid:** Speech models require massive training data and GPU infrastructure. Self-hosted STT/TTS (Whisper, Piper) add latency (500ms+ vs 40ms Cartesia), require GPU, and produce worse results than cloud APIs for real-time conversational use.
**What to do instead:** Use Deepgram (STT) and Cartesia (TTS) via their WebSocket APIs. Purpose-built for real-time with sub-100ms latency. API cost is minimal for personal use ($0.0043/min Deepgram, usage-based Cartesia).

### AF-03: Do NOT implement A2UI v0.9+ before spec stabilizes

**Why avoid:** A2UI is at v0.8 (public preview, December 2025). The spec is actively evolving -- v0.9 already introduces breaking changes (`createSurface` command not backward compatible with v0.8). Building against a moving target means rewrites.
**What to do instead:** Start with simplified artifacts using Sandpack iframe. Monitor A2UI spec development. Migrate when v1.0 is released and reference implementations are stable.

### AF-04: Do NOT build always-listening wake word detection

**Why avoid:** Wake word detection requires: (1) constant microphone access (privacy concern), (2) on-device ML model running continuously, (3) custom wake word training ("Hey Nexus"). Massive scope increase for marginal value.
**What to do instead:** Push-to-talk button in the web UI. Simple, reliable, no privacy concerns. Add VAD-based always-listening as a later opt-in feature once push-to-talk is proven.

### AF-05: Do NOT expose raw Gmail OAuth tokens to the agent

**Why avoid:** If the agent has raw OAuth tokens, a prompt injection attack could instruct it to forward tokens or send unauthorized emails. The agent should interact with Gmail only through scoped MCP tools that perform API calls server-side.
**What to do instead:** Gmail MCP tools accept structured parameters (recipient, subject, body) and execute the API call in the Nexus server process. The agent never sees tokens. Tools enforce rate limits and content validation.

### AF-06: Do NOT allow unlimited sub-agent spawning

**Why avoid:** Agents spawning agents spawning agents creates fork bombs. OpenClaw explicitly prevents sub-agents from spawning further sub-agents. Without depth limits, a single runaway prompt could consume your entire subscription.
**What to do instead:** Max depth of 1 (main agent -> sub-agents only). Max concurrent sub-agents capped at 4 (matching existing `TaskManager.maxConcurrent`). Sub-agents lose session tools entirely (OpenClaw's pattern).

### AF-07: Do NOT build real-time voice for Telegram/Discord channels

**Why avoid:** Telegram and Discord have their own voice call APIs that are complex, platform-specific, and would require maintaining audio streams through third-party infrastructure. The quality would be poor over bot APIs not designed for AI voice.
**What to do instead:** Voice mode is web UI only. Telegram/Discord remain text-based channels with rich slash commands. Users who want voice use the web UI.

### AF-08: Do NOT build a centralized webhook registry service

**Why avoid:** Running a cloud service for webhook registration/discovery adds a dependency that contradicts self-hosted philosophy.
**What to do instead:** Local webhook configuration stored in Redis. Users register webhooks via Settings UI or CLI. Secrets generated and stored locally.

---

## Feature Dependencies

```
Dependency Graph:

Session Compaction (TS-03)
  |
  +-- /compact command (TS-01) [requires compaction logic to exist]
  +-- Usage Tracking (TS-04) [needs token counting pre/post compaction]

DM Pairing (TS-02)
  |
  +-- /activation command (TS-01) [requires group activation mode logic]

Usage Tracking (TS-04)
  |
  +-- /usage command (TS-01) [requires usage data to display]
  +-- Web UI usage dashboard [requires PostgreSQL daily aggregation]

Webhook Triggers (TS-05)
  |
  +-- Gmail Integration (DF-04) [Gmail Pub/Sub pushes to webhook endpoint]
  +-- Existing TaskManager [webhooks submit tasks via BullMQ]

Voice Mode (DF-01) -- Mostly Independent
  |
  +-- New /ws/voice WebSocket endpoint
  +-- Browser audio capture (client-side only)
  +-- Deepgram API key (new config field)
  +-- Cartesia API key (new config field)

Live Canvas (DF-02) -- Mostly Independent
  |
  +-- New React component (ArtifactPanel)
  +-- Sandpack dependency (@codesandbox/sandpack-react)
  +-- Agent convention for artifact output format

Multi-Agent Sessions (DF-03)
  |
  +-- Existing SubagentManager + TaskManager
  +-- New session MCP tools (sessions_list, sessions_send, etc.)
  +-- Session Compaction (TS-03) [sub-agent sessions benefit from compaction too]

Gmail Integration (DF-04)
  |
  +-- Webhook Triggers (TS-05) [Gmail Pub/Sub uses webhook infrastructure]
  +-- OAuth 2.0 flow (new auth routes)
  +-- Gmail MCP tools (new tool registrations)
  +-- Scheduler renewal (existing scheduler.ts, every 7 days)

Onboarding CLI (DF-05) -- Fully Independent
  |
  +-- New @livinity/cli entry point or package
  +-- System detection utilities
  +-- @inquirer/prompts dependency
```

---

## Build Order (Recommended)

```
Phase 1: Foundation -- Security & Commands (Low risk, high impact)
  TS-02  DM Pairing Security (critical gap)
  TS-01  Chat Commands (/new, /usage, /activation, /compact stub)
  TS-04  Usage Tracking (Redis counters + /usage command)

Phase 2: Intelligence -- Context Management (Medium risk, core value)
  TS-03  Session Compaction (full implementation + auto-compact)
  TS-05  Webhook Triggers (generic webhook receiver + HMAC)

Phase 3: Voice & Canvas -- Differentiators (High risk, high reward)
  DF-01  Voice Mode (push-to-talk first, VAD later)
  DF-02  Live Canvas (Sandpack artifacts)

Phase 4: Advanced -- Multi-Agent & Integrations (High complexity)
  DF-03  Multi-Agent Sessions (session tools as MCP)
  DF-04  Gmail Integration (OAuth + Pub/Sub + MCP tools)
  DF-05  Onboarding CLI (livinity onboard)
```

**Rationale for ordering:**
- **Phase 1:** DM pairing is the most critical security gap. Commands and usage are low-hanging fruit that complete the command experience users expect.
- **Phase 2:** Compaction is infrastructure that all subsequent features benefit from (cheaper, longer sessions). Webhooks are infrastructure that Gmail depends on.
- **Phase 3:** Voice and Canvas are the most visible differentiators but have highest integration risk. They are independent of each other and earlier phases (besides basic session management).
- **Phase 4:** Multi-agent sessions are complex and benefit from all prior infrastructure. Gmail requires webhooks (Phase 2) and OAuth flow. Onboarding CLI is standalone but benefits from all features being built.

---

## MVP Recommendation

For MVP (minimum viable v2.0 feature set), prioritize:

1. **DM Pairing Security (TS-02)** -- Critical security gap. Without this, any stranger who discovers the bot can use it.
2. **Chat Commands (TS-01)** -- /new, /usage, /activation complete the command set users expect from an OpenClaw-class platform.
3. **Usage Tracking (TS-04)** -- Users need visibility into token consumption, especially with subscription mode.
4. **Session Compaction (TS-03)** -- Long sessions hit context limits and waste tokens without this.
5. **Webhook Triggers (TS-05)** -- Enables automation use cases and is infrastructure for Gmail and other integrations.

**Defer to post-MVP:**
- **Voice Mode (DF-01):** High complexity, requires separate API keys and billing, can be added independently later
- **Live Canvas (DF-02):** High complexity, A2UI spec still evolving, text output is functional
- **Gmail Integration (DF-04):** Requires Google Cloud project setup, complex OAuth flow, only valuable after webhooks exist
- **Multi-Agent Sessions (DF-03):** Existing SubagentManager and TaskManager already provide basic multi-task functionality
- **Onboarding CLI (DF-05):** Nice-to-have, current manual setup works for early adopters

---

## Sources

### Voice / Audio Pipeline
- [Cartesia TTS Product Page](https://cartesia.ai/product/python-text-to-speech-api-tts) -- 40ms TTFA benchmark
- [Cartesia WebSocket API](https://docs.cartesia.ai/api-reference/tts/websocket) -- context_id multiplexing, audio formats
- [Cartesia JavaScript SDK](https://github.com/cartesia-ai/cartesia-js) -- @cartesia/cartesia-js v3 (beta)
- [Deepgram Live Audio](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) -- WebSocket STT streaming
- [Deepgram JS SDK](https://github.com/deepgram/deepgram-js-sdk) -- @deepgram/sdk v5
- [@ricky0123/vad](https://github.com/ricky0123/vad) -- Silero VAD in browser via ONNX Runtime Web
- [Modal Low Latency Voice Bot](https://modal.com/blog/low-latency-voice-bot) -- Sub-800ms voice-to-voice latency design
- [Voice AI Stack 2025](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents) -- Pipeline architecture
- [Deepgram Voice AI Workflows](https://deepgram.com/learn/designing-voice-ai-workflows-using-stt-nlp-tts) -- STT+NLP+TTS design
- [Real-Time vs Turn-Based Architecture](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture) -- Cascaded pipeline design

### Live Canvas / A2UI
- [OpenClaw Canvas Docs](https://docs.openclaw.ai/platforms/mac/canvas) -- A2UI v0.8 integration, WKWebView rendering
- [Google A2UI Introduction](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) -- Declarative data format, security model
- [A2UI Specification v0.8](https://a2ui.org/specification/v0.8-a2ui/) -- surfaceUpdate, dataModelUpdate protocol
- [A2UI Specification v0.9](https://a2ui.org/specification/v0.9-a2ui/) -- Breaking changes (createSurface)
- [LibreChat Artifacts](https://www.librechat.ai/docs/features/artifacts) -- Sandpack iframe approach
- [Tambo Generative UI](https://tambo.co) -- React SDK for AI-generated components

### Multi-Agent / Sessions
- [OpenClaw Session Tools](https://docs.openclaw.ai/concepts/session-tool) -- sessions_list, sessions_history, sessions_send full API
- [OpenClaw Subagent Management](https://deepwiki.com/openclaw/openclaw/9.6-subagent-management) -- Spawn, isolation, depth limits

### Security / DM Pairing
- [OpenClaw Security Docs](https://docs.openclaw.ai/gateway/security) -- DM policy modes, pairing codes, allowlist architecture, credential storage
- [OpenClaw DM Policy Guide](https://zenvanriel.nl/ai-engineer-blog/openclaw-dm-policy-access-control-guide/) -- Configuration reference

### Session Compaction
- [Google ADK Compaction](https://google.github.io/adk-docs/context/compaction/) -- Auto-compaction at 80% threshold
- [OpenCode Context Management](https://deepwiki.com/sst/opencode/2.4-context-management-and-compaction) -- Sliding window approach
- [Goose Smart Context](https://block.github.io/goose/docs/guides/sessions/smart-context-management/) -- Hierarchical memory
- [LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) -- Techniques and benchmarks

### Chat Commands
- [OpenClaw Slash Commands](https://docs.openclaw.ai/tools/slash-commands) -- Full 30+ command reference with parameters

### Webhooks
- [HMAC Webhook Verification](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification) -- SHA256 implementation
- [GitHub Webhook Validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- timingSafeEqual pattern
- [Webhook Security Patterns](https://www.pentesttesting.com/webhook-security-best-practices/) -- Timestamp windows, idempotency

### Gmail
- [Gmail Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push) -- Pub/Sub watch setup end-to-end
- [Gmail Watch API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch) -- 7-day renewal requirement

### CLI Onboarding
- [@inquirer/prompts](https://www.npmjs.com/package/@inquirer/prompts) -- Modern ESM interactive prompts
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) -- CLI prompt framework

### Usage Tracking
- [AI Agent Monitoring Best Practices](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/) -- Metrics taxonomy
- [Langfuse Analytics](https://www.montecarlodata.com/blog-best-ai-observability-tools/) -- Session-level cost tracking patterns

---

*Research completed: 2026-02-20*
