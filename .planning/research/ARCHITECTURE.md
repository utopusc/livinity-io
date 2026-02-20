# Architecture Research: v2.0 OpenClaw-Class AI Platform

**Dimension:** Architecture
**Milestone:** v2.0 -- Voice, Canvas, Multi-Agent, Webhooks, Gmail, CLI, Stability
**Date:** 2026-02-20
**Confidence:** HIGH (based on direct codebase analysis of 8+ source files)

---

## Executive Summary

v2.0 adds 11 feature groups to an already-functional LivOS/Nexus system. The existing architecture -- Daemon with inbox pattern, SdkAgentRunner with MCP tools, ChannelManager with provider pattern, Redis state layer, Express API + WsGateway -- provides clean integration seams for every proposed feature. No architectural rewrites are needed. The key insight: most features are either **new MCP tools** (multi-agent sessions, usage tracking), **new channel providers** (Gmail), **new Express routes** (webhooks), **new UI routes** (canvas), or **daemon-level middleware** (commands, DM pairing). The voice pipeline is the only feature requiring a genuinely new component pattern (bidirectional WebSocket audio streaming).

---

## Current Architecture (As Implemented)

Based on direct reading of the production codebase:

```
                    +------------------+
                    |   LivOS Web UI   |  React 18 + Vite + Tailwind
                    |   (port 5173)    |  Routes: ai-chat, schedules, apps, settings
                    +--------+---------+
                             |
                    tRPC + SSE streaming
                             |
                    +--------+---------+
                    |    livinityd     |  System daemon (TypeScript via tsx)
                    |    (port 80)     |  Modules: ai, auth, system
                    +--------+---------+
                             |
                    HTTP POST /api/agent/stream
                             |
+--------+          +--------+---------+          +-----------+
|Telegram|--------->|   Nexus Core     |<-------->|   Redis   |
|Discord |  grammy  |   (port 3200)    |  ioredis | State,    |
|Slack   |  d.js    |                  |          | Queues,   |
|Matrix  |  bolt    | Daemon           |          | Pub/Sub,  |
+--------+  matrix  |  -> inbox[]      |          | History   |
                    |  -> processItem  |          +-----------+
                    |  -> router/agent |
                    |                  |          +-----------+
                    | SdkAgentRunner   |<-------->|PostgreSQL |
                    |  -> query()      |          | Memory,   |
                    |  -> MCP tools    |          | pgvector  |
                    |                  |          +-----------+
                    | Express API      |
                    |  /api/*          |          +-----------+
                    |                  |<-------->|  Docker   |
                    | WsGateway        |          | Apps,     |
                    |  /ws/agent       |          | Chromium  |
                    +------------------+          +-----------+
```

### Critical Integration Points (from codebase)

| Component | File | Integration Surface |
|-----------|------|-------------------|
| **Daemon.addToInbox()** | `daemon.ts:421-435` | Single entry point for ALL message sources. Supports: mcp, cron, daemon, webhook, telegram, discord, slack, matrix, whatsapp |
| **Daemon.processInboxItem()** | `daemon.ts:444-596` | Processing pipeline: commands -> skills -> router -> agent. Response routing via per-request closures |
| **SdkAgentRunner.run()** | `sdk-agent-runner.ts:142-328` | Creates MCP server from ToolRegistry, runs Claude SDK query(), streams events |
| **ChannelManager** | `channels/index.ts:15-241` | Provider registry pattern. Providers: init(), connect(), onMessage(), sendMessage() |
| **ChannelProvider interface** | `channels/types.ts:49-76` | Contract: id, name, init(redis), connect(), disconnect(), getStatus(), sendMessage(), onMessage(), updateConfig(), testConnection() |
| **handleCommand()** | `commands.ts:40-98` | Slash command interception: /help, /think, /verbose, /model, /reset, /status, /stats |
| **SessionManager** | `session-manager.ts:40-351` | Redis-backed sessions with idle timeout, history, pruning. Scoped per-sender or global |
| **WsGateway** | `ws-gateway.ts:110-168` | JSON-RPC 2.0 over WebSocket. Auth on upgrade. Redis pub/sub notifications |
| **Express API** | `api.ts:72-1016` | REST + SSE. /api/agent/stream for web UI. /api/webhook/git existing webhook pattern |
| **AiModule (livinityd)** | `livinityd/modules/ai/index.ts:213-400` | Bridges web UI to Nexus via SSE. Manages conversations, chatStatus tracking, step descriptions |

---

## Feature Integration Architecture

### 1. Voice Pipeline

**Architecture Decision: WebSocket relay service within nexus-core, NOT a separate container.**

The voice pipeline requires real-time bidirectional audio streaming. The existing WsGateway handles JSON-RPC over WebSocket; voice needs a parallel binary-capable WebSocket path.

#### Data Flow

```
Browser (mic)                           Nexus Core                          External APIs
+-----------+     +-----------+     +------------------+     +-----------+
| MediaRecorder|-->| WebSocket |---->| /ws/voice        |---->| Deepgram  |
| getUserMedia |   | binary    |     | VoiceGateway     |     | STT WS   |
+-----------+     | frames    |     |                  |     | nova-3    |
                  +-----------+     | 1. STT relay     |     +-----------+
                                    | 2. Text to Daemon|
                                    | 3. TTS relay     |     +-----------+
+-----------+     +-----------+     | 4. Audio back    |---->| Cartesia  |
| AudioContext|<--| WebSocket |<----| to client        |     | TTS WS   |
| playback   |   | binary    |     +------------------+     | Sonic     |
+-----------+     | PCM/opus  |                              +-----------+
                  +-----------+
```

#### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `VoiceGateway` | `nexus/packages/core/src/voice-gateway.ts` | NEW. WebSocket server on `/ws/voice`. Manages STT/TTS connections per client |
| `DeepgramRelay` | `nexus/packages/core/src/voice/deepgram-relay.ts` | NEW. Forwards browser audio to Deepgram WebSocket, returns transcript events |
| `CartesiaRelay` | `nexus/packages/core/src/voice/cartesia-relay.ts` | NEW. Sends agent response text to Cartesia WebSocket, returns PCM audio chunks |
| `VoiceSession` | `nexus/packages/core/src/voice/session.ts` | NEW. Ties one browser WS to one Deepgram + one Cartesia connection. Manages lifecycle |
| Voice UI | `livos/packages/ui/src/routes/ai-chat/voice-mode.tsx` | NEW. Mic button in ai-chat route. MediaRecorder + AudioContext |

#### Integration with SdkAgentRunner

The VoiceGateway does NOT replace SdkAgentRunner. It wraps it:

```
1. Browser mic audio -> VoiceGateway (binary WS)
2. VoiceGateway -> DeepgramRelay -> transcript text
3. VoiceGateway calls daemon.addToInbox(transcript, 'voice', requestId)
4. Daemon processes normally (commands, skills, agent)
5. Agent result stored in Redis (nexus:answer:{requestId})
6. VoiceGateway polls/subscribes for result
7. Result text -> CartesiaRelay -> PCM audio
8. Audio chunks -> browser WS -> AudioContext playback
```

This means voice is "just another source" for the inbox. All existing processing (commands, skills, agent routing, memory) works unchanged.

#### Configuration

```typescript
// nexus.config.yaml additions
voice:
  enabled: true
  deepgram:
    apiKey: "redis:livos:config:deepgram_api_key"   # Stored in Redis like other keys
    model: "nova-3"
    language: "en"
  cartesia:
    apiKey: "redis:livos:config:cartesia_api_key"
    voiceId: "default"                               # User-selectable voice
    model: "sonic"
    outputFormat: { container: "raw", encoding: "pcm_f32le", sampleRate: 24000 }
```

#### Key Libraries

- `@deepgram/sdk` -- WebSocket STT client. npm package. Handles connection lifecycle, keepAlive.
- `@cartesia/cartesia-js` -- WebSocket TTS client. npm package. Context-based streaming with prosody continuity.
- Browser: `MediaRecorder` API (opus encoding), `AudioContext` + `AudioWorklet` for PCM playback.

#### Why NOT a Separate Container

- Latency: Inter-process/container hops add 5-20ms per hop. Voice needs sub-200ms total.
- State: VoiceGateway needs access to Daemon.addToInbox() and Redis directly.
- Complexity: No need for a message queue between voice service and nexus-core.
- Scale: Single-user self-hosted system. One voice session at a time is fine.

---

### 2. Live Canvas

**Architecture Decision: Sandboxed iframe inside ai-chat route, NOT a separate window.**

#### Approach

The AI generates React/HTML code via a new MCP tool (`canvas_render`). The code is rendered in a sandboxed iframe using `srcdoc`. This is the same pattern used by Claude Artifacts, Vercel v0, and similar tools.

#### Data Flow

```
1. User asks: "Show me a dashboard of server stats"
2. SdkAgentRunner calls mcp__nexus-tools__canvas_render({ code: "<html>..." })
3. Tool stores rendered code in Redis: nexus:canvas:{conversationId}
4. Frontend polls/subscribes via tRPC: ai.getCanvasContent({ conversationId })
5. Canvas component renders code in <iframe sandbox="allow-scripts" srcdoc={code}>
6. postMessage bridge for data exchange between parent and iframe
```

#### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `canvas_render` tool | `daemon.ts` registerTools() | NEW tool. Stores HTML/React code in Redis for canvas display |
| `canvas_update` tool | `daemon.ts` registerTools() | NEW tool. Incrementally updates existing canvas content |
| Canvas panel | `livos/packages/ui/src/routes/ai-chat/canvas-panel.tsx` | NEW. Split-pane view in ai-chat. Sandboxed iframe renderer |
| tRPC endpoints | `livinityd/modules/ai/index.ts` | NEW. `ai.getCanvasContent`, `ai.clearCanvas` |

#### Sandbox Security

```html
<iframe
  sandbox="allow-scripts"
  srcdoc={generatedHtml}
  style="width: 100%; height: 100%; border: none;"
/>
```

The `sandbox="allow-scripts"` attribute:
- Allows JavaScript execution
- Blocks same-origin access (cannot read parent DOM)
- Blocks form submission, popups, top navigation
- Blocks access to localStorage, cookies of parent

For React components, inject Tailwind CSS + React via CDN in the srcdoc template:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${generatedReactCode}
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
```

#### UI Layout

```
+---------------------------------------------------+
|  AI Chat (existing)            |  Canvas Panel    |
|                                |  (new, toggleable)|
|  [User message]               |  +-------------+  |
|  [AI response with code]      |  | Sandboxed   |  |
|  [canvas_render tool call]    |  | iframe with  |  |
|                                |  | live preview |  |
|  [Input box]                  |  +-------------+  |
+---------------------------------------------------+
```

Split-pane with draggable divider. Canvas panel hidden by default, appears when `canvas_render` tool is called. Persists per conversation.

---

### 3. Multi-Agent Sessions

**Architecture Decision: Extend SdkAgentRunner with session context. New MCP tools for session management. No separate SessionManager class needed -- use existing Redis patterns.**

#### Concept

"Sessions" in multi-agent context means: multiple named agent identities sharing a workspace where they can communicate. Each session has a shared message history and agents can be addressed by name.

#### Implementation

This is purely MCP tools + Redis state. No changes to SdkAgentRunner internals.

#### New MCP Tools

```typescript
// Registered in daemon.ts registerTools()

toolRegistry.register({
  name: 'sessions_list',
  description: 'List all active multi-agent sessions',
  parameters: [],
  execute: async () => {
    const keys = await redis.keys('nexus:session:multi:*:meta');
    // ... return session list
  },
});

toolRegistry.register({
  name: 'sessions_create',
  description: 'Create a new multi-agent session with named participants',
  parameters: [
    { name: 'name', type: 'string', required: true },
    { name: 'agents', type: 'array', description: 'Agent names', required: true },
    { name: 'goal', type: 'string', required: false },
  ],
  execute: async (params) => {
    const sessionId = randomUUID();
    await redis.set(`nexus:session:multi:${sessionId}:meta`, JSON.stringify({
      name: params.name, agents: params.agents, goal: params.goal, createdAt: Date.now(),
    }));
    return { success: true, output: `Session ${sessionId} created` };
  },
});

toolRegistry.register({
  name: 'sessions_send',
  description: 'Send a message to a specific agent in a multi-agent session',
  parameters: [
    { name: 'sessionId', type: 'string', required: true },
    { name: 'to', type: 'string', description: 'Target agent name', required: true },
    { name: 'message', type: 'string', required: true },
  ],
  execute: async (params) => {
    // Enqueue task for target agent via BullMQ or direct execution
    // The "to" agent runs with the session context as system prompt prefix
  },
});

toolRegistry.register({
  name: 'sessions_history',
  description: 'Get conversation history of a multi-agent session',
  parameters: [
    { name: 'sessionId', type: 'string', required: true },
    { name: 'limit', type: 'number', required: false },
  ],
  execute: async (params) => {
    const history = await redis.lrange(`nexus:session:multi:${params.sessionId}:history`, 0, params.limit || 50);
    return { success: true, output: history.join('\n') };
  },
});
```

#### Redis Schema

```
nexus:session:multi:{id}:meta       -> JSON { name, agents[], goal, createdAt }
nexus:session:multi:{id}:history    -> LIST of JSON { from, to, message, timestamp }
nexus:session:multi:{id}:state      -> JSON { shared state/workspace data }
```

#### Inter-Agent Communication

When `sessions_send` is called, it does NOT use Redis pub/sub. Instead:

1. Appends message to session history list
2. Spawns a new SdkAgentRunner with:
   - System prompt override including session context + agent persona
   - contextPrefix with session history
   - The target agent's specific instructions
3. Agent result is appended to session history
4. Result returned to caller

This is synchronous within a single inbox processing cycle. For async multi-agent, use existing BullMQ task queue.

---

### 4. Webhook Triggers

**Architecture Decision: New Express routes in api.ts following the existing /api/webhook/git pattern.**

#### Integration Point

The existing `api.ts:156-163` already has a webhook pattern:

```typescript
// EXISTING in api.ts
app.post('/api/webhook/git', async (req, res) => {
  daemon.addToInbox(`New commit pushed to ${ref}. Run tests.`, 'webhook');
  res.json({ ok: true });
});
```

New webhooks follow the exact same pattern.

#### New Routes

```typescript
// api.ts additions

// Generic webhook endpoint with routing
app.post('/api/webhook/:hookId', async (req, res) => {
  const hookId = req.params.hookId;
  const hookConfig = await redis.get(`nexus:webhook:${hookId}`);
  if (!hookConfig) { res.status(404).json({ error: 'Unknown webhook' }); return; }

  const config = JSON.parse(hookConfig);
  const task = config.template
    ? config.template.replace('{{payload}}', JSON.stringify(req.body))
    : `Webhook ${hookId} received: ${JSON.stringify(req.body).slice(0, 2000)}`;

  daemon.addToInbox(task, 'webhook', randomUUID(), {
    webhookId: hookId,
    payload: req.body,
    ...config.params,
  });

  res.json({ ok: true, message: 'Webhook processed' });
});
```

#### Webhook Management Tools

```typescript
// New MCP tools for webhook CRUD
toolRegistry.register({
  name: 'webhook_create',
  description: 'Create a webhook endpoint that triggers agent tasks',
  parameters: [
    { name: 'name', type: 'string', required: true },
    { name: 'template', type: 'string', description: 'Task template (use {{payload}})', required: false },
  ],
  execute: async (params) => {
    const hookId = randomUUID().slice(0, 8);
    await redis.set(`nexus:webhook:${hookId}`, JSON.stringify({
      name: params.name, template: params.template, createdAt: Date.now(),
    }));
    return { success: true, output: `Webhook created: /api/webhook/${hookId}` };
  },
});
```

#### Authentication

Webhooks use the existing `requireApiKey` middleware on `/api/*`. External services include the API key in headers. For public webhooks (GitHub, Stripe), add optional HMAC signature verification per webhook config.

---

### 5. Gmail Integration

**Architecture Decision: New ChannelProvider following the existing pattern, NOT a separate service.**

#### Architecture

Gmail fits perfectly into the ChannelProvider interface:

```typescript
// nexus/packages/core/src/channels/gmail.ts
export class GmailProvider implements ChannelProvider {
  readonly id = 'gmail' as const;
  readonly name = 'Gmail';

  async init(redis: Redis): Promise<void> { /* load OAuth tokens from Redis */ }
  async connect(): Promise<void> { /* start Gmail watch(), setup Pub/Sub */ }
  async disconnect(): Promise<void> { /* stop watch */ }
  async getStatus(): Promise<ChannelStatus> { /* return connection state */ }
  async sendMessage(emailId: string, text: string): Promise<boolean> { /* reply to email */ }
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void { /* register handler */ }
  async updateConfig(config: ChannelConfig): Promise<void> { /* save OAuth config */ }
  async testConnection(): Promise<{ ok: boolean; error?: string }> { /* verify OAuth */ }
}
```

#### Type Extension

The ChannelId type needs extension:

```typescript
// channels/types.ts
export type ChannelId = 'telegram' | 'discord' | 'slack' | 'matrix' | 'gmail';
```

And the daemon.ts source handling needs to include 'gmail' in channel source arrays.

#### Google Pub/Sub Flow

```
1. Gmail watch() -> Google Pub/Sub topic (cloud-hosted)
2. Google Pub/Sub -> push webhook -> POST /api/webhook/gmail-notify
3. Webhook handler -> GmailProvider.handleNotification()
4. GmailProvider fetches new message via Gmail API
5. GmailProvider.messageHandler(incomingMsg) -> daemon.addToInbox()
6. Daemon processes normally
7. Agent response -> GmailProvider.sendMessage() -> Gmail API reply
```

#### OAuth Token Storage

```
Redis keys:
  nexus:gmail:config          -> JSON { enabled, clientId, clientSecret, ... }
  nexus:gmail:tokens          -> JSON { access_token, refresh_token, expiry_date }
  nexus:gmail:status          -> JSON { enabled, connected, email, lastSync }
  nexus:gmail:watch_expiry    -> Unix timestamp (watch must be renewed every 7 days)
```

#### New Dependencies

- `googleapis` -- Google API client. Already a well-established npm package.
- Google Cloud Pub/Sub setup is cloud-side only (no npm package needed; push delivery to our webhook).

#### OAuth Setup UI

New settings panel in LivOS:
```
livos/packages/ui/src/routes/settings/gmail-settings.tsx
```

Flow: User provides Google Cloud project credentials -> UI redirects to Google OAuth consent -> Callback stores tokens in Redis.

---

### 6. Chat Commands (Extended)

**Architecture Decision: Extend the existing `commands.ts` handleCommand() function. No new middleware layer needed.**

#### Current State

`commands.ts` already handles: `/help`, `/think`, `/verbose`, `/model`, `/reset`, `/status`, `/stats`

The interception point is in `daemon.ts:282` (processInboxItem):

```typescript
if (isCommand(item.message) && item.from && this.config.userSessionManager) {
  const cmdResult = await handleCommand(item.message, { ... });
  if (cmdResult?.handled && cmdResult.response) {
    // Send response, skip agent processing
    continue;
  }
}
```

#### New Commands

Add to the `switch` in `handleCommand()`:

```typescript
// commands.ts additions
case 'compact':
  return handleCompact(args, ctx);      // Session compaction

case 'usage':
  return handleUsage(args, ctx);        // Usage stats for current user

case 'sessions':
  return handleSessions(args, ctx);     // List/manage multi-agent sessions

case 'webhook':
case 'hook':
  return handleWebhook(args, ctx);      // Webhook management

case 'voice':
  return handleVoice(args, ctx);        // Voice settings (language, voice ID)

case 'pair':
  return handlePair(args, ctx);         // DM pairing activation code
```

Each handler follows the existing pattern:
- Read-only commands: query Redis, format response, return `{ handled: true, response }`
- State-change commands: update Redis/config, return confirmation

#### No Middleware Needed

The existing pattern works: commands are checked BEFORE agent processing. If `handled === true`, the response goes directly back without spawning an agent. This is already optimal.

---

### 7. DM Pairing

**Architecture Decision: Enforce in ChannelManager message handler, NOT in individual providers.**

#### Current Message Flow

```
TelegramProvider.onMessage(handler) -> handler is set by ChannelManager.onMessage()
ChannelManager.onMessage() -> handler is set in main.ts/entrypoint wiring
handler = (msg) => daemon.addToInbox(msg.text, msg.channel, ...)
```

#### Where to Add Pairing Check

Between ChannelManager receiving a message and forwarding to daemon. Add a method to ChannelManager:

```typescript
// channels/index.ts modification
class ChannelManager {
  private pairingEnabled = false;
  private allowedUsers: Map<ChannelId, Set<string>> = new Map();

  // Called when wiring message handlers
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = async (msg: IncomingMessage) => {
      // DM pairing check
      if (this.pairingEnabled && !this.isAllowed(msg.channel, msg.userId)) {
        const provider = this.providers.get(msg.channel);
        await provider?.sendMessage(msg.chatId, 'Send /pair <code> to activate.');
        return; // Drop message
      }
      await handler(msg);
    };
    // Apply to all providers
    for (const provider of this.providers.values()) {
      provider.onMessage(this.messageHandler);
    }
  }

  private isAllowed(channel: ChannelId, userId: string): boolean {
    const allowed = this.allowedUsers.get(channel);
    return !allowed || allowed.has(userId);
  }
}
```

#### Activation Code Flow

```
1. Admin sends /pair in Telegram -> command handler generates code
2. Code stored: Redis nexus:pair:{code} -> { channel: 'telegram', userId: '123', expiresAt }
3. New user sends /pair ABC123 in Telegram
4. Code validated, user added to allowlist
5. Redis nexus:paired:{channel}:{userId} -> { pairedAt, pairedBy }
```

#### Redis Schema

```
nexus:pair:codes:{code}              -> JSON { channel, expiresAt }  TTL 1 hour
nexus:paired:telegram:{userId}       -> JSON { pairedAt, pairedBy }  no TTL
nexus:paired:discord:{userId}        -> JSON { pairedAt, pairedBy }  no TTL
nexus:config:pairing_enabled         -> "true" / "false"
```

---

### 8. Onboarding CLI

**Architecture Decision: Separate npm package `livinity` published to npm. NOT part of livos/ or nexus/.**

#### Package Structure

```
livinity-cli/
  package.json          # name: "livinity", bin: { livinity: "./dist/index.js" }
  src/
    index.ts            # CLI entrypoint
    prompts/
      domain.ts         # Domain/subdomain setup
      ssl.ts            # SSL certificate (Caddy auto or manual)
      database.ts       # PostgreSQL + Redis connection
      auth.ts           # Claude Code CLI login
      channels.ts       # Telegram/Discord token setup
    actions/
      install.ts        # apt install, Docker, etc.
      configure.ts      # Generate .env, nexus.yaml, Caddyfile
      deploy.ts         # git clone, pnpm install, pm2 setup
      verify.ts         # Health check all services
    templates/
      env.template      # .env template with placeholders
      nexus.yaml        # Default nexus config
      Caddyfile         # Caddy reverse proxy config
```

#### User Experience

```bash
$ npx livinity

  Livinity v2.0 - Self-hosted AI Server Setup

  ? Domain name: livinity.cloud
  ? SSL mode: (auto via Caddy / manual cert)
  ? PostgreSQL: (install locally / use external)
  ? Redis: (install locally / use external)

  Installing dependencies...
  Configuring services...
  Starting LivOS + Nexus...

  ? Claude Code login: Opening browser for OAuth...
  ? Telegram bot token: (paste from @BotFather)

  All services running!
  Dashboard: https://livinity.cloud
```

#### Key Dependencies

- `@inquirer/prompts` -- Interactive CLI prompts
- `chalk` -- Terminal colors
- `ora` -- Spinners
- `execa` -- Shell command execution

#### Integration with Existing System

The CLI generates the same files that manual setup creates:
- `/opt/livos/.env`
- `/opt/nexus/.env`
- `/opt/nexus/nexus.yaml`
- `/etc/caddy/Caddyfile`
- PM2 ecosystem file

It does NOT replace install.sh -- it wraps it with an interactive experience.

---

### 9. Session Compaction

**Architecture Decision: New command (/compact) + automatic trigger in SessionManager. NOT a separate service.**

#### Integration Points

1. **Manual trigger**: `/compact` command in `commands.ts`
2. **Automatic trigger**: Token threshold check in SessionManager.updateSession()
3. **Compaction logic**: Summarize old history, replace with summary, keep recent N messages

#### Implementation

```typescript
// session-manager.ts addition
async compactSession(senderId: string, options?: {
  keepRecent?: number;      // Messages to keep verbatim (default: 10)
  maxTokens?: number;       // Target token count after compaction
}): Promise<{ compacted: boolean; messagesBefore: number; messagesAfter: number }> {
  const history = await this.getHistory(senderId);
  if (history.length <= (options?.keepRecent || 10)) {
    return { compacted: false, messagesBefore: history.length, messagesAfter: history.length };
  }

  const keepRecent = options?.keepRecent || 10;
  const toSummarize = history.slice(0, -keepRecent);
  const toKeep = history.slice(-keepRecent);

  // Use Brain to summarize old messages
  const summaryText = await this.summarize(toSummarize);

  // Replace history: [summary] + [recent messages]
  const historyKey = `${REDIS_HISTORY_PREFIX}${this.getSessionId(senderId)}`;
  await this.redis.del(historyKey);

  // Push summary as first entry
  await this.redis.rpush(historyKey, JSON.stringify({
    role: 'system', content: `[Compacted summary of ${toSummarize.length} messages]: ${summaryText}`,
    timestamp: Date.now(),
  }));

  // Push recent messages
  for (const msg of toKeep) {
    await this.redis.rpush(historyKey, JSON.stringify(msg));
  }

  return { compacted: true, messagesBefore: history.length, messagesAfter: toKeep.length + 1 };
}
```

#### Auto-Trigger

In `Daemon.processInboxItem()`, after agent completes:

```typescript
// After result comes back from agent
if (result.totalInputTokens + result.totalOutputTokens > 100_000) {
  const session = await this.config.sessionManager?.getSession(item.from);
  if (session && session.messageCount > 20) {
    await this.config.sessionManager.compactSession(item.from);
    logger.info('Auto-compacted session', { senderId: item.from });
  }
}
```

---

### 10. Usage Tracking

**Architecture Decision: Redis counters (real-time) + PostgreSQL (historical). Integrated into SdkAgentRunner result handling.**

#### Integration Points

Two places already track usage:
1. `daemon.ts:1052-1056` -- `userSessionManager.recordUsage(intent.from, totalTokens)`
2. `session-manager.ts:163-170` -- `session.inputTokens`, `session.outputTokens`

Extend these, don't replace.

#### Redis Schema (Real-Time)

```
nexus:usage:daily:{YYYY-MM-DD}:tokens     -> INCRBY per request
nexus:usage:daily:{YYYY-MM-DD}:requests   -> INCR per request
nexus:usage:daily:{YYYY-MM-DD}:tools      -> INCRBY (tool call count)
nexus:usage:user:{userId}:tokens           -> INCRBY per request
nexus:usage:user:{userId}:requests         -> INCR per request
nexus:usage:model:{tier}:tokens            -> INCRBY per request (by model tier)
```

#### Reporting Endpoint

New API route + tRPC endpoint:

```typescript
// api.ts addition
app.get('/api/usage', async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  const usage = [];
  for (let i = 0; i < days; i++) {
    const date = /* format YYYY-MM-DD for today - i */;
    const tokens = await redis.get(`nexus:usage:daily:${date}:tokens`) || '0';
    const requests = await redis.get(`nexus:usage:daily:${date}:requests`) || '0';
    usage.push({ date, tokens: parseInt(tokens), requests: parseInt(requests) });
  }
  res.json({ usage });
});
```

#### /usage Command

```typescript
// commands.ts addition
async function handleUsage(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const session = await ctx.userSession.get(ctx.jid);
  const today = new Date().toISOString().split('T')[0];
  // ... format usage stats
  return { handled: true, response: `Usage stats: ${session.totalTokens} tokens, ...` };
}
```

---

### 11. Stability Fixes

#### 11a. nexus-core 153 Restarts

**Root Cause Analysis:** PM2 restart count accumulates over time. The real question is: is it crashing or being manually restarted?

**Crash Guards to Add:**

```typescript
// main.ts / entrypoint modifications

// 1. Global uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.fatal('Uncaught exception', { error: err.message, stack: err.stack });
  // Graceful shutdown instead of instant crash
  gracefulShutdown().then(() => process.exit(1));
});

// 2. Unhandled promise rejection handler
process.on('unhandledRejection', (reason) => {
  logger.fatal('Unhandled rejection', { reason: String(reason) });
  // Log but don't crash -- most are recoverable
});

// 3. SdkAgentRunner error isolation
// Already implemented: sdk-agent-runner.ts:313-327 catches errors
// BUT: errors in MCP tool execution can bubble up uncaught

// 4. Redis reconnection handling
redis.on('error', (err) => {
  logger.error('Redis error (non-fatal)', { error: err.message });
  // Don't crash -- ioredis auto-reconnects
});

// 5. Channel provider isolation
// Each provider should catch its own errors in message handlers
// Currently: TelegramProvider.bot.catch() exists (line 139)
// Ensure all providers have equivalent error boundaries
```

#### 11b. Memory Service Empty Results

**Integration Point:** `daemon.ts:921-947` fetches memory context with a 2-second timeout:

```typescript
const memoryFetchWithTimeout = Promise.race([
  fetch('http://localhost:3300/context', { ... }),
  new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
]);
```

**Root Causes to Investigate:**
1. Memory service (port 3300) might be down -- add health check
2. pgvector embeddings might not be populated -- check embedding pipeline
3. 2-second timeout might be too aggressive for cold queries
4. The `query` field (task.slice(0, 500)) might not match stored embeddings well

**Fixes:**
```typescript
// 1. Health check before query
const memHealthy = await fetch('http://localhost:3300/health').then(r => r.ok).catch(() => false);
if (!memHealthy) { logger.warn('Memory service unhealthy, skipping context'); }

// 2. Increase timeout to 5s
setTimeout(() => reject(new Error('timeout')), 5000)

// 3. Add fallback: if context returns empty, try with just the latest message
if (!memData.context || memData.memoriesUsed === 0) {
  // Retry with simpler query
}
```

#### 11c. SdkAgentRunner Built-in Tool Leak

**Current State:** `sdk-agent-runner.ts:235` already sets `tools: []` to disable built-in Claude Code tools:

```typescript
const messages = query({
  prompt: task,
  options: {
    tools: [],        // Disable built-in Claude Code tools
    allowedTools,     // Auto-approve all Nexus MCP tools
    ...
  },
});
```

**The Problem:** Claude Code SDK might still expose some built-in tools despite `tools: []`. The `allowedTools` list only auto-approves listed tools, but Claude might attempt to call unlisted ones.

**Fix:**

```typescript
// Option 1: Explicit deny in system prompt
systemPrompt += `\n\nIMPORTANT: You may ONLY use tools prefixed with mcp__nexus-tools__ or mcp__chrome-devtools__. Do NOT attempt to use any other tools (Read, Write, Bash, etc.) -- they are not available.`;

// Option 2: Filter tool_use blocks before execution
// In the message processing loop, check if tool name matches allowed patterns
if (block.type === 'tool_use' && !block.name.startsWith('mcp__')) {
  logger.warn('Blocked unauthorized tool call', { tool: block.name });
  // Skip or return error
}
```

---

## Component Dependency Graph

```
INDEPENDENT (can build in parallel):
  Webhook Routes ---------> daemon.addToInbox('webhook')
  Chat Commands ----------> commands.ts switch cases
  DM Pairing -------------> ChannelManager middleware
  Usage Tracking ----------> Redis INCR + API route
  Stability Fixes ---------> crash guards + error isolation
  Onboarding CLI ----------> separate npm package

SEQUENTIAL DEPENDENCIES:
  Voice Pipeline:
    VoiceGateway (new WS path) -> DeepgramRelay -> CartesiaRelay
    -> Voice UI component in ai-chat

  Canvas:
    canvas_render tool -> Redis storage -> Canvas UI panel
    -> iframe sandbox template

  Gmail:
    ChannelId type extension -> GmailProvider -> OAuth UI
    -> Google Pub/Sub webhook -> daemon.addToInbox()

  Multi-Agent:
    sessions_* MCP tools -> Redis schema
    -> daemon integration for spawning sub-agents

  Session Compaction:
    SessionManager.compactSession() -> Brain.summarize()
    -> /compact command -> auto-trigger in daemon
```

---

## Suggested Build Order

Based on dependencies, risk, and value delivery:

### Phase 1: Foundation (Stability + Commands + Tracking)
**Rationale:** Fix what's broken before adding new features. Commands and tracking are low-risk, high-utility.

1. **Stability fixes** -- crash guards, memory service diagnosis, tool leak fix
2. **Chat commands extension** -- /compact, /usage, /sessions, /pair, /voice, /webhook
3. **Usage tracking** -- Redis counters, /usage command, API endpoint

### Phase 2: Communication (Webhooks + Gmail + DM Pairing)
**Rationale:** Expands how users interact with the system. Builds on existing patterns.

4. **Webhook triggers** -- Express routes, webhook management tools
5. **DM pairing** -- ChannelManager middleware, activation codes
6. **Gmail integration** -- GmailProvider, OAuth flow, Pub/Sub webhook

### Phase 3: Intelligence (Multi-Agent + Session Compaction)
**Rationale:** Enhances the AI capabilities. Depends on stable foundation.

7. **Multi-agent sessions** -- MCP tools, Redis schema, session spawning
8. **Session compaction** -- SessionManager extension, auto-trigger

### Phase 4: Experience (Voice + Canvas)
**Rationale:** Highest complexity features. Depend on everything else being stable.

9. **Live canvas** -- canvas_render tool, iframe sandbox, split-pane UI
10. **Voice pipeline** -- VoiceGateway, Deepgram relay, Cartesia relay, voice UI

### Phase 5: Distribution (CLI)
**Rationale:** Onboarding CLI is independent but should be built last when all features are stable.

11. **Onboarding CLI** -- Interactive setup wizard, npm package

---

## What NOT to Build

| Skip | Reason |
|------|--------|
| Separate voice microservice | Latency-critical, needs direct daemon access. In-process is correct. |
| Docker container for sandbox | Browser iframe is sufficient for AI-generated UI code. MicroVMs are overkill for self-hosted single-user. |
| GraphQL API layer | Existing REST + tRPC + WebSocket + SSE covers all needs. Adding GraphQL adds complexity for no gain. |
| Custom email server | Gmail API handles send/receive. No need for SMTP/IMAP infrastructure. |
| Agent orchestration framework | The existing Daemon inbox + SdkAgentRunner + BullMQ pattern IS the orchestration. No need for LangGraph/CrewAI. |
| WebRTC for voice | WebSocket is simpler and sufficient for single-user. WebRTC adds complexity (STUN/TURN) for no benefit. |
| Kubernetes/Docker Swarm | Single-server deployment. PM2 + Docker Compose is correct. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Voice latency exceeds 500ms | Medium | High | Direct WS relay (no queuing), Deepgram nova-3 (fastest model), Cartesia Sonic (135ms first chunk) |
| Deepgram/Cartesia API costs | Medium | Medium | Usage tracking enables monitoring. Voice is opt-in. Consider offline STT (Whisper) as future fallback |
| Gmail OAuth complexity | Medium | Medium | Google APIs are well-documented. Use googleapis npm package. Many examples available |
| Canvas iframe security | Low | High | sandbox="allow-scripts" is battle-tested. No same-origin access, no storage access |
| Multi-agent infinite loops | Medium | Medium | maxTurns limit on sub-agent execution. Session history size limit. Timeout per agent |
| Onboarding CLI maintenance | Medium | Low | CLI is thin wrapper over existing setup. Changes to infra require CLI updates |
| ChannelId type expansion breaking | Low | Medium | Add 'gmail' to union type. Update all switch/if statements referencing ChannelId |

---

## Sources

- Codebase analysis: Direct reading of `daemon.ts`, `sdk-agent-runner.ts`, `telegram.ts`, `channels/types.ts`, `channels/index.ts`, `session-manager.ts`, `commands.ts`, `api.ts`, `ws-gateway.ts`, `ai-chat/index.tsx`, `livinityd/modules/ai/index.ts`
- [Deepgram WebSocket STT docs](https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio)
- [Deepgram JS SDK](https://github.com/deepgram/deepgram-js-sdk)
- [Cartesia TTS WebSocket docs](https://docs.cartesia.ai/api-reference/tts/tts)
- [Cartesia JS SDK](https://github.com/cartesia-ai/cartesia-js)
- [Gmail API Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push)
- [Redis multi-agent session management patterns](https://redis.io/blog/ai-agent-architecture-patterns/)
- [Iframe sandbox security](https://medium.com/@muyiwamighty/building-a-secure-code-sandbox-what-i-learned-about-iframe-isolation-and-postmessage-a6e1c45966df)
