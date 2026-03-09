# Feature Mapping: Claude Code to Kimi Code Migration

**Domain:** AI provider migration -- replacing Claude Code SDK with Kimi Code CLI/SDK
**Researched:** 2026-03-09
**Overall confidence:** MEDIUM-HIGH

---

## Executive Summary

Kimi Code CLI and its Agent SDK (`@moonshot-ai/kimi-agent-sdk`) provide a surprisingly close 1:1 mapping to Claude Code's SDK. The core architecture is nearly identical: a CLI subprocess that handles tool calling, MCP integration, streaming, and permissions -- exposed via a language-native SDK. The migration is feasible with **no architectural rewrites** needed. Key differences: Kimi uses session-based interaction (`createSession` + `session.prompt`) vs Claude's one-shot `query()`, different event/message types, and a different auth credential format. The biggest risk is MCP tool registration -- Kimi's SDK reuses the CLI's MCP config rather than allowing inline `createSdkMcpServer()`, requiring either a file-based workaround or wire-mode integration.

---

## Feature-by-Feature Mapping

### FM-01: Agent Runner (SdkAgentRunner)

**Claude Code:** `query()` from `@anthropic-ai/claude-agent-sdk` -- one-shot function that spawns CLI subprocess, passes prompt/options, yields async iterator of `SDKMessage` objects.

**Kimi Code:** `createSession()` + `session.prompt()` from `@moonshot-ai/kimi-agent-sdk` -- creates a persistent session, then `session.prompt(content)` returns a `Turn` object that is an async iterator of `StreamEvent` objects.

| Claude SDK | Kimi SDK | Notes |
|------------|----------|-------|
| `query({prompt, options})` | `createSession(opts)` + `session.prompt(text)` | Kimi separates session creation from prompting |
| `options.systemPrompt` | Agent file `system_prompt_path` or `--agent-file` | Kimi uses agent YAML files for system prompts, not inline strings |
| `options.model` | `SessionOptions.model` | Direct equivalent |
| `options.maxTurns` | `--max-steps-per-turn` CLI flag | No SDK-level option found; may need CLI flag passthrough |
| `options.permissionMode: 'dontAsk'` | `SessionOptions.yoloMode: true` | Direct equivalent |
| `options.persistSession: false` | Session is persistent by default; `session.close()` to clean up | Different default -- need explicit cleanup |
| `for await (const msg of messages)` | `for await (const event of turn)` | Same async iteration pattern |

**Complexity:** Medium
**Confidence:** HIGH (SDK README documents createSession and Turn interface)

### FM-02: MCP Tool Registration

**Claude Code:** `createSdkMcpServer({name, tools})` creates an in-process MCP server. Tools defined with `tool(name, desc, zodShape, handler)`. Passed inline via `options.mcpServers`.

**Kimi Code:** MCP servers configured via `~/.kimi/mcp.json` file OR `--mcp-config-file`/`--mcp-config` CLI flags. Supports stdio and HTTP transports. The SDK "reuses the same Kimi CLI configuration, tools, skills, and MCP servers."

| Claude SDK | Kimi Code | Gap? |
|------------|-----------|------|
| `createSdkMcpServer({name, tools})` | No direct equivalent for in-process MCP | **YES -- CRITICAL GAP** |
| Inline MCP server in `options.mcpServers` | File-based `~/.kimi/mcp.json` or `--mcp-config` JSON string | Workaround exists |
| `tool(name, desc, zodShape, handler)` | Python dependency injection tools (`module:ClassName`) | Different paradigm |

**Workaround for MCP tool gap:**
1. **Option A (Recommended):** Run Nexus tools as a real stdio MCP server process. Create a lightweight Node.js MCP server binary that Kimi CLI spawns as a subprocess. Configure in mcp.json: `{"command": "node", "args": ["nexus-mcp-server.js"]}`. This is already partially built -- `createSdkMcpServer` in the current code essentially does this.
2. **Option B:** Use wire mode's `ToolCallRequest` to intercept tool calls and handle them in the host process. Wire mode supports registering external tools via the `initialize` method.
3. **Option C:** Use `--mcp-config` CLI flag to pass MCP config as JSON string when spawning the session, pointing to a Nexus stdio MCP server.

**Complexity:** High (requires building a standalone MCP server binary or adapting to wire mode)
**Confidence:** MEDIUM (wire mode ToolCallRequest documented but not verified in SDK context)

### FM-03: Streaming Events

**Claude Code:** Messages are typed as `SDKMessage` with subtypes: `assistant` (contains BetaMessage with content blocks), `result` (SDKResultSuccess/SDKResultError with usage).

**Kimi Code:** Events are typed `StreamEvent` with specific event types.

| Claude Event | Kimi Event | Content |
|-------------|------------|---------|
| `message.type === 'assistant'` | `event.type === 'ContentPart'` | Text/thinking content |
| `block.type === 'text'` | `payload.type === 'text'` with `text: string` | Direct mapping |
| `block.type === 'tool_use'` | `event.type === 'ToolCall'` | Tool invocation |
| `message.type === 'result'` (success) | `turn.result` (Promise resolving to `RunResult`) | Final status |
| `SDKResultSuccess.usage` | `StatusUpdate` event with `TokenUsage` | Token counts |
| N/A | `event.type === 'ApprovalRequest'` | Permission request |
| N/A | `event.type === 'SubagentEvent'` | Nested agent messages |
| N/A | `payload.type === 'think'` | Thinking/reasoning (extended thinking) |

**Token usage fields differ:**
- Claude: `usage.input_tokens`, `usage.output_tokens`
- Kimi: `input_other`, `output`, `input_cache_read`, `input_cache_creation` (more granular, includes cache info)

**Complexity:** Medium (event type mapping is straightforward but requires updating all event handlers)
**Confidence:** HIGH (event types fully documented in SDK README)

### FM-04: Model Selection

**Claude Code:** Model tiers map to specific Claude model IDs: `claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-6`.

**Kimi Code:** Multiple model IDs available, roughly mapping to tiers.

| LivOS Tier | Claude Model | Kimi Equivalent | Kimi Model ID | Price (in/out per M) |
|-----------|-------------|----------------|---------------|---------------------|
| flash/haiku | claude-haiku-4-5 | Budget/fast | `moonshot-v1-8k` | $0.20/$2.00 |
| sonnet | claude-sonnet-4-5 | Balanced | `kimi-k2-0905-preview` | $0.60/$2.50 |
| opus | claude-opus-4-6 | Most capable | `kimi-k2.5` | $0.60/$3.00 |
| (thinking) | N/A | Deep reasoning | `kimi-k2-thinking` | $0.60/$2.50 |

**Key difference:** Kimi models are dramatically cheaper. The "opus equivalent" (kimi-k2.5) costs $0.60/$3.00 vs Claude opus at $5/$25 -- roughly 8-10x cheaper. Kimi also offers a `thinking` mode toggle (`SessionOptions.thinking: true`) that enables chain-of-thought reasoning, similar to Claude's extended thinking but as a model-level toggle rather than a separate model.

**Implementation:** Update `tierToModel()` function. The `ModelTier` type and provider abstraction layer already handle this pattern.

**Complexity:** Low
**Confidence:** HIGH (model IDs verified from pricing page and CLI docs)

### FM-05: Authentication / OAuth Flow

**Claude Code:** Custom PKCE OAuth flow to `claude.ai/oauth/authorize`. Tokens stored in `~/.claude/.credentials.json`. CLI command: `claude auth status`, `claude login`.

**Kimi Code:** OAuth flow via `/login` command. Tokens stored in `~/.kimi/credentials/kimi-code.json`. Browser opens automatically for OAuth authorization.

| Claude Auth | Kimi Auth | Notes |
|------------|-----------|-------|
| `OAUTH_CLIENT_ID = '9d1c...'` | Kimi's own client ID (in CLI) | Different OAuth provider |
| `OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'` | Kimi's token endpoint | Different endpoint |
| `OAUTH_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'` | Kimi's authorize URL | Different endpoint |
| `~/.claude/.credentials.json` | `~/.kimi/credentials/kimi-code.json` | Different path |
| `claude --version` / `claude auth status` | `kimi --version` / `/login` status | Different CLI commands |
| Custom PKCE flow in `ClaudeProvider.startLogin()` | Browser-based OAuth (CLI handles it) | Kimi CLI handles OAuth internally |

**Critical difference:** Claude Code's OAuth flow was manually implemented in `ClaudeProvider` (PKCE code_verifier, code_challenge, token exchange). Kimi CLI handles OAuth internally via the `/login` command, which opens a browser. The `@moonshot-ai/kimi-agent-sdk` provides `authMCP(serverName)` for MCP OAuth but the main auth is handled by the CLI.

**For LivOS migration:**
- The current web-based "Sign in with Claude" flow (start login -> open browser -> paste code -> exchange token) needs to be adapted
- Option A: Run `kimi` CLI login interactively (not possible in headless server)
- Option B: Use Moonshot API key directly (simpler, like Claude's API key mode)
- Option C: Use the SDK's session with pre-configured credentials from a prior `kimi login`

**Complexity:** Medium-High (auth flow redesign needed)
**Confidence:** MEDIUM (Kimi's OAuth internals less documented than Claude's)

### FM-06: CLI Status & Health Check

**Claude Code:** `execFile('claude', ['--version'])` for install check, `execFile('claude', ['auth', 'status'])` returns JSON `{loggedIn, authMethod, apiProvider}`.

**Kimi Code:** `kimi --version` for install check. Auth status check via `/login` in interactive mode. SDK provides `parseConfig()` to read CLI config and `listSessions()` for session status.

| Claude | Kimi | Notes |
|--------|------|-------|
| `claude --version` | `kimi --version` | Direct equivalent |
| `claude auth status` (JSON) | `parseConfig()` from SDK | SDK function, not CLI command |
| `{loggedIn: true/false}` | Config has `defaultModel`, `models[]` | Different shape |
| CLI installed check | CLI installed check | Same pattern |

**Complexity:** Low
**Confidence:** HIGH

### FM-07: Permission / Approval System

**Claude Code:** `options.permissionMode: 'dontAsk'` auto-approves everything. `options.allowedTools` array auto-approves specific MCP tools.

**Kimi Code:** `SessionOptions.yoloMode: true` auto-approves everything. `--yolo` / `--yes` / `--auto-approve` CLI flags. Without yolo mode, `ApprovalRequest` events are emitted that the host must respond to via `turn.approve(requestId, response)`.

| Claude | Kimi | Notes |
|--------|------|-------|
| `permissionMode: 'dontAsk'` | `yoloMode: true` | Direct equivalent |
| `allowedTools: ['mcp__nexus-tools__*']` | No per-tool allow list found | **GAP** -- Kimi is all-or-nothing |
| N/A | `turn.approve(requestId, 'approve')` | Programmatic approval (new capability) |
| N/A | `turn.approve(requestId, 'approve_for_session')` | Session-wide approval (new capability) |
| N/A | `turn.approve(requestId, 'reject')` | Rejection (new capability) |

**Kimi advantage:** The approval system is more granular -- you can approve individual requests, approve for the entire session, or reject. Claude Code's SDK only has `dontAsk` or nothing. However, Kimi lacks per-tool allow lists (wildcard patterns like `mcp__nexus-tools__*`).

**For LivOS:** Since we use `permissionMode: 'dontAsk'` (auto-approve everything), `yoloMode: true` is a direct replacement. If we ever want granular approval, Kimi's `ApprovalRequest` flow is actually better than Claude's.

**Complexity:** Low
**Confidence:** HIGH

### FM-08: System Prompt Configuration

**Claude Code:** `options.systemPrompt` as inline string passed to `query()`.

**Kimi Code:** Agent YAML file with `system_prompt_path` pointing to a Markdown file. Supports template variables (`${KIMI_NOW}`, `${KIMI_WORK_DIR}`, custom vars via `system_prompt_args`).

| Claude | Kimi | Notes |
|--------|------|-------|
| Inline string in `query()` options | Agent YAML file with `system_prompt_path` | **GAP** -- no inline system prompt |
| Static text | Template variables `${VAR}` | Kimi more flexible |
| Set per-query | Set per-agent definition | Different granularity |

**Workaround for inline system prompt gap:**
1. Write a temporary agent YAML file + system prompt .md file before each session
2. Use `--agent-file /tmp/nexus-agent-{sessionId}.yaml` to point to it
3. Clean up temp files after session ends

**Alternative:** Use wire mode, which may support system prompt injection via the `initialize` method. Wire mode provides full bidirectional control.

**Complexity:** Medium
**Confidence:** MEDIUM (file-based workaround is reliable but clunky)

### FM-09: Token Usage & Cost Tracking

**Claude Code:** `SDKResultSuccess.usage.input_tokens` and `usage.output_tokens` in the final result message.

**Kimi Code:** `StatusUpdate` events with `TokenUsage` object containing `input_other`, `output`, `input_cache_read`, `input_cache_creation`. `RunResult` contains `status` and `steps` count.

| Claude | Kimi | Notes |
|--------|------|-------|
| `usage.input_tokens` | `input_other + input_cache_read` | Kimi splits cached vs uncached |
| `usage.output_tokens` | `output` | Direct mapping |
| Available in final `result` message | Available via `StatusUpdate` events | Different delivery mechanism |
| N/A | `input_cache_read` | Cache hit tracking (bonus) |
| N/A | `input_cache_creation` | Cache creation tracking (bonus) |

**Kimi advantage:** More granular token tracking. Cache-aware metrics enable better cost estimation since cached tokens cost 75% less ($0.15/M vs $0.60/M).

**Complexity:** Low
**Confidence:** HIGH

### FM-10: Chrome DevTools MCP Integration

**Claude Code:** Configured as stdio MCP server in `options.mcpServers`: `{type: 'stdio', command: 'chrome-devtools-mcp', args: ['--browserUrl', url]}`. Auto-approved via `allowedTools.push('mcp__chrome-devtools__*')`.

**Kimi Code:** Configured in `~/.kimi/mcp.json` or via `--mcp-config`:
```json
{"mcpServers": {"chrome-devtools": {"command": "npx", "args": ["chrome-devtools-mcp@latest"]}}}
```

**Migration:** Same MCP server, different configuration format. Kimi CLI natively supports stdio MCP servers. The CDP reachability check (`isCdpReachable()`) remains the same -- just conditionally include or exclude the config.

**Complexity:** Low
**Confidence:** HIGH (verified from Kimi MCP docs showing exact chrome-devtools example)

### FM-11: Settings UI (ai-config.tsx)

**Claude Code:** Radio group for auth method (subscription vs API key), OAuth login flow with code input, logout button, CLI status display, API key input.

**Kimi Code:** Similar flow needed but with different branding and auth endpoints.

| UI Element | Claude | Kimi Equivalent |
|-----------|--------|----------------|
| Auth method radio | "Claude Subscription" / "API Key" | "Kimi Code" / "Moonshot API Key" |
| OAuth login button | "Sign in with Claude" | "Sign in with Kimi" |
| Auth code paste | Manual code input | May not be needed (CLI handles OAuth) |
| CLI status | `claude auth status` | `kimi --version` + `parseConfig()` |
| API key input | `sk-ant-...` | Moonshot API key format |
| Logout | Delete `~/.claude/.credentials.json` | Delete `~/.kimi/credentials/kimi-code.json` |
| Model tiers | haiku/sonnet/opus display | Model list from `parseConfig().models` |

**Complexity:** Medium (UI changes + backend API route updates)
**Confidence:** HIGH

### FM-12: Onboarding Wizard

**Claude Code:** Setup wizard includes Claude login step, model selection, and CLI installation check.

**Kimi Code:** Replace Claude-specific steps with Kimi equivalents. Installation via `curl -LsSf https://code.kimi.com/install.sh | bash` (Linux) or `uv tool install kimi-cli`.

**Complexity:** Low (text/branding changes, installation command update)
**Confidence:** HIGH

---

## Table Stakes

Features that MUST work for the migration to be considered complete.

| Feature | Maps To | Complexity | Dependencies |
|---------|---------|------------|-------------|
| FM-01: Agent runner spawning Kimi CLI subprocess | `createSession()` + `session.prompt()` | Medium | `@moonshot-ai/kimi-agent-sdk` installed, `kimi` CLI installed |
| FM-02: MCP tool registration for Nexus tools | Stdio MCP server + mcp.json config | High | Standalone Nexus MCP server binary |
| FM-03: Streaming events to web UI via SSE | `Turn` async iterator -> SSE emitter | Medium | Updated event type mapping |
| FM-04: Model selection (tier-based) | `SessionOptions.model` | Low | Model ID mapping table |
| FM-05: Authentication (at least API key mode) | Moonshot API key in Redis config | Low | Moonshot platform account |
| FM-07: Auto-approval for Nexus tools | `yoloMode: true` | Low | None |
| FM-10: Chrome DevTools MCP | mcp.json stdio config | Low | Same chrome-devtools-mcp package |
| FM-11: Settings UI updates | Rebrand + new API routes | Medium | Backend tRPC route changes |

---

## Differentiators

Things Kimi Code does better or differently that LivOS can leverage.

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **10x cheaper inference** | kimi-k2.5 at $0.60/$3.00 vs claude-opus at $5/$25 | Zero | Direct cost reduction, no code change |
| **Granular approval system** | `approve` / `approve_for_session` / `reject` per request | Medium | Better than Claude's all-or-nothing `dontAsk` |
| **Cache-aware token tracking** | Separate `input_cache_read` vs `input_other` metrics | Low | Better cost visibility, 75% savings on cached tokens |
| **Thinking mode toggle** | `SessionOptions.thinking: true` enables chain-of-thought | Low | No need for separate model; same model, toggle reasoning |
| **Wire mode** | Full bidirectional JSON-RPC 2.0 protocol | Medium | More control than SDK: custom tool registration via `initialize`, programmatic steering via `steer` |
| **Vision capabilities** | Kimi K2.5 natively multimodal (images, video input) | Low | `ContentPart` supports `image_url`, `audio_url`, `video_url` |
| **Print mode (headless)** | `kimi --print -p "task"` for CI/CD and scripting | Low | Stream-json output for programmatic processing |
| **Agent files** | Declarative YAML agent definitions with tool selection | Medium | Could enable different agent personas per use case |
| **Checkpoint/time-travel** | Agent can create checkpoints and retry from earlier states | N/A | Built into Kimi CLI, transparent to host |
| **Open-source model weights** | K2.5 weights on HuggingFace, self-hostable | N/A | Future option: run model locally on GPU server |
| **Context compaction** | Built into CLI (CompactionBegin/CompactionEnd events) | Zero | Automatic, no need for LivOS-level compaction for Kimi sessions |

---

## Anti-Features

Things to deliberately NOT build during the migration.

### AF-01: Do NOT maintain dual Claude + Kimi support simultaneously

**Why avoid:** The existing multi-provider abstraction (`AIProvider` interface, `ProviderManager`) was designed for API-level providers (Claude API, Gemini API). The SDK-level integration (SdkAgentRunner) is fundamentally different -- it spawns a CLI subprocess. Maintaining two CLI-spawning agent runners (Claude SDK + Kimi SDK) doubles the maintenance burden for a feature only one user (the project owner) uses.
**What to do instead:** Clean migration. Remove Claude Code SDK dependency entirely. Keep the `AIProvider` interface for potential future direct-API providers, but the primary agent runner should be Kimi only.

### AF-02: Do NOT build a custom OAuth PKCE flow for Kimi

**Why avoid:** The current `ClaudeProvider.startLogin()` manually implements PKCE OAuth (code_verifier, code_challenge, token exchange). This was necessary because Claude Code's OAuth required it. Kimi CLI handles OAuth internally via the `/login` command. Reimplementing Kimi's OAuth PKCE flow is unnecessary complexity.
**What to do instead:** For headless servers, use Moonshot API key authentication (simpler, more reliable). For interactive setups, run `kimi` login on the server once. Store the API key in Redis as `nexus:config:moonshot_api_key`.

### AF-03: Do NOT try to use both wire mode and SDK simultaneously

**Why avoid:** Wire mode (`kimi --wire`) and the Agent SDK (`@moonshot-ai/kimi-agent-sdk`) are two different interfaces to the same underlying Kimi CLI. Using both creates complexity and potential conflicts.
**What to do instead:** Choose one. **Recommendation: Use the Agent SDK** for the primary integration (matches Claude SDK pattern). Reserve wire mode knowledge for future advanced features (custom tool registration, programmatic steering) if the SDK proves insufficient.

### AF-04: Do NOT migrate the Gemini fallback provider

**Why avoid:** The `GeminiProvider` in the existing code is disabled and unused. Migrating a dead code path wastes effort.
**What to do instead:** Remove `GeminiProvider`. If fallback is needed later, Moonshot's API is OpenAI-compatible, so any OpenAI-compatible provider can serve as fallback.

### AF-05: Do NOT build thinking mode UI before basic migration works

**Why avoid:** Kimi's thinking mode (`SessionOptions.thinking: true`) exposes `ThinkPart` events with reasoning content. Building UI for this is a nice differentiator but is not required for the migration to be functional.
**What to do instead:** First complete the basic migration (text + tool calls). Add thinking mode UI as a fast-follow enhancement.

---

## Feature Gaps

Things Claude Code has that Kimi Code does NOT have -- requiring workarounds.

### GAP-01: Inline MCP Server Creation (CRITICAL)

**Claude has:** `createSdkMcpServer({name, tools})` creates an in-process MCP server that the Claude CLI connects to. Tools are defined as Zod schemas with handlers. Zero filesystem involvement.

**Kimi lacks:** No equivalent in-process MCP server API. MCP servers must be configured via file (`~/.kimi/mcp.json`) or CLI flag (`--mcp-config`).

**Impact:** HIGH -- This is how Nexus tools (shell, docker, files, scrape, browser, memory) are exposed to the AI agent.

**Workaround:** Build a standalone Nexus MCP server that runs as a separate process and communicates via stdio. Kimi CLI spawns it as a child process.

```
Current (Claude):
  Nexus Process
    -> createSdkMcpServer({tools})    [in-process]
    -> query({mcpServers: {nexus: mcpServer}})

Migration (Kimi):
  Nexus Process
    -> Start nexus-mcp-server.js subprocess    [out-of-process]
    -> createSession({...})
    -> Kimi CLI spawns nexus-mcp-server.js via mcp.json config
    -> Tools communicate over stdio
```

**Complexity:** High
**Confidence:** MEDIUM (pattern is standard for MCP, but introduces IPC complexity)

### GAP-02: Inline System Prompt

**Claude has:** `options.systemPrompt` as a string parameter.

**Kimi lacks:** System prompt must be in a file referenced by an agent YAML file.

**Workaround:** Write temporary agent files:
1. Write system prompt to `/tmp/nexus-system-{sessionId}.md`
2. Write agent YAML to `/tmp/nexus-agent-{sessionId}.yaml` referencing the prompt file
3. Pass `--agent-file /tmp/nexus-agent-{sessionId}.yaml` when creating session
4. Clean up on session close

**Alternative workaround:** If using wire mode, the `initialize` method may support system prompt injection. Needs verification.

**Complexity:** Medium
**Confidence:** MEDIUM

### GAP-03: Per-Tool Allow Lists

**Claude has:** `allowedTools: ['mcp__nexus-tools__shell', 'mcp__chrome-devtools__*']` with glob support.

**Kimi lacks:** Only `yoloMode` (approve all) or manual approval per request.

**Workaround:** Use `yoloMode: true` (equivalent to current behavior since LivOS already uses `permissionMode: 'dontAsk'`). If granular control needed later, implement via `ApprovalRequest` handler that auto-approves whitelisted tools and prompts for others.

**Complexity:** Low (for current behavior), Medium (for granular implementation)
**Confidence:** HIGH

### GAP-04: Usage in Final Result Message

**Claude has:** `SDKResultSuccess.usage.input_tokens` and `output_tokens` in the final result.

**Kimi has:** Token usage via `StatusUpdate` events (not in `RunResult`). `RunResult` only contains `status` and `steps`.

**Workaround:** Accumulate token usage from `StatusUpdate` events throughout the turn. Store running totals in the event handler.

**Complexity:** Low
**Confidence:** HIGH

### GAP-05: Model Tier Parity

**Claude has:** Clear haiku (fast/cheap) -> sonnet (balanced) -> opus (best) tier progression.

**Kimi has:** Multiple models but the tier boundaries are less clear. `kimi-k2.5` (best), `kimi-k2-0905-preview` (good), `moonshot-v1-8k` (basic). No clear "fast and cheap" equivalent to Haiku.

**Workaround:** Map tiers approximately. The `moonshot-v1-8k` model at $0.20/$2.00 serves as the "haiku" tier. Accept that the tier boundaries are approximate.

**Complexity:** Low
**Confidence:** MEDIUM (model capabilities not benchmarked in this context)

---

## Feature Dependencies on Existing Code

| Existing Code | What It Does | Migration Impact |
|--------------|-------------|-----------------|
| `SdkAgentRunner` | Spawns Claude CLI via SDK | **REPLACE** entirely with Kimi SDK equivalent |
| `ClaudeProvider` | OAuth, API key, CLI status, chat/stream | **REPLACE** with `KimiProvider` |
| `providers/types.ts` | `AIProvider` interface, `ToolUseBlock`, etc. | **KEEP** -- update type mappings |
| `providers/manager.ts` | Multi-provider orchestration | **SIMPLIFY** -- single provider |
| `agent.ts` (AgentLoop) | ReAct loop with JSON-in-text tool calling | **KEEP** as fallback, update for Kimi |
| `tool-registry.ts` | Tool registration and execution | **KEEP** -- MCP server wraps this |
| `api.ts` | tRPC routes for auth, config, agent | **UPDATE** -- new route names/params |
| `ai-config.tsx` | Settings UI | **UPDATE** -- rebrand + new auth flow |
| `setup-wizard.tsx` | Onboarding | **UPDATE** -- installation commands |
| `ws-gateway.ts` | WebSocket streaming to UI | **KEEP** -- event mapping update only |

---

## Build Order (Recommended)

```
Phase 1: Core Runtime (Must complete first)
  FM-02  Build standalone Nexus MCP server (stdio)
  FM-01  KimiAgentRunner (createSession + session.prompt)
  FM-03  Event type mapping (StreamEvent -> AgentEvent)
  FM-04  Model tier mapping

Phase 2: Authentication & Config
  FM-05  KimiProvider with API key auth
  FM-06  CLI status checking
  FM-09  Token usage tracking from StatusUpdate events

Phase 3: UI Updates
  FM-11  Settings page rebrand + new auth routes
  FM-12  Onboarding wizard update
  FM-10  Chrome DevTools MCP config

Phase 4: Cleanup & Enhancement
  Remove Claude SDK dependencies
  Remove ClaudeProvider
  Add thinking mode UI (differentiator)
  Add granular approval handler (differentiator)
```

**Rationale:**
- **Phase 1** is the critical path -- nothing works without the agent runner and MCP tools
- **Phase 2** adds auth/config but can use hardcoded API key during Phase 1 development
- **Phase 3** is UI-only and can be done in parallel with Phase 2
- **Phase 4** cleanup happens after everything is verified working

---

## Sources

### Kimi Agent SDK
- [Kimi Agent SDK GitHub](https://github.com/MoonshotAI/kimi-agent-sdk) -- Session API, Turn interface, event types, ContentPart types (HIGH confidence)
- [Kimi Agent SDK npm: @moonshot-ai/kimi-agent-sdk](https://www.npmjs.com/package/@moonshot-ai/kimi-agent-sdk) -- Package installation (HIGH confidence)

### Kimi Code CLI
- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli) -- Features, installation, MCP support (HIGH confidence)
- [Kimi CLI Getting Started](https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html) -- Installation, auth flow (HIGH confidence)
- [Kimi CLI MCP Docs](https://moonshotai.github.io/kimi-cli/en/customization/mcp.html) -- MCP config format, stdio/HTTP, OAuth (HIGH confidence)
- [Kimi CLI Print Mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html) -- Headless mode, stream-json format (HIGH confidence)
- [Kimi CLI Wire Mode](https://moonshotai.github.io/kimi-cli/en/customization/wire-mode.html) -- JSON-RPC protocol, ToolCallRequest, ApprovalRequest (HIGH confidence)
- [Kimi CLI Command Reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html) -- All flags and options (HIGH confidence)
- [Kimi CLI Agents](https://moonshotai.github.io/kimi-cli/en/customization/agents.html) -- Agent YAML format, system prompt, tools (HIGH confidence)
- [Kimi CLI Technical Deep Dive](https://llmmultiagents.com/en/blogs/kimi-cli-technical-deep-dive) -- Internal architecture (MEDIUM confidence)

### Kimi Models & Pricing
- [Kimi API Pricing](https://costgoat.com/pricing/kimi-api) -- Full model list with pricing (HIGH confidence)
- [Kimi K2.5 Codecademy Guide](https://www.codecademy.com/article/kimi-k-2-5-complete-guide-to-moonshots-ai-model) -- Model capabilities (MEDIUM confidence)
- [Kimi K2.5 NxCode Guide](https://www.nxcode.io/resources/news/kimi-k2-5-developer-guide-kimi-code-cli-2026) -- Developer integration (MEDIUM confidence)

### Comparison
- [Kimi Code vs Claude Code (Medium)](https://medium.com/ai-software-engineer/i-finally-tested-new-kimi-code-cli-like-claude-code-dont-miss-my-hard-lesson-bc5d60a51578) -- Practical comparison (MEDIUM confidence)
- [Claude Code Alternatives 2026](https://www.morphllm.com/comparisons/claude-code-alternatives) -- Feature comparison (MEDIUM confidence)
- [SourceForge Claude vs Kimi](https://sourceforge.net/software/compare/Claude-Code-vs-Kimi-Code-CLI/) -- Side-by-side (LOW confidence)

---

*Research completed: 2026-03-09*
