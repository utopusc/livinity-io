# Phase 44 AUDIT — Per-User Usage Dashboard

**Plan:** 44-01 (read-only audit)
**Created:** 2026-04-30
**Status:** Read-only investigation document. NO source files modified by Plan 44-01.

This document is the consolidated rediscovery surface for Plans 44-02..05. Downstream
plans reference this AUDIT.md instead of re-grepping the codebase, saving 30-50% of
their context budget.

---

## Section 0 — Sacred + Broker Integrity Baseline

Phase 44 entry baseline (verified at audit time):

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
623a65b9a50a89887d36f770dcd015b691793a7f

$ git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l
0

$ git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l
0
```

**Sacred file SHA at Phase 44 entry: `623a65b9a50a89887d36f770dcd015b691793a7f`** — matches
the Phase 40 → 43 baseline and remains untouched throughout Phase 44.

Broker module diff: 0 lines (broker is feature-frozen since Phase 42).

If either check fails at any plan commit, ABORT. Phase 44's invariant is "broker stays
edit-frozen, sacred stays untouched."

---

## Section 1 — Schema Migration Pattern

### Single-file convention

`livos/packages/livinityd/source/modules/database/schema.sql` is the canonical schema
file. **There is no migrations/ directory.** Every table + index + trigger lives in
this single file and is applied idempotently at livinityd startup.

### Idempotency convention

Every CREATE in `schema.sql` uses one of:
- `CREATE TABLE IF NOT EXISTS …` (most common, 16 tables)
- `CREATE INDEX IF NOT EXISTS …` (most indexes)
- `CREATE OR REPLACE FUNCTION …` (the audit-log immutability function)
- `DO $$ BEGIN IF NOT EXISTS (…) THEN CREATE TRIGGER … END IF; END$$` (for triggers
  that don't have a native IF NOT EXISTS form pre-PG 11)
- `DO $$ BEGIN ALTER TABLE … ADD COLUMN IF NOT EXISTS … END$$` (for additive column
  migrations, e.g. environments.tags)

### Application site

`livos/packages/livinityd/source/modules/database/index.ts` reads the file at module
load time (line 16):

```typescript
const currentFilename = fileURLToPath(import.meta.url)
const currentDirname = dirname(currentFilename)
const schemaSql = readFileSync(join(currentDirname, 'schema.sql'), 'utf8')
```

…and applies the entire script in `initDatabase()` (line 51-86):

```typescript
const client = await pool.connect()
try {
  // Run schema (idempotent -- uses IF NOT EXISTS)
  await client.query(schemaSql)
  logger.log('Database schema applied successfully')
} finally {
  client.release()
}
```

### `getPool()` accessor

```typescript
export function getPool(): pg.Pool | null {
  return pool
}
```

Returns `null` before `initDatabase()` succeeds. Plan 44-02 `database.ts` MUST handle
this null case gracefully (no-op return on null pool — matches existing pattern at
`findUserById`, `listUsers`, etc.).

### Decision for Plan 44-02

**APPEND `broker_usage` table + 2 indexes at the END of schema.sql** (after the
ai_alerts block, current line 314). Do NOT introduce a migrations directory — that
would break the single-file convention used by every prior phase (v7.0 multi-user,
Phase 15 device_audit, Phase 19 vuln_scan_cache, Phase 20 scheduled_jobs, Phase 21
git_credentials/stacks, Phase 22 environments/docker_agents, Phase 23 ai_alerts, Phase
25 environments.tags column, Phase 29 registry_credentials).

Use `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. The `users(id)
ON DELETE CASCADE` reference matches the existing FK pattern (sessions, user_preferences,
user_app_access, user_app_instances all use this).

---

## Section 2 — tRPC Router Registration

### Procedure builders (server/trpc/trpc.ts)

```typescript
export const t = initTRPC.context<Context>().create({...})
export const router = t.router
const baseProcedure = t.procedure.use(websocketLogger)
export const publicProcedure = baseProcedure
export const privateProcedure = baseProcedure.use(isAuthenticated)
export const publicProcedureWhenNoUserExists = baseProcedure.use(isAuthenticatedIfUserExists)
export const adminProcedure = privateProcedure.use(requireRole('admin'))
```

### Context shape (resolved by isAuthenticated middleware)

```typescript
ctx.currentUser?: { id: string; username: string; role: 'admin' | 'member' | 'guest' }
```

Note: `currentUser` is OPTIONAL. In legacy single-user mode (no users in DB), the
middleware does NOT set `currentUser` and `requireRole('admin')` early-returns
(treats as admin per is-authenticated.ts:75-76). Plan 44-03 routes must handle both
cases.

### `requireRole` error code

```typescript
throw new TRPCError({
  code: 'FORBIDDEN',
  message: `This action requires ${requiredRole} role`,
})
```

**Plan 44-03 routes.test.ts T4 (admin-gate test) must assert error code `'FORBIDDEN'`**
(NOT `'UNAUTHORIZED'`).

### appRouter registration site (server/trpc/index.ts:30-52)

```typescript
const appRouter = router({
  migration,
  system,
  wifi,
  user,
  preferences,
  appStore,
  apps,
  widget,
  files,
  notifications,
  eventBus,
  backups,
  ai,
  domain,
  docker,
  scheduler,
  monitoring,
  pm2,
  devices,
  audit,
  devicesAdmin,
})
```

### Existing import lines (top of file, 1-25)

All routers are imported with relative paths like `../../{module}/routes.js`. Pattern
for adding `usage` router:

```typescript
import usage from '../../usage-tracking/routes.js'
```

### Decision for Plan 44-03

1. New router file: `livos/packages/livinityd/source/modules/usage-tracking/routes.ts`
   (default export = a tRPC router).
2. Add `import usage from '../../usage-tracking/routes.js'` near the existing `ai`
   import (line 17).
3. Add `usage,` to the `appRouter({...})` block — placement near `ai` (after the AI
   namespace) is consistent with semantic grouping.
4. **No `httpOnlyPaths` entries needed** — both `usage.getMine` and `usage.getAll` are
   queries, and queries can ride WebSocket per existing convention. Mutation entries
   in `common.ts:8-194` are only for mutations or polling-heavy queries.

---

## Section 3 — ai-config.tsx Layout Grammar

### File: `livos/packages/ui/src/routes/settings/ai-config.tsx`

Length: 730 lines. Already touched by Phase 40 (per-user Claude OAuth UI) and is the
target file for Plan 44-04.

### Layout root (line 212-685)

```tsx
<SettingsPageLayout title='AI Configuration' description='Configure AI providers for LivOS'>
  <div className='max-w-lg space-y-8'>
    {/* Section 1: Primary Provider Selector — line 215-249 */}
    <div className='space-y-4'>...</div>

    {/* Section 2: Kimi Provider — line 251-369 */}
    <div className='space-y-4'>
      <h2 className='text-body font-semibold'>Kimi Account</h2>
      ...
    </div>

    {/* Section 3: Claude Provider (multi-user OR single-user branch) — line 371-660 */}
    {isMultiUserMode ? (
      <div className='space-y-4'>...per-user Claude card...</div>
    ) : (
      <div className='space-y-4'>...single-user Claude card...</div>
    )}

    {/* Section 4: Active Model — line 662-678 */}
    <div className='space-y-4'>...</div>

    {/* Section 5: Computer Use — line 680-684 */}
    <div className='space-y-4'>
      <h2 className='text-body font-semibold'>Computer Use</h2>
      <ComputerUseConsentToggle />
    </div>

    {/* ADD HERE → <UsageSection /> as the LAST sibling */}
  </div>
</SettingsPageLayout>
```

### Section grammar — every section is

```tsx
<div className='space-y-4'>
  <h2 className='text-body font-semibold'>{section title}</h2>
  <div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
    {section content with text-body-sm / text-caption text + Button / Input components}
  </div>
</div>
```

### Existing icon imports (line 2)

```typescript
import {TbLoader2, TbAlertCircle, TbCircleCheck, TbLogout, TbLogin,
        TbCopy, TbCheck, TbBrain, TbKey, TbShieldCheck} from 'react-icons/tb'
```

For Plan 44-04, add: `TbActivity`, `TbChartBar`, `TbAlertTriangle` (banner icons).

### Tailwind tokens already in use

- `text-body` / `text-body-sm` / `text-caption` (typography scale)
- `text-text-primary` / `text-text-secondary` / `text-text-tertiary`
- `bg-surface-base` / `bg-surface-raised` / `bg-surface-1`
- `border-border-default` / `border-brand`
- `rounded-radius-md` / `rounded-radius-sm`
- `bg-brand/5` / `bg-brand/10` for highlight states
- `space-y-4` / `space-y-3` / `space-y-2` (vertical rhythm)
- color palette: `text-amber-400`, `text-green-400`, `text-blue-400`, `text-red-400`

### Decision for Plan 44-04

1. Create `_components/usage-section.tsx`, `usage-banner.tsx`, `per-app-table.tsx`,
   `daily-counts-chart.tsx`, `admin-cross-user-view.tsx` in `livos/packages/ui/src/routes/settings/_components/`.
2. Append `<UsageSection />` as the LAST child of `<div className='max-w-lg space-y-8'>`
   (after the Computer Use section, before the closing `</div>` on line 685).
3. Reuse the existing tailwind classes — DO NOT introduce a Tabs component (would
   break the file's grammar consistency).
4. Polling: `refetchInterval: 30_000` for `usage.getMine` (30s) so the today_count
   stays fresh.

---

## Section 4 — Express Middleware Mount in server/index.ts

### Existing broker mount (line 1211-1215)

```typescript
// ── Livinity Broker (Phase 41 — Anthropic Messages API for marketplace apps) ──
// Routes: POST /u/:userId/v1/messages (sync + SSE per Plan 41-03)
// See livos/packages/livinityd/source/modules/livinity-broker/ +
// .planning/phases/41-anthropic-messages-broker/
mountBrokerRoutes(this.app, this.livinityd)
```

### Existing broker mount internals (livinity-broker/index.ts:25-29)

```typescript
export function mountBrokerRoutes(app: express.Application, livinityd: Livinityd): void {
  const router = createBrokerRouter({livinityd})
  app.use('/u', router)
  livinityd.logger.log('[livinity-broker] routes mounted at /u/:userId/v1/messages')
}
```

The broker mounts at `/u`, so route paths are `/u/:userId/v1/messages` and
`/u/:userId/v1/chat/completions`.

### Existing broker import (line 45)

```typescript
import {mountBrokerRoutes} from '../livinity-broker/index.js'
```

### Decision for Plan 44-02 mount strategy

**Add ONE import and ONE call before `mountBrokerRoutes`:**

```typescript
// New sibling import (near line 45):
import {mountUsageCaptureMiddleware} from '../usage-tracking/index.js'

// At the broker mount site (line 1215), insert ONE line BEFORE:
//
//   // ── Usage Capture Middleware (Phase 44 — wraps /u/:userId/v1/* OUTSIDE broker) ──
//   mountUsageCaptureMiddleware(this.app, this.livinityd)
//   mountBrokerRoutes(this.app, this.livinityd)
```

The capture middleware mounts at `app.use('/u/:userId/v1', captureMiddleware)`. Express
middleware ordering means it runs BEFORE the broker handler on the shared `/u`
prefix, since the broker uses `app.use('/u', router)` (broader prefix).

The capture middleware does NOT terminate the request. It patches `res.json`,
`res.write`, `res.end` to tap the response stream, then calls `next()` so the broker
handler runs normally.

**CRITICAL: capture middleware mount line MUST be ABOVE `mountBrokerRoutes`.**
Inverting the order would mean the broker handler returns the response before the
middleware patches are installed, and capture would silently no-op.

### Line number caveat

Plan 44-02 must re-verify the line number with `grep -n "mountBrokerRoutes" server/index.ts`
before editing — Phase 43 may have shifted lines (current line is 1215 at audit time;
no Phase 44-changing commits between audit + Plan 44-02).

---

## Section 5 — dockerode Reverse Lookup Feasibility (app_id Source)

### dockerode is already a dep

Used in:
- `livos/packages/livinityd/source/modules/docker/ai-resource-watch.ts`
- `livos/packages/livinityd/source/modules/docker/container-files.ts`
- `livos/packages/livinityd/source/modules/docker/docker-clients.ts`
- `livos/packages/livinityd/source/modules/ai/routes.ts` (existing tool surface)

So Plan 44-02 can `import Dockerode from 'dockerode'` without a new package install.

### Reverse lookup pattern

```typescript
const docker = new Dockerode({socketPath: '/var/run/docker.sock'})
const containers = await docker.listContainers({all: false})

for (const c of containers) {
  const networks = c.NetworkSettings?.Networks ?? {}
  for (const net of Object.values(networks)) {
    if ((net as {IPAddress?: string}).IPAddress === requestIp) {
      return c.Names?.[0]?.replace(/^\//, '') ?? null
    }
  }
}
return null
```

### Cost analysis

- `listContainers({all: false})` returns ~10-50 running containers on Mini PC.
- Latency: ~10-50ms per call (Docker socket round-trip + JSON parse).
- Mitigation: cache `Map<ip, containerName>` with 60s TTL, refresh on miss.
- Cache hit cost: <1ms (in-memory Map).

### Failure modes

- `/var/run/docker.sock` unreachable → catch error, return null, cache null result for
  60s (avoid retry storm).
- IP not found in any container's NetworkSettings → return null (e.g., loopback,
  tRPC clients on host network, livinityd-internal calls). Cache null for 60s.
- IPv6 + IPv4-mapped addresses (`::ffff:172.17.0.5`) — strip the `::ffff:` prefix
  before matching.

### Decision for Plan 44-02

**Ship app_id reverse lookup with a 60s in-memory IP→container TTL cache.** If
`listContainers` fails or no match → fall back to `app_id = null` (column allows it).

**Honest framing per D-44-07:** app_id is observability, not security. Never used for
authorization. The capture middleware's request scoping is by `req.params.userId`
(parsed from the URL), which the broker has already authenticated via its own
container-source-IP guard (`livinity-broker/auth.ts:containerSourceIpGuard`).

---

## Section 6 — Usage Object Byte-Shape from Phase 41 + 42 Broker

### Anthropic sync response shape (sync-response.ts:13)

```typescript
export interface AnthropicMessagesResponse {
  id: string                 // 'msg_<24-hex>'
  type: 'message'
  role: 'assistant'
  content: Array<{type: 'text'; text: string}>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence'
  stop_sequence: null
  usage: {input_tokens: number; output_tokens: number}
}
```

Built by `buildSyncAnthropicResponse({model, bufferedText, result})` at sync-response.ts:22-48.
The `usage` object always has both keys, defaulting to 0 if `result.totalInputTokens`
or `result.totalOutputTokens` is undefined.

### OpenAI sync response shape (openai-types.ts:47-62)

```typescript
export interface OpenAIChatCompletionResponse {
  id: string                 // 'chatcmpl-<24-hex>'
  object: 'chat.completion'
  created: number
  model: string              // ECHOED from the request, NOT the actual Anthropic model
  choices: Array<{
    index: number
    message: {role: 'assistant'; content: string}
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls'
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

### Anthropic SSE shape (sse-adapter.ts:9-55)

Discriminated union with these terminal events containing usage:

**`message_start` event** (header chunk, sent first):
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_X","type":"message","role":"assistant",
       "content":[],"model":"claude-sonnet-4-6","stop_reason":null,
       "usage":{"input_tokens":N,"output_tokens":0}}}
```

**`message_delta` event** (terminal chunk before `message_stop`):
```
event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},
       "usage":{"output_tokens":M}}
```

**Critical observation:** Anthropic SSE emits BOTH `message_start.usage.input_tokens`
AND `message_delta.usage.output_tokens`. Plan 44-02's parser must accumulate from BOTH:
- prompt_tokens = message_start.message.usage.input_tokens
- completion_tokens = message_delta.usage.output_tokens

The actual broker emits `message_start` with `usage:{input_tokens:0, output_tokens:0}`
(see sse-adapter.ts:113 — header is sent before any prompt-token estimate is known).
**This means Anthropic SSE prompt_tokens may be 0 in practice.** Defensive parsing
should accept whatever value `message_start.message.usage.input_tokens` carries.

### OpenAI SSE shape (openai-sse-adapter.ts) — **NO USAGE**

```
data: {"id":"chatcmpl-X","object":"chat.completion.chunk","created":N,"model":"gpt-4",
       "choices":[{"index":0,"delta":{"role":"assistant","content":"..."},"finish_reason":null}]}

...mid chunks with delta.content...

data: {"id":"chatcmpl-X",...,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Plan 44-02 caveat: the broker's OpenAI SSE adapter (openai-sse-adapter.ts) does NOT
emit a usage chunk.** It only emits content deltas + terminator + `[DONE]`. There is
no `usage` object anywhere in the SSE stream for OpenAI mode.

This means Plan 44-02 parser must:
- For OpenAI SSE: detect SSE response on `/v1/chat/completions`, look for usage in
  buffer, **and gracefully return null when no usage is found** (no row written, no
  log spam).
- This is an acceptable trade-off for v29.3. OpenAI streaming clients that need
  usage tracking would set `stream_options.include_usage:true`, but the broker
  doesn't honor that yet (deferred — out of scope per CONTEXT.md "configurable rate
  limit via Redis" + "OpenAI-side usage on SSE deferred").
- Sync OpenAI requests + all Anthropic SSE requests will be tracked correctly.

### Parser behaviour Plan 44-02 must implement

| Input | Output |
|-------|--------|
| Sync Anthropic JSON | `{prompt_tokens=usage.input_tokens, completion_tokens=usage.output_tokens, model=body.model, request_id=body.id, endpoint='messages'}` |
| Sync OpenAI JSON | `{prompt_tokens=usage.prompt_tokens, completion_tokens=usage.completion_tokens, model=body.model, request_id=body.id, endpoint='chat-completions'}` |
| Anthropic SSE buffer | Scan `event: message_start` data for `message.usage.input_tokens`; scan `event: message_delta` data for `usage.output_tokens`; return aggregate |
| OpenAI SSE buffer | Scan all `data:` lines for any `usage` key; return null if none found (current adapter never emits usage) |
| Status 429 | `{prompt_tokens=0, completion_tokens=0, model=null, request_id=null, endpoint='429-throttled'}` |
| Malformed JSON | return null (try/catch wrap), no crash, no log spam |

### Endpoint detection by URL path

- `req.originalUrl` includes `/v1/messages` → endpoint='messages'
- `req.originalUrl` includes `/v1/chat/completions` → endpoint='chat-completions'
- Neither → skip insert (return null)

---

## Section 7 — Chart Library Inventory

### recharts already in deps

`livos/packages/ui/package.json:104`:
```
"recharts": "^2.12.7",
```

No new package install needed for Plan 44-04.

### API surface used in Plan 44-04

```tsx
import {Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
```

`<BarChart>` + `<XAxis>` + `<YAxis>` + `<Bar>` + `<Tooltip>` + `<ResponsiveContainer>`
covers the Phase 44 use case (last-30-days daily request counts).

### Decision for Plan 44-04

Use recharts `<BarChart>`. If recharts proves heavy in a quick sanity check (it's
already in the dep tree from prior phases though, so this is unlikely), the fallback
per D-44-17 is a table-only view (acceptable degradation; no new package).

---

## Section 8 — test:phase43 → test:phase44 Extension Pattern

### Existing nexus test chain (nexus/packages/core/package.json:21-25)

```json
"test:phase39": "tsx src/providers/claude.test.ts && tsx src/providers/no-authtoken-regression.test.ts && tsx src/sdk-agent-runner-integrity.test.ts",
"test:phase40": "tsx src/providers/sdk-agent-runner-home-override.test.ts && npm run test:phase39",
"test:phase41": "tsx src/providers/api-home-override.test.ts && npm run test:phase40",
"test:phase42": "npm run test:phase41",
"test:phase43": "npm run test:phase42"
```

### Existing livinityd-side test commands

Phase 43 used both tsx-direct and vitest patterns:
```bash
# tsx direct (Phase 43-02 unit tests):
cd livos/packages/livinityd && npx tsx source/modules/apps/inject-ai-provider.test.ts

# vitest (Phase 43-04 integration tests):
cd livos/packages/livinityd && pnpm exec vitest run source/modules/apps/install-for-user-injection.test.ts
cd livos/packages/livinityd && pnpm exec vitest run source/modules/apps/manifest-mirofish.test.ts
```

Plan 44-02..05 use vitest exclusively (consistent with the new-module pattern):
```bash
cd livos/packages/livinityd && pnpm exec vitest run source/modules/usage-tracking/
```

### Decision for Plan 44-05

Add to `nexus/packages/core/package.json` after `"test:phase43"`:
```json
"test:phase44": "npm run test:phase43"
```

Phase 44 has NO new nexus-side tests (broker module is edit-frozen; sacred file
untouched). The chain ensures `npm run test:phase44` runs all v29.3 nexus regression
tests (Phase 39-43 chain). Livinityd-side tests run separately via vitest and are
documented in 44-UAT.md.

### v29.3 milestone test summary command sequence (final)

```bash
# Nexus-side chained tests (Phases 39-44, one command):
cd nexus/packages/core && npm run test:phase44

# Livinityd-side tests (Phases 43 + 44 vitest):
cd livos/packages/livinityd && \
  pnpm exec vitest run \
    source/modules/apps/inject-ai-provider.test.ts \
    source/modules/apps/install-for-user-injection.test.ts \
    source/modules/apps/manifest-mirofish.test.ts \
    source/modules/usage-tracking/
```

---

## Open Questions / Risks

### OpenAI SSE without usage

The broker's `openai-sse-adapter.ts` does NOT emit a usage chunk in any mode. Plan
44-02's parser must defensively handle the missing-usage case for OpenAI SSE
responses: return null, no row written, no log spam, no crash. This is documented in
Section 6. **Acceptable trade-off:** sync OpenAI requests still track usage; only
streaming OpenAI mode loses usage observability. Future enhancement (deferred):
broker honors `stream_options.include_usage:true` and emits a final usage chunk. Not
in v29.3 scope.

### dockerode listContainers latency

p50 should be ~10-30ms on Mini PC; p99 may spike to 100-200ms during Docker daemon
contention. With 60s TTL cache, the impact per request after first hit is <1ms.
Plan 44-02 does NOT block on the lookup — it runs in `await resolveAppIdFromIp()`
INSIDE the response-write path, so worst case adds ~50ms to the broker response
time on first request from a new IP. Acceptable for an observability surface.

### Phase 44 cumulative diff invariant

Every Plan 44-02..05 commit must verify:
```bash
git diff HEAD -- nexus/packages/core/src/sdk-agent-runner.ts | wc -l   # 0
git diff HEAD -- livos/packages/livinityd/source/modules/livinity-broker/ | wc -l   # 0
grep -rn "livinity-broker" livos/packages/livinityd/source/modules/usage-tracking/  # 0 matches
```

If any check fails → ABORT. Phase 44's structural promise is "broker stays
edit-frozen, sacred stays untouched, usage-tracking imports nothing from the broker
module."

### Rate limit tier defaulting

Plan 44-03 hardcodes `tier='pro'` (200 messages/day). Users on Max 5x or Max 20x
will see incorrect threshold percentages (200 vs actual 1000 / 4000). Acceptable
trade-off per D-44-08: auto-detection from Anthropic API response or user setting
deferred. UI banner copy says "(pro tier)" so the limitation is visible.

### Timezone consistency

D-44-09: today's count uses `CURRENT_DATE AT TIME ZONE 'UTC'` (UTC midnight reset,
not local). Plan 44-04 banner copy must match: "Resets at midnight UTC", and
date formatting uses `{timeZone: 'UTC'}` option. **Tested via grep on
usage-banner.tsx in Plan 44-04 verification.**

---

## Summary of Decisions for Plans 44-02..05

| Plan | Decision | Reference |
|------|----------|-----------|
| 44-02 | Append broker_usage to existing schema.sql (single-file convention) | Section 1 |
| 44-02 | usage-tracking module under modules/, zero broker imports | Section 4, Pre-flight check |
| 44-02 | Mount middleware BEFORE broker on /u/:userId/v1 prefix | Section 4 |
| 44-02 | dockerode IP→container reverse lookup with 60s TTL cache, null fallback | Section 5 |
| 44-02 | Parser: graceful null on missing usage (incl. OpenAI SSE) | Section 6 |
| 44-03 | New router at usage-tracking/routes.ts, register near `ai` in appRouter | Section 2 |
| 44-03 | requireRole error code = 'FORBIDDEN' (not UNAUTHORIZED) | Section 2 |
| 44-03 | No httpOnlyPaths entries — both procedures are queries | Section 2 |
| 44-03 | Hardcoded tier='pro' for v29.3 (D-44-08) | Open Questions |
| 44-04 | Append <UsageSection /> as last child of max-w-lg space-y-8 | Section 3 |
| 44-04 | Reuse existing tailwind grammar — no Tabs component | Section 3 |
| 44-04 | recharts BarChart for last 30 days (already in deps) | Section 7 |
| 44-04 | Banner copy "midnight UTC", date format with timeZone:'UTC' | Open Questions |
| 44-05 | test:phase44 chains test:phase43 (no new nexus tests) | Section 8 |
| 44-05 | Total Phase 44 livinityd tests: 8+3+5+4+4+3+5 = 32 | Section 8 |

---

*Read-only investigation. Plan 44-01 commits this document and nothing else.*
