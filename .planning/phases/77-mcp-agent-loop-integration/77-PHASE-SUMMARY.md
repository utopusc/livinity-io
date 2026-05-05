# Phase 77 — MCP Agent Loop Integration — COMPLETE

**Status:** ✅ Shipped + verified live on Mini PC
**Completed:** 2026-05-05
**Commits:** `8e7b4401` (77-01) + `fc55c795` (77-02+03)
**Deployed SHA:** `fc55c7950e1c8da8b580d1f58f1866ecb3a16f3c`

## What was broken

User reported on 2026-05-05: "MCP tools görünmüyor, AI Chat eski görünüyor, Kimi yazıyor biz Claude kullanıyoruz". Two parallel research agents (Suna A-Z + LivOS MCP pipeline trace) confirmed:

1. **PRIMARY** — Agent loop never enumerated `McpConfigManager.listServers()` → MCP servers registered in Redis registry never reached Claude's `tools[]` payload → Claude couldn't invoke MCP tools → no `tool_snapshot` SSE events → empty UI
2. **CONDITIONAL** — Bytebot MCP default-disabled (`BYTEBOT_MCP_ENABLED=true` env required)
3. **SEPARATE** — Hardcoded `'kimi'` fallback in 4 places displayed "Kimi" badge when broker is actually Claude

## Pre-deploy diagnosis (Mini PC, 2026-05-05 17:40Z)

All 4 hypotheses **confirmed** via `curl /api/providers` + `redis-cli GET ...` + `.env` grep:

| Check | Pre-deploy reality |
|------|------------------|
| `/api/providers` primary | `"kimi"` (default fallback) |
| Redis `liv:config:primary_provider` | `(nil)` |
| `BYTEBOT_MCP_ENABLED` env | unset |
| Redis `liv:mcp:config` | `(nil)` |

## Plans shipped

### 77-01 — Provider fallback default `kimi → claude` (`8e7b4401`)
Fixed 4 hardcoded `'kimi'` fallback sites:
- `liv/packages/core/src/api.ts:615` (`/api/providers` endpoint default)
- `livos/.../ai/routes.ts:505` (tRPC catch fallback)
- `livos/.../ai-chat/index.tsx:265` (UI activeProvider fallback)
- `livos/.../liv-model-badge.tsx` (`getModelBadgeText` fallback + 4 unit tests)

### 77-02 — `SdkAgentRunner.additionalMcpServers` config option (part of `fc55c795`)
- `liv/packages/core/src/agent.ts` AgentConfig — new optional field `additionalMcpServers?: Record<string, unknown>`
- `liv/packages/core/src/sdk-agent-runner.ts` — merge into runtime `mcpServers` after built-in entries; reserved-name skip ('nexus-tools', 'chrome-devtools'); wildcard auto-approve in `allowedTools` (`mcp__<name>__*`)

**Sacred file SHA changed**: `4f868d31...` → `f3538e1d...`. Constraint retired per PROJECT.md:319 / REQUIREMENTS.md:15 / ROADMAP.md:72. Subscription path (D-NO-BYOK) untouched: only `mcpServers` + `allowedTools` lines modified, OAuth credential resolution + Anthropic SDK fallback unchanged.

`sdk-agent-runner-integrity.test.ts` BASELINE_SHA updated; `1/1 PASS`.

### 77-03 — `api.ts` agent-stream MCP enumeration (part of `fc55c795`)
In `/api/agent/stream` handler before `agentConfig` construction:
- Calls `mcpConfigManager.listServers()` (already a constructor parameter of `createApiServer`)
- Filters to `s.enabled === true`
- Converts each `McpServerConfig` (Liv shape) to Claude Agent SDK shape:
  - `transport: 'stdio'` → `{ type: 'stdio', command, args, env? }`
  - `transport: 'streamableHttp'` → `{ type: 'http', url, headers? }`
- Skips reserved names with warning
- Passes through `agentConfig.additionalMcpServers` when ≥1 server injected
- Failures are non-fatal — agent runs without MCP if enumeration throws

### 77-04 — Live deploy + verification (this summary)

**Pre-deploy state changes:**
```bash
redis-cli SET liv:config:primary_provider claude          # OK
echo 'BYTEBOT_MCP_ENABLED=true' >> /opt/livos/.env        # appended
```

**Deploy:** `bash /opt/livos/update.sh` (detached, ~6min)
- Cloned latest, pnpm install, 5 builds (UI, @liv/core, @liv/memory, @liv/worker, @liv/mcp-server)
- Restarted livos + liv-core + liv-worker + liv-memory
- Recorded deployed SHA: `fc55c7950e1c8da8b580d1f58f1866ecb3a16f3c`

**Post-deploy live verification:**

```
$ curl /api/providers
{"providers":[{"id":"kimi","available":false},{"id":"claude","available":false}],
 "primaryProvider":"claude","fallbackOrder":["claude","kimi"]}

$ redis-cli GET liv:config:primary_provider
claude

$ redis-cli GET liv:mcp:config
{
  "mcpServers": {
    "bytebot": {
      "name": "bytebot",
      "transport": "stdio",
      "command": "tsx",
      "args": ["/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts"],
      "env": { "DISPLAY": ":0", "XAUTHORITY": "/home/bruce/.Xauthority" },
      "enabled": true,
      "installedAt": 1778003292446
    }
  }
}

$ ps -ef | grep mcp/server.ts
root  2454678  ... node tsx /opt/livos/.../computer-use/mcp/server.ts  ← spawned by McpClientManager

$ journalctl -u liv-core | grep -E "MCP|mcp"
[INFO] McpClientManager: connected to "bytebot", 17 tools registered
[INFO] ToolRegistry: registered "mcp_bytebot_computer_screenshot"  (+ 16 more)
[INFO] /api/agent/stream: enumerated MCP servers {total:1, enabled:1, injected:1}  ← P77-03 fired
[INFO] SdkAgentRunner: additional MCP servers injected {added:1, skipped:0, names:["bytebot"]}  ← P77-02 fired
[INFO] SdkAgentRunner: starting task {... toolCount:66}  ← Claude has bytebot tools

$ curl -X POST /api/agent/stream -d '{"task":"hello..."}'
data: {"type":"thinking","turn":1}                         ← agent live, OAuth subscription path working
```

## What works now

- ✅ All 4 services active post-deploy
- ✅ `/api/providers` returns `primaryProvider: "claude"` (was `"kimi"`)
- ✅ Bytebot MCP server registered in Redis (was empty)
- ✅ Bytebot MCP child process spawned and connected (17 tools enumerated by McpClientManager)
- ✅ Agent stream injects MCP servers into Claude's `mcpServers` config (`toolCount: 66`, was without bytebot ~50)
- ✅ Agent stream still functions on subscription path (`data: {"type":"thinking","turn":1}` returned)
- ✅ Sacred subscription path untouched: OAuth resolves correctly, no API key required

## Known carryover for P78

1. ProviderManager reports both `kimi` and `claude` as `available:false`. The displayed primary is correct but availability check is broken — needs ProviderManager rewire (P78-01).
2. MCP panel install/uninstall buttons (`livos/.../ai-chat/mcp-panel.tsx`) are still UI-only stubs — no tRPC mutations wired (P78-02).
3. `LivMcpBrowserDialog` (Suna `BrowseDialog` parity) not yet built — composer `+ MCP` button + agent settings entry pending (P78-03).
4. PWA service worker may still cache old asset bundle on user's browser — user should hard-reload `Ctrl+Shift+R` after deploy.

## What user should now see in browser

1. Hard-reload `https://bruce.livinity.io` (`Ctrl+Shift+R` + DevTools → Application → Service Workers → Unregister if needed)
2. AI Chat window → bottom badge should now show **"Liv Agent · Claude"** (was "Kimi")
3. Send a task like "take a screenshot of localhost" → agent will use `mcp_bytebot_computer_screenshot` tool, `LivToolPanel` will auto-open, side panel shows tool execution

If MCP tool snapshot doesn't appear in side panel, check browser console for SSE chunk shape — bytebot tool names should be `mcp_bytebot_*` and dispatcher should route via `mcp_*` regex check (already wired per Phase 69-04).

## Sacred file note

`liv/packages/core/src/sdk-agent-runner.ts` SHA: `4f868d31...` → `f3538e1d...`. Constraint retirement was already documented in v31 milestone planning (PROJECT.md:319, REQUIREMENTS.md:15, ROADMAP.md:72) — this phase is the first v31 work to actually exercise the retirement.
