# Claude Agent SDK - Comprehensive Research

**Date:** 2026-02-18
**Package:** `@anthropic-ai/claude-agent-sdk`
**Current Version:** 0.2.45
**Status:** Active, production-ready (V1 stable, V2 preview)

---

## Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Core API Reference](#2-core-api-reference)
3. [Message Types](#3-message-types)
4. [Permission System](#4-permission-system)
5. [MCP Integration](#5-mcp-integration)
6. [Custom Tools (SDK MCP Servers)](#6-custom-tools-sdk-mcp-servers)
7. [Session Management](#7-session-management)
8. [Streaming and Real-Time Output](#8-streaming-and-real-time-output)
9. [Authentication](#9-authentication)
10. [Built-in Tools Reference](#10-built-in-tools-reference)
11. [Advanced Features](#11-advanced-features)
12. [Hosting and Deployment](#12-hosting-and-deployment)
13. [Limitations and Gotchas](#13-limitations-and-gotchas)
14. [Cost Model](#14-cost-model)
15. [V2 Preview Interface](#15-v2-preview-interface)
16. [Implementation Recommendations](#16-implementation-recommendations)

---

## 1. Overview and Architecture

The Claude Agent SDK (formerly "Claude Code SDK") is the official Anthropic SDK for building AI agents that autonomously read files, run commands, search the web, edit code, and more. It gives you the same tools, agent loop, and context management that power Claude Code itself, exposed as a programmable TypeScript/Python library.

**Key architectural insight:** The SDK wraps the Claude Code CLI as a subprocess. It is NOT a thin wrapper around the Anthropic Messages API. This means:

- It requires Node.js (for the bundled Claude Code CLI) even in Python projects
- Authentication goes through Claude Code CLI credentials OR `ANTHROPIC_API_KEY`
- The agent loop (tool execution, retries, context management) happens inside the subprocess
- Session state is stored on disk by Claude Code

**The rename:** Claude Code SDK -> Claude Agent SDK happened recently. A migration guide exists for breaking changes.

**Repository stats (Feb 2026):**
- GitHub: `anthropics/claude-agent-sdk-typescript`
- Version: 0.2.45 (39 releases total)
- Used by: 617+ projects
- 109 commits on main branch

**Comparison to Anthropic Client SDK:**
```typescript
// Client SDK: YOU implement the tool loop
let response = await client.messages.create({ ...params });
while (response.stop_reason === "tool_use") {
  const result = yourToolExecutor(response.tool_use);
  response = await client.messages.create({ tool_result: result, ...params });
}

// Agent SDK: Claude handles everything autonomously
for await (const message of query({ prompt: "Fix the bug in auth.py" })) {
  console.log(message);
}
```

---

## 2. Core API Reference

### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
# Requires Node.js 18+, Zod ^3.24.1
```

### `query()` Function

The primary entry point. Returns an async generator that streams messages.

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

#### Full Options Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `abortController` | `AbortController` | `new AbortController()` | Cancel operations |
| `additionalDirectories` | `string[]` | `[]` | Extra directories Claude can access |
| `agents` | `Record<string, AgentDefinition>` | `undefined` | Define subagents programmatically |
| `allowDangerouslySkipPermissions` | `boolean` | `false` | Required when using `bypassPermissions` mode |
| `allowedTools` | `string[]` | All tools | Whitelist of tool names Claude can use |
| `betas` | `SdkBeta[]` | `[]` | Enable beta features (e.g. 1M context window) |
| `canUseTool` | `CanUseTool` | `undefined` | Custom permission callback per tool call |
| `continue` | `boolean` | `false` | Continue most recent conversation |
| `cwd` | `string` | `process.cwd()` | Working directory for Claude |
| `disallowedTools` | `string[]` | `[]` | Blacklist of tool names |
| `enableFileCheckpointing` | `boolean` | `false` | Track file changes for rewinding |
| `env` | `Dict<string>` | `process.env` | Environment variables for Claude subprocess |
| `executable` | `'bun' \| 'deno' \| 'node'` | Auto-detected | JS runtime |
| `executableArgs` | `string[]` | `[]` | Args to the runtime executable |
| `extraArgs` | `Record<string, string \| null>` | `{}` | Additional CLI arguments |
| `fallbackModel` | `string` | `undefined` | Model if primary fails |
| `forkSession` | `boolean` | `false` | Create new session ID when resuming |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | Lifecycle callbacks |
| `includePartialMessages` | `boolean` | `false` | Include streaming text chunks |
| `maxBudgetUsd` | `number` | `undefined` | Hard cost cap in USD |
| `maxThinkingTokens` | `number` | `undefined` | Limit thinking tokens |
| `maxTurns` | `number` | `undefined` | Max agent loop iterations |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP server configurations |
| `model` | `string` | CLI default | Claude model to use |
| `outputFormat` | `{ type: 'json_schema', schema: JSONSchema }` | `undefined` | Structured output schema |
| `pathToClaudeCodeExecutable` | `string` | Bundled | Override Claude Code CLI path |
| `permissionMode` | `PermissionMode` | `'default'` | Global permission behavior |
| `permissionPromptToolName` | `string` | `undefined` | MCP tool for permission prompts |
| `plugins` | `SdkPluginConfig[]` | `[]` | Load local plugins |
| `resume` | `string` | `undefined` | Session ID to resume |
| `resumeSessionAt` | `string` | `undefined` | Resume at specific message UUID |
| `sandbox` | `SandboxSettings` | `undefined` | Sandbox configuration |
| `settingSources` | `SettingSource[]` | `[]` | Which filesystem settings to load |
| `stderr` | `(data: string) => void` | `undefined` | Callback for stderr output |
| `strictMcpConfig` | `boolean` | `false` | Strict MCP validation |
| `systemPrompt` | `string \| { type: 'preset'; preset: 'claude_code'; append?: string }` | `undefined` | Custom system prompt |
| `tools` | `string[] \| { type: 'preset'; preset: 'claude_code' }` | `undefined` | Tool preset configuration |

#### `Query` Object Methods

The `query()` return value extends `AsyncGenerator<SDKMessage>` with additional methods:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;              // Interrupt current operation (streaming input only)
  rewindFiles(userMessageUuid: string): Promise<void>;  // Revert file changes (requires checkpointing)
  setPermissionMode(mode: PermissionMode): Promise<void>; // Change mode mid-session
  setModel(model?: string): Promise<void>;  // Switch model mid-session
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
  supportedCommands(): Promise<SlashCommand[]>;  // Available slash commands
  supportedModels(): Promise<ModelInfo[]>;       // Available models
  mcpServerStatus(): Promise<McpServerStatus[]>; // MCP connection status
  accountInfo(): Promise<AccountInfo>;           // Current account info
}
```

### `tool()` Function

Creates a type-safe MCP tool definition.

```typescript
function tool<Schema extends ZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,                      // Zod schema object
  handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>
): SdkMcpToolDefinition<Schema>
```

Example:
```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const weatherTool = tool(
  "get_weather",
  "Get current temperature for a location",
  {
    latitude: z.number().describe("Latitude coordinate"),
    longitude: z.number().describe("Longitude coordinate")
  },
  async (args) => {
    const response = await fetch(`https://api.weather.example.com?lat=${args.latitude}&lon=${args.longitude}`);
    const data = await response.json();
    return {
      content: [{ type: "text", text: `Temperature: ${data.temp}°F` }]
    };
  }
);
```

### `createSdkMcpServer()` Function

Creates an in-process MCP server that Claude can use without spawning a subprocess.

```typescript
function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
}): McpSdkServerConfigWithInstance
```

Example:
```typescript
import { createSdkMcpServer, tool, query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myServer = createSdkMcpServer({
  name: "my-custom-tools",
  version: "1.0.0",
  tools: [weatherTool, anotherTool]
});

// IMPORTANT: Must use async generator for prompt when using SDK MCP servers
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "What's the weather in NYC?" }
  };
}

for await (const message of query({
  prompt: generateMessages(),  // NOT a plain string when using SDK MCP servers
  options: {
    mcpServers: { "my-custom-tools": myServer },
    allowedTools: ["mcp__my-custom-tools__get_weather"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

**CRITICAL GOTCHA:** When using `createSdkMcpServer()`, the `prompt` parameter MUST be an async generator, not a plain string.

---

## 3. Message Types

### `SDKMessage` Union Type

```typescript
type SDKMessage =
  | SDKSystemMessage        // System init/compact boundary events
  | SDKAssistantMessage     // Claude's responses and tool calls
  | SDKUserMessage          // User input messages
  | SDKUserMessageReplay    // Replayed messages with UUID
  | SDKResultMessage        // Final result (success or error)
  | SDKPartialAssistantMessage  // Streaming chunks (includePartialMessages only)
  | SDKCompactBoundaryMessage   // Context compaction boundary
```

### `SDKSystemMessage` - Init Event

First message received, contains session metadata:

```typescript
type SDKSystemMessage = {
  type: "system";
  subtype: "init" | "compact_boundary";
  uuid: UUID;
  session_id: string;           // CAPTURE THIS for session resume
  apiKeySource: ApiKeySource;
  cwd: string;
  tools: string[];              // List of available tool names
  mcp_servers: { name: string; status: string; }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
}
```

### `SDKAssistantMessage` - Claude's Response

```typescript
type SDKAssistantMessage = {
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: APIAssistantMessage;  // From @anthropic-ai/sdk, has content array
  parent_tool_use_id: string | null;  // Non-null when inside a subagent
}
```

The `message.content` array contains `TextBlock` and `ToolUseBlock` items.

### `SDKResultMessage` - Final Result

```typescript
// Success case
type SDKResultSuccess = {
  type: "result";
  subtype: "success";
  uuid: UUID;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;               // Final text output
  total_cost_usd: number;       // Total cost for this run
  usage: NonNullableUsage;      // Token usage totals
  modelUsage: { [modelName: string]: ModelUsage };  // Per-model breakdown
  permission_denials: SDKPermissionDenial[];
  structured_output?: unknown;   // Present if outputFormat was specified
}

// Error cases (all have same shape)
type SDKResultError = {
  type: "result";
  subtype:
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";
  uuid: UUID;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  usage: NonNullableUsage;
  modelUsage: { [modelName: string]: ModelUsage };
  permission_denials: SDKPermissionDenial[];
  errors: string[];
}
```

### Consuming Messages - Common Pattern

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let sessionId: string | undefined;

for await (const message of query({ prompt: "Analyze this codebase", options: { ... } })) {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        sessionId = message.session_id;
        console.log("Tools available:", message.tools);
        console.log("MCP servers:", message.mcp_servers);
      }
      break;

    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);  // Stream Claude's thinking
        } else if (block.type === "tool_use") {
          console.log(`[Tool: ${block.name}]`);  // Tool being called
        }
      }
      break;

    case "result":
      if (message.subtype === "success") {
        console.log("\nFinal result:", message.result);
        console.log("Cost:", `$${message.total_cost_usd.toFixed(4)}`);
        console.log("Turns:", message.num_turns);
      } else {
        console.error("Failed:", message.subtype, message.errors);
      }
      break;
  }
}
```

---

## 4. Permission System

### Permission Modes

```typescript
type PermissionMode =
  | "default"            // No auto-approval; calls canUseTool callback for each tool
  | "acceptEdits"        // Auto-approves: file edits, mkdir, touch, rm, mv, cp
  | "bypassPermissions"  // Auto-approves everything; hooks can still block
  | "plan"               // No tool execution; Claude plans only, may ask user questions
```

**Evaluation order (highest to lowest precedence):**
1. Hooks (`PreToolUse` hook can allow/deny/modify)
2. Permission rules from `settings.json` (deny -> allow -> ask)
3. Permission mode (the `permissionMode` option)
4. `canUseTool` callback (called if not resolved above)

### `canUseTool` Callback

Custom per-tool permission handler:

```typescript
type CanUseTool = (
  toolName: string,
  input: ToolInput,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
  }
) => Promise<PermissionResult>;

type PermissionResult =
  | {
      behavior: "allow";
      updatedInput: ToolInput;        // Can modify tool input before execution
      updatedPermissions?: PermissionUpdate[];
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;            // Stop the agent entirely
    }
```

Example - Read-only enforcement:
```typescript
const result = query({
  prompt: "Analyze the codebase",
  options: {
    permissionMode: "default",
    canUseTool: async (toolName, input) => {
      const readOnlyTools = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
      if (readOnlyTools.includes(toolName)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: `Tool ${toolName} not allowed in read-only mode` };
    }
  }
});
```

### `allowedTools` Configuration

```typescript
options: {
  // Built-in tools by name
  allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],

  // MCP tools use prefix pattern: mcp__<server-name>__<tool-name>
  // allowedTools: ["mcp__github__list_issues", "mcp__db__*"]

  // Wildcards supported for MCP tools
  // allowedTools: ["mcp__myserver__*"]  // All tools from myserver
}
```

### Setting Source Configuration

Controls whether Claude loads filesystem settings (`~/.claude/settings.json`, `.claude/settings.json`):

```typescript
type SettingSource = "user" | "project" | "local";

// Default: [] (empty) - no filesystem settings loaded (isolated mode)
// Load CLAUDE.md project instructions:
options: {
  settingSources: ["project"],
  systemPrompt: { type: "preset", preset: "claude_code" }
}
```

**Important:** `settingSources` defaults to `[]` (no filesystem settings). This is a breaking change from SDK v0.0.x which loaded all settings by default.

### SubAgent Permission Inheritance

When `permissionMode: "bypassPermissions"` is set, ALL subagents (spawned via the `Task` tool) inherit this mode and it cannot be overridden. This is a significant security consideration.

---

## 5. MCP Integration

### MCP Server Config Types

```typescript
// 1. Local subprocess (stdio)
type McpStdioServerConfig = {
  type?: "stdio";          // Default if omitted
  command: string;         // e.g. "npx"
  args?: string[];         // e.g. ["-y", "@modelcontextprotocol/server-github"]
  env?: Record<string, string>;  // Environment variables for the subprocess
}

// 2. Remote SSE server
type McpSSEServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;  // For auth tokens
}

// 3. Remote HTTP server
type McpHttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

// 4. In-process SDK server (from createSdkMcpServer)
type McpSdkServerConfigWithInstance = {
  type: "sdk";
  name: string;
  instance: McpServer;
}
```

### Tool Naming Convention

MCP tools are accessed via a structured naming pattern:

```
mcp__<server-name>__<tool-name>
```

Examples:
- Server `"github"`, tool `list_issues` → `mcp__github__list_issues`
- Server `"my-custom-tools"`, tool `get_weather` → `mcp__my-custom-tools__get_weather`
- Wildcard for all tools from a server → `mcp__github__*`

### Passing MCP Servers to `query()`

```typescript
for await (const message of query({
  prompt: "List the 3 most recent issues in anthropics/claude-code",
  options: {
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
      },
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", process.env.DATABASE_URL]
      },
      "cloud-docs": {
        type: "http",
        url: "https://docs.example.com/mcp",
        headers: { Authorization: `Bearer ${process.env.API_TOKEN}` }
      }
    },
    // Must explicitly allow MCP tools
    allowedTools: [
      "mcp__github__list_issues",
      "mcp__github__search_issues",
      "mcp__postgres__query",
      "mcp__cloud-docs__*"
    ]
  }
})) { ... }
```

### Checking MCP Server Status

```typescript
for await (const message of query({ prompt: "...", options })) {
  if (message.type === "system" && message.subtype === "init") {
    const failed = message.mcp_servers.filter(s => s.status !== "connected");
    if (failed.length > 0) {
      console.error("MCP servers failed:", failed);
    }
  }
}
```

Server statuses: `"connected"`, `"failed"`, `"needs-auth"`, `"pending"`

### MCP Tool Search (Large Tool Sets)

When MCP tool descriptions would consume more than 10% of the context window, the SDK automatically enables "tool search" - tools are loaded on-demand rather than pre-loaded.

```typescript
// Control via env option
options: {
  env: {
    ENABLE_TOOL_SEARCH: "auto"     // Default: activates at 10% threshold
    ENABLE_TOOL_SEARCH: "auto:5"   // Activate at 5% threshold
    ENABLE_TOOL_SEARCH: "true"     // Always enabled
    ENABLE_TOOL_SEARCH: "false"    // Always disabled (load all upfront)
  }
}
```

**Requirement:** Tool search requires Sonnet 4+ or Opus 4+. Haiku models do NOT support tool search.

### Loading from `.mcp.json`

Create a `.mcp.json` file at project root for automatic loading:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

The `${VAR_NAME}` syntax expands environment variables at runtime.

### MCP Connection Timeout

MCP servers have a 60-second startup timeout. If a server takes longer to initialize, the connection fails. Solutions:
- Pre-warm the server before starting the agent
- Use a lighter-weight MCP server implementation
- Check server logs for initialization bottlenecks

---

## 6. Custom Tools (SDK MCP Servers)

The `createSdkMcpServer()` and `tool()` functions allow you to define custom tools that run in-process (no subprocess needed).

### Full Example

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// 1. Define tools with Zod schemas
const queryDatabaseTool = tool(
  "query_database",
  "Execute a read-only SQL query against the production database",
  {
    sql: z.string().describe("SQL query to execute (SELECT only)"),
    limit: z.number().optional().default(100).describe("Max rows to return")
  },
  async (args) => {
    try {
      const rows = await db.query(args.sql, { limit: args.limit });
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }]
      };
    }
  }
);

const sendSlackTool = tool(
  "send_slack_message",
  "Send a message to a Slack channel",
  {
    channel: z.string().describe("Channel name without #"),
    message: z.string().describe("Message text to send")
  },
  async (args) => {
    await slackClient.postMessage({ channel: `#${args.channel}`, text: args.message });
    return { content: [{ type: "text", text: "Message sent successfully" }] };
  }
);

// 2. Create the in-process server
const customServer = createSdkMcpServer({
  name: "livos-tools",
  version: "1.0.0",
  tools: [queryDatabaseTool, sendSlackTool]
});

// 3. Use async generator for prompt (REQUIRED with SDK MCP servers)
async function* makePrompt(userMessage: string) {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: userMessage }
  };
}

// 4. Query with the custom server
for await (const message of query({
  prompt: makePrompt("How many users signed up this week? Send a summary to #metrics"),
  options: {
    mcpServers: { "livos-tools": customServer },
    allowedTools: [
      "mcp__livos-tools__query_database",
      "mcp__livos-tools__send_slack_message"
    ],
    maxTurns: 5
  }
})) { ... }
```

### `CallToolResult` Type

The handler must return this shape:

```typescript
type CallToolResult = {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;      // For type "text"
    data?: string;      // For type "image" (base64)
    mimeType?: string;  // For type "image"
    uri?: string;       // For type "resource"
  }>;
  isError?: boolean;    // Set to true to signal tool failure
}
```

---

## 7. Session Management

### Session ID Capture

The `session_id` appears in the first `system` init message:

```typescript
let sessionId: string | undefined;

for await (const message of query({ prompt: "Analyze auth.py", options: { ... } })) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
    // Persist this to database/file for later resumption
  }
}
```

### Resuming a Session

```typescript
for await (const message of query({
  prompt: "Now find all callers of the auth module",
  options: {
    resume: sessionId,           // Previously captured session ID
    allowedTools: ["Read", "Glob", "Grep"]
  }
})) { ... }
```

Claude will have full context from the previous session.

### Forking a Session

Create a branch from a resume point without modifying the original:

```typescript
for await (const message of query({
  prompt: "Try a GraphQL approach instead",
  options: {
    resume: sessionId,
    forkSession: true  // New session ID generated; original preserved
  }
})) {
  if (message.type === "system" && message.subtype === "init") {
    const forkedId = message.session_id;  // Different from original sessionId
  }
}
```

| Setting | `forkSession: false` (default) | `forkSession: true` |
|---------|-------------------------------|---------------------|
| Session ID | Same as original | New ID generated |
| History | Appended to original | New branch from resume point |
| Original | Modified | Preserved unchanged |
| Use case | Linear conversation | Explore alternatives |

### `continue` Option

Alternative to `resume` - continues the most recent conversation without needing the session ID:

```typescript
options: { continue: true }
```

### File Checkpointing (Rewind)

Track file changes and revert them:

```typescript
const q = query({
  prompt: "Refactor the auth module",
  options: {
    enableFileCheckpointing: true,
    allowedTools: ["Read", "Edit", "Write"]
  }
});

let userMessageUuid: string | undefined;

for await (const message of q) {
  if (message.type === "user") {
    userMessageUuid = message.uuid;
  }
  // ... handle messages
}

// Later: revert all file changes from this session
await q.rewindFiles(userMessageUuid!);
```

### Resume at Specific Message

Resume from a specific point in the conversation:

```typescript
options: {
  resume: sessionId,
  resumeSessionAt: specificMessageUuid  // UUID of the message to resume from
}
```

---

## 8. Streaming and Real-Time Output

### Default Streaming (Complete Messages)

By default, `query()` streams complete messages as they become available. You get full `SDKAssistantMessage` objects when Claude finishes a response or tool call.

### Real-Time Text Streaming

To get individual text chunks as Claude types:

```typescript
for await (const message of query({
  prompt: "Explain this codebase",
  options: {
    includePartialMessages: true  // Enable streaming chunks
  }
})) {
  if (message.type === "stream_event") {
    // Real-time streaming chunks
    const event = message.event;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  } else if (message.type === "result") {
    // Final result still arrives
  }
}
```

`SDKPartialAssistantMessage`:
```typescript
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: RawMessageStreamEvent;  // From @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
}
```

### Streaming Input Mode (Multi-Turn)

For interactive multi-turn conversations with an async generator prompt:

```typescript
async function* createConversation() {
  yield {
    type: "user" as const,
    session_id: "",
    message: { role: "user" as const, content: "What files are in src/?" },
    parent_tool_use_id: null
  };

  // Wait for Claude to respond before yielding next message...
  // (requires coordination with the consuming loop)

  yield {
    type: "user" as const,
    session_id: "",
    message: { role: "user" as const, content: "Now analyze auth.ts" },
    parent_tool_use_id: null
  };
}

const q = query({
  prompt: createConversation(),
  options: { allowedTools: ["Read", "Glob"] }
});

// Methods only available in streaming input mode:
await q.setPermissionMode("acceptEdits");
await q.setModel("claude-opus-4-6");
await q.interrupt();  // Interrupt current operation
```

### Context Auto-Compaction

When the conversation approaches the context limit, Claude Code automatically compacts it. You receive a `compact_boundary` system message:

```typescript
type SDKCompactBoundaryMessage = {
  type: "system";
  subtype: "compact_boundary";
  uuid: UUID;
  session_id: string;
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;  // Token count before compaction
  };
}
```

---

## 9. Authentication

### Primary Method: API Key

Set `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

The SDK reads this directly. No Claude Code CLI installation needed for the API key path.

### Cloud Provider Authentication

```bash
# Amazon Bedrock
export CLAUDE_CODE_USE_BEDROCK=1
# Then configure standard AWS credentials (AWS_ACCESS_KEY_ID, etc.)

# Google Vertex AI
export CLAUDE_CODE_USE_VERTEX=1
# Then configure Google Cloud credentials

# Microsoft Azure AI Foundry
export CLAUDE_CODE_USE_FOUNDRY=1
# Then configure Azure credentials
```

### OAuth Token (Max Plan Workaround)

**Discovered community workaround (confirmed Feb 2026):**

If you have a Claude Pro/Max subscription and want to use the Agent SDK with your subscription billing (instead of pay-per-token API billing):

```bash
# 1. Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 2. Generate an OAuth token
claude setup-token

# 3. Export the token
export CLAUDE_CODE_OAUTH_TOKEN=<token from above>

# 4. Run your SDK application - it will use your subscription
node my-agent.js
```

**Status:** This workaround was reported and confirmed working in GitHub Issue #559 (closed as completed Feb 16, 2026). The CLI `claude -p` works with Max billing natively; the SDK now also supports this via `CLAUDE_CODE_OAUTH_TOKEN`.

**Official stance:** Anthropic does NOT allow third-party developers to offer claude.ai login/rate limits for their products. This OAuth token approach is for personal use by the Max subscriber themselves.

### `ApiKeySource` in Init Message

The `system` init message includes `apiKeySource`:

```typescript
type ApiKeySource = "user" | "project" | "org" | "temporary";
```

### Account Info

```typescript
const q = query({ prompt: "...", options: { ... } });
const accountInfo = await q.accountInfo();
// Returns: { email?, organization?, subscriptionType?, tokenSource?, apiKeySource? }
```

---

## 10. Built-in Tools Reference

All tool names for use in `allowedTools`/`disallowedTools`:

| Tool Name | Description | Key Input Fields |
|-----------|-------------|-----------------|
| `Task` | Launch subagent for complex tasks | `description`, `prompt`, `subagent_type` |
| `AskUserQuestion` | Ask user clarifying questions (1-4 questions) | `questions[]` with options |
| `Bash` | Execute shell commands | `command`, `timeout?`, `run_in_background?` |
| `BashOutput` | Get output from background bash | `bash_id`, `filter?` |
| `Edit` | String replace in files | `file_path`, `old_string`, `new_string`, `replace_all?` |
| `Read` | Read files (text/image/PDF/notebook) | `file_path`, `offset?`, `limit?` |
| `Write` | Write/overwrite a file | `file_path`, `content` |
| `Glob` | Find files by pattern | `pattern`, `path?` |
| `Grep` | Search file contents (ripgrep) | `pattern`, `path?`, `glob?`, `output_mode?` |
| `KillBash` | Kill background bash process | `shell_id` |
| `NotebookEdit` | Edit Jupyter notebook cells | `notebook_path`, `cell_id?`, `new_source` |
| `WebFetch` | Fetch URL and process with AI | `url`, `prompt` |
| `WebSearch` | Search the web | `query`, `allowed_domains?`, `blocked_domains?` |
| `TodoWrite` | Manage task list | `todos[]` with status |
| `ExitPlanMode` | Exit plan mode with proposal | `plan` |
| `ListMcpResources` | List MCP resources | `server?` |
| `ReadMcpResource` | Read an MCP resource | `server`, `uri` |

### Enabling/Disabling Specific Tools

```typescript
// Only allow read-only tools
options: { allowedTools: ["Read", "Glob", "Grep", "WebSearch"] }

// Use Claude Code's full default toolset
options: { tools: { type: "preset", preset: "claude_code" } }

// Disable specific tools
options: { disallowedTools: ["Bash", "Write"] }

// Restrict to specific Bash commands via canUseTool
options: {
  allowedTools: ["Bash"],
  canUseTool: async (toolName, input) => {
    if (toolName === "Bash") {
      const allowedCommands = ["ls", "cat", "git log"];
      const isAllowed = allowedCommands.some(cmd => input.command.startsWith(cmd));
      if (!isAllowed) return { behavior: "deny", message: "Command not allowed" };
    }
    return { behavior: "allow", updatedInput: input };
  }
}
```

---

## 11. Advanced Features

### Subagents

Spawn specialized agents for focused subtasks:

```typescript
for await (const message of query({
  prompt: "Use the security-auditor agent to review our authentication code",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "Task"],  // Task tool is required
    agents: {
      "security-auditor": {
        description: "Expert security reviewer specializing in auth vulnerabilities",
        prompt: "You are a security auditor. Review code for OWASP vulnerabilities, injection attacks, and authentication flaws. Be thorough and specific.",
        tools: ["Read", "Glob", "Grep"],  // Subagent's allowed tools
        model: "opus"  // Can use different model than main agent
      }
    }
  }
})) {
  // Messages from subagent have non-null parent_tool_use_id
  if (message.type === "assistant" && message.parent_tool_use_id !== null) {
    console.log("[Subagent]", message.message.content);
  }
}
```

`AgentDefinition`:
```typescript
type AgentDefinition = {
  description: string;                              // When to use this agent
  tools?: string[];                                 // Allowed tools (inherits all if omitted)
  prompt: string;                                   // System prompt for this agent
  model?: "sonnet" | "opus" | "haiku" | "inherit"; // Model override
}
```

### System Prompts

```typescript
// Custom string prompt (replaces default)
options: { systemPrompt: "You are a senior TypeScript developer at a fintech company." }

// Use Claude Code's built-in system prompt
options: { systemPrompt: { type: "preset", preset: "claude_code" } }

// Use Claude Code's system prompt with additions
options: {
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: "Always follow our company coding standards in CODING_STANDARDS.md"
  }
}

// Load CLAUDE.md project instructions (requires settingSources)
options: {
  systemPrompt: { type: "preset", preset: "claude_code" },
  settingSources: ["project"]  // Loads .claude/settings.json and CLAUDE.md
}
```

### Model Selection

```typescript
options: { model: "claude-opus-4-6" }        // Highest capability
options: { model: "claude-sonnet-4-5" }       // Balanced (default in many contexts)
options: { model: "claude-haiku-3-5" }        // Fast/cheap (no tool search support)
options: { fallbackModel: "claude-sonnet-4" } // Fallback if primary unavailable
```

### Structured Output

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Analyze this TypeScript file and categorize all functions",
  options: {
    allowedTools: ["Read"],
    outputFormat: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          functions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                complexity: { type: "string", enum: ["low", "medium", "high"] },
                description: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    const data = message.structured_output;  // Typed JSON matching schema
  }
}
```

### 1 Million Token Context Window (Beta)

```typescript
options: {
  betas: ["context-1m-2025-08-07"],  // Enable 1M context
  model: "claude-opus-4-6"            // Compatible: Opus 4, Sonnet 4.5, Sonnet 4
}
```

### Hooks System

Run custom code at key lifecycle points:

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync } from "fs";

const auditHook: HookCallback = async (input, toolUseId, options) => {
  if (input.hook_event_name === "PostToolUse") {
    const filePath = (input as any).tool_input?.file_path;
    if (filePath) {
      appendFileSync("./audit.log", `${new Date().toISOString()}: modified ${filePath}\n`);
    }
  }
  return {};
};

const blockDangerousCommands: HookCallback = async (input) => {
  if (input.hook_event_name === "PreToolUse" && (input as any).tool_name === "Bash") {
    const cmd = (input as any).tool_input?.command || "";
    if (cmd.includes("rm -rf") || cmd.includes("DROP TABLE")) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Dangerous command blocked by audit policy"
        }
      };
    }
  }
  return {};
};

for await (const message of query({
  prompt: "Refactor the database layer",
  options: {
    permissionMode: "acceptEdits",
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [auditHook] }],
      PreToolUse: [{ matcher: "Bash", hooks: [blockDangerousCommands] }]
    }
  }
})) { ... }
```

Available hook events:
`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`

### Cost Tracking

```typescript
for await (const message of query({ prompt: "...", options: { maxBudgetUsd: 0.50 } })) {
  if (message.type === "result") {
    console.log(`Total cost: $${message.total_cost_usd}`);
    console.log(`Turns: ${message.num_turns}`);

    // Per-model breakdown
    for (const [model, usage] of Object.entries(message.modelUsage)) {
      console.log(`${model}: $${usage.costUSD} (${usage.inputTokens} in, ${usage.outputTokens} out)`);
    }
  }
}
```

### Sandbox Configuration

```typescript
options: {
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,     // Auto-approve bash in sandboxed mode
    excludedCommands: ["docker"],        // Commands that bypass sandbox automatically
    allowUnsandboxedCommands: false,     // Whether model can request unsandboxed execution
    network: {
      allowLocalBinding: true,           // Allow binding to localhost ports
      allowUnixSockets: ["/var/run/docker.sock"],  // WARNING: grants full Docker access
      httpProxyPort: 8080,
      socksProxyPort: 1080
    }
  }
}
```

**Security warning:** Allowing `/var/run/docker.sock` effectively grants full host system access through Docker API, bypassing sandbox isolation.

---

## 12. Hosting and Deployment

### System Requirements

- Node.js 18+ (required for Claude Code CLI, even in Python projects)
- 1 GiB RAM minimum (vary based on task complexity)
- 5 GiB disk minimum
- Outbound HTTPS to `api.anthropic.com`

### Docker Deployment Pattern

```dockerfile
FROM node:18-slim

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install your SDK application
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

ENV ANTHROPIC_API_KEY=""
ENV NODE_ENV=production

CMD ["node", "agent.js"]
```

### Recommended Deployment Patterns

1. **Ephemeral containers** - New container per task, destroy after. Best for one-off jobs.
2. **Long-running sessions** - Persistent containers serving multiple concurrent agents.
3. **Hybrid** - Ephemeral containers hydrated with session state from database.

### Sandbox Providers

Anthropic recommends these managed sandbox providers for production:
- Modal Sandbox
- Cloudflare Sandboxes
- E2B
- Fly Machines
- Vercel Sandbox
- Daytona

### Session Persistence Pattern

```typescript
// In your web server/API handler
async function handleAgentRequest(req, res) {
  const { prompt, sessionId } = req.body;

  const options = {
    allowedTools: ["Read", "Glob", "Grep", "Edit", "Bash"],
    permissionMode: "acceptEdits" as const,
    maxTurns: 20
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  let capturedSessionId: string | undefined;
  const messages: string[] = [];

  for await (const message of query({ prompt, options })) {
    if (message.type === "system" && message.subtype === "init") {
      capturedSessionId = message.session_id;
    }
    if (message.type === "result") {
      messages.push(message.result);
    }
  }

  // Store session ID for future requests
  await db.storeSession(capturedSessionId, req.user.id);

  res.json({ result: messages.join(""), sessionId: capturedSessionId });
}
```

---

## 13. Limitations and Gotchas

### Critical Limitations

**1. No claude.ai subscription billing (official)**
The SDK requires `ANTHROPIC_API_KEY` (pay-per-token). Using claude.ai Pro/Max billing is not officially supported. A community workaround exists via `CLAUDE_CODE_OAUTH_TOKEN` (see [Authentication](#9-authentication)), confirmed working Feb 2026.

**2. SDK MCP servers require async generator prompt**
If you use `createSdkMcpServer()`, the `prompt` parameter must be an async generator, NOT a plain string. Passing a string silently fails to connect the MCP server.

**3. `bypassPermissions` cascades to subagents**
Setting `permissionMode: "bypassPermissions"` gives ALL spawned subagents full system access. There is no way to restrict subagent permissions in this mode.

**4. Settings isolation by default**
`settingSources` defaults to `[]` - no `~/.claude/settings.json` or `.claude/settings.json` is loaded. Project CLAUDE.md files are also not loaded unless you set `settingSources: ["project"]` AND `systemPrompt: { type: "preset", preset: "claude_code" }`.

**5. Haiku does not support tool search**
When you have large numbers of MCP tools, tool search (dynamic loading) is required to stay within the context window. Haiku models do NOT support tool search and will fail with large tool sets.

**6. MCP server timeout is 60 seconds**
MCP servers that take more than 60 seconds to start will fail to connect. This can be an issue for servers with slow initialization.

### Architectural Gotchas

**7. SDK wraps Claude Code CLI (subprocess)**
The SDK is NOT a direct API wrapper. It spawns the Claude Code CLI as a subprocess. This means:
- Additional startup latency per query
- Node.js required even in Python environments
- File system dependencies for session storage
- CLI version must be compatible with SDK version

**8. Session storage is local filesystem**
Sessions are stored on the machine running the SDK. In distributed/serverless environments, you cannot resume a session created on a different machine without shared storage.

**9. Context window management is automatic**
When the context fills up, Claude Code automatically compacts conversation history. You cannot prevent this, but you receive a `compact_boundary` message. The compaction may lose granular details of earlier conversation turns.

**10. `maxTurns` with no value = unlimited**
If you do not set `maxTurns`, the agent will run indefinitely (until task completion, error, or budget exceeded). This can lead to runaway costs. Always set `maxBudgetUsd` and/or `maxTurns` for production use.

**11. V2 API is unstable preview**
The `unstable_v2_*` functions (`unstable_v2_createSession`, `unstable_v2_resumeSession`, `unstable_v2_prompt`) are marked as preview and may change. Session forking is not yet available in V2.

### Cost Gotchas

**12. No subscription rate limiting**
When using API key auth, you are billed pay-per-token with no spending cap by default. A 200K-token+ input message costs significantly more due to extended context pricing. Always set `maxBudgetUsd`.

**13. Subagents multiply costs**
Each subagent spawned via the `Task` tool incurs its own API costs. An agent with 3 subagents running in parallel can 4x your token costs.

**14. Token usage per model**
```
Opus 4:     $15/M input,  $75/M output
Sonnet 4:   $3/M input,   $15/M output
Haiku 3.5:  $0.80/M input, $4/M output
```

### Rate Limits

API rate limits apply per API key. The SDK does not implement any rate limiting or retry logic for rate limit errors. You must handle `error_during_execution` result messages and implement retry logic in your application.

---

## 14. Cost Model

### API Key Billing (Pay-Per-Token)

The Agent SDK uses the standard Anthropic API pricing when authenticated with `ANTHROPIC_API_KEY`:

| Model | Input (per M tokens) | Output (per M tokens) |
|-------|---------------------|----------------------|
| Claude Opus 4.6 | $15 | $75 |
| Claude Sonnet 4.5 | $3 | $15 |
| Claude Sonnet 4 | $3 | $15 |
| Claude Haiku 3.5 | $0.80 | $4 |

Same pricing applies on AWS Bedrock and Google Vertex AI (plus cloud egress fees).

### Cost Tracking in Code

```typescript
// Hard budget cap
options: { maxBudgetUsd: 1.00 }  // Agent stops if cost exceeds $1.00

// Track costs from result message
if (message.type === "result") {
  console.log(`Run cost: $${message.total_cost_usd.toFixed(4)}`);
  // Error subtype "error_max_budget_usd" if budget exceeded
}
```

### OAuth Billing (Max Plan)

Using `CLAUDE_CODE_OAUTH_TOKEN`, the Agent SDK can leverage Max plan billing ($100-200/mo subscription). This avoids per-token costs but is subject to Max plan rate limits (5-hour rolling window, weekly quota).

### Cost Optimization Strategies

1. Use Haiku for simple tasks, Sonnet for coding, Opus only for complex reasoning
2. Set `allowedTools` narrowly to prevent Claude from making unnecessary tool calls
3. Set `maxTurns` to prevent runaway loops
4. Set `maxBudgetUsd` as a hard cap
5. Use `enableFileCheckpointing: false` (default) to reduce storage overhead
6. Use `settingSources: []` (default) to avoid loading large CLAUDE.md files unnecessarily

---

## 15. V2 Preview Interface

The V2 interface simplifies multi-turn conversations by separating `send()` and `stream()`:

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt
} from "@anthropic-ai/claude-agent-sdk";

// One-shot query
const result = await unstable_v2_prompt("What is 2 + 2?", { model: "claude-opus-4-6" });
console.log(result.result);

// Multi-turn session
await using session = unstable_v2_createSession({ model: "claude-opus-4-6" });

await session.send("Analyze the auth module");
for await (const msg of session.stream()) {
  if (msg.type === "assistant") {
    const text = msg.message.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");
    console.log(text);
  }
}

await session.send("Now find all callers");
for await (const msg of session.stream()) { ... }

// Resume later
let sessionId: string;
for await (const msg of session.stream()) {
  sessionId = msg.session_id;
}
session.close();

await using resumed = unstable_v2_resumeSession(sessionId!, { model: "claude-opus-4-6" });
await resumed.send("Continue from where you left off");
```

**V2 Session interface:**
```typescript
interface Session {
  send(message: string): Promise<void>;
  stream(): AsyncGenerator<SDKMessage>;
  close(): void;
}
```

**V2 limitations (still requires V1 for):**
- Session forking (`forkSession`)
- Advanced streaming input patterns

---

## 16. Implementation Recommendations

### For LivOS/Nexus Agent Integration

Based on this research, here are specific recommendations for the LivOS project:

**Authentication Setup**
```typescript
// For production server deployment (API key billing):
process.env.ANTHROPIC_API_KEY = "sk-ant-...";

// For personal development (Max plan billing - no extra cost):
// Run: claude setup-token
// Then: export CLAUDE_CODE_OAUTH_TOKEN=<token>
```

**Standard Agent Query Pattern**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function runAgent(prompt: string, sessionId?: string) {
  const options = {
    allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "WebSearch"],
    permissionMode: "acceptEdits" as const,
    maxTurns: 50,
    maxBudgetUsd: 2.00,
    model: "claude-sonnet-4-5",  // Balance of cost/capability
    systemPrompt: "You are an AI assistant for the LivOS home server platform.",
    cwd: "/opt/livos/livos"
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  let capturedSessionId: string | undefined;

  for await (const message of query({ prompt, options })) {
    if (message.type === "system" && message.subtype === "init") {
      capturedSessionId = message.session_id;
    }
    // ... handle messages
  }

  return { sessionId: capturedSessionId };
}
```

**MCP Integration for LivOS**
```typescript
import { createSdkMcpServer, tool, query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Redis } from "ioredis";

// LivOS custom tools
const redis = new Redis(process.env.REDIS_URL);

const getConfigTool = tool(
  "get_livos_config",
  "Get a LivOS configuration value from Redis",
  { key: z.string().describe("Config key to retrieve") },
  async (args) => {
    const value = await redis.get(`livos:config:${args.key}`);
    return { content: [{ type: "text", text: value ?? "null" }] };
  }
);

const setConfigTool = tool(
  "set_livos_config",
  "Set a LivOS configuration value in Redis",
  {
    key: z.string().describe("Config key"),
    value: z.string().describe("Value to set")
  },
  async (args) => {
    await redis.set(`livos:config:${args.key}`, args.value);
    return { content: [{ type: "text", text: "Config updated" }] };
  }
);

const livosServer = createSdkMcpServer({
  name: "livos",
  version: "1.0.0",
  tools: [getConfigTool, setConfigTool]
});

// MUST use async generator with SDK MCP servers
async function* makePrompt(msg: string) {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: msg }
  };
}

for await (const message of query({
  prompt: makePrompt("Configure the Gemini API key"),
  options: {
    mcpServers: { livos: livosServer },
    allowedTools: ["mcp__livos__get_livos_config", "mcp__livos__set_livos_config"]
  }
})) { ... }
```

**Permission Strategy for User-Facing Agents**
```typescript
// Safe: Read-only analysis agents
options: {
  allowedTools: ["Read", "Glob", "Grep", "WebSearch"],
  permissionMode: "bypassPermissions"  // Read tools are safe to auto-approve
}

// Moderate: Code editing agents (auto-approve file changes)
options: {
  allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
  permissionMode: "acceptEdits"
}

// Advanced: Full automation with cost guard
options: {
  allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  maxBudgetUsd: 5.00,
  maxTurns: 100,
  hooks: {
    PreToolUse: [{
      matcher: "Bash",
      hooks: [blockDangerousCommandsHook]  // Custom safety layer
    }]
  }
}
```

---

## Sources

[1] Anthropic. "Agent SDK Reference - TypeScript." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/typescript

[2] Anthropic. "Agent SDK Overview." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/overview

[3] Anthropic. "Agent SDK Quickstart." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/quickstart

[4] Anthropic. "Connect to External Tools with MCP." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/mcp

[5] Anthropic. "Custom Tools." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/custom-tools

[6] Anthropic. "Session Management." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/sessions

[7] Anthropic. "Configure Permissions." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/permissions

[8] Anthropic. "TypeScript SDK V2 Interface (Preview)." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview

[9] Anthropic. "Hosting the Agent SDK." platform.claude.com. https://platform.claude.com/docs/en/agent-sdk/hosting

[10] GitHub. "anthropics/claude-agent-sdk-typescript." github.com. https://github.com/anthropics/claude-agent-sdk-typescript

[11] GitHub. "Agent SDK should support Max plan billing, not just API keys #559." github.com. https://github.com/anthropics/claude-agent-sdk-python/issues/559

[12] Portkey.ai. "Everything We Know About Claude Code Limits." portkey.ai. https://portkey.ai/blog/claude-code-limits/

[13] Nader Dabit. "The Complete Guide to Building Agents with the Claude Agent SDK." nader.substack.com. https://nader.substack.com/p/the-complete-guide-to-building-agents

[14] npm. "@anthropic-ai/claude-agent-sdk." npmjs.com. https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

[15] Promptfoo. "Claude Agent SDK." promptfoo.dev. https://www.promptfoo.dev/docs/providers/claude-agent-sdk/
