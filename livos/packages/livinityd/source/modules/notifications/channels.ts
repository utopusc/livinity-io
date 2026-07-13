// Phase 310-02 (ALERT-01, ALERT-03) — NotificationChannels daemon module.
//
// Wires the Plan 01 primitives into the running daemon:
//   - config CRUD (non-secret) persisted in the FileStore under `alerts.channels`
//   - secrets (webhook URL / ntfy token) persisted in the DEK-encrypted Redis
//     vault (channel-secrets.ts) — NEVER in the FileStore, NEVER returned by
//     list(), NEVER logged
//   - a live Dispatcher (dispatch.ts) owning the two-layer coalescing / resend
//     floor state machine, with the floor persisted to the FileStore under
//     `alerts.dispatchFloor`
//
// Exposed to the tRPC layer as `ctx.livinityd.notificationChannels` and consumed
// by Notifications.add() (external-dispatch choke point). Construction is
// side-effect-free (lazy Redis, no `.start()`), so it is safe to instantiate in
// the Livinityd constructor before ai.start().

import {randomUUID} from 'node:crypto'

import {Redis} from 'ioredis'

import type Livinityd from '../../index.js'
import {
	type AlertSeverity,
	type NotificationChannel,
	type NotificationChannelKind,
	CHANNELS_STORE_KEY,
	DISPATCH_FLOOR_STORE_KEY,
} from './channel-types.js'
import {createChannelSecretStore, type ChannelSecretStore} from './channel-secrets.js'
import {Dispatcher} from './dispatch.js'
import {assertResolvedHostSafe} from './ssrf-guard.js'

// Lazy own-Redis singleton — mirrors docker/ai-diagnostics.ts getRedis() so this
// module is decoupled from the shared daemon Redis client's boot-order
// (RESEARCH §4 — do NOT reach into livinityd's ai module at construction time).
// Constructing NotificationChannels never opens a connection; the first secret
// read/write does.
let _redis: Redis | null = null
function getRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

export interface UpsertChannelInput {
	id?: string
	kind: NotificationChannelKind
	target: string
	secret?: string
	enabled: boolean
	severityFilter: AlertSeverity[]
}

// The ONLY shape list() returns — the raw secret is never included.
export interface ChannelListItem {
	id: string
	kind: NotificationChannelKind
	target: string
	enabled: boolean
	severityFilter: AlertSeverity[]
	hasSecret: boolean
}

export default class NotificationChannels {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	#secrets: ChannelSecretStore
	#dispatcher: Dispatcher

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		this.logger = livinityd.logger.createChildLogger('notificationchannels')
		this.#secrets = createChannelSecretStore(getRedis())
		this.#dispatcher = new Dispatcher({
			getChannels: async () =>
				((await this.#livinityd.store.get(CHANNELS_STORE_KEY)) as NotificationChannel[]) || [],
			getSecret: async (id, field) => (await this.#secrets.getSecrets(id))[field],
			floorStore: {
				load: async () =>
					((await this.#livinityd.store.get(DISPATCH_FLOOR_STORE_KEY)) as Record<
						string,
						number
					>) || {},
				save: async (r) =>
					this.#livinityd.store.getWriteLock(async ({set}) => {
						await set(DISPATCH_FLOOR_STORE_KEY, r)
					}),
			},
			// Thin adapter: the livinityd logger's log/error are narrower than the
			// Dispatcher's `(...a: unknown[]) => void` deps type, so we bridge here.
			// The Dispatcher never interpolates a secret into a log line (verified in
			// dispatch.ts), so nothing sensitive flows through this adapter.
			logger: {
				log: (...a: unknown[]) => this.logger.log(a.map((x) => String(x)).join(' ')),
				error: (...a: unknown[]) => this.logger.error(String(a[0] ?? ''), a[1]),
			},
		})
	}

	/**
	 * List configured channels for the admin UI. Returns ONLY the safe subset —
	 * the raw secret value (webhook URL / ntfy token) is NEVER included; callers
	 * see `hasSecret: boolean` instead.
	 */
	async list(): Promise<ChannelListItem[]> {
		const channels =
			((await this.#livinityd.store.get(CHANNELS_STORE_KEY)) as NotificationChannel[]) || []
		const out: ChannelListItem[] = []
		for (const c of channels) {
			const hasSecret =
				c.kind === 'webhook' || c.kind === 'ntfy'
					? Object.keys(await this.#secrets.getSecrets(c.id)).length > 0
					: false
			out.push({
				id: c.id,
				kind: c.kind,
				target: c.target,
				enabled: c.enabled,
				severityFilter: c.severityFilter,
				hasSecret,
			})
		}
		return out
	}

	/**
	 * Create or update a channel. For webhook/ntfy the target URL is validated
	 * with new URL() + assertResolvedHostSafe() at CONFIG time (reject
	 * private/internal addresses before they can ever become a fetch() target —
	 * defense-in-depth with the dispatch-time guard). The non-secret record is
	 * persisted to the FileStore; the secret (if any) goes to the DEK vault.
	 */
	async upsert(input: UpsertChannelInput): Promise<{id: string}> {
		const id = input.id ?? randomUUID()

		if (input.kind === 'webhook') {
			// For a webhook the `secret` IS the delivery URL.
			if (!input.secret) throw new Error('[alert-config] webhook requires a URL')
			try {
				// eslint-disable-next-line no-new
				new URL(input.secret)
			} catch {
				throw new Error('[alert-config] webhook URL is not a valid URL')
			}
			await assertResolvedHostSafe(input.secret) // throws 'SSRF blocked: ...'
		}
		if (input.kind === 'ntfy') {
			try {
				// eslint-disable-next-line no-new
				new URL(input.target)
			} catch {
				throw new Error('[alert-config] ntfy target is not a valid URL')
			}
			await assertResolvedHostSafe(input.target)
		}

		const record: NotificationChannel = {
			id,
			kind: input.kind,
			target: input.target,
			enabled: input.enabled,
			severityFilter: input.severityFilter,
		}

		// Upsert the NON-secret record into the FileStore (by id).
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const existing = ((await get(CHANNELS_STORE_KEY)) as NotificationChannel[]) || []
			const next = existing.filter((c) => c.id !== id)
			next.push(record)
			await set(CHANNELS_STORE_KEY, next)
		})

		// Persist the secret in the DEK vault. Messenger (`liv:*`) kinds ignore
		// `secret` entirely — Liv owns those bot tokens (out of scope, RESEARCH §2).
		if (input.secret) {
			if (input.kind === 'webhook') await this.#secrets.setSecret(id, 'webhookUrl', input.secret)
			else if (input.kind === 'ntfy') await this.#secrets.setSecret(id, 'ntfyToken', input.secret)
		}

		return {id}
	}

	/** Remove a channel record from the FileStore and purge its vaulted secrets. */
	async delete(id: string): Promise<{ok: true}> {
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const existing = ((await get(CHANNELS_STORE_KEY)) as NotificationChannel[]) || []
			await set(
				CHANNELS_STORE_KEY,
				existing.filter((c) => c.id !== id),
			)
		})
		await this.#secrets.deleteAll(id)
		return {ok: true}
	}

	/** Immediate test send for a single channel (bypasses coalescing/floor). */
	async test(id: string): Promise<{ok: boolean; error?: string}> {
		return this.#dispatcher.sendTestToChannel(id)
	}

	/**
	 * Fan an alert out through the Dispatcher. Called by Notifications.add() when
	 * `external: true` is passed — the single external-dispatch choke point.
	 */
	async dispatch(notificationId: string, severity: AlertSeverity): Promise<void> {
		return this.#dispatcher.dispatch(notificationId, severity)
	}
}
