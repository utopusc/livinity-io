# Phase 41 Codebase Audit — Anthropic Messages Broker

**Phase:** 41-anthropic-messages-broker
**Plan:** 41-01 (read-only audit)
**Audited:** 2026-04-30
**Sacred file SHA at audit start:** `623a65b9a50a89887d36f770dcd015b691793a7f` (Phase 40 baseline — verified untouched)
**Audit purpose:** Pin every integration point Plans 41-02..05 will touch so implementation tasks are deterministic, not exploratory.

---

## Table of Contents

- [Section 1 — Express mount inventory + recommended broker insertion point](#section-1)
- [Section 2 — `/api/agent/stream` + chat-flow proxy chain](#section-2)
- [Section 3 — `SdkAgentRunner` public surface](#section-3)
- [Section 4 — `per-user-claude.ts` reuse contract](#section-4)
- [Section 5 — Express middleware order at broker mount point](#section-5)
- [Section 6 — Sacred file SHA snapshot + verification](#section-6)
- [Section 7 — Open questions answered + assumptions to validate](#section-7)
  - 7a — AI Chat carry-forward design (header forwarding strategy)
  - 7b — Container source IP guard implementation
  - 7c — SSE streaming format reference (Anthropic spec)
  - 7d — Other open questions

---

## Section 1 — Express mount inventory + recommended broker insertion point <a id="section-1"></a>

**File:** `livos/packages/livinityd/source/modules/server/index.ts` (1618 lines, all routes use `this.app` identifier)

| Line | Path | Mount kind | Description |
|------|------|------------|-------------|
| 252 | (global) | `cookieParser()` | Cookie parsing for all requests |
| 255 | (global) | `helmet.contentSecurityPolicy(...)` | CSP headers |
| 285 | (global) | `helmet.referrerPolicy({policy:'no-referrer'})` | Referrer policy |
| 293 | (global) | request logger middleware | `verbose(\`${method} ${path}\`)` |
| 305 | (global) | app-gateway middleware | Subdomain→container proxy (multi-user) + custom domain routing |
| 437 | `/app/:appId` | proxy | Routes `/app/<appId>` to that app's port |
| 946 | `/manager-api/v1/system/update-status` | GET | System update status |
| 951 | `/api/mcp` | proxy/handler | MCP protocol bridge |
| 978 | `/api/gmail` | `createProxyMiddleware` | Gmail proxy |
| 996 | `/internal/device-tool-execute` | POST | Device tool execution |
| 1037 | (anonymous) | POST | Multi-line route (likely files upload) |
| 1126 | `/trpc` | `trpcExpressHandler` | tRPC HTTP handler |
| **1208** | `/api/files` | `createApi(fileApi)` | **Last `/api/*` mount before broker insertion** |
| **1209** | **(insertion point for `/u`)** | **broker mount** | **Plan 41-02 inserts here** |
| 1211 | `/logs/` | GET | Journal log download |
| 1235 | `/novnc` | `express.static(novncVendorPath)` | noVNC static assets |
| 1240 | `/desktop-viewer` | GET | Desktop viewer HTML |
| 1247 | `*` | GET | Subdomain catch-all (pc.{domain}) |
| 1273 | `/api/desktop/resize` | POST | Desktop resize |
| 1336 | `/api/docker/container/:name/file` | GET | Container file download |
| 1382 | `/api/docker/container/:name/file` | POST | Container file upload |
| 1468 | `/api/chrome/launch` | POST | Chrome launcher |
| 1521 | `/api/chrome/kill` | POST | Chrome killer |
| 1526 | `/api/chrome/status` | GET | Chrome status |
| 1536/1564/1565/1571/1572 | UI static | `express.static(...)` | UI assets (production only) |
| 1577 | (global) | error handler | 500-level catch-all |

**Recommended broker mount line:** **immediately after line 1208** (`this.app.use('/api/files', createApi(fileApi))`) and **before line 1211** (`this.app.get('/logs/', ...)`).

**Justification:**
1. Keeps the broker grouped with other `/api/*` style mounts (cluster ends at 1208).
2. Lands AFTER all global middleware (helmet, cookieParser, app-gateway proxy at line 305) — broker requests go through the standard pipeline.
3. Lands BEFORE the catch-all `*` route at line 1247 — broker routes are never hijacked.
4. Lands BEFORE the UI static handlers (~1571) — broker routes are never shadowed.

---

## Section 2 — `/api/agent/stream` + chat-flow proxy chain <a id="section-2"></a>

**File:** `nexus/packages/core/src/api.ts:2399-2533`

### Full request-flow diagram

```
UI (browser)
  └─ POST /trpc/ai.chat
     └─ tRPC dispatcher → Livinityd.Ai.chat(conversationId, userMessage, onEvent, userId)
        └─ livos/.../ai/index.ts:470  [proxy fetch]
           POST ${LIV_API_URL}/api/agent/stream
              Headers:  Content-Type: application/json
                       (if LIV_API_KEY set) X-API-Key: <key>
              Body:    {task, max_turns: 30, conversationId, userPersonalization}
           ─→ nexus/packages/core/src/api.ts:2399
              ├─ extractUserIdFromRequest(req) (line 2407)   ← returns undefined for proxy chain (no Bearer/Cookie forwarded)
              ├─ webJid = userId ? `web-ui:${userId}` : 'web-ui'
              ├─ agentConfig = {brain, toolRegistry, nexusConfig, maxTurns, ...}  (line 2480)
              ├─ new SdkAgentRunner(agentConfig)                                  (line 2502)
              ├─ agent.on('event', sendEvent)                                    (line 2506)
              ├─ result = await agent.run(task)                                  (line 2518)
              └─ SSE chunks: data: {...AgentEvent...}\n\n
        └─ stream chunks decoded back through livinityd → onEvent callback → tRPC → UI
```

### Citation table

| Step | File | Line(s) | Notes |
|------|------|---------|-------|
| livinityd Ai.chat() proxy fetch | `livos/packages/livinityd/source/modules/ai/index.ts` | 470-475 | Headers + body forwarded |
| livinityd `chat()` userId param | `livos/packages/livinityd/source/modules/ai/index.ts` | 395 | `userId?: string` (4th arg) |
| livinityd context-prefix builder | `livos/packages/livinityd/source/modules/ai/index.ts` | 427-434 | `Previous conversation:\nUser: ...\n\n` formatting (matches D-41-15) |
| nexus /api/agent/stream handler | `nexus/packages/core/src/api.ts` | 2399 | Top of route |
| nexus extractUserIdFromRequest call | `nexus/packages/core/src/api.ts` | 2407 | JWT/cookie path |
| nexus agentConfig construction | `nexus/packages/core/src/api.ts` | 2480-2495 | No `homeOverride` field today |
| nexus SdkAgentRunner instantiation | `nexus/packages/core/src/api.ts` | 2502 | Single shared brain + toolRegistry |
| nexus event subscription | `nexus/packages/core/src/api.ts` | 2506 | `agent.on('event', sendEvent)` |
| nexus agent.run() await | `nexus/packages/core/src/api.ts` | 2518 | Returns AgentResult |
| nexus 'done' final SSE event | `nexus/packages/core/src/api.ts` | 2521 | Carries `{success, answer, turns, stoppedReason}` |
| requireApiKey middleware mount | `nexus/packages/core/src/api.ts` | 11 + 229 | `app.use('/api', requireApiKey)` — gates the entire /api/* surface |

### Headers / body currently forwarded by livinityd

- `Content-Type: application/json`
- `X-API-Key: ${LIV_API_KEY}` (when env set)
- **NOT** `Authorization: Bearer ...` — JWT is NOT propagated
- **NOT** `LIVINITY_SESSION` cookie — cookies are NOT propagated
- Body fields: `{task, max_turns: 30, conversationId, userPersonalization}` — `userId` is NOT in the body today

### Gap to be closed by Plan 41-04

`extractUserIdFromRequest(req)` at line 2407 returns `undefined` for chat-flow requests because livinityd's proxy doesn't forward Bearer/Cookie. This is the gap Plan 41-04 closes by sending `X-LivOS-User-Id` header (trusted because `requireApiKey` already gates the route — only livinityd has `LIV_API_KEY`).

---

## Section 3 — `SdkAgentRunner` public surface <a id="section-3"></a>

**File:** `nexus/packages/core/src/sdk-agent-runner.ts` + `nexus/packages/core/src/agent.ts` (sacred — no edits)

### Constructor

```typescript
import { SdkAgentRunner } from '@nexus/core'
import type { AgentConfig, AgentEvent, AgentResult } from '@nexus/core'

new SdkAgentRunner(config: AgentConfig)
```

### `AgentConfig` (relevant fields, agent.ts:19-81)

```typescript
interface AgentConfig {
  brain: Brain                          // required — model adapter
  toolRegistry: ToolRegistry            // required — MCP tools
  nexusConfig?: NexusConfig             // optional dynamic settings
  homeOverride?: string                 // PHASE 40 (line 34) — used at sdk-agent-runner.ts:266
  maxTurns?: number
  maxTokens?: number
  timeoutMs?: number
  tier?: 'none' | 'haiku' | 'sonnet' | 'opus'
  stream?: boolean
  systemPromptOverride?: string         // replace default system prompt
  contextPrefix?: string                // injected before user task (matches livinityd chat pattern)
  approvalManager?: ApprovalManager
  approvalPolicy?: 'always' | 'destructive' | 'never'
  sessionId?: string
  userPersonalization?: UserPersonalization
  computerUseStepLimit?: number
  // ...other less-relevant fields...
}
```

### `run()` method

```typescript
runner.run(task: string): Promise<AgentResult>
```

`AgentResult` (agent.ts:142-156):
```typescript
interface AgentResult {
  success: boolean
  answer: string
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: ToolResult }>
  stoppedReason: 'complete' | 'max_turns' | 'max_tokens' | 'timeout' | 'error'
  ttfbMs?: number
  toolCallCount?: number
  durationMs?: number
}
```

### Event emission

`SdkAgentRunner extends EventEmitter`. Events are emitted via `this.emit('event', AgentEvent)` (sacred-file emit sites at lines 284, 358, 377, 401, 430).

Listener registration:
```typescript
agent.on('event', (event: AgentEvent) => { ... })
```

`AgentEvent` (agent.ts:13-17):
```typescript
interface AgentEvent {
  type: 'thinking' | 'chunk' | 'tool_call' | 'observation' | 'final_answer' | 'error' | 'done'
  turn?: number
  data?: unknown
}
```

### Sample event-data shapes per type

| Type | Source | `data` shape | Notes |
|------|--------|--------------|-------|
| `thinking` | sdk-agent-runner.ts:284 | (none) | Emitted ONCE at start; `turn=1` |
| `chunk` | sdk-agent-runner.ts:358 | `string` (text delta) | Per assistant text content |
| `tool_call` | sdk-agent-runner.ts:377 | `{tool: string, params: object}` | Per tool invocation |
| `final_answer` | sdk-agent-runner.ts:401 | `string` (final answer text) | Once, on `result` SDK message |
| `error` | sdk-agent-runner.ts:430 | `string` (error message) | On exception |
| `done` | (synthesized in api.ts:2521) | `{success, answer, turns, stoppedReason}` | NOT emitted by SdkAgentRunner directly — added by /api/agent/stream wrapper |

### Watchdog

SDK aborts after 60s with no SDK message (sdk-agent-runner.ts:298-306, internal AbortController). Per-tier budget caps: opus $10, sonnet $5, haiku/flash $2 (sdk-agent-runner.ts:255-262).

### Subprocess HOME (Phase 40)

`safeEnv.HOME` is set at `sdk-agent-runner.ts:266`:
```typescript
HOME: this.config.homeOverride || process.env.HOME || '/root'
```
This is the ONE line Phase 40 surgically modified. Phase 41 only consumes the `homeOverride` field via `AgentConfig`; **does NOT modify the file body**.

---

## Section 4 — `per-user-claude.ts` reuse contract <a id="section-4"></a>

**File:** `livos/packages/livinityd/source/modules/ai/per-user-claude.ts` (217 lines, 6 named exports — created by Phase 40)

### Full export signatures

```typescript
import type Livinityd from '../../index.js'
import {EventEmitter} from 'node:events'

const MULTI_USER_REDIS_KEY = 'livos:system:multi_user'

export async function isMultiUserMode(livinityd: Livinityd): Promise<boolean>
//   Reads Redis key `livos:system:multi_user` — returns true iff value === 'true'

export function getUserClaudeDir(livinityd: Livinityd, userId: string): string
//   Returns `${livinityd.dataDirectory}/users/<userId>/.claude`
//   Throws on invalid userId (regex `/^[a-zA-Z0-9_-]+$/`)

export async function ensureUserClaudeDir(livinityd: Livinityd, userId: string): Promise<string>
//   Idempotent: mkdir -p with mode 0o700 + chmod 0o700 (handles umask)

export async function checkPerUserClaudeStatus(
  livinityd: Livinityd,
  userId: string,
): Promise<{authenticated: boolean; method?: 'sdk-subscription'; expiresAt?: number}>
//   Reads .credentials.json existence + parse; returns connection state

export async function perUserClaudeLogout(livinityd: Livinityd, userId: string): Promise<void>
//   Deletes .credentials.json (idempotent, ignores ENOENT)

export type PerUserClaudeLoginEvent =
  | {type: 'device_code'; verificationUrl: string; userCode: string}
  | {type: 'progress'; message: string}
  | {type: 'success'}
  | {type: 'error'; message: string}

export function spawnPerUserClaudeLogin(
  livinityd: Livinityd,
  userId: string,
): {events: EventEmitter; kill: () => void}
//   Spawns `claude login --no-browser` with HOME=getUserClaudeDir(...)
```

### Path convention

- `getUserClaudeDir(livinityd, userId)` returns: `${livinityd.dataDirectory}/users/<userId>/.claude`
- On Mini PC production: `/opt/livos/data/users/<userId>/.claude` (per `MEMORY.md`)
- **Defensive validation:** `getUserClaudeDir` throws on userId not matching `/^[a-zA-Z0-9_-]+$/`. Broker MUST validate userId against the users table BEFORE invoking — so 404s are returned cleanly, not as 500s from path validation.

### Usage pattern (from Plan 40-03 routes.ts)

```typescript
const isMu = await isMultiUserMode(livinityd)
if (!isMu) return /* short-circuit, single-user mode bypass */
const userId = ctx.currentUser.id
const dir = await ensureUserClaudeDir(livinityd, userId)   // lazily create
// ... use dir as HOME ...
```

### Users-table API (NOT on `livinityd.users.*` — module-level functions)

The `livos/packages/livinityd/source/modules/users/` directory does NOT exist. Users are accessed via module-level functions exported from `livos/packages/livinityd/source/modules/database/index.ts`:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `findUserById` | `(id: string) => Promise<DatabaseUser \| null>` | line 138 — user lookup |
| `findUserByUsername` | `(username: string) => Promise<DatabaseUser \| null>` | line 152 |
| `getAdminUser` | `() => Promise<DatabaseUser \| null>` | line 166 — admin lookup |
| `listUsers` | `() => Promise<DatabaseUser[]>` | line 200 |
| `findAppPortForUser` | `(userId, appId) => Promise<number \| null>` | line 392 |
| `hasAppAccess` | `(userId, appId) => Promise<boolean>` | line 490 |

**Broker auth.ts MUST import these module-level functions, NOT call `livinityd.users.getById`.** Plan 41-02's example code in the plan file is a sketch — the actual implementation uses `findUserById` and `getAdminUser` from `'../../database/index.js'`.

---

## Section 5 — Express middleware order at broker mount point <a id="section-5"></a>

Walking lines 252-305 of `livos/packages/livinityd/source/modules/server/index.ts` in order:

| Step | Line | Middleware | Effect on broker requests |
|------|------|------------|---------------------------|
| 1 | 252 | `cookieParser()` | Cookies parsed (broker doesn't use cookies but harmless) |
| 2 | 255-284 | `helmet.contentSecurityPolicy(...)` | CSP headers added to responses (won't block JSON responses) |
| 3 | 285 | `helmet.referrerPolicy({policy:'no-referrer'})` | Referrer policy header added |
| 4 | 286 | `helmet — disable x-powered-by` | Removes `X-Powered-By` |
| 5 | 289-290 | `app.set('livinityd', ...)` + `app.set('logger', ...)` | Per-request access via `req.app.get('livinityd')` |
| 6 | 293-296 | request logger | `verbose(\`${method} ${path}\`)` — broker requests are logged |
| 7 | 305-431 | app-gateway subdomain proxy | Falls through (`return next()`) when host is NOT a subdomain of the configured main domain. For loopback (`127.0.0.1`) and Docker bridge (`172.17.x.x`) requests, host is the IP — the lookup at line 311 (`livos:domain:config`) either returns null (no config) or falls through immediately at line 312/319/322 because IP isn't a subdomain. **Result: broker requests are NEVER hijacked by app-gateway.** |

**At the broker mount point (line ~1209), ALL global middleware has already been applied.** Per D-41-08, the IP guard MUST be the FIRST middleware on the broker router itself (before body parsing) so non-loopback / non-Docker-bridge requests get rejected with 401 before any processing.

**App-gateway fall-through verification** (lines 311-326 in detail):
- Line 311: `domainConfigRaw = await livinityd.ai.redis.get('livos:domain:config')` — returns null when no domain configured
- Line 312: `if (!domainConfigRaw) return next()` — fall through if no domain configured
- Line 314: `if (!domainConfig.active || !domainConfig.domain) return next()` — fall through if inactive
- Line 319: `if (host === mainDomain) return next()` — main domain fall through
- Line 322-326: `if (!host.endsWith('.${mainDomain}'))` then check custom domains, fall through

For loopback IP `127.0.0.1`, `host === '127.0.0.1'` will hit line 322 (`!host.endsWith('.<domain>')`), then `routeCustomDomain()` will not match (IP isn't a custom domain), then `next()` is called. **Confirmed: broker route at `/u/:userId/v1/messages` will NOT be hijacked by app-gateway.**

---

## Section 6 — Sacred file SHA snapshot + verification <a id="section-6"></a>

**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts`
**Phase 40 baseline (= Phase 41 starting baseline):** `623a65b9a50a89887d36f770dcd015b691793a7f`

### Verification commands run during this audit

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f

$ git diff nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0
```

**Result:** SHA matches Phase 40 baseline; zero uncommitted diff. Sacred file untouched by this audit.

### Verification command for downstream plans

After every Plan 41-02..05 commit:
```bash
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# MUST output: 623a65b9a50a89887d36f770dcd015b691793a7f
git diff nexus/packages/core/src/sdk-agent-runner.ts | wc -l
# MUST output: 0
```

If either fails: ABORT and `git checkout nexus/packages/core/src/sdk-agent-runner.ts`.

---

## Section 7 — Open questions answered + assumptions to validate <a id="section-7"></a>

### 7a — AI Chat carry-forward design (header forwarding strategy)

Per D-41-16 + D-41-17, Plan 41-04 must wire `homeOverride` through the existing `/api/agent/stream` route. The strategy below is the pinned design — Plan 41-04 implements it without re-deciding.

**1. livinityd side (`livos/packages/livinityd/source/modules/ai/index.ts:470`)**
   - Add `X-LivOS-User-Id: ${userId}` header to the proxy fetch when both:
     - (a) `userId` is defined (already in scope as 4th arg of `chat()` at line 395), AND
     - (b) `await isMultiUserMode(this.livinityd)` returns true.
   - Single-user mode: do NOT send the header (preserves byte-identical wire behavior).
   - Body fields stay byte-identical (no userId in body).
   - Import: `import {isMultiUserMode} from './per-user-claude.js'` (add to top of file).

**2. nexus side (`nexus/packages/core/src/api.ts:2399`)**
   - After existing `extractUserIdFromRequest(req)` call (line 2407), check for `X-LivOS-User-Id` header as a higher-priority source.
   - Trust model: `requireApiKey` middleware at line 11/229 already protects `/api/*`. The header is trusted ONLY because that auth gate is in place — only livinityd (with `LIV_API_KEY`) can send it.
   - Validate header value with regex `/^[a-zA-Z0-9_-]+$/` (mirror of `getUserClaudeDir` validation) for defense-in-depth against path traversal.
   - **Webjid stays JWT-derived** (`webJid = userId ? \`web-ui:${userId}\` : 'web-ui'` — line 2408 unchanged) — header-based userId is for HOME isolation only.

**3. homeOverride threading**
   - When `headerUserId` is set, compute: `homeOverride = path.join(LIVOS_DATA_DIR, 'users', headerUserId, '.claude')`
   - Read `LIVOS_DATA_DIR` from env, defaulting to `/opt/livos/data` (matches MEMORY.md production layout). Plan 41-04 picks option (b) testability path.
   - Use spread-conditional in agentConfig: `...(homeOverride ? {homeOverride} : {})` so the field is genuinely absent in single-user mode.
   - Path import: `nexus/packages/core/src/api.ts` already imports `import { join } from 'node:path'` at line 4 — use `join(...)` directly OR add `import path from 'node:path'` for symmetry.

**4. Single-user mode preservation guarantee**
   - When `X-LivOS-User-Id` header is absent (livinityd doesn't send it in single-user mode), `headerUserId` is `undefined`, `homeOverride` is `undefined`, agentConfig field is absent (spread pattern), and `SdkAgentRunner` falls back to `process.env.HOME || '/root'` at line 266.
   - This is byte-identical to pre-Phase-41 behavior. Plan 41-05's regression test asserts this.

### 7b — Container source IP guard implementation

Per D-41-08, the broker accepts ONLY traffic from:
- `127.0.0.1` (IPv4 loopback)
- `::1` (IPv6 loopback)
- `::ffff:127.0.0.1` (IPv4-mapped-IPv6 — strip prefix before matching)
- CIDR `172.17.0.0/16` (Docker default bridge — `172.17.0.0` through `172.17.255.255`)

Reject everything else with HTTP 401 + JSON error body (`{type:'error', error:{type:'authentication_error', message:'request source ip <ip> not on broker allowlist'}}`).

**Implementation note:** `req.socket.remoteAddress` returns the IP. Inline parsing — no new dependency:
```typescript
let ip = req.socket.remoteAddress || ''
if (ip.startsWith('::ffff:')) ip = ip.slice(7)
if (ip === '127.0.0.1' || ip === '::1') return next()
if (ip.startsWith('172.17.')) {
  const parts = ip.split('.')
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p) && +p >= 0 && +p <= 255)) return next()
}
res.status(401).json({...})
```

**Test cases (Plan 41-05 unit test):**
- `127.0.0.1` → allow
- `::1` → allow
- `::ffff:127.0.0.1` → allow (strip prefix)
- `172.17.0.5` → allow
- `172.17.255.254` → allow
- `8.8.8.8` → reject
- `172.18.0.1` → reject (different bridge)
- `10.0.0.1` → reject
- `''` (empty) → reject

### 7c — SSE streaming format reference (Anthropic spec)

**Citation:** https://docs.anthropic.com/en/api/messages-streaming

**Required event sequence per Anthropic spec:**
```
message_start → content_block_start → [ping] → 1+ content_block_delta → content_block_stop → message_delta → message_stop
```

Plus optional `ping` events between for keep-alive.

**SSE wire format per spec:**
```
event: <type>
data: <json>

```

**The `event:` line is REQUIRED per Anthropic spec, NOT just `data:`.** This differs from the existing nexus `/api/agent/stream` SSE format (which uses `data:` only). The broker's SSE adapter must emit Anthropic-compliant `event: <name>\ndata: <json>\n\n` chunks for FR-BROKER-A-02.

Plan 41-03 implements this mapping; Plan 41-05's integration test asserts the wire format with regex `/event: message_start\ndata: /`, etc.

### 7d — Other open questions

**Q1: Does livinityd bind to `127.0.0.1` only, or also `0.0.0.0`?**

A: `server/index.ts:1595` calls `this.server.listen(targetPort, () => {...})` — **NO bind address argument**. Node's default behavior is to bind to `::` (all interfaces, IPv6+IPv4). This means livinityd is reachable from external interfaces in principle, BUT:
- Production Mini PC has firewall blocking external access to port 8080
- The IP guard (per Section 7b) ensures broker routes specifically only accept loopback + Docker bridge traffic
- Defense-in-depth is sufficient

**Q2: What's the exact Express app object identifier used for mounting?**

A: `this.app` (verified in all 25+ existing route mounts, lines 252-1577). `mountBrokerRoutes(this.app, this.livinityd)` in Plan 41-02 must use `this.app`.

**Q3: Static or dynamic imports in server/index.ts?**

A: **Static** throughout (lines 1-44 are all `import {...} from '...'`). Plan 41-02 should use a static import for `mountBrokerRoutes`:
```typescript
import {mountBrokerRoutes} from '../livinity-broker/index.js'
```
Add to import block near line 44 (after `import fileApi from '../files/api.js'`).

**Q4: What's the data directory access path?**

A: `livinityd.dataDirectory` (consumed at `per-user-claude.ts:50`). On Mini PC production: `/opt/livos/data`.

For nexus side (Plan 41-04), nexus does NOT have direct access to `livinityd.dataDirectory`. Use env var `LIVOS_DATA_DIR` defaulting to `/opt/livos/data` (matches production layout per MEMORY.md).

### Assumptions to validate via integration tests / UAT

1. **Docker bridge IP range on Mini PC = default 172.17.0.0/16.** UAT step in Plan 41-05 verifies via `docker network inspect bridge | grep Subnet`. If a non-default bridge is configured, the IP guard CIDR allowlist must be expanded.
2. **`extra_hosts: ["livinity-broker:host-gateway"]` resolves to host-loopback on Mini PC's Docker (Linux 20.10+).** Phase 43 will inject this; Phase 41 documents the contract. Plan 41-05 UAT manual step verifies.
3. **`process.env.LIV_API_KEY` is set in livinityd's environment** so the proxy fetch can include `X-API-Key` header — confirmed by reading `/opt/livos/.env` on Mini PC (per MEMORY.md). If not set, the broker proxy chain falls through requireApiKey at nexus and 401s — caught by Plan 41-05 integration test mocking.

---

*Audit complete — Plans 41-02..05 have everything they need to execute deterministically.*
