/**
 * Phase 195 Plan 02 Task 2 — credentials-service.ts
 *
 * XaiCredentialsService is the SINGLE SOURCE OF TRUTH for xAI OAuth tokens
 * across livinityd. Every consumer (xai-provider in 195-05, tRPC router in
 * 195-03) must call getToken() at request time — there is no other supported
 * path. This guards against stale-token cascades and gives us one place to
 * mark `disconnected` if xAI revokes the refresh token.
 *
 * Architecture:
 *
 *   getToken()
 *     ├── read auth.json (async)
 *     ├── decode JWT for expiry
 *     ├── if exp - now > 5min → return current access verbatim
 *     └── else single-flight refresh:
 *           ├── refreshInFlight already set? → await its result
 *           └── else: set refreshInFlight, call _doRefresh()
 *                 ├── refreshXaiToken({refreshToken, clientId=aud})
 *                 ├── on 200: re-read auth.json (to preserve sibling keys
 *                 │            like 'anthropic'), splice in new xai entry,
 *                 │            atomic write via temp+rename, emit
 *                 │            'token-refreshed', return new access
 *                 └── on 401: emit 'token-expired' + 'disconnected', rethrow
 *
 * Threat mitigations:
 *   T-195-02-01: never log token values; only scalar claim metadata
 *   T-195-02-02: PID-suffixed temp file + rename for atomic write;
 *                in-flight Promise guard collapses concurrent refreshes to 1
 *   T-195-02-04: same single-flight guard caps refresh fanout to 1/process
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {EventEmitter} from 'node:events'

import {getOpencodeAuthPath} from './auth-json-path.js'
import {AuthJsonCorruptError, decodeXaiJwt, type XaiJwtClaims} from './jwt-decoder.js'
import {RefreshFailedError, refreshXaiToken} from './token-refresher.js'

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Refresh fires when token has <= 5 min remaining. */
const REFRESH_THRESHOLD_MS = 5 * 60_000

// ─── Types ───────────────────────────────────────────────────────────────────

export interface XaiCredentialsStatus {
	connected: boolean
	tier?: number
	scopes?: string[]
	/** ms epoch */
	expiresAt?: number
	principalId?: string
	teamId?: string
	lastRefreshAt?: number
}

export interface Logger {
	debug?: (...args: unknown[]) => void
	info?: (...args: unknown[]) => void
	warn?: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

export interface XaiCredentialsServiceOpts {
	authJsonPath?: string
	logger?: Logger
	/**
	 * Override the refresh function (test seam). Defaults to refreshXaiToken
	 * from token-refresher.ts.
	 */
	refreshFn?: typeof refreshXaiToken
	/**
	 * Override client_id for refresh. When omitted, we read it from the
	 * `aud` claim of the current JWT — that IS OpenCode's client_id per
	 * CONTEXT.md verified facts.
	 */
	refreshClientId?: string
}

export type XaiCredentialsEvent =
	| 'token-refreshed'
	| 'token-expired'
	| 'disconnected'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class NotConnectedError extends Error {
	readonly code = 'XAI_NOT_CONNECTED' as const
	constructor(message = 'xAI is not connected — run the onboarding auth flow') {
		super(message)
		this.name = 'NotConnectedError'
	}
}

// ─── Internal auth.json shape ────────────────────────────────────────────────

interface XaiAuthEntry {
	type: 'oauth'
	access: string
	refresh: string
	expires?: number
}

type AuthJsonShape = {xai?: XaiAuthEntry; [providerKey: string]: unknown}

// ─── Service ─────────────────────────────────────────────────────────────────

export class XaiCredentialsService extends EventEmitter {
	private readonly authJsonPath: string
	private readonly logger: Logger
	private readonly refreshFn: typeof refreshXaiToken
	private readonly refreshClientIdOverride?: string

	/** Single-flight refresh guard — T-195-02-02 / T-195-02-04. */
	private refreshInFlight: Promise<string> | null = null

	private lastRefreshAt?: number

	constructor(opts: XaiCredentialsServiceOpts = {}) {
		super()
		this.authJsonPath = opts.authJsonPath ?? getOpencodeAuthPath()
		this.logger = opts.logger ?? {}
		this.refreshFn = opts.refreshFn ?? refreshXaiToken
		this.refreshClientIdOverride = opts.refreshClientId
	}

	/**
	 * Return a usable access token, refreshing if within 5 min of expiry.
	 *
	 * Single-flight: concurrent callers during refresh await the SAME
	 * in-flight Promise (T-195-02-04).
	 */
	async getToken(): Promise<string> {
		const authJson = await this.readAuthJson()
		const xai = authJson.xai
		if (!xai) throw new NotConnectedError()

		let claims: XaiJwtClaims
		try {
			claims = decodeXaiJwt(xai.access)
		} catch (err) {
			throw new NotConnectedError(
				`xai access token is corrupt: ${(err as Error).message}`,
			)
		}

		const msUntilExpiry = claims.exp - Date.now()
		if (msUntilExpiry > REFRESH_THRESHOLD_MS) {
			return xai.access
		}

		// Refresh needed. Single-flight guard.
		if (this.refreshInFlight) {
			return this.refreshInFlight
		}

		const clientId = this.refreshClientIdOverride ?? claims.aud
		if (!clientId) {
			throw new NotConnectedError(
				'xai jwt aud claim empty — cannot derive refresh client_id',
			)
		}

		const refreshPromise = this._doRefresh(xai.refresh, clientId).finally(() => {
			this.refreshInFlight = null
		})
		this.refreshInFlight = refreshPromise
		return refreshPromise
	}

	/**
	 * Read-only status snapshot. Refreshes on every call to stay in sync with
	 * on-disk truth (operator may have re-run `opencode auth login` out-of-band).
	 */
	async getStatus(): Promise<XaiCredentialsStatus> {
		let authJson: AuthJsonShape
		try {
			authJson = await this.readAuthJson()
		} catch {
			return {connected: false}
		}
		const xai = authJson.xai
		if (!xai) return {connected: false}

		try {
			const claims = decodeXaiJwt(xai.access)
			return {
				connected: true,
				tier: claims.tier,
				scopes: claims.scope,
				expiresAt: claims.exp,
				principalId: claims.principal_id,
				teamId: claims.team_id,
				lastRefreshAt: this.lastRefreshAt,
			}
		} catch {
			return {connected: false}
		}
	}

	/**
	 * Remove only the `xai` entry from auth.json (preserve sibling providers
	 * like `anthropic`). Atomic write via temp+rename.
	 *
	 * Emits 'disconnected'.
	 */
	async clear(): Promise<void> {
		let authJson: AuthJsonShape
		try {
			authJson = await this.readAuthJson()
		} catch {
			// No file or unreadable — disconnected by definition.
			this.emit('disconnected')
			return
		}
		if (!authJson.xai) {
			this.emit('disconnected')
			return
		}

		const {xai: _drop, ...rest} = authJson
		await this.writeAuthJsonAtomic(rest as AuthJsonShape)
		this.emit('disconnected')
	}

	// ─── Internal: refresh ────────────────────────────────────────────────────

	private async _doRefresh(refreshToken: string, clientId: string): Promise<string> {
		const start = Date.now()
		try {
			const result = await this.refreshFn({refreshToken, clientId})

			// Re-read auth.json under the in-flight lock so we don't clobber
			// sibling provider entries (anthropic, etc.) that may have been
			// updated by another process.
			const authJson = await this.readAuthJson()
			const merged: AuthJsonShape = {
				...authJson,
				xai: {
					type: 'oauth',
					access: result.access,
					refresh: result.refresh,
					expires: result.expiresAt,
				},
			}
			await this.writeAuthJsonAtomic(merged)

			this.lastRefreshAt = Date.now()
			const duration = Date.now() - start
			// T-195-02-01: never log access/refresh values, only metadata.
			this.logger.info?.('[xai-credentials] refresh OK', {
				durationMs: duration,
				expiresAt: result.expiresAt,
			})

			this.emit('token-refreshed')
			return result.access
		} catch (err) {
			const duration = Date.now() - start
			if (err instanceof RefreshFailedError && err.httpStatus === 401) {
				this.logger.warn?.('[xai-credentials] refresh 401', {durationMs: duration})
				this.emit('token-expired')
				this.emit('disconnected')
				throw err
			}
			this.logger.error?.('[xai-credentials] refresh failed', {
				durationMs: duration,
				message: (err as Error).message,
			})
			throw err
		}
	}

	// ─── Internal: file IO ────────────────────────────────────────────────────

	private async readAuthJson(): Promise<AuthJsonShape> {
		let raw: string
		try {
			raw = await fs.readFile(this.authJsonPath, 'utf8')
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				return {}
			}
			throw err
		}
		try {
			const parsed = JSON.parse(raw)
			if (!parsed || typeof parsed !== 'object') {
				throw new AuthJsonCorruptError(
					`auth.json is not an object (got: ${typeof parsed})`,
				)
			}
			return parsed as AuthJsonShape
		} catch (err) {
			if (err instanceof AuthJsonCorruptError) throw err
			throw new AuthJsonCorruptError(
				`auth.json JSON parse failed: ${(err as Error).message}`,
			)
		}
	}

	/**
	 * Atomic write via PID-suffixed temp file + rename (T-195-02-02).
	 * The temp file lives in the same directory as the target so the rename
	 * stays on the same filesystem (POSIX atomic guarantee).
	 */
	private async writeAuthJsonAtomic(data: AuthJsonShape): Promise<void> {
		// PID-suffixed temp path — T-195-02-02 race mitigation.
		const tmpPath = this.authJsonPath + '.tmp.' + process.pid
		const dir = path.dirname(this.authJsonPath)
		// Ensure parent dir exists (first-time write path).
		await fs.mkdir(dir, {recursive: true})
		const json = JSON.stringify(data, null, 2)
		await fs.writeFile(tmpPath, json, {mode: 0o600})
		await fs.rename(tmpPath, this.authJsonPath)
	}

	// ─── Type-narrowed event helpers ─────────────────────────────────────────
	// EventEmitter's untyped on/off make consumers liable to typos.
	// These overloads document the supported event names.

	override on(event: XaiCredentialsEvent, cb: () => void): this
	override on(event: string | symbol, cb: (...args: unknown[]) => void): this
	override on(event: string | symbol, cb: (...args: unknown[]) => void): this {
		return super.on(event, cb)
	}

	override off(event: XaiCredentialsEvent, cb: () => void): this
	override off(event: string | symbol, cb: (...args: unknown[]) => void): this
	override off(event: string | symbol, cb: (...args: unknown[]) => void): this {
		return super.off(event, cb)
	}
}
