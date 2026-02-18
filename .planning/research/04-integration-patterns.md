# Research: Claude Agent SDK Integration Patterns for LivOS

**Date:** 2026-02-18
**Researcher:** Technical Researcher Agent
**Status:** Complete

---

## Table of Contents

1. [Claude Agent SDK - Complete API Reference](#1-claude-agent-sdk---complete-api-reference)
2. [GSD Pattern - Workflow Orchestration](#2-gsd-pattern---workflow-orchestration)
3. [Web UI Projects for AI Agents](#3-web-ui-projects-for-ai-agents)
4. [Claude Agent SDK as Backend Service](#4-claude-agent-sdk-as-backend-service)
5. [Skill / Plugin Marketplace Patterns](#5-skill--plugin-marketplace-patterns)
6. [One-Click Deployment Patterns](#6-one-click-deployment-patterns)
7. [LivOS Gap Analysis](#7-livos-gap-analysis)
8. [Implementation Recommendations](#8-implementation-recommendations)

---

## 1. Claude Agent SDK - Complete API Reference

**Package:** `@anthropic-ai/claude-agent-sdk` (TypeScript) / `claude-agent-sdk` (Python)
**Version:** 0.2.45 (Feb 17, 2026)
**GitHub:** https://github.com/anthropics/claude-agent-sdk-typescript
**Stars:** 810 | **Used by:** 617 projects
**Docs:** https://platform.claude.com/docs/en/agent-sdk/typescript

> Note: The Claude Code SDK was renamed to the Claude Agent SDK. Migration guide available at the official docs.

### 1.1 Core Function: `query()`

The primary entry point. Returns an `AsyncGenerator` that streams `SDKMessage` events.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Minimal usage
for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  if ("result" in message) console.log(message.result);
}
```

**Full signature:**
```typescript
function query({
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

The `prompt` parameter accepts either a plain string (single-shot mode) or an `AsyncIterable<SDKUserMessage>` for streaming input mode (multi-turn, supports interrupts).

### 1.2 Options Object (Complete)

| Property | Type | Default | Notes |
|---|---|---|---|
| `abortController` | `AbortController` | new | Cancel operations |
| `additionalDirectories` | `string[]` | `[]` | Extra dirs Claude can access |
| `agents` | `Record<string, AgentDefinition>` | `undefined` | Programmatic subagents |
| `allowDangerouslySkipPermissions` | `boolean` | `false` | Required with `bypassPermissions` mode |
| `allowedTools` | `string[]` | all | Whitelist tool names |
| `betas` | `SdkBeta[]` | `[]` | e.g. `['context-1m-2025-08-07']` |
| `canUseTool` | `CanUseTool` | `undefined` | Runtime permission callback |
| `continue` | `boolean` | `false` | Resume most recent conversation |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `disallowedTools` | `string[]` | `[]` | Blacklist tool names |
| `enableFileCheckpointing` | `boolean` | `false` | Track file changes for rewind |
| `env` | `Dict<string>` | `process.env` | Custom env variables |
| `executable` | `'bun'|'deno'|'node'` | auto | JS runtime |
| `fallbackModel` | `string` | `undefined` | Model fallback |
| `forkSession` | `boolean` | `false` | Fork instead of continue on resume |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | Lifecycle hooks |
| `includePartialMessages` | `boolean` | `false` | Stream token-by-token events |
| `maxBudgetUsd` | `number` | `undefined` | Cost ceiling |
| `maxThinkingTokens` | `number` | `undefined` | Thinking budget |
| `maxTurns` | `number` | `undefined` | Turn limit |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP server config |
| `model` | `string` | CLI default | Claude model |
| `outputFormat` | `{ type: 'json_schema', schema }` | `undefined` | Structured output |
| `pathToClaudeCodeExecutable` | `string` | bundled | Custom executable |
| `permissionMode` | `PermissionMode` | `'default'` | Permission strategy |
| `permissionPromptToolName` | `string` | `undefined` | MCP tool for prompts |
| `plugins` | `SdkPluginConfig[]` | `[]` | Local plugins |
| `resume` | `string` | `undefined` | Session ID to resume |
| `resumeSessionAt` | `string` | `undefined` | Resume at specific message UUID |
| `sandbox` | `SandboxSettings` | `undefined` | Sandbox config |
| `settingSources` | `SettingSource[]` | `[]` | Filesystem settings to load |
| `stderr` | `(data: string) => void` | `undefined` | stderr callback |
| `strictMcpConfig` | `boolean` | `false` | Strict MCP validation |
| `systemPrompt` | `string | {type: 'preset', preset: 'claude_code', append?: string}` | minimal | System prompt |
| `tools` | `string[] | {type: 'preset', preset: 'claude_code'}` | `undefined` | Tool config preset |

### 1.3 Query Object Methods

The `query()` return value extends `AsyncGenerator` and adds:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;             // Stop mid-stream (streaming input mode only)
  rewindFiles(userMessageUuid): Promise<void>; // Restore files to earlier state
  setPermissionMode(mode): Promise<void>; // Change mode mid-session
  setModel(model?): Promise<void>;        // Hot-swap model
  setMaxThinkingTokens(n | null): Promise<void>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;    // Returns email, org, subscriptionType
}
```

### 1.4 Message Types Streamed

```typescript
type SDKMessage =
  | SDKSystemMessage        // type: "system", subtype: "init" - first message, has session_id, tools[], mcp_servers[]
  | SDKAssistantMessage     // type: "assistant" - Claude's response content
  | SDKUserMessage          // type: "user" - user input replay
  | SDKResultMessage        // type: "result" - final result with cost, usage, total_cost_usd
  | SDKPartialAssistantMessage  // type: "stream_event" - token-level if includePartialMessages=true
  | SDKCompactBoundaryMessage;  // type: "system", subtype: "compact_boundary" - context window compression
```

**SDKResultMessage** carries total cost:
```typescript
{
  type: "result";
  subtype: "success";
  session_id: string;
  duration_ms: number;
  total_cost_usd: number;   // CRITICAL for budgeting
  num_turns: number;
  result: string;           // Final text answer
  usage: NonNullableUsage;
  modelUsage: { [modelName: string]: ModelUsage };
  permission_denials: SDKPermissionDenial[];
  structured_output?: unknown;
}
```

### 1.5 Permission System

**Permission modes:**
- `"default"` - Unmatched tools call `canUseTool` callback
- `"acceptEdits"` - Auto-approve file edits and filesystem ops
- `"bypassPermissions"` - Auto-approve everything (use with caution)
- `"plan"` - No execution, planning only

**Permission evaluation order:**
1. Hooks (can allow/deny/continue)
2. Permission rules in `settings.json` (deny > allow > ask)
3. Active `permissionMode`
4. `canUseTool` callback (fallback)

**`canUseTool` for human-in-the-loop approval:**
```typescript
const result = query({
  prompt: "Deploy to production",
  options: {
    permissionMode: "default",
    canUseTool: async (toolName, input, { signal }) => {
      // Called when tool needs approval
      // Can integrate with a WebSocket or SSE to ask web UI user
      const approved = await askUserViaWebSocket(toolName, input);
      return approved
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: "User denied this operation", interrupt: true };
    }
  }
});
```

### 1.6 MCP Server Configuration

```typescript
// Stdio process
mcpServers: {
  "filesystem": {
    type: "stdio",   // optional, default
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
    env: { HOME: "/home/user" }
  },
  // SSE remote server
  "remote-tools": {
    type: "sse",
    url: "http://localhost:8080/sse",
    headers: { "Authorization": "Bearer token" }
  },
  // HTTP streamable
  "http-tools": {
    type: "http",
    url: "http://localhost:8080/mcp",
    headers: {}
  },
  // In-process SDK server
  "custom": createSdkMcpServer({
    name: "my-tools",
    tools: [
      tool("search_livos", "Search LivOS data", z.object({ q: z.string() }), async (args) => ({
        content: [{ type: "text", text: await searchLivOS(args.q) }]
      }))
    ]
  })
}
```

### 1.7 Session Management (Resume)

```typescript
let sessionId: string | undefined;

// First query - capture session_id from init message
for await (const msg of query({ prompt: "Analyze this codebase" })) {
  if (msg.type === "system" && msg.subtype === "init") {
    sessionId = msg.session_id;  // Persist this!
  }
}

// Resume later with full context
for await (const msg of query({
  prompt: "Now write tests for what you analyzed",
  options: { resume: sessionId }
})) { ... }

// Fork a session (branches from resume point, doesn't modify original)
for await (const msg of query({
  prompt: "What if we used a different approach?",
  options: { resume: sessionId, forkSession: true }
})) { ... }
```

### 1.8 Hook System

```typescript
// Available hook events
type HookEvent =
  | "PreToolUse"        // Before tool executes - can modify input, block
  | "PostToolUse"       // After tool succeeds
  | "PostToolUseFailure" // After tool fails
  | "Notification"      // Claude sends a notification
  | "UserPromptSubmit"  // User prompt submitted - can add context
  | "SessionStart"      // Session initialized
  | "SessionEnd"        // Session ending
  | "Stop"              // Agent stopping
  | "SubagentStart"     // Subagent spawned
  | "SubagentStop"      // Subagent finished
  | "PreCompact"        // Context window compression imminent
  | "PermissionRequest" // Permission needed

// Example: audit log all bash commands
const result = query({
  prompt: "...",
  options: {
    hooks: {
      PreToolUse: [{
        matcher: "Bash",  // regex match on tool name
        hooks: [async (input, toolUseId, { signal }) => {
          await logToDatabase({ tool: input.tool_name, cmd: input.tool_input });
          return {}; // empty = continue
          // return { decision: "block", reason: "not allowed" }; // to block
        }]
      }]
    }
  }
});
```

### 1.9 Subagent Definition

```typescript
agents: {
  "server-monitor": {
    description: "Monitors server health and reports issues",
    prompt: "You are a server health monitoring agent. Check system metrics.",
    tools: ["Bash", "WebFetch"],  // restricted tool set
    model: "haiku"  // can use cheaper model for subagents
  },
  "code-reviewer": {
    description: "Reviews code for quality and security",
    prompt: "You are a senior engineer doing code review.",
    tools: ["Read", "Glob", "Grep"],
    model: "opus"  // use better model for critical subagents
  }
}
```

### 1.10 Authentication Options

```typescript
// 1. API Key (recommended for production/multi-user)
process.env.ANTHROPIC_API_KEY = "sk-ant-...";

// 2. Amazon Bedrock
process.env.CLAUDE_CODE_USE_BEDROCK = "1";
// + AWS credentials configured

// 3. Google Vertex AI
process.env.CLAUDE_CODE_USE_VERTEX = "1";
// + GCP credentials configured

// 4. Microsoft Azure AI Foundry
process.env.CLAUDE_CODE_USE_FOUNDRY = "1";

// IMPORTANT: Anthropic policy states:
// "Unless previously approved, Anthropic does not allow third party developers
// to offer claude.ai login or rate limits for their products, including agents
// built on the Claude Agent SDK. Please use the API key authentication methods."
```

---

## 2. GSD Pattern - Workflow Orchestration

**Repository:** https://github.com/gsd-build/get-shit-done
**Package:** `npx get-shit-done-cc@latest`

GSD (Get Shit Done) is a meta-prompting and context engineering framework that demonstrates a highly sophisticated workflow orchestration pattern. LivOS already implements GSD (see `.planning/` directory structure matching GSD conventions).

### 2.1 Core Architecture

```
GSD works via Claude Code slash commands installed into .claude/commands/
Installation: npx get-shit-done-cc@latest
  - Prompts: Claude Code / OpenCode / Gemini / All
  - Prompts: Global (~/. claude/) or Local (.claude/)
  - Copies .md files into the appropriate commands directory
```

**Six-stage workflow:**
1. `/gsd:new-project` - captures requirements, spawns research subagents, generates roadmap
2. `/gsd:discuss-phase` - clarifies ambiguities before planning
3. `/gsd:plan-phase` - creates 2-3 atomic XML-structured task plans
4. `/gsd:execute-phase` - wave-based parallel execution in fresh 200k-token contexts
5. `/gsd:verify-work` - tests deliverables, diagnoses failures
6. `/gsd:complete-milestone` - closes phase, starts next

### 2.2 Why GSD Works (Context Engineering)

**Context rot prevention:** Each execution phase runs in a fresh Claude context window. The system encodes all state in files:
- `PROJECT.md` - always loaded, vision
- `REQUIREMENTS.md` - scoped per version
- `ROADMAP.md` - phases with completion tracking
- `STATE.md` - decisions, blockers, position memory
- `.planning/{phase_num}/` - context docs and plans

**XML prompt formatting** - every plan uses structured XML with task names, file targets, action instructions, and verification steps. This eliminates ambiguity when Claude reads the plan in a fresh context.

**Wave-based parallelization** - tasks grouped by dependencies, independent tasks run simultaneously.

### 2.3 Distribution Mechanism

GSD distributes via npm (`npx get-shit-done-cc@latest`). The installer:
1. Detects the operating system
2. Asks which AI runtime (Claude Code / OpenCode / Gemini / All)
3. Asks installation scope (global `~/.claude/` or local `.claude/`)
4. Copies `.md` files as Claude Code slash commands

This is the simplest possible distribution: **markdown files via npm**. No binary, no daemon, no server.

### 2.4 Plugin/Skill Formats for Claude Code

Two formats exist for extending Claude Code via the SDK:

**Slash Commands** (`.claude/commands/name.md`):
```markdown
# Command Name
Description of what this does.

## Steps
1. First do X
2. Then do Y
```

**Skills** (`.claude/skills/SKILL.md`):
```markdown
---
name: skill-name
trigger: "phrases that activate this skill"
---
# Skill Description
Detailed instructions Claude follows when skill is activated.
```

**SDK Plugins** (programmatic, loaded via `plugins` option):
```typescript
// Local plugin directory structure:
// my-plugin/
//   manifest.json
//   skills/
//     my-skill/SKILL.md
query({ options: { plugins: [{ type: "local", path: "./my-plugin" }] } })
```

---

## 3. Web UI Projects for AI Agents

### 3.1 CloudCLI (claudecodeui)

**Repository:** https://github.com/siteboon/claudecodeui
**License:** Open source
**Stack:** React 18 + Vite + Tailwind + CodeMirror (frontend), Node.js 22+ + Express + WebSocket (backend), SQLite (persistence), PM2 (process management)

**Architecture:**
```
Frontend (React/Vite) <--WebSocket--> Backend (Express) <--Process spawn--> Claude Code CLI
```

**Key patterns:**
- Spawns Claude Code / Cursor CLI / Codex as child processes
- WebSocket for real-time bidirectional streaming
- Auto-discovers sessions from `~/.claude/projects/`
- SQLite for conversation history persistence
- MCP server registration through settings UI
- "All Claude Code tools disabled by default" safety model
- PM2 for background service operation
- Docker-ready

**Session management:**
- Discovers existing Claude sessions from filesystem
- Resumes conversations across devices
- Groups sessions by project directory

### 3.2 claude-code-webui (sugyan)

**Repository:** https://github.com/sugyan/claude-code-webui
**Stack:** Deno or Node.js + TypeScript (backend), React + Vite (frontend)
**Default port:** localhost:8080

**Key patterns:**
- Spawns Claude CLI as subprocess
- SSE or WebSocket for streaming output
- Tool permission dialog (user approves each operation)
- "Plan mode" vs normal execution
- Auto-detect Claude CLI path or manual via `--claude-path`
- No built-in auth (local development only)

### 3.3 AgentOS

**Repository:** https://github.com/saadnvd1/agent-os
**Stars:** Growing
**Stack:** Next.js + TypeScript (94.4%), Shell scripts (3.2%), Tauri (desktop wrapper)
**Default port:** localhost:3011

**Key patterns:**
- Up to 4 sessions side-by-side (multi-pane layout)
- tmux-based terminal management for process isolation
- Git worktrees for branch-isolated environments
- MCP conductor/worker model for session orchestration
- Supports: Claude Code, Codex, Gemini CLI, Aider, Cursor CLI, Amp, Pi
- `--dangerously-skip-permissions` flag for hands-free operation
- Tailscale for secure remote access
- npm/curl installer

### 3.4 Open WebUI + MCPO

**Repository:** https://github.com/open-webui/open-webui
**MCP proxy:** https://github.com/open-webui/mcpo

**Architecture:**
```
Web Client <--SSE--> Open WebUI <--OpenAPI--> MCPO Proxy <--stdio/SSE/HTTP--> MCP Servers
```

**MCPO (MCP-to-OpenAPI proxy):**
- Translates stdio, SSE, and streamable HTTP MCP servers into OpenAPI endpoints
- Each tool accessible under its own unique route with OpenAPI schema
- Supports: `npx` packages, `uvx` packages, remote SSE servers
- Native HTTP streamable MCP support added Sept 2025

**Provider abstraction:** Unified endpoint manager that abstracts different provider APIs (OpenAI, Anthropic, Google) under a ChatGPT-style UI.

### 3.5 LibreChat

**Architecture:**
```
Multi-provider router: OpenAI | Anthropic | Google | Local
```

**Key patterns:**
- Human-in-the-loop for tool approval (planned 2025 roadmap)
- Multi-user session support with advanced context management
- MCP servers, built-in tools, custom actions via OpenAPI specs
- Agent features: `execute_code`, `file_search`, `actions`, `tools`, `artifacts`, `web_search`
- Toggleable per-agent capabilities

### 3.6 AnythingLLM

**Repository:** https://github.com/Mintplex-Labs/anything-llm
**Deployment:** Desktop app, Docker self-hosted, Managed cloud

**Key patterns:**
- MCP "Tools" only available in Docker/self-hosted (not cloud)
- `@agent` mention to invoke agents in chat
- No-code agent builder UI
- RAG integration built-in
- Skills from AnythingLLM Hub (disabled by default for security)
- Multi-user with role-based access

---

## 4. Claude Agent SDK as Backend Service

### 4.1 Can It Run as a Long-Lived Service?

**Yes, with caveats.** The SDK itself is stateless per `query()` call, but you build a long-lived service around it. Sessions persist through the `session_id` captured from `SDKSystemMessage.session_id`.

**Two architectural patterns:**

**Pattern A: Job Queue (Production-recommended)**
```
POST /claude { task } --> job_id
worker: query() runs in background (can take minutes)
GET /claude/jobs/{job_id} --> poll for completion
GET /claude/stream/{job_id} --> SSE stream while running
```

**Pattern B: Direct Streaming**
```
POST /claude/stream --> SSE connection
  --> streams SDKMessages as they arrive
  --> closes when SDKResultMessage received
```

### 4.2 Production SSE Implementation

```typescript
// Express + SSE pattern (from blle.co research)
app.get("/claude/stream/:jobId", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const writeEvent = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Run query, stream messages
  (async () => {
    try {
      for await (const message of query({ prompt: req.body.prompt, options: {} })) {
        writeEvent(message);
      }
      res.write("data: [DONE]\n\n");
    } catch (err) {
      writeEvent({ type: "error", message: String(err) });
    } finally {
      res.end();
    }
  })();
});
```

**LivOS current pattern** (from `livos/packages/livinityd/source/modules/ai/routes.ts`):
- Uses tRPC `subscription()` with observable
- Bridges to Nexus API via SSE
- Streams `AgentEvent` objects to tRPC clients

### 4.3 WebSocket Pattern (dzhng/claude-agent-server)

**Repository:** https://github.com/dzhng/claude-agent-server

```
Client <--WebSocket--> Server (ws://localhost:3000/ws)
  Client sends: { type: "user_message", content: "...", session_id: "..." }
  Server sends: { type: "sdk_message", data: SDKMessage }
  Client sends: { type: "interrupt" }
  Server sends: { type: "error", message: "..." }

HTTP POST /config --> set systemPrompt, allowedTools, model
```

**Limitation:** Single-connection-at-a-time (sequential, not concurrent). This is intentional for the single-user E2B sandbox use case.

### 4.4 Concurrent User/Session Management

**Approaches discovered:**

**Per-request isolation (Sandstorm pattern):**
```
Each query() call --> fresh E2B sandbox VM
Pros: Complete isolation, no state leakage
Cons: Cold start latency, cost per request
```

**Session pool (claude-flow pattern):**
```
Session registry: Map<sessionId, { query, cwd, metadata }>
Idle sessions retained for resume
Active sessions limited by `maxConcurrent` config
Queue for burst handling
```

**Process-per-user (AgentOS/claudecodeui pattern):**
```
Each user/session --> separate Claude Code subprocess
Tmux manages process lifecycle
WebSocket per session
```

### 4.5 Rate Limiting and Cost Management

**Anthropic rate limits (as of 2025):**
- Token bucket algorithm, continuously replenishes
- Rate limits at organization level (not per-user)
- Pro plan: ~40-80 hours Sonnet 4 per week via Claude Code
- Max 5x: $100/month, 5x Pro limits
- Max 20x: $200/month, 20x Pro limits
- Weekly rate limits introduced Aug 28, 2025

**Key limit dimensions:**
- Requests per minute (RPM)
- Tokens per minute (TPM)
- Daily token quotas

**For LivOS multi-user:**
- Rate limits apply at the org/API key level
- Individual users can burst when others are idle
- Consider `maxBudgetUsd` per query to prevent runaway costs
- `SDKResultMessage.total_cost_usd` enables per-session cost tracking

**Important policy note:** Anthropic does NOT allow third-party developers to offer claude.ai login (subscription sharing) for their products without prior approval. Use API key authentication for multi-user deployments. The Nexus worker (which uses Claude CLI subscription auth) is acceptable for internal/personal use.

### 4.6 Claude Code as Long-Running Process

**Key consideration:** The SDK spawns Claude Code as a subprocess internally. It's not designed as a persistent daemon. Each `query()` call creates a new process (or reuses, depending on configuration).

**Recommended for LivOS:**
- Use `resume: sessionId` to maintain conversation context across multiple `query()` calls without a persistent process
- Store `session_id` in Redis keyed to conversation ID
- Implement a job queue (BullMQ or similar) for background agent tasks
- Stream results back via tRPC subscription or SSE

---

## 5. Skill / Plugin Marketplace Patterns

### 5.1 CCPI (Claude Code Plugin Installer)

**Repository:** https://github.com/jeremylongshore/claude-code-plugins-plus-skills
**Package:** `@intentsolutionsio/ccpi` (npm global)

**Distribution model:**
```
GitHub repo (source) --> claudecodeplugins.io (CDN) --> CCPI CLI (client)
                                                     ^
                                     .claude-plugin/marketplace.extended.json
```

**CLI commands:**
```bash
ccpi search [keyword]       # Discover plugins
ccpi list                   # All available
ccpi list --installed       # Locally installed
ccpi install [plugin-name]  # Install
ccpi update                 # Update all
ccpi info [plugin-name]     # Details
ccpi validate ./path        # Validate structure (dev tool)
```

**Plugin structure:**
```
plugin-name/
  manifest.json          # Metadata: name, version, description, author
  README.md              # User documentation
  skills/
    skill-adapter/
      SKILL.md           # Agent instructions with YAML frontmatter
```

**Plugin types:**
1. AI Instruction Plugins (98%) - Markdown files that guide Claude's reasoning. No code execution.
2. MCP Server Plugins (2%) - Actual MCP server implementations.

**Scale:** 1,537 agent skills across 20 categories. Trigger phrases activate skills automatically.

### 5.2 HACS (Home Assistant Community Store) Pattern

**Repository:** https://github.com/hacs/integration
**URL:** https://www.hacs.xyz/

HACS is the gold standard for self-hosted platform plugin marketplaces. The model:

**Repository requirements for submission:**
```
custom_components/
  integration_name/
    __init__.py
    manifest.json        # domain, name, version, documentation, issue_tracker, codeowners
    hacs.json            # HACS-specific metadata
    README.md
```

**Discovery mechanism:**
- HACS fetches from a curated list of GitHub repositories
- GitHub releases used for version tracking (5 most recent shown)
- Without releases, falls back to default branch
- One integration per repository

**Key insight for LivOS:** HACS proves that a simple GitHub + manifest.json approach scales to thousands of community integrations. No central server needed beyond a list of repository URLs.

### 5.3 Official MCP Registry

**Repository:** https://github.com/modelcontextprotocol/registry
**URL:** https://modelcontextprotocol.io/registry/about

The official MCP Registry (launched Sept 8, 2025):
- Metaregistry: stores metadata, not packages
- `server.json` format: name, registry_type, identifier, version
- Currently only supports npm public registry
- OpenAPI spec for downstream marketplaces to consume
- Major contributors: Anthropic, GitHub, PulseMCP, Microsoft

**`server.json` example:**
```json
{
  "name": "my-mcp-server",
  "description": "Does useful things",
  "registry_type": "npm",
  "package_name": "@myorg/my-mcp-server",
  "version": "1.0.0",
  "homepage": "https://github.com/myorg/my-mcp-server"
}
```

### 5.4 MCPJungle (Self-Hosted MCP Gateway)

**Repository:** https://github.com/mcpjungle/MCPJungle

Self-hosted alternative to cloud MCP registries:
```
AI Agents --> MCPJungle Gateway (/mcp endpoint) --> Registered MCP Servers
```

**Registration:**
- HTTP servers: URL + optional bearer token
- Stdio servers: command + args + env
- Tool naming: `<server-name>__<tool-name>` (namespaced)

**Storage:** SQLite (dev), PostgreSQL (prod)
**Sessions:** Stateless (default) or stateful (persistent connections)
**Docker:** Two compose files (dev + prod)

**Key pattern for LivOS:** MCPJungle provides a template for LivOS to build its own "MCP Skill Store" - a local registry of MCP servers that agents can discover and use. Each installed "AI App" in LivOS could register its MCP server with this gateway.

### 5.5 VS Code Extension Pattern

VS Code manages extensions via:
1. Marketplace URL in `package.json` (`publisher.extension-name`)
2. VSIX packages (zip archives)
3. Private extension registries (Azure DevOps, Open VSX)
4. Local installation: `code --install-extension ./my-ext.vsix`

**Key insight for LivOS:** The VSIX pattern (self-contained archive with manifest) maps well to LivOS "skill packages" that could contain: markdown skill files, MCP server config, Docker compose additions, and settings templates.

---

## 6. One-Click Deployment Patterns

### 6.1 Coolify + Docker Compose Pattern

**Coolify** (https://coolify.io) enables one-click deployment of Docker Compose stacks with:
- Magic environment variables (auto-injected)
- Persistent storage management
- Healthcheck support
- Predefined network connections
- GitHub/GitLab integration for auto-deploy

**Coolify MCP Server:** https://github.com/dazeb/coolify-mcp-enhanced
- 15+ tools for application lifecycle management
- "Create a new project called 'my-webapp' and deploy it with PostgreSQL, Redis, and MinIO"
- Natural language infrastructure management

### 6.2 Sandstorm Pattern (E2B + Claude Agent SDK)

**Repository:** https://github.com/tomascupr/sandstorm

Pattern: "One API call. Full Claude agent. Completely sandboxed."
```
POST /query { prompt, sandstorm.json config }
  --> E2B sandbox VM (fresh per request)
  --> Claude Agent SDK runs inside sandbox
  --> Streams back via SSE
  --> Sandbox destroyed after completion
```

**Configuration file (`sandstorm.json`):**
```json
{
  "systemPrompt": "...",
  "tools": ["Read", "Write", "Bash", "WebSearch"],
  "subagents": { "researcher": { ... } },
  "mcpServers": { "playwright": { ... } },
  "maxBudgetUsd": 5.0
}
```

**Key insight for LivOS:** This demonstrates packaging an entire agent configuration as a JSON file - equivalent to a "skill definition" for the Claude Agent SDK. LivOS skills could follow this format.

### 6.3 AgentOS Installer

```bash
# One-command install
curl -fsSL https://runagentos.com/install.sh | bash
# or
npm install -g @agent-os/cli
agent-os start
```

Features:
- Auto-detects and installs dependencies (Node.js, tmux, ripgrep)
- Sets up systemd service (Linux) or LaunchAgent (macOS)
- Web UI at localhost:3011
- Tailscale integration for remote access

---

## 7. LivOS Gap Analysis

Comparing current LivOS implementation against discovered patterns:

### 7.1 Current State (from `livos/packages/livinityd/source/modules/ai/`)

**What exists:**
- `AiModule.chat()` - bridges to Nexus via SSE, collects events
- tRPC `stream` subscription - forwards events to UI
- `send` mutation - non-streaming version
- `getClaudeCliStatus`, `startClaudeLogin`, `claudeLogout` - SDK auth flow
- Provider selection: `claude` | `gemini` (stored in Redis)
- Conversation persistence in Redis
- Subagent CRUD via Nexus API
- Schedule management via Nexus API

**What is missing or could be enhanced:**

| Gap | Priority | Pattern |
|---|---|---|
| Direct Claude Agent SDK integration (bypassing Nexus proxy) | High | Section 1 |
| Session ID persistence (enable `resume`) | High | Section 1.7 |
| Cost tracking per conversation (`total_cost_usd`) | High | Section 1.4 |
| Human-in-the-loop tool approval UI | High | Section 1.5 |
| MCP server management UI | Medium | Section 5.4 |
| Skill/plugin browser and installer | Medium | Section 5.1-5.2 |
| Job queue for long-running tasks | Medium | Section 4.1 |
| `canUseTool` callback with web UI approval | Medium | Section 1.5 |
| Per-session `maxBudgetUsd` control | Medium | Section 1.2 |
| File checkpointing / rewind | Low | Section 1.2 |
| Subagent model routing (haiku/sonnet/opus by task) | Medium | Section 1.9 |
| Structured output format for skill results | Low | Section 1.2 |

### 7.2 Architecture Recommendation

**Recommended addition to Nexus (`nexus/`):**

```
nexus/
  workers/
    agent-worker.ts      # BullMQ worker wrapping query()
    agent-stream.ts      # SSE streaming layer
  services/
    session-store.ts     # Redis-backed session ID storage
    cost-tracker.ts      # Per-conversation cost accumulation
    permission-gateway.ts # canUseTool with Redis pub/sub for UI approval
  mcp/
    registry.ts          # Local MCP server registry (MCPJungle-inspired)
    gateway.ts           # Single /mcp endpoint for all registered servers
```

---

## 8. Implementation Recommendations

### 8.1 Scenario: Direct Claude Agent SDK Integration in Nexus

**Recommended implementation:**
```typescript
// nexus/src/services/claude-agent.service.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Redis } from "ioredis";

export class ClaudeAgentService {
  constructor(private redis: Redis) {}

  async runAgent(params: {
    conversationId: string;
    prompt: string;
    cwd?: string;
    maxBudgetUsd?: number;
    onEvent?: (event: SDKMessage) => void;
  }): Promise<{ result: string; costUsd: number; sessionId: string }> {
    // Load session ID from Redis for conversation continuity
    const sessionId = await this.redis.get(`session:${params.conversationId}`);

    let finalResult = "";
    let totalCost = 0;
    let newSessionId = sessionId;

    for await (const message of query({
      prompt: params.prompt,
      options: {
        cwd: params.cwd ?? process.cwd(),
        resume: sessionId ?? undefined,
        maxBudgetUsd: params.maxBudgetUsd ?? 5.0,
        maxTurns: 30,
        permissionMode: "default",
        canUseTool: this.buildPermissionGateway(params.conversationId),
        mcpServers: await this.getRegisteredMcpServers(),
        settingSources: [],   // No filesystem settings - fully programmatic
      }
    })) {
      // Capture session ID from first system message
      if (message.type === "system" && message.subtype === "init") {
        newSessionId = message.session_id;
        await this.redis.set(`session:${params.conversationId}`, newSessionId, "EX", 86400);
      }
      // Stream events to caller
      if (params.onEvent) params.onEvent(message);
      // Capture final result and cost
      if (message.type === "result" && message.subtype === "success") {
        finalResult = message.result;
        totalCost = message.total_cost_usd;
        await this.redis.incrbyfloat(`cost:${params.conversationId}`, totalCost);
      }
    }

    return { result: finalResult, costUsd: totalCost, sessionId: newSessionId };
  }

  private buildPermissionGateway(conversationId: string) {
    // canUseTool callback that asks the web UI via Redis pub/sub
    return async (toolName: string, input: unknown): Promise<PermissionResult> => {
      const requestId = `perm:${conversationId}:${Date.now()}`;
      await this.redis.publish("permission:request", JSON.stringify({
        requestId, conversationId, toolName, input
      }));
      // Wait for UI response (with timeout)
      const response = await this.waitForPermission(requestId, 30_000);
      return response.approved
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: response.reason ?? "User denied" };
    };
  }
}
```

**Rationale:** Replaces the indirect Nexus HTTP proxy bridge with a direct SDK call. Enables session resumption, cost tracking, and tool approval UI.

### 8.2 Scenario: SSE Streaming in livinityd

**Recommended implementation** (replaces current `chat()` + `chatStatus.set()` polling):
```typescript
// In routes.ts - streaming subscription
stream: privateProcedure
  .input(z.object({ conversationId: z.string(), message: z.string() }))
  .subscription(({ ctx, input }) => {
    return observable<SDKMessage>((emit) => {
      ctx.livinityd.nexus.runAgent({
        conversationId: input.conversationId,
        prompt: input.message,
        onEvent: (msg) => emit.next(msg),
      }).then(() => emit.complete())
        .catch((err) => {
          emit.next({ type: "result", subtype: "error_during_execution", ... });
          emit.complete();
        });
    });
  }),
```

**Rationale:** Eliminates the `chatStatus` polling map. All events stream directly to the UI. tRPC subscription handles backpressure.

### 8.3 Scenario: MCP Skill Store for LivOS

**Recommended implementation:**

Adapting the HACS + MCPJungle patterns:

```typescript
// MCP Skill manifest format (livos-skill.json)
{
  "name": "server-monitor",
  "version": "1.0.0",
  "description": "Monitors server health and alerts on issues",
  "author": "livinity",
  "type": "mcp-server",          // or "skill-markdown" or "slash-command"
  "mcp": {
    "command": "node",
    "args": ["/opt/livos/skills/server-monitor/index.js"],
    "env": {}
  },
  "skills": ["./skills/SKILL.md"],
  "dockerCompose": "./docker-compose.yml"  // optional
}
```

**Registry approach:**
```typescript
// Redis-backed local skill registry
async function installSkill(skillId: string, source: "github" | "local", url: string) {
  // 1. Download manifest
  const manifest = await fetchManifest(url);
  // 2. Download files to /opt/livos/skills/{skillId}/
  await downloadSkill(manifest, skillId);
  // 3. Register MCP server with MCPJungle-style gateway
  await registerMcpServer(manifest.mcp);
  // 4. Store in Redis skill registry
  await redis.hset("skills:installed", skillId, JSON.stringify(manifest));
  // 5. Publish event for hot-reload
  await redis.publish("skills:installed", skillId);
}
```

**UI flow:**
1. Browse marketplace (GitHub-based, like HACS)
2. Click install -> `installSkill()` runs
3. Skill appears in chat as available capability
4. Agent automatically discovers via `mcpServerStatus()`

### 8.4 Scenario: GSD-Style Workflow Integration

LivOS already uses GSD conventions. To deepen integration:

```typescript
// Allow LivOS agents to use GSD commands via the SDK
const result = query({
  prompt: "Plan and execute the server health check feature",
  options: {
    cwd: "/opt/livos",
    systemPrompt: { type: "preset", preset: "claude_code", append: LIVOS_CONTEXT },
    settingSources: ["project"],  // Load CLAUDE.md, .claude/commands/ (GSD commands)
    plugins: [
      { type: "local", path: "/opt/livos/.claude" }  // Load GSD commands as SDK plugin
    ],
    mcpServers: await getRegisteredLivosSkills(),
    agents: {
      "planner": { description: "Plans implementation phases", prompt: GSD_PLANNER_PROMPT },
      "executor": { description: "Executes implementation tasks", prompt: GSD_EXECUTOR_PROMPT },
      "verifier": { description: "Verifies completed work", prompt: GSD_VERIFIER_PROMPT }
    }
  }
});
```

**Rationale:** Gives LivOS's AI agent the same structured workflow benefits that GSD provides to Claude Code users.

### 8.5 Scenario: Tool Approval UI (Human-in-the-Loop)

Pattern for surfacing tool approval requests to the web UI:

```typescript
// Server: permission gateway via Redis pub/sub
const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  const id = crypto.randomUUID();
  const channel = `perm:request:${conversationId}`;
  const responseChannel = `perm:response:${id}`;

  // Publish permission request
  await redis.publish(channel, JSON.stringify({ id, toolName, input }));

  // Wait for response (with AbortSignal integration)
  return new Promise((resolve, reject) => {
    const sub = redis.duplicate();
    const timeout = setTimeout(() => {
      sub.disconnect();
      resolve({ behavior: "deny", message: "Approval timeout" });
    }, 30_000);

    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      sub.disconnect();
      reject(new Error("Aborted"));
    });

    sub.subscribe(responseChannel, () => {
      sub.on("message", (_, msg) => {
        clearTimeout(timeout);
        sub.disconnect();
        const { approved, reason } = JSON.parse(msg);
        resolve(approved
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: reason }
        );
      });
    });
  });
};

// Client (React): tRPC subscription to permission requests
// SSE stream: "perm:request:{conversationId}"
// Shows modal: "Agent wants to run: docker rm -f container_name. Allow?"
// On approve: POST /api/perm/respond { id, approved: true }
// On deny: POST /api/perm/respond { id, approved: false, reason: "Not authorized" }
```

---

## Search Summary

```json
{
  "search_summary": {
    "platforms_searched": ["github", "npmjs", "platform.claude.com", "docs.claude.com", "hacs.xyz"],
    "repositories_analyzed": 12,
    "docs_reviewed": 8
  }
}
```

## Key Repositories

| Repository | Stars | Key Pattern |
|---|---|---|
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | 810 | Official SDK |
| [anthropics/claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos) | - | Demo patterns |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | - | Workflow orchestration |
| [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) | - | Web UI + WebSocket |
| [sugyan/claude-code-webui](https://github.com/sugyan/claude-code-webui) | - | Minimal web UI |
| [saadnvd1/agent-os](https://github.com/saadnvd1/agent-os) | - | Multi-session tmux |
| [dzhng/claude-agent-server](https://github.com/dzhng/claude-agent-server) | - | WebSocket server |
| [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow) | - | Multi-agent swarm |
| [tomascupr/sandstorm](https://github.com/tomascupr/sandstorm) | - | Sandboxed agent API |
| [jeremylongshore/claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) | - | CCPI marketplace |
| [mcpjungle/MCPJungle](https://github.com/mcpjungle/MCPJungle) | - | Self-hosted MCP gateway |
| [open-webui/mcpo](https://github.com/open-webui/mcpo) | - | MCP to OpenAPI proxy |

## Technical Insights

### Common Patterns
1. `query()` is consumed as `for await` loop, streaming `SDKMessage` events
2. SSE (`text/event-stream`) is the universal streaming protocol for web clients
3. `session_id` from `SDKSystemMessage.init` is the key to conversation continuity
4. Redis pub/sub enables decoupled permission approval workflows
5. `canUseTool` callback is the hook point for all human-in-the-loop patterns
6. Skills and commands as markdown files is the lowest-friction distribution mechanism
7. MCPJungle gateway pattern centralizes MCP server management

### Best Practices
1. Store `session_id` in Redis keyed to your conversation ID for resume capability
2. Set `maxBudgetUsd` per query to prevent runaway costs
3. Use `settingSources: []` (default) for full programmatic control
4. Use `settingSources: ["project"]` when you need CLAUDE.md to load
5. Always implement `maxTurns` to bound execution
6. Track `total_cost_usd` from `SDKResultMessage` for per-user billing
7. Use `permissionMode: "bypassPermissions"` only in controlled/sandboxed environments
8. Subagents can use cheaper models (`model: "haiku"`) for simple tasks

### Pitfalls
1. **Policy violation:** Do not offer claude.ai subscription login to end users without Anthropic approval
2. Rate limits apply at org level; one heavy user can throttle others
3. Weekly rate limits (since Aug 2025) mean sessions should not span > 1 week without fresh auth
4. `bypassPermissions` + `allowDangerouslySkipPermissions` is needed together for full bypass
5. Subagents inherit `bypassPermissions` and cannot be overridden per-subagent
6. `canUseTool` callback blocks the query until it returns; implement timeouts
7. `settingSources: ["project"]` loads CLAUDE.md which can change agent behavior unexpectedly

### Emerging Trends
1. **Bedrock/Vertex/Azure backends** for enterprise deployments without direct Anthropic API
2. **V2 interface** (`send()` / `receive()` pattern) simplifies multi-turn conversations - in preview
3. **`context-1m-2025-08-07` beta** - 1M token context window for Opus 4.6 / Sonnet 4.5
4. **File checkpointing** enables undo-like functionality for file changes
5. **Structured output** (`outputFormat: { type: 'json_schema' }`) for typed skill results
6. **MCPJungle-style gateways** as local MCP registries for self-hosted platforms

---

## Sources

- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - Complete API
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) - Concepts and comparison
- [Agent SDK Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions) - Permission system
- [@anthropic-ai/claude-agent-sdk npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) - Package
- [claude-agent-sdk-typescript GitHub](https://github.com/anthropics/claude-agent-sdk-typescript) - Source
- [claude-agent-sdk-demos GitHub](https://github.com/anthropics/claude-agent-sdk-demos) - Demo patterns
- [gsd-build/get-shit-done GitHub](https://github.com/gsd-build/get-shit-done) - GSD framework
- [siteboon/claudecodeui GitHub](https://github.com/siteboon/claudecodeui) - CloudCLI web UI
- [sugyan/claude-code-webui GitHub](https://github.com/sugyan/claude-code-webui) - Minimal web UI
- [saadnvd1/agent-os GitHub](https://github.com/saadnvd1/agent-os) - AgentOS multi-session
- [dzhng/claude-agent-server GitHub](https://github.com/dzhng/claude-agent-server) - WebSocket server
- [ruvnet/claude-flow GitHub](https://github.com/ruvnet/claude-flow) - Multi-agent orchestration
- [tomascupr/sandstorm GitHub](https://github.com/tomascupr/sandstorm) - Sandboxed agent API
- [jeremylongshore/claude-code-plugins-plus-skills GitHub](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) - CCPI
- [mcpjungle/MCPJungle GitHub](https://github.com/mcpjungle/MCPJungle) - Self-hosted MCP gateway
- [open-webui/mcpo GitHub](https://github.com/open-webui/mcpo) - MCP to OpenAPI proxy
- [open-webui/open-webui GitHub](https://github.com/open-webui/open-webui) - Open WebUI
- [hacs/integration GitHub](https://github.com/hacs/integration) - HACS plugin marketplace
- [HACS Publishing Docs](https://www.hacs.xyz/docs/publish/integration/) - Integration publishing
- [modelcontextprotocol/registry GitHub](https://github.com/modelcontextprotocol/registry) - Official MCP registry
- [Claude Code Rate Limits - Northflank](https://northflank.com/blog/claude-rate-limits-claude-code-pricing-cost) - Rate limit details
- [Claude Code Manage Costs](https://code.claude.com/docs/en/costs) - Cost management
- [Production Claude Agent API - blle.co](https://www.blle.co/blog/claude-agent-sdk-api-implementation) - Production SSE/job queue pattern
- [Coolify Docker Compose Docs](https://coolify.io/docs/knowledge-base/docker/compose) - Deployment
- [dazeb/coolify-mcp-enhanced GitHub](https://github.com/dazeb/coolify-mcp-enhanced) - Coolify MCP server
- [AnythingLLM AI Agents Docs](https://docs.anythingllm.com/agent/overview) - Agent architecture
- [LibreChat MCP Integration](https://www.librechat.ai/docs/features/mcp) - MCP in LibreChat
