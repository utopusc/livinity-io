import crypto from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

/**
 * Shared credential DEK module (Phase 262-05, LIVOS-052 / LIVOS-052b).
 *
 * Extracted from the Phase 257-05 registry-credentials.ts pattern so EVERY
 * credential store (git-credentials.ts, stack-secrets.ts, backup-secrets.ts —
 * and, by shape, registry-credentials.ts) derives its at-rest AES-256-GCM key
 * from the SAME dedicated key file:
 *
 *   /opt/livos/data/secrets/credential-dek  (32 random bytes, mode 0600)
 *
 * INDEPENDENT of the JWT signing secret. A leak of `/opt/livos/data/secrets/jwt`
 * no longer doubles as a universal decryptor for stored git PATs / SSH keys,
 * stack env secrets, or backup S3/SFTP credentials.
 *
 * Migration safety (LIVOS-052b): `getLegacyKey()` = sha256(trim(jwt)) is kept
 * ONLY as a decrypt fallback for blobs written before the DEK cutover. Stores
 * try the DEK first, fall back to the legacy key on a GCM auth-tag failure,
 * then lazily re-encrypt with the DEK and persist. A JWT-secret rotation is
 * therefore non-destructive for already-migrated rows, and pre-cutover rows
 * migrate transparently on first read. The legacy key is NEVER used to encrypt.
 *
 * Blob codec (byte-identical across all four stores):
 *   base64( iv(12) || gcmTag(16) || ciphertext )
 */

const JWT_SECRET_PATH = '/opt/livos/data/secrets/jwt'
const CREDENTIAL_DEK_PATH = '/opt/livos/data/secrets/credential-dek'

// Injectable fs + path config so unit tests run fully offline.
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
export async function getKey(): Promise<Buffer> {
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
 * LIVOS-052b migration: the legacy at-rest key = sha256(JWT secret). Only used
 * as a decrypt fallback for blobs written before the DEK cutover. Never used to
 * encrypt new data.
 */
export async function getLegacyKey(): Promise<Buffer | null> {
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

export function encrypt(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
	const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(blob: string, key: Buffer): string {
	const buf = Buffer.from(blob, 'base64')
	const iv = buf.subarray(0, 12)
	const tag = buf.subarray(12, 28)
	const ct = buf.subarray(28)
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8')
}
