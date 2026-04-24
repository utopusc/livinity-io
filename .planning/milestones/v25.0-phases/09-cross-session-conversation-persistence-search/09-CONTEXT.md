# Phase 9: Cross-Session Conversation Persistence & Search - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add FTS5-based conversation persistence to the memory service (SQLite). Create a conversation_search tool in ToolRegistry so the AI can search past conversations. Every conversation turn from all channels gets archived to SQLite for full-text retrieval.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — infrastructure phase.

Key technical decisions from research:
- Use existing better-sqlite3 in memory service (already has FTS5 compiled in)
- New SQLite table: `conversation_turns` with FTS5 index (columns: userId, channel, chatId, role, content, timestamp)
- conversation_search tool: takes query string + optional filters (channel, dateRange), returns relevant turns
- Write-through: when daemon saves to Redis, also POST to memory service /archive endpoint
- Memory service gets new endpoints: POST /archive (store turn), POST /conversation-search (FTS5 query)
- Search returns ranked results with BM25 scoring
- Existing memory extraction (facts) continues as-is — this adds raw conversation archive alongside it

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Memory service: `nexus/packages/memory/src/index.ts` (SQLite + better-sqlite3, port 3300)
- ToolRegistry: `nexus/packages/core/src/tool-registry.ts` for registering conversation_search
- Daemon conversation save: `livos/packages/livinityd/source/modules/ai/index.ts` saveConversation()
- Channel message handlers already call daemon.addToInbox with IncomingMessage

### Established Patterns
- Memory service uses Express endpoints (POST /add, POST /search, POST /context)
- Tools registered via ToolRegistry.register() with JSON schema
- Daemon processes inbox → agent → response → save conversation to Redis

### Integration Points
- Memory service: add FTS5 table creation in DB init, add /archive and /conversation-search endpoints
- Daemon: after saving to Redis, also POST turn to memory service /archive
- ToolRegistry: register conversation_search tool
- Agent system prompt: mention conversation_search availability

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing memory service patterns.

</specifics>

<deferred>
## Deferred Ideas

- Conversation summaries with embeddings — v26.0
- Memory importance scoring — v26.0

</deferred>
