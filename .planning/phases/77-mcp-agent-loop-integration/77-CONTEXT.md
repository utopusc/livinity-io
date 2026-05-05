# Phase 77 — MCP Agent Loop Integration

**Goal:** Close the discovery gap that prevents MCP tools from reaching Claude. After this phase, registered MCP servers (Bytebot + future ones) appear in `tools[]` array sent to the LLM, get invoked, emit tool snapshots, and render in `LivToolPanel`.

**Source of truth:** Two parallel research agents (Suna A-Z + LivOS MCP pipeline trace) on 2026-05-05 confirmed:
1. MCP architecture is sound end-to-end (registration → SSE → frontend → dispatcher)
2. **Single break point**: agent loop never queries `McpConfigManager.listServers()` → MCP servers in Redis registry never reach `tools[]` payload → Claude doesn't know they exist → no tool calls → no UI signal
3. Bytebot MCP server is default-disabled (`BYTEBOT_MCP_ENABLED` env flag) — secondary concern
4. Hardcoded `'kimi'` fallback in two places makes UI display "Kimi" when broker provider is actually Claude — separate but related drift

## Sacred constraint status

`liv/packages/core/src/sdk-agent-runner.ts` — sacred-UNTOUCHED rule **RETIRED for v31** per:
- `PROJECT.md:319`: "Constraint retired going into v31."
- `REQUIREMENTS.md:15`: "Sacred file constraint RETIRED — file actively developed under v29-v30."
- `ROADMAP.md:72`: "Sacred file old UNTOUCHED rule retired."

Modifications allowed in v31 phases. Subscription path (D-NO-BYOK) MUST remain functional — no changes to OAuth credential resolution or Anthropic SDK fallback path.

## Plans

| Plan | Scope | Effort |
|------|-------|--------|
| 77-01 | Provider fallback default `'kimi'` → `'claude'` (2 sites: api.ts:615, livinityd routes.ts:505) | ~15min |
| 77-02 | `SdkAgentRunner` adds `additionalMcpServers?: Record<string,any>` config option; merges into runtime `mcpServers` + adds wildcard to `allowedTools` | ~45min |
| 77-03 | `liv/packages/core/src/api.ts` agent stream handler enumerates `McpConfigManager.listServers()` (enabled only), builds dynamic mcpServers map, passes to runner | ~45min |
| 77-04 | Build + deploy + Mini PC live verify: `BYTEBOT_MCP_ENABLED=true` + `redis SET liv:config:primary_provider claude` + smoke test agent + check tool snapshot SSE event for MCP call | ~45min |

## Out of scope

- MCP server install/uninstall UI (deferred to P78)
- MCP server color identity (Suna pattern, P79 visual polish)
- Tool pill gradient icons (P79)
- `LivMcpBrowserDialog` (P78)

## Sacred SHA snapshot

Pre-phase: `4f868d318abff71f8c8bfbcf443b2393a553018b` — will change after 77-02.

## Verification

- [ ] `curl http://localhost:3200/api/providers` returns `primaryProvider: 'claude'` after Redis set
- [ ] `BYTEBOT_MCP_ENABLED=true` → agent run with task "take screenshot" emits `tool_snapshot` for `mcp_bytebot_screenshot`
- [ ] LivToolPanel receives tool snapshot, dispatcher routes to `McpToolView`
- [ ] Sacred subscription path unchanged: bare task "hello" still streams `data: {"type":"thinking"}` via Anthropic OAuth (no API key required)
