# Pitfalls Research: WhatsApp Integration & Cross-Session Memory

**Domain:** WhatsApp Web channel integration + cross-session AI memory for self-hosted AI platform
**Researched:** 2026-04-02
**Confidence:** HIGH (codebase analysis + ecosystem research + multiple corroborating sources)

## Critical Pitfalls

### Pitfall 1: WhatsApp Session Death Spiral (whatsapp-web.js)

**What goes wrong:**
whatsapp-web.js sessions silently stop receiving messages after 10-60 minutes without any error events. The client appears connected (status shows connected), but the underlying Puppeteer browser process has lost its WebSocket connection to WhatsApp servers. On server restart, sessions fail to restore and demand a fresh QR code scan, requiring physical access to the phone. After 2-3 days, even properly saved sessions expire and require re-authentication. This creates a cycle: deploy, scan QR, works for hours/days, dies silently, requires manual intervention.

**Why it happens:**
whatsapp-web.js wraps a headless Chromium instance that loads WhatsApp Web. WhatsApp Web's internal WebSocket can disconnect silently when the browser process enters certain states (high memory, garbage collection pauses, network hiccups). The library's `disconnected` event does not fire in all failure modes. Additionally, WhatsApp rotates session tokens server-side, and if the client misses a token rotation window (30+ days inactive, or server-side invalidation), the stored session becomes permanently invalid.

**How to avoid:**
1. Use Baileys instead of whatsapp-web.js. Baileys uses a direct WebSocket connection (no browser/Puppeteer), consuming ~50MB RAM instead of ~500MB+. It handles the WhatsApp multi-device protocol natively.
2. If using whatsapp-web.js: implement a heartbeat health check that sends a `client.getWWebVersion()` call every 60 seconds. If it fails or times out, trigger `client.destroy()` + `client.initialize()`.
3. Store auth state in PostgreSQL (not filesystem) using a custom auth state handler so session survives container restarts and server migrations.
4. Build a "session health" indicator in the UI that shows time-since-last-message and triggers an alert after 5 minutes of silence during expected active hours.

**Warning signs:**
- `message` events stop arriving but `disconnected` never fires
- Chromium process memory exceeds 800MB
- No messages received for 5+ minutes during a period when messages should arrive
- QR code requested again after server restart even though session files exist

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- Library choice and session architecture must be decided up front. Switching libraries later means rewriting the entire provider.

---

### Pitfall 2: Chromium Memory Leak and OOM on Production Server

**What goes wrong:**
whatsapp-web.js spawns a headless Chromium process that leaks memory continuously. On Server4 (the production LivOS server), this competes with PostgreSQL, Redis, PM2 processes, and Docker containers for the same RAM. After 12-48 hours, the Chromium process consumes 1-2GB, causing the Linux OOM killer to terminate either Chromium (killing WhatsApp) or another critical process (killing Nexus or Redis). This is especially dangerous because Server4 already runs a heavy workload.

**Why it happens:**
Puppeteer-controlled Chromium accumulates memory through: JavaScript heap growth from processing WhatsApp Web's React app, DOM node retention from message history rendering, and IndexedDB growth as chat history accumulates. The `--disable-dev-shm-usage` flag helps in containers but doesn't prevent the fundamental memory growth pattern. Multiple GitHub issues (3459, 294, 5817) document this as an unresolved, ongoing problem.

**How to avoid:**
1. **Use Baileys.** This eliminates the Chromium dependency entirely. Baileys uses a lightweight WebSocket connection that typically consumes 30-80MB total.
2. If forced to use whatsapp-web.js: schedule a periodic restart (every 6-12 hours) with `client.destroy()` followed by `client.initialize()` and automatic session restore from saved auth.
3. Set `cgroup` memory limits for the WhatsApp process so it gets OOM-killed in isolation before it affects other services.
4. Monitor with `process.memoryUsage()` and auto-restart when RSS exceeds 500MB.

**Warning signs:**
- `htop` shows a chromium/chrome process growing steadily over hours
- RSS memory for the nexus-core PM2 process doubles within 24 hours
- Other PM2 processes restart unexpectedly (OOM killer cascade)
- System swap usage increasing

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- This is a library selection decision. Choosing Baileys eliminates this pitfall entirely.

---

### Pitfall 3: WhatsApp Account Ban from Automated Messaging

**What goes wrong:**
Meta's anti-automation detection permanently bans the WhatsApp account associated with the phone number. The ban is on the phone number itself, not the library or server -- meaning the user loses their personal WhatsApp account, all chat history, and cannot register the same number again. In 2025-2026, Meta has deployed AI-powered detection that identifies automated behavior with higher precision than ever before.

**Why it happens:**
WhatsApp's Terms of Service prohibit automated or bulk messaging on personal accounts. Detection triggers include: sending messages from a server IP (non-mobile network), consistent response times (bots reply faster than humans), identical message patterns, high message volume in short periods, and IP/phone-number geographic mismatch. Using unofficial APIs (whatsapp-web.js, Baileys) is itself a ToS violation. Meta is actively cracking down, particularly on AI chatbots, with a 2026 policy explicitly targeting general-purpose AI assistants.

**How to avoid:**
1. **Warn users prominently** in the WhatsApp setup UI: "Using WhatsApp automation risks account ban. Use a secondary phone number." Display this warning before the QR code scan, require explicit acknowledgment.
2. Implement aggressive rate limiting: max 10 messages per minute, max 80 per hour, randomized delays (2-8 seconds) between sends.
3. Never send identical messages to different recipients.
4. Add message variation: randomly vary punctuation, spacing, or phrasing in automated responses.
5. Use a phone number registered on the same ISP/country as the server IP. VPN/server IP mismatches are a strong signal.
6. Start with low volume and gradually increase (the "warm-up" pattern).
7. This is a self-hosted personal assistant, not a business broadcast tool. The risk is lower for personal 1:1 conversations but still real.

**Warning signs:**
- Temporary sending blocks (messages don't deliver for 1-24 hours)
- "This account is not allowed to use WhatsApp" error
- QR code scan succeeds but session is immediately terminated
- Phone receives a warning notification from WhatsApp about unusual activity

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- Rate limiting and user warnings must be built into the initial implementation, not added later.

---

### Pitfall 4: userId Fragmentation Across Channels

**What goes wrong:**
The same human user has completely different identifiers on each channel: Telegram uses numeric IDs (`12345678`), Discord uses snowflake IDs (`987654321098765432`), WhatsApp uses phone numbers (`12025550108@s.whatsapp.net`), Slack uses workspace-scoped IDs (`U0123ABC`), and the LivOS Web UI uses PostgreSQL user UUIDs. The memory service stores memories keyed by `user_id`, but without unification, the same person's Telegram memories are invisible when they chat from WhatsApp. The AI treats them as separate users with no shared context.

**Why it happens:**
The current `ChannelManager` passes `msg.userId` directly from each provider (e.g., `String(msg.from?.id || 0)` in Telegram, `message.author.id` in Discord). The `DmPairingManager` already maps channel-specific userIds to an allowlist per channel, but this mapping is not used to resolve a canonical userId. The memory service at `nexus/packages/memory` stores and retrieves memories by `user_id` with no concept of aliases. Each channel stores its own isolated userId, so cross-channel memory recall fails completely.

**How to avoid:**
1. Create a `user_identity_map` table in PostgreSQL: `(canonical_user_id UUID, channel TEXT, channel_user_id TEXT, UNIQUE(channel, channel_user_id))`.
2. Extend the DM pairing flow: when a user is approved on a new channel, link their channel-specific ID to their canonical LivOS user. The pairing code already routes through the Web UI admin, which knows the canonical userId.
3. Add a resolution layer in `ChannelManager.onMessage()` before calling `daemon.addToInbox()`: look up the canonical userId from the identity map, and pass that to the memory service.
4. For WhatsApp specifically, the phone number can serve as a natural cross-channel identifier if the user also has it on file in their LivOS profile.
5. Build an "Identity Linking" UI in Settings where users can see which channel accounts are linked and manually link/unlink them.

**Warning signs:**
- AI says "I don't recall us discussing that" when the user switches from Telegram to WhatsApp mid-conversation
- Memory search returns empty for a known user when queried from a different channel
- Memory deduplication creates separate near-identical memories for the same user across channels
- User count in memory stats is inflated (N channels x M users instead of M users)

**Phase to address:**
Phase 2 (Cross-Session Memory) -- Must be addressed before memory goes live, otherwise incorrect data accumulates and is hard to clean up retroactively.

---

### Pitfall 5: Baileys Auth State Loss on Restart

**What goes wrong:**
Baileys requires persisting Signal protocol session keys after every single message send/receive. If even one key update is missed (process crash between message receipt and key persistence), the session becomes corrupted. On next restart, Baileys cannot decrypt incoming messages, receives "Bad MAC" errors, and the only recovery is deleting all auth state and re-scanning the QR code. The official `useMultiFileAuthState` function writes JSON files to disk on every update, which is explicitly documented as "NOT for production" due to excessive I/O and corruption risk.

**Why it happens:**
WhatsApp uses the Signal protocol for end-to-end encryption. Session keys are ratcheted forward with every message -- if the persisted state diverges from WhatsApp's server-side state by even one step, decryption fails permanently for that session. File-based persistence is vulnerable to: partial writes during crash, filesystem sync delays, and race conditions when multiple messages arrive simultaneously. The official docs state: "if updates are not persisted, message delivery will break on the next restart."

**How to avoid:**
1. Implement a custom auth state handler that persists to PostgreSQL (already available in the stack) with transactional writes. Wrap `set()` calls in a database transaction so partial writes are impossible.
2. Use the `baileysauth` library or write a custom adapter following the `useMultiFileAuthState` interface but backed by PostgreSQL/Redis.
3. Never use `useMultiFileAuthState` in production. Use it only as a reference implementation.
4. Implement a startup validation: on boot, attempt to send a test message to self. If it fails with decryption errors, automatically wipe auth state and request re-authentication via QR code in the UI.
5. Back up auth state to Redis as a secondary store for fast recovery.

**Warning signs:**
- "Bad MAC" or "decryption failed" errors in logs after restart
- Messages show as delivered (double check) on sender's phone but never trigger the message handler
- Auth state files grow unboundedly on disk
- Frequent QR code re-scans needed after deployments

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- Auth state architecture must be correct from day one. Fixing a corrupted auth state store that has been accumulating keys for weeks is extremely difficult.

---

### Pitfall 6: Memory Embedding Brute-Force Scaling Wall

**What goes wrong:**
The current memory service in `nexus/packages/memory` performs brute-force cosine similarity search over all user embeddings (up to 100 most recent) on every query. As conversations accumulate across multiple channels (Web UI, Telegram, WhatsApp, Discord), the memory count grows to thousands per user. Each `/search` or `/context` call loads all embeddings from SQLite, deserializes JSON arrays, and computes cosine similarity in JavaScript. At 1,000+ memories with 1536-dimension embeddings, each search takes 500ms+; at 10,000 memories, it becomes multi-second and blocks the event loop.

**Why it happens:**
The current implementation was designed for a small-scale prototype (the code even says "v2" and limits to 100 recent memories). Adding WhatsApp and cross-session memory dramatically increases volume: every conversation turn across every channel generates memories. The `LIMIT 100` in the current query is a band-aid that means older memories are never searched, effectively creating a recency-only memory (not true long-term recall). The brute-force approach has O(n) complexity per query with no indexing.

**How to avoid:**
1. Add `sqlite-vec` extension to `better-sqlite3` for native vector search with indexed KNN queries. This brings queries from O(n) to O(log n) and handles 100k+ embeddings efficiently.
2. Remove the `LIMIT 100` from search queries and rely on vector index for performance.
3. Implement a two-tier memory system: "hot" memories (last 7 days) in Redis for instant retrieval, "cold" memories in SQLite with vector index for semantic search.
4. Add a background compaction job: periodically summarize old memories into higher-level summaries, reducing the total count while preserving knowledge.
5. Track embedding dimension and ensure consistency: if the Kimi embedding model changes dimension, old embeddings become incompatible.

**Warning signs:**
- `/context` endpoint latency exceeds 200ms
- Memory service CPU spikes during AI conversations
- Users report AI response delays when memory context is being assembled
- SQLite database file exceeds 100MB

**Phase to address:**
Phase 2 (Cross-Session Memory) -- Must be addressed when memory volume increases. The current implementation works for small scale but will fail with multi-channel input.

---

### Pitfall 7: Echo Loop Between WhatsApp and AI Agent

**What goes wrong:**
The AI agent sends a response to WhatsApp. WhatsApp-web.js (or Baileys) receives the sent message as an incoming event (because it sees all messages in the chat, including its own). This triggers the message handler again, which sends the message to the AI agent, which generates another response, creating an infinite loop. The loop consumes API tokens, burns rate limits, and can trigger WhatsApp anti-spam detection and account ban.

**Why it happens:**
Unlike Telegram (where the bot API distinguishes between incoming and outgoing messages clearly), WhatsApp Web libraries receive all messages in a chat, including messages sent by the connected account. The existing Telegram provider doesn't face this because `grammy` handles bot message filtering internally. The current `ChannelManager.onMessage` handler has no `fromMe` check -- it forwards all messages to `daemon.addToInbox()`.

**How to avoid:**
1. In the WhatsApp provider, filter messages with `msg.fromMe === true` (whatsapp-web.js) or `msg.key.fromMe === true` (Baileys) and skip them.
2. Add a sent-message deduplication set in Redis (similar to Telegram's `dedup:${updateId}` pattern): before sending a response, store the message ID with a 5-minute TTL, and reject incoming messages matching stored IDs.
3. Add a global guard in `ChannelManager.onMessage()` that checks a `fromBot` flag before forwarding to the daemon.
4. Implement a per-chat cooldown: after sending a response, ignore messages from the same chat for 2 seconds.

**Warning signs:**
- AI responds to its own messages in rapid succession
- Kimi/Claude API token usage spikes unexpectedly
- WhatsApp sends "you're sending messages too quickly" warnings
- Server CPU spikes from rapid message processing loop

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- This must be handled in the message handler from the very first implementation. An echo loop in production can burn hundreds of API calls in seconds.

---

### Pitfall 8: Malicious Baileys Fork / Supply Chain Attack

**What goes wrong:**
The Baileys ecosystem has had documented supply chain attacks. A malicious fork called "lotusbail" embedded a hardcoded pairing code that silently added the attacker's device as a trusted endpoint on the victim's WhatsApp account. Even after uninstalling the malicious package, the attacker's linked device remained connected until manually removed from WhatsApp settings. The attacker could read all messages, impersonate the user, and exfiltrate data.

**Why it happens:**
Baileys is a reverse-engineered WhatsApp protocol implementation. Forks are common, many with slight modifications. The npm ecosystem makes it easy to publish similar-sounding packages. Developers searching for "baileys" find dozens of forks (`@fadzzzslebew/baileys`, `@zenzxz/baileys`, etc.) and may install a compromised one. The official package is `@whiskeysockets/baileys` (or `baileys` on npm from WhiskeySockets).

**How to avoid:**
1. **Only install from the official source**: `@whiskeysockets/baileys` from WhiskeySockets. Pin the exact version in package.json.
2. Use `npm audit` and `pnpm audit` to check for known vulnerabilities.
3. After initial QR pairing, verify linked devices in WhatsApp mobile: Settings > Linked Devices. There should be exactly one entry (the server).
4. Periodically re-check linked devices from the UI (add a "Check Linked Devices" button).
5. Lock down the dependency with a lockfile hash check in CI.

**Warning signs:**
- Unknown linked device appears in WhatsApp mobile settings
- Messages being read without user interaction (double blue ticks appearing on messages user hasn't opened)
- Unexpected package name in node_modules (not `@whiskeysockets/baileys`)

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- Dependency selection and verification must happen before any code is written.

---

### Pitfall 9: Memory Deduplication Fails Across Channels

**What goes wrong:**
The same topic discussed on Telegram and then on WhatsApp creates duplicate memories. The user says "My birthday is March 15" on Telegram, and later "I was born on March 15th" on WhatsApp. The deduplication threshold (cosine similarity >= 0.92) may not catch these because: (a) the phrasing differs enough to drop below 0.92, and (b) the dedup check only looks at the 50 most recent memories for one `user_id`, but if userId is fragmented (Pitfall 4), it searches a completely different memory set. The result is the AI stores 2-5 copies of the same fact from different channels.

**Why it happens:**
The current dedup logic in `POST /add` only checks `WHERE user_id = ?` with `LIMIT 50` ordered by `updated_at DESC`. With fragmented userIds, each channel's memories are isolated. Even with unified userId, the 50-memory window is too small once multi-channel conversation volume grows. The 0.92 threshold is tuned for near-identical text, not semantically equivalent paraphrases.

**How to avoid:**
1. Solve userId unification first (Pitfall 4). Without canonical userId, dedup across channels is impossible.
2. Lower the dedup threshold to 0.85 for cross-channel memories (semantic equivalence, not textual similarity).
3. Remove the `LIMIT 50` from dedup checks or increase it significantly. With vector index (Pitfall 6), this becomes efficient.
4. Add a metadata field `source_channel` to memories so the dedup logic can apply a looser threshold for cross-channel duplicates.
5. Implement a periodic background job that scans for near-duplicate memories across the full store and merges them.

**Warning signs:**
- Memory stats show memory count growing faster than unique facts being discussed
- AI mentions the same fact twice in context ("I know your birthday is March 15. Also, you were born on March 15th.")
- Token budget for memory context is consumed by redundant information

**Phase to address:**
Phase 2 (Cross-Session Memory) -- Dedup improvements depend on userId unification and should be implemented together.

---

### Pitfall 10: QR Code Authentication UX Dead End

**What goes wrong:**
The QR code for WhatsApp authentication must be scanned from the user's phone. In a self-hosted server scenario, the server may be headless, remote, or accessed only through a web browser. The QR code must be transmitted from the server process to the user's browser UI in real-time, refreshed every 20 seconds (whatsapp-web.js) or on timeout (Baileys). If the WebSocket between LivOS UI and the server drops during QR display, the user sees a stale QR code, scans it, and nothing happens. They retry, get frustrated, and abandon setup.

**Why it happens:**
WhatsApp QR codes are time-sensitive tokens. The server generates them, but the user needs to see them in a different context (browser UI). This requires a real-time channel (WebSocket or SSE) from the WhatsApp provider to the frontend. The current channel providers don't have a pattern for UI-interactive setup -- Telegram, Discord, and Slack all use static tokens/bot-tokens entered in a text field. WhatsApp's QR flow is fundamentally different and requires a bidirectional setup flow.

**How to avoid:**
1. Use the existing WebSocket infrastructure (`/ws/agent` pattern from v20.0) to stream QR codes from the WhatsApp provider to the Settings UI in real-time.
2. Display the QR code as a base64-encoded image in the Settings > Integrations > WhatsApp panel. Auto-refresh every 15 seconds (before the 20-second expiry).
3. Show clear status indicators: "Waiting for QR scan...", "QR expired, regenerating...", "Authenticated!", "Session restored from saved state."
4. Also support **pairing codes** as an alternative to QR scanning (Baileys supports this natively with `requestPairingCode(phoneNumber)`). Pairing codes are 8-digit numbers that the user enters on their phone, which works better for remote server setups.
5. Implement a timeout: if QR is not scanned within 5 minutes, stop generating and show "Setup timed out. Click to retry."

**Warning signs:**
- Users report "I scanned the QR but nothing happened"
- QR code in UI doesn't match the current server-side QR (stale display)
- Setup flow hangs indefinitely with spinner
- Users with remote-only server access cannot complete setup

**Phase to address:**
Phase 1 (WhatsApp Core Integration) -- The authentication UX is the first thing users interact with. A broken setup flow means WhatsApp integration is never used.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `useMultiFileAuthState` for Baileys | Works immediately, zero setup | Session corruption, excessive I/O, security risk | Never in production -- only for local dev testing |
| Store WhatsApp auth in filesystem instead of DB | No schema migration needed | Lost on container rebuild, can't survive server migration, no atomic writes | Only during initial prototyping, must migrate before merge |
| Skip userId unification, use channel-specific IDs | Memory works per-channel immediately | Cross-channel recall broken, duplicate memories accumulate, impossible to fix retroactively without data migration | Never -- design the mapping table first, even if empty |
| Brute-force embedding search (current approach) | Simple code, no SQLite extension needed | Blocks event loop at scale, older memories invisible due to LIMIT | Acceptable for first 500 memories per user, must add vector index before cross-channel memory |
| Single `ChannelId` type without WhatsApp | No type changes needed | TypeScript compiler won't catch missing WhatsApp cases in switch statements | Never -- add `'whatsapp'` to the union type immediately |
| Hardcode rate limits instead of configurable | Ship faster | Different users have different risk tolerances, can't adjust without code change | Acceptable for v1 if documented, make configurable in v2 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Baileys WebSocket | Assuming connection is stable; no reconnection logic | Baileys auto-reconnects but fires `connection.update` events. Listen for `connection: 'close'` with `DisconnectReason` and implement exponential backoff for non-recoverable reasons (logged out, banned) vs. auto-retry for transient failures |
| Baileys message handler | Processing `messages.upsert` without checking `type === 'notify'` | Only process `type === 'notify'` messages. `type === 'append'` are historical messages loaded on sync and should not trigger AI responses |
| WhatsApp message format | Assuming all messages have `message.conversation` (plain text) | WhatsApp messages can be `extendedTextMessage`, `imageMessage`, `documentMessage`, etc. Check multiple message type fields. Use Baileys' `getContentType()` utility |
| Memory service auth | Calling memory service without `X-API-Key` header | The memory service requires `requireApiKey` middleware. The API key must match `LIV_API_KEY`. Ensure all internal calls include this header |
| DM Pairing for WhatsApp | Sending pairing code via WhatsApp reply (works for Telegram) | WhatsApp DMs are already from a known phone number. The pairing flow should verify phone number ownership differently -- possibly by sending a code to the Web UI that the user confirms |
| Redis channel pub/sub | Forgetting to create a duplicate Redis connection for subscriptions | ioredis requires `redis.duplicate()` for pub/sub subscribers (current code already does this correctly in ChannelManager). WhatsApp provider must follow the same pattern |
| Daemon inbox | Passing WhatsApp phone number as `from` field | Current code uses `msg.chatId` as the `from` parameter. For WhatsApp, chatId is the phone number with `@s.whatsapp.net` suffix. Ensure the daemon and response routing handle this format |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Embedding computation on every memory add | Slow memory writes, Kimi API rate limits hit | Batch embeddings: queue memories and compute embeddings in batches of 10-20 every 5 seconds | >50 memories/hour (easily reached with multi-channel) |
| Loading all embeddings for cosine similarity | Memory search latency >500ms, event loop blocked | Use sqlite-vec for indexed vector search | >1,000 memories per user |
| QR code generation spam | Server generates QR codes every 20 seconds even when no one is looking | Only generate QR codes when the Settings > WhatsApp panel is actively open (WebSocket-gated) | Continuous unnecessary computation when idle |
| Chromium process per WhatsApp session | 500MB+ RAM per session, OOM risk | Use Baileys (no browser needed) | Immediately on server with <4GB free RAM |
| Synchronous JSON.parse of large embedding arrays | Event loop stalls during memory search | Pre-parse and cache frequently accessed embeddings in Redis, or use binary format with sqlite-vec | >500 concurrent searches/minute |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Installing unofficial Baileys fork | Attacker gains full WhatsApp access, can read all messages, impersonate user | Only install `@whiskeysockets/baileys` from WhiskeySockets. Verify package hash. Check linked devices after pairing |
| Storing WhatsApp auth state unencrypted | Anyone with filesystem access can hijack the WhatsApp session | Encrypt auth state at rest using a key derived from the LivOS server secret (`/data/secrets/jwt`). Decrypt only in memory |
| Exposing QR code endpoint without auth | Anyone who accesses the API can link their phone to the server's WhatsApp | QR code WebSocket must require authenticated LivOS session (admin role). Current tRPC `adminProcedure` pattern should gate this |
| Not sanitizing WhatsApp message content | XSS in memory content, injection in AI prompts | Sanitize all incoming WhatsApp text before storing in memory or passing to AI. Strip HTML, limit length, escape special characters |
| WhatsApp phone number in logs | PII exposure in log files, violates privacy expectations | Mask phone numbers in logs: `+1***5108` instead of `+12025550108`. Only log full numbers at DEBUG level |
| Memory service accessible without auth from other containers | Any container on the Docker network can read/write memories | Memory service already has `requireApiKey`. Ensure it's not bypassed. Bind to 127.0.0.1 only (current config does this correctly) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| QR code too small on mobile browser | User can't scan from phone while viewing on same phone | Show pairing code option alongside QR. Pairing code is an 8-digit number the user types on their phone |
| No feedback during WhatsApp connection | User scans QR, sees nothing for 10-30 seconds, thinks it failed | Show real-time status: "Connecting...", "Syncing messages...", "Loading contacts...", "Ready!" with progress steps |
| WhatsApp disconnects silently | User thinks WhatsApp integration is working, but messages are being dropped | Show connection status badge in the sidebar/channel list. Red badge = disconnected. Trigger push notification on disconnect if PWA is installed |
| Memory search returns too many results | AI context is cluttered, response quality drops | Implement the existing token budget system (already in `/context` endpoint) but calibrate: 2000 tokens is aggressive for multi-channel. Start with 1000 tokens of memory context |
| No way to see what the AI remembers | Users feel creeped out or confused by what the AI knows | Memory management UI must be in v1, not deferred. Show memories as a searchable list with source channel, date, and a delete button per memory |
| WhatsApp setup requires phone to be nearby | Remote server users can't set up WhatsApp without physical phone access to server | Document that QR scanning works remotely through the web UI. Ensure the QR code is transmitted correctly via WebSocket. Pairing code as fallback |

## "Looks Done But Isn't" Checklist

- [ ] **WhatsApp Provider:** `fromMe` filter implemented -- verify echo loop cannot occur by sending a test message and confirming no re-processing
- [ ] **WhatsApp Provider:** Group message handling -- verify bot only responds when mentioned (same pattern as Telegram `activationMode`)
- [ ] **WhatsApp Provider:** Media messages handled -- verify non-text messages (images, documents, stickers) don't crash the handler (graceful skip or process)
- [ ] **Auth State:** Persistence verified across restart -- stop PM2 process, restart, confirm messages still received without QR re-scan
- [ ] **Auth State:** Persistence verified across server reboot -- full system reboot, confirm session survives
- [ ] **userId Mapping:** Cross-channel memory recall tested -- create a memory from Telegram, retrieve it from WhatsApp for the same linked user
- [ ] **Memory Dedup:** Cross-channel dedup tested -- add semantically similar memories from two channels, confirm they merge
- [ ] **Rate Limiting:** Verified under load -- send 20 messages in 1 minute, confirm rate limiter throttles responses without crashing
- [ ] **QR Code Flow:** Tested with network interruption -- disconnect WebSocket during QR display, reconnect, confirm QR refreshes
- [ ] **Session Health:** Tested silent disconnect -- disconnect server network for 30 seconds, reconnect, confirm WhatsApp recovers automatically
- [ ] **Memory Context:** Token budget enforced -- verify memory context never exceeds the configured budget even with 1000+ memories
- [ ] **ChannelId Type:** `'whatsapp'` added to the union type -- verify TypeScript compilation catches all unhandled switch cases

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WhatsApp session dies silently | LOW | Destroy client, clear auth state if corrupted, re-initialize, prompt user for QR scan via UI notification |
| Chromium OOM kills other processes | MEDIUM | `pm2 restart all`, verify Redis data intact, check PostgreSQL wasn't mid-transaction |
| Account banned | HIGH | Cannot recover the phone number. Must register a new WhatsApp account with a different number. All chat history lost. Warn user in advance |
| Auth state corruption (Baileys) | MEDIUM | Delete all auth state from PostgreSQL, prompt user for fresh QR scan. Messages received during downtime are lost |
| userId fragmentation (memories already accumulated) | HIGH | Write a migration script that: (1) creates identity map entries for known users, (2) re-keys existing memories to canonical userId, (3) runs dedup pass on merged memory sets. Must be run carefully with backups |
| Echo loop burns API tokens | LOW | Kill the nexus-core process immediately, add `fromMe` guard, redeploy. API cost is already incurred but capped by per-request cost |
| Malicious package installed | CRITICAL | Immediately unlink all devices from WhatsApp mobile settings. Rotate all credentials. Audit npm packages. Reinstall from verified source |
| Memory embedding dimension mismatch | MEDIUM | If embedding model changes, all existing embeddings become incompatible. Must re-embed all memories or store model version with each embedding for compatibility detection |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Session Death Spiral | Phase 1: WhatsApp Core | Health check endpoint responds, messages arrive within 60s test window |
| Chromium Memory Leak | Phase 1: Library Choice | Use Baileys (no Chromium). If whatsapp-web.js: memory stays under 500MB after 24h soak test |
| Account Ban Risk | Phase 1: Rate Limiting | Rate limiter test: 100 rapid messages queued, only 10/min actually sent |
| userId Fragmentation | Phase 2: Memory Architecture | Same canonical userId returned for Telegram ID and WhatsApp number of same linked user |
| Auth State Loss | Phase 1: Auth Persistence | PM2 restart + server reboot both resume without QR scan |
| Memory Scaling Wall | Phase 2: Vector Index | Search latency under 100ms with 5,000 memories per user |
| Echo Loop | Phase 1: Message Handler | Send test message from server, confirm it does NOT trigger re-processing |
| Supply Chain Attack | Phase 1: Dependency Audit | `pnpm audit`, package hash verified, linked devices checked post-setup |
| Memory Dedup Failure | Phase 2: Dedup Enhancement | Paraphrased fact from two channels merges into single memory entry |
| QR Code UX Dead End | Phase 1: Settings UI | QR refreshes in browser, pairing code alternative works, status indicators accurate |

## Sources

- [whatsapp-web.js session stops receiving messages (GitHub #3812)](https://github.com/pedroslopez/whatsapp-web.js/issues/3812)
- [whatsapp-web.js session disconnect after 2-3 days (GitHub #3224)](https://github.com/pedroslopez/whatsapp-web.js/issues/3224)
- [whatsapp-web.js memory leak after deployment (GitHub #3459)](https://github.com/pedroslopez/whatsapp-web.js/issues/3459)
- [whatsapp-web.js high memory leak ~1GB (GitHub #5817)](https://github.com/pedroslopez/whatsapp-web.js/issues/5817)
- [whatsapp-web.js "Protocol error: Session closed" crash (GitHub #3904)](https://github.com/pedroslopez/whatsapp-web.js/issues/3904)
- [whatsapp-web.js best practices and troubleshooting (DeepWiki)](https://deepwiki.com/pedroslopez/whatsapp-web.js/9-best-practices-and-troubleshooting)
- [whatsapp-web.js authentication strategies (DeepWiki)](https://deepwiki.com/pedroslopez/whatsapp-web.js/2.1-authentication-strategies)
- [Baileys documentation -- connecting](https://baileys.wiki/docs/socket/connecting/)
- [Baileys -- useMultiFileAuthState not for production (npm)](https://www.npmjs.com/package/@whiskeysockets/baileys)
- [baileysauth -- database auth state adapter (GitHub)](https://github.com/rzkytmgr/baileysauth)
- [CSO Online -- malicious Baileys fork "lotusbail" supply chain attack](https://www.csoonline.com/article/4111068/whatsapp-api-worked-exactly-as-promised-and-stole-everything.html)
- [WhatsApp automation ban avoidance guide 2025](https://tisankan.dev/whatsapp-automation-how-do-you-stay-unbanned/)
- [WhatsApp account ban reasons 2025 (Whautomate)](https://whautomate.com/top-reasons-why-whatsapp-accounts-get-banned-in-2025-and-how-to-avoid-them/)
- [Meta's 2026 WhatsApp AI chatbot ban policy (respond.io)](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [Meta's 2026 WhatsApp AI chatbot ban (MEF)](https://mobileecosystemforum.com/2025/12/01/metas-whatsapp-ai-chatbot-ban/)
- [AI-resilient WhatsApp strategies 2026 (AI Journal)](https://aijourn.com/ai-resilient-whatsapp-strategies-navigating-the-2026-account-ban-wave/)
- [sqlite-vec vector search extension](https://github.com/asg017/sqlite-vec)
- [sqlite-vec performance benchmarks (Alex Garcia blog)](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [AI agent with multi-session memory (Towards Data Science)](https://towardsdatascience.com/ai-agent-with-multi-session-memory/)
- [Baileys-2025-Rest-API multi-session support (GitHub)](https://github.com/PointerSoftware/Baileys-2025-Rest-API)

---
*Pitfalls research for: WhatsApp Web Integration & Cross-Session Memory (v25.0)*
*Researched: 2026-04-02*
