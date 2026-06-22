/**
 * Vercel announcement poller — Phase 292.
 *
 * Polls livinity.io for the fleet announcements this box's owner is eligible to
 * see, and caches them in Redis (`livos:announcements:active`, TTL ~120s) for
 * the box UI to read via the `announcements.listActive` tRPC query. Unlike the
 * install poller this ONLY caches — it claims/executes nothing. Write-back
 * (seen/vote/feedback) flows through the key-injecting `announcements.*` tRPC
 * proxy, not here.
 *
 * Protocol (gated by `x-api-key` — the same box-owner key as the install poller):
 *   GET /api/me/announcements/poll → { announcements: [...] }
 *
 * Quiet by design: silent when no api-key is configured (offline / unlinked box).
 * Polls every 60s when armed (5s tripped Vercel Attack Challenge Mode 2026-05-26).
 */
import type {Redis} from 'ioredis'

const REDIS_PREFIX = 'livos:platform:'
const DEFAULT_PLATFORM_BASE = 'https://livinity.io'
// 60s floor — 5s was too aggressive and tripped Vercel's Attack Challenge Mode
// in production on 2026-05-26. 60s with an empty result = 1 GET/min.
const POLL_INTERVAL_MS = 60_000
const ERROR_BACKOFF_MS = 60_000
// 429 (rate-limit / Vercel challenge) needs a much longer backoff so we don't
// keep hammering the protected endpoint and prolong the shield state.
const RATE_LIMITED_BACKOFF_MS = 5 * 60_000
// Kill-switch: operator sets `livos:platform:announcement_poller_disabled` = '1'
// in Redis and restarts livinityd to drain a runaway poller without a code change.
const REDIS_KEY_DISABLED = `${REDIS_PREFIX}announcement_poller_disabled`
// The box-local cache the UI reads (DEC-11 — Redis, no box Postgres table).
const REDIS_KEY_CACHE = 'livos:announcements:active'
const CACHE_TTL_SECONDS = 120

export interface AnnouncementPollerLogger {
	log: (...a: unknown[]) => void
	error: (...a: unknown[]) => void
}

export interface AnnouncementPollerOptions {
	redis: Redis
	version: string
	logger: AnnouncementPollerLogger
	/** Override for tests / preview Vercel URLs. Default https://livinity.io. */
	platformBaseUrl?: string
	/** Override poll interval in ms (default 60000). */
	pollIntervalMs?: number
}

/** One announcement as returned by /api/me/announcements/poll (Plan 04 shape). */
export interface ActiveAnnouncement {
	id: string
	slug: string | null
	title: string
	kind: string
	blocks: unknown[]
	raw_html_sanitized: string | null
	frequency: string
	frequency_n: number | null
	priority: number
	dismissible: boolean
	start_at: string | null
	end_at: string | null
}

export class AnnouncementPoller {
	private readonly redis: Redis
	private readonly version: string
	private readonly logger: AnnouncementPollerLogger
	private readonly baseUrl: string
	private readonly intervalMs: number
	private timer: NodeJS.Timeout | null = null
	private inFlight = false
	private stopped = false

	constructor(opts: AnnouncementPollerOptions) {
		this.redis = opts.redis
		this.version = opts.version
		this.logger = opts.logger
		this.baseUrl = opts.platformBaseUrl ?? DEFAULT_PLATFORM_BASE
		this.intervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS
	}

	async start(): Promise<void> {
		this.stopped = false
		const disabled = await this.redis.get(REDIS_KEY_DISABLED)
		if (disabled === '1') {
			this.logger.log('[announcement-poller] kill-switch active (announcement_poller_disabled=1), staying idle')
			return
		}
		const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
		if (!apiKey) {
			this.logger.log('[announcement-poller] No api-key configured, staying idle')
			return
		}
		this.logger.log(`[announcement-poller] armed, base=${this.baseUrl} interval=${this.intervalMs}ms`)
		this.scheduleNext(0)
	}

	stop(): void {
		this.stopped = true
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
	}

	private scheduleNext(delayMs: number): void {
		if (this.stopped) return
		if (this.timer) clearTimeout(this.timer)
		this.timer = setTimeout(() => {
			void this.tick()
		}, delayMs)
	}

	private async tick(): Promise<void> {
		if (this.inFlight || this.stopped) {
			this.scheduleNext(this.intervalMs)
			return
		}
		this.inFlight = true
		let backoff = this.intervalMs
		try {
			const disabled = await this.redis.get(REDIS_KEY_DISABLED)
			if (disabled === '1') {
				this.logger.log('[announcement-poller] kill-switch activated mid-run, stopping')
				this.stopped = true
				return
			}
			const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
			if (!apiKey) {
				this.logger.log('[announcement-poller] api-key cleared, stopping')
				this.stopped = true
				return
			}
			const list = await this.fetchAnnouncements(apiKey)
			// DEC-11: cache to Redis (transient, no box Postgres table). The UI reads
			// this via announcements.listActive — no central round-trip per render.
			await this.redis.set(REDIS_KEY_CACHE, JSON.stringify(list), 'EX', CACHE_TTL_SECONDS)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			// HTTP 429 (rate-limit / Vercel challenge) needs an aggressive backoff so
			// we don't trip Vercel Attack Challenge Mode (real 2026-05-26 incident).
			if (message.includes('HTTP 429') || message.includes('challenge')) {
				this.logger.error(`[announcement-poller] rate-limited (5min backoff): ${message.slice(0, 200)}`)
				backoff = RATE_LIMITED_BACKOFF_MS
			} else {
				this.logger.error('[announcement-poller] tick failed:', err)
				backoff = ERROR_BACKOFF_MS
			}
		} finally {
			this.inFlight = false
			this.scheduleNext(backoff)
		}
	}

	private async fetchAnnouncements(apiKey: string): Promise<ActiveAnnouncement[]> {
		const resp = await fetch(`${this.baseUrl}/api/me/announcements/poll`, {
			headers: {
				'X-API-Key': apiKey,
				'User-Agent': `livinityd-presence/${this.version}`,
			},
		})
		if (!resp.ok) {
			// Drain a small slice for diagnostics but never the full Vercel
			// interstitial.
			const snippet = (await resp.text()).slice(0, 256)
			throw new Error(`poll HTTP ${resp.status}: ${snippet}`)
		}
		const body = (await resp.json()) as {announcements?: ActiveAnnouncement[]}
		return body.announcements ?? []
	}
}
