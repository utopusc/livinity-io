import {Redis} from 'ioredis'

import {decrypt, encrypt, getKey, getLegacyKey} from '../secrets/dek.js'

/**
 * Encrypted stack secret store (QW-02).
 *
 * Secrets are:
 *  - encrypted with AES-256-GCM using the SHARED credential DEK
 *    (`../secrets/dek.js` → `/opt/livos/data/secrets/credential-dek`),
 *    INDEPENDENT of the JWT signing secret (LIVOS-052, Phase 262-05).
 *    Legacy sha256(jwt)-keyed blobs still decrypt via the getLegacyKey()
 *    lazy re-key fallback on the read path (LIVOS-052b).
 *  - stored in Redis under `liv:stack:secrets:{stackName}` as a hash
 *    `{key -> base64(iv || tag || ciphertext)}`
 *  - NEVER written to `/opt/livos/data/stacks/<name>/.env` on disk
 *
 * Docker compose interpolates them via `execa`'s `env` option at `up` time
 * (see stacks.ts), so the container process sees them as normal shell env vars
 * even though they are not persisted in plaintext anywhere on disk.
 */

// Redis key layout: nexus:stack:secrets:{stackName}  ->  hash {key -> base64(iv+tag+ciphertext)}
const REDIS_KEY = (stack: string) => `liv:stack:secrets:${stack}`

export function createStackSecretStore(redis: Redis) {
	return {
		async setSecret(stackName: string, key: string, value: string): Promise<void> {
			const k = await getKey()
			await redis.hset(REDIS_KEY(stackName), key, encrypt(value, k))
		},
		async deleteSecret(stackName: string, key: string): Promise<void> {
			await redis.hdel(REDIS_KEY(stackName), key)
		},
		async deleteAll(stackName: string): Promise<void> {
			await redis.del(REDIS_KEY(stackName))
		},
		async listSecretKeys(stackName: string): Promise<string[]> {
			return redis.hkeys(REDIS_KEY(stackName))
		},
		async getSecrets(stackName: string): Promise<Record<string, string>> {
			const raw = await redis.hgetall(REDIS_KEY(stackName))
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
						await redis.hset(REDIS_KEY(stackName), key, encrypt(plaintext, k))
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

export type StackSecretStore = ReturnType<typeof createStackSecretStore>
