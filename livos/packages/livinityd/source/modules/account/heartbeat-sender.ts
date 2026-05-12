// livos/packages/livinityd/source/modules/account/heartbeat-sender.ts
//
// Phase 104 plan 104-10 — LivOS → livinity.io heartbeat client.
//
// FIRST CLIENT-SIDE PIECE of v34 (LivOS ↔ livinity.io account integration).
// Every `intervalSec` seconds, POST a small JSON envelope to
// `https://livinity.io/api/devices/heartbeat` with `X-Api-Key: liv_k_...`.
// Server5's `devices.last_seen` column updates so the "is your box online"
// dashboard widget (separate Server5 repo) lights up.
//
// ──────────────────────────────────────────────────────────────────────
// D-104-RELAY-ZERO-DATA-PLANE compliance
// ──────────────────────────────────────────────────────────────────────
// Heartbeat is CONTROL-PLANE traffic, which IS allowed per the Phase 104
// invariant. Envelope size: ~200 bytes per POST. At the default 60s
// interval that's ~12KB/day — three orders of magnitude smaller than the
// user-facing data-plane traffic the invariant actually targets. The HARD
// rule that data-plane (Master Chrome streams, agent payloads, file
// uploads, etc.) MUST go LAN-direct stays untouched.
// ──────────────────────────────────────────────────────────────────────
//
// Forward-compat with Server5 missing endpoint
// ──────────────────────────────────────────────────────────────────────
// Plan 104-10 ships the CLIENT only. Server5's `/api/devices/heartbeat`
// route is built in a separate v34.x phase. Until then, every POST returns
// 404. This sender treats 404 as "endpoint not yet built" — logs a single
// warn line per livinityd restart (not per interval) and keeps looping.
// When Server5 ships the endpoint, the next POST lands and dashboard
// updates start working without any LivOS-side change.
//
// HTTP status handling matrix:
//   2xx  → log verbose, continue
//   401  → revoked key → log error ONCE, STOP heartbeat (don't spam)
//   404  → endpoint not yet built → log warn ONCE, continue retrying
//   429  → rate-limited → log warn, continue (server controls cadence)
//   5xx  → server down → log warn, continue
//   network err / timeout → log warn, continue
//
// SECURITY
//   - API key flows via `X-Api-Key` HTTP header only — never logged
//     in plaintext. Log lines use `redactedPreview()` (api-key.ts).
//   - 10s request timeout via AbortController so a hung Server5 can't
//     cascade into livinityd resource leaks.

import {readApiKey, redactedPreview, type ApiKeyRedis} from './api-key.js'
import {getOrCreateDeviceId} from './device-id.js'
import {buildHeartbeatPayload, type HeartbeatPayload} from './heartbeat-payload.js'

const REDIS_LOCAL_MODE = 'livos:domain:local_mode'

const DEFAULT_INTERVAL_SEC = 60
const REQUEST_TIMEOUT_MS = 10_000

export interface HeartbeatLogger {
	info(msg: string): void
	warn(msg: string, error?: unknown): void
	error(msg: string, error?: unknown): void
	verbose(msg: string): void
}

export interface StartHeartbeatOptions {
	/** Full URL of the heartbeat endpoint. */
	url: string
	/** Polling interval in seconds. Defaults to 60s. */
	intervalSec?: number
	/** ioredis-compatible client. Same Redis livinityd uses elsewhere. */
	redis: ApiKeyRedis & {get(k: string): Promise<string | null>}
	/** livinityd version string (typically packageJson.version). */
	version: string
	/** Optional logger. Defaults to console-shaped no-op. */
	logger?: HeartbeatLogger
	/** Path override for device-id (defaults to /var/lib/livos/device-id). */
	deviceIdPath?: string
	/** Override the global `fetch` for testability. */
	fetchImpl?: typeof fetch
}

export interface StopHandle {
	(): void
}

const NO_OP_LOGGER: HeartbeatLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	verbose: () => {},
}

/**
 * Start the background heartbeat-sender. Returns a `stop()` function for
 * graceful shutdown. The first tick fires after `intervalSec` — NOT
 * immediately on start (avoids a thundering-herd burst when many LivOS
 * boxes restart at once, e.g. after an update.sh deploy).
 *
 * The returned `stop()` clears the interval AND will short-circuit any
 * in-flight tick (in-flight POSTs simply complete or time out without
 * scheduling further intervals).
 */
export function startHeartbeat(opts: StartHeartbeatOptions): StopHandle {
	const intervalMs = (opts.intervalSec ?? DEFAULT_INTERVAL_SEC) * 1000
	const logger = opts.logger ?? NO_OP_LOGGER
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch
	const url = opts.url
	const version = opts.version

	// State machine for log-once-per-restart semantics:
	let warned404 = false
	let warnedMalformedKey = false
	let stopped = false
	// 401 stops the loop entirely (revoked key — spamming would be useless
	// AND would burn the user's rate limit on a known-bad key).
	let revoked = false

	const sendOnce = async (): Promise<void> => {
		if (stopped || revoked) return
		// Read API key fresh each tick — if user rotates the file or
		// install.sh writes a new one mid-run, we pick it up without
		// requiring a livinityd restart.
		const keyRecord = await readApiKey(opts.redis)
		if (!keyRecord) {
			// Either Redis key unset (user didn't pass --api-key), file
			// missing, malformed, or empty. The Livinityd boot guard
			// already short-circuits the FIRST case; if we get here at
			// run-time it's a file-disappeared situation. Log once.
			if (!warnedMalformedKey) {
				logger.warn(
					'[heartbeat] API key unavailable (file missing/empty/malformed); pausing heartbeat until key is restored',
				)
				warnedMalformedKey = true
			}
			return
		}
		// Recovered — reset the malformed flag so future disappearances log again.
		warnedMalformedKey = false

		const mode = (await opts.redis.get(REDIS_LOCAL_MODE)) ?? 'unknown'
		const deviceId = await getOrCreateDeviceId(opts.deviceIdPath)
		const payload: HeartbeatPayload = buildHeartbeatPayload({
			deviceId,
			mode,
			version,
		})

		// Abort hung requests at REQUEST_TIMEOUT_MS so a misbehaving
		// Server5 can't pile up unresolved fetch promises inside livinityd.
		const controller = new AbortController()
		const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		let response: Response
		try {
			response = await fetchImpl(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Api-Key': keyRecord.apiKey,
					// Cosmetic — helps Server5 access logs identify LivOS clients.
					'User-Agent': `LivOS-heartbeat/${version}`,
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			})
		} catch (err) {
			// Network error / timeout / DNS failure. Verbose-level log so
			// we don't fill up the journal with "Server5 is down" lines
			// every 60s; warn the first time we see one each restart.
			logger.warn('[heartbeat] network error contacting Server5 (will retry)', err)
			return
		} finally {
			clearTimeout(timeoutHandle)
		}

		// Drain the body so the fetch implementation can release the
		// connection — we don't need it for any status branch.
		try {
			await response.text()
		} catch {
			// ignore
		}

		const status = response.status
		const preview = redactedPreview(keyRecord.apiKey)
		if (status >= 200 && status < 300) {
			logger.verbose(
				`[heartbeat] OK ${status} (key=${preview} mode=${mode} deviceId=${deviceId})`,
			)
			return
		}
		if (status === 401) {
			logger.error(
				`[heartbeat] 401 Unauthorized — API key revoked (key=${preview}). Heartbeat STOPPED until livinityd restart with a fresh key.`,
			)
			revoked = true
			return
		}
		if (status === 404) {
			if (!warned404) {
				logger.warn(
					`[heartbeat] 404 from ${url} — Server5 heartbeat endpoint not yet available. Will keep retrying silently; this is expected before v34.x ships the route.`,
				)
				warned404 = true
			} else {
				logger.verbose(`[heartbeat] 404 (suppressed)`)
			}
			return
		}
		if (status === 429) {
			logger.warn(`[heartbeat] 429 rate-limited; continuing on next interval`)
			return
		}
		if (status >= 500) {
			logger.warn(`[heartbeat] ${status} from Server5 (will retry)`)
			return
		}
		// Anything else (400, 403, ...) — log at warn but keep going. The
		// operator can fish the status out of the journal if it persists.
		logger.warn(`[heartbeat] unexpected ${status} from ${url}`)
	}

	// Use a self-rescheduling setTimeout instead of setInterval so an
	// in-flight tick that takes longer than `intervalMs` (slow Server5)
	// doesn't pile up on top of the next scheduled tick. Each tick fully
	// resolves (or times out via AbortController) before the next is armed.
	let timer: NodeJS.Timeout | null = null
	const schedule = (): void => {
		if (stopped || revoked) return
		timer = setTimeout(() => {
			void sendOnce().finally(() => schedule())
		}, intervalMs)
	}

	schedule()
	logger.info(
		`[heartbeat] sender armed (url=${url} interval=${intervalMs / 1000}s)`,
	)

	return () => {
		stopped = true
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
		logger.info('[heartbeat] sender stopped')
	}
}
