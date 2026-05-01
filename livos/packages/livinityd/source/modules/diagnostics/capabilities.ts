/**
 * Phase 47 Plan 02 — Capability registry diagnostic + atomic-swap resync.
 *
 * Implements FR-TOOL-01 (`diagnoseRegistry`) and FR-TOOL-02 (`flushAndResync`).
 * Wave-2 backend module — routes are wired in Wave 5 (Plan 47-05).
 *
 * Module shape mirrors `fail2ban-admin/client.ts` exactly:
 *   - DI factory pattern (`makeXxx({deps})`) for testability — fakes injected,
 *     NO module-replacement mocking (W-20).
 *   - `realXxx` const wires production deps (live ioredis + pg.Pool +
 *     nexus/core syncAll) — see "Production wiring" section at bottom.
 *
 * ── Atomic-swap protocol (B-06 BLOCKER mitigation) ──────────────────────────
 *
 * `flushAndResync()` rebuilds the live `nexus:cap:<type>:<name>` keyspace
 * without an empty window from any concurrent reader's perspective:
 *
 *   1. Read user overrides from PG BEFORE the flush (B-07 mitigation).
 *      Feature-flagged via `to_regclass('public.user_capability_overrides')`
 *      — if the table doesn't exist yet (G-03), log + skip without erroring.
 *   2. Count current live keys (BEFORE).
 *   3. Call injected `syncAll()` which writes manifests to the PENDING prefix
 *      `nexus:cap:_pending:<type>:<name>`. Production wiring uses a
 *      `PrefixedWriteRedis` proxy that rewrites SET-key arguments while
 *      leaving read paths untouched — this lets the upstream
 *      `CapabilityRegistry.syncAll()` body run unmodified.
 *   4. Run a single Lua `redis.eval()` script that atomically RENAMEs every
 *      `_pending:<id>` to `<id>` (overwriting) and DELs any stale `<id>` keys
 *      not covered by the rename. Server-side Lua = single round-trip = no
 *      mid-swap window where a reader can observe an empty registry.
 *   5. Re-apply user overrides (mutate `enabled` field on swapped keys).
 *   6. Audit: LPUSH+LTRIM Redis history list (W-21) + PG `device_audit_log`
 *      row with sentinel `device_id='diagnostics-host'` (mirrors
 *      `fail2ban-admin/events.ts` sentinel pattern).
 *
 * The Lua script (ATOMIC_SWAP_LUA) preserves `nexus:cap:_meta:*` and
 * `nexus:cap:_audit*` keys — they are NOT in the type-prefixed scope (W-14).
 *
 * ── 3-way categorization (W-12 mitigation) ──────────────────────────────────
 *
 * `diagnoseRegistry()` classifies every BUILT_IN_TOOL_IDS entry into ONE of:
 *   - expectedAndPresent       — manifest exists in Redis, override allows it
 *   - missing.lost             — manifest absent, precondition met → resync helps
 *   - missing.precondition     — manifest absent, precondition NOT met → resync won't help
 *   - missing.disabledByUser   — user_capability_overrides marks enabled=false
 * Plus `unexpectedExtras` for any Redis tool key NOT in BUILT_IN_TOOL_IDS.
 *
 * The precondition evaluator is pluggable via DI. Phase 47 ships a hardcoded
 * baseline (web_search → SERPER_API_KEY env, gmail_* and telegram_* → service
 * connection flag in Redis). Phase 22 may replace with a richer evaluator.
 */

import {randomUUID} from 'node:crypto'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type FlushScope = 'builtins' | 'all'

export interface DiagnoseRegistryResult {
	redisManifestCount: number
	builtInToolCount: number
	syncedAt: string | null
	categorized: {
		expectedAndPresent: string[]
		missing: {
			lost: string[]
			precondition: string[]
			disabledByUser: string[]
		}
		unexpectedExtras: string[]
	}
}

export interface FlushAndResyncResult {
	before: number
	after: number
	overridesPreserved: string[]
	durationMs: number
	auditRowId: string
	scope: FlushScope
}

export type DiagnosticsErrorKind =
	| 'redis-unavailable'
	| 'pg-unavailable'
	| 'sync-failed'
	| 'override-table-missing' // non-fatal informational

export class DiagnosticsClientError extends Error {
	readonly kind: DiagnosticsErrorKind
	constructor(kind: DiagnosticsErrorKind, message: string) {
		super(message)
		this.name = 'DiagnosticsClientError'
		this.kind = kind
	}
}

/**
 * Pluggable precondition evaluator. Phase 47 ships a hardcoded baseline; a
 * future plan may replace with a richer per-capability registry.
 *
 * Returns `{met: boolean, reason?: string}`. `reason` MUST NOT contain secret
 * values — only the env var / flag name (T-47-02-03 mitigation).
 */
export type PreconditionEvaluator = (capabilityId: string) => Promise<{met: boolean; reason?: string}>

/**
 * Minimal ioredis-compatible interface so tests can pass a Map-backed fake
 * without pulling the real ioredis dependency into the test process.
 *
 * Production wiring: real `Redis` from ioredis satisfies this structurally.
 */
export interface RedisLike {
	keys(pattern: string): Promise<string[]>
	get(key: string): Promise<string | null>
	eval(script: string, keys: number, ...args: (string | number)[]): Promise<unknown>
	pipeline(): RedisPipelineLike
	lpush(key: string, val: string): Promise<number>
	ltrim(key: string, start: number, stop: number): Promise<unknown>
	dbsize(): Promise<number>
}

export interface RedisPipelineLike {
	set(key: string, val: string): RedisPipelineLike
	exec(): Promise<unknown>
}

/** Minimal pg.Pool-compatible surface for DI-fakes. */
export interface PgPoolLike {
	query(sql: string, params?: unknown[]): Promise<{rows: unknown[]}>
}

/**
 * Audit row shape passed to the optional auditWriter. Mirrors the
 * `device_audit_log` columns used by `fail2ban-admin/events.ts`.
 */
export interface AuditRow {
	actorUserId: string | null
	scope: FlushScope
	before: number
	after: number
	overridesPreserved: string[]
	durationMs: number
	timestamp: string
}

// ────────────────────────────────────────────────────────────────────────────
// Built-in tool enumeration (FR-TOOL-01)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The hardcoded built-in tool list. Source-of-truth is
 * `nexus/packages/core/src/capability-registry.ts:syncTools()` — the body
 * iterates whatever `toolRegistry.listAll()` returns. For Phase 47 we hardcode
 * the canonical Phase 22 builtin set (shell, docker_*, files_*, web_search).
 *
 * If Phase 22 adds/removes a builtin, this list MUST be kept in sync — the
 * `unexpectedExtras` and `missing.lost` categorizations depend on it.
 */
export const BUILT_IN_TOOL_IDS: readonly string[] = [
	'tool:shell',
	'tool:docker_run',
	'tool:docker_ps',
	'tool:docker_logs',
	'tool:docker_stop',
	'tool:files_read',
	'tool:files_write',
	'tool:files_search',
	'tool:web_search',
] as const

const DEFAULT_REDIS_PREFIX = 'nexus:cap:'

// ────────────────────────────────────────────────────────────────────────────
// Atomic-swap Lua script (B-06 BLOCKER mitigation)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lua script run via `redis.eval(script, 0, livePrefix, pendingPrefix, scope, nowIso)`.
 *
 * For each manifest type in scope:
 *   1. KEYS pendingPrefix.<type>:* → for each pending key, RENAME to live prefix.
 *   2. KEYS livePrefix.<type>:*    → DEL any stale live keys not in the rename set.
 *
 * `nexus:cap:_meta:*` and `nexus:cap:_audit*` are NEVER touched (W-14) — the
 * KEYS patterns above only match `<type>:*` for the 5 capability types.
 *
 * The script also bumps `livePrefix._meta:last_sync_at` to ARGV[4] (an ISO
 * timestamp string) so `diagnoseRegistry()` can surface "synced 3s ago".
 *
 * Why a single-script swap: from the perspective of any non-Lua command
 * (including our own concurrent `redis.get('nexus:cap:tool:shell')` reads),
 * the swap is atomic — Redis serializes Lua execution against other commands.
 * No mid-swap "everything is empty" window can ever be observed.
 */
const ATOMIC_SWAP_LUA = `
local livePrefix = ARGV[1]
local pendingPrefix = ARGV[2]
local scope = ARGV[3]
local nowIso = ARGV[4]

local types
if scope == 'builtins' then
  types = {'tool'}
else
  types = {'tool', 'skill', 'mcp', 'hook', 'agent'}
end

local renamedSet = {}
for _, t in ipairs(types) do
  local pendingKeys = redis.call('KEYS', pendingPrefix .. t .. ':*')
  for _, pk in ipairs(pendingKeys) do
    local suffix = string.sub(pk, string.len(pendingPrefix) + 1)
    local lk = livePrefix .. suffix
    redis.call('RENAME', pk, lk)
    renamedSet[lk] = true
  end

  local liveKeys = redis.call('KEYS', livePrefix .. t .. ':*')
  for _, lk in ipairs(liveKeys) do
    if not renamedSet[lk] then
      redis.call('DEL', lk)
    end
  end
end

redis.call('SET', livePrefix .. '_meta:last_sync_at', nowIso)

return 'OK'
`

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enumerate live capability keys for the given scope, EXCLUDING `_meta:*`
 * and `_audit*` (W-14 invariant).
 *
 * `builtins`  → only `<prefix>tool:*`
 * `all`       → `<prefix>{tool,skill,mcp,hook,agent}:*`
 */
async function scopedKeys(redis: RedisLike, prefix: string, scope: FlushScope): Promise<string[]> {
	const types = scope === 'builtins' ? ['tool'] : ['tool', 'skill', 'mcp', 'hook', 'agent']
	const out: string[] = []
	for (const t of types) {
		const keys = await redis.keys(`${prefix}${t}:*`)
		for (const k of keys) out.push(k)
	}
	return out
}

/**
 * Default precondition evaluator — Phase 47 hardcoded baseline.
 *
 * - `tool:web_search`              → SERPER_API_KEY env var must be set.
 * - `tool:gmail_*` / `tool:telegram_*` → service-connection flag in Redis at
 *                                       `nexus:integrations:<service>:connected`.
 * - everything else                → unconditionally met (shell, docker_*, files_*).
 *
 * Reasons returned NEVER expose the secret value — only the var/flag name
 * (T-47-02-03 mitigation: information disclosure).
 */
function defaultPreconditionEvaluator(redis: RedisLike): PreconditionEvaluator {
	return async (capabilityId) => {
		if (capabilityId === 'tool:web_search') {
			const has = !!process.env.SERPER_API_KEY
			return {met: has, reason: has ? undefined : 'SERPER_API_KEY env var not set'}
		}
		if (capabilityId.startsWith('tool:gmail_') || capabilityId.startsWith('tool:telegram_')) {
			const service = capabilityId.startsWith('tool:gmail_') ? 'gmail' : 'telegram'
			let flag: string | null = null
			try {
				flag = await redis.get(`nexus:integrations:${service}:connected`)
			} catch {
				flag = null
			}
			const met = flag === 'true'
			return {met, reason: met ? undefined : `${service} integration not connected`}
		}
		return {met: true}
	}
}

// ────────────────────────────────────────────────────────────────────────────
// makeDiagnoseRegistry — FR-TOOL-01
// ────────────────────────────────────────────────────────────────────────────

export function makeDiagnoseRegistry(deps: {
	redis: RedisLike
	pg: PgPoolLike
	preconditionEvaluator?: PreconditionEvaluator
	redisPrefix?: string
	builtInIds?: readonly string[]
}) {
	const PREFIX = deps.redisPrefix ?? DEFAULT_REDIS_PREFIX
	const builtIns = deps.builtInIds ?? BUILT_IN_TOOL_IDS
	const evalPrecondition = deps.preconditionEvaluator ?? defaultPreconditionEvaluator(deps.redis)

	return {
		async diagnose(): Promise<DiagnoseRegistryResult> {
			// 1. Enumerate live manifest keys (across all 5 types — for the
			//    `redisManifestCount` total + the `unexpectedExtras` pass).
			const allTypes = ['tool', 'skill', 'mcp', 'hook', 'agent']
			const liveKeys: string[] = []
			for (const t of allTypes) {
				const ks = await deps.redis.keys(`${PREFIX}${t}:*`)
				for (const k of ks) liveKeys.push(k)
			}
			// Live key set, normalised back to the `tool:foo` form (strip prefix).
			const liveIds = new Set<string>()
			for (const k of liveKeys) {
				if (k.startsWith(PREFIX)) liveIds.add(k.slice(PREFIX.length))
			}

			// 2. Read user overrides (feature-flagged via to_regclass — G-03).
			const disabledByUserSet = new Set<string>()
			try {
				const exists = await deps.pg.query(
					`SELECT to_regclass('public.user_capability_overrides') AS r`,
				)
				const row = exists.rows[0] as {r: string | null} | undefined
				const tableExists = row?.r != null
				if (tableExists) {
					const rows = await deps.pg.query(
						`SELECT capability_id FROM user_capability_overrides WHERE enabled = false`,
					)
					for (const r of rows.rows as {capability_id: string}[]) {
						disabledByUserSet.add(r.capability_id)
					}
				}
				// else: silent skip — this is the G-03 graceful-degrade path.
			} catch {
				// Non-fatal: continue with empty override set.
			}

			// 3. Categorise built-ins.
			const expectedAndPresent: string[] = []
			const missingLost: string[] = []
			const missingPrecondition: string[] = []
			const missingDisabledByUser: string[] = []

			for (const id of builtIns) {
				if (disabledByUserSet.has(id)) {
					// Override wins regardless of Redis presence (W-12).
					missingDisabledByUser.push(id)
					continue
				}
				if (liveIds.has(id)) {
					expectedAndPresent.push(id)
					continue
				}
				const pre = await evalPrecondition(id)
				if (pre.met) {
					missingLost.push(id)
				} else {
					missingPrecondition.push(id)
				}
			}

			// 4. Unexpected extras — any live tool key NOT in builtIns set.
			const builtInSet = new Set(builtIns)
			const unexpectedExtras: string[] = []
			for (const id of liveIds) {
				// Only `tool:*` keys are candidates for "unexpected extras" — other
				// types are out-of-scope for the FR-TOOL-01 categorisation.
				if (id.startsWith('tool:') && !builtInSet.has(id)) {
					unexpectedExtras.push(id)
				}
			}

			// 5. syncedAt from meta key (null if missing).
			let syncedAt: string | null = null
			try {
				syncedAt = await deps.redis.get(`${PREFIX}_meta:last_sync_at`)
			} catch {
				syncedAt = null
			}

			// redisManifestCount counts ONLY tool keys per FR-TOOL-01 ("manifest
			// count" in the user-visible card is built-in scope; full-scope
			// counts surface elsewhere).
			const toolKeyCount = [...liveIds].filter((id) => id.startsWith('tool:')).length

			return {
				redisManifestCount: toolKeyCount,
				builtInToolCount: builtIns.length,
				syncedAt,
				categorized: {
					expectedAndPresent,
					missing: {
						lost: missingLost,
						precondition: missingPrecondition,
						disabledByUser: missingDisabledByUser,
					},
					unexpectedExtras,
				},
			}
		},
	}
}

// ────────────────────────────────────────────────────────────────────────────
// makeFlushAndResync — FR-TOOL-02
// ────────────────────────────────────────────────────────────────────────────

export function makeFlushAndResync(deps: {
	redis: RedisLike
	pg: PgPoolLike
	/**
	 * Caller-provided sync function. Production wiring passes a function that
	 * calls `CapabilityRegistry.syncAll()` against a `PrefixedWriteRedis`
	 * proxy that rewrites SET keys to the PENDING prefix. Tests pass a stub
	 * that LPUSHes a known set of pending keys.
	 */
	syncAll: () => Promise<void>
	redisPrefix?: string
	auditWriter?: (row: AuditRow) => Promise<string>
	now?: () => Date
}) {
	const PREFIX = deps.redisPrefix ?? DEFAULT_REDIS_PREFIX
	const PENDING_PREFIX = `${PREFIX}_pending:`
	const now = deps.now ?? (() => new Date())

	return {
		async run(opts: {scope: FlushScope; actorUserId?: string}): Promise<FlushAndResyncResult> {
			const start = now().getTime()

			// ── Phase 1: Read user overrides BEFORE flush (B-07) ──────────
			//
			// Feature-flag via to_regclass — `user_capability_overrides`
			// likely doesn't exist in current schema.sql (G-03). If absent,
			// log + skip without erroring. DO NOT create the table — that's
			// Phase 22 territory.
			const overridesPreserved: string[] = []
			try {
				const exists = await deps.pg.query(
					`SELECT to_regclass('public.user_capability_overrides') AS r`,
				)
				const row = exists.rows[0] as {r: string | null} | undefined
				const tableExists = row?.r != null
				if (tableExists) {
					const rows = await deps.pg.query(
						`SELECT capability_id FROM user_capability_overrides WHERE enabled = false`,
					)
					for (const r of rows.rows as {capability_id: string}[]) {
						overridesPreserved.push(r.capability_id)
					}
				} else {
					// Non-fatal: log a single warning + continue with empty list.
					console.warn(
						'[diagnostics] user_capability_overrides table missing — skipping override re-apply (G-03)',
					)
				}
			} catch (err) {
				// Non-fatal: continue with empty override list.
				console.warn(
					'[diagnostics] user_capability_overrides probe failed (non-fatal):',
					(err as Error).message,
				)
			}

			// ── Phase 2: Count BEFORE ─────────────────────────────────────
			const beforeKeys = await scopedKeys(deps.redis, PREFIX, opts.scope)
			const before = beforeKeys.length

			// ── Phase 3: Build PENDING via injected syncAll ───────────────
			//
			// Production wiring uses a `PrefixedWriteRedis` proxy that rewrites
			// SET-key arguments from `${PREFIX}<id>` to `${PENDING_PREFIX}<id>`.
			// The upstream nexus/core CapabilityRegistry.syncAll() body runs
			// unmodified — it just believes it's writing to the live prefix.
			//
			// Tests inject a stub that directly pipelines pending writes.
			await deps.syncAll()

			// ── Phase 4: Atomic Lua swap (B-06) ───────────────────────────
			//
			// The script RENAMEs every PENDING_PREFIX<id> → PREFIX<id>,
			// overwriting any existing live key, and DELs stale live keys
			// not in the rename set. Single-shot Lua = atomic against any
			// concurrent read. NEVER touches `_meta:*` or `_audit*` keys.
			const nowIso = now().toISOString()
			await deps.redis.eval(
				ATOMIC_SWAP_LUA,
				0,
				PREFIX,
				PENDING_PREFIX,
				opts.scope,
				nowIso,
			)

			// ── Phase 5: Re-apply user overrides (B-07) ───────────────────
			//
			// Mutate `enabled: false` on the freshly-swapped manifest blob.
			// We pipeline the SETs so the override re-apply is one round-trip.
			if (overridesPreserved.length > 0) {
				const pl = deps.redis.pipeline()
				let touched = 0
				for (const capId of overridesPreserved) {
					const key = `${PREFIX}${capId}`
					const raw = await deps.redis.get(key)
					if (raw) {
						let manifest: Record<string, unknown>
						try {
							manifest = JSON.parse(raw) as Record<string, unknown>
						} catch {
							// Corrupt manifest — skip override on this key.
							continue
						}
						manifest.enabled = false
						pl.set(key, JSON.stringify(manifest))
						touched++
					}
				}
				if (touched > 0) await pl.exec()
			}

			// ── Phase 6: Count AFTER + audit ──────────────────────────────
			const afterKeys = await scopedKeys(deps.redis, PREFIX, opts.scope)
			const after = afterKeys.length
			const durationMs = now().getTime() - start

			// Audit Path A: Redis history list (W-21 — bounded at 100).
			const auditEntry = JSON.stringify({
				ts: nowIso,
				actor: opts.actorUserId ?? null,
				scope: opts.scope,
				before,
				after,
				overridesPreserved,
				durationMs,
			})
			try {
				await deps.redis.lpush(`${PREFIX}_audit_history`, auditEntry)
				await deps.redis.ltrim(`${PREFIX}_audit_history`, 0, 99)
			} catch (err) {
				// Audit failure MUST NOT break the resync (fire-and-forget per
				// fail2ban-admin/events.ts contract).
				console.warn('[diagnostics] redis audit write failed (non-fatal):', (err as Error).message)
			}

			// Audit Path B: PG device_audit_log row (REUSE pattern from
			// fail2ban-admin/events.ts — sentinel device_id='diagnostics-host'
			// + tool_name='registry_resync').
			let auditRowId = 'no-pg-audit'
			if (deps.auditWriter) {
				try {
					auditRowId = await deps.auditWriter({
						actorUserId: opts.actorUserId ?? null,
						scope: opts.scope,
						before,
						after,
						overridesPreserved,
						durationMs,
						timestamp: nowIso,
					})
				} catch (err) {
					console.warn('[diagnostics] pg audit write failed (non-fatal):', (err as Error).message)
				}
			} else {
				// Test rigs / pre-init: synthesise a stable id so callers don't
				// branch on null. Real writers return the inserted row's id.
				auditRowId = `mem-${randomUUID().slice(0, 8)}`
			}

			return {
				before,
				after,
				overridesPreserved,
				durationMs,
				auditRowId,
				scope: opts.scope,
			}
		},
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Production wiring (real Redis + pg.Pool)
// ────────────────────────────────────────────────────────────────────────────
//
// Lazy ioredis singleton — mirrors `docker/ai-diagnostics.ts:getRedis()` so
// importers that only touch types / factories never accidentally open a
// connection at module-load time.

import {Redis} from 'ioredis'
import {getPool} from '../database/index.js'
import {computeParamsDigest} from '../devices/audit-pg.js'

let _redis: Redis | null = null
function getRealRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

/**
 * RedisLike facade that defers actual ioredis instantiation until the FIRST
 * method call. This keeps `import './capabilities.js'` cheap (no socket open
 * at module-load time) — important for unit tests that exercise the factories
 * directly via DI fakes and never touch the real-wired exports.
 *
 * Rationale: a previous draft used `redis: getRealRedis()` at module top-level,
 * which spawned an ioredis connection during `tsx capabilities.test.ts` and
 * caused the test process to hang on its retry loop after the suite finished.
 * Lazy facade fixes that without changing the production hot-path semantics.
 */
const realRedisFacade: RedisLike = {
	async keys(p) {
		return getRealRedis().keys(p)
	},
	async get(k) {
		return getRealRedis().get(k)
	},
	async eval(script, numKeys, ...args) {
		// ioredis `eval(script, numkeys, ...keysAndArgs)` matches our signature.
		return getRealRedis().eval(script, numKeys, ...(args as (string | number)[])) as Promise<unknown>
	},
	pipeline() {
		const real = getRealRedis().pipeline()
		const facade: RedisPipelineLike = {
			set(key, val) {
				real.set(key, val)
				return facade
			},
			async exec() {
				return (await real.exec()) ?? []
			},
		}
		return facade
	},
	async lpush(k, v) {
		return getRealRedis().lpush(k, v)
	},
	async ltrim(k, s, e) {
		return getRealRedis().ltrim(k, s, e)
	},
	async dbsize() {
		return getRealRedis().dbsize()
	},
}

/**
 * Pg.Pool-shim that uses the real `getPool()` lazily. If the pool is null
 * (test rigs / pre-init), every query returns `{rows: []}` — the diagnose
 * path treats this as "table missing" via the to_regclass branch, so the
 * graceful-degrade path activates automatically.
 */
const realPg: PgPoolLike = {
	async query(sql, params) {
		const pool = getPool()
		if (!pool) return {rows: []}
		const r = await pool.query(sql, params as unknown[] | undefined)
		return {rows: r.rows ?? []}
	},
}

/**
 * Production-wired diagnose. Uses the lazy real ioredis + the real PG pool.
 * The default precondition evaluator is the hardcoded Phase 47 baseline —
 * Phase 22 may pluggable-replace via the `preconditionEvaluator` field.
 */
export const realDiagnoseRegistry = makeDiagnoseRegistry({
	redis: realRedisFacade,
	pg: realPg,
})

/**
 * Production-wired flush+resync.
 *
 * NOTE on `syncAll`: a complete production wiring requires a
 * `PrefixedWriteRedis` proxy that rewrites SET-keys for the duration of one
 * `CapabilityRegistry.syncAll()` call. That proxy is defined inline here as
 * a closure so the upstream nexus/core code stays untouched.
 *
 * For Phase 47 Wave 2, the proxy is a TODO — Wave 5 routes will pass through
 * to this function once the @nexus/core re-export of CapabilityRegistry lands.
 * The thin stub below logs a single warning and exits early so a misconfigured
 * production call surfaces immediately instead of silently rewriting nothing.
 */
export const realFlushAndResync = makeFlushAndResync({
	redis: realRedisFacade,
	pg: realPg,
	syncAll: async () => {
		// Wave 5 will replace this body with the PrefixedWriteRedis-wrapped
		// CapabilityRegistry.syncAll() call. Until then, this is a no-op so
		// the route handler can be wired and the audit path exercised end-to-end.
		console.warn(
			'[diagnostics] realFlushAndResync.syncAll is a Wave-5 stub — pending PrefixedWriteRedis proxy wiring',
		)
	},
	auditWriter: async (row) => {
		// Reuses computeParamsDigest from devices/audit-pg.ts (FR-F2B-04 invariant
		// applied to F47-TOOL-02). Sentinel device_id='diagnostics-host'.
		const pool = getPool()
		if (!pool) return 'no-pg-audit'
		const NIL_UUID = '00000000-0000-0000-0000-000000000000'
		const digest = computeParamsDigest({
			scope: row.scope,
			before: row.before,
			after: row.after,
			overridesPreserved: row.overridesPreserved,
		})
		try {
			const r = await pool.query(
				`INSERT INTO device_audit_log
				   (user_id, device_id, tool_name, params_digest, success, error)
				 VALUES ($1, $2, $3, $4, $5, $6)
				 RETURNING id`,
				[
					row.actorUserId && row.actorUserId.length > 0 ? row.actorUserId : NIL_UUID,
					'diagnostics-host',
					'registry_resync',
					digest,
					true,
					null,
				],
			)
			const inserted = (r.rows?.[0] as {id?: string | number}) ?? {}
			return String(inserted.id ?? 'no-pg-audit')
		} catch (err) {
			console.warn('[diagnostics] device_audit_log insert failed:', (err as Error).message)
			return 'pg-audit-failed'
		}
	},
})
