/**
 * Phase 47 Plan 04 — App Health Probe (FR-PROBE-01 / FR-PROBE-02).
 *
 * Single-snapshot reachability probe hard-scoped to the calling user's own
 * app instances. Mirrors v29.3 Phase 44 `usage.getMine` privateProcedure
 * pattern: `userId` ALWAYS comes from `ctx.currentUser.id`, never from
 * client input. The probe fires only AFTER the PG-scoped lookup confirms
 * ownership.
 *
 * G-04 BLOCKER mitigation (anti-port-scanner): PG-scoping at TWO layers:
 *   (a) `getUserAppInstance(userId, appId)` query enforces
 *       `WHERE user_id = $1 AND app_id = $2` — no row → no probe.
 *   (b) Defense-in-depth `instance.user_id !== userId` check post-lookup —
 *       even if the DB function returned an unexpected row, the network
 *       call is suppressed.
 *
 * Timeout: 5s default via AbortController + setTimeout. `clearTimeout(t)`
 * runs in `finally` to prevent leaks.
 *
 * URL construction: probe target is `http://localhost:<port>/` derived from
 * the PG row's `port` column. NEVER from client input. Per 47-CONTEXT.md
 * decisions, the probe goes direct to the container, bypassing Caddy/DNS.
 *
 * Result shape per FR-PROBE-01:
 *   {reachable, statusCode, ms, lastError, probedAt}
 *
 * `reachable` is true ONLY when `r.ok` (2xx). 3xx/4xx/5xx → reachable=false
 * but statusCode populated so the UI can distinguish via badge color.
 *
 * DI factory pattern (W-20): `makeProbeAppHealth({deps})` accepts a fake
 * `fetch` + fake `getUserAppInstance` for tests. NO `vi.mock('undici')`.
 *
 * Sacred file (D-40-01) untouched.
 */

import {getUserAppInstance as realGetUserAppInstance} from '../database/index.js'

// ── Public types ────────────────────────────────────────────────────────────

export interface ProbeResult {
	reachable: boolean
	statusCode: number | null
	ms: number | null
	lastError: string | null
	probedAt: string // ISO timestamp
}

/**
 * Local snake_case shape for the probe's PG row contract. Mirrors the
 * `user_app_instances` schema column names so the SQL query and the
 * defense-in-depth check use the same identifiers. Production wiring
 * adapts the existing camelCase `UserAppInstance` from `database/index.ts`
 * via `adaptCamelToSnake()` below.
 */
export interface UserAppInstance {
	id: string
	user_id: string
	app_id: string
	port: number
	subdomain?: string
}

export type FetchFn = typeof fetch

export type GetUserAppInstanceFn = (
	userId: string,
	appId: string,
) => Promise<UserAppInstance | null>

export interface ProbeAppHealthDeps {
	fetch: FetchFn
	getUserAppInstance: GetUserAppInstanceFn
	timeoutMs?: number // default 5000
	logger?: {info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void}
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function makeProbeAppHealth(deps: ProbeAppHealthDeps) {
	const timeoutMs = deps.timeoutMs ?? 5_000
	const logger = deps.logger ?? {info: () => {}, warn: () => {}}

	return {
		async probe({userId, appId}: {userId: string; appId: string}): Promise<ProbeResult> {
			const probedAt = new Date().toISOString()

			// G-04 BLOCKER mitigation: PG-scoping FIRST. Refuse to probe if app
			// not owned. The query is `WHERE user_id = $1 AND app_id = $2` — see
			// production wiring's adapter below.
			let instance: UserAppInstance | null
			try {
				instance = await deps.getUserAppInstance(userId, appId)
			} catch (err: any) {
				logger.warn('[app-health] PG lookup failed for', appId, err?.message)
				return {
					reachable: false,
					statusCode: null,
					ms: null,
					lastError: 'pg_lookup_failed',
					probedAt,
				}
			}

			if (!instance) {
				// Defense-in-depth: NEVER attempt the network call without a
				// confirmed instance row. (Layer A — PG row absent.)
				return {
					reachable: false,
					statusCode: null,
					ms: null,
					lastError: 'app_not_owned',
					probedAt,
				}
			}

			// Defense-in-depth: confirm row's user_id == userId (paranoia —
			// `getUserAppInstance` should already filter, but re-check). This is
			// Layer B of the G-04 anti-port-scanner protection. (T-47-04-01.)
			if (instance.user_id !== userId) {
				logger.warn('[app-health] PG row user_id mismatch — refusing probe')
				return {
					reachable: false,
					statusCode: null,
					ms: null,
					lastError: 'app_not_owned',
					probedAt,
				}
			}

			// Construct probe URL from instance — NEVER from client input.
			// Direct-to-container loopback bypasses Caddy + DNS (47-CONTEXT.md).
			const url = `http://localhost:${instance.port}/`

			const ctl = new AbortController()
			const t = setTimeout(() => ctl.abort(), timeoutMs)
			const start = Date.now()
			try {
				const r = await deps.fetch(url, {
					method: 'GET',
					signal: ctl.signal,
					redirect: 'manual', // don't follow — just want reachability of the entry point
				})
				const ms = Date.now() - start
				return {
					reachable: r.ok,
					statusCode: r.status,
					ms,
					lastError: null,
					probedAt,
				}
			} catch (err: any) {
				const ms = Date.now() - start
				const isAbort =
					err?.name === 'AbortError' || /aborted/i.test(err?.message ?? '')
				return {
					reachable: false,
					statusCode: null,
					ms,
					// T-47-04-05: error normalization — message only, no stack/path.
					lastError: isAbort ? 'timeout' : err?.message || 'fetch_failed',
					probedAt,
				}
			} finally {
				clearTimeout(t)
			}
		},
	}
}

// ── Production wiring ───────────────────────────────────────────────────────

/**
 * Adapter: the production `getUserAppInstance` from `../database/index.js`
 * returns a camelCase `UserAppInstance` (`{userId, appId, ...}`). This
 * factory's contract uses snake_case (matching the SQL schema column names
 * and the defense-in-depth `instance.user_id` check). The adapter
 * normalizes the shape so the same `WHERE user_id = $1 AND app_id = $2`
 * query is the only path the probe can take to learn an app's port.
 */
const productionGetUserAppInstance: GetUserAppInstanceFn = async (
	userId,
	appId,
) => {
	const row = await realGetUserAppInstance(userId, appId)
	if (!row) return null
	return {
		id: row.id,
		user_id: row.userId,
		app_id: row.appId,
		port: row.port,
		subdomain: row.subdomain,
	}
}

export const realProbeAppHealth = makeProbeAppHealth({
	fetch: globalThis.fetch,
	getUserAppInstance: productionGetUserAppInstance,
})
