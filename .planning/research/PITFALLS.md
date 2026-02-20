# Domain Pitfalls: LivOS v2.0 Feature Additions

**Domain:** Adding voice, canvas, multi-agent, webhooks, Gmail, CLI, session compaction to existing AI agent platform
**Researched:** 2026-02-20
**Overall confidence:** HIGH (verified against official docs, existing codebase analysis, and community reports)

---

## CRITICAL PITFALLS

Mistakes that cause rewrites, data loss, or sustained outages on the 2-4 CPU / 4-8GB VPS.

---

### P-01: Voice Pipeline Latency Stacking (Cartesia + Deepgram)

**What goes wrong:** Each component in the voice pipeline adds latency sequentially: Deepgram STT (150-300ms) + Claude LLM (500-2000ms) + Cartesia TTS (40-150ms) + network round-trips (50-100ms) + browser audio scheduling (50-200ms). The total round-trip from user speech to AI speech playback reaches 800ms-2800ms. At the high end, conversations feel unnatural and users talk over the AI.

**Why it happens:** Developers build and test each component independently, measuring per-component latency. When assembled into a pipeline, latencies compound. On a 2-4 CPU VPS with limited bandwidth, these numbers worsen under load.

**Consequences:**
- Conversations feel sluggish at >1200ms round-trip
- Users begin speaking before AI finishes, causing overlapping audio
- If using streaming STT + streaming TTS, partial results create audio artifacts ("stuttering")
- CPU contention on the VPS between audio processing and agent reasoning

**Warning signs:**
- TTFB (time-to-first-byte) for TTS exceeds 200ms consistently
- Users report "the AI is slow to respond" in voice mode
- Audio playback gaps between TTS chunks
- Browser AudioContext shows underflow warnings in console

**Prevention:**
1. **Stream everything**: Use Deepgram streaming STT (not batch), stream partial LLM output to Cartesia WebSocket as text arrives, stream TTS audio chunks to browser as they generate. Never wait for a complete response before starting TTS.
2. **Measure end-to-end from day one**: Instrument the full pipeline with timestamps at each stage. Set a target of <1200ms for p95 latency.
3. **Use Cartesia continuations**: When streaming text incrementally, use Cartesia's continuation feature to maintain prosody across chunks. Without it, each chunk has independent prosody that creates audible seams.
4. **Pre-buffer TTS**: Set Cartesia's `max_buffer_delay_ms` appropriately -- the default 3000ms is too high for real-time conversation. Lower to 500-1000ms to reduce time-to-first-audio.
5. **Consider a voice proxy**: Run Deepgram/Cartesia WebSocket connections server-side (on VPS) rather than from the browser directly, to avoid double network hops.

**Confidence:** HIGH -- latency benchmarks from [Deepgram](https://deepgram.com/learn/speech-to-text-benchmarks), [Cartesia](https://cartesia.ai/pricing), and [voice AI infrastructure analysis](https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025).

**Phase to address:** Voice phase -- must be the core architectural decision, not an afterthought.

---

### P-02: Always-On Microphone Burns STT Credits

**What goes wrong:** When the browser microphone is always on and streaming to Deepgram, every second of audio is billed -- including silence, background noise, keyboard typing, other people talking. A single user with an always-on mic costs approximately $0.26/hour ($0.0043/min x 60 = $0.26/hr at Nova-3 rates). With 5 users across 8 working hours, that is $10.40/day or $312/month just in STT -- for mostly silence.

**Why it happens:** The simplest implementation is "open mic, stream everything." Developers don't notice cost in development (Deepgram gives $200 free credit) but it compounds rapidly in production.

**Consequences:**
- STT costs 10-50x higher than necessary
- Deepgram processes and returns transcriptions of background noise, keyboard clicks, ambient conversation
- AI receives false triggers from ambient speech
- On the VPS side, processing noise transcriptions wastes agent turns

**Warning signs:**
- Deepgram billing shows hours of audio processed but few meaningful interactions
- Transcription results full of "[inaudible]", single words, background noise fragments
- AI agent triggered by ambient speech it shouldn't have heard

**Prevention:**
1. **Push-to-talk as default**: Require user to hold a button or press-to-toggle. This is the single most effective cost control.
2. **Voice Activity Detection (VAD)**: Use browser-side VAD (like `@ricky0123/vad-web` or Silero VAD) to detect speech before streaming to Deepgram. Only open the STT connection when voice is detected.
3. **Deepgram keep-alive during silence**: Send `{"type": "KeepAlive"}` as text WebSocket frames every 3-5 seconds during VAD-detected silence. This keeps the connection alive without billing audio. If no audio or keep-alive is sent within 10 seconds, Deepgram closes with NET-0001 error.
4. **Budget caps**: Track per-user STT minutes in Redis. Alert at thresholds (e.g., 30 min/day) and hard-stop at limits.
5. **Cartesia TTS costs too**: At $0.011 per 1,000 characters, a chatty AI generating 500 chars per response x 100 responses/day = $0.55/day. Not catastrophic, but track it.

**Confidence:** HIGH -- [Deepgram pricing](https://deepgram.com/pricing) verified, [keep-alive docs](https://developers.deepgram.com/docs/audio-keep-alive) verified.

**Phase to address:** Voice phase -- VAD must be implemented before any "always-on" mode ships.

---

### P-03: Browser Autoplay Policy Blocks Voice Output

**What goes wrong:** Modern browsers (Chrome 70+, Firefox, Safari) block AudioContext creation and audio playback unless triggered by a user gesture (click, tap, keypress). If TTS audio arrives before the user has interacted with the page, it silently fails. The AudioContext enters a "suspended" state and no audio plays.

**Why it happens:** Browsers implemented autoplay policies to prevent websites from autoplaying audio/video. This applies even to AudioContext used for audio analysis (not just playback). Developers testing in localhost or with DevTools open may not trigger the policy, so it appears to "work fine" until deployed.

**Consequences:**
- TTS audio silently fails on first page load
- Users see the AI "responded" but hear nothing
- AudioContext.state === "suspended" goes unchecked
- On mobile browsers, the restrictions are even stricter

**Warning signs:**
- "The AudioContext was not allowed to start" warning in browser console
- Audio works after clicking a button but not on initial load
- Audio works on desktop but fails on mobile
- `AudioContext.state` returns "suspended" instead of "running"

**Prevention:**
1. **Gate voice features behind a user gesture**: Show a "Start Voice Mode" button that the user must click. On that click, create/resume the AudioContext.
2. **Check and resume AudioContext**: Before playing any audio, check `audioContext.state`. If "suspended", call `audioContext.resume()` -- but this only works within a user gesture handler.
3. **Use `navigator.getAutoplayPolicy()`**: Modern browsers (Chrome 134+) expose this API to check if autoplay is allowed, disallowed, or allowed-if-muted. Use it to show appropriate UI.
4. **Queue audio during suspension**: If TTS audio arrives while AudioContext is suspended, buffer it. On next user gesture, resume AudioContext and play queued audio.
5. **Test on fresh browser profiles**: Autoplay policies are more lenient for sites the user visits frequently. Test on a fresh profile/incognito to see the first-visit experience.

**Confidence:** HIGH -- [MDN Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide), [WebRTC autoplay analysis](https://webrtchacks.com/autoplay-restrictions-and-webrtc/).

**Phase to address:** Voice phase -- AudioContext lifecycle must be designed into the UI from the start.

---

### P-04: WebSocket Connection Churn (Deepgram + Cartesia)

**What goes wrong:** Both Deepgram STT and Cartesia TTS use WebSocket connections. On a VPS with variable network conditions, these connections drop due to: network hiccups, server-side timeouts (Deepgram: 10s without audio/keep-alive), Cartesia WebSocket limits, or VPS resource pressure. Without proper reconnection logic, voice breaks silently.

**Why it happens:** WebSocket connections are long-lived and fragile. Unlike HTTP requests that retry naturally, a dropped WebSocket requires explicit reconnection logic: detecting the drop, re-establishing the connection, re-sending configuration, and handling any audio that was lost during the gap.

**Consequences:**
- STT stops transcribing mid-sentence; user keeps talking but nothing happens
- TTS stops mid-word; AI response truncated
- Deepgram timestamps reset to 0:00:00 on reconnection, breaking alignment
- If reconnect logic creates new connections without closing old ones: WebSocket connection leak, memory growth, eventual OOM

**Warning signs:**
- Intermittent "WebSocket closed" errors in server logs
- Users report voice "cutting out" randomly
- Deepgram NET-0001 errors in logs (10-second timeout)
- Growing WebSocket connection count over time (leak)
- PM2 restart count increasing (OOM from leaked connections)

**Prevention:**
1. **Deepgram keep-alive**: Send `{"type": "KeepAlive"}` as TEXT frame every 3-5 seconds during silence. This prevents the 10-second inactivity timeout.
2. **Explicit reconnection with backoff**: On WebSocket close/error, reconnect with exponential backoff (1s, 2s, 4s, max 30s). Include jitter to prevent thundering herd.
3. **Connection state machine**: Track WebSocket state explicitly: `connecting -> connected -> draining -> closed -> reconnecting`. Never send data in non-connected states.
4. **Cartesia: reuse WebSocket for multiple generations**: Cartesia recommends using a single WebSocket with separate context IDs for each generation. Don't open/close WebSocket per utterance.
5. **Cleanup on close**: When a WebSocket closes, remove ALL event listeners. Named handlers (not anonymous functions) are required for proper cleanup. Without this, listeners accumulate and prevent garbage collection -- a [documented Node.js WebSocket memory leak pattern](https://oneuptime.com/blog/post/2026-01-24-websocket-memory-leak-issues/view).
6. **Server-side proxy**: Run WebSocket connections to Deepgram/Cartesia from the Node.js backend, not from each browser client. This centralizes connection management and avoids per-client connection overhead.

**Confidence:** HIGH -- [Deepgram reconnection docs](https://developers.deepgram.com/docs/audio-keep-alive), [Cartesia WebSocket docs](https://docs.cartesia.ai/api-reference/tts/tts), [Node.js WebSocket memory leak patterns](https://github.com/websockets/ws/issues/804).

**Phase to address:** Voice phase -- connection management is foundational infrastructure.

---

### P-05: iframe Sandbox for AI Canvas -- XSS vs. Functionality Tradeoff

**What goes wrong:** The AI-generated HTML/React code displayed in a live canvas runs in an iframe. If the iframe is unsandboxed (`sandbox` attribute absent), the AI-generated code has full access to the parent page: cookies, localStorage, DOM manipulation, network requests. If the iframe is over-sandboxed (`sandbox=""` with no permissions), the generated code can't run scripts, submit forms, or load external resources -- making it useless for interactive demos.

**Why it happens:** The `sandbox` attribute is all-or-nothing by default. Developers either omit it entirely (insecure) or add it without permissions (too restrictive), then add permissions one by one until things work -- often ending up with `allow-scripts allow-same-origin` which effectively negates the sandbox entirely (the iframe can remove its own sandbox attribute).

**Consequences:**
- **Too permissive**: AI-generated code can exfiltrate data, hijack sessions, execute XSS against the parent app
- **Too restrictive**: Generated code can't run, making the canvas feature useless
- **allow-scripts + allow-same-origin together**: The iframe can reach into the parent DOM and remove its own sandbox -- this combination is explicitly warned against in the HTML spec

**Warning signs:**
- Users report "canvas doesn't work" (too restrictive)
- XSS vulnerability reports from security scans
- iframe accessing parent window cookies or localStorage
- CSP violations in browser console

**Prevention:**
1. **Use `srcdoc` with data URI or blob URL**: Serve canvas content from a different origin (e.g., `null` origin via srcdoc, or a dedicated subdomain). This gives `allow-scripts` without `allow-same-origin`, which is secure.
2. **Recommended sandbox attributes**: `sandbox="allow-scripts allow-popups allow-forms"` -- NEVER include `allow-same-origin` together with `allow-scripts`.
3. **Content Security Policy**: Set CSP on the parent page with `frame-src` restricting which origins can be framed. Set CSP within the iframe to restrict network access.
4. **Cross-Origin Isolation headers**: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for additional isolation.
5. **Communication via postMessage only**: Parent and canvas communicate exclusively through `window.postMessage()` with origin validation. Never expose shared state objects.
6. **Sanitize generated HTML**: Before injecting into iframe, pass through DOMPurify or similar sanitizer. Even with sandbox, defense-in-depth matters.

**Confidence:** HIGH -- [iframe security best practices 2025](https://www.feroot.com/blog/how-to-secure-iframe-compliance-2025/), [HackTricks iframe XSS analysis](https://book.hacktricks.xyz/pentesting-web/xss-cross-site-scripting/iframes-in-xss-and-csp).

**Phase to address:** Canvas phase -- security architecture must be decided before any rendering code is written.

---

### P-06: Multi-Agent Recursive Deadlock and Token Explosion

**What goes wrong:** In multi-agent sessions, Agent A delegates to Agent B, which needs information from Agent A, creating a circular dependency. Even without explicit deadlocks, agents can enter "hallucination loops" where one agent generates a false premise, the other validates it using the first agent's reasoning, creating a self-reinforcing cycle. Each loop iteration burns tokens. Research shows accuracy gains saturate past 4 agents -- the "coordination tax."

**Why it happens:** Agents share context and can reference each other's outputs. Without strict boundaries, they interpret each other's intermediate thoughts as facts. The LLM's pattern-matching behavior amplifies this: seeing other agents "agree" with a premise makes the current agent more likely to agree too.

**Consequences:**
- Token costs multiply: 2 agents = roughly 3-4x the tokens of 1 agent (not 2x, because of coordination overhead)
- Deadlocked agents consume tokens indefinitely until max_turns hit
- On the Claude Code subscription model with rolling windows, multi-agent sessions exhaust the 5-hour window budget rapidly
- VPS resources consumed by concurrent agent processes (memory, CPU)

**Warning signs:**
- Agent turn counts exceeding 20+ for tasks that should take 5-10 turns
- Two agents generating nearly identical outputs (echo chamber)
- Agent A's output appearing verbatim in Agent B's reasoning
- Token usage per session 5-10x higher than single-agent equivalent
- Rolling window budget warnings appearing more frequently

**Prevention:**
1. **Strict topology**: Define a directed acyclic graph (DAG) of agent communication. Agent A can delegate to Agent B, but B cannot delegate back to A. Use a mediator/orchestrator pattern.
2. **Append-only shared state**: Agents write results to unique keys in shared state. No agent overwrites another's output. An orchestrator merges results.
3. **Per-agent turn limits**: Set aggressive limits per sub-agent (5-8 turns). The orchestrator can retry with a fresh context if a sub-agent fails.
4. **Token budget per session**: Track total tokens across all agents in a session. Hard-stop the entire multi-agent session at a budget (e.g., 50K tokens for the session).
5. **Start with 2 agents max**: Research shows diminishing returns past 4 agents. For a VPS with 4-8GB RAM, 2 concurrent agents is the practical limit.
6. **Deduplication**: Before an agent acts, check if the same action was already taken by another agent in the session. Skip if duplicate.

**Confidence:** HIGH -- [multi-agent 17x error trap analysis](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/), [agentic recursive deadlock](https://tech-champion.com/artificial-intelligence/the-agentic-recursive-deadlock-llm-orchestration-collapses/), [Redis AI agent orchestration](https://redis.io/blog/ai-agent-orchestration/).

**Phase to address:** Multi-agent phase -- topology must be designed before implementation.

---

### P-07: Process Stability -- 153 PM2 Restarts in 47 Hours

**What goes wrong:** The nexus-core process currently restarts approximately 3.3 times per hour. This is not merely annoying -- each restart loses: in-flight agent sessions, WebSocket connections to Telegram/Discord/Deepgram/Cartesia, BullMQ worker state, setTimeout-based scheduled tasks, and any in-memory caches. Adding voice, canvas, and multi-agent features increases the crash surface area because each adds new WebSocket connections, event listeners, and async operations.

**Why it happens (root causes from existing codebase analysis):**
1. **Unhandled promise rejections**: The daemon has `try/catch` in the main cycle but individual handler errors (especially from async callbacks in WebSocket handlers, Redis subscriptions, and BullMQ workers) can escape these boundaries.
2. **setTimeout memory leaks**: Cron handler creates unbounded timers that never get cleaned up (documented in CONCERNS.md item #4).
3. **Event listener accumulation**: WebSocket connections (grammy for Telegram, Discord.js) attach event listeners. On reconnection, old listeners are not removed, causing the classic Node.js "MaxListenersExceededWarning" followed by memory growth.
4. **No circuit breaker**: When Redis goes down briefly, all operations fail simultaneously, generating a cascade of unhandled errors.
5. **OOM on the VPS**: With 4-8GB RAM and multiple services (livos, nexus-core, nexus-mcp, nexus-memory, nexus-worker, Redis, PostgreSQL, Docker), memory pressure is real. A single memory leak in any service can trigger OOM-killer.

**Consequences:**
- Voice calls drop mid-conversation (WebSocket reset)
- Multi-agent sessions lose progress (in-memory state gone)
- Scheduled tasks lost (setTimeout-based crons)
- Telegram/Discord bots go offline briefly, may lose message offset
- Users perceive the system as unreliable

**Warning signs:**
- PM2 restart count incrementing (check `pm2 show nexus-core`)
- "MaxListenersExceededWarning" in logs
- RSS memory growing over time without plateauing
- Redis connection error bursts followed by recovery
- EventEmitter memory leak warnings

**Prevention:**
1. **Global error handlers**: Add `process.on('unhandledRejection')` and `process.on('uncaughtException')` that log the full stack trace and attempt graceful shutdown instead of crashing immediately.
2. **Fix the cron handler**: Replace all `setTimeout` usage with BullMQ Scheduler (repeatable jobs). This is the most impactful single fix because it eliminates both the memory leak and the "lost on restart" problem.
3. **WebSocket connection management**: Create a connection manager that: tracks all active WebSocket connections, removes event listeners before reconnecting, implements health checks (heartbeat), and closes stale connections.
4. **Memory monitoring**: Set PM2 `max_memory_restart` to 80% of available RAM (e.g., 1.5GB if 2GB allocated to nexus-core). This provides graceful restarts instead of OOM-killer kills.
5. **Redis circuit breaker**: When Redis operations fail 3 times in 10 seconds, stop attempting for 30 seconds. Use in-memory queue as buffer during outage. Resume when Redis responds to PING.
6. **Heap snapshots**: Periodically (every hour) log `process.memoryUsage()`. If RSS growth exceeds 50MB/hour without corresponding workload, investigate.
7. **Address before adding features**: Every new feature (voice WebSockets, canvas rendering, multi-agent coordination) adds crash surface area. Stabilize first.

**Confidence:** HIGH -- based on direct codebase analysis (CONCERNS.md), PM2 restart data from the project context, and [Node.js PM2 debugging patterns](https://github.com/Unitech/pm2/issues/5082).

**Phase to address:** Stability phase (pre-requisite) -- must be addressed BEFORE adding voice, canvas, or multi-agent features.

---

## HIGH-SEVERITY PITFALLS

Mistakes that cause significant rework, poor user experience, or ongoing maintenance burden.

---

### P-08: Claude Code SDK `tools: []` Does Not Disable Built-In Tools

**What goes wrong:** Setting `tools: []` in `SdkAgentRunner` does not actually prevent Claude from using built-in tools like Bash, Read, Write, and Edit. This is a [documented open issue](https://github.com/anthropics/claude-agent-sdk-typescript/issues/115) (filed December 2025). Even when specifying an explicit allowlist like `allowedTools: ['Read', 'Glob', 'Grep']`, Claude can still use Edit, Write, and Bash to modify files.

**Why it happens:** The Claude Agent SDK's built-in tools are hardcoded and the `allowedTools` parameter acts as a filter on MCP tools, not on the built-in tool set. The SDK team acknowledged this as a security issue but it may not be fixed yet.

**Consequences:**
- A "read-only research agent" can still write files and execute shell commands
- Multi-agent sessions where one agent should be restricted can break out of restrictions
- Security boundaries between agents are illusory
- An agent told to "just analyze this code" might start editing it

**Warning signs:**
- Agent tool call logs showing Bash, Write, Edit even when tools were restricted
- Files modified by agents that shouldn't have write access
- Shell commands executed by research-only agents

**Prevention:**
1. **Verify with current SDK version**: Check if issue #115 has been resolved in the version you're using. The fix may have landed since this was reported.
2. **Workaround via system prompt**: Explicitly tell the agent "You MUST NOT use Bash, Write, or Edit tools. You only have access to Read, Glob, and Grep." This is prompt-based enforcement -- not bulletproof but reduces accidental usage.
3. **Permission mode interaction**: Use `permissionMode: 'dontAsk'` (as currently configured) but understand that this auto-approves everything including built-in tools. There is no "deny" mode for built-in tools.
4. **Monitor tool usage**: Log every tool call from the SDK runner. Alert when restricted agents use tools outside their allowlist.
5. **Sandboxing at OS level**: If true isolation is needed, run restricted agents in Docker containers with read-only filesystem mounts. This provides real enforcement regardless of SDK behavior.

**Confidence:** HIGH -- [verified via GitHub issue #115](https://github.com/anthropics/claude-agent-sdk-typescript/issues/115).

**Phase to address:** Multi-agent phase -- critical for sub-agent security boundaries.

---

### P-09: Agent Runs 6-13 Turns for Simple Greetings

**What goes wrong:** The current system uses 6-13 agent turns (tool calls) to handle simple greetings like "hello" or "how are you?" Each turn involves: the agent reading files, checking system status, gathering context it doesn't need, and eventually producing a simple text response. This wastes tokens, time, and contributes to rolling window budget exhaustion.

**Why it happens:**
1. **System prompt is too broad**: The agent is told about all its capabilities, so it tries to use them even for simple tasks.
2. **No complexity classifier**: Every message goes through the full agent pipeline regardless of whether it needs tools.
3. **Tool-use bias**: Claude models have a tendency to use tools when they're available, even when unnecessary. The agent's training rewards thoroughness.
4. **No tool use examples**: Without examples showing "for simple greetings, respond directly without tools," the agent defaults to exploring.

**Consequences:**
- Simple conversations consume 5-10x the tokens they should
- Response latency for greetings is 10-30 seconds instead of 1-2 seconds
- Rolling window budget gets consumed by trivial interactions
- Users perceive the system as slow for basic conversation

**Warning signs:**
- Agent turn count for simple messages exceeding 3
- Tool calls in conversations that don't require tools
- High token usage for low-complexity tasks
- Users complaining about slow responses to simple questions

**Prevention:**
1. **Complexity classifier gate**: Before invoking the full SDK agent, classify the message complexity. For simple chat (greetings, small talk, basic questions), respond with a direct LLM call without tool access.
2. **Tiered agent configuration**:
   - Tier 0 (no tools): Simple chat, greetings, status queries -> direct LLM response
   - Tier 1 (read-only tools): Research, code review -> Read, Glob, Grep only
   - Tier 2 (full tools): Development tasks -> all tools
3. **Tool use examples in system prompt**: Include examples like "User: hello -> Respond directly, no tools needed" in the system prompt.
4. **Max turns per complexity**: Simple tasks: max 3 turns. Medium: max 10. Complex: max 25.
5. **"No tool" fast path**: Implement a regex/keyword check for obvious non-tool messages (greetings, thanks, small talk) that bypasses the agent entirely.

**Confidence:** HIGH -- based on direct observation from project context (6-13 turns documented).

**Phase to address:** Foundation/stability phase -- should be fixed before adding more features that increase tool surface area.

---

### P-10: Webhook Authentication and DDoS via Queue Flooding

**What goes wrong:** Incoming webhooks (GitHub, Stripe, Gmail push notifications) without authentication allow anyone to trigger agent tasks. Even with authentication, webhook providers send retries when they don't receive a timely 2xx response. A webhook endpoint that takes 5+ seconds to process (because it runs the agent inline) will trigger retry storms. Each retry adds another job to BullMQ, and the queue grows unbounded.

**Why it happens:** The current codebase already has webhook endpoints (`POST /api/webhook/git`) that push directly to the daemon inbox without authentication or rate limiting (documented in CONCERNS.md item #12). Adding more webhook sources (Gmail Pub/Sub, Stripe, Discord interactions) multiplies the attack surface.

**Consequences:**
- Unauthenticated webhooks: anyone who discovers the URL can trigger agent tasks
- Retry storms: GitHub retries at 10s, 30s, 60s, 120s, 300s intervals. A single failed delivery creates 5+ duplicate jobs.
- Queue flooding: BullMQ queue grows, consuming Redis memory. On a 4-8GB VPS, Redis OOM can take down the entire system.
- Agent processes duplicate work: same GitHub push processed 5 times, same email notification handled 5 times.

**Warning signs:**
- BullMQ queue length growing continuously
- Duplicate agent tasks for the same event
- Redis memory usage spiking
- GitHub/Stripe webhook dashboard showing delivery failures
- 429 responses from your webhook endpoint

**Prevention:**
1. **Verify webhook signatures**: GitHub sends `X-Hub-Signature-256`, Stripe sends `Stripe-Signature`, Google Pub/Sub uses JWT. Verify signatures before processing. Reject unsigned requests with 401.
2. **Respond 200 immediately, process async**: Webhook handler should: validate signature -> enqueue job -> respond 200. Never run agent logic in the webhook handler. Target <500ms response time.
3. **Idempotency via BullMQ job deduplication**: Use the webhook delivery ID as the BullMQ job ID. BullMQ's [deduplication feature](https://docs.bullmq.io/guide/jobs/deduplication) ignores duplicate job IDs, preventing retry storms from creating duplicate work.
4. **Rate limiting per source**: Use `express-rate-limit` per IP/source. Suggested: 30 requests/minute for webhooks. BullMQ's [global rate limiting](https://docs.bullmq.io/guide/queues/global-rate-limit) caps job processing rate.
5. **Payload size limits**: Set `express.json({ limit: '1mb' })` on webhook routes. Reject oversized payloads before they enter the queue.
6. **Queue depth monitoring**: Alert when BullMQ queue length exceeds 100 pending jobs. Hard-reject new webhook submissions when queue exceeds 500.

**Confidence:** HIGH -- [webhook security best practices](https://www.svix.com/resources/webhook-best-practices/authentication/), [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), existing codebase analysis.

**Phase to address:** Webhooks phase -- authentication must be the first thing implemented, before any webhook endpoint goes live.

---

### P-11: Gmail OAuth Token Refresh Failures

**What goes wrong:** Google OAuth refresh tokens silently expire or get revoked in multiple ways:
- Unused for 6 months -> automatically invalidated
- User resets password -> all refresh tokens revoked
- App in "Testing" mode (OAuth consent screen) -> tokens expire after 7 days
- User has 100+ refresh tokens for your app -> oldest silently invalidated
- Google changes behavior and stops sending new refresh tokens if old one is still valid

When the refresh token fails, the system can no longer access Gmail. If this happens silently (no error handling on token refresh), incoming email notifications continue via Pub/Sub but the system can't read the emails, creating a silent failure mode.

**Why it happens:** OAuth token management is deceptively complex. The "happy path" works during development, but edge cases (password reset, token rotation, consent screen status) only appear in production over weeks/months.

**Consequences:**
- Gmail integration silently stops working
- Pub/Sub notifications arrive but emails can't be read -> queued tasks fail
- Users don't realize emails aren't being processed until they check manually
- Re-authentication requires user interaction (OAuth consent flow) which can't be automated

**Warning signs:**
- `invalid_grant` errors in logs when refreshing tokens
- Gmail API returning 401 Unauthorized
- Pub/Sub notifications being received but email read operations failing
- Token refresh response not including a new refresh token

**Prevention:**
1. **Test with "Published" app status**: Move OAuth consent screen from "Testing" to "Published" (even if as internal app) to avoid the 7-day token expiration.
2. **Monitor token refresh health**: Every time you refresh the access token, log the result. If refresh fails, immediately alert the user via Telegram/Discord: "Gmail authentication expired. Please re-authenticate."
3. **Store token metadata**: Save `lastRefreshTime`, `lastSuccessfulRefresh`, `tokenAge` in Redis. Monitor for staleness.
4. **Proactive token refresh**: Don't wait for the access token to expire. Refresh proactively (e.g., every 30 minutes) so you detect failures early.
5. **Graceful degradation**: When Gmail token fails, disable Gmail-triggered agent tasks (don't queue them) and send a notification. Don't let Pub/Sub notifications pile up as failed jobs.
6. **Handle the "no new refresh token" case**: Google may not send a new refresh token if the old one is still valid. Store and reuse the original refresh token until it fails.

**Confidence:** HIGH -- [Google OAuth docs](https://developers.google.com/identity/protocols/oauth2), [Nango invalid_grant analysis](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked).

**Phase to address:** Gmail phase -- token lifecycle management must be built before any email processing logic.

---

### P-12: Gmail Pub/Sub Watch Expiration (7-Day Renewal)

**What goes wrong:** Gmail API's `users.watch()` method creates a push notification subscription that expires after 7 days. If the watch is not renewed before expiration, you stop receiving email notifications entirely. There is no warning from Google before expiration -- it simply stops sending notifications.

**Why it happens:** The 7-day expiration is a Google API design decision. Developers set up the watch during initial integration, it works for a week, then silently stops. Without automated renewal, the feature appears broken.

**Consequences:**
- Email notifications stop after 7 days
- No error messages -- it just stops working silently
- Emails accumulate without being processed
- Users think the system is working but it's not

**Prevention:**
1. **Schedule watch renewal**: Use BullMQ repeatable job to call `users.watch()` every 6 days (before the 7-day expiration). Store the `expiration` timestamp returned by the API.
2. **Verify watch is active**: Periodically (every hour) check if the watch is still valid by comparing stored expiration with current time. If expired, renew immediately.
3. **Gmail API rate limits**: Watch requests count against the 250 quota units per user per second limit. Don't call watch() too frequently.
4. **Fallback polling**: As a safety net, implement periodic Gmail polling (every 5 minutes) that checks for new emails even if Pub/Sub is working. Use `historyId` to avoid reprocessing.
5. **Alert on watch failure**: If watch renewal fails (quota exceeded, auth failure), alert immediately via Telegram/Discord.

**Confidence:** HIGH -- verified from Google Gmail API watch documentation.

**Phase to address:** Gmail phase -- renewal automation must be built alongside the initial watch setup.

---

### P-13: Session Compaction Loses Critical Context

**What goes wrong:** When compacting/summarizing older conversation turns to stay within token limits, the summarization LLM decides what's "important." It often discards: specific tool call results (file contents, command outputs), exact error messages, numeric values, configuration details, and user preferences stated early in the conversation. When the agent later needs this information, it either hallucinates it or re-executes tool calls (if it can), wasting tokens and time.

**Why it happens:** LLM summarization optimizes for narrative coherence, not information preservation. A tool call that returned 500 lines of log output gets summarized to "the logs were checked and an error was found" -- losing the actual error message, line numbers, and stack trace. The phenomenon called "context rot" means performance degrades as compressed context fills the window.

**Consequences:**
- Agent "forgets" results of previous tool calls and re-runs them
- Compacted summary contradicts information that remains in the uncompacted portion
- Critical user instructions from early in the conversation are summarized away
- Agent confidence decreases as it operates on summaries rather than raw data

**Warning signs:**
- Agent re-executing tool calls it already ran earlier in the session
- Agent responses contradicting earlier results
- User repeating instructions the agent should already know
- Rising token usage per turn after compaction (agent gathering information it lost)

**Prevention:**
1. **Tiered compaction**: Keep last 5-10 turns verbatim. Summarize turns 10-30. Drop turns 30+. Never summarize the system prompt or user's initial instructions.
2. **Pin critical facts**: Before compaction, extract structured key facts (file paths mentioned, error codes, user preferences, configuration values) and pin them as a separate section that never gets compacted.
3. **Tool result summaries at creation time**: When a tool returns results, immediately create a structured summary (`{"tool": "bash", "command": "ls /opt", "result_summary": "14 files found, key directories: livos, nexus, data", "full_result_hash": "abc123"}`). Use the summary in compaction, store full result in Redis with TTL.
4. **Threshold-based triggers**: Trigger compaction at 70% of token budget (not 90%). This leaves headroom for the compaction itself (which requires LLM tokens) and for post-compaction agent work.
5. **Compaction quality check**: After compaction, verify the summary mentions all entities from the raw conversation. If entity count drops below 70%, the compaction is too aggressive.
6. **Never compact within a single "task"**: If the user gave a multi-step task and the agent is mid-execution, don't compact the task instructions and intermediate results. Wait for task completion.

**Confidence:** HIGH -- [Anthropic context engineering guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Forge Code compaction docs](https://forgecode.dev/docs/context-compaction/), [context rot research](https://research.trychroma.com/context-rot).

**Phase to address:** Session compaction phase -- compaction strategy must be designed with knowledge of downstream impact.

---

### P-14: Usage Tracking Without Token Visibility

**What goes wrong:** The Claude Code SDK in subscription mode (used by LivOS) operates on a rolling window system (5-hour window, weekly limits). The SDK may not expose per-request token counts in the same way the API does. Without token counts, you cannot calculate per-user usage, enforce budgets, or detect runaway sessions.

**Why it happens:** Claude Code subscription mode is designed for individual developer use, not for building platforms that multiplex multiple users through a single subscription. The cost tracking features (`/cost`, `/stats`) are designed for the CLI user, not for programmatic access. The SDK runner may return responses without detailed token metadata.

**Consequences:**
- Cannot enforce per-user usage limits
- Cannot detect runaway agent sessions (burning through the rolling window)
- Cannot provide usage dashboards to users
- Cannot bill or allocate costs
- Risk of hitting weekly limits without warning, degrading service for all users

**Warning signs:**
- `usage` or `token_count` fields missing/null in SDK runner responses
- Rolling window exhaustion without any internal tracking detecting it
- All users affected when one user's heavy session exhausts the window

**Prevention:**
1. **Estimate tokens from text**: Use `tiktoken` or similar to estimate input/output tokens from the actual text. This won't match Claude's internal count exactly but gives a usable approximation.
2. **Track turns and tool calls as proxy**: If tokens aren't available, track: number of turns, total characters in/out, number of tool calls, session duration. These correlate with token usage.
3. **Monitor SDK response metadata**: Check every field in the SDK response for usage data. Anthropic may add token counts in future SDK versions.
4. **Per-user session budgets**: Limit sessions by turns (max 25 turns per session) and time (max 30 minutes) rather than tokens, since turns are always countable.
5. **Redis counters with TTL**: Store per-user daily counters in Redis: `nexus:usage:{userId}:{date}:turns`, `nexus:usage:{userId}:{date}:chars`. Set TTL to 48 hours for automatic cleanup.
6. **Rolling window awareness**: Track when the 5-hour window started. If approaching the window's likely budget, throttle new sessions or switch to lower-complexity mode.

**Confidence:** MEDIUM -- the exact token visibility in Claude Code SDK subscription mode requires [verification against current SDK docs](https://platform.claude.com/docs/en/agent-sdk/cost-tracking). The rolling window system is [documented](https://code.claude.com/docs/en/costs) but programmatic access to window state is unclear.

**Phase to address:** Usage tracking phase -- must be one of the first features to implement to prevent unbounded resource consumption.

---

## MODERATE PITFALLS

Mistakes that cause delays, poor UX, or technical debt requiring targeted fixes.

---

### P-15: Command Conflicts With Regular Messages

**What goes wrong:** When implementing chat commands (`/reset`, `/compact`, `/status`), there's ambiguity between commands and regular conversation. A user saying "what is the /reset command?" or "I need to reset my password" triggers the reset handler. Commands embedded in code snippets or URLs also match. In multi-channel (Telegram + Discord + web UI), command syntax may differ (`/command` in Telegram is native, in Discord it's slash commands, in web UI it's free text).

**Prevention:**
1. **Strict prefix matching**: Commands must start with `/` at the beginning of the message (not embedded). Use regex: `/^\/(\w+)(?:\s+(.*))?$/`.
2. **Confirmation for destructive commands**: `/reset` and `/compact` should require a confirmation step: "This will clear your session. Send /reset confirm to proceed."
3. **Channel-appropriate parsing**: In Telegram, use native BotCommand entities (they're tagged in the message metadata). In Discord, use slash command registration (Discord handles parsing). In web UI, use a command palette UI rather than text parsing.
4. **Reserved word list**: Maintain a list of command names and check at registration time for conflicts.

**Phase to address:** Chat commands phase.

---

### P-16: DM Pairing Activation Code Brute Force

**What goes wrong:** If activation codes for DM pairing are short (4-6 characters), they can be brute-forced. An attacker guessing the code gains access to the AI agent through their own Telegram/Discord account. With Telegram's rate limits (30 messages/second per bot), a 4-character alphanumeric code (36^4 = 1.68M combinations) can be exhausted in ~15 hours of sustained attempts.

**Prevention:**
1. **Use 8+ character codes**: 36^8 = 2.8 trillion combinations -- infeasible to brute force.
2. **Short TTL**: Codes expire after 5 minutes. Displayed once, then deleted.
3. **Rate limit per user/IP**: Max 5 pairing attempts per hour per Telegram user. Lock out for 1 hour after 5 failures. Telegram Bot API 8.0's token-bucket rate limiting helps here.
4. **One-time use**: Code is invalidated immediately after first use (successful or failed).
5. **Notification on pairing**: When a new device is paired, notify all existing paired devices.
6. **Revocation**: Provide `/unpair` command to remove access from paired accounts.

**Phase to address:** DM pairing phase.

---

### P-17: Onboarding CLI Platform Differences

**What goes wrong:** The installation CLI (`npx install-livos` or similar) assumes a specific Linux distribution, package manager, and system configuration. Ubuntu uses `apt`, CentOS uses `yum`/`dnf`, some systems have `systemd`, others don't. Docker installation varies by distribution. Node.js installation paths differ. Non-root users can't install system packages or bind to ports below 1024.

**Prevention:**
1. **Detect and adapt**: Check `/etc/os-release` for distribution info. Branch logic for apt vs yum vs dnf.
2. **Docker-first approach**: Instead of installing Node.js/Redis/PostgreSQL directly, use Docker Compose. This standardizes across distributions.
3. **Root vs non-root**: Detect if running as root. If not, suggest `sudo` or offer rootless Docker setup.
4. **Prerequisite check**: Before installing, verify: Docker installed, Docker Compose available, minimum RAM (4GB), minimum disk (10GB), required ports available (3000, 3100, 3200, 5432, 6379).
5. **Partial install recovery**: If install fails at step 5 of 10, the cleanup function should undo steps 1-4. Use a rollback stack that pushes cleanup functions as each step succeeds.
6. **Target Ubuntu 22.04+ and Debian 12+**: Document these as supported. Other distributions "may work" but are not tested.

**Phase to address:** CLI installer phase.

---

### P-18: Canvas State Management Between iframe and Parent

**What goes wrong:** The AI generates code that runs in a sandboxed iframe. The parent app needs to: send data to the canvas, receive events from the canvas, persist canvas state across messages, and handle canvas errors. Without a structured communication protocol, the parent and iframe exchange arbitrary `postMessage` calls that become impossible to debug or version.

**Prevention:**
1. **Typed message protocol**: Define a TypeScript interface for all messages between parent and iframe. Version the protocol.
   ```typescript
   type CanvasMessage =
     | { type: 'render', code: string, data?: unknown }
     | { type: 'error', error: string }
     | { type: 'event', name: string, payload: unknown }
     | { type: 'resize', height: number }
   ```
2. **Origin validation**: Always check `event.origin` in `postMessage` handlers. Reject messages from unexpected origins.
3. **Error boundary in iframe**: Wrap the generated code in a try-catch that posts error messages back to the parent instead of silently failing.
4. **Canvas state in React state**: The parent component manages canvas state in React state/context. The iframe is a pure renderer that receives state and emits events.
5. **Iframe lifecycle**: When the AI generates new code, create a fresh iframe (or use `srcdoc` replacement) rather than mutating the existing one. This prevents state leakage between generations.

**Phase to address:** Canvas phase.

---

### P-19: Grammy (Telegram) Polling Offset Loss on Restart

**What goes wrong:** This is a known existing issue (mentioned in project context). When nexus-core restarts (which happens ~3x per hour), grammy's polling loses track of which messages have been processed. This causes either: duplicate message processing (re-processing old messages) or message loss (skipping messages that arrived during restart).

The current mitigation uses Redis deduplication (checking if a message ID was already processed), but this doesn't prevent the wasted processing of re-fetching and re-classifying already-handled messages.

**Prevention:**
1. **Persist polling offset to Redis**: Before each restart, save grammy's last processed update_id to Redis. On startup, read it back and start polling from update_id + 1.
2. **Graceful shutdown handler**: On SIGTERM/SIGINT, complete the current message processing, save the offset, then exit. PM2 sends SIGTERM before killing, giving a window for cleanup.
3. **Idempotency key per message**: Store `telegram:processed:{update_id}` in Redis with a 1-hour TTL. Check before processing. This is the existing mitigation -- keep it as defense-in-depth.
4. **Consider switching to webhooks**: If the VPS has a stable public URL (livinity.cloud), Telegram webhook mode pushes updates to your server. No polling offset to manage. Telegram handles retry logic.
5. **Same applies to Discord**: Discord.js reconnection can also cause duplicate events. Apply the same idempotency pattern with `discord:processed:{message_id}`.

**Phase to address:** Stability phase (pre-requisite) -- fix before adding more channels.

---

### P-20: Redis Connection Drops Causing Cascade Failures

**What goes wrong:** Redis is the backbone of nexus: inbox queue, session state, agent results, BullMQ jobs, configuration, memory. When Redis becomes temporarily unavailable (network blip, Redis restart, memory pressure), every component fails simultaneously. Without a circuit breaker, the system floods Redis with retry attempts the moment it comes back, causing a "thundering herd" that can push Redis back into overload.

The current system uses ioredis which has built-in reconnection, but the application layer doesn't handle the "Redis unavailable" state gracefully -- operations that fail during outage are lost, not retried.

**Prevention:**
1. **ioredis retry strategy**: Configure `retryStrategy` with exponential backoff and max retries. ioredis reconnects automatically but operations during outage throw errors.
2. **Application-level circuit breaker**: When Redis operations fail 3 times in 10 seconds, enter "degraded mode" for 30 seconds. In degraded mode: queue new inbox items in-memory (bounded buffer), respond to health checks with 503, don't attempt new Redis operations except periodic PING.
3. **Operation-level retry**: Wrap critical Redis operations (inbox push, result store) with a 3-attempt retry with 1s backoff. Non-critical operations (logging, stats) fail silently.
4. **Redis memory monitoring**: Set Redis `maxmemory` policy to `allkeys-lru` to prevent OOM. Monitor `used_memory` vs `maxmemory` ratio. Alert at 80%.
5. **Separate Redis connections**: Use separate ioredis clients for: pub/sub (requires dedicated connection), BullMQ (has its own connection management), and application operations. This prevents pub/sub blocking regular operations.

**Phase to address:** Stability phase (pre-requisite).

---

## MINOR PITFALLS

Mistakes that cause annoyance but are fixable with targeted effort.

---

### P-21: Audio Sample Rate and Codec Mismatches

**What goes wrong:** Deepgram expects specific audio formats (e.g., linear16 PCM at 16kHz). The browser's `getUserMedia` typically captures at 44.1kHz or 48kHz. Cartesia outputs audio in configurable formats. If sample rates or codecs don't match between components, you get: garbled audio, high-pitched/low-pitched distortion, or silent output.

**Prevention:**
- Standardize on a pipeline format: browser captures at 48kHz -> downsample to 16kHz for Deepgram -> Cartesia outputs PCM 16-bit at 24kHz -> upsample for browser playback.
- Use the `encoding` and `sample_rate` parameters explicitly in both Deepgram and Cartesia configurations. Don't rely on defaults.
- Test the full pipeline with actual audio, not just API integration tests.

**Phase to address:** Voice phase.

---

### P-22: Timezone Issues in Daily Usage Aggregation

**What goes wrong:** Redis usage counters keyed by `{date}` use the server's timezone (typically UTC for a VPS). A user in UTC+3 (Turkey) using the system at 23:30 local time sees their usage split across two "days" in the system. Daily limits reset at midnight UTC, not midnight local time.

**Prevention:**
- Store all timestamps in UTC consistently.
- For user-facing displays, convert to the user's configured timezone.
- For daily limits, key by `{userId}:{utc_date}` and document that limits reset at midnight UTC.
- If per-user timezone limits are needed, key by `{userId}:{local_date}` using the user's configured timezone offset.

**Phase to address:** Usage tracking phase.

---

### P-23: Redis Counter Overflow for High-Volume Tracking

**What goes wrong:** Using Redis `INCR` for usage counters, the values are stored as 64-bit integers (max: 9.2 x 10^18). This won't overflow. However, if counters don't have TTL, they accumulate indefinitely, consuming Redis memory. With per-user, per-day, per-feature counters, the key count grows as: `users * days * features`. After a year with 10 users and 5 features: 10 * 365 * 5 = 18,250 keys.

**Prevention:**
- Set TTL on all counter keys: daily counters get 48-hour TTL, weekly counters get 14-day TTL.
- Use Redis hash for daily counters: `HINCRBY nexus:usage:2026-02-20 user1:turns 1`. One key per day, one hash field per user+metric. Set TTL on the hash key.
- Periodically aggregate old counters to PostgreSQL for long-term storage and delete from Redis.

**Phase to address:** Usage tracking phase.

---

### P-24: `/compact` and `/reset` Commands Losing Critical State

**What goes wrong:** A user runs `/reset` to clear a frustrating conversation, not realizing it also clears: pinned system instructions they customized, tool permissions they configured, or pending scheduled tasks. Similarly, `/compact` might summarize away the user's initial instructions that set the agent's behavior for the session.

**Prevention:**
- **Confirmation step**: `/reset` shows what will be cleared and requires `/reset confirm`.
- **Preserve system-level state**: `/reset` clears conversation history but preserves: user preferences (stored in Redis separately from session), scheduled tasks, tool permissions.
- **`/compact` protects system prompt**: The compaction process never summarizes the system prompt or user-pinned instructions. These are always included verbatim.
- **Undo window**: After `/reset`, store the cleared session in Redis with a 5-minute TTL. Offer `/undo` to restore.

**Phase to address:** Chat commands phase.

---

## PHASE-SPECIFIC WARNINGS

| Phase/Topic | Likely Pitfall | Risk Level | Mitigation |
|---|---|---|---|
| **Stability (prerequisite)** | P-07: PM2 restart storm | CRITICAL | Fix unhandled rejections, setTimeout leaks, connection cleanup before adding features |
| **Stability (prerequisite)** | P-20: Redis cascade failures | HIGH | Circuit breaker, retry strategy, memory monitoring |
| **Stability (prerequisite)** | P-19: Telegram offset loss | HIGH | Persist offset to Redis, graceful shutdown |
| **Voice** | P-01: Latency stacking | CRITICAL | Stream everything, measure end-to-end from day one |
| **Voice** | P-02: STT credit burn | CRITICAL | VAD + push-to-talk, never always-on without budget |
| **Voice** | P-03: Browser autoplay block | CRITICAL | Gate behind user gesture, check AudioContext state |
| **Voice** | P-04: WebSocket churn | CRITICAL | Keep-alive, reconnection backoff, connection state machine |
| **Voice** | P-21: Sample rate mismatch | MINOR | Standardize pipeline format, explicit encoding params |
| **Canvas** | P-05: iframe XSS vs usability | CRITICAL | srcdoc + allow-scripts without allow-same-origin |
| **Canvas** | P-18: State management | MODERATE | Typed postMessage protocol, origin validation |
| **Multi-Agent** | P-06: Recursive deadlock | CRITICAL | DAG topology, per-agent turn limits, token budget |
| **Multi-Agent** | P-08: SDK tools:[] bypass | HIGH | Verify SDK fix or use OS-level sandboxing |
| **Multi-Agent** | P-09: Excessive turns | HIGH | Complexity classifier, tiered agent config |
| **Webhooks** | P-10: Auth + queue flood | HIGH | Signature verification, idempotent jobs, rate limits |
| **Gmail** | P-11: OAuth token expiry | HIGH | Proactive refresh, alert on failure, test with published app |
| **Gmail** | P-12: Pub/Sub watch expiry | HIGH | BullMQ scheduled renewal every 6 days |
| **Commands** | P-15: Command conflicts | MODERATE | Strict prefix matching, channel-appropriate parsing |
| **Commands** | P-24: Reset/compact data loss | MODERATE | Confirmation steps, preserve system state |
| **DM Pairing** | P-16: Code brute force | MODERATE | 8+ char codes, rate limiting, short TTL |
| **CLI Installer** | P-17: Platform differences | MODERATE | Docker-first, detect distro, rollback on failure |
| **Compaction** | P-13: Context loss | HIGH | Tiered compaction, pin critical facts, tool result summaries |
| **Usage Tracking** | P-14: No token visibility | HIGH | Estimate from text, track turns as proxy |
| **Usage Tracking** | P-22: Timezone issues | MINOR | UTC consistently, convert for display |
| **Usage Tracking** | P-23: Counter overflow | MINOR | TTL on all keys, hash-based counters |

---

## INTEGRATION PITFALLS WITH EXISTING SYSTEM

These pitfalls are specific to adding features to the existing LivOS/Nexus architecture.

### I-01: New WebSocket Connections Compound PM2 Restart Impact

Every new WebSocket connection (Deepgram, Cartesia, browser voice, canvas live reload) that the nexus-core process manages increases the blast radius of each PM2 restart. Currently, a restart loses Telegram + Discord connections. Adding voice WebSockets means a restart also drops all active voice calls mid-sentence.

**Mitigation:** Run voice WebSocket management in a separate process (e.g., `nexus-voice` PM2 process) that connects to nexus-core via Redis pub/sub. This isolates voice from core restarts.

### I-02: BullMQ Queue Sprawl

The existing system has `nexus-jobs` and `nexus-tasks` queues. Adding webhooks, Gmail, voice processing, and multi-agent orchestration could add 4-6 more queues. Each queue has its own worker, connection, and memory footprint. On a 4-8GB VPS, this becomes a resource concern.

**Mitigation:** Use a single queue with job type routing (BullMQ supports this via job names). Reserve separate queues only for features with fundamentally different processing characteristics (e.g., voice requires real-time processing vs. email can be async).

### I-03: Redis Key Namespace Collision

The existing system uses `nexus:` prefix for all keys. Adding features naively (e.g., `nexus:voice:session:123`, `nexus:canvas:state:456`, `nexus:gmail:token`, `nexus:webhook:processed:789`) can create thousands of keys without clear lifecycle management.

**Mitigation:** Define a key naming convention with TTL requirements: `nexus:{feature}:{entity}:{id}`. Document TTL for each key pattern. Use `SCAN` + TTL verification in a periodic cleanup job.

### I-04: SdkAgentRunner Concurrency on VPS

The current SdkAgentRunner spawns Claude Code SDK processes. On a 2-4 CPU VPS, running more than 2 concurrent SDK agent sessions will cause CPU contention that affects: voice processing latency, WebSocket keepalives, and Redis operations. Multi-agent sessions that spawn sub-agents compound this.

**Mitigation:** Implement a concurrency semaphore: max 2 concurrent SdkAgentRunner sessions. Queue additional requests. For multi-agent: the orchestrator and sub-agents share the 2-session budget (run sequentially, not in parallel).

---

## SOURCES

### Voice Pipeline
- [Deepgram Keep-Alive Documentation](https://developers.deepgram.com/docs/audio-keep-alive)
- [Deepgram STT Pricing](https://deepgram.com/pricing)
- [Cartesia TTS WebSocket API](https://docs.cartesia.ai/api-reference/tts/tts)
- [Cartesia Stream Inputs with Continuations](https://docs.cartesia.ai/build-with-cartesia/capability-guides/stream-inputs-using-continuations)
- [Cartesia Context Flushing](https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/context-flushing-and-flush-i-ds)
- [Voice AI Infrastructure Guide](https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025)
- [MDN Autoplay Guide](https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide)
- [MDN Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

### Canvas Security
- [Feroot iframe Security 2025](https://www.feroot.com/blog/how-to-secure-iframe-compliance-2025/)
- [Qrvey iframe Security Risks 2026](https://qrvey.com/blog/iframe-security/)
- [HackTricks iframe XSS Analysis](https://book.hacktricks.xyz/pentesting-web/xss-cross-site-scripting/iframes-in-xss-and-csp)

### Multi-Agent
- [Multi-Agent 17x Error Trap](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [Agentic Recursive Deadlock](https://tech-champion.com/artificial-intelligence/the-agentic-recursive-deadlock-llm-orchestration-collapses/)
- [Redis AI Agent Orchestration](https://redis.io/blog/ai-agent-orchestration/)
- [Claude Agent SDK Issue #115 - allowedTools bypass](https://github.com/anthropics/claude-agent-sdk-typescript/issues/115)

### Webhooks & Gmail
- [Svix Webhook Authentication Best Practices](https://www.svix.com/resources/webhook-best-practices/authentication/)
- [BullMQ Idempotent Jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)
- [Google OAuth invalid_grant Analysis](https://nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked)

### Session & Context
- [Anthropic Context Engineering Guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Forge Code Context Compaction](https://forgecode.dev/docs/context-compaction/)
- [Context Rot Research](https://research.trychroma.com/context-rot)

### Process Stability
- [Node.js WebSocket Memory Leak Patterns](https://oneuptime.com/blog/post/2026-01-24-websocket-memory-leak-issues/view)
- [PM2 Process Management Issues](https://github.com/Unitech/pm2/issues/5082)
- [Claude Code SDK Cost Tracking](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)

---

**Document Version:** 2.0 (v2.0 feature-specific pitfalls)
**Research Date:** 2026-02-20
**Pitfalls Cataloged:** 24 domain-specific + 4 integration-specific
**Confidence:** HIGH for voice, canvas, webhooks, Gmail, stability. MEDIUM for usage tracking token visibility.
