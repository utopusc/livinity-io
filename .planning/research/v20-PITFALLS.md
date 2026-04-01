# Domain Pitfalls: Replacing Nexus AI Layer with Claude Agent SDK

**Domain:** Replacing a custom multi-provider AI API layer (AgentLoop + ProviderManager + KimiAgentRunner) with the Claude Agent SDK in an Express/tRPC backend
**Researched:** 2026-03-26
**Overall confidence:** HIGH (verified through official Anthropic docs, GitHub issues, codebase analysis, CVE disclosures)

---

## Critical Pitfalls

Mistakes that cause rewrites, security incidents, or major production outages.

---

### Pitfall 1: 12-Second query() Startup Overhead Kills Chat UX

**What goes wrong:**
The Claude Agent SDK spawns a fresh Claude Code subprocess for every `query()` call. This incurs a consistent ~12-second initialization overhead before the first token arrives, regardless of task complexity. A simple "hello" greeting takes 12+ seconds. The existing system (direct Anthropic SDK via `ClaudeProvider.chatStream()`) achieves first-token in ~1-2 seconds.

**Why it happens:**
The SDK's `query()` function boots a new Node.js process, initializes the Claude Code runtime, loads MCP servers, and sets up the tool environment from scratch each time. There is no hot process reuse or daemon mode -- this is a recognized gap (GitHub issue anthropics/claude-agent-sdk-typescript#33, #34). The existing `SdkAgentRunner` in the codebase already suffers from this.

**Consequences:**
- Users experience 12-second latency for every message, making chat feel broken
- Mobile/tunnel users on high-latency connections may time out waiting
- Multi-turn conversations compound the overhead (12s per follow-up, even with `continue: true`)
- The current direct-SDK approach (`ClaudeProvider`) is 6-10x faster for first token

**Prevention:**
1. Do NOT use `query()` for the primary chat path. Use the Anthropic Messages API directly (`@anthropic-ai/sdk`) with `client.messages.stream()` for low-latency streaming, then layer Agent SDK features (tool execution, sessions) on top.
2. If Agent SDK is required for complex multi-tool tasks, use it selectively: route simple chat through direct API, route "agent tasks" through SDK.
3. Watch for the daemon mode feature request (issue #33) -- if shipped, it would eliminate the overhead. Do not assume it will ship on any timeline.
4. The existing `SdkAgentRunner` already demonstrates this overhead. Any replacement architecture must not regress from current `ClaudeProvider.chatStream()` latency.

**Detection:** Time-to-first-byte (TTFB) exceeding 5 seconds consistently. The existing `AgentResult.ttfbMs` metric already tracks this.

**Suggested phase:** Phase 1 (architecture decision). This determines the entire streaming architecture.

**Confidence:** HIGH -- verified via GitHub issue #34 with reproducible benchmarks, confirmed in existing `SdkAgentRunner` behavior.

**Sources:**
- [GitHub Issue #34: ~12s overhead per call](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34)
- [GitHub Issue #33: Daemon mode feature request](https://github.com/anthropics/claude-agent-sdk-typescript/issues/33)

---

### Pitfall 2: SSE Stream Hangs Indefinitely on Silent Connection Death

**What goes wrong:**
When the TCP connection between client and server silently dies (common on WiFi, VPN, mobile, or laptop sleep), the Node.js HTTP client has no way to detect the dead connection. The SSE stream hangs forever -- no timeout, no error, no recovery. The user sees a frozen UI with no indication of failure.

**Why it happens:**
Neither the Anthropic API client nor the Agent SDK implements heartbeat detection or read timeouts on the SSE stream. When intermediate proxies (Caddy, Cloudflare Tunnel) or the network silently drop the connection, the TCP socket remains open on the server side but no data flows. The existing codebase already implements a 15-second heartbeat (`setInterval` in the SSE endpoint), but this only keeps the server-to-client connection alive through Caddy -- it does nothing when the Anthropic API stream stalls.

**Consequences:**
- Agent appears to be "thinking" forever with no way to cancel
- Server resources (memory, Redis connections, subprocess) are held indefinitely
- No automatic retry or recovery
- The hang frequency has been reported as 10-15% of prompts per hour in some environments (GitHub issue #25979)

**Prevention:**
1. Implement a server-side read timeout on the Anthropic API stream. If no data (including empty heartbeat events) arrives within 30 seconds, abort the request and emit an error to the client.
2. Wrap the `for await (const message of messages)` loop in a timeout/race pattern:
   ```typescript
   const STREAM_READ_TIMEOUT = 30_000;
   let lastEventTime = Date.now();
   const watchdog = setInterval(() => {
     if (Date.now() - lastEventTime > STREAM_READ_TIMEOUT) {
       controller.abort(); // AbortController passed to query()
     }
   }, 5_000);
   ```
3. On the client side, implement EventSource reconnection with exponential backoff. The current `res.on('close')` handler only fires when TCP actually closes, not on silent death.
4. The existing `res.socket?.setNoDelay(true)` and heartbeat interval are good but insufficient. Add a server-to-client `event: ping` every 15 seconds AND a client-side "no data in 30s = reconnect" policy.

**Detection:** Agent sessions with no `final_answer` or `done` event. Monitor for sessions exceeding `timeoutMs` without completion.

**Suggested phase:** Phase 2 (streaming infrastructure). Must be solved before any other streaming work.

**Confidence:** HIGH -- verified via GitHub issues #25979 and #33949, confirmed in Anthropic's own March 2026 fix for POST SSE ping events.

**Sources:**
- [GitHub Issue #25979: Indefinite hang on stalled connection](https://github.com/anthropics/claude-code/issues/25979)
- [GitHub Issue #33949: SSE streaming hangs analysis](https://github.com/anthropics/claude-code/issues/33949)
- [GitHub Issue #26729: Streaming resilience feature request](https://github.com/anthropics/claude-code/issues/26729)

---

### Pitfall 3: Subprocess Memory Leak from Unterminated SDK Processes

**What goes wrong:**
The Agent SDK spawns Claude Code subprocesses that complete their API work but are never killed. When using `resume` or when errors occur mid-execution, zombie subprocesses accumulate and consume memory. In one reported case, killing a daemon process freed 2.3 GB of leaked memory.

**Why it happens:**
The SDK does not implement proper subprocess lifecycle management. When `query()` returns (or throws), the underlying Claude Code process may still be running. Sessions are kept indefinitely on disk (`~/.claude/projects/`) without automatic cleanup. The existing `KimiAgentRunner` handles this correctly with explicit `child.kill('SIGTERM')` and a 5-second `SIGKILL` fallback, but the Agent SDK provides no equivalent hook.

**Consequences:**
- Server4 has 8GB RAM. Leaked subprocesses can exhaust memory in hours of active use
- PM2 will restart nexus-core when it OOMs, dropping all active SSE connections
- Session files accumulate on disk (~/.claude/projects/) with no TTL
- Multi-user scenario: N users x leaked processes = N x memory growth

**Prevention:**
1. After every `query()` call (success or error), verify no orphan processes remain. Use `process.on('exit')` and explicit cleanup.
2. Implement a process reaper that periodically checks for orphaned `claude` subprocesses and kills them.
3. Set `persistSession: false` in query options to prevent disk accumulation (already done in existing `SdkAgentRunner`).
4. Set resource limits on the nexus-core PM2 process: `max_memory_restart: '2G'` as a safety net.
5. Implement per-user process tracking in a Map so leaked processes can be associated with their owner and cleaned up on disconnect.

**Detection:** Monitor RSS memory of the nexus-core process. Alert if it exceeds 1.5GB. Check for orphan `claude` or `node` processes with `ps aux | grep claude`.

**Suggested phase:** Phase 2 (streaming infrastructure). Process lifecycle management is a prerequisite for production stability.

**Confidence:** HIGH -- verified via GitHub issues about memory leaks and subprocess management.

**Sources:**
- [GitHub Issue: Worker daemon subprocess leak](https://github.com/thedotmack/claude-mem/issues/1089)
- [GitHub Issue #32304: claude.exe grows to 21GB+ on Windows](https://github.com/anthropics/claude-code/issues/32304)

---

### Pitfall 4: Tool Execution Security -- Prompt Injection via Untrusted Content

**What goes wrong:**
Claude Code has had multiple CVEs for arbitrary code execution through malicious configuration files and prompt injection. CVE-2025-59536 (CVSS 8.7) allowed arbitrary shell commands on tool initialization. CVE-2026-21852 enabled API key exfiltration through attacker-controlled base URLs. These affect the Agent SDK because it runs the same Claude Code runtime.

**Why it happens:**
The Agent SDK executes commands in a persistent shell environment with the same permissions as the nexus-core process (root on Server4). When Claude processes untrusted content (user messages, web scraping results, file contents), a prompt injection attack can instruct it to call shell tools with malicious commands. The existing `permissionMode: 'dontAsk'` setting in `SdkAgentRunner` auto-approves ALL tool calls with no human gate.

**Consequences:**
- Root-level shell access means a prompt injection could: delete files, exfiltrate secrets, install backdoors, or pivot to other services
- The existing dangerous command blocklist (21 patterns in the agent tool system) is bypassed when using SDK-native tools
- Multi-user environment: one user's malicious input could compromise other users' data
- API keys stored in Redis could be exfiltrated

**Prevention:**
1. NEVER run the Agent SDK as root. Create a dedicated `nexus-agent` user with minimal permissions.
2. Use the SDK's permission system (`allowedTools` whitelist) to restrict available tools. Do NOT use `permissionMode: 'dontAsk'` with a broad tool set.
3. Re-implement the existing dangerous command blocklist as a tool execution wrapper that checks commands before passing to shell.
4. Use container-based sandbox isolation per Anthropic's official guidance: `--cap-drop ALL`, `--network none`, `--read-only` root filesystem.
5. Route all API credentials through a proxy outside the agent's security boundary, not environment variables.
6. If using MCP tools (nexus-tools), the tool handlers already have the existing security layer. Keep this rather than replacing with raw SDK tool execution.

**Detection:** Audit logging of all tool calls and their arguments. Alert on shell commands matching the existing blocklist patterns. Monitor for outbound network connections to unexpected hosts.

**Suggested phase:** Phase 1 (architecture) for the security model decision, Phase 2 for implementation.

**Confidence:** HIGH -- verified via published CVEs and Anthropic's official secure deployment guide.

**Sources:**
- [CVE-2025-59536: RCE through project files](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/)
- [CVE-2026-21852: API key exfiltration](https://thehackernews.com/2026/02/claude-code-flaws-allow-remote-code.html)
- [Anthropic: Securely deploying AI agents](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)

---

### Pitfall 5: Removing Provider Abstraction Creates Vendor Lock-in With No Escape Hatch

**What goes wrong:**
The v20.0 plan says "Remove Nexus AI API layer (agent loop, provider abstraction, token/tool limits)." Deleting `ProviderManager`, `KimiProvider`, `ClaudeProvider`, and `AIProvider` interface permanently locks the system to Claude. If Anthropic has an outage, raises prices, or changes terms, there is no fallback. The existing dual-provider system with automatic failover (Kimi as fallback) would be lost.

**Why it happens:**
The temptation is to simplify: "We're all-in on Claude, so remove the abstraction." But the abstraction layer is only ~700 lines total (types.ts + manager.ts + normalize.ts) and provides genuine operational resilience. Kimi was the sole provider from v1.0-v5.0 and was restored in v16.0 precisely because single-provider dependency was identified as a risk.

**Consequences:**
- Claude API outage = zero AI functionality for all users
- Claude rate limits (429) with no fallback = users see errors
- Price increases have no alternative path
- The `AIProvider` interface (74 lines) and `ProviderManager` (244 lines) are small costs for high optionality

**Prevention:**
1. Keep the `AIProvider` interface and `ProviderManager` skeleton even if Kimi support is deprioritized. This is 300 lines of code for infinite optionality.
2. Implement the Claude Agent SDK integration as a new provider/runner, not a replacement of the abstraction layer.
3. Remove the Kimi-specific code (KimiProvider, KimiAgentRunner) if desired, but keep the interface for future providers.
4. Make "which agent runner to use" a config decision, not a code decision. The existing `authMethod === 'sdk-subscription' ? new SdkAgentRunner() : new AgentLoop()` pattern is correct.

**Detection:** If the codebase has no provider interface after the migration, this pitfall was hit.

**Suggested phase:** Phase 1 (architecture decision). Decide what stays and what goes before writing any code.

**Confidence:** HIGH -- based on codebase analysis showing the abstraction is tiny and was deliberately restored in v16.0.

---

## Moderate Pitfalls

Mistakes that cause significant rework or degraded UX but are recoverable.

---

### Pitfall 6: Conversation State Migration Breaks Multi-Turn Chat

**What goes wrong:**
The existing system stores conversation history in Redis (`nexus:session_history:{sessionId}`) as a list of `{role, content, timestamp}` objects. The Agent SDK stores sessions as JSONL files on disk at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. These formats are incompatible. Migrating from one to the other without a bridge layer means losing all conversation context during the transition.

**Why it happens:**
Two fundamentally different state models:
- **Existing:** Redis-based, per-sender, with idle timeout and auto-compaction. Messages are simple role/content pairs.
- **Agent SDK:** File-based, per-working-directory, with full tool call/result history. Messages include BetaMessage content blocks (text, tool_use, tool_result).

Additionally, the SDK session path depends on `cwd` -- `~/.claude/projects/<encoded-cwd>/`. If the server's working directory changes (PM2 restart, deploy), sessions become unreachable.

**Prevention:**
1. Do NOT migrate existing conversation history into Agent SDK sessions. Instead, implement a clean break: new conversations use the new system, old history is archived.
2. For conversation continuity, extract the last N messages from Redis history and inject them as context in the Agent SDK's `systemPrompt` or `prompt` field, rather than trying to convert them to SDK session format.
3. If using `persistSession: false` (recommended for server deployments), manage conversation state entirely in Redis/PostgreSQL yourself and pass it as context on each call.
4. Implement a transition period where both systems coexist: old conversations continue on the old system, new conversations use the new system.

**Suggested phase:** Phase 2 (backend integration). Session architecture must be designed before building the streaming layer.

**Confidence:** HIGH -- verified via official SDK session documentation showing file-based storage with cwd dependency.

**Sources:**
- [Anthropic: Work with sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)

---

### Pitfall 7: AbortController Cancellation Corrupts Session State

**What goes wrong:**
Using `AbortController` to cancel a running `query()` call (e.g., user hits stop button, navigates away) can corrupt the session state, making subsequent `resume` calls fail or exit immediately with an error.

**Why it happens:**
When you abort a running query immediately after the init message, the session JSONL file may be written in an incomplete state. The next `resume` with the same `session_id` encounters malformed data and fails. The workaround is to always use `forkSession: true` after an abort, but this loses the conversation continuity.

**Consequences:**
- User clicks "Stop" during agent execution, then their next message fails
- Must create a new session (losing context) to recover
- The existing system's `res.on('close')` + `agent.removeListener('event', sendEvent)` pattern works cleanly because it just stops listening without corrupting state

**Prevention:**
1. If using `persistSession: false`, abortion is safe because there is no disk state to corrupt. Strongly prefer this for server deployments.
2. If sessions must persist, implement a session recovery layer: on abort, mark the session as "interrupted" in your own database, and fork on the next message.
3. Never abort during the first few seconds of a query (before the init message completes). Add a minimum runtime before allowing cancellation.
4. Implement the "stop" button as a soft stop: set a flag that causes the event handler to stop forwarding events to the client, but let the query() complete naturally. Only use hard abort for timeouts.

**Suggested phase:** Phase 3 (UI interaction). Stop/cancel behavior is a UI-level concern built on the streaming foundation.

**Confidence:** HIGH -- verified via GitHub issue #69 with reproduction steps.

**Sources:**
- [GitHub Issue #69: AbortController after init causes resume failure](https://github.com/anthropics/claude-agent-sdk-typescript/issues/69)

---

### Pitfall 8: Cost Tracking Loses Accuracy Without the UsageTracker Integration

**What goes wrong:**
The existing `UsageTracker` (in `usage-tracker.ts`) tracks per-session, daily, and cumulative token usage in Redis with cost estimation. The Agent SDK reports `total_cost_usd` only on the final `result` message. If the query is aborted, errors out mid-stream, or the SSE connection drops, the cost data is lost. There is no equivalent of the existing per-turn token tracking.

**Why it happens:**
The SDK accumulates usage internally and reports it as a lump sum at the end. The existing system tracks usage incrementally (every provider response updates Redis). During the migration, if the `UsageTracker` integration is not maintained, all the usage/cost dashboards, `/usage` command, and daily rollups break.

**Consequences:**
- No cost visibility during long-running agent tasks (user watches agent work for 2 minutes with no cost indicator)
- Aborted sessions have zero cost recorded, even though tokens were consumed
- The `/usage` slash command and usage display modes ('off', 'tokens', 'full', 'cost') stop working
- Multi-user environments: no per-user cost tracking for future billing

**Prevention:**
1. Continue to estimate tokens from content length during streaming (the existing `estimatedTokens += Math.ceil(text.length / 4)` pattern in both runners).
2. On `result` message, reconcile the estimate with the authoritative `total_cost_usd` and `usage` fields.
3. On error/abort, persist the estimate (it is better than zero).
4. Deduplicate parallel tool call usage by tracking `message.message.id` (the SDK sends duplicate usage for parallel tool calls with the same ID).
5. Integrate the `total_cost_usd` from each query into the existing `UsageTracker.recordSession()` flow.

**Suggested phase:** Phase 2 (backend integration). Cost tracking must be wired up alongside the new agent runner.

**Confidence:** HIGH -- verified via official cost tracking documentation showing per-query-only reporting.

**Sources:**
- [Anthropic: Track cost and usage](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)

---

### Pitfall 9: No Server-Side Budget Cap Without Custom Implementation

**What goes wrong:**
The v20.0 plan removes the Nexus AI Settings panel including "token limits" and "tool limits" UI. But removing the UI does not mean removing the need. Without server-side spending caps, a single runaway agent loop or a prompt injection attack can consume hundreds of dollars in API credits in minutes. The Anthropic API has organization-level spending limits but no per-request or per-user budget enforcement.

**Why it happens:**
The Agent SDK provides `maxTurns` (limits loop iterations) and `maxBudgetUsd` (TypeScript only, sets a cost ceiling per query) but these must be explicitly set. If omitted, the agent runs until it decides to stop. The existing system has `maxTokens` (200,000 default) and `maxTurns` (30 default) hardcoded in `resolveAgentConfig()`.

**Consequences:**
- A multi-tool agent task using Opus ($15/M input, $75/M output) could cost $50+ in a single session
- Multi-user environment: one user's expensive query affects everyone's rate limit
- No per-user budget allocation means no fair usage in shared deployments
- Without the Settings UI, there is no user-facing way to set limits

**Prevention:**
1. Always set `maxTurns` (default 25-30) and `maxBudgetUsd` (e.g., $5 per query) on every `query()` call.
2. Implement a server-side cost accumulator per user per day in Redis. Before starting a new query, check if the user has exceeded their daily budget.
3. Keep the `estimatedTokens` tracking from the existing runners as a backup enforcement mechanism.
4. Even without a Settings UI, have sensible server-side defaults that cannot be overridden by client requests.
5. Log every `total_cost_usd` to Redis and expose it via an API endpoint for future admin dashboards.

**Suggested phase:** Phase 2 (backend integration). Budget enforcement must exist before the system goes live.

**Confidence:** HIGH -- based on codebase analysis of existing budget controls and Anthropic pricing documentation.

**Sources:**
- [Anthropic: Rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Claude API quota tiers](https://www.aifreeapi.com/en/posts/claude-api-quota-tiers-limits)

---

### Pitfall 10: Existing Tool System (ToolRegistry + MCP) Stops Working After Migration

**What goes wrong:**
The existing system has a rich `ToolRegistry` with 20+ tools (shell, docker_list, docker_manage, docker_exec, files, web_search, scrape, memory, pm2, sysinfo, etc.) plus MCP server integration (nexus-tools on port 3100, Chrome DevTools). The Agent SDK uses a different tool format (Zod schemas for custom tools, MCP protocol for servers). If the migration breaks the tool bridge, the AI loses all server management capabilities.

**Why it happens:**
Three different tool systems coexist:
1. **Nexus ToolRegistry:** Imperative tool definitions with `execute()` handlers
2. **MCP Server (nexus-tools):** HTTP server on port 3100 exposing ToolRegistry tools via MCP protocol
3. **Agent SDK Tools:** Zod-schema-based tool definitions via `tool()` helper and `createSdkMcpServer()`

The existing `SdkAgentRunner.buildSdkTools()` already bridges ToolRegistry to SDK format. But if the migration removes or refactors ToolRegistry, the bridge breaks. Remote PC Control Agent tools (dynamically registered via proxy) are especially fragile because they come and go as devices connect/disconnect.

**Prevention:**
1. Keep `ToolRegistry` as the single source of truth for tool definitions. Bridge to whatever format the agent runner needs.
2. The existing `buildSdkTools()` function in `sdk-agent-runner.ts` is the correct pattern. Preserve it.
3. For dynamic tools (Remote PC, Chrome DevTools), ensure the tool list is refreshed before each query, not cached from process startup.
4. Test tool execution end-to-end: send a message that requires a tool call (e.g., "show system info") and verify the full chain works.
5. The `ToolPolicy` system (profiles: minimal, basic, coding, full) must continue to filter tools for different contexts.

**Suggested phase:** Phase 2 (backend integration). Tool bridge is the first thing to implement and test.

**Confidence:** HIGH -- based on codebase analysis of existing tool architecture.

---

## Minor Pitfalls

Issues that cause friction or small bugs, recoverable with moderate effort.

---

### Pitfall 11: Windows Subprocess Console Window Flash

**What goes wrong:**
On Windows (relevant for development), the Agent SDK spawns a Claude Code subprocess that briefly shows a console window. This is a cosmetic issue but can be confusing during development and testing.

**Why it happens:**
Node.js `child_process.spawn()` on Windows opens a console window by default. The `windowsHide` option exists but is not exposed by the SDK.

**Prevention:** This is a development-only issue. Production runs on Linux (Server4). For local development, use WSL2 or ignore the flash. GitHub issue #103 tracks this.

**Suggested phase:** Not phase-specific. Development environment issue.

**Confidence:** MEDIUM -- reported in GitHub issue, not verified locally.

**Sources:**
- [GitHub Issue #103: windowsHide option](https://github.com/anthropics/claude-agent-sdk-typescript/issues/103)

---

### Pitfall 12: Environment Variable Leakage Between Parent and SDK Subprocess

**What goes wrong:**
The SDK subprocess inherits environment variables from the parent process. Variables like `HTTP_PROXY`, `ANTHROPIC_API_KEY`, and custom `CLAUDE_*` variables from the parent nexus-core process leak into the SDK subprocess, potentially overriding intended configuration.

**Why it happens:**
The SDK's `getAgentEnv()` function only excludes specific variables (`ANTHROPIC_API_KEY`, `CLAUDECODE`). Other sensitive variables (Redis passwords, JWT secrets, internal API keys) in the nexus-core environment are visible to the SDK subprocess and, by extension, to any tool the agent calls.

**Prevention:**
1. Use the SDK's `options.env` to explicitly set a minimal environment for the subprocess.
2. Never store secrets in environment variables that the agent process can access. Use Redis or file-based secrets.
3. The existing pattern of reading JWT secret from `/data/secrets/jwt` (file) rather than `JWT_SECRET` (env) is correct. Extend this pattern to all secrets.

**Suggested phase:** Phase 2 (backend integration). Environment configuration during agent runner setup.

**Confidence:** MEDIUM -- based on SDK documentation and env var inheritance behavior.

---

### Pitfall 13: Module Resolution Failures on SDK Version Updates

**What goes wrong:**
The Agent SDK has had multiple module resolution bugs across versions: missing entry points (issue #10191 on the `@anthropic-ai/claude-code` package), broken imports under NodeNext/Bundler resolution (fixed in v0.2.69), and mismatched exports maps.

**Why it happens:**
The SDK is rapidly evolving (v0.2.71 as of March 2026). Semver minor/patch updates have introduced breaking module resolution changes. The existing `package.json` pins to a specific version, but `npm update` or a fresh install could pull a broken version.

**Prevention:**
1. Pin the exact SDK version in `package.json` (e.g., `"@anthropic-ai/claude-agent-sdk": "0.2.71"`, not `"^0.2.71"`).
2. Use a lockfile (`package-lock.json`) and commit it.
3. Test imports after any SDK version update before deploying.
4. The existing nexus-core build step (`npm run build --workspace=packages/core`) would catch compile-time import errors, but only if the test suite exercises the SDK imports.

**Suggested phase:** Phase 1 (setup). Pin version during initial integration.

**Confidence:** MEDIUM -- verified via GitHub issue #10191 and CHANGELOG.md.

**Sources:**
- [GitHub Issue #10191: Missing entry point](https://github.com/anthropics/claude-code/issues/10191)
- [CHANGELOG.md](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)

---

### Pitfall 14: Multi-User Session Isolation Requires Custom CWD Management

**What goes wrong:**
The Agent SDK stores sessions under `~/.claude/projects/<encoded-cwd>/`. Since nexus-core runs as a single process serving all users, all sessions share the same working directory encoding. User A can potentially `resume` User B's session if they know (or guess) the session ID.

**Why it happens:**
The SDK was designed for single-developer use (one person, one machine). Multi-user isolation was not a design goal. The `persistSession: false` option avoids disk-based sessions entirely, but then multi-turn continuity requires custom state management.

**Prevention:**
1. Use `persistSession: false` for all server-side queries. Manage conversation state in Redis/PostgreSQL keyed by userId.
2. If persistence is needed, set a unique `cwd` per user (e.g., `/tmp/nexus-sessions/{userId}/`) to isolate session files.
3. Never pass session IDs from client requests without validating they belong to the requesting user.
4. The existing `SessionManager` with per-sender Redis keys is the correct model. Keep it.

**Suggested phase:** Phase 2 (backend integration). Session isolation is a multi-user requirement.

**Confidence:** HIGH -- verified via official session documentation describing cwd-based storage.

---

### Pitfall 15: Removing the AI Settings UI Removes the Only Cost Visibility

**What goes wrong:**
The v20.0 plan removes the "Nexus AI Settings panel (token limits, tool limits, model selection)." This panel is currently the only way users see their usage, change models, and set limits. Removing it without a replacement means zero cost visibility and zero user control.

**Why it happens:**
The panel is tightly coupled to the old provider/tier system. Removing the old system naturally removes the panel. But the functionality (see my usage, set a budget, pick a model) is still needed.

**Prevention:**
1. Replace the Settings panel, don't just delete it. Minimum viable replacement: a "Usage" section showing daily/cumulative spend from `UsageTracker`.
2. Even if model selection is removed (Claude-only), keep a read-only display of which model/tier is active.
3. Implement a simple "monthly budget" input that sets a per-user Redis key, enforced server-side.
4. Plan the replacement UI in the same phase as the removal, not "later."

**Suggested phase:** Phase 4 (UI cleanup). But must be planned in Phase 1.

**Confidence:** HIGH -- based on codebase analysis of existing settings integration.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Architecture Decision (Phase 1) | Choosing query()-only approach with 12s overhead | Hybrid: direct API for chat, SDK for complex tasks |
| Architecture Decision (Phase 1) | Deleting provider abstraction entirely | Keep AIProvider interface, implement SDK as a new runner |
| Architecture Decision (Phase 1) | No security model for tool execution | Design sandbox boundaries before any code |
| Streaming Infrastructure (Phase 2) | SSE hangs on dead connections | Server-side read timeout + client reconnection |
| Streaming Infrastructure (Phase 2) | Subprocess memory leaks | Process lifecycle management with reaper |
| Backend Integration (Phase 2) | Tool bridge breaks for dynamic tools | Keep ToolRegistry, bridge to SDK format |
| Backend Integration (Phase 2) | Conversation state format mismatch | Use persistSession: false, manage state in Redis |
| Backend Integration (Phase 2) | Cost tracking gaps on abort/error | Estimate during stream, reconcile on completion |
| Backend Integration (Phase 2) | No server-side budget cap | Always set maxTurns + maxBudgetUsd |
| UI Streaming (Phase 3) | AbortController corrupts session | Soft stop (stop forwarding), hard abort only for timeout |
| UI Cleanup (Phase 4) | No replacement for removed Settings panel | Plan replacement UI in Phase 1, build in Phase 4 |

---

## Integration-Specific Pitfalls: Express/tRPC + Claude Agent SDK

### Express SSE Endpoint Considerations

The existing `POST /api/agent/stream` endpoint pattern (Express SSE with `text/event-stream`) is correct for the Agent SDK integration. Key issues specific to this Express integration:

1. **Buffering through Caddy reverse proxy:** The existing `X-Accel-Buffering: no` header and `res.socket?.setNoDelay(true)` are essential. Without them, Caddy buffers SSE events and delivers them in batches, destroying the real-time feel. Keep these when migrating.

2. **Request body vs response close:** The current comment `// Handle client disconnect -- use res.on('close'), NOT req.on('close')` documents a real bug that was hit. `req.on('close')` fires when the POST body finishes reading (immediately), not when the client disconnects. This must be preserved.

3. **Heartbeat through tunnel relay:** LivOS connections go through Cloudflare Tunnel (Server5). Intermediate proxies may kill idle connections after 60-100 seconds. The existing 15-second heartbeat interval must be maintained.

4. **tRPC route registration:** If any new routes are added for the agent system, they MUST be added to `httpOnlyPaths` in `common.ts`. tRPC routes that go through WebSocket will hang if the WS connection is disconnected (documented in existing pitfalls).

5. **Multi-user JWT extraction:** The existing `extractUserIdFromRequest(req)` pattern must be preserved to maintain per-user session isolation. The Agent SDK knows nothing about LivOS users.

### Graceful Degradation Strategy

If the Claude API is unavailable (outage, rate limit, network issue):

1. **If ProviderManager is kept:** Automatic fallback to Kimi (existing behavior)
2. **If ProviderManager is removed:** The AI chat is completely dead. Must implement at minimum:
   - A clear error message to the user (not a hang)
   - Retry with exponential backoff (existing `infra/retry.ts` and `infra/backoff.ts`)
   - Queue the message and process when API returns (optional, complex)

---

## Sources

### Official Documentation
- [Anthropic: Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Anthropic: Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting)
- [Anthropic: Securely deploying AI agents](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)
- [Anthropic: Work with sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Anthropic: Track cost and usage](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)
- [Anthropic: Rate limits](https://platform.claude.com/docs/en/api/rate-limits)

### GitHub Issues (verified)
- [Issue #34: 12s query() overhead](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34)
- [Issue #33: Daemon mode request](https://github.com/anthropics/claude-agent-sdk-typescript/issues/33)
- [Issue #69: AbortController corrupts session](https://github.com/anthropics/claude-agent-sdk-typescript/issues/69)
- [Issue #25979: Indefinite hang on stalled stream](https://github.com/anthropics/claude-code/issues/25979)
- [Issue #33949: SSE streaming hangs analysis](https://github.com/anthropics/claude-code/issues/33949)
- [Issue #10191: Missing npm entry point](https://github.com/anthropics/claude-code/issues/10191)
- [Issue #103: Windows console flash](https://github.com/anthropics/claude-agent-sdk-typescript/issues/103)

### Security Advisories
- [CVE-2025-59536: RCE through project files](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/)
- [CVE-2026-21852: API key exfiltration](https://thehackernews.com/2026/02/claude-code-flaws-allow-remote-code.html)
