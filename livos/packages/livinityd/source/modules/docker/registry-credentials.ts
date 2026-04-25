import crypto from 'node:crypto'
import {readFile} from 'node:fs/promises'

import {getPool} from '../database/index.js'

/**
 * Registry credentials store (Phase 29 DOC-16).
 *
 * Mirrors the AES-256-GCM-with-JWT-key pattern from git-credentials.ts /
 * stack-secrets.ts. Plaintext passwords/tokens are NEVER persisted to disk.
 * The encrypted_data column holds the base64(iv12 + tag16 + ciphertext) blob;
 * decryption is gated by access to /opt/livos/data/secrets/jwt.
 *
 * Plain payload shape (JSON, before encryption):
 *   {"password": "..."}
 *
 * Username and registry_url are non-secret and stored as plain columns so the
 * UI can display them without round-tripping through decrypt.
 */

const JWT_SECRET_PATH = '/opt/livos/data/secrets/jwt'

let _key: Buffer | null = null

async function getKey(): Promise<Buffer> {
	if (_key) return _key
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

// Test-only exports — not part of the public API surface; consumed by the
// unit tests for encrypt/decrypt round-trip + tamper-detection assertions.
export const _getKeyForTests = getKey
export const _encryptForTests = encrypt
export const _decryptForTests = decrypt

export interface RegistryCredentialRow {
	id: string
	userId: string | null
	name: string
	registryUrl: string
	username: string
	createdAt: Date
}

const SELECT_COLS = 'id, user_id, name, registry_url, username, created_at'

/**
 * List all credentials visible to a user (their own + globals where user_id IS NULL).
 * encrypted_data is intentionally NEVER returned by this API.
 */
export async function listCredentials(userId: string | null): Promise<RegistryCredentialRow[]> {
	const pool = getPool()
	if (!pool) return []
	let result
	if (userId) {
		result = await pool.query(
			`SELECT ${SELECT_COLS} FROM registry_credentials WHERE user_id = $1 OR user_id IS NULL ORDER BY name ASC`,
			[userId],
		)
	} else {
		result = await pool.query(
			`SELECT ${SELECT_COLS} FROM registry_credentials WHERE user_id IS NULL ORDER BY name ASC`,
		)
	}
	return result.rows.map((r: any) => ({
		id: r.id,
		userId: r.user_id,
		name: r.name,
		registryUrl: r.registry_url,
		username: r.username,
		createdAt: r.created_at,
	}))
}

/**
 * Get a single credential's metadata (no encrypted_data).
 */
export async function getCredential(id: string): Promise<RegistryCredentialRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM registry_credentials WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	const r = rows[0]
	return {
		id: r.id,
		userId: r.user_id,
		name: r.name,
		registryUrl: r.registry_url,
		username: r.username,
		createdAt: r.created_at,
	}
}

/**
 * Encrypt + persist a new credential. Returns the metadata row (no encrypted_data).
 */
export async function createCredential(input: {
	userId: string | null
	name: string
	registryUrl: string
	username: string
	password: string
}): Promise<RegistryCredentialRow> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	const key = await getKey()
	const encrypted = encrypt(JSON.stringify({password: input.password}), key)
	const {rows} = await pool.query(
		`INSERT INTO registry_credentials (user_id, name, registry_url, username, encrypted_data)
		 VALUES ($1, $2, $3, $4, $5) RETURNING ${SELECT_COLS}`,
		[input.userId, input.name, input.registryUrl, input.username, encrypted],
	)
	const r = rows[0]
	return {
		id: r.id,
		userId: r.user_id,
		name: r.name,
		registryUrl: r.registry_url,
		username: r.username,
		createdAt: r.created_at,
	}
}

/**
 * Delete a credential by id. Returns true on success, false if not found.
 */
export async function deleteCredential(id: string): Promise<boolean> {
	const pool = getPool()
	if (!pool) return false
	const result = await pool.query(`DELETE FROM registry_credentials WHERE id = $1`, [id])
	return (result.rowCount ?? 0) > 0
}

/**
 * INTERNAL ONLY — never expose encrypted_data via API. Used by registry-search.ts
 * (basic-auth header) and docker.ts pullImage (dockerode authconfig).
 *
 * Returns the convenient combined object: username + registryUrl from the
 * row + the decrypted password from the blob.
 */
export async function decryptCredentialData(
	id: string,
): Promise<{username: string; registryUrl: string; password: string} | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT username, registry_url, encrypted_data FROM registry_credentials WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	const key = await getKey()
	const plaintext = decrypt(rows[0].encrypted_data, key)
	const parsed = JSON.parse(plaintext) as {password: string}
	return {
		username: rows[0].username,
		registryUrl: rows[0].registry_url,
		password: parsed.password,
	}
}
