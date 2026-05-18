/**
 * Supabase Realtime presence client for livinityd — Phase 146
 *
 * Replaces the WebSocket-to-relay ('wss://livinity.io:4000') in
 * tunnel-client.ts. On start():
 *   1. Read api-key from Redis (livos:platform:api_key)
 *   2. POST https://livinity.io/api/me/realtime-token with X-API-Key
 *   3. Use returned JWT + channel name ('tunnel:<userId>') to subscribe
 *      to a Supabase Realtime presence channel
 *   4. track({ username, livinityd_version, started_at })
 *   5. Re-mint JWT every 50min (token TTL is 1h)
 *
 * No bidirectional HTTP/WS proxying — that work moved to CF Tunnel
 * (livinityd's cloudflared connector handles inbound user-subdomain
 *  HTTP/WS directly to local port 8080).
 *
 * Redis keys this writes (matches current tunnel-client.ts contract):
 *   livos:platform:status     — 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
 *   livos:platform:session_id — 'tunnel:<userId>' (the Supabase channel name)
 *   livos:platform:url        — 'https://<username>.livinity.io' (derived locally)
 *
 * NOTE (Phase 146 chicken-and-egg solved): NO LIVOS_SUPABASE_URL or
 * LIVOS_SUPABASE_ANON_KEY env vars. NO Redis seed for supabase_url /
 * supabase_anon_key. Everything we need to instantiate the Supabase
 * client comes back from /api/me/realtime-token in the response body
 * alongside the JWT. The anon-key is public-safe (RLS protects
 * channels) so shipping it in a token response is the documented
 * Supabase self-bootstrap pattern.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */
import {createClient, type SupabaseClient, type RealtimeChannel} from '@supabase/supabase-js'
import type {Redis} from 'ioredis'

const REDIS_PREFIX = 'livos:platform:'
const DEFAULT_REALTIME_TOKEN_URL = 'https://livinity.io/api/me/realtime-token'
const REMINT_INTERVAL_MS = 50 * 60 * 1000 // 50 min — token TTL is 1h

export type TunnelPresenceStatus =
	| 'idle'
	| 'connecting'
	| 'connected'
	| 'disconnected'
	| 'error'

export interface TunnelPresenceLogger {
	log: (...a: unknown[]) => void
	error: (...a: unknown[]) => void
}

export interface TunnelPresenceOptions {
	redis: Redis
	version: string
	logger: TunnelPresenceLogger
	/** Override for tests / preview Vercel URLs. Default https://livinity.io. */
	realtimeTokenUrl?: string
}

interface RealtimeTokenResponse {
	token: string
	supabaseUrl: string
	supabaseAnonKey: string
	userId: string
	channel: string
	expiresIn: number
}

export interface TunnelPresenceSnapshot {
	status: TunnelPresenceStatus
	url: string | null
	sessionId: string | null
}

export class TunnelPresence {
	private readonly redis: Redis
	private readonly version: string
	private readonly logger: TunnelPresenceLogger
	private readonly realtimeTokenUrl: string
	private supabase: SupabaseClient | null = null
	private channel: RealtimeChannel | null = null
	private remintTimer: NodeJS.Timeout | null = null
	private retryTimer: NodeJS.Timeout | null = null
	private status: TunnelPresenceStatus = 'idle'
	private userId: string | null = null
	private username: string | null = null
	private stopped = false

	constructor(opts: TunnelPresenceOptions) {
		this.redis = opts.redis
		this.version = opts.version
		this.logger = opts.logger
		this.realtimeTokenUrl = opts.realtimeTokenUrl ?? DEFAULT_REALTIME_TOKEN_URL
	}

	async start(): Promise<void> {
		this.stopped = false
		const apiKey = await this.redis.get(`${REDIS_PREFIX}api_key`)
		if (!apiKey) {
			await this.setStatus('idle')
			this.logger.log('[presence] No api-key configured, staying idle')
			return
		}
		const tunnelDisabled = await this.redis.get(`${REDIS_PREFIX}tunnel_disabled`)
		if (tunnelDisabled === '1') {
			await this.setStatus('idle')
			this.logger.log('[presence] tunnel_disabled=1, staying idle')
			return
		}
		await this.connect(apiKey)
	}

	private async fetchToken(apiKey: string): Promise<RealtimeTokenResponse> {
		const resp = await fetch(this.realtimeTokenUrl, {
			method: 'POST',
			headers: {
				'X-API-Key': apiKey,
				'User-Agent': `livinityd-presence/${this.version}`,
			},
		})
		if (!resp.ok) {
			throw new Error(`realtime-token HTTP ${resp.status}: ${await resp.text()}`)
		}
		const body = (await resp.json()) as RealtimeTokenResponse
		if (!body.token || !body.supabaseUrl || !body.supabaseAnonKey || !body.userId || !body.channel) {
			throw new Error(
				`realtime-token response missing required fields: ${JSON.stringify(Object.keys(body))}`,
			)
		}
		return body
	}

	private async connect(apiKey: string): Promise<void> {
		await this.setStatus('connecting')
		let tokenResp: RealtimeTokenResponse
		try {
			tokenResp = await this.fetchToken(apiKey)
		} catch (err) {
			this.logger.error('[presence] token mint failed:', err)
			await this.setStatus('error')
			this.scheduleRetry(apiKey, 30_000)
			return
		}
		this.userId = tokenResp.userId

		// Self-bootstrap: instantiate Supabase client from the values the
		// token-mint response shipped to us. No env vars, no Redis seed.
		this.supabase = createClient(tokenResp.supabaseUrl, tokenResp.supabaseAnonKey, {
			auth: {persistSession: false, autoRefreshToken: false},
			realtime: {params: {eventsPerSecond: 2}},
		})
		this.supabase.realtime.setAuth(tokenResp.token)

		const username = (await this.redis.get(`${REDIS_PREFIX}username`)) ?? this.userId
		this.username = username

		this.channel = this.supabase.channel(tokenResp.channel, {
			config: {presence: {key: this.userId}},
		})

		try {
			await new Promise<void>((resolve, reject) => {
				const subscribeTimeout = setTimeout(
					() => reject(new Error('subscribe timeout 10s')),
					10_000,
				)
				this.channel!.subscribe(async (subscribeStatus) => {
					if (subscribeStatus === 'SUBSCRIBED') {
						clearTimeout(subscribeTimeout)
						const trackRes = await this.channel!.track({
							username,
							livinityd_version: this.version,
							started_at: new Date().toISOString(),
						})
						this.logger.log(
							`[presence] subscribed to ${tokenResp.channel} via realtime-token bootstrap — track: ${trackRes}`,
						)
						await this.setStatus('connected')
						await this.redis.set(`${REDIS_PREFIX}session_id`, tokenResp.channel)
						await this.redis.set(`${REDIS_PREFIX}url`, `https://${username}.livinity.io`)
						this.scheduleRemint(apiKey)
						resolve()
					} else if (
						subscribeStatus === 'CHANNEL_ERROR' ||
						subscribeStatus === 'TIMED_OUT' ||
						subscribeStatus === 'CLOSED'
					) {
						clearTimeout(subscribeTimeout)
						this.logger.error(`[presence] subscribe failed: ${subscribeStatus}`)
						await this.setStatus('disconnected')
						reject(new Error(`subscribe ${subscribeStatus}`))
					}
				})
			})
		} catch (err) {
			this.logger.error('[presence] connect failed, will retry in 30s:', err)
			this.scheduleRetry(apiKey, 30_000)
		}
	}

	private scheduleRemint(apiKey: string): void {
		if (this.remintTimer) clearTimeout(this.remintTimer)
		this.remintTimer = setTimeout(async () => {
			this.logger.log('[presence] re-minting JWT (50min)')
			try {
				const newToken = await this.fetchToken(apiKey)
				this.supabase?.realtime.setAuth(newToken.token)
				this.scheduleRemint(apiKey)
			} catch (err) {
				this.logger.error('[presence] remint failed:', err)
				// Short retry; presence stays alive on the old token until exp
				this.remintTimer = setTimeout(() => this.scheduleRemint(apiKey), 5 * 60 * 1000)
			}
		}, REMINT_INTERVAL_MS)
	}

	private scheduleRetry(apiKey: string, delayMs: number): void {
		if (this.retryTimer) clearTimeout(this.retryTimer)
		if (this.stopped) return
		this.retryTimer = setTimeout(() => {
			if (this.stopped) return
			void this.connect(apiKey).catch((e) =>
				this.logger.error('[presence] retry connect failed:', e),
			)
		}, delayMs)
	}

	async stop(): Promise<void> {
		this.stopped = true
		if (this.remintTimer) {
			clearTimeout(this.remintTimer)
			this.remintTimer = null
		}
		if (this.retryTimer) {
			clearTimeout(this.retryTimer)
			this.retryTimer = null
		}
		if (this.channel) {
			await this.channel.untrack().catch(() => {})
			await this.supabase?.removeChannel(this.channel).catch(() => {})
			this.channel = null
		}
		this.supabase = null
		await this.setStatus('idle')
		await this.redis.del(`${REDIS_PREFIX}session_id`).catch(() => {})
		await this.redis.del(`${REDIS_PREFIX}url`).catch(() => {})
	}

	getSnapshot(): TunnelPresenceSnapshot {
		return {
			status: this.status,
			url: this.username ? `https://${this.username}.livinity.io` : null,
			sessionId: this.userId ? `tunnel:${this.userId}` : null,
		}
	}

	private async setStatus(s: TunnelPresenceStatus): Promise<void> {
		this.status = s
		await this.redis.set(`${REDIS_PREFIX}status`, s).catch(() => {})
	}
}
