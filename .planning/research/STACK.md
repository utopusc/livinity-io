# Technology Stack: LivOS v2.0 -- OpenClaw-Class AI Platform

**Project:** LivOS v2.0 -- Voice, Canvas, Multi-Agent, Webhooks, Gmail, CLI, DM Security
**Researched:** 2026-02-20
**Overall confidence:** HIGH (verified via official docs, npm registry, API references, existing codebase)

**Important context:** LivOS uses Claude Code Auth (subscription mode) via `@anthropic-ai/claude-agent-sdk` and `SdkAgentRunner`. The system does NOT use direct API keys. All AI interactions flow through the SDK's `query()` function, which spawns Claude Code CLI as a subprocess. This constrains which Claude API features are directly available (e.g., compaction must be implemented at the SDK/session level, not raw API level).

---

## 1. Voice Wake/Talk Mode: Cartesia (TTS) + Deepgram (STT)

### 1a. Cartesia TTS -- Text-to-Speech

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@cartesia/cartesia-js` | Official TypeScript SDK |
| Version | `^2.2.9` (stable) | Latest stable; v3.x exists in beta but avoid beta for production |
| WebSocket endpoint | `wss://api.cartesia.ai/tts/websocket` | Persistent connection, ~200ms saved per request |
| API version | `2025-04-16` | Latest stable API revision |
| Auth | `X-API-Key` header with API key | Standard API key from Cartesia dashboard |
| Default model | `sonic-3` | Cartesia Sonic 3 -- sub-100ms TTFB, natural prosody, laughter/emotion |

**WebSocket TTS Request Format:**

```typescript
// Client sends JSON over WebSocket:
{
  model_id: "sonic-3",
  transcript: "Hello, how can I help you?",
  voice: {
    mode: "id",
    id: "a0e99841-438c-4a64-b679-ae501e7d6091"  // pre-cloned voice ID
  },
  output_format: {
    container: "raw",
    encoding: "pcm_s16le",
    sample_rate: 24000
  },
  language: "en",
  context_id: "session-uuid"   // maintains prosody across chunks
}

// Server sends binary PCM audio chunks back
```

**Key Features:**
- Multiplexing: multiple generations over single WebSocket connection
- Input streaming: send text as LLM generates it, get audio back in real-time
- Timestamped transcripts: word-level timing for subtitle overlay
- 15+ languages supported

**Pricing (Cartesia plans):**

| Plan | Monthly | Credits | TTS Rate | Concurrency |
|------|---------|---------|----------|-------------|
| Free | $0 | 10,000 | 1 credit/char | 1 parallel |
| Pro | $5 | 100,000 | 1 credit/char | 3 parallel |
| Startup | $49 | 1,250,000 | 1 credit/char | 5 parallel |
| Scale | $299 | 8,000,000 | 1 credit/char | 10 parallel |

**Practical cost:** A typical response of 500 characters costs 500 credits. On the Free tier (10k credits), that's ~20 spoken responses/month. Pro tier (100k credits) gives ~200 responses/month at $5. For a self-hosted personal server, the Startup tier ($49/month, ~2,500 responses) is the sweet spot.

**Integration with LivOS:** Cartesia WebSocket connects from the Nexus backend. When Claude produces text, stream it to Cartesia and relay PCM audio to the frontend via WebSocket. The frontend uses the Web Audio API to play PCM chunks in real-time.

**Confidence:** HIGH -- verified via [Cartesia Docs](https://docs.cartesia.ai/api-reference/tts/websocket), [npm registry](https://www.npmjs.com/package/@cartesia/cartesia-js), [pricing page](https://cartesia.ai/pricing).

---

### 1b. Deepgram STT -- Speech-to-Text

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@deepgram/sdk` | Official JavaScript SDK (isomorphic) |
| Version | `^4.11.3` | Latest stable, last published ~2 months ago |
| WebSocket endpoint | `wss://api.deepgram.com/v1/listen` | Full-duplex streaming transcription |
| Auth | `Authorization: Token <api_key>` | API key from Deepgram dashboard |
| Default model | `nova-3` | Best accuracy, sub-200ms latency |

**WebSocket STT Protocol:**

```typescript
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

const deepgram = createClient(DEEPGRAM_API_KEY);

const connection = deepgram.listen.live({
  model: 'nova-3',
  language: 'en',
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
  smart_format: true,    // auto-punctuation
  interim_results: true, // partial transcriptions for real-time display
  vad_events: true,      // voice activity detection
});

// Events
connection.on(LiveTranscriptionEvents.Open, () => { /* connected */ });
connection.on(LiveTranscriptionEvents.Transcript, (data) => {
  // data.channel.alternatives[0].transcript
  // data.is_final -- true when utterance is complete
  // data.speech_final -- true when speaker paused
});
connection.on(LiveTranscriptionEvents.SpeechStarted, () => { /* user started talking */ });
connection.on(LiveTranscriptionEvents.UtteranceEnd, () => { /* user stopped talking */ });

// Send audio: raw PCM buffer
connection.send(audioBuffer);

// Keep alive (if paused)
connection.keepAlive();

// Close
connection.requestClose();
```

**Key Features:**
- Nova-3: state-of-the-art accuracy, 50+ languages
- Interim results: show partial text as user speaks
- VAD (Voice Activity Detection): detect when user starts/stops speaking
- Smart format: auto-punctuation, numbers, dates
- Speaker diarization: multi-speaker separation (add-on)

**Pricing (Deepgram pay-as-you-go):**

| Model | Per Minute | Per Hour | Notes |
|-------|-----------|----------|-------|
| Nova-3 (mono) | $0.0077 | $0.46 | Best accuracy |
| Nova-3 (multi) | $0.0092 | $0.55 | Multilingual |
| Nova-2 | $0.0058 | $0.35 | Previous gen |

**Free tier:** $200 in credits, no expiration, no credit card required. At $0.0077/min, that's ~430 hours of transcription -- generous for development and light personal use.

**Add-ons:** Diarization +$0.002/min, Redaction +$0.002/min, Keyterm prompting +$0.0013/min.

**Integration with LivOS:** Browser captures microphone via MediaRecorder API (PCM 16-bit, 16kHz). Audio chunks stream to Nexus backend via WebSocket. Nexus relays to Deepgram. Transcription results stream back to frontend for display and to Claude for processing.

**Confidence:** HIGH -- verified via [Deepgram Streaming Reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [npm registry](https://www.npmjs.com/package/@deepgram/sdk), [pricing page](https://deepgram.com/pricing).

---

### 1c. Voice Pipeline Architecture

```
Browser Mic -> WebSocket -> Nexus Backend -> Deepgram STT (WebSocket)
                                                |
                                          Transcript
                                                |
                                          SdkAgentRunner (Claude)
                                                |
                                          Response Text
                                                |
                                          Cartesia TTS (WebSocket)
                                                |
                                          PCM Audio Chunks
                                                |
Nexus Backend <- WebSocket <- Browser Speaker (Web Audio API)
```

**Frontend requirements (no new npm packages):**
- `MediaRecorder` API for mic capture (built-in)
- `AudioContext` / `AudioWorkletNode` for PCM playback (built-in)
- Existing WebSocket connection to Nexus for bidirectional audio relay

**Backend new dependencies:**

```bash
cd nexus/packages/core
npm install @cartesia/cartesia-js@^2.2.9 @deepgram/sdk@^4.11.3
```

**Configuration (Redis-based):**

```
nexus:config:cartesia_api_key = "sk-cart-..."
nexus:config:deepgram_api_key = "dg-..."
nexus:config:voice_id = "a0e99841-..."  (Cartesia voice UUID)
nexus:config:voice_enabled = "true"
```

---

## 2. Live Canvas: AI-Generated Interactive UI

### Recommended Approach: Sandboxed iframe with srcdoc

**Do NOT use:** Sandpack (CodeSandbox runtime), tldraw, or any heavy framework.

**Why:** The Live Canvas for LivOS is NOT a code editor or whiteboard. It's a space where Claude can render React components, HTML visualizations, charts, and interactive UIs as "artifacts" -- similar to Claude Artifacts on claude.ai or OpenAI Canvas. The goal is lightweight artifact rendering, not a full IDE.

**Recommended stack:**

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Renderer | `<iframe sandbox="allow-scripts" srcdoc={...}>` | Isolated execution, no new dependencies |
| Styling | Tailwind CSS (CDN in iframe) | Consistent with LivOS UI |
| React in iframe | React CDN (standalone) | For interactive component rendering |
| Chart library | Recharts or Chart.js (CDN) | Data visualization in artifacts |
| Communication | `window.postMessage()` | iframe <-> parent communication |

**Implementation pattern:**

```tsx
// Parent component
function LiveCanvas({ artifact }: { artifact: CanvasArtifact }) {
  const srcdoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body>
      <div id="root"></div>
      <script>${artifact.code}</script>
    </body>
    </html>
  `;

  return (
    <iframe
      sandbox="allow-scripts"
      srcdoc={srcdoc}
      className="w-full h-full border-0 rounded-lg"
    />
  );
}
```

**Artifact types the canvas should support:**

| Type | Rendering | Example |
|------|-----------|---------|
| `react` | React component via CDN | Interactive dashboards, forms |
| `html` | Raw HTML/CSS/JS | Static visualizations |
| `markdown` | Rendered markdown | Documents, notes |
| `chart` | Recharts/Chart.js | Data visualizations |
| `svg` | Inline SVG | Diagrams, icons |
| `mermaid` | Mermaid.js CDN | Flowcharts, sequence diagrams |

**Security:** The `sandbox="allow-scripts"` attribute without `allow-same-origin` prevents the iframe from accessing the parent page's DOM, cookies, or storage. This is critical -- Claude-generated code runs in a fully isolated context.

**No new npm dependencies needed.** This is purely a frontend component using browser-native iframe sandboxing with CDN-loaded libraries inside the iframe.

**Reference implementations:**
- [LangChain open-canvas](https://github.com/langchain-ai/open-canvas) -- MIT licensed, React-based artifact viewer
- Claude.ai Artifacts -- same iframe-based isolation pattern
- [Vercel AI SDK Canvas component](https://ai-sdk.dev/elements/components/canvas) -- React Flow-based (heavier than needed)

**Confidence:** HIGH -- iframe sandboxing is a well-understood browser feature. The pattern is proven by Claude Artifacts and open-canvas.

---

## 3. Multi-Agent Sessions

### Pattern: Shared Redis Session State with Message Passing

**No new dependencies needed.** Multi-agent coordination uses existing infrastructure:
- `SdkAgentRunner` for spawning Claude agents
- `SessionManager` (Redis-based) for shared state
- `BullMQ` for task queuing
- `ws` WebSocket for real-time updates

**Recommended tools to expose to Claude (MCP tools via SdkAgentRunner):**

```typescript
// Tool definitions for multi-agent coordination
const multiAgentTools = {
  sessions_list: {
    description: "List all active agent sessions",
    params: {},
    handler: async () => {
      // Query Redis for active sessions: nexus:agent_sessions:*
      return sessionManager.listActiveSessions();
    }
  },

  sessions_history: {
    description: "Get message history of a specific session",
    params: { session_id: z.string() },
    handler: async ({ session_id }) => {
      return sessionManager.getHistory(session_id);
    }
  },

  sessions_send: {
    description: "Send a message or task to another agent session",
    params: {
      session_id: z.string(),
      message: z.string(),
      wait_for_response: z.boolean().optional()
    },
    handler: async ({ session_id, message, wait_for_response }) => {
      // Publish task to agent's BullMQ queue
      return taskManager.enqueueForSession(session_id, message, wait_for_response);
    }
  }
};
```

**Redis data model for multi-agent:**

```
nexus:agent_sessions                    # HASH: session_id -> JSON state
nexus:agent_session:{id}:history        # LIST: message history
nexus:agent_session:{id}:status         # STRING: "running" | "idle" | "waiting"
nexus:agent_session:pubsub              # PUBSUB channel for inter-session events
```

**Coordination pattern:** Centralized orchestration via the primary agent. The user talks to agent A. Agent A can use `sessions_send` to delegate subtasks to agent B. Agent B's results come back via BullMQ completion events. This is the "puppeteer" pattern -- one orchestrating agent, multiple worker agents.

**Confidence:** HIGH -- pure architecture, uses existing Redis + BullMQ infrastructure.

---

## 4. LivHub Skills Registry: Enhanced Install Gating

### Pattern: Git-based Registry with Manifest Validation

**No new dependencies needed.** The existing `SkillRegistryClient` and `SkillInstaller` already handle Git-based skill installation. Enhancements needed:

| Enhancement | Implementation | Effort |
|-------------|---------------|--------|
| Install gating (trust levels) | Add `trust_level` field to skill manifest | LOW |
| Version pinning | Use git tags/branches in skill URLs | LOW |
| Dependency resolution | Parse `dependencies` array in manifest | MEDIUM |
| Permission declaration | Add `required_permissions` to manifest | LOW |
| Uninstall/disable | Add skill lifecycle management | LOW |

**Enhanced skill manifest (livinity-skill.yaml):**

```yaml
name: gmail-monitor
version: 1.0.0
description: Monitor Gmail inbox and notify on important emails
author: utopusc
trust_level: community    # "official" | "verified" | "community"
required_permissions:
  - network               # can make HTTP requests
  - filesystem:read       # can read files
  - tools:gmail_*         # can use gmail-related tools
dependencies:
  - skill:email-utils@^1.0.0
min_nexus_version: "2.0.0"
```

**Install gating flow:**
1. User or agent requests skill install
2. Fetch manifest from Git repo
3. Check `trust_level` -- if "community", require explicit user approval
4. Validate `required_permissions` against system policy
5. Resolve dependencies
6. Install to `/data/skills/{name}/`

**Confidence:** HIGH -- extends existing infrastructure, no new dependencies.

---

## 5. Webhook Triggers: Incoming Webhooks -> Agent Tasks

### Recommended Pattern: Express Route + HMAC + BullMQ

**No new dependencies needed.** Uses existing Express server + BullMQ.

**Implementation:**

```typescript
// New route: POST /api/webhooks/:webhookId
router.post('/api/webhooks/:webhookId', express.raw({ type: '*/*' }), async (req, res) => {
  const { webhookId } = req.params;

  // 1. Look up webhook config from Redis
  const config = await redis.hget('nexus:webhooks', webhookId);
  if (!config) return res.status(404).json({ error: 'Unknown webhook' });

  const webhook = JSON.parse(config);

  // 2. Verify HMAC signature (if secret configured)
  if (webhook.secret) {
    const signature = req.headers['x-webhook-signature'] as string;
    const expected = crypto
      .createHmac('sha256', webhook.secret)
      .update(req.body)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // 3. Acknowledge immediately (webhook best practice)
  res.status(200).json({ received: true });

  // 4. Enqueue task for async processing via BullMQ
  await taskQueue.add('webhook-trigger', {
    webhookId,
    payload: JSON.parse(req.body.toString()),
    headers: req.headers,
    timestamp: Date.now(),
    task: webhook.agentTask,  // e.g., "Analyze this GitHub push event"
  });
});
```

**Webhook configuration (Redis):**

```
nexus:webhooks              # HASH: webhookId -> JSON config
nexus:webhook_log:{id}      # LIST: delivery log (last 100 entries)
```

**Webhook config schema:**

```typescript
interface WebhookConfig {
  id: string;              // UUID
  name: string;            // Human-readable name
  secret?: string;         // HMAC shared secret
  agentTask: string;       // Template: "Process this {source} webhook: {payload}"
  enabled: boolean;
  createdAt: number;
  lastTriggered?: number;
  triggerCount: number;
}
```

**Security patterns:**
- HMAC-SHA256 verification with `crypto.timingSafeEqual` (timing-safe comparison)
- Rate limiting per webhook ID (existing Express middleware)
- Payload size limit via `express.raw({ limit: '1mb' })`
- Idempotency via deduplication key in BullMQ (`jobId` from payload hash)

**Confidence:** HIGH -- standard webhook pattern, uses existing Express + BullMQ.

---

## 6. Gmail Integration: Google Pub/Sub Push Notifications

### Required Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `googleapis` | `^144.0.0` | Official Google APIs client (Gmail, OAuth2) |
| `@google-cloud/pubsub` | `^4.8.0` | Google Cloud Pub/Sub client for receiving notifications |

```bash
cd nexus/packages/core
npm install googleapis@^144.0.0 @google-cloud/pubsub@^4.8.0
```

### OAuth2 Scopes Required

```typescript
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',   // Read emails
  'https://www.googleapis.com/auth/gmail.modify',      // Mark as read, archive
  // NOT 'https://mail.google.com/' -- too broad
];

const PUBSUB_SCOPE = 'https://www.googleapis.com/auth/pubsub';
```

### Setup Flow (One-time)

1. **Create Google Cloud Project** with Gmail API + Pub/Sub API enabled
2. **Create Pub/Sub topic:** `projects/{project}/topics/gmail-notifications`
3. **Grant publish rights** to `gmail-api-push@system.gserviceaccount.com` on the topic
4. **Create OAuth2 credentials** (Web Application type) with redirect URI
5. **User authorizes** via OAuth2 consent flow -> store refresh token in Redis

### Watch Implementation

```typescript
import { google } from 'googleapis';

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Start watching inbox (must renew every 7 days!)
const watchResponse = await gmail.users.watch({
  userId: 'me',
  requestBody: {
    topicName: 'projects/livinity/topics/gmail-notifications',
    labelIds: ['INBOX'],
    labelFilterBehavior: 'INCLUDE',
  },
});

// Returns: { historyId: "12345", expiration: "1708300000000" }
```

### Notification Handling

```typescript
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({ projectId: 'livinity' });
const subscription = pubsub.subscription('gmail-push-sub');

subscription.on('message', async (message) => {
  const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
  // data = { emailAddress: "user@gmail.com", historyId: "9876543210" }

  // Fetch new messages since last known historyId
  const history = await gmail.users.history.list({
    userId: 'me',
    startHistoryId: lastKnownHistoryId,
    historyTypes: ['messageAdded'],
  });

  // Process new messages -> trigger agent task
  for (const record of history.data.history || []) {
    for (const msg of record.messagesAdded || []) {
      await taskQueue.add('gmail-trigger', {
        messageId: msg.message.id,
        task: 'New email received. Check if it requires action.',
      });
    }
  }

  message.ack();
});
```

### Critical: Watch Renewal

Gmail watch expires after **7 days maximum**. Use `node-cron` (already installed) to renew daily:

```typescript
import cron from 'node-cron';

// Renew Gmail watch daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  await gmail.users.watch({ userId: 'me', requestBody: { ... } });
  logger.info('Gmail watch renewed');
});
```

### Configuration (Redis-based)

```
nexus:config:gmail_enabled        = "true"
nexus:config:gmail_client_id      = "xxx.apps.googleusercontent.com"
nexus:config:gmail_client_secret  = "GOCSPX-..."
nexus:config:gmail_refresh_token  = "1//0g..."
nexus:config:gmail_history_id     = "12345"
nexus:config:gmail_watch_expiry   = "1708300000000"
nexus:config:gcp_project_id       = "livinity"
nexus:config:gcp_service_account  = "{...json...}"  // for Pub/Sub auth
```

### Alternative: Polling (Simpler, No Pub/Sub)

If Google Cloud Pub/Sub setup is too complex for self-hosted users, provide a polling fallback:

```typescript
// Poll every 60 seconds instead of push notifications
cron.schedule('*/1 * * * *', async () => {
  const messages = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread newer_than:2m',
  });
  // Process new messages
});
```

**Recommendation:** Implement polling first (simpler, no GCP dependency), then add Pub/Sub as an "advanced" option for users who want instant notifications.

**Confidence:** HIGH -- verified via [Gmail Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push), [users.watch API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch), [@google-cloud/pubsub npm](https://www.npmjs.com/package/@google-cloud/pubsub).

---

## 7. Chat Commands: /status, /think, /usage, /new, /reset, /compact, /activation

### Already Implemented -- Extend Existing System

The existing `commands.ts` already handles `/help`, `/think`, `/verbose`, `/model`, `/status`, `/reset`, `/stats` with a clean command dispatcher pattern. The existing `isCommand()` function checks for `/` or `!` prefix.

**New commands to add:**

| Command | Action | Implementation |
|---------|--------|----------------|
| `/new` | Start new conversation session | Call `sessionManager.reset()` (already exists as reset trigger) |
| `/compact` | Manually trigger session compaction | New -- summarize and compact history |
| `/usage` | Show detailed token/cost usage | Extend existing `/stats` with per-model breakdown |
| `/activation` | Generate pairing code for DM auth | New -- ties into DM security system |

**Pattern:** Same switch-case dispatcher in `commands.ts`. No new dependencies needed.

**Confidence:** HIGH -- extending existing pattern, verified by reading `commands.ts`.

---

## 8. DM Pairing Security: Activation Code Model

### Pattern: 6-Digit Code with Expiring Redis State

**No new dependencies needed.** Uses existing `crypto.randomInt()` + Redis TTL.

**Implementation:**

```typescript
// Generate pairing code
function generatePairingCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Redis data model
// nexus:pairing:{channel}:{userId}  ->  { code, createdAt, approved }  TTL: 3600 (1hr)
// nexus:allowlist:{channel}         ->  SET of approved userIds

async function handleFirstDM(channel: ChannelId, userId: string): Promise<string> {
  // Check if already approved
  const isAllowed = await redis.sismember(`nexus:allowlist:${channel}`, userId);
  if (isAllowed) return 'APPROVED';

  // Check if pending pairing exists
  const existing = await redis.get(`nexus:pairing:${channel}:${userId}`);
  if (existing) return 'PENDING';

  // Check cap (max 3 pending per channel)
  const pendingCount = await redis.keys(`nexus:pairing:${channel}:*`);
  if (pendingCount.length >= 3) return 'CAP_REACHED';

  // Generate code
  const code = generatePairingCode();
  await redis.setex(
    `nexus:pairing:${channel}:${userId}`,
    3600,  // 1 hour TTL
    JSON.stringify({ code, createdAt: Date.now(), userId })
  );

  return code;  // Send to user: "Your pairing code is 123456"
}

// Admin approves via CLI or web UI
async function approvePairing(channel: ChannelId, code: string): Promise<boolean> {
  // Scan pending pairings for matching code
  const keys = await redis.keys(`nexus:pairing:${channel}:*`);
  for (const key of keys) {
    const data = JSON.parse(await redis.get(key) || '{}');
    if (data.code === code) {
      await redis.sadd(`nexus:allowlist:${channel}`, data.userId);
      await redis.del(key);
      return true;
    }
  }
  return false;
}
```

**Approval channels:**
- `/activation approve telegram 123456` -- via any connected channel (admin only)
- Web UI settings panel -- list pending codes, approve/deny buttons
- CLI: `livinity pairing approve telegram 123456`

**Security measures:**
- 6-digit code (1M possibilities, 1-hour window = safe against brute force)
- Max 3 pending requests per channel (rate limiting)
- Admin-only approval (not self-service)
- Redis TTL auto-expires unapproved codes

**Confidence:** HIGH -- pattern verified via [OpenClaw DM Policy](https://docs.openclaw.ai/gateway/security), adapted for LivOS's Redis-based architecture.

---

## 9. Onboarding CLI: `livinity onboard`

### Recommended: Commander + @clack/prompts

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `commander` | `^13.1.0` | CLI argument parsing, subcommands | De facto standard (25M+ weekly downloads), already proven in ecosystem |
| `@clack/prompts` | `^1.0.1` | Beautiful interactive prompts | Modern, minimal, beautiful output. Used by create-next-app, create-svelte. TypeScript-first |

```bash
cd nexus/packages/cli   # New package
npm install commander@^13.1.0 @clack/prompts@^1.0.1
```

**Why @clack/prompts over Inquirer:**
- Inquirer is verbose and dated-looking (2015 design)
- @clack/prompts provides a polished, modern look out of the box with minimal code
- Built-in spinner, grouping, confirmation -- all with consistent styling
- 4,000+ npm dependents, actively maintained (v1.0.1 released 7 days ago)
- TypeScript-first with full type safety

**Why NOT Inquirer:** More boilerplate, less visually polished, heavier dependency tree.
**Why NOT Oclif:** Enterprise framework, too heavy for a simple onboarding CLI.

**Onboarding flow:**

```typescript
import { intro, outro, text, select, confirm, spinner, group } from '@clack/prompts';
import { Command } from 'commander';

const program = new Command()
  .name('livinity')
  .description('LivOS CLI')
  .version('2.0.0');

program.command('onboard')
  .description('Guided setup for LivOS')
  .action(async () => {
    intro('Welcome to LivOS');

    const config = await group({
      hostname: () => text({
        message: 'Server hostname',
        placeholder: 'livinity.local',
        validate: (v) => v.length === 0 ? 'Required' : undefined,
      }),
      voiceEnabled: () => confirm({
        message: 'Enable voice mode? (requires Cartesia + Deepgram API keys)',
      }),
      cartesiaKey: () => text({
        message: 'Cartesia API key',
        validate: (v) => v.startsWith('sk-') ? undefined : 'Must start with sk-',
      }),
      channels: () => select({
        message: 'Primary messaging channel',
        options: [
          { value: 'telegram', label: 'Telegram' },
          { value: 'discord', label: 'Discord' },
          { value: 'none', label: 'Web UI only' },
        ],
      }),
    });

    const s = spinner();
    s.start('Configuring LivOS...');
    // Write config to Redis, test connections
    s.stop('Configuration complete!');

    outro('LivOS is ready. Visit http://localhost:3000');
  });
```

**Package structure:** Create a new `nexus/packages/cli/` package with its own `package.json`. The CLI is a separate entry point from the daemon.

**Confidence:** HIGH -- verified via [@clack/prompts npm](https://www.npmjs.com/package/@clack/prompts), [Commander.js docs](https://www.npmjs.com/package/commander).

---

## 10. Session Compaction: Conversation Summarization

### Two Approaches Based on Architecture

**Important constraint:** LivOS uses `SdkAgentRunner` which runs Claude Code CLI as a subprocess. The Claude API's native compaction feature (`compact-2026-01-12` beta) works at the raw API level, NOT through the Claude Agent SDK's `query()` function.

#### Approach A: SDK Session Resumption (Recommended)

The Claude Agent SDK has built-in session management. When a session gets long, the SDK handles context management internally via its `sessionId` parameter.

```typescript
// SdkAgentRunner already manages sessions via query()
const result = await query({
  prompt: userMessage,
  options: {
    permissionMode: 'dontAsk',
    // Session resumption is built-in
  },
});
```

**Enhancement:** When sessions approach limits, use a "compact" tool that the agent can call to summarize its own conversation, store the summary in Redis, and start a fresh session with the summary as context.

#### Approach B: Manual Compaction Tool (Pragmatic)

Since we can't use the raw Compaction API through the SDK, implement compaction as an MCP tool:

```typescript
const compactTool = {
  name: 'session_compact',
  description: 'Summarize current conversation and start fresh context',
  handler: async ({ session_id }) => {
    // 1. Get conversation history from Redis
    const history = await sessionManager.getHistory(session_id);

    // 2. Use a separate Claude call (via SdkAgentRunner) to summarize
    const summary = await sdkRunner.run({
      task: `Summarize this conversation, preserving key decisions,
             code state, and next steps:\n\n${history.join('\n')}`,
      tools: [],
    });

    // 3. Store summary, clear old history
    await sessionManager.compact(session_id, summary.result);

    return { compacted: true, summaryLength: summary.result.length };
  }
};
```

**Reference (Claude API Compaction -- for future direct API use):**

When/if LivOS moves to direct API calls, the native compaction API is available:
- Beta header: `compact-2026-01-12`
- Strategy: `context_management.edits: [{ type: "compact_20260112" }]`
- Trigger: configurable token threshold (default 150,000, minimum 50,000)
- Supported models: Claude Opus 4.6, Claude Sonnet 4.6
- Usage: additional sampling step billed separately (compaction iteration in `usage.iterations`)

**Confidence:** MEDIUM -- SDK session management is documented but details on internal compaction within the SDK are limited. The manual tool approach is reliable as a fallback.

---

## 11. Usage Tracking: Per-User Token/Cost Accounting

### Data Model (PostgreSQL -- already installed)

**No new dependencies needed.** Uses existing `pg` package.

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  channel       TEXT NOT NULL,          -- 'telegram', 'discord', 'web', etc.
  session_id    TEXT,
  model         TEXT NOT NULL,          -- 'claude-sonnet-4-5', 'claude-haiku-4-5'
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      DECIMAL(10, 6) NOT NULL DEFAULT 0,
  tool_calls    INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,               -- wall-clock time for the request
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_usage_user_date ON usage_log (user_id, created_at);
CREATE INDEX idx_usage_channel ON usage_log (channel, created_at);

-- Materialized view for daily aggregates
CREATE MATERIALIZED VIEW usage_daily AS
SELECT
  user_id,
  channel,
  model,
  DATE(created_at) AS date,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cost_usd) AS total_cost,
  COUNT(*) AS request_count,
  SUM(tool_calls) AS total_tool_calls
FROM usage_log
GROUP BY user_id, channel, model, DATE(created_at);
```

**Cost calculation:**

```typescript
const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-haiku-4-5':  { inputPerMTok: 1.00, outputPerMTok: 5.00 },
  'claude-sonnet-4-5': { inputPerMTok: 3.00, outputPerMTok: 15.00 },
  'claude-opus-4-6':   { inputPerMTok: 5.00, outputPerMTok: 25.00 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPerMTok
       + (outputTokens / 1_000_000) * pricing.outputPerMTok;
}
```

**Integration point:** After each `SdkAgentRunner.run()` completes, extract usage from the result and log to PostgreSQL. The SDK returns usage metadata in the result object.

**Note on Claude Code Auth (subscription mode):** When using subscription auth, the user pays a flat monthly fee and there are no per-token API costs. However, tracking token usage is still valuable for:
- Understanding usage patterns
- Identifying chatty sessions
- Setting soft limits per channel/user
- Providing usage transparency to the user

**Confidence:** HIGH -- standard PostgreSQL schema, uses existing `pg` package.

---

## Complete New Dependencies Summary

### nexus/packages/core -- New Dependencies

```bash
cd nexus/packages/core
npm install @cartesia/cartesia-js@^2.2.9 @deepgram/sdk@^4.11.3 googleapis@^144.0.0 @google-cloud/pubsub@^4.8.0
```

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `@cartesia/cartesia-js` | `^2.2.9` | ~50KB | Cartesia TTS WebSocket client |
| `@deepgram/sdk` | `^4.11.3` | ~200KB | Deepgram STT WebSocket client |
| `googleapis` | `^144.0.0` | ~5MB | Gmail API + OAuth2 |
| `@google-cloud/pubsub` | `^4.8.0` | ~1MB | Google Cloud Pub/Sub for Gmail push |

### nexus/packages/cli -- New Package

```bash
mkdir -p nexus/packages/cli
cd nexus/packages/cli
npm init -y
npm install commander@^13.1.0 @clack/prompts@^1.0.1
```

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `commander` | `^13.1.0` | ~50KB | CLI argument parsing |
| `@clack/prompts` | `^1.0.1` | ~30KB | Beautiful interactive prompts |

### Frontend (livos/) -- No New Dependencies

All frontend features use browser-native APIs:
- Voice: `MediaRecorder`, `AudioContext`, `AudioWorkletNode`
- Canvas: `<iframe sandbox>`, CDN-loaded React/Tailwind/Recharts
- WebSocket: existing connection to Nexus

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| `@anthropic-ai/sdk` (direct API) | LivOS uses Claude Agent SDK subscription mode, not direct API keys |
| Sandpack / CodeSandbox | Too heavy for artifact rendering; iframe+CDN is lighter and sufficient |
| tldraw | Whiteboard framework, not what we need for AI artifact rendering |
| Vercel AI SDK | Would conflict with SdkAgentRunner architecture |
| Whisper (local STT) | Requires GPU, Deepgram is faster and more accurate for streaming |
| Piper/Coqui (local TTS) | Quality gap vs Cartesia Sonic 3 is significant; local TTS lacks emotion/prosody |
| Socket.IO | Unnecessary abstraction; raw `ws` works fine for audio streaming |
| LangChain/LangGraph | Framework conflicts with existing agent architecture |
| LiteLLM / Portkey | Proxy layers for multi-provider; not needed with subscription auth |
| Mermaid npm package | Use CDN in iframe instead; no need to bundle |
| `gmailpush` npm | Thin wrapper we don't need; `googleapis` + `@google-cloud/pubsub` is direct and transparent |
| Inquirer.js | Dated UI, more boilerplate than @clack/prompts |
| Oclif | Enterprise CLI framework, overkill for simple onboarding |

---

## External Service Requirements

| Service | Required? | Free Tier | Setup Complexity |
|---------|-----------|-----------|------------------|
| Cartesia API | Yes (for voice) | 10K chars/month | LOW -- API key only |
| Deepgram API | Yes (for voice) | $200 credit | LOW -- API key only |
| Google Cloud Project | Yes (for Gmail) | Free tier sufficient | MEDIUM -- OAuth2 + Pub/Sub setup |
| Google Cloud Pub/Sub | Optional (polling alternative exists) | 10GB/month free | MEDIUM -- topic + subscription + IAM |

---

## Integration Points with Existing LivOS

| Existing Component | Change Needed | Effort |
|-------------------|---------------|--------|
| `sdk-agent-runner.ts` | Add voice/canvas/multi-agent MCP tools | MEDIUM |
| `tool-registry.ts` | Register new tools (sessions_*, webhook, gmail) | LOW |
| `ws-gateway.ts` | Add audio streaming protocol (binary frames) | MEDIUM |
| `session-manager.ts` | Add compaction method, multi-agent session state | MEDIUM |
| `commands.ts` | Add /new, /compact, /usage, /activation commands | LOW |
| `channels/types.ts` | Add DM pairing allowlist to IncomingMessage flow | LOW |
| `config/schema.ts` | Add voice, gmail, webhook config sections | LOW |
| `api.ts` | Add webhook endpoint, Gmail OAuth callback | MEDIUM |
| `daemon.ts` | Initialize Gmail watcher, voice services on startup | LOW |
| `task-manager.ts` | Handle webhook-trigger and gmail-trigger job types | LOW |
| Frontend: `ai-chat/` | Add voice toggle, canvas panel, usage display | HIGH |

---

## API Rate Limits

| Service | Rate Limit | Notes |
|---------|-----------|-------|
| Cartesia Free | 1 concurrent request | Upgrade to Pro for 3 concurrent |
| Cartesia Startup | 5 concurrent requests | Sufficient for single-user server |
| Deepgram | No hard limit on pay-as-you-go | Fair use policy applies |
| Gmail API | 250 quota units/second/user | watch() costs 100 units, messages.get costs 5 |
| Gmail watch() | Must renew every 7 days | Cron job for daily renewal |
| Claude Agent SDK | Subscription tier limits | Depends on user's Claude subscription |

---

## Sources

### HIGH Confidence
- [Deepgram Live Audio API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) -- WebSocket protocol, events, parameters
- [Deepgram Pricing](https://deepgram.com/pricing) -- per-minute rates, free tier
- [Gmail Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push) -- Pub/Sub setup, watch(), notification format
- [Gmail OAuth Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) -- required permissions
- [Claude Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction) -- beta header, parameters, usage billing
- [@cartesia/cartesia-js npm](https://www.npmjs.com/package/@cartesia/cartesia-js) -- v2.2.9, installation
- [@deepgram/sdk npm](https://www.npmjs.com/package/@deepgram/sdk) -- v4.11.3, installation
- [@clack/prompts npm](https://www.npmjs.com/package/@clack/prompts) -- v1.0.1, API
- [@google-cloud/pubsub npm](https://www.npmjs.com/package/@google-cloud/pubsub) -- v4.8.0
- [OpenClaw DM Security](https://docs.openclaw.ai/gateway/security) -- pairing code pattern
- Existing codebase: `sdk-agent-runner.ts`, `commands.ts`, `session-manager.ts`, `channels/types.ts`

### MEDIUM Confidence
- [Cartesia TTS Docs](https://docs.cartesia.ai/api-reference/tts/websocket) -- WebSocket format (docs page didn't fully render)
- [Cartesia Pricing](https://cartesia.ai/pricing) -- credit tiers (JS-rendered page, verified via third-party reviews)
- [LangChain open-canvas](https://github.com/langchain-ai/open-canvas) -- artifact rendering patterns
- [Commander.js npm](https://www.npmjs.com/package/commander) -- v13.1.0

### LOW Confidence
- Claude Agent SDK internal session compaction behavior -- SDK docs don't detail internal context management
- `googleapis` v144 exact version -- verified npm page shows latest but exact minor may differ

---

*Research completed: 2026-02-20*
