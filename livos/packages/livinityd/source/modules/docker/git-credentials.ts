import {getPool} from '../database/index.js'
import {decrypt, encrypt, getKey, getLegacyKey} from '../secrets/dek.js'

/**
 * Git credentials store (Phase 21 GIT-01).
 *
 * AES-256-GCM at-rest encryption. Plaintext credentials are NEVER persisted to
 * disk. The encrypted_data column holds the base64(iv12 + tag16 + ciphertext)
 * blob.
 *
 * LIVOS-052 (Phase 262-05): the at-rest key now comes from the SHARED
 * credential DEK module (`../secrets/dek.js` → `/opt/livos/data/secrets/
 * credential-dek`), INDEPENDENT of the JWT signing secret. Previously the key
 * was `sha256(JWT secret)`. Legacy JWT-keyed blobs still decrypt via the
 * getLegacyKey() lazy re-key fallback on the read path (LIVOS-052b — a
 * JWT-secret rotation does not brick stored credentials).
 *
 * Plain payload shapes (JSON, before encryption):
 *   type='https' -> {"username": "...", "password": "..."}   (PAT goes in password)
 *   type='ssh'   -> {"privateKey": "<PEM>"}                  (full PEM-formatted key)
 */

export type GitCredentialType = 'ssh' | 'https'

// Plain payload shapes (JSON, before encryption):
export type HttpsCredentialData = {username: string; password: string} // PAT in password
export type SshCredentialData = {privateKey: string} // PEM-formatted SSH key
export type GitCredentialData = HttpsCredentialData | SshCredentialData

export interface GitCredentialRow {
	id: string
	userId: string | null
	name: string
	type: GitCredentialType
	createdAt: Date
}

const SELECT_COLS = 'id, user_id, name, type, created_at'

/**
 * List all credentials visible to a user (their own + globals where user_id IS NULL).
 * encrypted_data is intentionally NEVER returned by this API.
 */
export async function listCredentials(userId: string | null): Promise<GitCredentialRow[]> {
	const pool = getPool()
	if (!pool) return []
	let result
	if (userId) {
		result = await pool.query(
			`SELECT ${SELECT_COLS} FROM git_credentials WHERE user_id = $1 OR user_id IS NULL ORDER BY name ASC`,
			[userId],
		)
	} else {
		result = await pool.query(
			`SELECT ${SELECT_COLS} FROM git_credentials WHERE user_id IS NULL ORDER BY name ASC`,
		)
	}
	return result.rows.map((r: any) => ({
		id: r.id,
		userId: r.user_id,
		name: r.name,
		type: r.type,
		createdAt: r.created_at,
	}))
}

/**
 * Get a single credential's metadata (no encrypted_data).
 */
export async function getCredential(id: string): Promise<GitCredentialRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(`SELECT ${SELECT_COLS} FROM git_credentials WHERE id = $1`, [id])
	if (rows.length === 0) return null
	const r = rows[0]
	return {id: r.id, userId: r.user_id, name: r.name, type: r.type, createdAt: r.created_at}
}

/**
 * Encrypt + persist a new credential. Returns the metadata row (no encrypted_data).
 */
export async function createCredential(input: {
	userId: string | null
	name: string
	type: GitCredentialType
	data: GitCredentialData
}): Promise<GitCredentialRow> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	const key = await getKey()
	const encrypted = encrypt(JSON.stringify(input.data), key)
	const {rows} = await pool.query(
		`INSERT INTO git_credentials (user_id, name, type, encrypted_data)
		 VALUES ($1, $2, $3, $4) RETURNING ${SELECT_COLS}`,
		[input.userId, input.name, input.type, encrypted],
	)
	const r = rows[0]
	return {id: r.id, userId: r.user_id, name: r.name, type: r.type, createdAt: r.created_at}
}

/**
 * Delete a credential by id. Returns true on success, false if not found.
 */
export async function deleteCredential(id: string): Promise<boolean> {
	const pool = getPool()
	if (!pool) return false
	const result = await pool.query(`DELETE FROM git_credentials WHERE id = $1`, [id])
	return (result.rowCount ?? 0) > 0
}

/**
 * INTERNAL ONLY — never expose encrypted_data via API. Used by git-deploy.ts to
 * derive runtime auth (GIT_ASKPASS env or temp SSH key file).
 */
export async function decryptCredentialData(
	id: string,
): Promise<{type: GitCredentialType; data: GitCredentialData} | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT type, encrypted_data FROM git_credentials WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	const key = await getKey()
	const blob = rows[0].encrypted_data
	let plaintext: string
	try {
		plaintext = decrypt(blob, key)
	} catch (err) {
		// LIVOS-052 lazy re-key: the blob may have been written with the legacy
		// JWT-derived key. Retry once with the legacy key; on success, re-encrypt
		// with the DEK and persist so the row migrates to the new key.
		const legacy = await getLegacyKey()
		if (!legacy) throw err
		plaintext = decrypt(blob, legacy) // throws if legacy also fails (genuine tamper)
		try {
			const reEncrypted = encrypt(plaintext, key)
			await pool.query(`UPDATE git_credentials SET encrypted_data = $1 WHERE id = $2`, [
				reEncrypted,
				id,
			])
		} catch {
			// Re-key persistence failure is non-fatal — the decrypt already
			// succeeded; the row stays on the legacy key and re-migrates next read.
		}
	}
	return {type: rows[0].type, data: JSON.parse(plaintext) as GitCredentialData}
}
