# Requirements: v6.0 — Claude Code → Kimi Code Migration

**Milestone:** v6.0
**Created:** 2026-03-09
**Status:** Draft

---

## Milestone Requirements

### Core Runtime (CORE)

- [ ] **CORE-01**: KimiProvider implements AIProvider interface with OpenAI-compatible API (`api.kimi.com/coding/v1`)
- [ ] **CORE-02**: Tool format translation layer converts Anthropic `input_schema` to OpenAI `parameters` format
- [ ] **CORE-03**: Tool argument parser applies `JSON.parse()` to Kimi's string-format tool call arguments
- [ ] **CORE-04**: Model tier mapping (fast/balanced/powerful) configurable via Redis, with Kimi K2.5 model IDs
- [ ] **CORE-05**: Streaming chat responses from Kimi API piped to existing SSE stream format

### Agent Runner (AGENT)

- [ ] **AGENT-01**: KimiAgentRunner spawns `kimi` CLI as subprocess with `--print --output-format=stream-json`
- [ ] **AGENT-02**: JSONL event parser maps Kimi output events to existing AgentEvent types (text, tool_call, tool_result, status, error)
- [ ] **AGENT-03**: MCP tools passed to Kimi CLI via `--mcp-config` inline JSON flag
- [ ] **AGENT-04**: System prompt written as temp YAML + markdown files per session, cleaned up after completion
- [ ] **AGENT-05**: Token usage tracking extracted from Kimi response metadata

### Auth & Config (AUTH)

- [ ] **AUTH-01**: Kimi API key stored in Redis (`nexus:config:kimi_api_key`)
- [ ] **AUTH-02**: Config schema updated — model names, auth method, provider type for Kimi
- [ ] **AUTH-03**: Python 3.12 + `uv` + Kimi CLI installed on production server
- [ ] **AUTH-04**: Device auth flow (optional) — status polling, no code-paste step needed

### API Routes (API)

- [ ] **API-01**: Express routes `/api/kimi/status`, `/api/kimi/login`, `/api/kimi/logout` replace Claude CLI endpoints
- [ ] **API-02**: tRPC routes `ai.getKimiStatus`, `ai.startKimiLogin`, `ai.submitKimiLoginCode`, `ai.kimiLogout` replace Claude routes
- [ ] **API-03**: Existing agent stream endpoint (`/api/agent/stream`) works with KimiAgentRunner

### Settings UI (UI)

- [ ] **UI-01**: Settings AI Configuration shows Kimi API key input and auth status
- [ ] **UI-02**: Claude Provider section and Gemini Fallback section removed from Settings
- [ ] **UI-03**: Model selection dropdown shows Kimi model tiers (fast/balanced/powerful)

### Onboarding (ONBOARD)

- [ ] **ONBOARD-01**: Setup wizard AI step updated for Kimi Code (API key input or device auth)
- [ ] **ONBOARD-02**: Setup wizard validation checks Kimi API key or CLI auth status

### Cleanup (CLEAN)

- [ ] **CLEAN-01**: `@anthropic-ai/sdk` and `@anthropic-ai/claude-agent-sdk` packages removed from package.json
- [ ] **CLEAN-02**: ClaudeProvider class and file deleted
- [ ] **CLEAN-03**: SdkAgentRunner (Claude-specific) class and file deleted
- [ ] **CLEAN-04**: Gemini fallback provider removed
- [ ] **CLEAN-05**: All Redis keys with "claude" or "anthropic" prefix migrated or removed
- [ ] **CLEAN-06**: All `.env` variables referencing Claude/Anthropic removed
- [ ] **CLEAN-07**: Grep verification — zero matches for `claude|anthropic|Claude|Anthropic` in active TypeScript/TSX

---

## Future Requirements (Deferred)

- SDK upgrade path: Replace Print mode with `@moonshot-ai/kimi-agent-sdk` session-based runner (when SDK reaches v1.0)
- Thinking mode UI: Display Kimi's reasoning/thinking tokens in chat UI
- Granular tool approval: Per-tool approval instead of blanket auto-approve
- Multi-provider architecture: Re-add provider switching if needed later

## Out of Scope

- **Self-hosted LLM support** — Kimi Code only for now
- **Dark theme** — light theme only
- **New backend features** — migration only, no new capabilities
- **Backward compatibility** — Claude Code support fully removed, no dual-provider
- **Mobile app** — web-first

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| CORE-04 | Phase 1 | Pending |
| CORE-05 | Phase 1 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AGENT-01 | Phase 3 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| AGENT-05 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| ONBOARD-01 | Phase 4 | Pending |
| ONBOARD-02 | Phase 4 | Pending |
| AUTH-04 | Phase 4 | Pending |
| CLEAN-01 | Phase 4 | Pending |
| CLEAN-02 | Phase 4 | Pending |
| CLEAN-03 | Phase 4 | Pending |
| CLEAN-04 | Phase 4 | Pending |
| CLEAN-05 | Phase 4 | Pending |
| CLEAN-06 | Phase 4 | Pending |
| CLEAN-07 | Phase 4 | Pending |

---
*29 requirements across 7 categories, mapped to 4 phases*
