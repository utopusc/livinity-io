import crypto from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {getPool} from '../database/index.js'

/**
 * Registry credentials store (Phase 29 DOC-16).
 *
 * AES-256-GCM at-rest encryption. Plaintext passwords/tokens are NEVER
 * persisted to disk. The encrypted_data column holds the
 * base64(iv12 + tag16 + ciphertext) blob.
 *
 * LIVOS-033 (Phase 257-05): the at-rest data-encryption key (DEK) is now
 * derived from a DEDICATED key file (`/opt/livos/data/secrets/credential-dek`,
 * 32 random bytes, mode 0600), INDEPENDENT of the JWT signing secret. Previously
 * the key was `sha256(JWT secret)`, which coupled auth-token forgery and
 * at-rest-credential decryption into a single secret. A leak of the JWT secret
 * no longer also decrypts stored registry/git/stack credentials.
 *
 * Migration safety (lazy re-key): blobs written with the OLD JWT-derived key
 * still decrypt — `decryptCredentialData` falls back to the legacy key on a
 * GCM auth-tag failure, then re-encrypts the row with the DEK and persists it.
 * Existing vault entries are not bricked during the grace window.
 *
 * Plain payload shape (JSON, before encryption):
 *   {"password": "..."}
 *
 * Username and registry_url are non-secret and stored as plain columns so the
 * UI can display them without round-tripping through decrypt.
 */

const JWT_SECRET_PATH = '/opt/livos/data/secrets/jwt'
const CREDENTIAL_DEK_PATH = '/opt/livos/data/secrets/credential-dek'

// Injectable fs + path config so the unit test runs fully offline.
type FsDeps = {
	readFile: (p: string, enc: BufferEncoding) => Promise<string>
	readFileRaw: (p: string) => Promise<Buffer>
	writeFile: (p: string, data: Buffer, opts: {mode: number}) => Promise<void>
	mkdir: (p: string, opts: {recursive: boolean}) => Promise<unknown>
	randomBytes: (n: number) => Buffer
	dekPath: string
	jwtPath: string
}

const realFsDeps: FsDeps = {
	readFile: (p, enc) => readFile(p, enc),
	readFileRaw: (p) => readFile(p),
	writeFile: (p, data, opts) => writeFile(p, data, opts),
	mkdir: (p, opts) => mkdir(p, opts),
	randomBytes: (n) => crypto.randomBytes(n),
	dekPath: CREDENTIAL_DEK_PATH,
	jwtPath: JWT_SECRET_PATH,
}

let _fsDeps: FsDeps = realFsDeps

let _key: Buffer | null = null
let _legacyKey: Buffer | null = null

/**
 * Derive the at-rest DEK from a dedicated 32-byte key file, generating it
 * (mode 0600) on first use if absent. Independent of the JWT signing secret.
 */
async function getKey(): Promise<Buffer> {
	if (_key) return _key
	const d = _fsDeps
	try {
		const raw = await d.readFileRaw(d.dekPath)
		if (raw.length >= 32) {
			_key = raw.subarray(0, 32)
			return _key
		}
		// File exists but is too short — treat as corrupt and regenerate below.
	} catch {
		// ENOENT (or unreadable) — generate a fresh DEK.
	}
	const fresh = d.randomBytes(32)
	try {
		await d.mkdir(dirname(d.dekPath), {recursive: true})
		await d.writeFile(d.dekPath, fresh, {mode: 0o600})
	} catch {
		// If persistence fails we still proceed in-memory; the next process start
		// will retry. (Round-trips within this process remain consistent.)
	}
	_key = fresh
	return _key
}

/**
 * LIVOS-033 migration: the legacy at-rest key = sha256(JWT secret). Only used as
 * a decrypt fallback for blobs written before the DEK cutover. Never used to
 * encrypt new data.
 */
async function getLegacyKey(): Promise<Buffer | null> {
	if (_legacyKey) return _legacyKey
	try {
		const jwt = await _fsDeps.readFile(_fsDeps.jwtPath, 'utf-8')
		_legacyKey = crypto.createHash('sha256').update(jwt.trim()).digest()
		return _legacyKey
	} catch {
		return null
	}
}

// Test-only injection hook: override the fs deps + reset the cached keys.
export function _setKeyProvidersForTests(overrides: Partial<FsDeps> | null): void {
	_fsDeps = overrides ? {...realFsDeps, ...overrides} : realFsDeps
	_key = null
	_legacyKey = null
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
	const blob = rows[0].encrypted_data
	let plaintext: string
	try {
		plaintext = decrypt(blob, key)
	} catch (err) {
		// LIVOS-033 lazy re-key: the blob may have been written with the legacy
		// JWT-derived key. Retry once with the legacy key; on success, re-encrypt
		// with the DEK and persist so the row migrates to the new key.
		const legacy = await getLegacyKey()
		if (!legacy) throw err
		plaintext = decrypt(blob, legacy) // throws if legacy also fails (genuine tamper)
		try {
			const reEncrypted = encrypt(plaintext, key)
			await pool.query(`UPDATE registry_credentials SET encrypted_data = $1 WHERE id = $2`, [
				reEncrypted,
				id,
			])
		} catch {
			// Re-key persistence failure is non-fatal — the decrypt already
			// succeeded; the row stays on the legacy key and re-migrates next read.
		}
	}
	const parsed = JSON.parse(plaintext) as {password: string}
	return {
		username: rows[0].username,
		registryUrl: rows[0].registry_url,
		password: parsed.password,
	}
}
