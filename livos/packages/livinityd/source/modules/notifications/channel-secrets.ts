import {Redis} from 'ioredis'

import {decrypt, encrypt, getKey, getLegacyKey} from '../secrets/dek.js'

/**
 * Encrypted alert-channel secret store (Phase 310-01, ALERT-03).
 *
 * The only secret fields stored here are `webhookUrl` and `ntfyToken`. Liv-routed
 * channel bot tokens are NEVER stored here — Liv owns those in its own storage
 * (out of scope). Secrets are:
 *  - encrypted with AES-256-GCM using the SHARED credential DEK
 *    (`../secrets/dek.js` → `/opt/livos/data/secrets/credential-dek`),
 *    INDEPENDENT of the JWT signing secret (LIVOS-052, Phase 262-05).
 *    Legacy sha256(jwt)-keyed blobs still decrypt via the getLegacyKey() lazy
 *    re-key fallback on the read path (LIVOS-052b).
 *  - stored in Redis under `liv:notifications:channel-secrets:{channelId}` as a
 *    hash `{field -> base64(iv || tag || ciphertext)}`
 *  - NEVER written to the FileStore / plaintext config, NEVER logged, NEVER
 *    returned by the tRPC `.list()` route.
 *
 * Copy-adapted verbatim from `docker/stack-secrets.ts` — only the Redis key
 * layout + store name differ.
 */

// Redis key layout: liv:notifications:channel-secrets:{channelId}  ->  hash {field -> base64(iv+tag+ciphertext)}
const REDIS_KEY = (channelId: string) => `liv:notifications:channel-secrets:${channelId}`

export function createChannelSecretStore(redis: Redis) {
	return {
		async setSecret(channelId: string, key: string, value: string): Promise<void> {
			const k = await getKey()
			await redis.hset(REDIS_KEY(channelId), key, encrypt(value, k))
		},
		async deleteSecret(channelId: string, key: string): Promise<void> {
			await redis.hdel(REDIS_KEY(channelId), key)
		},
		async deleteAll(channelId: string): Promise<void> {
			await redis.del(REDIS_KEY(channelId))
		},
		async getSecrets(channelId: string): Promise<Record<string, string>> {
			const raw = await redis.hgetall(REDIS_KEY(channelId))
			const k = await getKey()
			const out: Record<string, string> = {}
			for (const [key, blob] of Object.entries(raw)) {
				try {
					out[key] = decrypt(blob, k)
				} catch (err) {
					// LIVOS-052 lazy re-key: the field may have been written with the
					// legacy JWT-derived key. Retry with the legacy key; on success,
					// re-encrypt with the DEK and persist the hash field.
					const legacy = await getLegacyKey()
					if (!legacy) throw err
					const plaintext = decrypt(blob, legacy) // throws if legacy also fails
					out[key] = plaintext
					try {
						await redis.hset(REDIS_KEY(channelId), key, encrypt(plaintext, k))
					} catch {
						// Re-key persistence failure is non-fatal — the decrypt already
						// succeeded; the field re-migrates on the next read.
					}
				}
			}
			return out
		},
	}
}

export type ChannelSecretStore = ReturnType<typeof createChannelSecretStore>
