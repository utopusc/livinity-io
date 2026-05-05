import crypto from 'node:crypto'
import {readFile} from 'node:fs/promises'

import {Redis} from 'ioredis'

/**
 * Encrypted stack secret store (QW-02).
 *
 * Secrets are:
 *  - encrypted with AES-256-GCM using a key derived from the daemon's JWT secret
 *    (SHA-256 of `/opt/livos/data/secrets/jwt`)
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

const JWT_SECRET_PATH = '/opt/livos/data/secrets/jwt'

let _key: Buffer | null = null

async function getKey(): Promise<Buffer> {
	if (_key) return _key
	// JWT secret lives at /opt/livos/data/secrets/jwt (per CLAUDE.md memory)
	const jwt = await readFile(JWT_SECRET_PATH, 'utf-8')
	_key = crypto.createHash('sha256').update(jwt.trim()).digest() // 32 bytes for AES-256
	return _key
}

function encrypt(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
	const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, tag, ct]).toString('base64')
}

function decrypt(blob: string, key: Buffer): string {
	const buf = Buffer.from(blob, 'base64')
	const iv = buf.subarray(0, 12)
	const tag = buf.subarray(12, 28)
	const ct = buf.subarray(28)
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8')
}

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
			for (const [key, blob] of Object.entries(raw)) out[key] = decrypt(blob, k)
			return out
		},
	}
}

export type StackSecretStore = ReturnType<typeof createStackSecretStore>
