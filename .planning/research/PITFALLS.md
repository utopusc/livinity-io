# Migration Pitfalls: v6.0 — Claude Code → Kimi Code

**Domain:** Replacing AI provider in existing self-hosted AI platform
**Researched:** 2026-03-09
**Overall confidence:** HIGH (based on Architecture and Features research findings)

---

## CRITICAL Pitfalls

### P1: SDK Maturity Risk
**Issue:** `@moonshot-ai/kimi-agent-sdk` is v0.1.5 (0.x = pre-stable). API surface may change.
**Warning signs:** Import errors after upgrade, undocumented behavior, missing TypeScript types.
**Prevention:**
- Build Print mode fallback FIRST (`kimi --print --output-format=stream-json`)
- Pin exact SDK version in package.json
- SDK path is an enhancement, not the only path
**Phase:** Phase 3 (KimiAgentRunner) — start with Print mode, upgrade to SDK later

### P2: Inline MCP Server Gap
**Issue:** Claude's `createSdkMcpServer()` has no direct Kimi equivalent. Nexus tools may need extraction into standalone MCP server binary.
**Warning signs:** Tool calls not reaching Kimi, timeout on tool execution.
**Prevention:**
- Use `--mcp-config` CLI flag to pass MCP server config inline (HIGH confidence)
- If that fails, create a standalone stdio MCP server for Nexus tools
- Test tool calling in isolation before full integration
**Phase:** Phase 3 (KimiAgentRunner)

### P3: Tool Format Translation Errors
**Issue:** Claude uses `input_schema` + parsed objects. Kimi uses OpenAI `parameters` + JSON string arguments. Missing `JSON.parse()` on tool arguments will cause silent failures.
**Warning signs:** Tool params are strings instead of objects, "unexpected token" errors.
**Prevention:**
- Create explicit `translateToolDefinition()` and `parseToolArguments()` functions
- Unit test the translation layer with every MCP tool
- Log raw tool call payloads during development
**Phase:** Phase 1 (KimiProvider)

---

## HIGH Pitfalls

### P4: System Prompt Format Change
**Issue:** Kimi requires file-based agent YAML + markdown prompt instead of inline system prompt strings. Existing `buildSystemPrompt()` pattern won't work directly.
**Warning signs:** System prompt ignored, agent behaves without context.
**Prevention:**
- Write temp YAML + markdown files per session
- Clean up temp files after session ends
- Or use API mode (inline system prompt works with OpenAI-compatible API)
**Phase:** Phase 3 (KimiAgentRunner)

### P5: Python Dependency on Production Server
**Issue:** Kimi CLI needs Python 3.12+ and `uv`, unlike Claude's standalone binary. Production server may not have these.
**Warning signs:** `kimi: command not found`, Python version mismatch.
**Prevention:**
- Add Python 3.12 + `uv` to server provisioning/install script
- Document system requirements clearly
- Test on clean server before deploying
**Phase:** Phase 3 (before KimiAgentRunner can work)

### P6: Auth Flow Simplification Trap
**Issue:** Kimi uses device auth flow (different from Claude's PKCE). Temptation to over-engineer the auth UI.
**Warning signs:** Complex multi-step UI for what should be a simple flow.
**Prevention:**
- Start with API key mode (simplest — just a text input)
- Device auth flow is a second option (status polling, no code paste)
- Don't build PKCE-style UI — Kimi's flow is simpler
**Phase:** Phase 2 (API Routes + UI)

---

## MEDIUM Pitfalls

### P7: Incomplete Claude Cleanup
**Issue:** Orphaned Claude references in code, config, Redis, UI strings after migration.
**Warning signs:** "claude" appearing in logs, config keys, error messages post-migration.
**Prevention:**
- Run `grep -r "claude\|anthropic\|Claude\|Anthropic" --include="*.ts" --include="*.tsx"` after cleanup
- Check Redis keys: `redis-cli keys "*claude*"`
- Check env vars in .env files
- Automated cleanup verification script
**Phase:** Phase 4 (Cleanup — last phase)

### P8: Model Tier Mapping Uncertainty
**Issue:** Exact Kimi model IDs for haiku/sonnet/opus equivalent tiers unknown. Need runtime verification.
**Warning signs:** Model not found errors, unexpected behavior from wrong tier.
**Prevention:**
- Run `kimi info` or equivalent on server to get available models
- Map tiers at config level, not hardcoded
- Default to a known-working model ID
**Phase:** Phase 1 (KimiProvider) — discover during implementation

### P9: Streaming Event Format Differences
**Issue:** Kimi SDK streaming events have different structure than Claude's. Event mapping may miss edge cases.
**Warning signs:** Missing text in UI, tool calls not displayed, status updates lost.
**Prevention:**
- Map every Claude event type to Kimi equivalent explicitly
- Log unmapped events during development
- Test full conversation flow including tool calls and errors
**Phase:** Phase 1/3 (KimiProvider and KimiAgentRunner)

### P10: Breaking Changes During Migration
**Issue:** System is unusable between removing Claude and having Kimi fully working.
**Warning signs:** Production downtime, lost conversations.
**Prevention:**
- Build Kimi ALONGSIDE Claude first (new provider, not replacing)
- Switch provider in config when Kimi is verified working
- Remove Claude code LAST (Phase 4)
- Never deploy a half-migrated state
**Phase:** All phases — incremental approach

---

## LOW Pitfalls

### P11: Rate Limiting Differences
**Issue:** Kimi may have different rate limits than Claude subscription.
**Prevention:** Monitor rate limit headers in API responses, add backoff logic.
**Phase:** Phase 1

### P12: Context Window Differences
**Issue:** Kimi K2.5 context window may differ from Claude's 200K.
**Prevention:** Check Kimi model specs, adjust conversation length limits if needed.
**Phase:** Phase 1

---

## Migration Safety Checklist

Before removing ANY Claude code:
- [ ] Kimi API key mode works (chat, streaming, tool calling)
- [ ] Kimi agent runner works (subprocess, MCP tools)
- [ ] Settings UI shows Kimi config correctly
- [ ] End-to-end test: UI chat → Kimi → tool execution → response
- [ ] Telegram/Discord channels work with Kimi
- [ ] Voice (if applicable) works with Kimi
- [ ] No "claude" or "anthropic" references in active code
- [ ] Redis keys migrated
- [ ] .env cleaned
