# Architecture Patterns: v25.0 WhatsApp + Cross-Session Memory

**Domain:** WhatsApp channel integration + cross-session AI memory for LivOS
**Researched:** 2026-04-02
**Confidence:** HIGH (based on direct codebase analysis of existing channel + memory systems, Baileys documentation, SQLite FTS5 docs)

## Recommended Architecture

Two independent tracks that converge at the message processing layer:

```
Track A: WhatsApp Channel                Track B: Cross-Session Memory
========================                ===========================

[WhatsApp Phone]                        [Any Channel Message]
     |                                       |
     v                                       v
[Baileys WebSocket]                     [ChannelManager.onMessage()]
     |                                       |
     v                                       v
[WhatsAppProvider]                      [Daemon message handler]
  implements ChannelProvider                 |
     |                                       +---> [Redis hot cache (24h TTL)]
     +---> [ChannelManager]                  +---> [Memory service: conversations_archive (SQLite)]
     |          |                            +---> [Memory service: FTS5 index (SQLite)]
     |          v                            +---> [BullMQ: memory extraction job]
     |     [Daemon message handler]
     |                                  [AI Tool: conversation_search]
     +---> [Redis: QR code, auth, status]        |
                                             v
                                        [Memory service: POST /conversations/search]
                                             |
                                             v
                                        [FTS5 MATCH + BM25 + optional semantic rerank]
```

### Architecture Decision: Baileys over whatsapp-web.js

**Use `@whiskeysockets/baileys` v7.x** (not whatsapp-web.js).

| Criterion | Baileys | whatsapp-web.js |
|-----------|---------|-----------------|
| Memory usage | ~50MB | 300-600MB (Puppeteer) |
| Startup time | <1s | 5-10s |
| Browser dependency | None (pure WebSocket) | Chromium required |
| TypeScript | Native TS types | JS with @types |
| Multi-device | Native MD support | MD support |
| Server fit | Headless, lightweight | Heavy, browser process |
| Ban risk | Higher recently | Slightly lower per reports |

Baileys is the right choice for a self-hosted server OS because it runs headless with minimal resources. The server environment has no display, making Puppeteer-based whatsapp-web.js wasteful and complex.

**Confidence: HIGH** - Baileys is the dominant choice for Node.js headless WhatsApp integration. The pure WebSocket approach aligns with how LivOS already handles Telegram (grammy) and Discord (discord.js).

### Architecture Decision: Redis Auth State (not SQLite, not file-based)

**Use Redis-backed auth state** for Baileys session persistence.

Rationale: The codebase already uses Redis for ALL Baileys-adjacent data (wa_outbox, wa_history, wa_contacts, wa_pending, channel configs, channel statuses). Baileys auth keys are small (~100 keys) and need atomic reads/writes. Redis pipeline operations make this fast. Using SQLite would introduce a second persistence layer for WhatsApp when Redis already handles everything else.

**Confidence: HIGH** - Validated by existing `baileys-redis-auth` npm package and community patterns. Baileys documentation explicitly warns against file-based auth.

### Architecture Decision: FTS5 Primary + Embedding Rerank for Conversation Search

**Use SQLite FTS5 as primary search, with optional Kimi embedding reranking on top results.**

Rationale: The memory service already uses `better-sqlite3` (FTS5 compiled in by default). FTS5 with BM25 ranking handles "what did we talk about Docker" queries in <5ms for typical self-hosted volumes. Embedding every message is wasteful (Kimi API rate limits, "ok" and "thanks" don't need embeddings). Instead: FTS5 for keyword search, embed only conversation summaries for optional semantic reranking on top-N FTS results.

**Confidence: MEDIUM** - FTS5 pattern is proven in SQLite ecosystem. The hybrid approach (FTS5 primary + embedding rerank) is well-documented but the specific Kimi embedding performance at scale is untested.

---

## Component Boundaries

### New Components

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| `WhatsAppProvider` | `nexus/packages/core/src/channels/whatsapp.ts` | Baileys socket lifecycle, QR code emission, message send/receive | ChannelManager, Redis, Daemon inbox |
| `WhatsAppAuthStore` | `nexus/packages/core/src/channels/whatsapp-auth.ts` | Redis-backed auth state for Baileys (replaces useMultiFileAuthState) | Redis |
| `ConversationArchiver` | `nexus/packages/memory/src/archiver.ts` | Archives channel conversation turns to SQLite + FTS5 | Redis, SQLite memory.db, Kimi API (summaries) |
| `ConversationSearchEndpoint` | `nexus/packages/memory/src/index.ts` (new routes) | `/conversations/search` + `/conversations/messages` APIs | SQLite memory.db |
| WhatsApp Settings Panel | `livos/packages/ui/src/routes/settings/integrations.tsx` (extend) | QR code display, connection status, reconnect/disconnect | tRPC routes |
| Memory Management Panel | `livos/packages/ui/src/routes/settings/memory.tsx` (new) | View, search, delete stored memories + conversation history | tRPC routes, memory service |
| `conversation_search` tool | `nexus/packages/core/src/daemon.ts` (registerTools) | AI tool to search past conversations | Memory service /conversations/search |
| `UserIdentityMapper` | `nexus/packages/core/src/user-identity.ts` (new) | Maps channel-specific IDs (Telegram userId, WA JID) to canonical LivOS userId | Redis, PostgreSQL |

### Modified Components

| Component | File | Change | Impact |
|-----------|------|--------|--------|
| `ChannelId` type | `channels/types.ts` | Add `'whatsapp'` to union type | Type system, all channel switches |
| `CHANNEL_META` | `channels/types.ts` | Add WhatsApp entry `{ name: 'WhatsApp', color: '#25D366', textLimit: 65536 }` | Channel metadata registry |
| `ChannelManager` constructor | `channels/index.ts` | `this.providers.set('whatsapp', new WhatsAppProvider())` | Auto-init on startup |
| `ChannelManager.subscribeToConfigUpdates` | `channels/index.ts` | Handle WhatsApp-specific config actions (pair, disconnect) | QR re-pairing flow |
| `Daemon.processInboxItem` | `daemon.ts` | Add 'whatsapp' to `realtimeSources` array (line 555) | Real-time processing (not queued) |
| `Daemon.sendWhatsAppResponse` | `daemon.ts` | Route through `sendChannelResponse` instead of wa_outbox | Consolidate dual routing |
| `Daemon.registerTools` | `daemon.ts` | Add `conversation_search` tool registration | AI can search past conversations |
| `Daemon.cycle` | `daemon.ts` | Remove separate WhatsApp inbox polling | Clean up legacy code |
| Memory extraction worker | `index.ts` | Also call conversation archiver after extraction | Cross-session persistence |
| Settings Integrations UI | `settings/integrations.tsx` | Add WhatsApp tab (5th tab in grid) | User-facing config |
| tRPC routes | `ai/routes.ts` | Add WhatsApp QR polling + memory management endpoints | API layer |
| `Intent.source` | `router.ts` | Already includes 'whatsapp' | **No change needed** |
| nexus-core `package.json` | `packages/core/package.json` | Add @whiskeysockets/baileys, qrcode, @types/qrcode | Dependencies |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| `TelegramProvider` | Already correct ChannelProvider implementation |
| `DiscordProvider` | Already correct ChannelProvider implementation |
| `AgentSessionManager` | Web UI sessions are independent path |
| `ws-agent.ts` | WebSocket agent handler for browser only |
| `Brain` / `ProviderManager` | AI provider layer unchanged |
| `DmPairingManager` | Already supports any channel string, works with 'whatsapp' |

---

## Data Flow

### WhatsApp Message Flow (Inbound)

```
WhatsApp Cloud (WebSocket)
    |
    v
Baileys Socket (in WhatsAppProvider)
    |
    v ev.on('messages.upsert', { type: 'notify' })
WhatsAppProvider.handleMessages()
    |
    +--> Skip own messages (msg.key.fromMe)
    +--> Dedup via Redis (nexus:whatsapp:dedup:{msgId})
    +--> DmPairingManager.checkAndInitiatePairing('whatsapp', jid, name, chatId)
    |
    +--> Construct IncomingMessage {
    |      channel: 'whatsapp',
    |      chatId: jid,
    |      userId: jid (or normalized phone),
    |      userName: pushName,
    |      text: msg.message.conversation || extendedTextMessage.text,
    |      timestamp: msg.messageTimestamp * 1000,
    |      isGroup: jid.endsWith('@g.us'),
    |      groupName: from group metadata cache,
    |    }
    |
    v messageHandler callback (set by ChannelManager.onMessage)
Daemon.enqueueMessage({ source: 'whatsapp', from: jid, ... })
    |
    v processInboxItem (real-time path, line 558)
    |
    +--> getChannelHistory('whatsapp', jid) -> Redis hot cache
    +--> classify + execute agent
    +--> sendChannelResponse (through ChannelManager)
    +--> saveChannelTurn('whatsapp', jid, userMsg, response)
    +--> BullMQ: nexus-memory-extraction job (async)
```

### WhatsApp QR Code Flow

```
User opens Settings > Integrations > WhatsApp tab
    |
    v tRPC mutation: ai.saveIntegrationConfig({ channel: 'whatsapp', config: { enabled: true } })
    |
    v Redis publish: 'nexus:channel:updated' { channel: 'whatsapp' }
    |
    v ChannelManager receives pub/sub
    |
    v WhatsAppProvider.disconnect() then .connect()
    |
    v Baileys: makeWASocket({ auth: state, ... })
    |
    v connection.update event fires with { qr: 'data...' }
    |
    v WhatsAppProvider:
         await redis.set('nexus:whatsapp:qr', qrDataUrl, 'EX', 60)
         await redis.publish('nexus:whatsapp:qr_update', qrDataUrl)
    |
    v UI polls tRPC query: ai.getWhatsAppQR() every 2s
    |    -> reads from redis.get('nexus:whatsapp:qr')
    |    -> returns QR data URL or null (connected)
    |
    v UI renders <img src={qrDataUrl} /> or QR component
    |
    v User scans QR with WhatsApp phone
    |
    v connection.update { connection: 'open' }
    |
    v WhatsAppProvider:
         redis.del('nexus:whatsapp:qr')
         status = { enabled: true, connected: true, lastConnect: now }
         saveStatus()
    |
    v UI poll returns null QR + status.connected = true -> show "Connected" state
```

### WhatsApp Auth State Persistence (Redis)

```
Baileys events:
  creds.update -> WhatsAppAuthStore.saveCreds(creds)
  keys.set     -> WhatsAppAuthStore.setKeys(data) via Redis pipeline
  keys.get     -> WhatsAppAuthStore.getKeys(type, ids) via Redis mget

Redis key structure:
  nexus:wa:auth:creds                    -> JSON (credentials blob)
  nexus:wa:auth:keys:{type}:{id}         -> JSON (individual signal keys)
  TTL: none (persistent until logout)

On restart:
  WhatsAppAuthStore.loadState()
    -> redis.get('nexus:wa:auth:creds')
    -> If creds exist: reconnect silently (no QR needed)
    -> If no creds: set status to 'disconnected', wait for user to enable
```

### Cross-Session Memory Flow

```
Conversation turn completes (any channel)
    |
    +--> (EXISTING) BullMQ: nexus-memory-extraction queue
    |    Worker extracts facts -> POST /add to memory service
    |
    +--> (NEW) POST http://localhost:3300/conversations/messages
    |    {
    |      conversationId: 'conv_xxx',
    |      userId: 'admin' or livosUserId,
    |      channel: 'whatsapp' | 'telegram' | 'web' | ...,
    |      role: 'user' | 'assistant',
    |      content: 'message text',
    |      timestamp: Date.now()
    |    }
    |
    v Memory service inserts into conversation_messages + FTS5 index
    |
    v (Periodic background job, every 15 min)
    |  ConversationArchiver:
    |    - Scan conversations with >5 messages and no summary
    |    - Brain.think(haiku): generate 2-sentence summary
    |    - Embed summary via Kimi embeddings API
    |    - INSERT into conversations_archive { id, summary, embedding, ... }

AI search flow:
    User: "What did we discuss about Docker last week?"
    |
    v Agent calls conversation_search tool
    |  params: { query: "Docker last week", limit: 5 }
    |
    v POST http://localhost:3300/conversations/search
    |  { userId, query: "Docker", limit: 5, days: 7 }
    |
    v Memory service:
    |  1. FTS5 MATCH 'docker' on conversation_messages_fts
    |  2. Filter: user_id = ? AND timestamp > (now - 7 days)
    |  3. Rank by BM25 score
    |  4. Group by conversation, return top conversations with preview snippets
    |  5. (Optional) If semantic rerank enabled: embed query, cosine-sim on conversation summaries
    |
    v Returns: [{ conversationId, summary, channel, date, score, snippets }]
```

### Unified User Identity Flow

```
Message arrives from any channel
    |
    v UserIdentityMapper.resolve(channel, channelUserId)
    |
    +--> Redis cache: GET nexus:identity:whatsapp:905551234567@s.whatsapp.net
    |    If found: return cached livosUserId
    |
    +--> PostgreSQL: SELECT user_id FROM user_channel_identities
    |    WHERE channel = 'whatsapp' AND channel_user_id = '905551234567@s.whatsapp.net'
    |    If found: cache in Redis (24h TTL), return livosUserId
    |
    +--> If DmPairing approved:
    |    INSERT INTO user_channel_identities (user_id, channel, channel_user_id, display_name)
    |    Cache in Redis
    |
    v livosUserId used for:
       - Memory service userId parameter (memories + conversation_messages)
       - Conversation storage prefix: liv:ui:u:{userId}:conv:...
       - Per-user preferences
       - App access control
```

---

## Patterns to Follow

### Pattern 1: ChannelProvider Implementation (Proven Pattern)

**What:** Every messaging channel implements the same `ChannelProvider` interface. WhatsApp follows the exact same pattern as Telegram.
**When:** Adding any new messaging channel.
**Why:** The existing 5 providers (telegram, discord, slack, matrix, gmail) prove this interface works.

The `TelegramProvider` is the closest analog to WhatsApp:
- Both use long-lived connections (Telegram polling vs WhatsApp WebSocket)
- Both need message deduplication (Telegram update_id vs WhatsApp message key)
- Both support groups
- Both need reconnection with exponential backoff
- Both have DmPairing integration

```typescript
export class WhatsAppProvider implements ChannelProvider {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  private sock: ReturnType<typeof makeWASocket> | null = null;
  private authStore: WhatsAppAuthStore | null = null;
  private redis: Redis | null = null;
  private config: ChannelConfig = { enabled: false };
  private status: ChannelStatus = { enabled: false, connected: false };
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  async init(redis: Redis): Promise<void> {
    this.redis = redis;
    this.authStore = new WhatsAppAuthStore(redis);
    await this.loadConfig();
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      this.status = { enabled: false, connected: false };
      return;
    }

    const { state, saveCreds } = await this.authStore!.loadState();

    this.sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['LivOS', 'Desktop', '1.0.0'],
      markOnlineOnConnect: false,
    });

    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', (u) => this.handleConnectionUpdate(u));
    this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
  }
  // ... sendMessage, disconnect, getStatus, etc.
}
```

### Pattern 2: Write-Through Cache for Conversations

**What:** Redis remains the hot cache for active conversation context. SQLite is the durable store for historical search. Every message is written to both.
**When:** Persisting any conversation message from any channel.
**Why:** Redis gives sub-millisecond context injection into agent prompts. SQLite gives unbounded history for FTS5 search. Neither alone is sufficient.

```typescript
// In daemon message handler:
// 1. Read from Redis (fast, current session context)
const recentHistory = await this.getChannelHistory('whatsapp', jid);

// 2. Process with agent
const response = await this.processWithAgent(msg, recentHistory);

// 3. Write-through: Redis (hot, 24h TTL) + SQLite (durable)
await this.saveChannelTurn('whatsapp', jid, msg, response);     // Redis
await this.archiveConversationTurn(userId, 'whatsapp', msg, response); // SQLite (async)
```

### Pattern 3: Redis-Backed Baileys Auth State

**What:** Custom auth state backed by Redis instead of Baileys' default multi-file JSON.
**When:** Production WhatsApp deployment.
**Why:** Baileys docs say "DONT EVER USE useMultiFileAuthState IN PROD." Redis is already the state store for all Baileys data in this codebase.

```typescript
export class WhatsAppAuthStore {
  private redis: Redis;
  private readonly prefix = 'nexus:wa:auth';

  async loadState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const credsStr = await this.redis.get(`${this.prefix}:creds`);
    const creds = credsStr
      ? JSON.parse(credsStr, BufferJSON.reviver)
      : initAuthCreds();

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async (type, ids) => {
          const pipeline = this.redis.pipeline();
          for (const id of ids) pipeline.get(`${this.prefix}:keys:${type}:${id}`);
          const results = await pipeline.exec();
          const mapped: Record<string, any> = {};
          ids.forEach((id, i) => {
            const val = results?.[i]?.[1];
            if (val) mapped[id] = JSON.parse(val as string, BufferJSON.reviver);
          });
          return mapped;
        },
        set: async (data) => {
          const pipeline = this.redis.pipeline();
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const key = `${this.prefix}:keys:${type}:${id}`;
              if (value) pipeline.set(key, JSON.stringify(value, BufferJSON.replacer));
              else pipeline.del(key);
            }
          }
          await pipeline.exec();
        },
      },
    };

    const saveCreds = async () => {
      await this.redis.set(
        `${this.prefix}:creds`,
        JSON.stringify(state.creds, BufferJSON.replacer)
      );
    };

    return { state, saveCreds };
  }

  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
```

### Pattern 4: FTS5 with Content Table for Conversation Search

**What:** Use SQLite FTS5 with an external content table for flexible conversation searching.
**When:** Cross-session conversation search ("what did we discuss about X?").
**Why:** FTS5 is built into better-sqlite3. BM25 ranking is excellent for keyword queries. External content tables allow filtering by user_id, channel, timestamp while keeping the FTS index lean. No API calls required (unlike pure embedding search).

```sql
-- Content table stores everything
CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cm_user ON conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_cm_channel ON conversation_messages(channel);
CREATE INDEX IF NOT EXISTS idx_cm_timestamp ON conversation_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_cm_conv ON conversation_messages(conversation_id);

-- FTS5 indexes only the searchable text
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_messages_fts USING fts5(
  content,
  content=conversation_messages,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Conversation summaries for semantic search (optional enhancement)
CREATE TABLE IF NOT EXISTS conversations_archive (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  title TEXT,
  summary TEXT,
  summary_embedding TEXT,
  message_count INTEGER DEFAULT 0,
  first_message_at INTEGER,
  last_message_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ca_user ON conversations_archive(user_id);
```

### Pattern 5: QR Code Polling via Redis (not WebSocket)

**What:** WhatsApp QR data is stored in Redis with TTL. UI polls a tRPC query every 2 seconds.
**When:** During WhatsApp QR code authentication.
**Why:** Baileys QR events are async (depends on WhatsApp server WebSocket). A blocking HTTP endpoint would timeout. Polling is simpler than adding a new WebSocket subscription for a one-time setup flow. The existing integrations panel uses tRPC queries, not subscriptions.

```typescript
// tRPC route in livinityd (ai/routes.ts):
getWhatsAppQR: privateProcedure.query(async ({ ctx }) => {
  const redis = ctx.livinityd!.ai.redis;
  const qr = await redis.get('nexus:whatsapp:qr');
  const statusStr = await redis.get('nexus:whatsapp:status');
  const status = statusStr ? JSON.parse(statusStr) : null;
  return {
    qr: qr || null,  // data URL or null
    connected: status?.connected ?? false,
    botName: status?.botName,
  };
}),

// UI component polls every 2s while QR is shown
const { data } = trpcReact.ai.getWhatsAppQR.useQuery(undefined, {
  refetchInterval: showQR ? 2000 : false,
});
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Keeping Separate WhatsApp Processing Path

**What:** Maintaining the current ad-hoc WhatsApp handling in daemon.ts (`sendWhatsAppResponse`, `getWhatsAppHistory`, `saveWhatsAppTurn`, `wa_outbox` Redis queues) alongside the ChannelProvider system.
**Why bad:** Two code paths for the same thing. The daemon.ts WhatsApp code bypasses ChannelProvider lifecycle, has no config update handling via pub/sub, and uses a different history storage pattern than other channels.
**Instead:** Migrate all WhatsApp logic into `WhatsAppProvider` implementing `ChannelProvider`. Remove ad-hoc daemon.ts code. Single message path for all channels via `sendChannelResponse`.

### Anti-Pattern 2: Storing Full Conversations in Redis Long-Term

**What:** Using Redis as the primary conversation store with long or no TTL.
**Why bad:** Redis is RAM. A year of conversations across 6 channels could be gigabytes. Self-hosted servers have 8-32GB RAM total. The current pattern (`nexus:wa_history:{jid}` with 24h TTL, 40 entry cap) is correctly ephemeral.
**Instead:** Redis with 24h TTL as hot cache (current behavior). SQLite as durable store for historical search. Query SQLite for "what did we talk about last month?"

### Anti-Pattern 3: Embedding Every Conversation Message

**What:** Calling Kimi embeddings API for every single message to enable semantic search.
**Why bad:** Kimi API rate limits. Embedding "ok" and "thanks" wastes tokens and degrades search quality. At 100 messages/day, that is 36,500 embedding calls/year.
**Instead:** FTS5 for keyword search (free, instant, zero API calls). Embed only conversation summaries (generated by haiku tier LLM). Use FTS5 as primary search, semantic reranking as optional enhancement on top-N results.

### Anti-Pattern 4: useMultiFileAuthState in Production

**What:** Using Baileys' built-in file-based auth persistence.
**Why bad:** Baileys maintainers explicitly say "NEVER use in production." Creates hundreds of JSON files. Corrupts on crash. I/O bottleneck.
**Instead:** Redis-backed auth state. Atomic pipeline writes. No filesystem dependency. Survives process restarts cleanly.

### Anti-Pattern 5: Single JID Assumption

**What:** Assuming incoming and outgoing messages use the same JID format.
**Why bad:** Baileys v7 uses dual JID formats: `@s.whatsapp.net` for phone-based addressing and `@lid` for linked device identifiers. The existing `getWhatsAppHistory` in daemon.ts already handles this by merging all history keys.
**Instead:** Normalize JIDs by stripping suffixes for identity mapping. Use the full JID for message routing (Baileys requires it).

### Anti-Pattern 6: Blocking Message Response on Memory Write

**What:** Awaiting SQLite write before sending response back to channel.
**Why bad:** Adds 50-200ms latency to every response. Users expect instant replies.
**Instead:** Fire-and-forget the SQLite write (or use BullMQ queue). Response goes to channel immediately. Persistence happens async.

---

## Scalability Considerations

| Concern | At 100 msgs/day | At 1K msgs/day | At 10K msgs/day |
|---------|-----------------|-----------------|------------------|
| SQLite conversation store | ~50MB/year | ~500MB/year | ~5GB/year, add VACUUM |
| FTS5 search speed | <5ms | <20ms | <100ms (add pagination) |
| Kimi embedding calls | Skip (FTS5 sufficient) | Summaries only (~10/day) | Batch + rate limit |
| Redis hot cache | <10MB | <50MB | <200MB (reduce TTL) |
| Baileys memory | ~50MB fixed | ~50MB fixed | ~50MB fixed |
| WhatsApp rate limits | No concern | Watch for send limits | May hit anti-spam |

**Key insight:** WhatsApp is inherently single-account (one phone number per Baileys instance). Multi-user LivOS instances share the server's WhatsApp connection, routed via DmPairing to their respective LivOS accounts. This is the same model as Telegram (one bot token, DmPairing maps DM users).

**Self-hosted context:** Most LivOS instances will see 10-100 messages/day across all channels. The architecture is deliberately simple for this scale. SQLite + FTS5 + Redis cache handles this trivially.

---

## Integration Points Summary

### New Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `nexus/packages/core/src/channels/whatsapp.ts` | WhatsAppProvider (ChannelProvider implementation with Baileys) |
| 2 | `nexus/packages/core/src/channels/whatsapp-auth.ts` | Redis-backed auth state for Baileys |
| 3 | `nexus/packages/core/src/user-identity.ts` | Unified cross-channel user identity mapper |
| 4 | `nexus/packages/memory/src/archiver.ts` | Conversation archival pipeline (Redis -> SQLite + FTS5) |
| 5 | `livos/packages/ui/src/routes/settings/memory.tsx` | Memory management Settings panel (view, search, delete) |

### Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `nexus/packages/core/src/channels/types.ts` | Add 'whatsapp' to ChannelId, add to CHANNEL_META |
| 2 | `nexus/packages/core/src/channels/index.ts` | Register WhatsAppProvider in constructor, import |
| 3 | `nexus/packages/core/src/daemon.ts` | Add conversation_search tool, add 'whatsapp' to realtimeSources, consolidate WA routing |
| 4 | `nexus/packages/core/src/index.ts` | Wire WhatsAppProvider with DmPairing + ApprovalManager (same pattern as Telegram) |
| 5 | `nexus/packages/memory/src/index.ts` | Add conversation_messages + FTS5 tables, /conversations/search + /conversations/messages endpoints |
| 6 | `livos/packages/ui/src/routes/settings/integrations.tsx` | Add WhatsApp tab (5th channel, grid-cols-5) |
| 7 | `livos/packages/livinityd/source/modules/ai/routes.ts` | Add getWhatsAppQR tRPC query, memory management endpoints |
| 8 | `nexus/packages/core/package.json` | Add @whiskeysockets/baileys, qrcode, @types/qrcode |

### Redis Key Map (New)

| Key | Type | Purpose | TTL |
|-----|------|---------|-----|
| `nexus:whatsapp:config` | string (JSON) | WhatsApp channel config | none |
| `nexus:whatsapp:status` | string (JSON) | Connection status | none |
| `nexus:whatsapp:qr` | string | Current QR code data URL | 60s |
| `nexus:wa:auth:creds` | string (JSON) | Baileys credentials | none |
| `nexus:wa:auth:keys:{type}:{id}` | string (JSON) | Signal protocol keys | none |
| `nexus:whatsapp:dedup:{msgId}` | string | Message deduplication | 24h |
| `nexus:identity:{channel}:{channelUserId}` | string | Mapped LivOS userId | 24h |

### NPM Dependencies to Add

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `@whiskeysockets/baileys` | `^7.0.0` | nexus/packages/core | WhatsApp Web API |
| `qrcode` | `^1.5.x` | nexus/packages/core | QR code to data URL |
| `@types/qrcode` | `^1.5.x` | nexus/packages/core (dev) | TypeScript types |
| `pino` | already present | nexus/packages/core | Baileys logger requirement |

### Suggested Build Order

Dependencies flow: types -> auth store -> provider -> ChannelManager registration -> daemon consolidation -> UI -> memory.

**Phase 1: WhatsApp Channel Foundation** (depends on nothing new)
- Extend `ChannelId` type and `CHANNEL_META` in types.ts
- Create `WhatsAppAuthStore` (Redis-backed auth state)
- Create `WhatsAppProvider` implementing `ChannelProvider`
- Register in `ChannelManager` constructor
- Wire DmPairing + ApprovalManager in index.ts (copy Telegram pattern)
- Add 'whatsapp' to realtimeSources in daemon.ts

**Phase 2: QR Code + Settings UI** (depends on Phase 1)
- Add `getWhatsAppQR` tRPC query route
- Add WhatsApp tab in Settings Integrations UI
- QR code rendering with 2s polling auto-refresh
- Connection status display + disconnect button

**Phase 3: Message Routing Consolidation** (depends on Phase 1)
- Consolidate `sendWhatsAppResponse` to use `sendChannelResponse` path
- Remove wa_outbox Redis queue pattern from daemon.ts
- Unify WhatsApp history with `saveChannelTurn` / `getChannelHistory` pattern
- Remove legacy WhatsApp inbox polling from daemon cycle

**Phase 4: Cross-Session Memory** (independent of WhatsApp, can parallel Phase 1-3)
- Add `conversation_messages` + FTS5 + `conversations_archive` tables to memory.db
- Add `/conversations/messages` POST endpoint (write)
- Add `/conversations/search` POST endpoint (FTS5 search)
- Create `ConversationArchiver` (periodic summarization)
- Register `conversation_search` tool in daemon
- Wire conversation persistence into daemon message handler

**Phase 5: Unified Identity + Memory UI** (depends on Phase 3 + 4)
- Create `UserIdentityMapper` for cross-channel userId resolution
- Add `user_channel_identities` table to PostgreSQL
- Wire identity mapping into daemon inbox processing
- Create Memory Management Settings panel

---

## Sources

- [Baileys Documentation](https://baileys.wiki/docs/intro/) -- connection lifecycle, auth state
- [Baileys GitHub (WhiskeySockets/Baileys)](https://github.com/WhiskeySockets/Baileys) -- v7.0.0-rc.9
- [Baileys npm](https://www.npmjs.com/package/@whiskeysockets/baileys) -- version info, Node 20+ requirement
- [Baileys Redis Auth (hbinduni/baileys-redis-auth)](https://github.com/hbinduni/baileys-redis-auth) -- Redis auth state pattern
- [Baileys Connection Config](https://baileys.wiki/docs/socket/configuration/) -- makeWASocket options
- [Baileys Connection Events](https://baileys.wiki/docs/socket/connecting/) -- QR, reconnect patterns
- [WhatsApp Ban Risks](https://github.com/WhiskeySockets/Baileys/issues/1869) -- account safety
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html) -- query syntax, BM25
- [sqlite-vec](https://github.com/asg017/sqlite-vec) -- optional vector search extension
- Existing codebase analysis:
  - `nexus/packages/core/src/channels/index.ts` -- ChannelManager pattern
  - `nexus/packages/core/src/channels/types.ts` -- ChannelProvider interface
  - `nexus/packages/core/src/channels/telegram.ts` -- reference implementation (470 lines)
  - `nexus/packages/core/src/daemon.ts` -- existing WhatsApp scaffolding (wa_outbox, JID handling)
  - `nexus/packages/core/src/router.ts` -- Intent.source already includes 'whatsapp'
  - `nexus/packages/memory/src/index.ts` -- memory service (SQLite + embeddings)
  - `nexus/packages/core/src/dm-pairing.ts` -- DmPairingManager (channel-agnostic)
  - `livos/packages/livinityd/source/modules/ai/index.ts` -- conversation storage (Redis)
  - `livos/packages/ui/src/routes/settings/integrations.tsx` -- channel settings UI
