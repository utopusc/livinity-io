# Technology Stack: v6.0 — Claude Code → Kimi Code Migration

**Project:** LivOS v6.0 — Replace Claude Code with Kimi Code
**Researched:** 2026-03-09
**Overall confidence:** MEDIUM-HIGH (verified via Architecture and Features research agents)

---

## Packages to REMOVE

| Package | Purpose | Current Location |
|---------|---------|-----------------|
| `@anthropic-ai/sdk` | Anthropic API client | nexus/packages/core |
| `@anthropic-ai/claude-agent-sdk` | Claude Code subprocess SDK | nexus/packages/core |

## Packages to ADD

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `@moonshot-ai/kimi-agent-sdk` | ^0.1.5 | Kimi Code subprocess SDK (mirrors Claude Agent SDK) | MEDIUM (0.x) |

**Fallback path:** If SDK is unreliable, use Kimi CLI directly:
- `kimi --print --output-format=stream-json` spawned as child process
- Parse JSONL output (no SDK dependency)
- HIGH confidence — standard subprocess pattern

## Kimi CLI (System Dependency)

Unlike Claude Code (standalone binary), Kimi CLI is **Python-based**:
- Requires: Python 3.12+, `uv` package manager
- Install: `uv tool install kimi-code` (or `pip install kimi-code`)
- Binary: `kimi` available on PATH after install
- Config: `~/.kimi/` directory for credentials and MCP config

## API Compatibility

Kimi provides an **OpenAI-compatible API** at `api.kimi.com/coding/v1`:
- Uses standard OpenAI function calling format
- Tool definitions: `{ name, description, parameters }` (NOT `input_schema`)
- Tool calls: arguments as JSON string (needs `JSON.parse()`)
- Models: K2.5 series (exact IDs need runtime verification)
- Pricing: ~$0.60/$3.00 per M tokens (10x cheaper than Claude Opus)

## Key Technical Differences

| Aspect | Claude Code | Kimi Code |
|--------|------------|-----------|
| SDK pattern | `@anthropic-ai/claude-agent-sdk` subprocess | `@moonshot-ai/kimi-agent-sdk` subprocess |
| Tool format | `input_schema` + `tool_use` blocks | OpenAI `parameters` + `function` blocks |
| Tool args | Parsed object | JSON string (needs `JSON.parse()`) |
| MCP config | Inline via SDK | `--mcp-config` CLI flag (inline JSON) |
| System prompt | Inline string | File-based YAML + markdown (write temp files) |
| Auth | PKCE OAuth to claude.ai | Device auth flow or API key |
| CLI runtime | Standalone binary | Python 3.12+ with `uv` |
| Streaming | SDK event iterator | SDK events or JSONL `--print` mode |

## What NOT to Add

- **OpenAI SDK**: Don't add `openai` package. Use Kimi Agent SDK or raw HTTP. The OpenAI-compatible API is for reference, not direct use.
- **LangChain/LangGraph**: Conflicts with existing Daemon + AgentRunner pattern.
- **Multiple AI SDKs**: Remove Gemini fallback entirely. Single provider architecture.

## Existing Stack (Unchanged)

- Express + tRPC backend
- React 18 + Vite frontend
- Redis for config/state
- BullMQ for job processing
- MCP tool system (shell, docker, files, etc.)
- SSE streaming to web UI
- JWT authentication
