// Phase 310-01 (ALERT-02, T-310-03/04/05/06) — alert dispatcher engine.
//
// The single choke point every alert source funnels through. Two suppression
// layers keep it storm-proof:
//   1. 60s per-channel burst window (BURST_WINDOW_MS) — N alerts within the
//      window collapse into ONE combined message per channel.
//   2. Per-key resend floor (RESEND_FLOOR_MS, 6h) — the same notification key
//      does not re-dispatch externally within the floor (suppresses the backups
//      module's deliberate hourly re-adds).
// Plus: severity routing (a channel only sees severities in its filter),
// per-channel delivery isolation (one channel's failure never blocks others),
// and an immediate test-send path with a per-channel cooldown.
//
// Every dependency is injectable so the whole engine is unit-testable with NO
// real Redis / HTTP: transport, clock (now), and timer (setTimer) are all
// overridable. The real HTTP transport (`defaultTransport`) mirrors the proven
// ai-diagnostics bracketed-error convention with `[alert-*]` tags, and runs the
// ported SSRF guard before every native webhook/ntfy fetch.

import {
	type AlertSeverity,
	type NotificationChannel,
	BURST_WINDOW_MS,
	RESEND_FLOOR_MS,
	TEST_COOLDOWN_MS,
	describeNotification,
	floorBucketKey,
	livChannelId,
	ntfyPriority,
} from './channel-types.js'
import {assertResolvedHostSafe} from './ssrf-guard.js'

function getNexusApiUrl(): string {
	return process.env.LIV_API_URL || 'http://localhost:3200'
}

const DISPATCH_TIMEOUT_MS = 15_000

export interface AlertTransport {
	sendLiv(livId: string, chatId: string, text: string): Promise<void> // throws [alert-*] on failure
	sendWebhook(
		url: string,
		text: string,
		severity: AlertSeverity,
		notificationId: string,
	): Promise<void>
	sendNtfy(url: string, text: string, severity: AlertSeverity, token?: string): Promise<void>
}

// HIGH-02: the resend floor records the last-delivered timestamp AND severity per
// key. Keying by timestamp only let a genuine warning→critical escalation on the
// SAME id (exactly what disk-critical-watch produces) get swallowed for the full
// 6h floor. Carrying the severity lets a STRICTLY HIGHER severity bypass the floor.
export interface FloorRecord {
	at: number
	severity: AlertSeverity
}
export type FloorMap = Record<string, FloorRecord>

export interface DispatcherDeps {
	getChannels: () => Promise<NotificationChannel[]>
	getSecret: (channelId: string, field: 'webhookUrl' | 'ntfyToken') => Promise<string | undefined>
	floorStore: {
		load: () => Promise<FloorMap>
		save: (r: FloorMap) => Promise<void>
	}
	logger: {log: (...a: unknown[]) => void; error: (...a: unknown[]) => void}
	transport?: AlertTransport // injectable for tests; defaults to the real HTTP transport
	now?: () => number // injectable clock (default Date.now)
	setTimer?: (fn: () => void, ms: number) => unknown // injectable (default setTimeout)
}

type PendingItem = {text: string; severity: AlertSeverity}

export class Dispatcher {
	private readonly deps: DispatcherDeps
	// In-memory per-channel burst state — a restart mid-window drops the batch,
	// which is acceptable (recurring conditions re-fire on their next check).
	readonly #pending = new Map<string, PendingItem[]>()
	readonly #timers = new Map<string, unknown>()
	readonly #testCooldowns = new Map<string, number>()
	// MED-03: serializes the floor load→mutate→save cycle. The load() and save()
	// are two separate FileStore calls, so concurrent fire-and-forget dispatches
	// for DIFFERENT keys could each load, then clobber each other's write (lost
	// update → a suppressed key re-storms). livinityd is single-process, so a
	// simple in-memory promise-chain critical section closes the window.
	#floorChain: Promise<unknown> = Promise.resolve()

	constructor(deps: DispatcherDeps) {
		this.deps = deps
	}

	// Run `fn` after any in-flight floor critical section completes, chaining the
	// next one behind it. Errors are isolated so one failed section never wedges
	// the chain.
	#withFloorLock<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.#floorChain.then(fn, fn)
		this.#floorChain = run.then(
			() => undefined,
			() => undefined,
		)
		return run
	}

	/** Floor-check → enqueue into the burst window (schedules a flush timer). */
	async dispatch(notificationId: string, severity: AlertSeverity): Promise<void> {
		// M-01: floor per FULL id so per-device families (smart-failing:<dev>,
		// smart-unavailable:<dev>) page independently. describeNotification still
		// collapses to the base for the human text (via floorKey internally).
		const key = floorBucketKey(notificationId)
		const now = (this.deps.now ?? Date.now)()

		// Resend-floor (HIGH-02): suppress a re-dispatch of the same key within the
		// floor window, BUT a strictly higher severity than the last-floored one
		// always passes and resets the floor (a warning→critical escalation on the
		// same id must never be swallowed). Same-or-lower severity inside the window
		// is suppressed (anti-storm — the original protection is preserved).
		//
		// MED-03: the whole load→decide→save cycle runs inside the floor critical
		// section so concurrent dispatches for different keys can't lose each
		// other's writes.
		const suppressed = await this.#withFloorLock(async () => {
			const floor = await this.deps.floorStore.load()
			const prev = floor[key]
			if (
				prev !== undefined &&
				now - prev.at < RESEND_FLOOR_MS &&
				severityRank(severity) <= severityRank(prev.severity)
			) {
				return true
			}
			floor[key] = {at: now, severity}
			await this.deps.floorStore.save(floor)
			return false
		})
		if (suppressed) return

		const channels = (await this.deps.getChannels()).filter(
			(c) => c.enabled && c.severityFilter.includes(severity),
		)
		if (channels.length === 0) return

		const text = describeNotification(notificationId, severity)
		const schedule =
			this.deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))

		for (const channel of channels) {
			const arr = this.#pending.get(channel.id) ?? []
			arr.push({text, severity})
			this.#pending.set(channel.id, arr)
			if (!this.#timers.has(channel.id)) {
				const id = channel.id
				const handle = schedule(() => {
					void this.flushChannel(id)
				}, BURST_WINDOW_MS)
				this.#timers.set(id, handle)
			}
		}
	}

	/**
	 * Flush a channel's pending burst as ONE combined message. Public so tests can
	 * trigger it deterministically (production only calls it from the burst timer).
	 * Per-channel isolation: a delivery throw is logged and swallowed here.
	 */
	async flushChannel(channelId: string): Promise<void> {
		const pending = this.#pending.get(channelId) ?? []
		this.#pending.delete(channelId)
		this.#timers.delete(channelId)
		if (pending.length === 0) return

		// Re-read the channel for its latest enabled/secret state.
		const channel = (await this.deps.getChannels()).find((c) => c.id === channelId)
		if (!channel || !channel.enabled) return

		const combined =
			pending.length === 1
				? pending[0].text
				: `${pending.length} new alerts:\n` + pending.map((p) => `- ${p.text}`).join('\n')
		const severity = highestSeverity(pending.map((p) => p.severity))

		try {
			await this.#deliverToChannel(channel, combined, severity)
		} catch (e) {
			// NEVER rethrow — one channel's failure must not block the others. Never
			// log the target/url/secret, only the generic error message.
			this.deps.logger.error('[alert-dispatch] channel delivery failed', {
				channelId: channel.id,
				kind: channel.kind,
				error: (e as Error).message,
			})
		}
	}

	/** Immediate test send — bypasses coalescing + resend-floor; 10s per-channel cooldown. */
	async sendTestToChannel(channelId: string): Promise<{ok: boolean; error?: string}> {
		const now = (this.deps.now ?? Date.now)()
		const last = this.#testCooldowns.get(channelId)
		if (last !== undefined && now - last < TEST_COOLDOWN_MS) {
			return {ok: false, error: 'Please wait a few seconds before testing this channel again'}
		}

		const channel = (await this.deps.getChannels()).find((c) => c.id === channelId)
		if (!channel) return {ok: false, error: 'Channel not found'}

		this.#testCooldowns.set(channelId, now)
		try {
			await this.#deliverToChannel(
				channel,
				'Livinity test alert — this channel is configured correctly.',
				'info',
			)
			return {ok: true}
		} catch (e) {
			return {ok: false, error: (e as Error).message}
		}
	}

	async #deliverToChannel(
		channel: NotificationChannel,
		text: string,
		severity: AlertSeverity,
	): Promise<void> {
		const transport = this.deps.transport ?? defaultTransport

		const livId = livChannelId(channel.kind)
		if (livId) {
			await transport.sendLiv(livId, channel.target, text)
			return
		}

		if (channel.kind === 'webhook') {
			const url = await this.deps.getSecret(channel.id, 'webhookUrl')
			if (!url) throw new Error('[alert-error] webhook has no URL configured')
			await transport.sendWebhook(url, text, severity, channel.id)
			return
		}

		if (channel.kind === 'ntfy') {
			const token = await this.deps.getSecret(channel.id, 'ntfyToken')
			await transport.sendNtfy(channel.target, text, severity, token)
			return
		}
	}
}

// Highest severity of a burst: critical > warning > info.
function highestSeverity(severities: AlertSeverity[]): AlertSeverity {
	if (severities.includes('critical')) return 'critical'
	if (severities.includes('warning')) return 'warning'
	return 'info'
}

// Ordinal for severity comparison in the resend floor (critical > warning > info).
function severityRank(severity: AlertSeverity): number {
	return severity === 'critical' ? 3 : severity === 'warning' ? 2 : 1
}

// Map an AbortError/TimeoutError to the [alert-timeout] tag, any other fetch
// throw to [alert-unavailable]. Shared by all three transports.
function isTimeout(err: unknown): boolean {
	const name = (err as {name?: string})?.name
	return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * The real HTTP transport. Copies the ai-diagnostics bracketed-error convention
 * with alert-specific tags. NEVER interpolates chatId/text/url/token into an
 * error string or a log line, and NEVER interpolates alert text into a header.
 *
 * Exported so the SSRF redirect-refusal behaviour (HIGH-01) is unit-testable.
 */
export const defaultTransport: AlertTransport = {
	async sendLiv(livId, chatId, text) {
		const url = `${getNexusApiUrl()}/api/channels/${livId}/send`
		let response: Response
		try {
			response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
				},
				body: JSON.stringify({chatId, text}),
				signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
			})
		} catch (err) {
			if (isTimeout(err)) throw new Error('[alert-timeout] Liv channel send exceeded 15s')
			throw new Error('[alert-unavailable] Could not reach Liv channel endpoint')
		}
		if (response.status >= 500 || !response.ok) {
			const body = await response.text().catch(() => '')
			throw new Error(`[alert-error] Liv returned ${response.status}: ${body.slice(0, 300)}`)
		}
	},

	async sendWebhook(url, text, severity, notificationId) {
		await assertResolvedHostSafe(url)
		let response: Response
		try {
			response = await fetch(url, {
				method: 'POST',
				// HIGH-01: the SSRF guard validates only the INITIAL url. `fetch`
				// defaults to redirect:'follow', which would transparently chase a
				// 3xx Location to an unvetted host (169.254.169.254 / RFC1918 / …),
				// fully defeating the guard. Webhook receivers legitimately never
				// need a redirect, so we refuse to follow and treat any 3xx as a
				// delivery failure (see the 3xx check below).
				redirect: 'manual',
				headers: {'Content-Type': 'application/json'},
				// Carry BOTH `text` (Slack/generic receivers) and `content` (Discord).
				body: JSON.stringify({
					text,
					content: text,
					severity,
					notification: notificationId,
					timestamp: new Date().toISOString(),
				}),
				signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
			})
		} catch (err) {
			if (isTimeout(err)) throw new Error('[alert-timeout] webhook delivery exceeded 15s')
			throw new Error('[alert-unavailable] webhook delivery could not connect')
		}
		if (isRedirect(response)) {
			// Never follow — a 3xx here is an SSRF-guard bypass attempt or a
			// misconfigured receiver. Refuse rather than chase the Location.
			throw new Error('[alert-error] webhook delivery redirected — refusing to follow (SSRF guard)')
		}
		if (response.status >= 500 || !response.ok) {
			// Generic — never leak the url.
			throw new Error(`[alert-error] webhook delivery failed (${response.status})`)
		}
	},

	async sendNtfy(url, text, severity, token) {
		await assertResolvedHostSafe(url)
		let response: Response
		try {
			response = await fetch(url, {
				method: 'POST',
				// HIGH-01: same rationale as sendWebhook — never let `fetch` follow a
				// redirect to an unvetted host past the one-shot SSRF guard.
				redirect: 'manual',
				// Metadata headers are FIXED server strings — alert text is NEVER
				// interpolated into a header (header-injection guard).
				headers: {
					Title: 'Livinity Alert',
					Priority: ntfyPriority(severity),
					...(token ? {Authorization: `Bearer ${token}`} : {}),
				},
				body: text,
				signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
			})
		} catch (err) {
			if (isTimeout(err)) throw new Error('[alert-timeout] ntfy delivery exceeded 15s')
			throw new Error('[alert-unavailable] ntfy delivery could not connect')
		}
		if (isRedirect(response)) {
			throw new Error('[alert-error] ntfy delivery redirected — refusing to follow (SSRF guard)')
		}
		if (response.status >= 500 || !response.ok) {
			// Generic — never leak the url/token.
			throw new Error(`[alert-error] ntfy delivery failed (${response.status})`)
		}
	},
}

// HIGH-01 helper: with redirect:'manual', a redirect surfaces as either an
// explicit 3xx status (Node ≥22 undici) or an opaque-redirect filtered response
// (status 0, type 'opaqueredirect', per the fetch spec). Treat BOTH as a redirect
// so the refusal is robust across Node/undici versions.
function isRedirect(response: Response): boolean {
	return (
		response.type === 'opaqueredirect' ||
		(response.status >= 300 && response.status < 400)
	)
}
