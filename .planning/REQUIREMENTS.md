# Requirements: LivOS v1.5 Claude Migration & AI Platform

**Defined:** 2026-02-15
**Core Value:** One-command deployment of a personal AI-powered server that just works.

## v1.5 Requirements

### Provider Abstraction

- [ ] **PROV-01**: AIProvider interface with chat(), chatStream(), think(), isAvailable() methods
- [ ] **PROV-02**: ProviderManager handles provider selection, fallback chain, and health checks
- [ ] **PROV-03**: Provider-neutral conversation format (role: 'user' | 'assistant', content blocks)
- [ ] **PROV-04**: Message normalization layer handles role mapping and consecutive message merging
- [ ] **PROV-05**: Token usage tracking normalized across providers (inputTokens, outputTokens)
- [ ] **PROV-06**: Provider-specific cost defaults (Claude Sonnet $3/$15 vs Gemini Flash $0.10/$0.40)
- [ ] **PROV-07**: Brain class refactored as thin wrapper around ProviderManager

### Claude Integration

- [ ] **CLAUDE-01**: ClaudeProvider implementation using @anthropic-ai/sdk
- [ ] **CLAUDE-02**: Claude model tier mapping (flash→haiku-4-5, sonnet→sonnet-4-5, opus→opus-4-6)
- [ ] **CLAUDE-03**: Claude streaming via messages.stream() mapped to existing AgentEvent format
- [ ] **CLAUDE-04**: API key stored in Redis (nexus:config:anthropic_api_key) with UI configuration
- [ ] **CLAUDE-05**: Claude message format compliance (strict user/assistant alternation enforced)

### Gemini Fallback

- [ ] **GEM-01**: GeminiProvider extracted from current Brain class (existing code refactored)
- [ ] **GEM-02**: Automatic fallback from Claude to Gemini on 429/503/timeout errors
- [ ] **GEM-03**: Gemini API key retained in Redis for embedding service continuity

### Native Tool Calling

- [ ] **TOOL-01**: ToolRegistry.toClaudeTools() converts tool schemas to Claude input_schema format
- [ ] **TOOL-02**: AgentLoop dual-mode: Claude native tool_use blocks + Gemini JSON-in-text parsing
- [ ] **TOOL-03**: Claude tool_use_id tracking for proper tool_result responses
- [ ] **TOOL-04**: Parallel tool call handling (or disable_parallel_tool_use flag)
- [ ] **TOOL-05**: Extended thinking content blocks exposed as collapsible UI sections

### Auth & Configuration

- [ ] **AUTH-01**: Settings UI page for API key management (Anthropic, Gemini, OpenAI keys)
- [ ] **AUTH-02**: API key validation on save (test with lightweight API call)
- [ ] **AUTH-03**: Provider selection in settings (primary: Claude/Gemini/OpenAI, fallback chain)
- [ ] **AUTH-04**: install.sh updated to prompt for Anthropic API key during setup wizard

### Hybrid Memory

- [ ] **MEM-01**: Automatic memory extraction after conversations (BullMQ background job)
- [ ] **MEM-02**: Memory deduplication via embedding similarity threshold
- [ ] **MEM-03**: Session-bound context table (memory_sessions) linking memories to conversations
- [ ] **MEM-04**: Temporal awareness in memory search (time-decay scoring)
- [ ] **MEM-05**: Context window optimization (relevance-scored memory assembly within token budget)

### Channel Expansion

- [ ] **CHAN-01**: SlackProvider implementation using @slack/bolt Socket Mode
- [ ] **CHAN-02**: MatrixProvider implementation using matrix-js-sdk
- [ ] **CHAN-03**: ChannelId type updated to include 'slack' and 'matrix'
- [ ] **CHAN-04**: Per-channel configuration in Settings UI (bot tokens, room IDs)
- [ ] **CHAN-05**: Fix response routing race condition (pass context per-request, remove instance state)

### Skill Marketplace

- [ ] **SKILL-01**: SKILL.md manifest schema (name, version, description, tools, permissions)
- [ ] **SKILL-02**: Directory-based skill format (skill-name/SKILL.md + skill-name/index.ts)
- [ ] **SKILL-03**: Git-based skill registry client (fetch catalog from GitHub repos)
- [ ] **SKILL-04**: Skill install/uninstall flow with permission declaration review
- [ ] **SKILL-05**: Progressive skill loading (lazy import handlers on demand)
- [ ] **SKILL-06**: Skill discovery UI in LivOS (browse, search, install from marketplace)

### WebSocket Gateway

- [ ] **WS-01**: JSON-RPC 2.0 message framing over existing WebSocket endpoint
- [ ] **WS-02**: Authentication on WebSocket connection (API key or JWT in upgrade request)
- [ ] **WS-03**: Method-based routing (agent.run, agent.cancel, tools.list, skills.list)
- [ ] **WS-04**: Multiplexed sessions (session ID per request for concurrent tasks)
- [ ] **WS-05**: Server-initiated notifications via Redis pub/sub → WebSocket push

### Human-in-the-Loop

- [ ] **HITL-01**: Tool metadata: requiresApproval flag on destructive tools
- [ ] **HITL-02**: Agent loop pause on approval_request event (waits for user response)
- [ ] **HITL-03**: Approval response from any channel (stored in Redis, agent polls/subscribes)
- [ ] **HITL-04**: Configurable approval policy (always/destructive-only/never) per user
- [ ] **HITL-05**: Audit trail for all tool approvals (log who approved what when)

### Parallel Execution

- [ ] **PARA-01**: BullMQ-based parallel agent tasks (one job per agent)
- [ ] **PARA-02**: Task status monitoring API endpoint (list, status, progress)
- [ ] **PARA-03**: Task cancellation via AbortController signal
- [ ] **PARA-04**: Resource-aware scheduling (concurrency limits, token budget distribution)

## Future Requirements

### Advanced Provider Features
- **PROV-ADV-01**: OpenRouter integration for 200+ model access
- **PROV-ADV-02**: Self-hosted LLM support (Ollama, vLLM) as experimental provider
- **PROV-ADV-03**: Provider cost analytics dashboard

### Advanced Memory
- **MEM-ADV-01**: Knowledge graph with entity extraction and relationship mapping
- **MEM-ADV-02**: Cross-conversation memory synthesis (merge related memories)
- **MEM-ADV-03**: Memory export/import for backup

### Advanced Skills
- **SKILL-ADV-01**: Skill sandboxing via worker threads or VM isolation
- **SKILL-ADV-02**: Skill analytics dashboard (usage, performance, errors)
- **SKILL-ADV-03**: Skill dependency resolution (skill A requires skill B)

### Advanced Channels
- **CHAN-ADV-01**: Line channel adapter
- **CHAN-ADV-02**: Email channel (IMAP/SMTP)
- **CHAN-ADV-03**: Voice channel (speech-to-text → agent → text-to-speech)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Subscription OAuth tokens (claude setup-token) | Blocked by Anthropic for third-party tools (Jan 2026) |
| Vercel AI SDK | Would require rewriting AgentLoop, tool registry, streaming |
| LangChain / LangGraph | Heavy framework, opinionated, dependency bloat |
| Separate vector database (Pinecone/Weaviate) | Overkill for single-user self-hosted |
| Neo4j graph database | Too heavy, PostgreSQL adjacency list sufficient for v1.5 |
| Self-hosted LLM support | Local models too weak for agentic reasoning |
| 14+ channels (OpenClaw-style) | Maintenance burden, 5 channels sufficient |
| Visual workflow builder | Multi-month effort, text-based skills sufficient |
| GraphQL subscriptions | Schema complexity, WebSocket sufficient |
| gRPC | Build complexity, not browser-native |
| Centralized skill marketplace with accounts | Don't want dependency on our servers |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 1 | Pending |
| PROV-02 | Phase 1 | Pending |
| PROV-03 | Phase 1 | Pending |
| PROV-04 | Phase 1 | Pending |
| PROV-05 | Phase 1 | Pending |
| PROV-06 | Phase 1 | Pending |
| PROV-07 | Phase 1 | Pending |
| CLAUDE-01 | Phase 1 | Pending |
| CLAUDE-02 | Phase 1 | Pending |
| CLAUDE-03 | Phase 1 | Pending |
| CLAUDE-04 | Phase 1 | Pending |
| CLAUDE-05 | Phase 1 | Pending |
| GEM-01 | Phase 1 | Pending |
| GEM-02 | Phase 1 | Pending |
| GEM-03 | Phase 1 | Pending |
| TOOL-01 | Phase 2 | Pending |
| TOOL-02 | Phase 2 | Pending |
| TOOL-03 | Phase 2 | Pending |
| TOOL-04 | Phase 2 | Pending |
| TOOL-05 | Phase 2 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| MEM-01 | Phase 3 | Pending |
| MEM-02 | Phase 3 | Pending |
| MEM-03 | Phase 3 | Pending |
| MEM-04 | Phase 3 | Pending |
| MEM-05 | Phase 3 | Pending |
| CHAN-01 | Phase 3 | Pending |
| CHAN-02 | Phase 3 | Pending |
| CHAN-03 | Phase 3 | Pending |
| CHAN-04 | Phase 3 | Pending |
| CHAN-05 | Phase 3 | Pending |
| SKILL-01 | Phase 5 | Pending |
| SKILL-02 | Phase 5 | Pending |
| SKILL-03 | Phase 5 | Pending |
| SKILL-04 | Phase 5 | Pending |
| SKILL-05 | Phase 5 | Pending |
| SKILL-06 | Phase 5 | Pending |
| WS-01 | Phase 4 | Pending |
| WS-02 | Phase 4 | Pending |
| WS-03 | Phase 4 | Pending |
| WS-04 | Phase 4 | Pending |
| WS-05 | Phase 4 | Pending |
| HITL-01 | Phase 4 | Pending |
| HITL-02 | Phase 4 | Pending |
| HITL-03 | Phase 4 | Pending |
| HITL-04 | Phase 4 | Pending |
| HITL-05 | Phase 4 | Pending |
| PARA-01 | Phase 5 | Pending |
| PARA-02 | Phase 5 | Pending |
| PARA-03 | Phase 5 | Pending |
| PARA-04 | Phase 5 | Pending |

**Coverage:**
- v1.5 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after research synthesis*
