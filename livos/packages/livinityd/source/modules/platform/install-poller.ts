/**
 * Vercel install-command poller — Phase 215 / CARRY-P215-MINIPC-POLLER.
 *
 * Polls livinity.io for queued install commands targeted at this Mini PC,
 * claims each atomically, executes via Apps.installForUser(), reports
 * back ready/failed.
 *
 * Protocol (gated by `x-api-key` — same key as tunnel-presence):
 *   GET    /api/me/install-commands/poll       → list of queued
 *   POST   /api/me/install-commands/{id}/claim → atomic queued→running
 *   POST   /api/me/install-commands/{id}/complete with body
 *          { status:'ready'|'failed', result?: {} }                → terminal
 *
 * Quiet by design: silent when no api-key configured (offline / LAN-only
 * installs). Polls every 5s when armed.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
import type {Redis} from 'ioredis'

const REDIS_PREFIX = 'livos:platform:'
const DEFAULT_PLATFORM_BASE = 'https://livinity.io'
// 60s default. The poller is best-effort dispatch — 5s was too aggressive
// and tripped Vercel's Attack Challenge Mode in production on 2026-05-26.
// 60s with empty queue = 1 GET per minute, well under any rate-limit floor.
const POLL_INTERVAL_MS = 60_000
const ERROR_BACKOFF_MS = 60_000
// 429 (rate-limit or Vercel challenge) needs a much longer backoff so we
// don't keep hammering the protected endpoint and prolong the shield state.
const RATE_LIMITED_BACKOFF_MS = 5 * 60_000
// Kill-switch: operator sets `livos:platform:install_poller_disabled` = '1'
// in Redis and restarts livinityd to drain a runaway poller without code change.
const REDIS_KEY_DISABLED = `${REDIS_PREFIX}install_poller_disabled`

export interface InstallPollerLogger {
	log: (...a: unknown[]) => void
	error: (...a: unknown[]) => void
}

export interface InstallPollerApps {
	// Apps.installForUser shape — we depend only on the subset we use.
	installForUser(appId: string, userId: string): Promise<boolean>
}

export interface InstallPollerOptions {
	redis: Redis
	apps: InstallPollerApps
	version: string
	logger: InstallPollerLogger
	/** Override for tests / preview Vercel URLs. Default https://livinity.io. */
	platformBaseUrl?: string
	/** Override poll interval in ms (default 5000). */
	pollIntervalMs?: number
}

interface QueuedCommand {
	id: string
	app_id: string
	app_slug: string | null
	app_name: string | null
	instance_name: string | null
	params: unknown
	created_at: string
}

interface ClaimedCommand extends QueuedCommand {
	user_id: string
	status: string
	started_at: string
}

export class InstallPoller {
	private readonly redis: Redis
	private readonly apps: InstallPollerApps
	private readonly version: string
	private readonly logger: InstallPollerLogger
	private readonly baseUrl: string
	private readonly intervalMs: number
	private timer: NodeJS.Timeout | null = null
	private inFlight = false
	private stopped = false

	constructor(opts: InstallPollerOptions) {
		this.redis = opts.redis
		this.apps = opts.apps
		this.version = opts.version
		this.logger = opts.logger
		this.baseUrl = opts.platformBaseUrl ?? DEFAULT_PLATFORM_BASE
		this.intervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS
	}

	async start(): Promise<void> {
		this.stopped = false
		const disabled = await this.redis.get(REDIS_KEY_DISABLED)
		if (disabled === '1') {
			this.logger.log('[install-poller] kill-switch active (install_poller_disabled=1), staying idle')
			return
		}
		const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
		if (!apiKey) {
			this.logger.log('[install-poller] No api-key configured, staying idle')
			return
		}
		this.logger.log(`[install-poller] armed, base=${this.baseUrl} interval=${this.intervalMs}ms`)
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
				this.logger.log('[install-poller] kill-switch activated mid-run, stopping')
				this.stopped = true
				return
			}
			const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
			if (!apiKey) {
				// api-key disappeared (rotation / sign-out). Stay idle until next start().
				this.logger.log('[install-poller] api-key cleared, stopping')
				this.stopped = true
				return
			}
			const queued = await this.fetchQueued(apiKey)
			for (const cmd of queued) {
				if (this.stopped) return
				await this.runOne(apiKey, cmd)
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			// HTTP 429 (rate-limit / Vercel challenge) needs an aggressive backoff
			// so we don't trip Vercel Attack Challenge Mode and lock the whole
			// project out (real 2026-05-26 production incident).
			if (message.includes('HTTP 429') || message.includes('challenge')) {
				this.logger.error(`[install-poller] rate-limited (5min backoff): ${message.slice(0, 200)}`)
				backoff = RATE_LIMITED_BACKOFF_MS
			} else {
				this.logger.error('[install-poller] tick failed:', err)
				backoff = ERROR_BACKOFF_MS
			}
		} finally {
			this.inFlight = false
			this.scheduleNext(backoff)
		}
	}

	private async fetchQueued(apiKey: string): Promise<QueuedCommand[]> {
		const resp = await fetch(`${this.baseUrl}/api/me/install-commands/poll`, {
			headers: {
				'X-API-Key': apiKey,
				'User-Agent': `livinityd-presence/${this.version}`,
			},
		})
		if (!resp.ok) {
			// Drain a small slice of the body for diagnostics but do NOT pull the
			// entire HTML challenge page — Vercel returns large interstitials.
			const snippet = (await resp.text()).slice(0, 256)
			throw new Error(`poll HTTP ${resp.status}: ${snippet}`)
		}
		const body = (await resp.json()) as {commands?: QueuedCommand[]}
		return body.commands ?? []
	}

	private async runOne(apiKey: string, cmd: QueuedCommand): Promise<void> {
		// Step 1: claim
		const claimResp = await fetch(
			`${this.baseUrl}/api/me/install-commands/${cmd.id}/claim`,
			{
				method: 'POST',
				headers: {
					'X-API-Key': apiKey,
					'User-Agent': `livinityd-presence/${this.version}`,
				},
			},
		)
		if (claimResp.status === 409 || claimResp.status === 403 || claimResp.status === 404) {
			// Someone else claimed it OR not ours OR vanished — skip silently.
			this.logger.log(`[install-poller] skip cmd=${cmd.id} (${claimResp.status})`)
			return
		}
		if (!claimResp.ok) {
			throw new Error(`claim HTTP ${claimResp.status}: ${await claimResp.text()}`)
		}
		const claimed = (await claimResp.json()) as ClaimedCommand

		this.logger.log(
			`[install-poller] claimed cmd=${cmd.id} app=${cmd.app_slug ?? cmd.app_id} user=${claimed.user_id}`,
		)

		// Step 2: execute install (Apps.installForUser uses appId — which here is
		// app_slug per the existing apps.ts schema. Both UUID-id and slug-id are
		// accepted by the underlying template chain.)
		const appIdentifier = cmd.app_slug ?? cmd.app_id
		let success = false
		let errorMessage: string | null = null
		const startedAt = Date.now()
		try {
			success = await this.apps.installForUser(appIdentifier, claimed.user_id)
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err)
		}
		const durationMs = Date.now() - startedAt

		// Step 3: report terminal
		const terminalStatus = success && !errorMessage ? 'ready' : 'failed'
		const completeBody = {
			status: terminalStatus,
			result: {
				duration_ms: durationMs,
				success,
				error: errorMessage,
				app_identifier: appIdentifier,
				instance_name: cmd.instance_name,
			},
		}
		const completeResp = await fetch(
			`${this.baseUrl}/api/me/install-commands/${cmd.id}/complete`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': apiKey,
					'User-Agent': `livinityd-presence/${this.version}`,
				},
				body: JSON.stringify(completeBody),
			},
		)
		if (!completeResp.ok) {
			// Don't throw — the install itself completed, only the report failed.
			// Next poll will see the row still in 'running' and the operator can
			// manually resolve. Log so it's discoverable.
			this.logger.error(
				`[install-poller] complete HTTP ${completeResp.status} for cmd=${cmd.id}: ${await completeResp.text()}`,
			)
			return
		}
		this.logger.log(
			`[install-poller] done cmd=${cmd.id} status=${terminalStatus} duration=${durationMs}ms`,
		)
	}
}
