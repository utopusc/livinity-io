# Phase 46: Fail2ban Admin Panel — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 21 (8 new backend src + 4 new tests + 5 new UI + 4 modified)
**Analogs found:** 21 / 21 (every file has a strong in-tree analog — this phase is mostly cloning the v29.3 broker module shape + the v28.0 docker-section shape)

---

## File Classification

### Backend — fail2ban-admin module (NEW)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `livos/packages/livinityd/source/modules/fail2ban-admin/index.ts` | service (public API barrel) | request-response | `livos/packages/livinityd/source/modules/livinity-broker/index.ts` | exact (mirror barrel + mount) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/client.ts` | service (execFile wrapper) | process-IO | `livos/packages/livinityd/source/modules/system/factory-reset.ts` (lines 287-340) + `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (UpstreamHttpError class) | role-match (spawn/execFile + structured error class) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/parser.ts` | utility (pure text parser) | transform | `livos/packages/livinityd/source/modules/livinity-broker/translate-request.ts` | exact (pure transform, no I/O, easy to unit test) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/events.ts` | service (audit writer) | CRUD (write-only) | `livos/packages/livinityd/source/modules/devices/audit-pg.ts` | exact (PG insert + SHA-256 digest + fire-and-forget) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.ts` | service (system probe) | process-IO | `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` (containerSourceIpGuard — IP parsing) + factory-reset.ts (execFile pattern) | role-match (mock-friendly abstraction over `who -u`) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/routes.ts` | controller (tRPC router) | request-response | `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` | exact (adminProcedure + Zod input + small router with q+m mix) |

### Backend — modified registration files

| Modified File | Role | Edit Type | Anchor |
|---------------|------|-----------|--------|
| `livos/packages/livinityd/source/modules/server/trpc/index.ts` | controller registry | +2 lines (import + register) | line 26 (next to `devicesAdmin`), line 53 |
| `livos/packages/livinityd/source/modules/server/trpc/common.ts` | config (httpOnlyPaths) | +3-5 lines | line 182 (after `usage.getAll`, mirrors Phase 45 FR-CF-03 cluster) |

### Tests (NEW — bare tsx + node:assert/strict)

| Test File | Role | Closest Analog | Match Quality |
|-----------|------|----------------|---------------|
| `livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts` | unit test | `livos/packages/livinityd/source/modules/livinity-broker/translate-request.test.ts` | exact (pure-function fixture tests) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts` | unit test | `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` (mock pattern) | role-match (asserts argv shape, error wrapping) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts` | integration test | `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` | exact (pg.Pool prototype patch + ephemeral express + tRPC client) |
| `livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts` | unit test | `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` | role-match (parses synthetic `who -u` fixtures) |

### UI — NEW components

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `livos/packages/ui/src/modules/docker-app/security-section.tsx` | component (section root) | polling | `livos/packages/ui/src/routes/docker/activity/activity-section.tsx` | exact (sticky header + filter chips + polled body + skeleton/empty/error states) |
| `livos/packages/ui/src/modules/docker-app/_components/jail-status-card.tsx` | component (card) | polling render | `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` | role-match (table render with row actions) |
| `livos/packages/ui/src/modules/docker-app/_components/unban-modal.tsx` | component (modal) | request-response | `livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx` (RemoveStackDialog) | exact (Dialog + Checkbox + onConfirm signature passes flag) |
| `livos/packages/ui/src/modules/docker-app/_components/ban-ip-modal.tsx` | component (modal) | request-response | `livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx` (RemoveStackDialog) — same primitives, type-confirm gate is locally novel | role-match |
| `livos/packages/ui/src/modules/docker-app/_components/audit-log-tab.tsx` | component (table) | request-response | `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` | exact (date-fns relative timestamps + status Badge variant) |

### UI — modified files

| Modified File | Role | Edit Type | Anchor |
|---------------|------|-----------|--------|
| `livos/packages/ui/src/routes/docker/store.ts` | config (zustand store) | +1 SectionId, +1 SECTION_IDS entry | lines 20-32 (SectionId union), lines 40-53 (SECTION_IDS array) |
| `livos/packages/ui/src/routes/docker/docker-app.tsx` | component (section switch) | +1 import, +1 case | lines 16-33 imports, lines 64-91 SectionView switch |
| `livos/packages/ui/src/routes/docker/sidebar.tsx` | component (sidebar nav) | +1 SECTION_META entry | lines 52-65 |
| `livos/packages/ui/src/routes/settings/_components/...` (Settings > Show Security panel toggle) | component | new toggle row | mirror `usage-section.tsx` neighbor pattern |

### npm script

| Modified File | Role | Edit Type |
|---------------|------|-----------|
| `nexus/packages/core/package.json` | config (test runner script) | +1 line `test:phase46` chaining `test:phase45` + 4 new test files |

---

## Pattern Assignments

### `fail2ban-admin/index.ts` (service barrel) → analog `livinity-broker/index.ts`

**Imports + re-export pattern** (broker `index.ts:1-12`):
```ts
import type express from 'express'
import {createBrokerRouter} from './router.js'
import type Livinityd from '../../index.js'

export {createBrokerRouter} from './router.js'
export type {AnthropicMessagesRequest, ...} from './types.js'
```

**Apply to fail2ban-admin/index.ts:**
- Re-export public API surface: `listJails`, `getJailStatus`, `unbanIp`, `banIp`, `addIgnoreIp`, `listEvents`
- Re-export types from `types.ts` (or in this module, inline the types — fewer files OK; broker's `types.ts` exists because Anthropic wire types are shared with the openai router; fail2ban has no equivalent split)
- NO mount function needed: fail2ban does not get an Express route surface. The tRPC router in `routes.ts` is consumed by `server/trpc/index.ts` directly. (Broker has `mountBrokerRoutes(app, livinityd)` because it's an HTTP-protocol surface; fail2ban is tRPC-only.)

### `fail2ban-admin/client.ts` (execFile wrapper) → analogs `factory-reset.ts:287-340` + `agent-runner-factory.ts:18-27`

**execFile spawn pattern** (factory-reset.ts:299-321):
```ts
const child = spawn(
    'systemd-run',
    ['--scope', '--collect', '--unit', unitName, '--quiet', 'bash', RESET_SCRIPT_RUNTIME_PATH, ...],
    {detached: true, stdio: 'ignore'},
)
child.unref()
```

**For fail2ban: use `execFile` (NOT `spawn`) — we need stdout buffered, not detached.**

**Structured error class pattern** (agent-runner-factory.ts:18-27):
```ts
export class UpstreamHttpError extends Error {
    readonly status: number
    readonly retryAfter: string | null
    constructor(message: string, status: number, retryAfter: string | null) {
        super(message)
        this.name = 'UpstreamHttpError'
        this.status = status
        this.retryAfter = retryAfter
    }
}
```

**Apply to fail2ban-admin/client.ts** — define a typed error class hierarchy:
```ts
export type Fail2banErrorKind = 'binary-missing' | 'service-down' | 'jail-not-found' | 'ip-invalid' | 'timeout' | 'transient'

export class Fail2banClientError extends Error {
    readonly kind: Fail2banErrorKind
    readonly stderr?: string
    constructor(message: string, kind: Fail2banErrorKind, stderr?: string) {
        super(message)
        this.name = 'Fail2banClientError'
        this.kind = kind
        this.stderr = stderr
    }
}
```

**Recommended structure for `runFail2banClient(args: string[]): Promise<string>`:**
- Use `node:util.promisify(child_process.execFile)` (NOT shell-string — pitfall X-03)
- Hardcoded binary `/usr/bin/fail2ban-client` (no PATH lookup)
- 10s timeout (per pitfall M-07 — 5s is tight on slow Mini PC I/O)
- Wrap ENOENT → `Fail2banClientError('binary missing', 'binary-missing')`
- Wrap "Could not find server" stderr → `Fail2banClientError(..., 'service-down')`
- Wrap "Sorry but the jail '...' does not exist" → `'jail-not-found'`
- Wrap timeout → `'timeout'` (per pitfall W-05 transient retry path)
- Pre-call binary check cached for module lifetime (per architecture research §1 "Anti-Fragile fail2ban-client missing")

**Defense-in-depth on inputs (pitfall X-03):**
- Caller (routes.ts) already Zod-validates IP and jail BEFORE this layer. client.ts also asserts `/^[a-zA-Z0-9_.-]+$/` on jail name and re-validates IP shape, refusing to spawn if either fails. `args` array is passed to execFile literally — no string concatenation.

### `fail2ban-admin/parser.ts` (text parser) → analog `livinity-broker/translate-request.ts`

**Pure-function pattern** (translate-request.ts:32-92):
```ts
export function translateAnthropicMessagesToSdkArgs(req: AnthropicMessagesRequest): SdkRunArgs {
    if (!req || typeof req !== 'object') throw new Error('request must be an object')
    if (!Array.isArray(req.messages) || req.messages.length === 0) throw new Error('messages must be a non-empty array')
    // ... transform logic ...
    return {task, contextPrefix, systemPromptOverride}
}

function extractText(msg: {content: string | AnthropicContentBlock[] | unknown}): string { ... }
```

**Apply to fail2ban-admin/parser.ts** — three pure parsers:

1. `parseJailList(stdout: string): string[]` — extracts the `Jail list:` line from `fail2ban-client status` output. Real format:
   ```
   Status
   |- Number of jail:    2
   `- Jail list:    sshd, recidive
   ```
   Returns `['sshd', 'recidive']` after splitting on `,` and `.trim()` per element. Returns `[]` if the line is `Jail list:    ` (empty).

2. `parseJailStatus(stdout: string): {currentlyFailed: number, totalFailed: number, currentlyBanned: number, totalBanned: number, bannedIps: string[]}` — parses `fail2ban-client status sshd`. Real format:
   ```
   Status for the jail: sshd
   |- Filter
   |  |- Currently failed: 0
   |  |- Total failed:     12
   |  `- File list:        /var/log/auth.log
   `- Actions
      |- Currently banned: 1
      |- Total banned:     5
      `- Banned IP list:   1.2.3.4
   ```

3. `parseWhoOutput(stdout: string): Array<{user: string, sourceIp: string | null, since: Date}>` — parses `who -u` output for active SSH sessions. Real format (fixed-width):
   ```
   bruce    pts/0        2026-05-01 12:34   .          1234 (203.0.113.5)
   bruce    pts/1        2026-05-01 12:35  old         1235 (10.0.0.42)
   ```
   The trailing `(<sourceIp>)` is the field we extract via regex `/\(([0-9.:a-f]+)\)\s*$/`. Lines without parens (local console) yield `sourceIp: null`.

**Throwing convention:** mirror translate-request.ts — throw `new Error('descriptive')` on malformed input. Caller in `client.ts` wraps into `Fail2banClientError('parse-failed', ...)`.

**Why pure:** unit tests run against verbatim fixtures from real Mini PC fail2ban 1.0.2 output (per pitfall W-20 / M-04 — no `vi.mock('child_process')`).

### `fail2ban-admin/events.ts` (audit writer) → analog `devices/audit-pg.ts`

**SHA-256 params digest pattern** (audit-pg.ts:42-52):
```ts
export function computeParamsDigest(params: unknown): string {
    let serialized: string
    try {
        serialized = params === undefined || params === null ? '' : JSON.stringify(params)
    } catch {
        serialized = '[unserializable]'
    }
    return createHash('sha256').update(serialized).digest('hex')
}
```

**INSERT + fallback pattern** (audit-pg.ts:65-109):
```ts
export async function recordDeviceEvent(redis: Redis, event: DeviceAuditEvent, logger = console) {
    const pool = getPool()
    const paramsDigest = computeParamsDigest(event.params)
    if (pool) {
        try {
            await pool.query(
                `INSERT INTO device_audit_log (user_id, device_id, tool_name, params_digest, success, error)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [event.userId || NIL_UUID, event.deviceId, event.toolName, paramsDigest, event.success, event.error ?? null],
            )
            return
        } catch (err) {
            logger.error('[device-audit-pg] INSERT failed, falling back:', err)
        }
    }
    // fallback path...
}
```

**Apply to fail2ban-admin/events.ts:**
- Reuse `computeParamsDigest` (import from `devices/audit-pg.js` to avoid duplication).
- INSERT with sentinel: `device_id := 'fail2ban-host'`, `tool_name ∈ {'unban_ip','ban_ip','whitelist_ip'}`, `user_id := ctx.currentUser.id`, `params_digest := sha256(JSON.stringify({jail, ip}))`.
- Belt-and-suspenders JSON event row write to `/opt/livos/data/security-events/<ts>-<uuid8>-<action>.json` (per architecture research "Cross-Cut" + pitfall M-02 UUID suffix to prevent same-ms collisions). Mirrors Phase 33 OBS-01 schema.
- Fire-and-forget contract: MUST NOT throw to caller. PG fail → still write JSON row. JSON write fail → log warning, continue.
- Schema: `{ts, action, jail, ip, admin_user_id, admin_username, source: 'ui', success: bool, error?: string}`

### `fail2ban-admin/active-sessions.ts` (system probe abstraction) → analogs `livinity-broker/auth.ts` (IP parser) + `factory-reset.ts:331-340` (execa wrapper)

**Mock-friendly abstraction:**
```ts
// Default impl uses real execFile(`who`, ['-u'])
export interface ActiveSessionsProvider {
    listActiveSshSessions(): Promise<Array<{user: string, sourceIp: string | null, since: Date}>>
}
export const realActiveSessionsProvider: ActiveSessionsProvider = { ... }
// Tests inject a fake provider that returns canned arrays.
```

**IP-parsing pattern** (auth.ts:25-30):
```ts
function isValidIPv4(parts: string[]): boolean {
    return (
        parts.length === 4 &&
        parts.every((p) => /^\d+$/.test(p) && +p >= 0 && +p <= 255)
    )
}
```

**Apply to active-sessions.ts:**
- Strip `::ffff:` IPv4-mapped-IPv6 prefix when found in `who -u` output (some sshd configs emit IPv6-mapped form).
- Tolerate empty parens (local console session) → `sourceIp: null`.
- Caller (`routes.ts:listActiveAdminIps`) merges this with the HTTP X-Forwarded-For source and returns BOTH (per pitfall W-06 / X-09 — mobile UX).

### `fail2ban-admin/routes.ts` (tRPC router) → analog `usage-tracking/routes.ts`

**Router skeleton with admin + private mix** (usage-tracking/routes.ts:1-94):
```ts
import {z} from 'zod'
import {privateProcedure, adminProcedure, router} from '../server/trpc/trpc.js'
import {queryUsageByUser, queryUsageAll, ...} from './database.js'

const sinceInput = z.object({since: z.date().optional()}).optional()

const getMineProc = privateProcedure
    .input(sinceInput)
    .query(async ({ctx, input}) => {
        if (!ctx.currentUser) return {/*empty*/}
        const userId = ctx.currentUser.id
        const rows = await queryUsageByUser({userId, since: input?.since})
        return {stats: aggregateUsageStats(rows), today_count: ..., banner: ...}
    })

const getAllProc = adminProcedure
    .input(z.object({user_id: z.string().uuid().optional(), ...}).optional())
    .query(async ({input}) => { ... })

const usageRouter = router({getMine: getMineProc, getAll: getAllProc})
export default usageRouter
```

**Apply to fail2ban-admin/routes.ts** — five procedures:

```ts
import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {adminProcedure, router} from '../server/trpc/trpc.js'
import {listJails, getJailStatus, unbanIp, banIp, addIgnoreIp, listEvents} from './index.js'
import {recordFail2banEvent} from './events.js'
import {realActiveSessionsProvider} from './active-sessions.js'
import {Fail2banClientError} from './client.js'

// Zod schemas — reject CIDR /0-/7 (pitfall B-03 / B-19) AND trim whitespace
const ipSchema = z.string()
    .trim()
    .refine((s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s), 'must be IPv4 dotted-quad')
    // Disallow CIDR entirely for v29.4. If CIDR is wanted later, switch to:
    // .refine((s) => /^\d+\.\d+\.\d+\.\d+(\/(?:[8-9]|[12]\d|3[0-2]))?$/.test(s))

const jailSchema = z.string().trim().regex(/^[a-zA-Z0-9_.-]+$/)

const fail2banRouter = router({
    listJails: adminProcedure.query(async () => {
        try {
            return await listJails()
        } catch (err) {
            if (err instanceof Fail2banClientError && err.kind === 'service-down') {
                // pitfall W-05 — transient, surface state, don't crash
                return {transient: true, jails: []}
            }
            throw err
        }
    }),

    getJailStatus: adminProcedure
        .input(z.object({jail: jailSchema}))
        .query(async ({input}) => getJailStatus(input.jail)),

    unbanIp: adminProcedure
        .input(z.object({jail: jailSchema, ip: ipSchema, addToWhitelist: z.boolean().default(false)}))
        .mutation(async ({ctx, input}) => {
            await unbanIp(input.jail, input.ip)
            if (input.addToWhitelist) await addIgnoreIp(input.jail, input.ip)
            await recordFail2banEvent({
                action: input.addToWhitelist ? 'whitelist_ip' : 'unban_ip',
                jail: input.jail,
                ip: input.ip,
                userId: ctx.currentUser!.id,
                username: ctx.currentUser!.username,
                success: true,
            })
            return {ok: true}
        }),

    banIp: adminProcedure
        .input(z.object({
            jail: jailSchema,
            ip: ipSchema,
            confirmation: z.literal('LOCK ME OUT').optional(),  // required only on self-ban path
            cellularBypass: z.boolean().default(false),
        }))
        .mutation(async ({ctx, input}) => {
            // Self-ban detection (pitfall B-02 / W-06 / X-09)
            if (!input.cellularBypass) {
                const httpIp = (ctx.request?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? null
                const sshSessions = await realActiveSessionsProvider.listActiveSshSessions().catch(() => [])
                const adminIps = new Set([httpIp, ...sshSessions.map((s) => s.sourceIp)].filter(Boolean))
                if (adminIps.has(input.ip) && input.confirmation !== 'LOCK ME OUT') {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'self_ban',  // UI surfaces second-stage type-LOCK-ME-OUT modal
                    })
                }
            }
            await banIp(input.jail, input.ip)
            await recordFail2banEvent({action: 'ban_ip', ...})
            return {ok: true}
        }),

    listEvents: adminProcedure
        .input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
        .query(async ({input}) => listEvents({limit: input.limit})),
})

export default fail2banRouter
```

**Where `listEvents` reads from:** `device_audit_log WHERE device_id = 'fail2ban-host' AND tool_name IN ('unban_ip','ban_ip','whitelist_ip') ORDER BY timestamp DESC LIMIT $1`. JOIN `users u ON u.id = user_id` to surface `admin_username` for UI.

### `server/trpc/index.ts` (router registry) — modification

**Anchor:** lines 1-30 (imports), lines 31-54 (router registration).

**Edit pattern** (mirror `livos/.../trpc/index.ts:24-26`):
```ts
import devicesAdmin from '../../devices/admin-routes.js'
import fail2ban from '../../fail2ban-admin/routes.js'   // +1 NEW

const appRouter = router({
    // ...
    devicesAdmin,
    fail2ban,                                             // +1 NEW
})
```

### `server/trpc/common.ts` (httpOnlyPaths) — modification

**Anchor:** line 182 — immediately after the Phase 45 `usage.getAll` cluster comment block (lines 174-182).

**Edit pattern** (mirror Phase 45 FR-CF-03 namespacing convention — `<router>.<route>`):
```ts
    'usage.getMine',
    'usage.getAll',
    // v29.4 Phase 46 — Fail2ban admin mutations. Same WS-reconnect-survival
    // reason as Phase 45's per-user Claude OAuth + usage queries: an admin
    // mid-recovery from SSH lockout is also likely to be on a half-broken WS
    // (livinityd may have just been restarted by ban activity). HTTP guarantees
    // delivery. Queries (listJails / getJailStatus / listEvents) stay on WS —
    // cheap, idempotent, retry-safe. Pitfall B-12 / X-04.
    'fail2ban.unbanIp',
    'fail2ban.banIp',
    // Subagent execution -- use HTTP for reliability (can take 10-60s)
    'ai.executeSubagent',
```

**Critical:** Bare `'unbanIp'` / `'banIp'` would be a footgun (per common.test.ts:60-72). Always namespace `<router>.<route>`.

---

## UI Pattern Assignments

### `security-section.tsx` (section root) → analog `activity/activity-section.tsx`

**Sticky header + filter chips + polled body pattern** (activity-section.tsx:104-156):
```tsx
return (
    <div className='flex h-full min-h-0 flex-col'>
        {/* Sticky header */}
        <div className='shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
            <div className='flex items-center justify-between px-4 pb-1 pt-3'>
                <h2 className='text-sm font-semibold text-zinc-800 dark:text-zinc-100'>Activity</h2>
                <span className='text-xs text-zinc-500 dark:text-zinc-400'>Showing {filtered.length} of {events.length} events</span>
            </div>
            <ActivityFilters source={source} setSource={setSource} severity={severity} setSeverity={setSeverity} />
        </div>
        {/* Optional error banner */}
        {isError ? <div className='shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs ...'>...</div> : null}
        {/* Body */}
        <div className='min-h-0 flex-1 overflow-y-auto'>
            {isLoading && events.length === 0 ? <SkeletonRows /> : filtered.length === 0 ? <EmptyState /> : <ul>...</ul>}
        </div>
    </div>
)
```

**Polling pattern** (activity/use-activity-feed.ts:64-89):
```ts
const POLL_INTERVAL_MS = 5_000
const STALE_TIME_MS = 2_500
const eventsQuery = trpcReact.docker.dockerEvents.useQuery({...input...}, {
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    retry: false,
})
```

**Apply to security-section.tsx:**
- Three states for service banner (per pitfall W-04): binary-missing (red, "fail2ban not installed. Run /opt/livos/install.sh"), service-inactive (yellow, "Fail2ban service stopped. Start service?"), no-jails (yellow, "Fail2ban running but no jails configured"), green ("X jails active").
- Tabs across discovered jails (per pitfall W-03 — auto-discover, never hardcode `sshd`).
- Polling cadence 5s (per pitfall W-02 — 5s sweet spot; manual Refresh button as failsafe).
- Manual Refresh button calls `queryClient.invalidateQueries(['fail2ban'])`.
- "Cellular bypass" toggle disables self-ban check (pitfall W-19 / X-09).
- Backoff on transient errors (pitfall W-05): if `data.transient === true`, show "Fail2ban restarting…" badge, do NOT crash.

### `unban-modal.tsx` → analog `stacks/stack-dialogs.tsx` `RemoveStackDialog`

**Dialog + Checkbox + onConfirm signature pattern** (stack-dialogs.tsx:25-76):
```tsx
export function RemoveStackDialog({stackName, open, onOpenChange, onConfirm, isRemoving}: {...}) {
    const [removeVolumes, setRemoveVolumes] = useState(false)
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Remove Stack: {stackName}</DialogTitle>
                    <DialogDescription>This will stop and remove all containers in this stack.</DialogDescription>
                </DialogHeader>
                <div className='py-3'>
                    <label className='flex items-center gap-2 cursor-pointer'>
                        <Checkbox checked={removeVolumes} onCheckedChange={(c) => setRemoveVolumes(c === true)} />
                        <span className='text-sm text-text-secondary'>Also remove associated volumes</span>
                    </label>
                </div>
                <DialogFooter>
                    <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant='destructive' onClick={() => {onConfirm(removeVolumes); setRemoveVolumes(false)}} disabled={isRemoving}>
                        {isRemoving ? 'Removing...' : 'Remove'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
```

**Apply to unban-modal.tsx:**
- Title: `Unban {ip} from {jail}`
- DialogDescription: include last-attempt timestamp + last-attempted-user (parsed from fail2ban log if surfaced; v29.4 may defer the last-user column per FEATURES.md — render whatever the backend supplies, gracefully omit when missing).
- Checkbox: "Add to ignoreip whitelist (prevents re-ban from this IP)" — defaults UNCHECKED. When checked, `addToWhitelist: true` flows to the tRPC mutation.
- onConfirm signature: `(addToWhitelist: boolean) => void`.
- Disable Unban button for 5s after click (pitfall W-01 — prevent double-fire).
- Surface inline note: "After unban, fail2ban may re-ban this IP if connection attempts continue. Verify your SSH key is correct first." (pitfall B-01).

### `ban-ip-modal.tsx` → analog `stacks/stack-dialogs.tsx` `RemoveStackDialog` + factory-reset's type-confirm gate (verbatim string equality)

**Type-confirm gate pattern** (Phase 37 D-RT-05 / pitfall B-02):
- Two-stage modal:
  1. Stage 1 (NORMAL ban): Dialog with "Ban {ip} from {jail}" + Cancel / Ban buttons. Mutation called immediately.
  2. Stage 2 (SELF-BAN, only when backend returns `code: 'CONFLICT' message: 'self_ban'`): re-render with destructive copy: "WARNING: {ip} is YOUR CURRENT CONNECTION IP. Banning will lock you out. Type `LOCK ME OUT` to confirm." + a `<Input>` whose state is compared `=== 'LOCK ME OUT'` strict equality. Ban button disabled until match.
- On Stage 2 confirm, re-call mutation with `confirmation: 'LOCK ME OUT'` field set; backend re-validates string and proceeds.
- Defense-in-depth: Zod on the client ALSO refuses CIDR /0-/7 BEFORE mutation fires (pitfall B-03). Client-side regex: `/^(\d{1,3}\.){3}\d{1,3}$/` (no slash allowed in v29.4).

### `audit-log-tab.tsx` → analog `past-deploys-table.tsx`

**Table + relative timestamps + status Badge pattern** (past-deploys-table.tsx:31-100):
```tsx
import {formatDistanceToNow, parseISO} from 'date-fns'
import {Badge} from '@/shadcn-components/ui/badge'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

function safeFormatRelative(iso: string | undefined): string {
    if (!iso) return '—'
    try { return formatDistanceToNow(parseISO(iso), {addSuffix: true}) } catch { return iso }
}
```

**Apply to audit-log-tab.tsx:**
- Columns: When (relative) | Action (Badge: ban/unban/whitelist) | Jail | IP | Admin (username) | Result (success/failed)
- Use `trpcReact.fail2ban.listEvents.useQuery({limit: 50})`.
- Empty state: "No ban/unban events recorded yet."
- Loading state: "Loading…" placeholder (matches past-deploys-table.tsx:90).

### Sidebar registration — `store.ts` + `docker-app.tsx` + `sidebar.tsx`

**Three-touchpoint compile-error invariant** (store.ts:20-53 + sidebar.tsx:52-65 + docker-app.tsx:64-91):

The TypeScript narrowing means **all three** files must update or the compiler complains.

**store.ts edits** — add `'security'` to BOTH the `SectionId` union (lines 20-32) AND the `SECTION_IDS` array (lines 40-53). Insert position recommended: between `'activity'` and `'schedules'` (operator-cluster ordering — security sits next to activity timeline, before scheduling).

**sidebar.tsx edits** — add to `SECTION_META` (lines 52-65):
```ts
import {IconShieldLock} from '@tabler/icons-react'  // or IconLock — verify availability
// ...
security: {icon: IconShieldLock, label: 'Security', comingPhase: 46},
```
Naming: **'Security'** NOT 'Fail2ban' (per architecture research Anti-Pattern 4 — operator vocabulary, room for future audit/sessions/alerts sub-tabs without rename).

**docker-app.tsx edits** — add import + case (lines 16-33 and 64-91):
```tsx
import {SecuritySection} from './security/security-section'  // or wherever it lands
// ...
case 'security':
    return <SecuritySection />
```

**File location decision (resolves prompt's `livos/packages/ui/src/modules/docker-app/security-section.tsx` vs the docker-route convention):**
The docker-app route convention (sections mounted from `livos/packages/ui/src/routes/docker/sections/<name>.tsx` re-exporting from `livos/packages/ui/src/routes/docker/<name>/<name>-section.tsx`) is the authoritative pattern. Activity (`sections/activity.tsx` re-exports from `activity/activity-section.tsx`) and Logs (`sections/logs.tsx` re-exports from `logs/logs-section.tsx`) both follow this. **Recommend planner override the prompt's `modules/docker-app/` path and place files at:**
- `livos/packages/ui/src/routes/docker/sections/security.tsx` (1-line re-export)
- `livos/packages/ui/src/routes/docker/security/security-section.tsx` (root)
- `livos/packages/ui/src/routes/docker/security/jail-status-card.tsx`
- `livos/packages/ui/src/routes/docker/security/unban-modal.tsx`
- `livos/packages/ui/src/routes/docker/security/ban-ip-modal.tsx`
- `livos/packages/ui/src/routes/docker/security/audit-log-tab.tsx`

This co-locates section internals and matches Phase 28 / Phase 33 conventions exactly. **Sub-issue surfaced for planner.**

### `Settings > Show Security panel` toggle → analog Settings preferences pattern

The user_preferences read/write API exists at `livos/packages/livinityd/source/modules/user/preferences-routes.ts` (verified — uses `privateProcedure` with `.set / .get / .getAll / .delete`).

UI side: mirror `usage-section.tsx` neighbor — a small toggle row inside Settings that calls `trpcReact.preferences.set.useMutation({key: 'security_panel_visible', value: bool})`. Default ON.

The visibility check inside `sidebar.tsx` reads the preference via `trpcReact.preferences.get.useQuery({keys: ['security_panel_visible']})` and conditionally hides/shows the 'security' SECTION_META entry. Filter `SECTION_IDS` accordingly when rendering the nav.

**Backout safety (pitfall W-18):** toggle hides UI only — does NOT uninstall fail2ban or stop polling. The tRPC routes remain available; merely hidden from sidebar.

---

## Test File Pattern Assignments

### `parser.test.ts` → analog `translate-request.test.ts`

**Bare-tsx + node:assert/strict pattern** (translate-request.test.ts:1-50):
```ts
import assert from 'node:assert/strict'
import {translateAnthropicMessagesToSdkArgs} from './translate-request.js'

async function runTests() {
    // Test 1: single user message
    const r1 = translateAnthropicMessagesToSdkArgs({...})
    assert.equal(r1.task, 'hello')
    console.log('  PASS Test 1: single user message')
    // ...
    console.log('\nAll translate-request.test.ts tests passed (N/N)')
}
runTests().catch((err) => { console.error('FAILED:', err); process.exit(1) })
```

**Apply to parser.test.ts** — golden-file fixture tests using verbatim Mini PC fail2ban 1.0.2 output (paste real output strings into the test file as multi-line template literals). Cover:
- Multi-jail comma-list parsing (`Jail list: sshd, recidive`)
- Single-jail (no comma)
- Empty jail list
- `parseJailStatus` happy path with banned IPs
- `parseJailStatus` zero-banned case (empty `Banned IP list:`)
- `parseWhoOutput` with one SSH session (parens) + one local console (no parens)
- `parseWhoOutput` empty input

### `client.test.ts` → analog `auth.test.ts`

**Mock-by-injection pattern** (auth.test.ts:10-37) — auth.test.ts mocks Request/Response interfaces, not child_process. For client.test.ts, the cleanest path is **dependency injection**: client.ts exports a factory that takes `execFileImpl` parameter; tests pass a fake. Avoid `vi.mock('child_process')` per pitfall W-20.

```ts
// client.ts
export interface ExecFileFn {
    (binary: string, args: string[], opts: {timeout: number}): Promise<{stdout: string, stderr: string}>
}
export function makeFail2banClient(execFile: ExecFileFn) { ... }
export const realFail2banClient = makeFail2banClient(promisify(execFile))
```

**Apply to client.test.ts:**
- Test argv shape: `runFail2banClient(['status', 'sshd'])` calls execFile with `('/usr/bin/fail2ban-client', ['status', 'sshd'], {timeout: 10000})`.
- Test ENOENT → `Fail2banClientError({kind: 'binary-missing'})`.
- Test stderr "Could not find server" → `kind: 'service-down'`.
- Test stderr "does not exist" → `kind: 'jail-not-found'`.
- Test timeout → `kind: 'timeout'`.

### `integration.test.ts` → analog `livinity-broker/integration.test.ts`

**pg.Pool prototype patch + ephemeral express pattern** (broker integration.test.ts:30-80):
```ts
const originalConnect = pg.Pool.prototype.connect
;(pg.Pool.prototype as any).query = async function (sql: string, params?: unknown[]) {
    return mockPoolQuery(sql, params)
}
function mockPoolQuery(sql: string, params?: unknown[]) {
    if (/CREATE TABLE|CREATE INDEX/.test(sql)) return {rows: []}
    if (/FROM users WHERE id = \$1/.test(sql)) { /* return mock user */ }
    // ...
}
```

**Apply to fail2ban-admin/integration.test.ts:**
- Patch pg.Pool BEFORE importing the module.
- Mock the execFile boundary by injecting a fake `ExecFileFn` (same factory pattern as client.test.ts).
- Stand up a fresh tRPC server, fire `fail2ban.listJails` → assert canned jail array. Fire `fail2ban.unbanIp` → assert (a) execFile called with `set sshd unbanip 1.2.3.4` argv, (b) `device_audit_log` INSERT was attempted with correct sentinel + digest.

### `active-sessions.test.ts` → analog `auth.test.ts`

Inject a fake ExecFileFn that returns a multi-line `who -u` stdout fixture. Assert the parser extracts the right `(sourceIp)` per row, handles missing parens, handles IPv6-mapped IPv4 prefixes.

### `nexus/packages/core/package.json` — `test:phase46` script

**Anchor:** lines 22-27 (existing test:phase chain).

**Edit pattern:**
```json
"test:phase45": "npm run test:phase44 && tsx ../../../livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts && tsx ../../../livos/packages/livinityd/source/modules/server/trpc/common.test.ts && tsx ../../../livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts",
"test:phase46": "npm run test:phase45 && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts"
```

---

## Shared Patterns (apply to all relevant new files)

### Authentication / RBAC
**Source:** `livos/packages/livinityd/source/modules/server/trpc/trpc.ts:31` + `is-authenticated.ts:73-95`
**Apply to:** every procedure in `fail2ban-admin/routes.ts`
```ts
export const adminProcedure = privateProcedure.use(requireRole('admin'))
```
**All five routes use `adminProcedure`** (per pitfall M-06 — never `protectedProcedure`/`privateProcedure` for ban actions).

### Error Handling
**Source:** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:18-27` (UpstreamHttpError class)
**Apply to:** `client.ts` (Fail2banClientError class), `routes.ts` (re-throw or convert to TRPCError)
```ts
// In routes.ts — convert client errors to TRPC codes
if (err instanceof Fail2banClientError) {
    if (err.kind === 'binary-missing') throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'fail2ban_missing'})
    if (err.kind === 'service-down')   return {transient: true}  // for queries — UI handles W-05
    if (err.kind === 'jail-not-found') throw new TRPCError({code: 'NOT_FOUND', message: 'jail not found'})
    if (err.kind === 'ip-invalid')     throw new TRPCError({code: 'BAD_REQUEST', message: err.message})
    throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message})
}
```

### Validation
**Source:** Phase 37 factory-reset (type-confirm gate) + Phase 41 broker (Zod on userId regex)
**Apply to:** all mutation inputs in `fail2ban-admin/routes.ts`
- IP: trim + dotted-quad regex, no CIDR.
- Jail: `/^[a-zA-Z0-9_.-]+$/` (defense-in-depth even though enum-discoverable).
- Self-ban: `confirmation: z.literal('LOCK ME OUT').optional()` — required only when backend rejects with `'self_ban'` and UI re-prompts.

### Audit Logging
**Source:** `devices/audit-pg.ts:42-109`
**Apply to:** every mutation in `routes.ts` via `events.ts:recordFail2banEvent()` — fire-and-forget, never throws to caller.

### Polling
**Source:** `routes/docker/activity/use-activity-feed.ts:64-89`
**Apply to:** `security-section.tsx` query hooks
- `refetchInterval: 5_000` (per pitfall W-02)
- `staleTime: 2_500`
- `retry: false`
- Manual Refresh button calls `queryClient.invalidateQueries(['fail2ban'])`

### Modal/Dialog
**Source:** `routes/docker/stacks/stack-dialogs.tsx:25-76` (RemoveStackDialog)
**Apply to:** `unban-modal.tsx`, `ban-ip-modal.tsx`
- shadcn `Dialog` + `DialogHeader/Title/Description/Footer` + `Button variant='destructive'` for the action.
- `<Checkbox>` from shadcn for the whitelist opt-in.

### Test harness
**Source:** `livinity-broker/translate-request.test.ts` + `livinity-broker/auth.test.ts` + `livinity-broker/integration.test.ts`
**Apply to:** all four new fail2ban tests
- Bare `tsx` runner + `node:assert/strict`, no Vitest.
- Dependency injection over `vi.mock('child_process')` (pitfall W-20 / X-07).
- pg.Pool prototype patch for integration tests.

---

## No Analog Found

None — every file has a strong in-tree analog. The `who -u` parser is mostly novel, but the `who -u` *abstraction* (mock-friendly provider interface) follows the broker's `realActiveSessionsProvider` factory style exactly. The two-stage type-confirm modal is composed from existing primitives (Dialog + Input + literal-string compare); no single analog ships this exact pattern but factory-reset's type-confirm philosophy and stack-dialogs' Dialog skeleton combine cleanly.

---

## Recommended Wave Structure

The phase splits naturally into **3 dependency-ordered waves**, with tests **wave-coupled** to their source so each wave is end-to-end testable before the next starts.

### Wave 1 — Backend foundation (parallelizable internally)
**Independent files, no inter-file deps within this wave:**
- `fail2ban-admin/parser.ts` + `parser.test.ts`
- `fail2ban-admin/client.ts` + `client.test.ts` (depends on parser.ts only at runtime — type-only at compile)
- `fail2ban-admin/active-sessions.ts` + `active-sessions.test.ts`
- `fail2ban-admin/events.ts` (depends on existing `devices/audit-pg.ts` — re-uses `computeParamsDigest`)

**Exit gate:** `tsx parser.test.ts && tsx client.test.ts && tsx active-sessions.test.ts` all green.

### Wave 2 — Backend wiring
- `fail2ban-admin/index.ts` (barrel — depends on all Wave 1 files)
- `fail2ban-admin/routes.ts` (depends on index.ts + events.ts + active-sessions.ts)
- `fail2ban-admin/integration.test.ts`
- `server/trpc/index.ts` modification (+2 lines)
- `server/trpc/common.ts` modification (+5 lines)
- Extend `common.test.ts` with two new assertions for `'fail2ban.unbanIp'` + `'fail2ban.banIp'` presence (mirror Phase 45 lines 28-54 pattern).

**Exit gate:** `tsx integration.test.ts && tsx common.test.ts` green; livinityd compiles.

### Wave 3 — UI
**Internal parallel sub-waves:**

- **Wave 3a — primitives & sidebar registration:**
  - `routes/docker/store.ts` (+1 SectionId, +1 SECTION_IDS entry)
  - `routes/docker/sidebar.tsx` (+1 SECTION_META entry)
  - `routes/docker/docker-app.tsx` (+1 import, +1 case)
  - `routes/docker/sections/security.tsx` (1-line re-export)
  - Build the placeholder `routes/docker/security/security-section.tsx` with stub render so compiler is green.

- **Wave 3b — modals & sub-components (parallelizable):**
  - `routes/docker/security/unban-modal.tsx`
  - `routes/docker/security/ban-ip-modal.tsx`
  - `routes/docker/security/jail-status-card.tsx`
  - `routes/docker/security/audit-log-tab.tsx`

- **Wave 3c — top-level integration:**
  - Flesh out `routes/docker/security/security-section.tsx` — wire jail tabs + modals + polling + service-state banner.
  - `Settings > Show Security panel` toggle row.

**Exit gate:** `pnpm --filter ui build` clean; manual UAT against Mini PC scratchpad confirms section renders, jail list polls, unban succeeds.

### npm-script update
`nexus/packages/core/package.json :: test:phase46` lands at the **end of Wave 2** (so the chain `npm run test:phase46` runs all 4 fail2ban tests + Phase 45 + earlier).

---

## Sub-Issues Surfaced for the Planner

1. **UI file location convention conflict.** Prompt says `livos/packages/ui/src/modules/docker-app/security-section.tsx`; the codebase convention (verified against `routes/docker/sections/{activity,logs}.tsx` re-exporting from `routes/docker/{activity,logs}/`) points to `routes/docker/security/security-section.tsx` instead. **Recommend planner adopt the routes/docker/ convention** for cohesion with Phase 28 / 33 patterns. PATTERNS.md examples assume this corrected path.

2. **Settings UI exact location for the `Show Security panel` toggle is unspecified by the prompt.** Recommend mirroring `usage-section.tsx` neighbor placement (a small section card inside the existing settings flow). Planner should pick exact file (e.g., a new `_components/security-toggle-row.tsx`).

3. **Last-attempted-user column.** REQUIREMENTS.md lists this in "deferred if budget tight" (FEATURES.md table). PATTERNS.md does not assume the planner ships it. If shipped, parser.ts gains a fourth function `parseAuthLogForLastUser(ip: string): string | null` reading `/var/log/auth.log` lines like `Failed password for invalid user X from <ip>` — and routes.ts threads that through `getJailStatus`.

4. **Backout / Settings toggle integration with sidebar visibility.** When `security_panel_visible === false`, sidebar.tsx must filter SECTION_IDS — but `routes/docker/store.ts:section` may still hold `'security'` from a previous open. Add a `useEffect` in DockerApp that resets `section → 'dashboard'` when the security toggle flips off mid-session, OR (simpler) leave the section displaying but hide ONLY from sidebar (operator can navigate away naturally). Recommend the simpler path; planner decides.

5. **`Fail2ban-client` binary path on Mini PC.** Architecture research §1 says "already installed by `install.sh:517`". Verify the absolute path on Mini PC is `/usr/bin/fail2ban-client` (Ubuntu 24.04 noble package — likely correct). client.ts hardcodes this — planner should pin exactly which path the binary lives at and add a comment with the apt package version (`fail2ban 1.0.2-3ubuntu0.1`).

6. **Pre-existing `liv-memory.service` restart loop on Mini PC** (per project memory) is unrelated but might affect UAT signal — planner should be aware that Mini PC `journalctl -u livos -f` may show unrelated noise.

7. **`who -u` may not be available in livinityd container** if livinityd ever moves out of root user namespace. Currently livinityd runs as root on Mini PC (verified — D-LIVINITYD-IS-ROOT). active-sessions.ts should fail gracefully if `who` is missing (return `[]` + log warning, don't crash). Caller already handles empty array (degrades to HTTP-only IP detection).

---

## Anchor File:Line Reference Index

| Pattern | File | Line range |
|---------|------|-----------|
| broker module barrel | `livos/packages/livinityd/source/modules/livinity-broker/index.ts` | 1-29 |
| broker router (request-response w/ error mapping) | `livos/packages/livinityd/source/modules/livinity-broker/router.ts` | 36-187 |
| Pure parser pattern | `livos/packages/livinityd/source/modules/livinity-broker/translate-request.ts` | 32-107 |
| execFile + structured error | `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | 18-27, 92-106 |
| spawn + cgroup-escape | `livos/packages/livinityd/source/modules/system/factory-reset.ts` | 287-321 |
| pg INSERT + SHA-256 + fire-and-forget | `livos/packages/livinityd/source/modules/devices/audit-pg.ts` | 42-109 |
| tRPC adminProcedure router with q + m mix | `livos/packages/livinityd/source/modules/usage-tracking/routes.ts` | 1-94 |
| RBAC procedure factory | `livos/packages/livinityd/source/modules/server/trpc/trpc.ts` | 22-31 |
| RBAC role check | `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` | 73-95 |
| router registration | `livos/packages/livinityd/source/modules/server/trpc/index.ts` | 1-54 |
| httpOnlyPaths add | `livos/packages/livinityd/source/modules/server/trpc/common.ts` | 174-203 |
| httpOnlyPaths assertion test | `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` | 28-77 |
| section root + filter chips + polling | `livos/packages/ui/src/routes/docker/activity/activity-section.tsx` | 38-156 |
| 3-query polling hook | `livos/packages/ui/src/routes/docker/activity/use-activity-feed.ts` | 41-122 |
| sidebar SECTION_META | `livos/packages/ui/src/routes/docker/sidebar.tsx` | 52-65 |
| docker-app section switch | `livos/packages/ui/src/routes/docker/docker-app.tsx` | 64-91 |
| store SectionId + SECTION_IDS | `livos/packages/ui/src/routes/docker/store.ts` | 20-53 |
| destructive Dialog + Checkbox | `livos/packages/ui/src/routes/docker/stacks/stack-dialogs.tsx` | 25-76 |
| Table + Badge + relative timestamps | `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` | 31-100 |
| user_preferences tRPC | `livos/packages/livinityd/source/modules/user/preferences-routes.ts` | 1-55 |
| Bare-tsx test pattern | `livos/packages/livinityd/source/modules/livinity-broker/translate-request.test.ts` | 1-60 |
| Mock-by-injection test pattern | `livos/packages/livinityd/source/modules/livinity-broker/auth.test.ts` | 10-50 |
| pg.Pool prototype patch test pattern | `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` | 30-80 |
| device_audit_log schema | `livos/packages/livinityd/source/modules/database/schema.sql` | 109-142 |
| test:phase chain | `nexus/packages/core/package.json` | 22-27 |

---

## Metadata

**Analog search scope:**
- `livos/packages/livinityd/source/modules/livinity-broker/` (full module — 5-file mirror target)
- `livos/packages/livinityd/source/modules/usage-tracking/` (Phase 44 sibling — tRPC router shape)
- `livos/packages/livinityd/source/modules/devices/audit-pg.ts` (PG audit writer)
- `livos/packages/livinityd/source/modules/system/factory-reset.ts` (spawn + type-confirm philosophy)
- `livos/packages/livinityd/source/modules/server/trpc/` (full subtree — registration + RBAC)
- `livos/packages/ui/src/routes/docker/` (sections, store, sidebar, docker-app, activity/, stacks/)
- `livos/packages/ui/src/routes/settings/_components/` (toggle + table patterns)
- `livos/packages/livinityd/source/modules/user/preferences-routes.ts` (toggle persistence API)

**Files scanned:** 32 source files read (full or targeted ranges), 8 directories globbed, 6 cross-codebase greps.

**Pattern extraction date:** 2026-05-01
