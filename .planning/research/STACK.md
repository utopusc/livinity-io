# Technology Stack: v25.0 Memory & WhatsApp Integration

**Project:** Livinity v25.0 - WhatsApp Channel + Cross-Session Memory Search
**Researched:** 2026-04-02
**Scope:** NEW dependencies only. Existing stack (Express, tRPC, Redis, better-sqlite3, Kimi embeddings, grammy, discord.js, etc.) is validated and not re-evaluated.

## Recommended Stack Additions

### WhatsApp Channel Integration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `baileys` | `^6.7.21` (stable) | WhatsApp Web API via WebSocket | Native TypeScript, no browser/Puppeteer dependency, ~50MB RAM vs 300-600MB for whatsapp-web.js. Direct WebSocket connection to WhatsApp servers. Same package published as both `baileys` and `@whiskeysockets/baileys`. |
| `qrcode` | `^1.5.4` | Server-side QR code generation | Generates QR data URL from Baileys QR string. Lightweight (3 deps). Server renders to base64 PNG, sends to UI via tRPC/WebSocket. |
| `@types/qrcode` | `^1.5.6` | TypeScript types for qrcode | Type safety for QR generation API. |

**Version rationale: Use `6.7.21` (latest stable), NOT `7.0.0-rc.9`.**
The v7.0 line is still release-candidate (rc.9 published Nov 2025, no stable release as of Apr 2026). The 6.x line is production-tested. The `baileys` and `@whiskeysockets/baileys` packages are identical (same maintainer, same versions, same content). Use the unscoped `baileys` package name -- it is shorter and the maintainers publish to both.

**Why Baileys over whatsapp-web.js:**

| Criterion | Baileys | whatsapp-web.js |
|-----------|---------|-----------------|
| Browser dependency | None (WebSocket direct) | Puppeteer/Chrome required |
| RAM usage | ~50MB | 300-600MB |
| Startup time | <1s | 5-10s |
| TypeScript | Native TS | JS with community types |
| Auth persistence | Pluggable auth state | Pluggable auth strategy |
| Headless server | Works natively | Requires headless Chrome config |
| Active maintenance | WhiskeySockets community | Single maintainer |

For a self-hosted home server (8-32GB RAM), the 250-550MB RAM savings from Baileys is significant -- that is RAM available for Docker containers and AI inference.

### Cross-Session Conversation Search

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLite FTS5 | (built-in) | Full-text search on conversation history | Already compiled into better-sqlite3 by default (`SQLITE_ENABLE_FTS5` flag). Zero new dependencies. BM25 ranking built in. Substring, phrase, boolean queries. |

**No new packages needed for conversation search.** The existing `better-sqlite3` (already in `@nexus/memory`) has FTS5 compiled in. The memory service already uses SQLite with `better-sqlite3` and already has a `conversations` table. The work is adding an FTS5 virtual table and writing conversation messages to it -- pure application code, not a new library.

### WhatsApp Auth State Persistence (SQLite-backed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| (reuse `better-sqlite3`) | `^11.0.0` | Persist Baileys auth state | Baileys docs explicitly say "DO NOT use `useMultiFileAuthState` in production." Custom SQLite-backed auth state is recommended. The memory service already has better-sqlite3 -- reuse it. Store auth keys in a `whatsapp_auth` table in the same SQLite DB or a dedicated one. |

**No new dependency.** Write a custom `useSqliteAuthState()` function modeled after the built-in `useMultiFileAuthState` but backed by SQLite instead of JSON files on disk. This prevents the I/O corruption and performance issues that plague the file-based approach.

## What NOT to Add

| Anti-Dependency | Why Avoid |
|-----------------|-----------|
| `whatsapp-web.js` | Requires Puppeteer/Chrome. 6x more RAM. Overkill for headless server. |
| `puppeteer` / `chrome-headless-shell` | Only needed if using whatsapp-web.js. Baileys does not need a browser. |
| `@whiskeysockets/baileys` | Identical to `baileys` (same package). Use the shorter name. |
| `baileys@7.0.0-rc.x` | Still RC, not stable. Breaking changes from 6.x. Wait for stable release. |
| Any vector DB (Milvus, Pinecone, Chroma) | Overkill. Memory service already does cosine similarity on Kimi embeddings in SQLite. FTS5 handles keyword search. The combination is sufficient for conversation search at self-hosted scale (<100k messages). |
| `elasticsearch` / `meilisearch` / `typesense` | External search engine is unnecessary. FTS5 handles full-text search within SQLite. No new infrastructure to manage. |
| `pino` | Baileys uses pino internally, but nexus-core uses winston. Pass a silent pino logger to Baileys and bridge to winston -- do NOT add pino as a project dependency. |
| `qrcode-terminal` | Only for CLI rendering. The QR code goes to the web UI, not terminal. Use `qrcode` (server lib) to generate data URL. |

## Integration Points

### 1. WhatsApp Channel Provider

Follows the exact same `ChannelProvider` interface as Telegram, Discord, Slack, Matrix, Gmail:

```typescript
// channels/whatsapp.ts
export class WhatsAppProvider implements ChannelProvider {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';
  
  // Baileys socket instance
  private sock: ReturnType<typeof makeWASocket> | null = null;
  
  // Auth state backed by SQLite (NOT useMultiFileAuthState)
  private authState: { state: AuthenticationState; saveCreds: () => Promise<void> } | null = null;
  
  async init(redis: Redis): Promise<void> { /* load config from redis */ }
  async connect(): Promise<void> { /* create socket, emit QR events */ }
  async disconnect(): Promise<void> { /* close socket */ }
  async getStatus(): Promise<ChannelStatus> { /* return connection state */ }
  async sendMessage(chatId: string, text: string): Promise<boolean> { /* sock.sendMessage() */ }
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void { /* bind messages.upsert */ }
}
```

**ChannelId type must be extended:** `'telegram' | 'discord' | 'slack' | 'matrix' | 'gmail' | 'whatsapp'`

**ChannelManager registration:** Add `this.providers.set('whatsapp', new WhatsAppProvider())` in constructor.

**CHANNEL_META addition:**
```typescript
whatsapp: { name: 'WhatsApp', color: '#25D366', textLimit: 65536 },
```

### 2. QR Code Flow (Server to UI)

Baileys emits QR string via `connection.update` event. Flow:

1. `WhatsAppProvider.connect()` creates socket, listens for `connection.update`
2. When `update.qr` is present, generate data URL via `qrcode.toDataURL(qrString)`
3. Publish QR data URL to Redis: `nexus:whatsapp:qr`
4. Expose via tRPC query (poll) or Redis pub/sub (push) to UI
5. UI renders `<img src={qrDataUrl} />` in WhatsApp Settings panel
6. QR regenerates every ~30s until scanned
7. After scan, WhatsApp disconnects once (normal behavior), then reconnects with stored creds

### 3. Auth State Persistence (SQLite)

```sql
-- In a dedicated whatsapp_auth.db (separate from memory.db for isolation)
CREATE TABLE IF NOT EXISTS whatsapp_auth (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Custom `useSqliteAuthState(db: Database)` returns `{ state, saveCreds }` compatible with Baileys config. On every `creds.update` event, write to SQLite. On startup, load from SQLite -- no re-scan needed.

### 4. Cross-Session Conversation Search (FTS5)

Add to the existing memory service SQLite schema:

```sql
-- Backing content table for conversation messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_conv_msg_user ON conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_msg_conv ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_msg_ts ON conversation_messages(timestamp);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_messages_fts USING fts5(
  content,
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

Use triggers or manual inserts to keep the FTS5 table in sync. Query with:

```sql
SELECT cm.*, bm25(conversation_messages_fts) AS rank
FROM conversation_messages_fts
JOIN conversation_messages cm ON cm.rowid = conversation_messages_fts.rowid
WHERE conversation_messages_fts MATCH ?
  AND cm.user_id = ?
ORDER BY rank
LIMIT ?;
```

### 5. Conversation Persistence Hook

Every channel message handler (including new WhatsApp) writes to the conversation store:

```typescript
// In ChannelManager or daemon message processing
async function persistConversationMessage(
  userId: string,
  channel: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
) {
  await memoryApi.post('/conversations/messages', {
    userId,
    channel,
    conversationId,
    role,
    content,
    timestamp: Date.now(),
  });
}
```

### 6. AI Tool for Conversation Search

Register a `search_conversations` tool in the ToolRegistry:

```typescript
{
  name: 'search_conversations',
  description: 'Search past conversations across all channels (web, telegram, whatsapp, discord, etc.)',
  parameters: {
    query: { type: 'string', description: 'What to search for' },
    channel: { type: 'string', optional: true, description: 'Filter to specific channel' },
    days: { type: 'number', optional: true, description: 'Limit to last N days' },
  }
}
```

This lets the AI respond to "what did we discuss last week about backups?" by querying the FTS5 index + optional semantic reranking via Kimi embeddings.

## Baileys Technical Notes

### Logger Bridge (No pino Installation)

Baileys requires a `pino`-compatible logger. Create a thin adapter instead of installing pino:

```typescript
import { logger as winstonLogger } from '../logger.js';

export const baileysLogger = {
  level: 'warn',
  child: () => baileysLogger,
  trace: () => {},
  debug: (msg: any) => winstonLogger.debug(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  info: (msg: any) => winstonLogger.info(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  warn: (msg: any) => winstonLogger.warn(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  error: (msg: any) => winstonLogger.error(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  fatal: (msg: any) => winstonLogger.error(typeof msg === 'string' ? msg : JSON.stringify(msg)),
};
```

### Connection Lifecycle

WhatsApp deliberately disconnects after first QR scan to provide auth credentials. This is NOT an error. Handle it:

```typescript
sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
  if (qr) {
    // Generate data URL and publish to Redis for UI
  }
  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
    if (shouldReconnect) {
      // Reconnect with fresh socket (current socket is dead after close)
    }
  }
  if (connection === 'open') {
    // Connected and authenticated -- save status
  }
});
```

### getMessage Callback (Required)

Baileys requires a `getMessage` function for resending failed messages and decrypting polls. Store messages and return them:

```typescript
getMessage: async (key) => {
  const msg = db.prepare(
    'SELECT content FROM conversation_messages WHERE id = ?'
  ).get(key.id);
  return msg ? { conversation: msg.content } : undefined;
}
```

### markOnlineOnConnect

Set to `false` to prevent suppressing phone notifications:

```typescript
const sock = makeWASocket({
  auth: state,
  logger: baileysLogger,
  markOnlineOnConnect: false,
  getMessage,
});
```

### Message Reception Pattern

```typescript
sock.ev.on('messages.upsert', ({ messages, type }) => {
  if (type !== 'notify') return; // Skip history sync messages
  
  for (const msg of messages) {
    if (!msg.message || msg.key.fromMe) continue; // Skip own messages
    
    const text = msg.message.conversation 
      || msg.message.extendedTextMessage?.text 
      || '';
    
    if (!text) continue;
    
    const incomingMsg: IncomingMessage = {
      channel: 'whatsapp',
      chatId: msg.key.remoteJid!,
      userId: msg.key.participant || msg.key.remoteJid!,
      userName: msg.pushName || 'Unknown',
      text,
      timestamp: (msg.messageTimestamp as number) * 1000,
      isGroup: msg.key.remoteJid?.endsWith('@g.us') || false,
    };
    
    messageHandler?.(incomingMsg);
  }
});
```

## Installation

```bash
# In nexus/packages/core/
npm install baileys@^6.7.21 qrcode@^1.5.4

# Dev dependencies  
npm install -D @types/qrcode@^1.5.6
```

**No changes needed in `@nexus/memory`** -- it already has `better-sqlite3` which includes FTS5.

## Dependency Impact

| Package | Size (install) | New runtime deps | Production risk |
|---------|---------------|------------------|-----------------|
| `baileys@6.7.21` | ~15MB | 10 (ws, protobufjs, libsignal, etc.) | MEDIUM -- unofficial WhatsApp API, can break on WA updates |
| `qrcode@1.5.4` | ~0.5MB | 3 (pngjs, dijkstrajs, yargs) | LOW -- stable, well-maintained |
| `@types/qrcode` | ~50KB | 0 (dev only) | NONE |

**Total new production dependencies: 2 packages (~15.5MB installed)**

Note: `baileys` brings `ws@^8.13.0` which is already in nexus-core's dependencies (`ws@^8.18.0`). npm will deduplicate. `protobufjs` and `libsignal` are new transitive dependencies unique to Baileys.

## Confidence Assessment

| Decision | Confidence | Source |
|----------|------------|--------|
| Baileys over whatsapp-web.js | HIGH | Multiple sources, clear technical advantages, community consensus |
| Baileys v6.7.21 (not v7 RC) | HIGH | npm registry: v7 still RC since Nov 2025, no stable release |
| SQLite FTS5 for conversation search | HIGH | Verified: better-sqlite3 compiles with SQLITE_ENABLE_FTS5 by default (GitHub issue #1253) |
| Custom SQLite auth state for Baileys | HIGH | Baileys docs explicitly warn against useMultiFileAuthState in production |
| qrcode package for QR rendering | HIGH | Standard approach, Baileys docs reference sending QR string to frontend |
| Winston-to-pino logger bridge | MEDIUM | Baileys accepts pino-compatible logger; bridge pattern works but may miss some pino-specific child logger features |
| baileys 6.x overall stability | MEDIUM | 6.7.21 published Nov 2025. WhatsApp can break unofficial APIs at any time. |

## Risk: WhatsApp API Instability

Baileys is an unofficial reverse-engineered API. WhatsApp can and does make changes that break it. Mitigations:

1. **Treat WhatsApp as degradable** -- it is one of 6+ channels, not the only one
2. **Version pin** -- do not auto-update Baileys
3. **Connection status UI** -- show clear connected/disconnected state to user
4. **Graceful degradation** -- if WhatsApp disconnects, other channels keep working
5. **Re-auth flow** -- make QR re-scan easy (one click in Settings panel)

## Sources

- [Baileys GitHub - WhiskeySockets](https://github.com/WhiskeySockets/Baileys) -- official repository
- [Baileys Documentation](https://baileys.wiki/docs/intro/) -- setup and configuration
- [Baileys Connecting Guide](https://baileys.wiki/docs/socket/connecting/) -- QR code flow, auth state
- [Baileys Configuration](https://baileys.wiki/docs/socket/configuration/) -- makeWASocket options
- [DeepWiki Baileys Getting Started](https://deepwiki.com/WhiskeySockets/Baileys/2-getting-started) -- code patterns
- [better-sqlite3 FTS5 Issue #1253](https://github.com/WiseLibs/better-sqlite3/issues/1253) -- confirms FTS5 compiled by default
- [SQLite FTS5 Extension Docs](https://www.sqlite.org/fts5.html) -- query syntax, BM25 ranking
- [npm: baileys](https://www.npmjs.com/package/baileys) -- version history, v6.7.21 latest stable
- [npm: qrcode](https://www.npmjs.com/package/qrcode) -- QR code generation
- [LibHunt: Baileys vs whatsapp-web.js](https://www.libhunt.com/compare-Baileys-vs-whatsapp-web.js) -- comparison
- [Baileys Auth State Production Guidance](https://deepwiki.com/WhiskeySockets/Baileys/4-connection-and-authentication) -- auth state patterns
