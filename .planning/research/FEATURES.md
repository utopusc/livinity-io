# Feature Landscape: v25.0 WhatsApp Integration & Cross-Session Memory

**Domain:** WhatsApp messaging channel + persistent cross-session AI memory for self-hosted AI server OS
**Researched:** 2026-04-02
**Overall Confidence:** MEDIUM (Baileys docs + existing codebase audit + WebSearch on memory patterns; WhatsApp unofficial library risk lowers confidence)

## Existing Infrastructure (Already Built)

Before listing features to build, here is what the codebase already provides:

| Existing Capability | Where | Status |
|---------------------|-------|--------|
| ChannelManager with 5 providers (Telegram, Discord, Slack, Matrix, Gmail) | `nexus/packages/core/src/channels/index.ts` | Working, well-abstracted |
| ChannelProvider interface (init, connect, disconnect, getStatus, sendMessage, onMessage, updateConfig, testConnection) | `nexus/packages/core/src/channels/types.ts` | Clean contract |
| Redis pub/sub config update subscription (`nexus:channel:updated`) | `channels/index.ts:54-97` | Auto-reconnect on config change |
| WhatsApp inbox processing in Daemon (`source === 'whatsapp'`) | `nexus/packages/core/src/daemon.ts:372-510` | Working but NOT using ChannelProvider pattern |
| WhatsApp conversation history (Redis lists, 24h TTL, 40 entries) | `daemon.ts:3323-3386` (getWhatsAppHistory, saveWhatsAppTurn) | Working but ephemeral |
| WhatsApp response delivery (outbox + polling channel pattern) | `daemon.ts:3231-3282` (sendWhatsAppResponse) | Working with chunking |
| WhatsApp send tool (`whatsapp_send`, conditional registration) | `daemon.ts:1658-1708` | Gated behind `channels.whatsapp.enabled` |
| Channel history for Telegram/Discord/etc (Redis, 24h TTL, 20 entries) | `daemon.ts:3388-3429` (getChannelHistory, saveChannelTurn) | Working but ephemeral |
| Memory service (SQLite + Kimi embeddings, semantic search, dedup, time-decay scoring) | `nexus/packages/memory/src/index.ts` (port 3300) | Working, v2.1.0 |
| Memory: conversations table (id, user_id, summary, message_count) | memory service schema | Schema exists, not fully utilized |
| Memory: memory_sessions table (links memories to sessions) | memory service schema | Schema exists |
| Memory: /add, /search, /context, /memories/:userId, /reset, /stats endpoints | memory service REST API | All working |
| Conversation persistence in Web UI (Redis + localStorage) | `agent-session.ts`, `ai-chat/index.tsx` | Tab close/reopen restore |
| Conversation sidebar with listing | `ai-chat/index.tsx:169` (listConversations) | Working for Web UI only |
| Settings > Integrations page (4-tab layout: Telegram, Discord, Slack, Matrix) | `livos/packages/ui/src/routes/settings/integrations.tsx` | Working, extensible |
| Baileys v6.7+ in package-lock.json | `nexus/package-lock.json` | Installed but no `packages/whatsapp/` directory exists |
| IncomingMessage type with channel, chatId, userId, userName, text, timestamp | `channels/types.ts:36-46` | Standard message contract |
| ChannelId type: `'telegram' \| 'discord' \| 'slack' \| 'matrix' \| 'gmail'` | `channels/types.ts:7` | Needs 'whatsapp' addition |
| CHANNEL_META with name, color, textLimit per channel | `channels/types.ts:88-94` | Needs WhatsApp entry |
| Intent Router with channel context injection (`__history` param) | `daemon.ts:473-474, 1059-1061` | Injects chat history into task prefix |
| DM Pairing Manager (Telegram-specific) | `channels/telegram.ts:4` | Pattern for user identity linking |
| Agent system prompt mentions WhatsApp | `agent-session.ts:136`, `agent.ts:167,208,227` | Already expects WhatsApp as a channel |

**Key architectural gap:** WhatsApp currently operates through a separate, ad-hoc pattern in daemon.ts (Redis inbox/outbox with JID-based routing) rather than through the ChannelManager/ChannelProvider abstraction that all other channels use. The `packages/whatsapp/` directory referenced in scripts does not exist. This means WhatsApp lacks the standardized init/connect/disconnect/getStatus/updateConfig lifecycle, QR code auth via UI, and consistent message routing that other channels enjoy.

**Key memory gap:** Conversation history is ephemeral (Redis with 24h TTL) across all channels. The Memory service stores extracted facts/knowledge but not raw conversation turns. There is no way for the AI to search past conversations across sessions or channels -- it can only recall manually-extracted "memories" from the current SQLite store. The `conversations` table in the memory DB schema exists but is not actively populated.

---

## Table Stakes

Features users expect when adding WhatsApp as a channel and claiming "cross-session memory." Missing these = product feels incomplete.

### TS-01: WhatsApp ChannelProvider (Unified Architecture)

| Attribute | Value |
|-----------|-------|
| **Why Expected** | Every other channel (Telegram, Discord, Slack, Matrix, Gmail) follows the ChannelProvider pattern. WhatsApp operating through ad-hoc daemon.ts code is a maintenance liability and prevents consistent behavior (status reporting, config updates, test connection). Users expect "add WhatsApp" to work exactly like "add Telegram." |
| **Complexity** | MEDIUM |
| **Depends On** | Nothing (foundational) |
| **Depends On (existing)** | ChannelProvider interface, ChannelManager, Baileys library |

**What to build:**
- Create `nexus/packages/core/src/channels/whatsapp.ts` implementing `ChannelProvider`
- Add `'whatsapp'` to `ChannelId` union type in `types.ts`
- Add WhatsApp to `CHANNEL_META` (name: 'WhatsApp', color: '#25D366', textLimit: 65536)
- Register WhatsApp provider in `ChannelManager` constructor
- Move Baileys `makeWASocket` initialization into `connect()` method
- Use `useMultiFileAuthState` for credential persistence at `/opt/nexus/data/whatsapp-auth/`
- Implement `getStatus()` returning connection state, phone number, QR code pending status
- Implement `updateConfig()` with disconnect/reconnect cycle
- Implement `disconnect()` that cleanly closes WebSocket
- Implement `testConnection()` that verifies socket is open and authenticated
- Route incoming messages through `onMessage()` handler (same as other channels)
- Remove ad-hoc WhatsApp code from daemon.ts, replacing with ChannelManager calls

**Confidence:** HIGH -- the ChannelProvider interface is well-defined and the pattern is proven across 5 existing channels.

### TS-02: QR Code Authentication via Web UI

| Attribute | Value |
|-----------|-------|
| **Why Expected** | WhatsApp Web requires QR code scanning. Baileys currently prints QR to terminal. For a web-based server OS, users expect to see and scan the QR code in the Settings UI, not SSH into the server. Every WhatsApp web gateway (WAHA, go-whatsapp-web-multidevice) exposes QR via web UI. |
| **Complexity** | MEDIUM |
| **Depends On** | TS-01 (WhatsApp ChannelProvider) |

**What to build:**
- WhatsApp provider emits QR code string via Redis pub/sub (`nexus:whatsapp:qr`) when Baileys fires `connection.update` with `qr` field
- New tRPC subscription `channels.whatsappQr` that streams QR code updates to the UI
- React component in Settings > Integrations > WhatsApp tab displaying QR code using `qrcode.react` (SVG rendering, well-maintained library, 3M+ weekly npm downloads)
- QR code auto-refreshes on Baileys timeout (every ~20 seconds until scanned)
- Visual states: "Scan QR Code" -> "Connecting..." -> "Connected as +XX XXX" with phone number display
- After successful scan, show connection status card (phone number, last seen, connected since)
- "Disconnect" button to log out the WhatsApp session (clears auth state)

**Confidence:** HIGH -- Baileys emits QR as string in `connection.update` event; `qrcode.react` is the standard React QR renderer.

### TS-03: WhatsApp Connection Status & Reconnection

| Attribute | Value |
|-----------|-------|
| **Why Expected** | WhatsApp connections drop frequently (phone goes offline, WhatsApp updates, network issues). Users need to see the connection state at a glance and trust that reconnection happens automatically. |
| **Complexity** | LOW |
| **Depends On** | TS-01, TS-02 |

**What to build:**
- Baileys `connection.update` events mapped to ChannelStatus: `open` -> connected, `close` with `lastDisconnect.error` -> check `DisconnectReason` for reconnectability
- Auto-reconnect on recoverable disconnects (exponential backoff, max 5 retries)
- On `DisconnectReason.loggedOut` (status code 401): clear auth state, show "QR scan needed" in UI
- Status badge in Settings > Integrations showing green/yellow/red connection state
- Redis key `nexus:whatsapp:status` with JSON status for cross-process visibility
- Optional: WhatsApp status in the sidebar/header of AI Chat when channel is active

**Confidence:** HIGH -- Baileys disconnect/reconnect patterns are well-documented. Existing Telegram provider handles identical lifecycle.

### TS-04: Cross-Session Conversation Persistence

| Attribute | Value |
|-----------|-------|
| **Why Expected** | Current conversation history has a 24h TTL in Redis and is limited to 20-40 entries. Users expect their AI assistant to remember conversations from last week, not just the current session. "What did we discuss about the server migration?" should work days later. Every modern AI assistant (ChatGPT, Claude, Gemini) maintains conversation history across sessions. |
| **Complexity** | HIGH |
| **Depends On** | Existing Memory service, existing conversation tables |

**What to build:**
- **Conversation store table** in the Memory service SQLite DB: expand existing `conversations` table or create `conversation_messages` table with columns: `id`, `conversation_id`, `user_id`, `channel` (web/telegram/whatsapp/discord/slack/matrix), `channel_chat_id`, `role` (user/assistant/system), `content`, `metadata` (JSON -- tool calls, attachments, etc.), `created_at`
- **Conversation save hook**: After each agent turn (both Web UI and channel messages), persist the user message + assistant response to SQLite via Memory service REST API
- New endpoint `POST /conversations/save` that stores a full turn (user msg + response + metadata)
- New endpoint `GET /conversations/:userId` returning paginated conversation list with summaries
- New endpoint `POST /conversations/search` with semantic search across all stored conversations
- **Embeddings for conversation turns**: Generate embeddings for each conversation turn and store in a `conversation_embeddings` column for semantic search
- Keep Redis as hot cache for current-session context (fast reads for active conversations) but write-through to SQLite for persistence
- TTL on Redis conversation cache can remain 24h; SQLite is the source of truth for historical queries

**Confidence:** MEDIUM -- Architecture pattern is sound (write-through cache + persistent store). Complexity is in the migration of existing Redis-only flows and ensuring no regression in real-time performance.

### TS-05: AI Conversation Search Tool

| Attribute | Value |
|-----------|-------|
| **Why Expected** | The whole point of cross-session memory is that the AI can recall past conversations. Users will say "what did I ask you about Docker last Tuesday?" and expect a meaningful answer. This requires a tool the AI can invoke to search conversation history. |
| **Complexity** | MEDIUM |
| **Depends On** | TS-04 (conversation persistence) |

**What to build:**
- New tool `conversation_search` registered in ToolRegistry
- Parameters: `query` (string, the search query), `channel` (optional filter: 'web'/'telegram'/'whatsapp'/etc.), `days_back` (optional, default 30), `limit` (optional, default 10)
- Implementation: Call Memory service `POST /conversations/search` with semantic query
- Return format: list of matching conversation snippets with date, channel, and relevance score
- AI system prompt enhancement: add instruction that the AI can search past conversations using this tool when the user asks about previous discussions
- Distinct from existing `memory` tools: memories are extracted facts; conversation search returns actual dialogue history

**Confidence:** HIGH -- follows existing ToolRegistry pattern exactly. The Memory service search infrastructure (embeddings + cosine similarity + time-decay) already works.

### TS-06: Unified Channel userId Mapping

| Attribute | Value |
|-----------|-------|
| **Why Expected** | The same person messaging from WhatsApp and the Web UI appears as two different users. The AI should recognize that phone number +1234567890 on WhatsApp is the same user logged in via the Web UI. Without this, cross-session memory is fragmented per channel. |
| **Complexity** | MEDIUM |
| **Depends On** | TS-04 (conversation persistence) |

**What to build:**
- **User identity mapping table** in PostgreSQL (not SQLite -- this is part of the user system): `channel_identities` with columns `id`, `livos_user_id` (FK to users table), `channel` (whatsapp/telegram/discord/etc.), `channel_user_id` (JID, Telegram ID, Discord ID), `display_name`, `linked_at`
- **Auto-linking**: When a user sends a message from WhatsApp for the first time, create an unlinked identity record. Admin can link it to a LivOS user via Settings UI.
- **DM Pairing enhancement**: Extend the existing DmPairingManager (currently Telegram-only) to work across all channels. User sends a pairing code from LivOS Web UI, enters it in WhatsApp/Telegram, identities get linked.
- **Conversation routing**: When persisting conversations, resolve channel_user_id to livos_user_id if linked. Unlinked identities still get their own conversation history but can be merged later.
- Memory service and conversation search use `livos_user_id` when available, falling back to `channel:channel_user_id` composite key

**Confidence:** MEDIUM -- the concept is straightforward but the migration path and edge cases (what happens to existing unlinked conversations when linking occurs) require careful design.

---

## Differentiators

Features that set Livinity apart. Not required for functional completeness, but create significant user value.

### DF-01: Memory Management UI in Settings

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Users want visibility into what their AI remembers. This is a trust-building feature -- "what does it know about me?" Privacy control is becoming a market differentiator (Claude's memory management UI, ChatGPT's "Manage Memory" panel). For a self-hosted product, full control over stored data is a core selling point. |
| **Complexity** | MEDIUM |
| **Depends On** | TS-04 (conversation persistence), existing Memory service |

**What to build:**
- New Settings page: **Settings > Memory** (or Settings > AI Memory)
- **Memories tab**: List all extracted memories with search, pagination. Each memory shows content, creation date, source session. Delete individual memories. "Clear All" button.
- **Conversations tab**: List all persisted conversations with date, channel icon, message count, summary preview. Click to expand and view full conversation. Delete individual conversations.
- **Search tab**: Full-text and semantic search across both memories and conversations. Results grouped by type (memory vs conversation).
- **Stats panel**: Total memories, total conversations, database size, oldest/newest entries
- Uses existing Memory service REST endpoints (/memories/:userId, /search, /reset)
- Needs new endpoint for listing conversations with summaries

**Confidence:** HIGH -- straightforward CRUD UI against existing REST API. Similar to the Capabilities panel pattern.

### DF-02: Automatic Memory Extraction from All Channels

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | Currently memory extraction only happens during Web UI agent sessions. WhatsApp/Telegram conversations generate valuable information (user preferences, decisions, project context) that should be automatically captured. "I told the AI on WhatsApp that I prefer Python over JavaScript" should be remembered even when chatting on the Web UI later. |
| **Complexity** | LOW |
| **Depends On** | TS-01 (WhatsApp ChannelProvider), TS-04 (conversation persistence) |

**What to build:**
- After each channel message turn (WhatsApp, Telegram, Discord, etc.), submit the conversation turn to the existing BullMQ memory extraction pipeline
- Reuse existing memory extraction logic (LLM summarizes key facts from the conversation)
- Tag extracted memories with source channel for provenance tracking
- Memory extraction should be async (BullMQ job) to not block message response delivery
- Rate-limit extraction: not every "hi" or "ok" needs memory processing; apply minimum message length or content significance filter

**Confidence:** HIGH -- BullMQ memory extraction pipeline already exists. This is wiring, not new architecture.

### DF-03: WhatsApp Group Support

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | The AI can participate in WhatsApp group chats when mentioned or triggered. Family/team groups can interact with the AI collectively. This extends the AI from a 1:1 assistant to a group resource. |
| **Complexity** | MEDIUM |
| **Depends On** | TS-01 (WhatsApp ChannelProvider) |

**What to build:**
- Baileys handles group messages via same `messages.upsert` event with `key.remoteJid` ending in `@g.us`
- Trigger modes: mention-based (AI responds when @mentioned or name mentioned), prefix-based (`!ai` or `/nexus`), or always-respond (configurable per group)
- Group context: include sender name in conversation context so AI knows who said what
- Rate limiting: max responses per minute per group to prevent spam
- Admin-configurable: which groups the AI participates in (allowlist in Settings)
- Group discovery: list available groups in Settings panel for easy selection

**Confidence:** MEDIUM -- Baileys group message handling works but there are known issues with v7 RC (group message content not being passed). Verify with current Baileys version.

### DF-04: Conversation Context Continuity Across Channels

| Attribute | Value |
|-----------|-------|
| **Value Proposition** | User starts a conversation on the Web UI, then continues it on WhatsApp from their phone. The AI seamlessly picks up where they left off. This "omnichannel" experience is what enterprise systems aspire to and what self-hosted AI can deliver without privacy trade-offs. |
| **Complexity** | HIGH |
| **Depends On** | TS-04 (conversation persistence), TS-06 (unified userId) |

**What to build:**
- When the AI receives a message from a linked user on any channel, fetch recent conversation context from ALL channels (not just the current one)
- Context budget: limit total injected context to ~2000 tokens (existing Memory service /context endpoint already supports token budgets)
- Context priority: most recent messages first, regardless of channel
- Optional: explicit channel switch detection -- "I was just talking to you on the Web UI about..." triggers cross-channel context lookup

**Confidence:** MEDIUM -- requires unified userId to be solved first (TS-06). The context assembly is straightforward once user identity is resolved.

---

## Anti-Features

Features that seem appealing but create problems. Explicitly NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **WhatsApp Business API integration** | "Official API, no ban risk" | Requires Meta Business verification, BSP partnership, per-message costs, no self-hosting. Defeats the entire value proposition of Livinity as a self-hosted, privacy-first platform. | Use Baileys (unofficial but self-hosted). Accept ban risk for personal use. Document risk clearly in Settings UI. |
| **Multi-account WhatsApp** | "Connect multiple WhatsApp numbers" | Massively increases complexity (multi-socket, multi-auth state, routing ambiguity). Single account is the standard personal use case. | Support one WhatsApp account per LivOS instance. Additional accounts can be added in future versions if demand exists. |
| **WhatsApp media message AI analysis** | "AI should understand photos/videos sent via WhatsApp" | Baileys media handling requires downloading encrypted media, decrypting, converting formats. Adds significant complexity and storage requirements. Vision models add cost per message. | Phase 1: text-only. Phase 2: image support can be added later by downloading media and passing to multimodal provider. Document as future enhancement. |
| **Real-time conversation sync to external services** | "Sync conversations to Notion/Google Docs" | Scope creep. Export is a separate feature set. Adds third-party API dependencies. | Provide conversation export (JSON/CSV) from Memory Management UI. External sync can be a community skill. |
| **Full message history import from WhatsApp** | "Import all my WhatsApp chat history" | WhatsApp chat exports are complex (multi-format, media references, different phone formats). Low value vs effort. | Start fresh from connection point. Users can manually share important context with the AI. |
| **Automatic memory for every single message** | "Remember everything I ever said" | Creates massive storage bloat, low signal-to-noise ratio. Embedding every "ok" and "lol" wastes resources and degrades search quality. | Use significance filtering: minimum message length (>20 chars), exclude pure acknowledgments, rate-limit to max N extractions per hour. |
| **Graph-based memory (like mem0 v2)** | "Graph memory captures relationships better" | Significantly more complex than vector search. Requires a graph database (Neo4j or similar). The current SQLite + embeddings approach is adequate for personal AI use. | Vector-based semantic search with SQLite. Revisit graph memory when user base and data volume justify the complexity. |

---

## Feature Dependencies

```
TS-01: WhatsApp ChannelProvider
    +-- TS-02: QR Code Auth UI (needs provider to emit QR events)
    |     +-- TS-03: Connection Status & Reconnect (needs QR flow complete)
    +-- DF-02: Auto Memory Extraction (needs standardized message flow)
    +-- DF-03: Group Support (needs provider message handling)

TS-04: Cross-Session Persistence
    +-- TS-05: AI Conversation Search Tool (needs persistent store to search)
    +-- TS-06: Unified userId Mapping (informs how conversations are stored)
    |     +-- DF-04: Cross-Channel Continuity (needs unified identity)
    +-- DF-01: Memory Management UI (needs persistent data to display)

TS-01 ──independent──> TS-04 (no dependency between WhatsApp and memory tracks)
DF-02 ──requires──> TS-01 + TS-04 (needs both WhatsApp messages and persistent store)
```

### Dependency Notes

- **TS-01 and TS-04 are independent tracks**: WhatsApp channel integration and cross-session memory can be built in parallel. This is a significant advantage for phase planning.
- **TS-02 requires TS-01**: QR code display needs the WhatsApp provider to be emitting QR events.
- **TS-05 requires TS-04**: Cannot search conversations that are not persistently stored.
- **TS-06 enhances TS-04**: userId mapping improves conversation search but is not strictly required for basic persistence (conversations can be stored with channel-specific IDs initially).
- **DF-04 requires TS-06**: Cross-channel continuity is meaningless without unified user identity.
- **DF-02 bridges both tracks**: Automatic memory extraction from WhatsApp needs both the standardized message flow (TS-01) and the persistent store (TS-04).

---

## MVP Definition

### Launch With (v25.0 Core)

Minimum viable: WhatsApp works as a proper channel, conversations persist across sessions.

- [x] **TS-01: WhatsApp ChannelProvider** -- foundational, unblocks everything WhatsApp
- [x] **TS-02: QR Code Auth UI** -- users cannot use WhatsApp without this
- [x] **TS-03: Connection Status** -- essential UX for a flaky-connection channel
- [x] **TS-04: Cross-Session Persistence** -- foundational, unblocks search and UI
- [x] **TS-05: AI Conversation Search Tool** -- the user-facing payoff of persistence
- [x] **DF-01: Memory Management UI** -- needed for trust and debugging (Settings page)

### Add After Validation (v25.x)

Features to add once core WhatsApp and memory work reliably.

- [ ] **TS-06: Unified userId Mapping** -- add when multiple users actively use multiple channels
- [ ] **DF-02: Auto Memory Extraction** -- add after confirming persistence works correctly
- [ ] **DF-03: WhatsApp Group Support** -- add after solo WhatsApp is stable
- [ ] **DF-04: Cross-Channel Continuity** -- add after userId mapping is in place

### Future Consideration (v26+)

- [ ] **WhatsApp media analysis** -- when multimodal channel support is prioritized
- [ ] **Graph-based memory** -- when data volume justifies complexity
- [ ] **Conversation export/import** -- when users request data portability
- [ ] **WhatsApp voice message transcription** -- would require audio-to-text pipeline

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-01: WhatsApp ChannelProvider | HIGH | MEDIUM | P1 |
| TS-02: QR Code Auth UI | HIGH | MEDIUM | P1 |
| TS-03: Connection Status | MEDIUM | LOW | P1 |
| TS-04: Cross-Session Persistence | HIGH | HIGH | P1 |
| TS-05: AI Conversation Search | HIGH | MEDIUM | P1 |
| TS-06: Unified userId Mapping | MEDIUM | MEDIUM | P2 |
| DF-01: Memory Management UI | MEDIUM | MEDIUM | P1 |
| DF-02: Auto Memory Extraction | MEDIUM | LOW | P2 |
| DF-03: WhatsApp Group Support | LOW | MEDIUM | P2 |
| DF-04: Cross-Channel Continuity | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v25.0 launch -- core WhatsApp + memory features
- P2: Should have, add in v25.x after core is stable
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | ChatGPT | Claude | Home Assistant | OpenClaw | Our Approach (Livinity) |
|---------|---------|--------|----------------|----------|------------------------|
| WhatsApp integration | No (cloud only) | No (cloud only) | Yes (via notify) | Yes (Baileys) | Yes (Baileys, ChannelProvider pattern) |
| QR auth in web UI | N/A | N/A | N/A | Terminal QR only | Web UI QR code in Settings |
| Cross-session memory | Yes (auto) | Yes (user-controlled) | No | Partial (cognee) | Yes (SQLite + embeddings, user-controllable) |
| Conversation search | No explicit search tool | No explicit search tool | N/A | No | AI tool for semantic conversation search |
| Memory management UI | Basic "Manage Memory" | Memory panel (view/delete) | N/A | No | Full Settings page (search, view, delete, stats) |
| Cross-channel identity | N/A (single channel) | N/A (single channel) | User-based | No | userId mapping across channels |
| Self-hosted | No | No | Yes | Yes | Yes (privacy advantage) |
| Unified conversation store | Cloud-hosted | Cloud-hosted | No | Partial | SQLite per-instance, full ownership |

**Key competitive advantages:**
1. Self-hosted conversation data (privacy) -- ChatGPT/Claude store on their servers
2. Multi-channel with unified identity -- no competitor offers this in self-hosted
3. AI can actively search past conversations (tool-based, not just passive recall)
4. Full memory management with delete/search/export (GDPR-ready by design)

---

## Sources

- [Baileys GitHub (WhiskeySockets)](https://github.com/WhiskeySockets/Baileys) -- library docs, migration guide
- [Baileys Documentation Wiki](https://baileys.wiki/docs/intro/) -- v7 documentation
- [Baileys v7 Migration Guide](https://baileys.wiki/docs/migration/to-v7.0.0/) -- breaking changes
- [whatsapp-web.js vs Baileys comparison (LibHunt)](https://www.libhunt.com/compare-Baileys-vs-whatsapp-web.js) -- protocol vs browser approach
- [qrcode.react npm](https://www.npmjs.com/package/qrcode.react) -- React QR code component
- [Mem0 Architecture](https://mem0.ai/) -- memory layer patterns, semantic search
- [State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) -- graph vs vector memory, industry trends
- [Meta Blocks Third-Party AI Chatbots 2026](https://chatboq.com/blogs/third-party-ai-chatbots-ban) -- WhatsApp ban risk for unofficial bots
- [WhatsApp Business API vs Unofficial](https://wisemelon.ai/blog/whatsapp-business-api-vs-unofficial-whatsapp-tools) -- risk assessment
- [Oracle: Agent Memory Architecture](https://blogs.oracle.com/developers/agent-memory-why-your-ai-has-amnesia-and-how-to-fix-it) -- memory types and patterns
- Codebase audit: `nexus/packages/core/src/channels/`, `nexus/packages/memory/src/index.ts`, `nexus/packages/core/src/daemon.ts`

---
*Feature research for: v25.0 WhatsApp Integration & Cross-Session Memory*
*Researched: 2026-04-02*
