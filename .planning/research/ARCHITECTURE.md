# Architecture Research: Kimi Code Migration

**Dimension:** Architecture
**Milestone:** Kimi Code Migration -- Replace Claude Code with Kimi Code in Nexus
**Date:** 2026-03-09
**Confidence:** HIGH (based on direct codebase analysis + official Kimi CLI docs + verified Kimi SDK info)

---

## Executive Summary

Migrating from Claude Code to Kimi Code requires changes across four layers: provider, agent runner, API routes, and UI. The existing architecture is well-suited for this -- the AIProvider interface, ProviderManager fallback system, and SdkAgentRunner pattern all have clean seams. The critical insight: **Kimi offers three integration depths** -- direct API calls (OpenAI-compatible), CLI subprocess via Agent SDK, and a raw Wire protocol (JSON-RPC 2.0 over stdio). The recommended approach uses the Agent SDK (`@moonshot-ai/kimi-agent-sdk`) for subscription mode (replacing SdkAgentRunner) and the OpenAI-compatible API for API key mode (replacing ClaudeProvider.chat).

The migration is **not a rewrite** -- it's a systematic replacement of Claude-specific components with Kimi equivalents while preserving the surrounding architecture (ToolRegistry, Brain, ProviderManager, tRPC routes, SSE streaming).

**Key finding from research:** Kimi CLI also supports a `--print --output-format=stream-json` mode that streams JSONL to stdout without any SDK dependency. This provides a fallback if the `@moonshot-ai/kimi-agent-sdk` proves too immature (0.x version). The fallback approach spawns `kimi --print --output-format=stream-json -p "task"` directly and parses JSONL output.

---

## Current Architecture (Claude Code)

```
+------------------+
|   LivOS Web UI   |  React 18 + Vite
|   ai-config.tsx  |  Claude auth method toggle (api-key / sdk-subscription)
+--------+---------+
         |
    tRPC routes (livinityd/modules/ai/routes.ts)
         |
+--------+---------+
|    livinityd     |  Proxies to Nexus API
|   (port 80)     |  tRPC: ai.getClaudeCliStatus, ai.startClaudeLogin, etc.
+--------+---------+
         |
    HTTP fetch to Nexus API
         |
+--------+---------+     +-------------------+
|   Nexus Core     |---->|  SdkAgentRunner   |  Spawns Claude Code CLI subprocess
|   api.ts         |     |  (sdk-agent-runner)|  via @anthropic-ai/claude-agent-sdk
|   (port 3200)    |     +--------+----------+
+--------+---------+              |
         |                   query() function
         |                   spawns 'claude' CLI
+--------+---------+              |
|  ClaudeProvider  |     +--------+----------+
|  claude.ts       |     | Claude Code CLI   |
|  - chat()        |     | - OAuth auth      |
|  - chatStream()  |     | - MCP tools       |
|  - startLogin()  |     | - permissionMode  |
|  - submitCode()  |     +-------------------+
+------------------+
```

### Key Components to Replace

| Component | File | What It Does | Migration Impact |
|-----------|------|-------------|------------------|
| ClaudeProvider | `providers/claude.ts` | API key auth, OAuth PKCE, chat/stream, CLI status | **REPLACE** with KimiProvider |
| SdkAgentRunner | `sdk-agent-runner.ts` | Spawns Claude CLI, bridges MCP tools | **REPLACE** with KimiAgentRunner |
| API routes | `api.ts` lines 185-246 | `/api/claude-cli/*` endpoints | **REPLACE** with `/api/kimi/*` |
| Config schema | `config/schema.ts` | Model names (claude-*) | **MODIFY** model names |
| Provider types | `providers/types.ts` | ClaudeToolDefinition, cost table | **MODIFY** add Kimi costs |
| ProviderManager | `providers/manager.ts` | Fallback order [claude, gemini] | **MODIFY** -> [kimi, gemini] |
| AI tRPC routes | `livinityd/.../ai/routes.ts` | Claude CLI status/login/logout | **REPLACE** with Kimi equivalents |
| AI Config UI | `ui/.../ai-config.tsx` | Claude auth UI | **REPLACE** with Kimi auth UI |

### Components That Stay Unchanged

| Component | Why Unchanged |
|-----------|--------------|
| ToolRegistry | Provider-agnostic tool definitions |
| Brain | Delegates to ProviderManager -- provider-agnostic |
| AgentLoop | Direct API mode -- works with any AIProvider |
| AgentConfig/AgentResult types | Provider-agnostic interfaces |
| AgentEvent types | Provider-agnostic event interface |
| SSE streaming in api.ts | Uses AgentEvent -- provider-agnostic |
| Daemon, Redis, all channels | No AI provider dependency |

---

## Kimi Code Architecture

### Three Integration Depths

Kimi Code offers **three distinct integration depths**, more than Claude's two:

#### Depth 1: Kimi API (Direct API Mode -- replaces ClaudeProvider.chat/chatStream)

- **Endpoint:** `https://api.kimi.com/coding/v1` (Kimi Code specific) or `https://api.moonshot.ai/v1` (general Moonshot API)
- **Format:** OpenAI-compatible chat completions API
- **Authentication:** API key (Bearer token) from Moonshot Platform or Kimi Code membership
- **Tool calling:** OpenAI-format function calling (NOT Anthropic tool_use)
- **Streaming:** SSE with `data: {...}` chunks (OpenAI format)
- **Context window:** 262,144 tokens
- **Max output:** 32,768 tokens
- **Pricing:** ~$0.60/M input, $2.50/M output (significantly cheaper than Claude)

**Key difference from Claude API:** Kimi uses OpenAI function_call format, not Anthropic tool_use blocks. The KimiProvider must translate between Nexus's ClaudeToolDefinition format and OpenAI function format.

**Confidence:** HIGH -- OpenAI-compatible format is well-documented and widely used.

#### Depth 2: Kimi Agent SDK (Subprocess Mode -- replaces SdkAgentRunner)

- **Package:** `@moonshot-ai/kimi-agent-sdk`
- **Mechanism:** Spawns `kimi` CLI as subprocess, communicates via Wire protocol (JSON-RPC 2.0 over stdio)
- **Authentication:** OAuth via `kimi login` or API key in `~/.kimi/config.toml`
- **MCP support:** Reads from `~/.kimi/mcp.json` OR `--mcp-config-file` flag OR `--mcp-config` inline JSON
- **Tool approval:** `yoloMode: true` auto-approves all tools (equivalent to Claude's `dontAsk`)
- **Session API:** `createSession()` + `session.prompt()` (async iterator pattern)
- **External tools:** `createExternalTool()` for registering custom tools with Zod schemas

**Key difference from Claude SDK:** The Kimi SDK uses `createSession()` + `session.prompt()` instead of a single `query()` function. Sessions are stateful and persist across turns. Events use a different type system (TurnBegin, StepBegin, ContentPart, ToolCall, ToolResult, StatusUpdate, etc.).

**Confidence:** MEDIUM -- SDK is 0.x version; API surface documented but exact TypeScript signatures need testing.

#### Depth 3: CLI Print Mode (Fallback / Direct Subprocess)

If the Agent SDK proves unreliable, we can spawn `kimi` CLI directly in print mode:

```bash
# Spawn as subprocess, get JSONL streaming output
kimi --print --output-format=stream-json --yolo --max-steps-per-turn 25 \
  --mcp-config '{"mcpServers":{"chrome-devtools":{"command":"chrome-devtools-mcp","args":["--browserUrl","http://127.0.0.1:9223"]}}}' \
  -p "task description here"
```

**JSONL output format:**
```json
{"role": "assistant", "content": "I'll help with that..."}
{"role": "assistant", "content": "...", "tool_calls": [{"id": "tc_1", "type": "function", "function": {"name": "shell", "arguments": "{\"cmd\":\"ls\"}"}}]}
{"role": "tool", "tool_call_id": "tc_1", "content": "file1.txt\nfile2.txt"}
{"role": "assistant", "content": "Here are the files..."}
```

**Key flags for programmatic use:**
- `--print`: Non-interactive mode (implicitly enables `--yolo`)
- `--output-format=stream-json`: JSONL output (one JSON object per line)
- `--input-format=stream-json`: JSONL input via stdin (for multi-turn)
- `--final-message-only`: Skip intermediate tool call messages, only output final answer
- `--quiet`: Shortcut for `--print --output-format text --final-message-only`
- `--yolo` / `-y` / `--auto-approve`: Auto-approve all operations
- `--mcp-config JSON`: Pass MCP server config as inline JSON string (repeatable)
- `--mcp-config-file PATH`: Load MCP config from file (repeatable)
- `--model NAME`: Override model selection
- `--max-steps-per-turn N`: Limit steps per turn
- `--work-dir PATH`: Set working directory
- `--no-thinking`: Disable thinking mode

**Why this matters as a fallback:** This approach requires zero SDK dependency -- just spawn a child process and parse JSONL. The `--mcp-config` inline flag means we can pass MCP configuration programmatically without writing temp files. This is simpler than the SDK approach and equally capable, though it lacks the structured event types for finer-grained streaming.

**Confidence:** HIGH -- CLI flags are documented in official Kimi CLI docs and GitHub README.

#### Depth 4: Wire Mode (Advanced -- JSON-RPC 2.0 Protocol)

Kimi CLI also supports `kimi --wire` which exposes a bidirectional JSON-RPC 2.0 protocol over stdin/stdout:

- **Protocol version:** 1.4
- **Methods:** `initialize`, `prompt`, `steer`, `cancel`, `replay`
- **Events:** `TurnBegin`, `TurnEnd`, `StepBegin`, `StatusUpdate`, `ContentPart`, `ToolCall`, `ToolResult`, `ApprovalResponse`, `SubagentEvent`
- **Tool registration:** Via `external_tools` parameter in the `initialize` request

This is what the Agent SDK uses internally. Using it directly would give the most control but is more complex. **Not recommended unless the SDK proves inadequate.**

**Confidence:** MEDIUM -- Wire mode is documented but marked "experimental" in the CLI reference.

### Credential Storage

| Item | Claude | Kimi |
|------|--------|------|
| Config directory | `~/.claude/` | `~/.kimi/` |
| Credentials file | `~/.claude/.credentials.json` | `~/.kimi/config.toml` (provider section) |
| MCP config | Inline via SDK | `~/.kimi/mcp.json` or `--mcp-config` inline JSON |
| API key format | `sk-ant-...` | Bearer token from platform.moonshot.ai or api.kimi.com |
| OAuth method | Custom PKCE flow to platform.claude.com | Device auth flow to auth.kimi.com + browser-based `/login` |
| OAuth endpoints | `platform.claude.com/v1/oauth/token` | `auth.kimi.com/api/oauth/device_authorization` + `auth.kimi.com/api/oauth/token` |
| Redis key (current) | `nexus:config:anthropic_api_key` | `nexus:config:kimi_api_key` (new) |
| Auth method key | `nexus:config:claude_auth_method` | `nexus:config:kimi_auth_method` (new) |

### OAuth Flow Comparison

**Claude:** Custom PKCE flow handled entirely in `ClaudeProvider`:
1. Generate code_verifier + code_challenge
2. Return authorize URL to frontend
3. User authenticates, gets a code
4. User pastes code in UI
5. Backend exchanges code for tokens via `platform.claude.com/v1/oauth/token`
6. Save credentials to `~/.claude/.credentials.json`

**Kimi:** Simpler -- CLI handles OAuth internally:
1. Backend runs `kimi login` (or equivalent SDK call)
2. CLI opens browser or returns device auth URL
3. User authenticates in browser
4. CLI stores credentials in `~/.kimi/config.toml` automatically
5. No code-paste step needed (device auth flow auto-completes)

**Key implication:** The Kimi login UI can be simpler. No code paste input field needed. Just "Sign in" button -> poll for auth completion.

---

## New Component: KimiProvider

**File:** `nexus/packages/core/src/providers/kimi.ts`

### Interface Mapping

```
ClaudeProvider method     ->  KimiProvider equivalent
------------------------     -----------------------
chat()                    ->  chat() -- OpenAI chat completions format
chatStream()              ->  chatStream() -- OpenAI streaming format
think()                   ->  think() -- same wrapper pattern
isAvailable()             ->  isAvailable() -- check API key in Redis/env
getModels()               ->  getModels() -- Kimi model tiers
getCliStatus()            ->  getCliStatus() -- check 'kimi' binary + auth
getAuthMethod()           ->  getAuthMethod() -- api-key vs kimi-subscription
startLogin()              ->  startLogin() -- trigger OAuth flow via CLI
submitLoginCode()         ->  NOT NEEDED (Kimi uses device auth, no code paste)
logout()                  ->  logout() -- run 'kimi logout' or delete config
```

**Note on `submitLoginCode`:** Claude's PKCE flow requires the user to paste a code back. Kimi's device auth flow completes automatically when the user authenticates in the browser. The `startLogin()` method should initiate `kimi login` (or the device auth API) and return a URL. The frontend polls `getCliStatus()` until `authenticated: true`. No code submission step needed.

### Model Tier Mapping

```typescript
const KIMI_MODELS: Record<string, string> = {
  flash: 'kimi-latest',          // Fast, cheap model
  haiku: 'kimi-latest',          // Map to same (Kimi doesn't have haiku equivalent)
  sonnet: 'kimi-for-coding',     // Primary coding model (Kimi K2.5)
  opus: 'kimi-for-coding',       // Map to same (Kimi K2.5 is top-tier)
};
```

**Confidence:** MEDIUM -- Kimi's model tier naming may differ. The exact model IDs need verification from `kimi info` output or the `~/.kimi/config.toml` `[models]` section. At minimum, `kimi-for-coding` and `kimi-latest` are referenced in documentation.

### Tool Definition Translation

The existing Nexus system uses `ClaudeToolDefinition` format (Anthropic `input_schema`). Kimi's API uses OpenAI `function` format (`parameters`). Translation layer needed:

```typescript
// Nexus internal format (ClaudeToolDefinition)
{
  name: 'shell',
  description: 'Execute a shell command',
  input_schema: {
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command']
  }
}

// Kimi API format (OpenAI function calling)
{
  type: 'function',
  function: {
    name: 'shell',
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  }
}
```

The translation is mechanical: `input_schema` becomes `function.parameters`, wrapped in `{type: 'function', function: {...}}`. Response tool calls come back as `function.name` + `function.arguments` (JSON string) instead of `tool_use` blocks with `input` objects.

**Response parsing difference:**
```typescript
// Claude: tool_use block
{ type: 'tool_use', id: 'toolu_123', name: 'shell', input: { command: 'ls' } }

// Kimi: function call (OpenAI format)
{ id: 'call_123', type: 'function', function: { name: 'shell', arguments: '{"command":"ls"}' } }
// Note: arguments is a JSON string, needs JSON.parse()
```

### Authentication Flow

Two modes, same as Claude but different mechanics:

**API Key Mode:**
1. User enters API key in Settings UI
2. Stored in Redis: `nexus:config:kimi_api_key`
3. KimiProvider reads from Redis, creates OpenAI-compatible client
4. Uses `https://api.kimi.com/coding/v1` as base URL (or `https://api.moonshot.ai/v1`)

**Kimi Subscription Mode (CLI):**
1. User clicks "Sign in with Kimi" in Settings UI
2. Backend invokes `kimi login` subprocess (or calls device auth API directly)
3. Returns auth URL to frontend for display
4. User opens URL, authenticates in browser
5. CLI/device auth auto-completes, credentials stored in `~/.kimi/config.toml`
6. Frontend polls `getCliStatus()` until authenticated
7. KimiAgentRunner can then spawn `kimi` subprocess for tasks

**Implementation choice for login flow:**

Option A (simpler): Shell out to `kimi login` which handles browser-based OAuth. Parse its output for the auth URL. Problem: `kimi login` is interactive by default.

Option B (recommended): Use the device authorization API directly:
```typescript
// POST https://auth.kimi.com/api/oauth/device_authorization
// Returns: { device_code, user_code, verification_uri, expires_in, interval }
// Then poll: POST https://auth.kimi.com/api/oauth/token with grant_type=urn:ietf:params:oauth:grant-type:device_code
```
This avoids spawning an interactive process and gives us full control.

---

## New Component: KimiAgentRunner

**File:** `nexus/packages/core/src/kimi-agent-runner.ts`

### Recommended Implementation: Agent SDK with Print Mode Fallback

**Primary approach:** Use `@moonshot-ai/kimi-agent-sdk` with `createSession()` + `session.prompt()`.

**Fallback approach:** If the SDK proves unreliable, spawn `kimi --print --output-format=stream-json` directly and parse JSONL output. This is simpler but provides less structured events.

### Primary: Agent SDK Pattern

```typescript
import { createSession, createExternalTool } from '@moonshot-ai/kimi-agent-sdk';
import { z } from 'zod';

// Instead of Claude SDK's:
//   query({ prompt, options: { mcpServers, tools, allowedTools, ... } })
//
// Kimi SDK uses:
//   const session = createSession({ workDir, model, yoloMode, ... })
//   const turn = session.prompt(task)
//   for await (const event of turn) { ... }
```

### Fallback: Print Mode Pattern

```typescript
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

async run(task: string): Promise<AgentResult> {
  const mcpConfig = JSON.stringify({
    mcpServers: this.buildMcpConfig()
  });

  const child = spawn('kimi', [
    '--print',
    '--output-format=stream-json',
    '--yolo',
    '--model', tierToModel(this.config.tier),
    '--max-steps-per-turn', String(this.config.maxTurns ?? 25),
    '--work-dir', '/opt/livos',
    '--mcp-config', mcpConfig,
    '-p', taskWithContext,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  const rl = createInterface({ input: child.stdout });

  for await (const line of rl) {
    const msg = JSON.parse(line);
    if (msg.role === 'assistant' && msg.content) {
      this.emitEvent({ type: 'chunk', data: msg.content });
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        this.emitEvent({ type: 'tool_call', data: { tool: tc.function.name } });
      }
    }
  }
  // ...
}
```

### Key Differences from SdkAgentRunner

| Aspect | SdkAgentRunner (Claude) | KimiAgentRunner (SDK) | KimiAgentRunner (Print fallback) |
|--------|------------------------|----------------------|-------------------------------|
| SDK import | `@anthropic-ai/claude-agent-sdk` | `@moonshot-ai/kimi-agent-sdk` | None (child_process) |
| Entry point | `query({ prompt, options })` | `createSession()` + `session.prompt()` | `spawn('kimi', ['--print', ...])` |
| Tool registration | `tool()` + `createSdkMcpServer()` | `createExternalTool()` with Zod | `--mcp-config` inline JSON |
| Auto-approve | `permissionMode: 'dontAsk'` | `yoloMode: true` | `--yolo` flag (implicit with --print) |
| MCP config | Inline `mcpServers` object | `--mcp-config-file` or inline | `--mcp-config` JSON string |
| Event types | `assistant`, `result` | `ContentPart`, `ToolCall`, `ToolResult`, etc. | JSONL messages with `role` field |
| Session lifecycle | Stateless (one-shot query) | Stateful (session persists) | Stateless (one-shot subprocess) |
| Result format | `SDKResultSuccess.result` | `RunResult.status` + accumulated text | Final JSONL message |
| Usage tracking | `success.usage.input_tokens` | `StatusUpdate` events | Not available (use API separately) |

### MCP Tool Bridging Strategy

**Current (Claude):** SdkAgentRunner builds `SdkMcpToolDefinition[]` using `tool()` helper, then creates an in-process MCP server via `createSdkMcpServer()`. This MCP server is passed to `query()` as a `mcpServers` config entry.

**Kimi approach -- three options:**

**Option A: External Tools via SDK (RECOMMENDED for SDK path)**
Use `createExternalTool()` to register Nexus tools directly with the Kimi session. Each Nexus tool becomes a Kimi external tool with a Zod schema and handler function. No MCP server needed.

```typescript
const externalTools = toolNames.map(name => {
  const t = toolRegistry.get(name)!;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of t.parameters) {
    shape[p.name] = paramTypeToZod(p.type, p.description, p.enum);
  }
  return createExternalTool({
    name: t.name,
    description: t.description,
    parameters: z.object(shape),
    handler: async (params) => {
      const result = await toolRegistry.execute(name, params);
      return {
        output: result.success ? result.output : `Error: ${result.error}`,
        message: result.success ? 'Success' : 'Failed',
      };
    },
  });
});
```

**Why Option A:** The Kimi SDK's `createExternalTool()` is purpose-built for this. It takes Zod schemas (same as what SdkAgentRunner already builds) and handler functions. This avoids the indirection of creating an MCP server just to bridge tools.

**Option B: Wire Mode external_tools (RECOMMENDED for Wire path)**
If using Wire mode directly, pass tool definitions in the `initialize` JSON-RPC request via the `external_tools` parameter, which accepts tool name, description, and JSON Schema parameter definitions.

**Option C: MCP Config via --mcp-config inline JSON (RECOMMENDED for Print fallback)**
Pass Nexus tools as an MCP stdio server and Chrome DevTools as another, all via `--mcp-config` inline JSON flag. No temp files needed.

```typescript
const mcpConfig = {
  mcpServers: {
    'nexus-tools': {
      command: 'node',
      args: ['/opt/nexus/mcp-bridge.js'],  // small MCP server wrapping ToolRegistry
    },
    'chrome-devtools': {
      command: 'chrome-devtools-mcp',
      args: ['--browserUrl', 'http://127.0.0.1:9223', '--no-usage-statistics'],
    }
  }
};
// Pass as: --mcp-config JSON.stringify(mcpConfig)
```

**Verdict:** Use Option A (SDK external tools) as primary. Have Option C (--mcp-config with Print mode) as fallback. Option C requires building a small MCP bridge server for Nexus tools, but this is straightforward.

### Chrome DevTools MCP

For Chrome DevTools MCP (external process, not a Nexus tool), we still need MCP config. Strategies by integration depth:

- **SDK path:** Write Chrome DevTools to `~/.kimi/mcp.json` on Nexus startup
- **Print mode path:** Pass via `--mcp-config` inline JSON flag (no temp files needed)
- **Wire path:** Include in the `initialize` request

The `--mcp-config` inline JSON flag is the cleanest approach -- it requires no persistent config file and is passed per-invocation.

### Event Mapping (SDK Path)

```
Kimi SDK Event          ->  Nexus AgentEvent
------------------         -----------------
TurnBegin               ->  { type: 'thinking', turn }
StepBegin               ->  (internal, increment step counter)
ContentPart(text)       ->  { type: 'chunk', turn, data: text }
ContentPart(think)      ->  { type: 'thinking', turn, data: think }
ToolCall                ->  { type: 'tool_call', turn, data: { tool, params } }
ToolResult              ->  { type: 'observation', turn, data: { tool, success, output } }
StatusUpdate            ->  (internal, track token usage and context)
ApprovalRequest         ->  (auto-approve in yoloMode; else emit approval event)
RunResult(finished)     ->  { type: 'final_answer', turn, data: answer }
RunResult(cancelled)    ->  { type: 'error', turn, data: 'cancelled' }
RunResult(max_steps)    ->  { type: 'done', data: { stoppedReason: 'max_turns' } }
```

### Event Mapping (Print Mode Fallback)

```
JSONL Message           ->  Nexus AgentEvent
------------------         -----------------
{role:"assistant", content:"text"}        ->  { type: 'chunk', data: text }
{role:"assistant", tool_calls:[...]}      ->  { type: 'tool_call', data: { tool, params } }
{role:"tool", tool_call_id, content}      ->  { type: 'observation', data: { output } }
Last assistant message                    ->  { type: 'final_answer', data: content }
Process exit code 0                       ->  { type: 'done', data: { success: true } }
Process exit code != 0                    ->  { type: 'error', data: stderr }
```

### Session Lifecycle

**Critical difference:** Claude SDK's `query()` is stateless -- each call is independent. Kimi SDK's `createSession()` creates a persistent session. For Nexus agent tasks:

1. Create session per task (like `randomUUID()` sessionId)
2. Send single prompt with the task
3. Consume all events from the Turn
4. Close session when done

```typescript
async run(task: string): Promise<AgentResult> {
  const session = createSession({
    workDir: '/opt/livos',  // or configured working directory
    model: tierToModel(this.config.tier),
    yoloMode: true,  // auto-approve all tools
    executable: 'kimi',
    env: { /* any needed env vars */ },
  });

  try {
    const turn = session.prompt(taskWithContext);
    let answer = '';
    let turns = 0;

    for await (const event of turn) {
      // Map events to AgentEvent emissions
      if (event.type === 'ContentPart' && event.payload.type === 'text') {
        answer += event.payload.text;
        this.emitEvent({ type: 'chunk', turn: turns, data: event.payload.text });
      }
      // ... handle other event types
    }

    const result = await turn.result;
    return { success: true, answer, turns, ... };
  } finally {
    await session.close();
  }
}
```

**Recommend:** New session per task for isolation. Do not reuse sessions across different web UI requests.

---

## API Route Changes

### Routes to Remove (Claude-specific)

```
GET  /api/claude-cli/status     -> becomes GET  /api/kimi/status
POST /api/claude-cli/login      -> becomes POST /api/kimi/login
POST /api/claude-cli/login-code -> REMOVE (Kimi uses device auth, no code paste)
POST /api/claude-cli/logout     -> becomes POST /api/kimi/logout
```

**Note:** The `login-code` endpoint is not needed for Kimi. The device auth flow auto-completes when the user authenticates in the browser. The login flow becomes:

1. `POST /api/kimi/login` -> returns `{ url: "auth URL", deviceCode: "..." }`
2. Frontend opens URL in new tab, starts polling `GET /api/kimi/status`
3. Backend polls `auth.kimi.com/api/oauth/token` with the device_code
4. When authenticated, status returns `{ authenticated: true }`

### Route Implementation

```typescript
app.get('/api/kimi/status', async (_req, res) => {
  const kimiProvider = brain.getProviderManager().getProvider('kimi') as KimiProvider;
  if (!kimiProvider) { res.json({ installed: false, authenticated: false }); return; }
  const status = await kimiProvider.getCliStatus();
  const authMethod = await kimiProvider.getAuthMethod();
  res.json({ ...status, authMethod });
});

app.post('/api/kimi/login', async (_req, res) => {
  const kimiProvider = brain.getProviderManager().getProvider('kimi') as KimiProvider;
  if (!kimiProvider) { res.status(503).json({ error: 'Kimi provider not available' }); return; }
  const result = await kimiProvider.startLogin();
  res.json(result);
  // Note: no submitLoginCode needed -- frontend polls status instead
});

app.post('/api/kimi/logout', async (_req, res) => {
  const kimiProvider = brain.getProviderManager().getProvider('kimi') as KimiProvider;
  if (!kimiProvider) { res.status(503).json({ error: 'Kimi provider not available' }); return; }
  const result = await kimiProvider.logout();
  res.json(result);
});
```

### Agent Stream Route

The `/api/agent/stream` route (line 1534 in api.ts) already handles the switch between SDK and API modes:

```typescript
// CURRENT:
const useSdk = authMethod === 'sdk-subscription';
const agent = useSdk ? new SdkAgentRunner(agentConfig) : new AgentLoop(agentConfig);

// BECOMES:
const useSdk = authMethod === 'kimi-subscription';
const agent = useSdk ? new KimiAgentRunner(agentConfig) : new AgentLoop(agentConfig);
```

**AgentLoop stays.** When using API key mode, the existing AgentLoop + Brain + KimiProvider handles everything through the standard chat/chatStream interface. Only subscription mode uses KimiAgentRunner.

---

## tRPC Route Changes (livinityd)

### Current Claude-specific tRPC Procedures

From `livos/packages/livinityd/source/modules/ai/routes.ts`:

```
ai.getClaudeCliStatus    -> ai.getKimiCliStatus
ai.setClaudeAuthMethod   -> ai.setKimiAuthMethod
ai.startClaudeLogin      -> ai.startKimiLogin
ai.submitClaudeLoginCode -> REMOVE (not needed for Kimi)
ai.claudeLogout          -> ai.kimiLogout
```

These tRPC procedures proxy to Nexus API endpoints. The proxy pattern stays identical -- only the endpoint URLs change.

### Config tRPC Procedures

```typescript
// CURRENT:
const anthropicKey = await redis.get('nexus:config:anthropic_api_key')
const primaryProvider = await redis.get('nexus:config:primary_provider') || 'claude'

// BECOMES:
const kimiKey = await redis.get('nexus:config:kimi_api_key')
const primaryProvider = await redis.get('nexus:config:primary_provider') || 'kimi'
```

### Redis Key Migration

| Current Key | New Key |
|-------------|---------|
| `nexus:config:anthropic_api_key` | `nexus:config:kimi_api_key` |
| `nexus:config:claude_auth_method` | `nexus:config:kimi_auth_method` |
| `nexus:config:primary_provider` (value: `claude`) | `nexus:config:primary_provider` (value: `kimi`) |

---

## UI Changes (ai-config.tsx)

### Current UI Structure

The Settings > AI Config page has:
1. **Claude Provider** section with Radio Group:
   - SDK Subscription (recommended) -- OAuth flow with code paste
   - API Key -- input field for `sk-ant-...`
2. **Gemini (Fallback)** section with API key input
3. Save button

### New UI Structure

1. **Kimi Provider** section with Radio Group:
   - Kimi Subscription (recommended) -- OAuth via browser (no code paste)
   - API Key -- input field for Kimi API key
2. **Gemini (Fallback)** section (unchanged)
3. Save button

### UI Changes Required

- Replace all "Claude" text with "Kimi"
- Change auth link from Anthropic Console to Kimi membership page
- Update API key placeholder
- Update tRPC hook names (getClaudeCliStatus -> getKimiCliStatus, etc.)
- **Remove code paste UI** -- Kimi's device auth flow does not require it
- Simplify subscription auth to: button + status indicator + poll

**Simplified subscription UI flow:**

```
1. Click "Sign in with Kimi" button
2. Browser opens auth URL in new tab
3. Status indicator shows "Waiting for authentication..."
4. Frontend polls getKimiCliStatus every 3-5 seconds
5. When authenticated: show green checkmark + "Authenticated"
```

This is fewer components than Claude's flow (no code input, no submit button for code).

---

## Config Schema Changes

### Model Names

```typescript
// CURRENT (config/schema.ts):
export const ModelsConfigSchema = z.object({
  default: z.string().default('claude-haiku-4-5'),
  flash: z.string().default('claude-haiku-4-5'),
  haiku: z.string().default('claude-haiku-4-5'),
  sonnet: z.string().default('claude-sonnet-4-5'),
  opus: z.string().default('claude-opus-4-6'),
  // ...
});

// BECOMES:
export const ModelsConfigSchema = z.object({
  default: z.string().default('kimi-latest'),
  flash: z.string().default('kimi-latest'),
  haiku: z.string().default('kimi-latest'),
  sonnet: z.string().default('kimi-for-coding'),
  opus: z.string().default('kimi-for-coding'),
  // ...
});
```

### Provider Cost Defaults

```typescript
// ADD to types.ts PROVIDER_COST_DEFAULTS:
kimi: {
  flash: { input: 0.60, output: 2.50 },
  haiku: { input: 0.60, output: 2.50 },
  sonnet: { input: 0.60, output: 2.50 },
  opus: { input: 0.60, output: 2.50 },
},
```

---

## Data Flow: Complete Path

### API Key Mode (AgentLoop)

```
UI (ai-chat) -> tRPC ai.send -> livinityd -> HTTP POST /api/agent/stream (Nexus)
    -> AgentLoop.run(task)
    -> Brain.chat() / Brain.chatStream()
    -> ProviderManager.chat()
    -> KimiProvider.chat()  [OpenAI-compatible API call]
    -> https://api.kimi.com/coding/v1/chat/completions
    -> Response with function_call -> ToolRegistry.execute() -> loop
    -> Final answer -> SSE event -> UI
```

### Subscription Mode (KimiAgentRunner -- SDK)

```
UI (ai-chat) -> tRPC ai.send -> livinityd -> HTTP POST /api/agent/stream (Nexus)
    -> KimiAgentRunner.run(task)
    -> createSession({ workDir, model, yoloMode: true })
    -> [spawns 'kimi' CLI subprocess via Wire protocol]
    -> session.prompt(task)
    -> Turn async iterator
    -> ContentPart events -> SSE 'chunk' events -> UI
    -> ToolCall events [Kimi calls its built-in tools + external tools]
    -> External tool handler -> ToolRegistry.execute() -> ToolResult -> Kimi
    -> RunResult -> SSE 'done' event -> UI
    -> session.close()
```

### Subscription Mode (KimiAgentRunner -- Print Fallback)

```
UI (ai-chat) -> tRPC ai.send -> livinityd -> HTTP POST /api/agent/stream (Nexus)
    -> KimiAgentRunner.run(task)
    -> spawn('kimi', ['--print', '--output-format=stream-json', '--yolo', ...])
    -> Parse JSONL from stdout line by line
    -> {role:"assistant", content} -> SSE 'chunk' events -> UI
    -> {role:"assistant", tool_calls} -> SSE 'tool_call' events -> UI
    -> {role:"tool", content} -> SSE 'observation' events -> UI
    -> Process exit -> SSE 'done' event -> UI
```

### Streaming Event Flow to UI

```
Kimi Agent SDK         KimiAgentRunner          SSE/WebSocket          UI
     |                      |                       |                   |
     |--ContentPart(text)-->|                       |                   |
     |                      |--AgentEvent(chunk)-->|                   |
     |                      |                       |--SSE data:{}---->|
     |                      |                       |                   |--update chatStatus
     |--ToolCall----------->|                       |                   |
     |                      |--AgentEvent(tool)---->|                   |
     |                      |                       |--SSE data:{}---->|
     |                      |                       |                   |--show step
     |                      |                       |                   |
     |                      |--ToolRegistry.exec()  |                   |
     |                      |                       |                   |
     |<--ToolResult---------|                       |                   |
     |                      |--AgentEvent(obs)----->|                   |
     |                      |                       |--SSE data:{}---->|
     |                      |                       |                   |--update step
```

---

## Dependencies

### New npm Packages

```bash
# In nexus/
npm install @moonshot-ai/kimi-agent-sdk
# zod already installed (peer dep)
# 'openai' package may be useful for KimiProvider (OpenAI-compatible client)
npm install openai  # for KimiProvider API key mode
```

### System Dependencies (Server)

```bash
# Kimi CLI (Python-based, installed via uv)
curl -LsSf https://code.kimi.com/install.sh | bash
# OR: uv tool install --python 3.13 kimi-cli

# Verify:
kimi --version
kimi info  # shows available models and protocol version
```

**Important:** The Kimi CLI requires Python 3.12-3.14 (3.13 recommended) and `uv` package manager. The production server needs these installed. This is a new system dependency that doesn't exist for Claude Code (which is a standalone binary).

### Packages to Remove

```bash
npm uninstall @anthropic-ai/sdk             # Anthropic SDK (used by ClaudeProvider)
npm uninstall @anthropic-ai/claude-agent-sdk # Claude Agent SDK (used by SdkAgentRunner)
```

---

## Complete File Manifest

### Files to CREATE

| File | Purpose |
|------|---------|
| `nexus/packages/core/src/providers/kimi.ts` | KimiProvider implementing AIProvider interface |
| `nexus/packages/core/src/kimi-agent-runner.ts` | KimiAgentRunner (subprocess mode) |

### Files to MODIFY

| File | What Changes |
|------|-------------|
| `nexus/packages/core/src/providers/manager.ts` | Replace `ClaudeProvider` with `KimiProvider`, update fallback order |
| `nexus/packages/core/src/providers/index.ts` | Export `KimiProvider` instead of `ClaudeProvider` |
| `nexus/packages/core/src/providers/types.ts` | Add Kimi cost defaults; optionally rename `ClaudeToolDefinition` to `ToolDefinition` |
| `nexus/packages/core/src/api.ts` | Replace `/api/claude-cli/*` routes with `/api/kimi/*`; update agent stream to use KimiAgentRunner |
| `nexus/packages/core/src/daemon.ts` | Replace `ClaudeProvider` import/usage with `KimiProvider`; update `SdkAgentRunner` to `KimiAgentRunner` |
| `nexus/packages/core/src/config/schema.ts` | Update model defaults from `claude-*` to `kimi-*` |
| `nexus/packages/core/package.json` | Add `@moonshot-ai/kimi-agent-sdk`, `openai`; remove `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk` |
| `livos/packages/livinityd/source/modules/ai/routes.ts` | Replace Claude tRPC procedures with Kimi equivalents |
| `livos/packages/ui/src/routes/settings/ai-config.tsx` | Replace Claude auth UI with Kimi auth UI |

### Files to DELETE

| File | Why |
|------|-----|
| `nexus/packages/core/src/providers/claude.ts` | Replaced by `kimi.ts` |
| `nexus/packages/core/src/sdk-agent-runner.ts` | Replaced by `kimi-agent-runner.ts` |

---

## Build Order (Suggested Phase Sequence)

### Phase 1: KimiProvider (API Key Mode)

**Rationale:** Get basic chat working first. No CLI dependency needed.

1. Create `providers/kimi.ts` implementing AIProvider interface
2. Use `openai` npm package with custom `baseURL: 'https://api.kimi.com/coding/v1'`
3. Implement `chat()`, `chatStream()`, `think()`, `isAvailable()`, `getModels()`
4. Translate ClaudeToolDefinition to OpenAI function format (and parse responses back)
5. Register in ProviderManager with `kimi` key
6. Update fallback order to `['kimi', 'gemini']`
7. Add Redis keys: `nexus:config:kimi_api_key`
8. Test: API key mode chat through existing AgentLoop

**Files modified:** `providers/kimi.ts` (new), `providers/manager.ts`, `providers/index.ts`, `providers/types.ts`
**Dependencies:** `npm install openai` (for OpenAI-compatible client)

### Phase 2: API Routes + tRPC + UI

**Rationale:** Users need to configure Kimi credentials through the UI.

1. Add `/api/kimi/status`, `/api/kimi/login`, `/api/kimi/logout` routes in `api.ts`
2. Remove `/api/claude-cli/*` routes
3. Update tRPC procedures in livinityd `ai/routes.ts`
4. Update `ai-config.tsx` to show Kimi configuration (simpler auth flow, no code paste)
5. Update Redis config keys
6. Test: Full settings flow (enter API key, see status, chat works)

**Files modified:** `api.ts`, `livinityd/modules/ai/routes.ts`, `ui/routes/settings/ai-config.tsx`

### Phase 3: KimiAgentRunner (Subscription Mode)

**Rationale:** More complex, depends on Kimi CLI being installed on server.

1. Install Kimi CLI on production server (`curl -LsSf https://code.kimi.com/install.sh | bash`)
2. Authenticate Kimi CLI on server (`kimi login`)
3. Create `kimi-agent-runner.ts` -- start with Print mode fallback (simpler, no SDK dep)
4. Implement JSONL parsing from `kimi --print --output-format=stream-json`
5. Map JSONL messages to AgentEvent interface
6. Handle MCP tools via `--mcp-config` inline JSON flag
7. Upgrade to SDK path (`createSession` + `createExternalTool`) if SDK is stable
8. Test: Subscription mode agent tasks

**Files modified:** `kimi-agent-runner.ts` (new), `api.ts` (agent stream switch), `daemon.ts` (import swap)

### Phase 4: Config Schema + Cleanup

**Rationale:** Final cleanup after core functionality works.

1. Update model names in config schema defaults
2. Update DEFAULT_NEXUS_CONFIG
3. Remove Claude-specific code (claude.ts, sdk-agent-runner.ts)
4. Remove `@anthropic-ai/*` packages
5. Update any remaining references in codebase
6. Migration script for Redis keys (anthropic -> kimi)
7. Update server deployment scripts (install Kimi CLI, authenticate)
8. Test: Full end-to-end on production

**Files modified:** `config/schema.ts`, `package.json`, cleanup of old files

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Kimi Agent SDK is 0.x (immature API surface) | HIGH | MEDIUM | Start with Print mode fallback, upgrade to SDK once stable |
| Python dependency on server | LOW | LOW | uv installer is reliable, Python 3.13 widely available |
| Kimi API tool calling format differences cause bugs | MEDIUM | MEDIUM | Thorough test of function_call -> tool_use translation |
| MCP config injection fails in SDK mode | MEDIUM | LOW | Use `--mcp-config` inline JSON via Print mode as fallback |
| OAuth device auth flow doesn't work on headless server | MEDIUM | MEDIUM | Test early; may need API key mode as primary auth initially |
| Model tier mapping imprecise | MEDIUM | LOW | Verify against `kimi info` output at runtime |
| Kimi CLI not available as standalone binary | LOW | MEDIUM | Requires Python + uv, more deps than Claude's standalone binary |
| OpenAI function_call arguments are JSON strings (not objects) | LOW | LOW | Always `JSON.parse(arguments)` in response handler |

---

## Anti-Patterns to Avoid

### 1. Don't Write to ~/.kimi/mcp.json Per-Request
Writing MCP config to disk on every agent request creates race conditions when multiple requests run simultaneously. Use `--mcp-config` inline JSON flag instead (no disk writes).

### 2. Don't Reuse Sessions Across Web UI Requests
Each web UI agent stream request should create its own session and close it when done. Reusing sessions creates state leakage between unrelated tasks.

### 3. Don't Remove ClaudeProvider Before KimiProvider Is Fully Tested
Keep ClaudeProvider code in place during development. Delete only in the final cleanup phase after Kimi is confirmed working end-to-end.

### 4. Don't Hard-Code Model Names
Use the tier mapping (flash/haiku/sonnet/opus -> kimi model IDs) consistently. Model names may change; the tier abstraction protects against this.

### 5. Don't Assume Kimi's function_call Arguments Are Objects
Claude returns `tool_use.input` as a parsed JSON object. Kimi (OpenAI format) returns `function.arguments` as a JSON string. Always parse it.

---

## Open Questions

1. **External tool registration in SDK:** Does `createExternalTool()` integrate with `createSession()` directly? The SDK docs reference both but the exact wiring needs testing. **Fallback:** Use Print mode with `--mcp-config` instead.

2. **Token usage reporting:** Kimi SDK reports usage via `StatusUpdate` events mid-stream. Does it also report total usage in `RunResult`? The current `AgentResult` expects final token counts. **Fallback:** Sum from StatusUpdate events.

3. **Kimi CLI on Windows:** The production server is Linux, but development is Windows. Does the Kimi CLI work on Windows for local testing? The CLI is Python-based and should work, but needs verification.

4. **Kimi API base URL:** Is it `https://api.kimi.com/coding/v1` or `https://api.moonshot.ai/v1`? Documentation references both. The "Kimi for Coding" specific endpoint may have different model availability. **Test both.**

5. **Device auth on headless server:** The `kimi login` command may try to open a browser. On a headless server, we need the device auth API (`auth.kimi.com/api/oauth/device_authorization`) to get a URL without requiring a local browser.

---

## Sources

- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli) -- CLI source, README, architecture
- [Kimi Agent SDK GitHub](https://github.com/MoonshotAI/kimi-agent-sdk) -- Official SDK repo (Python, Node.js, Go)
- [Kimi CLI MCP Docs](https://moonshotai.github.io/kimi-cli/en/customization/mcp.html) -- MCP server configuration [HIGH confidence]
- [Kimi CLI Print Mode Docs](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html) -- Non-interactive mode, JSONL format [HIGH confidence]
- [Kimi CLI Wire Mode Docs](https://moonshotai.github.io/kimi-cli/en/customization/wire-mode.html) -- JSON-RPC 2.0 bidirectional protocol [MEDIUM confidence]
- [Kimi CLI Command Reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html) -- All CLI flags [HIGH confidence]
- [Kimi CLI Technical Deep Dive](https://llmmultiagents.com/en/blogs/kimi-cli-technical-deep-dive) -- Architecture analysis [MEDIUM confidence]
- [Kimi CLI Auth Issue #757](https://github.com/MoonshotAI/kimi-cli/issues/757) -- OAuth/subscription auth implementation [HIGH confidence]
- [Moonshot AI Platform](https://platform.moonshot.ai/) -- API documentation
- [One Agent SDK](https://github.com/odysa/one-agent-sdk) -- Provider-agnostic wrapper showing Kimi SDK patterns [MEDIUM confidence]
- [Kimi K2.5 Developer Guide](https://www.nxcode.io/resources/news/kimi-k2-5-developer-guide-kimi-code-cli-2026) -- Model capabilities and pricing [MEDIUM confidence]

### Confidence Levels

| Area | Level | Reason |
|------|-------|--------|
| KimiProvider (API key mode) | HIGH | OpenAI-compatible format is well-documented, standard pattern |
| CLI flags (--print, --mcp-config, --yolo) | HIGH | Documented in official CLI reference, verified on multiple sources |
| KimiAgentRunner (Print mode fallback) | HIGH | Spawn child process + parse JSONL is straightforward, well-documented |
| KimiAgentRunner (SDK path) | MEDIUM | SDK is 0.x; createSession/createExternalTool API shape needs testing |
| OAuth device auth flow | MEDIUM | Endpoints found in issue tracker, but not in official SDK docs |
| External tool bridging via SDK | MEDIUM | createExternalTool documented but session integration unclear |
| MCP inline config | HIGH | `--mcp-config JSON` flag documented in CLI reference |
| Model tier mapping | LOW | Exact model IDs need runtime verification via `kimi info` |
| Wire mode protocol | MEDIUM | Documented but marked "experimental" |
