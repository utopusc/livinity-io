/**
 * Livinity Broker — backend module.
 *
 * v37 reference plugin that ports the existing livinityd broker
 * (livos/packages/livinityd/source/modules/livinity-broker/) into the
 * plugin runtime. Mounts under /p/livinity-broker/* on the user's
 * subdomain.
 *
 * In v37 the actual proxy implementation still lives in the livinityd
 * module — this plugin file is a *façade* that calls into it. v38
 * extracts the proxy fully into this plugin and removes the in-process
 * fork from livinityd.
 *
 * Storage:
 *   - api_keys: plugin_livinity_broker.api_keys (per-plugin Postgres
 *     schema; see migrations/0001_init.sql)
 *   - usage: plugin_livinity_broker.usage (token counts per key)
 *   - Redis: liv:plugin:livinity-broker:*  (rate limits, cache)
 *
 * Auth:
 *   - X-Api-Key header on every request → matched against
 *     plugin_livinity_broker.api_keys.hash via bcrypt
 *   - Rate-limit by api_key_id in Redis sliding window
 */

import {randomBytes, randomUUID} from 'crypto'

// Minimal SHA-256 fallback hash — the bundled plugin doesn't want
// bcrypt as a dependency. For the reference build we use SHA-256 +
// per-key salt; the production hash function moves to argon2 in v38
// once `@livinity/plugin-sdk` ships its crypto helpers.
import {createHash} from 'crypto'
function hashKey(key, salt) {
	return createHash('sha256').update(salt + ':' + key).digest('hex')
}

const KEY_PREFIX = 'lvb_'

// Captured at onActivate so the route handlers (invoked as `handler(req, res)`
// by plugin-loader.dispatchRequest — NO `api` arg) can reach `api.pg` / `api.log`.
let _api = null

// ─── Helpers ──────────────────────────────────────────────────────────────

async function findKeyByPlaintext(api, plaintext) {
	const {rows} = await api.pg.query(
		'SELECT id, name, hash, salt, revoked FROM plugin_livinity_broker.api_keys WHERE prefix = $1',
		[plaintext.slice(0, 10)],
	)
	for (const r of rows) {
		if (r.revoked) continue
		if (hashKey(plaintext, r.salt) === r.hash) return r
	}
	return null
}

async function recordUsage(api, keyId, model, inTokens, outTokens) {
	await api.pg.query(
		`INSERT INTO plugin_livinity_broker.usage
		   (id, api_key_id, model, in_tokens, out_tokens, at)
		 VALUES ($1, $2, $3, $4, $5, NOW())`,
		[randomUUID(), keyId, model, inTokens, outTokens],
	)
}

// ─── Backend module ───────────────────────────────────────────────────────

export default {
	async onActivate(api) {
		_api = api
		api.log.info('livinity-broker plugin activated')
		// Pre-populate a rate-limit window so the first request doesn't
		// crash on a missing key.
		await api.redis.set('liv:plugin:livinity-broker:warmup', String(Date.now()))
	},

	async onDeactivate(api) {
		api.log.info('livinity-broker plugin deactivated')
	},

	handlers: {
		async anthropicMessages(req, res) {
			res.status(503).json({
				error: 'broker proxy proxies to livinityd in v37 — full plugin proxy ships in v38',
				hint: 'use bruce.livinity.io/v1/messages directly for now',
			})
		},

		async openaiChatCompletions(req, res) {
			res.status(503).json({
				error: 'broker proxy proxies to livinityd in v37 — full plugin proxy ships in v38',
				hint: 'use bruce.livinity.io/v1/chat/completions directly for now',
			})
		},

		async listKeys(req, res) {
			// Caller's identity comes from livinityd's session middleware
			// upstream — the plugin sees the user via req.headers
			// 'x-livinity-user-id' which livinityd injects after auth.
			const userId = req.headers['x-livinity-user-id']
			if (typeof userId !== 'string') {
				res.status(401).json({error: 'no user identity'})
				return
			}
			// TODO: query api_keys WHERE user_id = userId. Implementation
			// elided for the v37 scaffold — the table schema is in place
			// (migration 0001) but the actual query goes here.
			res.json({keys: []})
		},

		async createKey(req, res) {
			const userId = req.headers['x-livinity-user-id']
			if (typeof userId !== 'string') {
				res.status(401).json({error: 'no user identity'})
				return
			}
			const body = req.body && typeof req.body === 'object' ? req.body : {}
			const name = typeof body.name === 'string' ? body.name : 'untitled'
			// 256-02 SC4b: per-app metered virtual key — thread the per-app SCOPE
			// (budget + model allowlist) through so the key is genuinely metered,
			// not unscoped. The app slug is already encoded in `name`
			// (metered:app=<slug>:user=<uid>). Budget is { maxUsd } | undefined;
			// modelAllowlist is string[] | undefined.
			const budget =
				body.budget && typeof body.budget === 'object' ? body.budget : null
			const modelAllowlist = Array.isArray(body.modelAllowlist)
				? body.modelAllowlist.filter((m) => typeof m === 'string')
				: null
			const plaintext = KEY_PREFIX + randomBytes(24).toString('base64url')
			const salt = randomBytes(8).toString('hex')
			const hash = hashKey(plaintext, salt)
			const id = randomUUID()
			const prefix = plaintext.slice(0, 10)
			// Persist the key + its per-app scope. `scope` carries budget +
			// modelAllowlist (jsonb); the migration adds the column (0002).
			try {
				await _api.pg.query(
					`INSERT INTO plugin_livinity_broker.api_keys
					   (id, user_id, name, prefix, hash, salt, revoked, scope, created_at)
					 VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())`,
					[id, userId, name, prefix, hash, salt, JSON.stringify({budget, modelAllowlist})],
				)
			} catch (err) {
				_api?.log?.error?.(`createKey: failed to persist api_key ${id}: ${err?.message ?? err}`)
				res.status(500).json({error: 'failed to persist key'})
				return
			}
			res.status(201).json({
				id,
				name,
				prefix,
				plaintext,
				budget,
				modelAllowlist,
				note: 'store this somewhere safe — it will not be shown again',
			})
		},

		async deleteKey(req, res) {
			// 256-02 SC4b: per-app metered keys must be independently revocable.
			// Revoke by keyId (id param or body.keyId) — sets revoked=true so the
			// key stops authenticating immediately. Other apps' keys untouched.
			const keyId =
				(req.params && req.params.id) ||
				(req.body && typeof req.body === 'object' ? req.body.keyId : undefined)
			if (typeof keyId !== 'string' || !keyId) {
				res.status(400).json({error: 'keyId required'})
				return
			}
			try {
				await _api.pg.query(
					'UPDATE plugin_livinity_broker.api_keys SET revoked = true WHERE id = $1',
					[keyId],
				)
			} catch (err) {
				_api?.log?.error?.(`deleteKey: failed to revoke ${keyId}: ${err?.message ?? err}`)
				res.status(500).json({error: 'failed to revoke key'})
				return
			}
			res.json({ok: true, revoked: keyId})
		},
	},

	commands: {},
}
