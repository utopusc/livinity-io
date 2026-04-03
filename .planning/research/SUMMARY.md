# Project Research Summary

**Project:** Livinity v25.0 -- WhatsApp Channel + Cross-Session Memory Search
**Domain:** Multi-channel messaging integration + persistent AI memory for self-hosted AI server OS
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

Livinity v25.0 adds two independent but complementary capabilities: WhatsApp as a sixth messaging channel (joining Telegram, Discord, Slack, Matrix, Gmail) and cross-session conversation persistence with full-text search. The codebase is well-positioned for both -- a clean `ChannelProvider` interface exists with five working implementations, and the memory service already has SQLite with embeddings infrastructure. The work is primarily integration and migration, not greenfield architecture.

The recommended approach is to use **Baileys v6.7.21** (stable, not the v7 RC) for WhatsApp, with Redis-backed auth state instead of the file-based default that Baileys documentation explicitly warns against using in production. For conversation search, **SQLite FTS5** (already compiled into better-sqlite3) provides keyword search with zero new dependencies. Embedding every message is wasteful -- instead, embed only conversation summaries and use FTS5 as the primary search engine with optional semantic reranking on top results. The existing ad-hoc WhatsApp code in daemon.ts (Redis inbox/outbox, JID routing) must be migrated into the ChannelProvider pattern, not preserved alongside it.

The primary risks are: (1) **WhatsApp account ban** from Meta's anti-automation detection -- mitigated by aggressive rate limiting, user warnings, and treating WhatsApp as a degradable channel; (2) **auth state corruption** from Baileys' Signal protocol session keys losing sync on crash -- mitigated by Redis-backed transactional persistence; (3) **userId fragmentation** across channels causing the AI to treat the same human as separate users -- mitigated by designing a user identity mapping table before any conversation data accumulates; and (4) **memory scaling wall** as multi-channel input drives brute-force embedding search past acceptable latency -- mitigated by adding FTS5 for keyword search and deferring full vector indexing until volume demands it.

## Key Findings

### Recommended Stack

Only two new production dependencies are needed. The existing stack (Express, tRPC, Redis, better-sqlite3, ioredis) handles everything else.

**Core technologies:**
- **Baileys v6.7.21**: WhatsApp Web API via direct WebSocket -- ~50MB RAM vs 300-600MB for whatsapp-web.js, no Puppeteer/Chromium, native TypeScript, production-stable (v7 is still RC)
- **qrcode v1.5.4**: Server-side QR code generation to data URL -- lightweight (3 deps), renders base64 PNG for UI display
- **SQLite FTS5** (built into better-sqlite3): Full-text search with BM25 ranking on conversation history -- zero new dependencies, <5ms query time at self-hosted scale

**What NOT to add:** whatsapp-web.js (Puppeteer dependency), any vector database (overkill), elasticsearch/meilisearch (unnecessary), pino (bridge to winston instead).

### Expected Features

**Must have (table stakes):**
- **TS-01: WhatsApp ChannelProvider** -- migrate ad-hoc daemon.ts code into standardized ChannelProvider implementation matching Telegram/Discord pattern
- **TS-02: QR Code Auth via Web UI** -- server-to-browser QR display with auto-refresh, pairing code as fallback for remote setups
- **TS-03: Connection Status and Reconnection** -- auto-reconnect with exponential backoff, clear UI status indicators
- **TS-04: Cross-Session Conversation Persistence** -- write-through from Redis hot cache to SQLite durable store for all channels
- **TS-05: AI Conversation Search Tool** -- `conversation_search` tool in ToolRegistry so AI can recall past discussions
- **DF-01: Memory Management UI** -- Settings page for viewing, searching, and deleting stored memories and conversations (trust-building feature)

**Should have (competitive):**
- **TS-06: Unified userId Mapping** -- cross-channel identity resolution via PostgreSQL mapping table
- **DF-02: Auto Memory Extraction from All Channels** -- extend BullMQ extraction pipeline to WhatsApp/Telegram
- **DF-03: WhatsApp Group Support** -- mention-triggered responses in group chats

**Defer (v26+):**
- WhatsApp media/image analysis (requires multimodal pipeline)
- Graph-based memory (SQLite + embeddings sufficient at current scale)
- Cross-channel conversation continuity (requires unified identity first)
- Multi-account WhatsApp (unnecessary complexity for personal use)

### Architecture Approach

Two independent tracks converge at the message processing layer. Track A (WhatsApp Channel) adds a new `WhatsAppProvider` following the proven ChannelProvider pattern with Redis-backed auth state and QR-over-Redis polling. Track B (Cross-Session Memory) adds `conversation_messages` and FTS5 virtual tables to the existing memory service SQLite database, with a write-through pattern (Redis hot cache for active sessions, SQLite for historical search). These tracks are fully independent and can be built in parallel, converging only when auto-memory-extraction from WhatsApp is wired up.

**Major components:**
1. **WhatsAppProvider** (`channels/whatsapp.ts`) -- Baileys socket lifecycle, QR emission, message routing via ChannelProvider interface
2. **WhatsAppAuthStore** (`channels/whatsapp-auth.ts`) -- Redis-backed auth state replacing Baileys' file-based default
3. **ConversationArchiver** (`memory/src/archiver.ts`) -- persists channel conversation turns to SQLite + FTS5 index
4. **ConversationSearchEndpoint** (memory service routes) -- `/conversations/search` and `/conversations/messages` APIs
5. **Memory Management Panel** (`settings/memory.tsx`) -- view, search, delete stored memories and conversation history
6. **UserIdentityMapper** (`user-identity.ts`) -- maps channel-specific IDs to canonical LivOS user IDs

### Critical Pitfalls

1. **WhatsApp account ban** -- Meta actively detects automated messaging. Mitigate with rate limiting (max 10 msgs/min), randomized delays, prominent user warnings before QR scan, and treating WhatsApp as a degradable channel.
2. **Baileys auth state corruption** -- Signal protocol keys must persist atomically; a single missed key update causes permanent decryption failure. Mitigate with Redis-backed auth state using pipeline writes (not file-based).
3. **Echo loop** -- WhatsApp libraries receive the bot's own sent messages as incoming events. Mitigate by filtering `msg.key.fromMe === true` and adding sent-message deduplication in Redis.
4. **userId fragmentation** -- Without identity mapping, the same user on Telegram and WhatsApp has separate memory stores. Design the mapping table before data accumulates; retrofitting is expensive.
5. **Memory scaling wall** -- Brute-force cosine similarity over all embeddings blocks the event loop at 1000+ memories. Mitigate with FTS5 for keyword search (free, instant) and defer full vector indexing until volume demands it.

## Implications for Roadmap

Based on research, the work naturally divides into 5 phases across two independent tracks, with a final integration phase.

### Phase 1: WhatsApp Channel Foundation
**Rationale:** Foundational -- nothing else in the WhatsApp track works without the provider. Library choice (Baileys), auth state architecture (Redis), and echo-loop prevention must be correct from day one. Switching later means full rewrite.
**Delivers:** WhatsApp connected as a proper ChannelProvider, messages flowing through the standardized pipeline, Baileys auth persisted in Redis.
**Addresses:** TS-01 (WhatsApp ChannelProvider)
**Avoids:** Pitfall 1 (session death spiral -- by choosing Baileys), Pitfall 2 (Chromium OOM -- by choosing Baileys), Pitfall 5 (auth state loss -- Redis-backed auth), Pitfall 7 (echo loop -- fromMe filter), Pitfall 8 (supply chain -- verified package only)

### Phase 2: WhatsApp QR Code and Settings UI
**Rationale:** Users cannot use WhatsApp without scanning a QR code. The setup UX is the first interaction and must work flawlessly. Depends on Phase 1 provider emitting QR events.
**Delivers:** WhatsApp tab in Settings > Integrations with QR code display, connection status, disconnect button. Pairing code fallback for remote setups.
**Addresses:** TS-02 (QR Code Auth UI), TS-03 (Connection Status and Reconnection)
**Avoids:** Pitfall 10 (QR UX dead end -- auto-refresh, status indicators, pairing code fallback)

### Phase 3: WhatsApp Message Routing Consolidation
**Rationale:** The existing ad-hoc WhatsApp code in daemon.ts (wa_outbox, getWhatsAppHistory, sendWhatsAppResponse) must be removed to avoid dual code paths. This is a cleanup phase that reduces maintenance burden and ensures WhatsApp uses the same routing as all other channels.
**Delivers:** Unified message routing for all 6 channels. Legacy WhatsApp inbox polling removed. Rate limiting and ban-risk warnings in UI.
**Addresses:** Consolidation of TS-01 into production quality
**Avoids:** Pitfall 3 (account ban -- rate limiting built in), Anti-Pattern 1 (separate WhatsApp processing path)

### Phase 4: Cross-Session Conversation Persistence and Search
**Rationale:** Independent of WhatsApp (can be built in parallel with Phases 1-3). This is the highest-complexity phase with the most new schema work. FTS5 tables, conversation archival pipeline, search API, and the AI tool must all be built and tested together.
**Delivers:** Conversation messages persisted to SQLite across all channels. FTS5 full-text search. `conversation_search` AI tool. Write-through from Redis hot cache to SQLite durable store.
**Addresses:** TS-04 (Cross-Session Persistence), TS-05 (AI Conversation Search Tool)
**Avoids:** Pitfall 6 (memory scaling wall -- FTS5 instead of brute-force embeddings), Anti-Pattern 2 (Redis long-term storage), Anti-Pattern 3 (embedding every message)

### Phase 5: Unified Identity and Memory Management UI
**Rationale:** Depends on both WhatsApp (Phase 3) and conversation persistence (Phase 4) being complete. User identity mapping must precede auto-memory-extraction to avoid accumulating fragmented data.
**Delivers:** Cross-channel user identity mapping. Memory Management Settings page (view, search, delete). Auto-memory-extraction from all channels via BullMQ. Memory deduplication improvements.
**Addresses:** TS-06 (Unified userId Mapping), DF-01 (Memory Management UI), DF-02 (Auto Memory Extraction)
**Avoids:** Pitfall 4 (userId fragmentation -- mapping table designed first), Pitfall 9 (memory dedup failure -- canonical userId enables cross-channel dedup)

### Phase Ordering Rationale

- **Phases 1-3 and Phase 4 are independent tracks.** WhatsApp channel work and memory persistence have zero dependencies on each other. They can be built in parallel or sequentially depending on capacity.
- **Phase 1 must come first in the WhatsApp track** because every subsequent WhatsApp phase depends on the ChannelProvider existing and Baileys being correctly configured.
- **Phase 5 depends on both tracks** -- identity mapping needs channels to be standardized (Phase 3) and conversations to be persisted (Phase 4). The Memory Management UI needs persistent data to display.
- **Cleanup (Phase 3) before integration (Phase 5)** -- removing legacy WhatsApp code before adding cross-channel identity mapping prevents the migration from touching dead code paths.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Baileys connection lifecycle edge cases (reconnect timing, disconnect reasons, "Bad MAC" recovery). The connection.update event handling has several undocumented edge cases. Test with actual WhatsApp server.
- **Phase 4:** FTS5 trigger-based sync vs manual INSERT performance. The memory service schema migration needs careful planning to not break existing memory data. Test FTS5 query performance with realistic conversation volumes.
- **Phase 5:** DmPairing extension for WhatsApp (phone-number-based linking vs code-based linking). The existing DmPairingManager may need architectural changes for WhatsApp's identity model.

Phases with standard patterns (skip research-phase):
- **Phase 2:** QR code display and tRPC polling are straightforward UI work following existing patterns in integrations.tsx.
- **Phase 3:** Code removal and consolidation following the existing ChannelManager pattern. Well-understood refactoring.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 2 new dependencies. Baileys is the clear choice over whatsapp-web.js. FTS5 is built-in. Multiple sources corroborate. |
| Features | MEDIUM | Feature set is well-defined with clear dependency graph. WhatsApp ban risk lowers confidence on long-term viability. |
| Architecture | HIGH | Direct codebase analysis of existing channel + memory systems. Patterns are proven across 5 channels. Two-track independence confirmed by dependency analysis. |
| Pitfalls | HIGH | Well-documented failure modes from multiple GitHub issue threads. Baileys auth state and echo loop pitfalls have verified solutions. |

**Overall confidence:** MEDIUM-HIGH

The architecture and implementation patterns are well-understood. The primary uncertainty is external: WhatsApp's unofficial API stability and Meta's ban enforcement. This is an inherent risk of unofficial API integration, not a gap in research.

### Gaps to Address

- **Baileys v6 vs v7 API differences**: STACK.md recommends v6.7.21 (stable), ARCHITECTURE.md references v7 patterns in some code examples. Reconcile during Phase 1 planning -- pin to v6.7.21 and verify all code examples match that version's API.
- **Auth state: Redis vs SQLite disagreement**: STACK.md recommends SQLite-backed auth state, ARCHITECTURE.md recommends Redis-backed auth state. **Recommendation: Use Redis** -- it is already the state store for all Baileys-adjacent data in the codebase, and the ChannelManager infrastructure already depends on it.
- **Kimi embedding rate limits at scale**: Untested how many embedding calls per minute Kimi API allows. This affects conversation summary embedding throughput in Phase 4. Mitigation: batch and rate-limit embedding generation, rely on FTS5 as primary search.
- **WhatsApp group message content in Baileys 6.x**: FEATURES.md notes known issues with group message content not being passed in some versions. Verify during Phase 1 implementation.
- **Memory service schema migration**: Existing conversations table in memory.db may have data. Migration path needs careful planning to not lose existing memories.

## Sources

### Primary (HIGH confidence)
- [Baileys GitHub (WhiskeySockets)](https://github.com/WhiskeySockets/Baileys) -- connection lifecycle, auth state, message handling
- [Baileys Documentation](https://baileys.wiki/docs/intro/) -- configuration, QR flow, connecting
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html) -- query syntax, BM25 ranking, external content tables
- [better-sqlite3 FTS5 confirmation (GitHub #1253)](https://github.com/WiseLibs/better-sqlite3/issues/1253) -- FTS5 compiled by default
- Direct codebase analysis: `channels/types.ts`, `channels/index.ts`, `channels/telegram.ts`, `daemon.ts`, `memory/src/index.ts`

### Secondary (MEDIUM confidence)
- [npm: baileys](https://www.npmjs.com/package/baileys) -- version history, v6.7.21 latest stable
- [Baileys Redis Auth pattern](https://github.com/hbinduni/baileys-redis-auth) -- Redis auth state reference
- [whatsapp-web.js GitHub issues (#3812, #3224, #3459, #5817)](https://github.com/pedroslopez/whatsapp-web.js/issues) -- session and memory failure modes
- [CSO Online: malicious Baileys fork "lotusbail"](https://www.csoonline.com/article/4111068/whatsapp-api-worked-exactly-as-promised-and-stole-everything.html) -- supply chain attack documentation
- [Meta WhatsApp AI chatbot ban policy 2026](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban) -- ban risk assessment

### Tertiary (LOW confidence)
- [sqlite-vec](https://github.com/asg017/sqlite-vec) -- optional future enhancement for vector indexing, not needed for v25.0
- [Mem0 Architecture](https://mem0.ai/) -- memory layer patterns, graph vs vector comparison
- WhatsApp ban avoidance heuristics -- community knowledge, no official documentation from Meta

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
