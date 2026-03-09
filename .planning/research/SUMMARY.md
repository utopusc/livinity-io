# Project Research Summary

**Project:** LivOS v6.0 -- Claude Code to Kimi Code Migration
**Domain:** AI provider migration in self-hosted home server OS
**Researched:** 2026-03-09
**Confidence:** MEDIUM-HIGH

## Executive Summary

This migration replaces Claude Code (Anthropic's CLI-based AI agent) with Kimi Code (Moonshot AI's equivalent) across the Nexus backend and LivOS frontend. The research confirms this is a **systematic component replacement, not a rewrite**. The existing architecture has clean seams: the AIProvider interface, ProviderManager, SdkAgentRunner pattern, ToolRegistry, and SSE streaming pipeline are all provider-agnostic. The Claude-specific surface is confined to roughly 10 files across four layers (provider, agent runner, API routes, UI). Kimi Code offers three integration depths -- direct OpenAI-compatible API, Agent SDK subprocess, and CLI print mode -- giving us flexibility and a reliable fallback chain.

The recommended approach is to build in four phases: (1) KimiProvider for API key mode first (fastest path to a working chat), (2) API routes and UI updates for configuration, (3) KimiAgentRunner for subscription/CLI mode (the more complex subprocess integration), and (4) cleanup of all Claude-specific code. The single most important architectural decision: **start with Kimi CLI's print mode (`--print --output-format=stream-json`) for the agent runner, not the SDK**. The `@moonshot-ai/kimi-agent-sdk` is version 0.1.5 (pre-stable), making it a risk for the primary integration path. Print mode is a stable, zero-dependency approach that spawns `kimi` as a child process and parses JSONL output. Upgrade to the SDK once it matures.

The key risks are: (1) the inline MCP server gap -- Claude's `createSdkMcpServer()` has no Kimi equivalent, requiring either `createExternalTool()` via the SDK or `--mcp-config` inline JSON via print mode; (2) the system prompt format change from inline strings to file-based agent YAML definitions; and (3) the new Python 3.12+ system dependency on the production server. All three have verified workarounds. On the upside, Kimi is 8-10x cheaper ($0.60/$3.00 vs $5/$25 per million tokens for top-tier models), offers cache-aware token tracking, and simplifies the OAuth flow (device auth instead of manual PKCE code paste).

## Key Findings

### Recommended Stack

**Remove:** `@anthropic-ai/sdk` and `@anthropic-ai/claude-agent-sdk` from nexus/packages/core.

**Add:** `@moonshot-ai/kimi-agent-sdk` (^0.1.5, pin exact version). Optionally add `openai` npm package for the KimiProvider API key mode, since Kimi exposes an OpenAI-compatible endpoint at `api.kimi.com/coding/v1`.

**System dependency:** Kimi CLI requires Python 3.12+ and `uv` package manager on the production server. Install via `curl -LsSf https://code.kimi.com/install.sh | bash` or `uv tool install kimi-code`.

**Core technologies:**
- **Kimi Agent SDK** (`@moonshot-ai/kimi-agent-sdk`): Subprocess SDK mirroring Claude Agent SDK pattern -- `createSession()` + `session.prompt()` instead of `query()`
- **Kimi CLI print mode**: Fallback integration via `kimi --print --output-format=stream-json` -- zero SDK dependency, parse JSONL stdout
- **OpenAI-compatible API**: `api.kimi.com/coding/v1` for direct API key mode chat -- standard format, high confidence
- **Existing stack unchanged**: Express + tRPC, Redis, React 18, Vite, BullMQ, MCP tools, SSE streaming, JWT auth

**What NOT to add:** Do not add the `openai` package if unnecessary complexity. Do not maintain dual Claude + Kimi support. Do not keep the dead GeminiProvider. Do not adopt LangChain.

### Expected Features

**Must have (table stakes):**
- Agent runner spawning Kimi CLI subprocess with MCP tool access (FM-01, FM-02)
- Streaming events from Kimi to web UI via SSE (FM-03)
- Model tier selection mapping to Kimi model IDs (FM-04)
- API key authentication with Moonshot platform (FM-05)
- Auto-approval for Nexus tools via `yoloMode: true` (FM-07)
- Chrome DevTools MCP integration via mcp.json stdio config (FM-10)
- Settings UI with Kimi branding and auth flow (FM-11)

**Should have (differentiators -- Kimi advantages):**
- 8-10x cheaper inference costs (zero code change, immediate benefit)
- Cache-aware token tracking with `input_cache_read` metrics (low effort)
- Thinking mode toggle (`SessionOptions.thinking: true`) for chain-of-thought reasoning (low effort)
- Granular approval system with per-request approve/reject (medium effort, better than Claude's all-or-nothing)
- Vision capabilities via multimodal K2.5 model (low effort)

**Defer (v2+):**
- Wire mode integration for advanced programmatic steering
- Agent YAML files for different personas per use case
- Self-hosted model weights from HuggingFace
- Thinking mode UI (reasoning chain display)

### Architecture Approach

The migration touches four layers with clean boundaries. **KimiProvider** (new file) implements the AIProvider interface for API key mode using OpenAI-compatible chat completions format. **KimiAgentRunner** (new file) replaces SdkAgentRunner for subscription mode, initially using print mode fallback (spawn child process, parse JSONL) with SDK upgrade path. API routes change from `/api/claude-cli/*` to `/api/kimi/*` with a simpler auth flow (device auth, no code paste). The UI simplifies: the "paste authorization code" step is eliminated entirely.

**Major components:**
1. **KimiProvider** (`providers/kimi.ts`) -- Implements `chat()`, `chatStream()`, `isAvailable()`, `getModels()`, `getCliStatus()`, `startLogin()`, `logout()` using OpenAI-compatible API and device auth
2. **KimiAgentRunner** (`kimi-agent-runner.ts`) -- Spawns `kimi` CLI subprocess, handles MCP tools via `createExternalTool()` (SDK) or `--mcp-config` inline JSON (print mode), maps events to AgentEvent interface
3. **API routes** (`api.ts`) -- `/api/kimi/status`, `/api/kimi/login`, `/api/kimi/logout` replacing Claude endpoints; agent stream switches to KimiAgentRunner for subscription mode
4. **tRPC proxy routes** (`livinityd/ai/routes.ts`) -- `ai.getKimiCliStatus`, `ai.startKimiLogin`, `ai.kimiLogout` replacing Claude equivalents
5. **Settings UI** (`ai-config.tsx`) -- Kimi branding, simplified subscription auth (button + poll, no code paste), API key input

**Files to create:** 2 (kimi.ts, kimi-agent-runner.ts)
**Files to modify:** 7 (manager.ts, index.ts, types.ts, api.ts, daemon.ts, routes.ts, ai-config.tsx, config/schema.ts)
**Files to delete:** 2 (claude.ts, sdk-agent-runner.ts)

### Critical Pitfalls

1. **SDK maturity risk (P1, CRITICAL)** -- `@moonshot-ai/kimi-agent-sdk` is v0.1.5 (0.x = pre-stable). API may change without warning. **Prevention:** Build print mode fallback first (`kimi --print --output-format=stream-json`). Use SDK as an upgrade path, not the foundation. Pin exact version.

2. **Inline MCP server gap (P2, CRITICAL)** -- Claude's `createSdkMcpServer()` has no Kimi equivalent. Nexus tools must be exposed differently. **Prevention:** Use `createExternalTool()` for SDK path (register tools directly with Zod schemas and handlers) or `--mcp-config` inline JSON for print mode path. Both are verified workarounds.

3. **Tool format translation errors (P3, CRITICAL)** -- Kimi uses OpenAI function calling format: `parameters` instead of `input_schema`, tool arguments as JSON strings instead of parsed objects. Missing `JSON.parse()` causes silent failures. **Prevention:** Create explicit `translateToolDefinition()` and `parseToolArguments()` functions. Unit test with every MCP tool. Log raw payloads during development.

4. **System prompt format change (P4, HIGH)** -- Kimi requires file-based agent YAML + markdown prompt instead of inline strings. **Prevention:** Write temporary agent YAML + system prompt files per session, clean up on close. Alternatively, API mode supports inline system prompts through the OpenAI-compatible format.

5. **Breaking changes during migration (P10, MEDIUM)** -- System is unusable between removing Claude and having Kimi fully working. **Prevention:** Build Kimi alongside Claude first. Switch provider in config when verified. Remove Claude code last (Phase 4). Never deploy a half-migrated state.

## Implications for Roadmap

Based on combined research, the migration should follow a four-phase structure driven by dependency order and risk management.

### Phase 1: KimiProvider (API Key Mode)

**Rationale:** Establishes the foundation with the lowest-risk integration path. API key mode uses standard OpenAI-compatible chat completions -- no CLI dependency, no subprocess management, no MCP config complexity. Gets basic chat working immediately.

**Delivers:** Working AI chat via Kimi API with tool calling through existing AgentLoop. Cost tracking with Kimi pricing. Model tier mapping.

**Addresses:** FM-04 (model selection), FM-09 (token usage), P3 (tool format translation), P8 (model tier mapping), P11 (rate limiting)

**Avoids:** P1 (SDK maturity) by not depending on the SDK yet. P10 (breaking changes) by keeping Claude code intact.

**Files:** `providers/kimi.ts` (new), `providers/manager.ts`, `providers/index.ts`, `providers/types.ts`, `config/schema.ts`

### Phase 2: API Routes + tRPC + UI

**Rationale:** Users need to configure Kimi credentials through the UI before the migration is usable. The auth flow is simpler than Claude's (device auth, no code paste), making the UI work lighter.

**Delivers:** Full settings UI for Kimi configuration. API key input, CLI status display, subscription login flow. Redis key migration from `anthropic_api_key` to `kimi_api_key`.

**Addresses:** FM-05 (authentication), FM-06 (CLI status), FM-11 (settings UI), FM-12 (onboarding wizard), P6 (auth flow simplification)

**Avoids:** P7 (incomplete cleanup) by not removing Claude code yet -- both coexist during development.

**Files:** `api.ts`, `livinityd/modules/ai/routes.ts`, `ui/routes/settings/ai-config.tsx`

### Phase 3: KimiAgentRunner (Subscription Mode)

**Rationale:** The most complex phase. Depends on Kimi CLI being installed on the production server (Python 3.12+, uv). Start with print mode fallback for reliability, upgrade to SDK if stable.

**Delivers:** Full agent runner spawning Kimi CLI subprocess with MCP tool access. Streaming events to UI. External tool registration. Chrome DevTools MCP integration.

**Addresses:** FM-01 (agent runner), FM-02 (MCP tools), FM-03 (streaming events), FM-07 (auto-approval), FM-08 (system prompt), FM-10 (Chrome DevTools)

**Avoids:** P1 (SDK maturity) by starting with print mode. P2 (MCP gap) by using `--mcp-config` inline JSON or `createExternalTool()`. P4 (system prompt) by writing temp agent YAML files. P5 (Python dependency) by installing requirements first.

**Files:** `kimi-agent-runner.ts` (new), `api.ts` (agent stream switch), `daemon.ts` (import swap)

**Server prerequisite:** Install Python 3.12+ and Kimi CLI on production server before this phase.

### Phase 4: Cleanup and Enhancement

**Rationale:** Only after all functionality is verified working end-to-end. Remove all Claude-specific code, packages, and references. Add differentiator features.

**Delivers:** Clean codebase with no Claude dependencies. Redis key migration. Optionally: thinking mode UI, granular approval handler.

**Addresses:** P7 (incomplete cleanup), AF-01 (no dual support), AF-04 (remove dead Gemini code)

**Verification:** Run `grep -r "claude\|anthropic\|Claude\|Anthropic" --include="*.ts" --include="*.tsx"` to confirm complete removal. Check Redis keys. End-to-end test on production.

**Files:** Delete `claude.ts`, `sdk-agent-runner.ts`. Remove `@anthropic-ai/*` packages. Update `package.json`.

### Phase Ordering Rationale

- **Phase 1 before Phase 2** because the provider must exist before routes and UI can reference it
- **Phase 2 before Phase 3** because API key mode (Phase 1 + 2) provides a working system while the more complex CLI subprocess integration is built
- **Phase 3 is the critical path** -- the MCP tool bridging and event mapping are where most bugs will surface
- **Phase 4 last** because deleting Claude code before Kimi is fully verified risks downtime
- Phases 2 and 3 could partially overlap (UI work is independent of agent runner work)

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (KimiAgentRunner):** The SDK's `createExternalTool()` integration with `createSession()` is documented but not verified. The exact TypeScript signatures need testing. Print mode fallback is well-understood, but the SDK path needs runtime validation. Consider running `/gsd:research-phase` before executing.
- **Phase 2 (Auth flow):** The device auth API endpoints (`auth.kimi.com/api/oauth/device_authorization`) were found in the GitHub issue tracker, not official docs. The exact request/response format needs verification.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (KimiProvider):** OpenAI-compatible API is a well-documented, established pattern. Tool definition translation is mechanical (`input_schema` -> `parameters`). High confidence.
- **Phase 4 (Cleanup):** Straightforward deletion and grep verification. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | SDK is 0.x but has fallback (print mode). OpenAI-compatible API is standard. |
| Features | HIGH | 12 features mapped 1:1 with clear complexity ratings. Gaps identified with workarounds. |
| Architecture | HIGH | Direct codebase analysis + official Kimi docs. Complete file manifest with exact changes. |
| Pitfalls | HIGH | 12 pitfalls identified with prevention strategies. Informed by architecture + features research. |

**Overall confidence:** MEDIUM-HIGH

The primary uncertainty is the Kimi Agent SDK's stability (0.x version) and the exact model IDs available at runtime. Both have clear fallback paths. The architecture is well-understood because the migration preserves the existing provider abstraction layer.

### Gaps to Address

- **Model IDs at runtime:** The exact Kimi model IDs (`kimi-for-coding`, `kimi-latest`, etc.) need verification via `kimi info` on the server. The tier mapping is approximate until validated.
- **Device auth API format:** The OAuth device authorization endpoint was found in GitHub issues, not official documentation. Request/response format needs testing during Phase 2.
- **`createExternalTool()` wiring:** The SDK docs show `createExternalTool()` usage but not how it integrates with `createSession()`. Needs runtime testing in Phase 3. Fallback: use print mode with `--mcp-config`.
- **Kimi API base URL:** Documentation references both `api.kimi.com/coding/v1` and `api.moonshot.ai/v1`. Need to determine which endpoint has the correct model availability for coding tasks.
- **Windows development:** Kimi CLI is Python-based and should work on Windows, but local development/testing has not been verified.

## Sources

### Primary (HIGH confidence)
- [Kimi Agent SDK GitHub](https://github.com/MoonshotAI/kimi-agent-sdk) -- Session API, Turn interface, event types, createExternalTool
- [Kimi CLI GitHub](https://github.com/MoonshotAI/kimi-cli) -- CLI features, installation, MCP support
- [Kimi CLI Official Docs](https://moonshotai.github.io/kimi-cli/en/) -- MCP config, print mode, wire mode, command reference, agent files
- [Kimi CLI Auth Issue #757](https://github.com/MoonshotAI/kimi-cli/issues/757) -- OAuth device auth implementation details
- [Kimi API Pricing](https://costgoat.com/pricing/kimi-api) -- Full model list with per-million-token pricing

### Secondary (MEDIUM confidence)
- [Kimi CLI Technical Deep Dive](https://llmmultiagents.com/en/blogs/kimi-cli-technical-deep-dive) -- Internal architecture analysis
- [Kimi K2.5 Developer Guide](https://www.nxcode.io/resources/news/kimi-k2-5-developer-guide-kimi-code-cli-2026) -- Model capabilities
- [Kimi Code vs Claude Code](https://medium.com/ai-software-engineer/i-finally-tested-new-kimi-code-cli-like-claude-code-dont-miss-my-hard-lesson-bc5d60a51578) -- Practical comparison
- [One Agent SDK](https://github.com/odysa/one-agent-sdk) -- Provider-agnostic wrapper showing Kimi SDK patterns

### Tertiary (LOW confidence)
- [SourceForge Claude vs Kimi](https://sourceforge.net/software/compare/Claude-Code-vs-Kimi-Code-CLI/) -- Feature comparison (marketing-oriented)

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
