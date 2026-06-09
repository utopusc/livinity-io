// Phase 20 — Backup destination credential vault
//
// Per-jobId encrypted credential store. Mirrors docker/stack-secrets.ts:
//   - AES-256-GCM encryption keyed by the SHARED credential DEK
//     (`../secrets/dek.js` → `/opt/livos/data/secrets/credential-dek`),
//     INDEPENDENT of the JWT signing secret (LIVOS-052, Phase 262-05).
//     Legacy sha256(jwt)-keyed blobs still decrypt via the getLegacyKey()
//     lazy re-key fallback on the read path (LIVOS-052b).
//   - Storage in Redis hash at `liv:scheduler:backup-creds:{jobId}`
//     -> {field -> base64(iv(12) || tag(16) || ciphertext)}
//   - NEVER persisted to disk and NEVER written into scheduled_jobs.config_json
//
// Field names are credential keys (e.g. `secretAccessKey` for S3,
// `password` / `privateKey` / `passphrase` for SFTP). The non-sensitive
// portions of the destination config (region, bucket, host, etc.) live in
// scheduled_jobs.config_json — only the secrets pass through this vault.

import {Redis} from 'ioredis'

import {decrypt, encrypt, getKey, getLegacyKey} from '../secrets/dek.js'

const REDIS_KEY = (jobId: string) => `liv:scheduler:backup-creds:${jobId}`

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
				try {
					out[field] = decrypt(blob, k)
				} catch (err) {
					// LIVOS-052 lazy re-key: the field may have been written with the
					// legacy JWT-derived key. Retry with the legacy key; on success,
					// re-encrypt with the DEK and persist the hash field.
					const legacy = await getLegacyKey()
					if (!legacy) throw err
					const plaintext = decrypt(blob, legacy) // throws if legacy also fails
					out[field] = plaintext
					try {
						await redis.hset(REDIS_KEY(jobId), field, encrypt(plaintext, k))
					} catch {
						// Re-key persistence failure is non-fatal — the decrypt already
						// succeeded; the field re-migrates on the next read.
					}
				}
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
