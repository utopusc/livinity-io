// Phase 20 — Backup destination credential vault
//
// Per-jobId encrypted credential store. Mirrors docker/stack-secrets.ts:
//   - AES-256-GCM encryption with key = sha256(JWT_SECRET file contents)
//   - Storage in Redis hash at `nexus:scheduler:backup-creds:{jobId}`
//     -> {field -> base64(iv(12) || tag(16) || ciphertext)}
//   - NEVER persisted to disk and NEVER written into scheduled_jobs.config_json
//
// Field names are credential keys (e.g. `secretAccessKey` for S3,
// `password` / `privateKey` / `passphrase` for SFTP). The non-sensitive
// portions of the destination config (region, bucket, host, etc.) live in
// scheduled_jobs.config_json — only the secrets pass through this vault.

import crypto from 'node:crypto'
import {readFile} from 'node:fs/promises'

import {Redis} from 'ioredis'

const REDIS_KEY = (jobId: string) => `nexus:scheduler:backup-creds:${jobId}`

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

export function createBackupSecretStore(redis: Redis) {
	return {
		/**
		 * Atomic full-replace: delete the existing hash, then write all current creds.
		 * (Number of fields is tiny — at most ~3 — so del+hset round-trip is fine.)
		 * If `creds` is empty, the hash is simply deleted.
		 */
		async setCreds(jobId: string, creds: Record<string, string>): Promise<void> {
			const k = await getKey()
			const encrypted: Record<string, string> = {}
			for (const [field, value] of Object.entries(creds)) {
				if (value === undefined || value === null || value === '') continue
				encrypted[field] = encrypt(value, k)
			}
			await redis.del(REDIS_KEY(jobId))
			if (Object.keys(encrypted).length > 0) {
				await redis.hset(REDIS_KEY(jobId), encrypted)
			}
		},

		async getCreds(jobId: string): Promise<Record<string, string>> {
			const raw = await redis.hgetall(REDIS_KEY(jobId))
			if (Object.keys(raw).length === 0) return {}
			const k = await getKey()
			const out: Record<string, string> = {}
			for (const [field, blob] of Object.entries(raw)) {
				out[field] = decrypt(blob, k)
			}
			return out
		},

		/**
		 * Cascade-delete on deleteJob — wipes the entire hash for the job.
		 */
		async deleteAll(jobId: string): Promise<void> {
			await redis.del(REDIS_KEY(jobId))
		},
	}
}

export type BackupSecretStore = ReturnType<typeof createBackupSecretStore>

// Lazily-initialised singleton so we don't connect to Redis at import time
// (matches docker/stacks.ts pattern).
let _store: BackupSecretStore | null = null

export function getBackupSecretStore(): BackupSecretStore {
	if (!_store) {
		const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
		_store = createBackupSecretStore(redis)
	}
	return _store
}
