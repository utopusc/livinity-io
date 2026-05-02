# Phase 47: AI Diagnostics — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 21 (15 NEW + 5 MODIFIED + 1 conditionally-MODIFIED sacred)
**Analogs found:** 21 / 21 (every file has at least a role-match analog already in-tree)

> **Discipline note:** Phase 47 is unusually well-paved. Phase 41 (`livinity-broker/`) and Phase 46 (`fail2ban-admin/`) both ship the exact 5-file backend module shape Phase 47 needs (barrel + 3 logic files + routes + integration test), and Phase 44 (`usage-tracking/routes.ts`) ships the exact `privateProcedure` + `ctx.currentUser.id` PG-scoping pattern needed for `apps.healthProbe`. **Plans 47-02/03/04 should be high-fidelity copies of these analogs, NOT new inventions.**

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `livos/packages/livinityd/source/modules/diagnostics/index.ts` | barrel | facade | `livos/.../fail2ban-admin/index.ts` | exact (5-file module barrel) |
| `livos/.../diagnostics/capabilities.ts` | service | request-response (Redis MULTI/RENAME) | `nexus/packages/core/src/capability-registry.ts` (`syncAll` reused) | exact role |
| `livos/.../diagnostics/model-identity.ts` | service | request-response (SSH execFile) | `livos/.../fail2ban-admin/active-sessions.ts` (DI exec wrapper) | exact (DI execFile factory) |
| `livos/.../diagnostics/app-health.ts` | service | request-response (HTTP probe) | `livos/.../livinity-broker/agent-runner-factory.ts:92` (`fetch + AbortController`) | role-match |
| `livos/.../diagnostics/routes.ts` | controller (tRPC router) | request-response | `livos/.../fail2ban-admin/routes.ts` + `usage-tracking/routes.ts` | exact (mixes admin+private patterns) |
| `livos/.../diagnostics/capabilities.test.ts` | test (unit) | n/a | `livos/.../fail2ban-admin/client.test.ts` (DI tsx + node:assert) | exact |
| `livos/.../diagnostics/model-identity.test.ts` | test (unit) | n/a | `livos/.../fail2ban-admin/active-sessions.test.ts` | exact |
| `livos/.../diagnostics/app-health.test.ts` | test (unit) | n/a | `livos/.../fail2ban-admin/client.test.ts` (recording exec / fetch fake) | exact |
| `livos/.../diagnostics/integration.test.ts` | test (integration) | n/a | `livos/.../fail2ban-admin/integration.test.ts` (pg.Pool prototype patch + tRPC caller) | exact |
| `livos/.../server/trpc/index.ts` | config (router registration) | request-response | same file lines 27, 55 (fail2ban registration) | exact |
| `livos/.../server/trpc/common.ts` | config (httpOnlyPaths) | n/a | same file lines 183-190 (fail2ban entries) + lines 55-63 (`apps.*` cluster) | exact |
| `livos/packages/ui/src/routes/settings/diagnostics/diagnostics-section.tsx` | component (section scaffold) | request-response | `livos/.../settings/_components/usage-section.tsx` | role-match (NEW directory) |
| `livos/.../diagnostics/registry-card.tsx` | component (card) | request-response | `livos/.../settings/_components/usage-banner.tsx` | role-match |
| `livos/.../diagnostics/model-identity-card.tsx` | component (card) | request-response | `livos/.../settings/_components/usage-banner.tsx` | role-match |
| `livos/.../diagnostics/app-health-card.tsx` | component (card, dual-mount) | request-response | `usage-banner.tsx` + `app-page/about-section.tsx` | role-match |
| `livos/.../settings/_components/settings-content.tsx` | config (sidebar entry) | n/a | same file lines 155-179 (MENU_ITEMS) + 452-455 (case dispatch) | exact (in-file) |
| `livos/.../app-store/app-page/app-content.tsx` | component (composition) | n/a | same file lines 47-51 (SettingsSection conditional render) | exact (in-file) |
| `nexus/packages/core/src/sdk-agent-runner.ts` (Branch B only) | sacred (surgical edit) | n/a | self, line 270 (`_identityLine + override` → `{type:'preset',...}`) | exact (surgical) |
| `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (Branch B only) | test (sacred SHA pin) | n/a | same file lines 31-42 (Phase 45 audit comment block) | exact (in-file) |
| `update.sh` (Branch A only) | shell script (deployment) | n/a | same file lines 480-507 (BUILD-02 multi-dir loop) | exact (in-file hardening) |
| `nexus/packages/core/package.json` | config (npm scripts) | n/a | same file `test:phase46` line | exact (in-file) |

---

## Pattern Assignments

### `livos/.../diagnostics/index.ts` (barrel, facade)

**Analog:** `livos/packages/livinityd/source/modules/fail2ban-admin/index.ts`

**Pattern: 5-file module + barrel re-exports + thin convenience wrappers** (lines 21-67):
```ts
// Re-export factories + types from each sub-file
export {
  realFail2banClient, makeFail2banClient, Fail2banClientError,
  type Fail2banErrorKind, type ExecFileFn, type Fail2banClient,
} from './client.js'
export {realActiveSessionsProvider, makeActiveSessionsProvider, ...} from './active-sessions.js'
export {recordFail2banEvent, type Fail2banAuditEvent} from './events.js'
export {parseJailList, parseJailStatus, ...} from './parser.js'

// Then: thin convenience wrappers around the *real* factory instance, so
// routes.ts gets a tidy `import {listJails, banIp} from './index.js'`
import {realFail2banClient} from './client.js'
export async function listJails(): Promise<string[]> {
  return realFail2banClient.listJails()
}
```

**Apply to Phase 47:** Re-export `realDiagnoseRegistry` + `flushAndResync` from `capabilities.ts`, `realDiagnoseModelIdentity` + `realRemediation` from `model-identity.ts`, `realProbeAppHealth` from `app-health.ts`. Then thin wrappers: `diagnoseRegistry()`, `flushAndResync(opts)`, `diagnoseModelIdentity()`, `probeAppHealth({appId, userId})`.

---

### `livos/.../diagnostics/capabilities.ts` (service, atomic-swap registry rebuild)

**Analog 1 (sync logic):** `nexus/packages/core/src/capability-registry.ts:145-168` (existing `syncAll()` — reuse, do NOT re-implement)
**Analog 2 (Redis pipeline pattern):** same file lines 156-165 (`pipeline().set(...)` then `.exec()`)

**Existing reusable function** (`capability-registry.ts:145-168`):
```ts
async syncAll(): Promise<void> {
  this.cache.clear()
  this.syncTools()
  this.syncSkills()
  await this.syncMcps()
  await this.syncAgents()
  // Persist to Redis via pipeline
  const pipeline = this.deps.redis.pipeline()
  for (const [id, manifest] of this.cache) {
    const [type, ...nameParts] = id.split(':')
    const name = nameParts.join(':')
    pipeline.set(`${CapabilityRegistry.REDIS_PREFIX}${type}:${name}`, JSON.stringify(manifest))
  }
  await pipeline.exec()
}
```

**Atomic-swap pattern to ADD** (per success criterion 3 + pitfall B-06): the registry uses prefix `nexus:cap:` (NOT `capability:` — confirm in source line 83). Atomic swap recipe:

1. **Phase 1 — Build pending:** Sync to a temporary key prefix (`nexus:cap:_pending:*`) — duplicate `syncAll()` body but rewrite the `pipeline.set` line to use the pending prefix. Existing in-memory cache remains live and serves reads during the build.
2. **Phase 2 — Read user overrides BEFORE swap** (per pitfall B-07): `SELECT capability_id, enabled FROM user_capability_overrides WHERE user_id = $1 AND enabled = false` — store in memory. (Note: `user_capability_overrides` table does NOT yet exist in `schema.sql` per grep — Plan 47-02 must either create it OR document that in v29.4 there are no user overrides yet, so this step is a no-op until Phase 22 ships the table. Recommend: feature-flag the override re-apply behind a `tableExists` check.)
3. **Phase 3 — Atomic pointer swap:** Use a Lua script via `redis.eval()` that scans `nexus:cap:_pending:*`, RENAMES each to `nexus:cap:*` (overwriting), then DELs any leftover `nexus:cap:*` keys not in the pending set. Single Redis round-trip → atomic from the perspective of any subsequent `discover_capability` call.
4. **Phase 4 — Re-apply user overrides** (post-swap): for each row from step 2, `redis.hset` (or `set` JSON-mutating) the `enabled: false` flag. (Or simpler: write override-aware build in step 1 to pre-merge before the swap.)
5. **Phase 5 — Audit row:** `redis.lpush('nexus:cap:_audit_history', JSON.stringify({ts, actor, scope, before, after}))` with `LTRIM 0 99` (per pitfall W-21).

**3-way categorization for `diagnoseRegistry()`** (per pitfall W-12 + success criterion 2):
- `expectedAndPresent`: tool in built-in manifest AND in Redis.
- `missing.lost`: tool in built-in manifest, NOT in Redis, precondition met → resync helps.
- `missing.precondition`: tool in built-in manifest, NOT in Redis, precondition NOT met (no API key, no connection) → resync won't help.
- `missing.disabledByUser`: tool present in `user_capability_overrides` with `enabled=false`.
- `unexpectedExtras`: tool in Redis but NOT in built-in manifest (stale entries → resync removes them).

**Critical:** scope of flush is `nexus:cap:tool:*`, `nexus:cap:skill:*`, `nexus:cap:mcp:*`, `nexus:cap:hook:*`, `nexus:cap:agent:*` ONLY — preserve `nexus:cap:_meta:*` and `nexus:cap:_audit*` (per pitfall W-14).

---

### `livos/.../diagnostics/model-identity.ts` (service, SSH-execute 6-step diagnostic)

**Analog (DI execFile factory):** `livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.ts:48-79`

**Pattern: factory taking injected ExecFileFn** (lines 48-79):
```ts
export function makeActiveSessionsProvider(
  execFile: ExecFileFn,
  logger: MinimalLogger = console,
): ActiveSessionsProvider {
  return {
    async listActiveSshSessions() {
      let stdout: string
      try {
        const r = await execFile(WHO_BINARY, ['-u'], {timeout: WHO_TIMEOUT_MS})
        stdout = r.stdout
      } catch (err) {
        const code = (err as {code?: string})?.code ?? ''
        if (code === 'ENOENT') {
          logger.warn('[fail2ban-active-sessions] `who` binary missing; returning empty session list')
          return []
        }
        // ...graceful degrade...
        return []
      }
      return parseWhoOutput(stdout)
    },
  }
}

// Production-wired
const execFileP = promisify(execFileCb)
const realExec: ExecFileFn = async (binary, args, opts) => {
  const r = await execFileP(binary, args, {timeout: opts.timeout, encoding: 'utf8'})
  return {stdout: r.stdout, stderr: r.stderr}
}
export const realActiveSessionsProvider: ActiveSessionsProvider = makeActiveSessionsProvider(realExec)
```

**Apply to Phase 47:** `makeModelIdentityDiagnostic(execFile, fetch)` returns `{diagnose(): Promise<{step1..step6, verdict}>}`. The 6 steps (per CONTEXT.md):
1. `await fetch('http://localhost:8080/u/<userId>/v1/messages', {body: ...})` → inspect response.
2. parse `response.model` field literal.
3. `execFile('cat', ['/proc/<claude-pid>/environ'])` (best-effort, swallow ENOENT — claude may not be running).
4. `execFile('ls', ['-la', '/opt/livos/node_modules/.pnpm/'])` then JS-grep for `@nexus+core*` count > 1 → flag dist-drift risk.
5. `execFile('readlink', ['-f', '/opt/livos/node_modules/@nexus/core'])` → resolved path.
6. `execFile('grep', ['-l', '_identityLine', resolvedPath + '/dist/index.js'])` (or similar marker) → presence/absence.

**Verdict computation (4 buckets):**
- `dist-drift`: step 4 reports >1 `@nexus+core*` dir AND step 6's marker is missing in resolved dir.
- `source-confabulation`: step 6's marker is present in resolved dir BUT step 1's response model field disagrees with the deterministic prompt.
- `both`: both conditions met.
- `neither`: clean — diagnostic surfaces only, no remediation.

**SSH wrapper note:** the diagnostic runs ON the Mini PC (livinityd is already root on the Mini PC per architecture research), so `execFile` is local-spawn — NOT `ssh root@10.69.31.68 ...`. Phase 47 is "diagnostic via livinityd", NOT "diagnostic via remote SSH from a workstation." This eliminates B-08-class tunnel concerns.

**Branch decision is OUTPUT, not INPUT:** the routes.ts layer returns `verdict` to UI; remediation is a separate user-initiated mutation (or done by the human operator following Plan 47-03's branched plan).

---

### `livos/.../diagnostics/app-health.ts` (service, undici probe, PG-scoped)

**Analog 1 (fetch + AbortController + signal-on-close):** `livos/.../livinity-broker/openai-router.ts:165-167` and `livos/.../livinity-broker/agent-runner-factory.ts:92`

**Pattern (`openai-router.ts:165-167`):**
```ts
const abortController = new AbortController()
res.on('close', () => abortController.abort())
// ...
const response = await fetch(url, {signal: abortController.signal, ...})
```

**Apply to Phase 47 with 5s timeout:**
```ts
import {randomUUID} from 'node:crypto'
import {getUserAppInstance} from '../database/index.js'

export interface ProbeResult {
  reachable: boolean
  statusCode: number | null
  ms: number | null
  lastError: string | null
  probedAt: string  // ISO timestamp
}

export async function probeAppHealth({appId, userId}: {appId: string; userId: string}): Promise<ProbeResult> {
  // PG-scoping (anti-port-scanner) — see analog 2 below
  const instance = await getUserAppInstance(userId, appId)
  if (!instance) {
    return {reachable: false, statusCode: null, ms: null, lastError: 'app_not_owned', probedAt: new Date().toISOString()}
  }
  const url = `http://localhost:${instance.port}/`  // localhost loopback — Caddy routes the public subdomain, but the probe goes direct to container

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 5_000)
  const start = Date.now()
  try {
    const r = await fetch(url, {signal: ctl.signal, method: 'GET'})
    return {reachable: r.ok, statusCode: r.status, ms: Date.now() - start, lastError: null, probedAt: new Date().toISOString()}
  } catch (err: any) {
    return {
      reachable: false,
      statusCode: null,
      ms: Date.now() - start,
      lastError: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'fetch_failed'),
      probedAt: new Date().toISOString(),
    }
  } finally {
    clearTimeout(t)
  }
}
```

**Analog 2 (PG-scoped query — anti-port-scanner pattern):** `livos/packages/livinityd/source/modules/usage-tracking/routes.ts:30-65` (`getMineProc`) **AND** `livos/.../database/index.ts:377-386` (`getUserAppInstance`).

**Critical anti-pattern from `usage-tracking/routes.ts:44`:**
```ts
const userId = ctx.currentUser.id  // NEVER from input
const rows: UsageRow[] = await queryUsageByUser({userId, since})
```

The probe MUST follow this exact pattern: `userId` comes from `ctx.currentUser.id`, `appId` is the only input. No accepting arbitrary URLs.

---

### `livos/.../diagnostics/routes.ts` (controller, mixed admin + private)

**Analog 1 (admin procedures + Zod + tRPC error mapping):** `livos/.../fail2ban-admin/routes.ts:159-220`
**Analog 2 (private procedure + ctx.currentUser.id scoping):** `livos/.../usage-tracking/routes.ts:30-65`

**Pattern: admin diagnostic + admin mutation + private probe** (combined from analogs):
```ts
import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {adminProcedure, privateProcedure, router} from '../server/trpc/trpc.js'
import {diagnoseRegistry, flushAndResync, diagnoseModelIdentity, probeAppHealth} from './index.js'

// Mirrors fail2ban-admin/routes.ts's error mapping + Zod schemas
const flushScopeSchema = z.object({scope: z.enum(['builtins', 'all']).default('builtins')})  // per pitfall W-13

const diagnosticsRouter = router({
  // FR-TOOL-01 — admin diagnostic (read-only, returns 3-way categorization)
  capabilitiesDiagnoseRegistry: adminProcedure.query(async () => {
    return diagnoseRegistry()
  }),

  // FR-TOOL-02 — admin mutation (atomic-swap rebuild)
  capabilitiesFlushAndResync: adminProcedure
    .input(flushScopeSchema)
    .mutation(async ({input, ctx}) => {
      const result = await flushAndResync({scope: input.scope, actorUserId: ctx.currentUser?.id})
      return result  // {before, after, overridesPreserved, durationMs}
    }),

  // FR-MODEL-01 — admin diagnostic (6-step on-Mini-PC)
  modelIdentityDiagnose: adminProcedure.query(async () => {
    return diagnoseModelIdentity()
  }),

  // FR-PROBE-01 — privateProcedure (NOT admin per success criterion 8)
  appsHealthProbe: privateProcedure
    .input(z.object({appId: z.string()}))
    .mutation(async ({ctx, input}) => {
      if (!ctx.currentUser) {
        throw new TRPCError({code: 'UNAUTHORIZED', message: 'authentication required'})
      }
      return probeAppHealth({appId: input.appId, userId: ctx.currentUser.id})
    }),
})

export default diagnosticsRouter
```

**Router export name:** the Phase 47 router is mounted as `diagnostics` in `index.ts` (see registration pattern below). To match the route names referenced in CONTEXT.md (`capabilities.diagnoseRegistry`, `apps.healthProbe`), Phase 47 has TWO options:
- **Option A (recommended):** mount under one namespace `diagnostics` and use route names `diagnostics.capabilitiesDiagnoseRegistry`, `diagnostics.appsHealthProbe`. Single namespace, mirrors `fail2ban` and `usage`.
- **Option B (matches CONTEXT.md exactly):** add routes to existing `apps` and a NEW `capabilities` namespace. More plumbing in `server/trpc/index.ts` but matches CONTEXT.md's verbatim names. **Plan 47-04 should pick A or B explicitly.**

If Option A picked, httpOnlyPaths entries are `'diagnostics.capabilitiesFlushAndResync'` + `'diagnostics.appsHealthProbe'`. If Option B picked, they are `'capabilities.flushAndResync'` + `'apps.healthProbe'`.

---

### `livos/.../diagnostics/{capabilities,model-identity,app-health}.test.ts` (unit tests)

**Analog:** `livos/.../fail2ban-admin/client.test.ts:1-67` AND `livos/.../fail2ban-admin/active-sessions.test.ts`

**Pattern (DI fakes via `tsx` + `node:assert/strict`, NO vitest, NO vi.mock):**
```ts
import assert from 'node:assert/strict'
import {makeFail2banClient, type ExecFileFn} from './client.js'

interface CapturedCall {binary: string; args: string[]; opts: {timeout: number}}
function makeRecordingExec(stdout = '', stderr = ''): {exec: ExecFileFn; calls: CapturedCall[]} {
  const calls: CapturedCall[] = []
  const exec: ExecFileFn = async (binary, args, opts) => {
    calls.push({binary, args, opts})
    return {stdout, stderr}
  }
  return {exec, calls}
}

async function runTests() {
  // Test 1: argv shape
  {
    const {exec, calls} = makeRecordingExec(`Status\n...`)
    const client = makeFail2banClient(exec)
    await client.listJails()
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args, ['status'])
    console.log('  PASS Test 1: ...')
  }
  // ...more tests...
  console.log('\nAll tests passed (N/N)')
}

runTests().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
```

**Apply to Phase 47:**
- `capabilities.test.ts`: inject a fake `ioredis` client (or use `redis://localhost:6379/15` per pitfall W-15 — DB index 15 is reserved for tests). Assert atomic-swap proves no-empty-window: parallel-fire 50 `discover_capability` calls during a `flushAndResync`, assert ZERO see empty registry. Assert user-override re-apply: write `enabled=false` for `shell` to PG, run flushAndResync, assert `shell.enabled === false` post-swap.
- `model-identity.test.ts`: inject fake `execFile` returning fixture stdout for each step; assert verdict computation against 4 fixture sets (one per bucket).
- `app-health.test.ts`: inject fake `fetch` (override the `globalThis.fetch` for the duration of one test, restore after — Phase 46 integration.test.ts pattern at lines 184-208 shows the override-and-restore template). Assert 5s timeout fires (use `setTimeout(() => ctl.abort(), 5_000)` and a fake-fetch that delays 6s — but in tests, override the timeout constant or use a controlled clock). Assert PG-scoping: pass `appId` belonging to a different user → `lastError === 'app_not_owned'`.

---

### `livos/.../diagnostics/integration.test.ts` (integration test via tRPC caller)

**Analog:** `livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts:1-115` (pg.Pool prototype patch + tRPC caller + synthetic admin context)

**Pattern (lines 30-115):**
```ts
import assert from 'node:assert/strict'
import pg from 'pg'

const insertedAuditRows: AuditRow[] = []
let execCalls: ExecCall[] = []

// Patch pg.Pool prototype BEFORE module imports
const originalConnect = pg.Pool.prototype.connect
const originalQuery = pg.Pool.prototype.query
;(pg.Pool.prototype as any).query = async function (sql: string, params?: unknown[]) {
  return mockPoolQuery(sql, params)
}
function mockPoolQuery(sql: string, params?: unknown[]): {rows: unknown[]} {
  if (/CREATE TABLE|CREATE INDEX/.test(sql)) return {rows: []}
  if (/FROM users WHERE id = \$1/.test(sql)) { /* return admin row */ }
  if (/INSERT INTO device_audit_log/.test(sql)) { /* push to insertedAuditRows */ }
  return {rows: []}
}

async function runTests() {
  const dbMod = await import('../database/index.js')
  await dbMod.initDatabase({...silentLogger})

  // Override real* bindings on the live module objects
  const {default: diagnosticsRouter} = await import('./routes.js')

  function makeAdminCtx() {
    return {
      logger: {log: () => {}, ...},
      dangerouslyBypassAuthentication: true,
      currentUser: {id: 'admin-1', username: 'admin', role: 'admin'},
      transport: 'express' as const,
      request: {headers: {}} as any,
      response: undefined as any,
      // ...rest of Context shape per server/trpc/context.ts
    }
  }
  const caller = (ctx) => diagnosticsRouter.createCaller(ctx as any)

  // Test 1: capabilitiesDiagnoseRegistry returns 3-way categorization
  // Test 2: capabilitiesFlushAndResync atomic swap (no empty window)
  // Test 3: appsHealthProbe scoped — admin's appId from another user → app_not_owned
  // Test 4: appsHealthProbe success — undici fake returns 200
  // Test 5: appsHealthProbe timeout — undici fake delays 6s, expect lastError='timeout'
  // Test 6: modelIdentityDiagnose verdict='neither' on clean fixtures
  // Test 7: RBAC — non-admin caller calling capabilitiesDiagnoseRegistry throws FORBIDDEN

  console.log('\nAll integration tests passed')
}
runTests().catch((err) => { console.error(err); process.exit(1) })
```

---

### `livos/.../server/trpc/index.ts` (config — register router)

**Analog:** same file, lines 27 + 55 (fail2ban registration)

**Exact lines to add** (mirroring lines 27 + 55):
```ts
// Line ~28
import diagnostics from '../../diagnostics/routes.js'

// Inside appRouter object, line ~56
const appRouter = router({
  // ... existing entries ...
  fail2ban,
  diagnostics,  // ← NEW
})
```

---

### `livos/.../server/trpc/common.ts` (config — httpOnlyPaths)

**Analog:** same file, lines 175-190 (Phase 45 + Phase 46 cluster)

**Pattern (lines 175-190):**
```ts
// v29.4 Phase 45 Plan 03 (FR-CF-03) — Phase 40 per-user Claude OAuth login...
// Without HTTP transport, mutations/queries silently queue and drop during
// the ~5s WS reconnect window — pitfall B-12 / X-04.
'ai.claudePerUserStartLogin',
'usage.getMine',
'usage.getAll',
// v29.4 Phase 46 — Fail2ban admin mutations...
'fail2ban.unbanIp',
'fail2ban.banIp',
```

**Apply to Phase 47** — append after line 190 with matching audit-comment block:
```ts
// v29.4 Phase 47 — AI Diagnostics. Atomic-swap registry rebuild can take
// 5-10s during full resync (mirror docker.scanImage line 100 precedent).
// App-health probe is a query but uses HTTP for reliability through the
// half-broken WS window post-restart (precedent: usage.getMine line 181).
// Pitfall B-12 / X-04.
'diagnostics.capabilitiesFlushAndResync',  // mutation
'diagnostics.appsHealthProbe',             // mutation (timing-sensitive)
```

(Adjust namespacing to Option A or B per routes.ts decision above.)

**Test fixture:** add `common.test.ts` Test 8/9/10 mirroring lines 75-105 (assert presence + namespace footgun guard).

---

### `livos/.../settings/diagnostics/diagnostics-section.tsx` (component, shared scaffold)

**Analog 1 (section structure):** `livos/.../settings/_components/usage-section.tsx:27-136`
**Analog 2 (DiagnosticCard primitive):** v29.4-ARCHITECTURE.md §3 already defined the shape

**Pattern from `usage-section.tsx:27-86`:**
```tsx
export function UsageSection() {
  const myUsageQ = trpcReact.usage.getMine.useQuery(undefined, {refetchInterval: 30_000})
  const adminProbeQ = trpcReact.usage.getAll.useQuery(undefined, {retry: false, refetchOnWindowFocus: false})
  const isAdmin = adminProbeQ.isSuccess

  if (myUsageQ.isLoading) {
    return <div className='space-y-4'><h2>Loading…</h2></div>
  }
  // ... render ...
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-body font-semibold'>Diagnostics</h2>
      </div>
      <RegistryCard />
      <ModelIdentityCard />
      <AppHealthCard />
    </div>
  )
}
```

**D-DIAGNOSTICS-CARD shared shell** (per v29.4-ARCHITECTURE.md §3):
```tsx
function DiagnosticCard({title, status, detail, action}: {
  title: string
  status: 'ok' | 'warn' | 'error' | 'idle' | 'loading'
  detail: React.ReactNode
  action?: {label: string; onClick: () => void; loading?: boolean}
}) {
  // mirror UsageBanner colour palette: amber-500/30 for warn, red-500/30 for error, green or border-default for ok
  return (
    <div className='rounded-radius-sm border border-border-default bg-surface-raised p-3'>
      <div className='flex items-center justify-between'>
        <div className='text-body font-medium'>{title}</div>
        <StatusBadge status={status} />
      </div>
      <div className='text-body-sm text-text-secondary mt-2'>{detail}</div>
      {action && <Button onClick={action.onClick} disabled={action.loading}>{action.label}</Button>}
    </div>
  )
}
```

**Sidebar entry routing:** new directory `routes/settings/diagnostics/` (NOT `_components/`). The Phase 46 Settings sidebar wired security via `_components/security-toggle-row.tsx` because it's a single row inside Advanced. Phase 47 needs a full SECTION (3 cards) so it follows the `usage-section.tsx`-style "section component" pattern. **The directory rename from `_components/` to `diagnostics/` is intentional per CONTEXT.md** — sub-files (`registry-card.tsx`, etc.) are private to the section, so they can sit in the section's own directory rather than polluting `_components/`.

---

### `livos/.../diagnostics/{registry,model-identity,app-health}-card.tsx` (component cards)

**Analog (color palette + icon usage):** `livos/.../settings/_components/usage-banner.tsx:25-56`

**Pattern (lines 28-39):**
```tsx
import {TbAlertCircle, TbAlertTriangle, TbCircleCheck} from 'react-icons/tb'

if (state === 'warn') {
  return (
    <div className='flex items-start gap-2 rounded-radius-sm border border-amber-500/30 bg-amber-500/10 p-3 text-body-sm text-amber-300'>
      <TbAlertTriangle className='mt-0.5 size-4 shrink-0' />
      <div>
        <div className='font-medium'>{title}</div>
        <div className='text-amber-200/80 text-caption mt-0.5'>{detail}</div>
      </div>
    </div>
  )
}
```

**Apply per card:**
- `registry-card.tsx`: 5 categories (3 missing buckets + present + extras). Resync button greyed out if `missing.lost` count is 0 (per W-12). Action calls `trpcReact.diagnostics.capabilitiesFlushAndResync.useMutation()`.
- `model-identity-card.tsx`: shows verdict badge + 6 step results in expandable detail. NO action button — remediation is the operator's responsibility (Branch A is `update.sh` rerun, Branch B is a code patch + redeploy).
- `app-health-card.tsx`: dual-mount component. Takes optional `appId` prop. When mounted in `diagnostics-section.tsx`, iterates `apps.list` and shows one row per installed app. When mounted in `app-content.tsx` (per `app-page/about-section.tsx` pattern), takes a single `appId` prop and renders inline. Action: "Probe now" → `trpcReact.diagnostics.appsHealthProbe.useMutation()`.

---

### `livos/.../settings/_components/settings-content.tsx` (config — sidebar entry)

**Analog (in same file):** lines 155-179 (MENU_ITEMS) + lines 452-455 (case dispatch)

**Pattern (lines 155-179):**
```tsx
const MENU_ITEMS: MenuItem[] = [
  // ...
  {id: 'usage', icon: TbChartBar, label: 'Usage', description: 'Token usage & cost tracking'},
  // ...
]
```

**Apply:** add a row after `usage`:
```tsx
{id: 'diagnostics', icon: TbStethoscope, label: 'Diagnostics', description: 'Capability registry, model identity, app health', adminOnly: true},
```

And add the dispatch case (after line 455):
```tsx
case 'diagnostics':
  return <DiagnosticsSection />
```

Plus type-extend `SettingsSection` union (line 130-145) with `| 'diagnostics'`.

Plus a `const DiagnosticsSection = React.lazy(() => import('../diagnostics/diagnostics-section').then(m => ({default: m.DiagnosticsSection})))` (matching the `MyDomainsSectionLazy`/`SchedulerSectionLazy` pattern at lines 1408-1412).

---

### `livos/.../app-store/app-page/app-content.tsx` (component — inline probe button)

**Analog (in same file):** lines 47-51 (`SettingsSection` conditional render)

**Pattern (lines 47-51):**
```tsx
{userApp && <SettingsSection userApp={userApp} />}
{userApp && <PublicAccessSection appId={app.id} appName={app.name} appPort={app.port || 0} />}
```

**Apply:** add a sibling render conditional on `userApp` for `<AppHealthCard appId={app.id} />`:
```tsx
{userApp && <AppHealthCard appId={app.id} />}
```

Both desktop (lines 32-56) and mobile (lines 58-75) sections must add the same render — same pattern as `SettingsSection` already does.

---

### `nexus/packages/core/src/sdk-agent-runner.ts` (Branch B sacred surgical edit)

**Analog (in same file):** lines 263-280 — current `_identityLine + (override ?? default)` construction

**Current code (lines 269-280):**
```ts
const _identityLine = `You are powered by the model named ${_displayName}. The exact model ID is ${_modelId}.\n\n`;
let systemPrompt = _identityLine + (this.config.systemPromptOverride ?? `You are Nexus, an autonomous AI assistant running on a Linux server. You interact with users via WhatsApp, Telegram, Discord, and a web UI.

You have access to MCP tools (prefixed with mcp__nexus-tools__) for shell commands, Docker management, file operations, web browsing, memory, and messaging.

CRITICAL RULES:
1. ONLY do what the user explicitly asks. Do NOT invent tasks, repeat previous work, or act on conversation history unless the user specifically requests it.
// ...
6. When the task is complete, provide your final answer immediately — do not keep exploring.`);
```

**Branch B surgical edit (per CONTEXT.md decisions):**

Change `systemPrompt` from a string to a typed union, and switch the SDK options site (line 343) to pass through. Per CONTEXT.md verbatim:
- FROM: `systemPrompt: "<raw text>"` (string)
- TO: `systemPrompt: { type: 'preset', preset: 'claude_code', append: "<raw text>" }`

**Concrete diff (lines 269-281 + line 343):**
```ts
// BEFORE
const _identityLine = `You are powered by ...`;
let systemPrompt = _identityLine + (this.config.systemPromptOverride ?? `You are Nexus...`);

// AFTER
const _identityLine = `You are powered by ...`;
const _appendBody = this.config.systemPromptOverride ?? `You are Nexus...`;
const systemPrompt = {
  type: 'preset' as const,
  preset: 'claude_code' as const,
  append: _identityLine + _appendBody,
};
// ... line 343 unchanged: `systemPrompt,` (now passes the object instead of string — SDK accepts both)
```

**Sacred-file ritual (D-40-01) MANDATORY:**
1. **Pre-edit SHA capture:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → record into Plan 47-03 audit notes.
2. Behavior-preserving edit (above).
3. **Post-edit SHA capture** → new BASELINE_SHA value.
4. **Re-pin** in `sdk-agent-runner-integrity.test.ts:42` with audit comment quoting the diff (template lines 31-42).

---

### `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (Branch B re-pin)

**Analog (in same file):** lines 31-42 (Phase 45 audit comment + BASELINE_SHA constant)

**Existing audit comment template (lines 30-42):**
```ts
// BASELINE updated 2026-04-30 by v29.3 Phase 40 (homeOverride addition for per-user OAuth isolation).
// BASELINE re-pinned 2026-05-01 by v29.4 Phase 45 plan 01 (Carry-Forward C2).
// Source byte-identical at re-pin; SHA moved from 623a65b9... to 4f868d31... due to v43.x
// model-bump drift commits (most recent first):
//   - 9f1562be feat(43.12): bump tierToModel to Claude 4.X (Opus 4.7 / Sonnet 4.6) + Bolt.diy category fix
//   - 47890a85 feat(43.10): inject model identity line — fix Claude 3.5 Sonnet hallucination
//   - 9d368bb5 feat(43.8): broker passthrough — drop Nexus identity for raw API callers
// Verification: `git diff --shortstat <c2-commit>~1 <c2-commit> -- nexus/packages/core/src/sdk-agent-runner.ts`
// returns empty for the C2 commit (audit-only — no source change).
// See .planning/phases/40-per-user-claude-oauth-home-isolation/40-CONTEXT.md D-40-02 / D-40-11.
// See .planning/phases/45-carry-forward-sweep/45-CONTEXT.md FR-CF-02.
const BASELINE_SHA = '4f868d318abff71f8c8bfbcf443b2393a553018b';
```

**Branch B re-pin (append-only, do NOT delete prior comment):**
```ts
// BASELINE re-pinned 2026-05-01 by v29.4 Phase 47 plan 03 (Branch B — model-identity systemPrompt edit per D-40-01).
// Source CHANGED at re-pin (FR-MODEL-02 surgical edit). Diff summary:
//   - line 270 systemPrompt construction: string → {type:'preset', preset:'claude_code', append: ...}
//   - line ~343 (SDK options): no change (SDK accepts both string and preset-union shapes)
// Behavior-preserving for non-broker callers; for broker passthrough mode (systemPromptOverride='')
// the preset injection restores the bundled <env> block that 43.10 was working around — fix is at
// the layer where the bug originated.
// Verification: `git diff <a2-commit>~1 <a2-commit> -- nexus/packages/core/src/sdk-agent-runner.ts`
// shows a single 12-line hunk at the systemPrompt construction site.
// See .planning/phases/47-ai-diagnostics/47-CONTEXT.md decisions §FR-MODEL Branch B.
const BASELINE_SHA = '<NEW_SHA_FROM_POST_EDIT>';
```

---

### `update.sh` (Branch A patch)

**Analog (in same file):** lines 480-507 (BUILD-02 multi-dir loop)

**Existing pattern (lines 480-507):**
```bash
# ── Phase 31 BUILD-02: multi-dir dist-copy loop ──
# Replaces the `find ... | head -1` single-target bug (BACKLOG 999.5b).
NEXUS_CORE_DIST_SRC="$NEXUS_DIR/packages/core/dist"
if [[ ! -d "$NEXUS_CORE_DIST_SRC" ]] || [[ -z "$(find "$NEXUS_CORE_DIST_SRC" -type f 2>/dev/null | head -1)" ]]; then
    echo "DIST-COPY-FAIL: source $NEXUS_CORE_DIST_SRC is empty — nexus core build did not emit" >&2
    exit 1
fi
COPY_COUNT=0
for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do
    [[ -d "$store_dir" ]] || continue
    target_parent="${store_dir}node_modules/@nexus/core"
    target="${target_parent}/dist"
    mkdir -p "$target_parent"
    rm -rf "$target"
    cp -r "$NEXUS_CORE_DIST_SRC" "$target"
    if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
        echo "DIST-COPY-FAIL: post-copy target $target is empty" >&2
        exit 1
    fi
    COPY_COUNT=$((COPY_COUNT + 1))
    echo "[VERIFY] nexus core dist copied to $store_dir"
done
```

**Branch A hardening (per pitfall B-05 + memory's update.sh quirk):**

The multi-dir loop ALREADY EXISTS (Phase 31 BUILD-02). Branch A's job is to verify it's still correct AND add a post-copy verification step that confirms the resolved-symlink dir matches at least one of the COPY targets. Concrete addition:
```bash
# ── Phase 47 Branch A: post-copy resolved-symlink verification ──
# Catches the pnpm-store dist-drift bug (memory: update.sh pnpm-store quirk)
# where livinityd's actual @nexus/core resolution lands on a dir that wasn't
# in the COPY loop. If the resolved dir's dist/index.js mtime is stale,
# fail loudly rather than letting livinityd boot stale.
RESOLVED_DIST=$(readlink -f /opt/livos/node_modules/@nexus/core)/dist/index.js
if [[ ! -f "$RESOLVED_DIST" ]]; then
    echo "DIST-COPY-FAIL: resolved nexus core dist not found at $RESOLVED_DIST" >&2
    exit 1
fi
# Compare mtime (within 60s of NOW since we just copied) — stale → drift bug
if [[ $(($(date +%s) - $(stat -c %Y "$RESOLVED_DIST"))) -gt 60 ]]; then
    echo "DIST-COPY-FAIL: resolved dist $RESOLVED_DIST is stale (>60s old) — pnpm resolution dir was NOT in the COPY loop" >&2
    exit 1
fi
ok "Resolved nexus core dist verified fresh"
```

Insert AFTER line 507 (the existing `ok "Nexus dist linked to ..."` line).

---

### `nexus/packages/core/package.json` (config — npm test script)

**Analog (in same file):** existing `test:phase45` and `test:phase46` scripts

**Pattern (verbatim from package.json):**
```json
"test:phase46": "npm run test:phase45 && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/parser.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/active-sessions.test.ts && tsx ../../../livos/packages/livinityd/source/modules/fail2ban-admin/integration.test.ts"
```

**Apply for Phase 47:**
```json
"test:phase47": "npm run test:phase46 && tsx ../../../livos/packages/livinityd/source/modules/diagnostics/capabilities.test.ts && tsx ../../../livos/packages/livinityd/source/modules/diagnostics/model-identity.test.ts && tsx ../../../livos/packages/livinityd/source/modules/diagnostics/app-health.test.ts && tsx ../../../livos/packages/livinityd/source/modules/diagnostics/integration.test.ts"
```

If Branch B is taken, the `sdk-agent-runner-integrity.test.ts` is already covered by `test:phase39` (transitively chained from `test:phase47` → `test:phase46` → ... → `test:phase39`). No additional script entry needed.

---

## Shared Patterns

### Authentication / RBAC
**Source:** `livos/packages/livinityd/source/modules/server/trpc/trpc.ts:25-31` + `is-authenticated.ts:73-96`
**Apply to:** `routes.ts` for ALL diagnostics routes
```ts
export const privateProcedure = baseProcedure.use(isAuthenticated)
export const adminProcedure = privateProcedure.use(requireRole('admin'))
```
Use `adminProcedure` for `capabilities.*` and `modelIdentity.*` (admin diagnostic + admin remediation). Use `privateProcedure` for `apps.healthProbe` (per-user, scoped to `ctx.currentUser.id`).

### Error Handling (TRPCError mapping with `.kind` discriminator)
**Source:** `livos/.../fail2ban-admin/routes.ts:77-109`
**Apply to:** All Phase 47 routes that wrap external IO (Redis, fetch, execFile)
```ts
function mapClientErrorToTrpc(err: unknown): never {
  if (err instanceof DiagnosticsClientError) {
    switch (err.kind) {
      case 'redis-unavailable':
        throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'redis_unavailable'})
      case 'app-not-owned':
        throw new TRPCError({code: 'NOT_FOUND', message: 'app_not_owned'})
      case 'timeout':
        throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'transient_error'})
    }
  }
  throw err
}
```

### Audit Trail (REUSE device_audit_log)
**Source:** `livos/.../fail2ban-admin/events.ts:73-113` (sentinel device_id pattern)
**Apply to:** `flushAndResync` (write `device_id='diagnostics-host'`, `tool_name='registry_resync'`)
```ts
const SENTINEL_DEVICE_ID = 'diagnostics-host'
await pool.query(
  `INSERT INTO device_audit_log (user_id, device_id, tool_name, params_digest, success, error)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [actorUserId || NIL_UUID, SENTINEL_DEVICE_ID, 'registry_resync', computeParamsDigest({scope}), success, error ?? null],
)
```
Plus belt-and-suspenders JSON write at `/opt/livos/data/security-events/<ts>-<uuid8>-registry-resync.json`.

### Validation
**Source:** `livos/.../fail2ban-admin/routes.ts:60-73` (Zod schemas + literal-string gates)
**Apply to:** All diagnostics route inputs. `appId: z.string().min(1)`, `scope: z.enum(['builtins', 'all']).default('builtins')`. NO accepting URLs, NO accepting userIds (those come from `ctx.currentUser.id`).

### Test Pattern (tsx + node:assert/strict, NO vitest, NO vi.mock)
**Source:** `livos/.../fail2ban-admin/{client,active-sessions,parser,integration}.test.ts`
**Apply to:** All Phase 47 tests
- Run via `tsx <file>.test.ts` directly (chained in `test:phase47` npm script).
- Use `node:assert/strict` not `expect`/`describe`/`it`.
- Pass DI fakes (factory pattern) — NEVER `vi.mock('child_process')` (pitfall W-20).
- `pg.Pool.prototype.{connect,query,end}` patch BEFORE module imports (pitfall W-15 isolation).
- Override `realX` bindings on the live module via `Object.assign` for mid-test injection.

### Settings UI Section Pattern
**Source:** `livos/.../settings/_components/usage-section.tsx`
**Apply to:** `diagnostics-section.tsx` — same Suspense wrapping, same `space-y-4` grid, same `<h2>` + icon header, same `text-body-sm text-text-secondary italic` empty-state copy.

### Settings Sidebar Entry Pattern
**Source:** `livos/.../settings/_components/settings-content.tsx:155-179` + `1408-1412`
**Apply to:** Add `diagnostics` to MENU_ITEMS as `adminOnly: true`, add lazy import + dispatch case.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every file in Phase 47 has at least one role-match analog already in-tree. |

**Sub-note:** the atomic-swap Lua script (in `capabilities.ts`) is a NEW pattern not present in-tree. The closest existing analog is `nexus/packages/core/src/capability-registry.ts:156-165` (pipeline.set), but that's NOT atomic-swap. Plan 47-02 should treat this as a NET-NEW pattern requiring careful test coverage; the **closest external analog** is Redis docs' RENAME-as-atomic-pointer-swap idiom.

---

## Phase Critical Gotchas (Roadmapper / Planner Consumption)

| ID | Topic | Source | Severity | Mitigation |
|----|-------|--------|----------|------------|
| G-01 | Branch B sacred-file ritual MUST re-pin BASELINE_SHA in same commit | Phase 45 audit comment lines 31-42; pitfall B-04 / B-11 | BLOCKER | Plan 47-03 explicit step: pre-edit SHA → edit → post-edit SHA → re-pin → audit comment QUOTING the diff (12-line systemPrompt hunk). |
| G-02 | Atomic-swap is NEW pattern — no in-tree analog | `capability-registry.ts:145-168` is closest but not atomic | BLOCKER | Plan 47-02 ships concurrency test (50 parallel `discover_capability` during flushAndResync, assert ZERO see empty). Lua script via `redis.eval` is the cleanest atomic primitive. |
| G-03 | `user_capability_overrides` table may not exist | grep returns 0 hits in `schema.sql` | WARNING | Plan 47-02 either creates the table OR feature-flags the override-preserve step. Recommend: feature-flag (table is Phase 22 territory, not Phase 47). |
| G-04 | `apps.healthProbe` PG-scoping is anti-port-scanner critical | `usage-tracking/routes.ts:44` | BLOCKER | Plan 47-04 test: probe with `appId` belonging to a different user → `lastError === 'app_not_owned'`. NEVER accept URL from client. |
| G-05 | Settings dir name is `routes/settings/diagnostics/` (NOT `_components/`) | CONTEXT.md ¶ "UI scaffolding (D-DIAGNOSTICS-CARD)" | WARNING | Plan 47-05 creates new directory; the lazy import in `settings-content.tsx` uses `'../diagnostics/diagnostics-section'`. |
| G-06 | Test isolation — Redis DB index 15 + REDIS_URL guard | pitfall W-15 | BLOCKER (if test hits prod) | Plan 47-02 test setup module checks `REDIS_URL !== 'redis://10.69.31.68/...'`, refuses if mainPC; uses `redis://localhost:6379/15` locally. |
| G-07 | httpOnlyPaths namespacing convention | `common.test.ts:56-72` | WARNING | Plan 47-05 picks Option A (`'diagnostics.*'`) OR Option B (`'capabilities.*'` + `'apps.*'`) explicitly; common.test.ts must add matching namespace footgun guards. |
| G-08 | Branch B is a SECOND re-pin in v29.4 (after Phase 45's audit-only re-pin) | Phase 45 + Phase 47 layered audit | BLOCKER | The integrity test's audit-comment block accumulates (do NOT delete prior block). Each new entry references the relevant FR. |
| G-09 | `update.sh` Branch A patch must NOT regress Phase 31 BUILD-02 | `update.sh:480-507` | WARNING | Plan 47-03 Branch A only ADDS the post-copy resolved-symlink verification AFTER line 507. Do not modify the existing loop. |
| G-10 | D-NO-SERVER4 hard-wall | memory + pitfall X-01 | BLOCKER | Plan 47-01 diagnostic targets `bruce@10.69.31.68` ONLY. Reject any reference to `45.137.194.103` or Server4 in scripts/test fixtures. |

---

## Build Order — 5 Wave Dependency-Ordered Plan

```
                       PHASE 47 BUILD WAVES — DAG
                                                                       
Wave 1 ─── Plan 47-01 — Mini PC Diagnostic (READ-ONLY)
            │                                              ~150 LOC
            │  Captures: response.model, pnpm-store dirs, dist marker grep,
            │  /proc/<pid>/environ snapshot. Computes verdict.
            │  Output: 47-01-DIAGNOSTIC.md with verdict (dist-drift /
            │           source-confabulation / both / neither).
            │
            │  ─► No source changes. Read-only SSH inspection.
            │  ─► UNBLOCKS: Wave 3 branching decision
            │
            ▼
Wave 2 ─── Plan 47-02 — FR-TOOL Backend (capabilities)
            │                                              ~400 LOC + 4 tests
            │  • diagnostics/capabilities.ts (atomic-swap impl + Lua script)
            │  • diagnostics/index.ts (barrel)
            │  • capabilities.test.ts (concurrency + override re-apply)
            │  • REUSE existing capability-registry.ts:syncAll()
            │
            │  ─► No dependency on 47-01 verdict.
            │  ─► PARALLEL with Wave 3 if developers split.
            │  ─► UNBLOCKS: Wave 5 UI cards (RegistryCard)
            │
            ▼
Wave 3 ─── Plan 47-03 — FR-MODEL Backend + BRANCHED Remediation
            │                                              ~250 LOC + 1 test
            │  • diagnostics/model-identity.ts (6-step diagnostic)
            │  • model-identity.test.ts (verdict computation against fixtures)
            │  • BRANCHED REMEDIATION (executor decides from 47-01 verdict):
            │     ├─ Branch A (dist-drift): update.sh post-copy verification
            │     │     ─► ~20 LOC patch after line 507
            │     │     ─► No sacred-file edit
            │     ├─ Branch B (source-confabulation): sacred-file surgical edit
            │     │     ─► sdk-agent-runner.ts:269-280 string → preset object
            │     │     ─► sdk-agent-runner-integrity.test.ts re-pin BASELINE_SHA
            │     │     ─► D-40-01 ritual MANDATORY (G-01)
            │     ├─ Branch C (both): A + B as TWO separate atomic commits
            │     └─ Branch N (neither): NO remediation, ship diagnostic only
            │
            │  ─► DEPENDS ON: 47-01 verdict (Wave 1)
            │  ─► PARALLEL with Wave 2 if Branch ≠ B.
            │  ─► UNBLOCKS: Wave 5 UI card (ModelIdentityCard)
            │
            ▼
Wave 4 ─── Plan 47-04 — FR-PROBE Backend (apps.healthProbe)
            │                                              ~120 LOC + 1 test
            │  • diagnostics/app-health.ts (undici 5s timeout + PG-scoping)
            │  • app-health.test.ts (mock fetch + scoping assertion)
            │  • integration.test.ts (tRPC caller + RBAC tests + scoping)
            │
            │  ─► No dependency on Waves 1-3.
            │  ─► PARALLEL with Wave 2 + Wave 3.
            │  ─► UNBLOCKS: Wave 5 UI card (AppHealthCard) + app-content.tsx
            │
            ▼
Wave 5 ─── Plan 47-05 — UI Scaffold + Wiring + UAT
                                                           ~350 LOC
            • diagnostics/diagnostics-section.tsx (shared scaffold)
            • diagnostics/registry-card.tsx
            • diagnostics/model-identity-card.tsx
            • diagnostics/app-health-card.tsx (dual-mount)
            • settings-content.tsx — sidebar entry + lazy dispatch
            • app-content.tsx — inline AppHealthCard for installed apps
            • server/trpc/index.ts — register diagnostics router
            • server/trpc/common.ts — httpOnlyPaths additions
            • server/trpc/common.test.ts — namespace footgun guards
            • nexus/packages/core/package.json — test:phase47 script
            • 47-UAT.md — Mini PC scratchpad UAT plan
            
            ─► DEPENDS ON: Waves 2 + 3 + 4 (backend routes must exist)
            ─► CLOSE PHASE 47

TOTAL ≈ 1,070 LOC + 6 test files (matches v29.4-STACK.md ~250 LOC budget for
        AI Diagnostics phase, with the test-LOC overhead expected per pitfall
        W-15/W-20 fixture-based test discipline).
```

**Parallelization opportunities:**
- Waves 2 + 4 are fully independent — can be done by different developers.
- Wave 3 Branch A is independent of Wave 2 + 4. Wave 3 Branch B has the C2 dependency baked in (Phase 45 already shipped, so the dependency is satisfied).
- Wave 5 is the only true sequencing bottleneck (depends on backend routes existing).

---

## Metadata

**Analog search scope:**
- `livos/packages/livinityd/source/modules/{livinity-broker,fail2ban-admin,usage-tracking,apps,server/trpc,database,devices}/`
- `livos/packages/ui/src/routes/settings/_components/`
- `livos/packages/ui/src/modules/app-store/app-page/`
- `nexus/packages/core/src/{capability-registry.ts,sdk-agent-runner.ts,providers/}`
- `update.sh`, `nexus/packages/core/package.json`

**Files scanned (read in full or targeted):** 17

**Pattern extraction date:** 2026-05-01

**Source provenance for all excerpts:**
- `fail2ban-admin/index.ts` (full read)
- `fail2ban-admin/routes.ts` (full read)
- `fail2ban-admin/active-sessions.ts` (full read)
- `fail2ban-admin/client.ts` (full read)
- `fail2ban-admin/events.ts` (full read)
- `fail2ban-admin/integration.test.ts` (full read)
- `fail2ban-admin/client.test.ts` (lines 1-80)
- `fail2ban-admin/active-sessions.test.ts` (lines 1-60)
- `fail2ban-admin/parser.ts` (lines 1-60)
- `usage-tracking/routes.ts` (full read)
- `server/trpc/index.ts` (full read)
- `server/trpc/common.ts` (full read)
- `server/trpc/common.test.ts` (full read)
- `server/trpc/trpc.ts` (full read)
- `server/trpc/is-authenticated.ts` (full read)
- `nexus/packages/core/src/capability-registry.ts` (full read)
- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` (full read)
- `nexus/packages/core/src/sdk-agent-runner.ts` (lines 240-350 — sacred-file edit zone)
- `livinity-broker/router.ts` (lines 1-150 — fetch/AbortController patterns)
- `livinity-broker/openai-router.ts` (lines 155-235)
- `livinity-broker/index.ts` (full read)
- `apps/routes.ts` (lines 1-120)
- `database/index.ts` (lines 355-460 — getUserAppInstance + listUserAppInstances)
- `database/schema.sql` (lines 50-75 — user_app_instances columns)
- `devices/audit-pg.ts` (lines 35-75 — computeParamsDigest)
- `update.sh` (lines 287-510)
- `ui/src/routes/settings/_components/security-toggle-row.tsx` (full read)
- `ui/src/routes/settings/_components/usage-banner.tsx` (full read)
- `ui/src/routes/settings/_components/usage-section.tsx` (full read)
- `ui/src/routes/settings/_components/settings-content.tsx` (lines 130-330, 1370-1495 + grep for SecurityToggleRow/UsageSection)
- `ui/src/modules/app-store/app-page/app-content.tsx` (full read)
- `nexus/packages/core/package.json` (full read)
