/**
 * Phase 203-05 — openclaw device token mint/verify helper.
 *
 * D-203-12 / T-203-02 / INV-203-10 — Outer auth is the LIVINITY_SESSION JWT
 * cookie. The inner openclaw gateway expects its own short-lived device token
 * tied to the gateway keypair. This module owns the bridge:
 *
 *   - `mintToken(userId)` returns a base64url-encoded Ed25519-signed payload
 *     `{sub, iat, exp}` with `exp = iat + 300` (5-minute TTL per T-203-02).
 *     Additionally caches the token's jti → expiresAt in Redis with `EXPIRE 300`
 *     so the gateway's plugin-side verifier (Plan 203-06+) can confirm a token
 *     hasn't been pre-revoked.
 *
 *   - `verifyToken(token)` re-verifies the Ed25519 signature with the gateway
 *     public key, confirms `exp > now`, and (when Redis is supplied) confirms
 *     the jti is still cached. Returns `{userId}` on success or `null` on
 *     ANY failure (corrupt token, bad signature, expired, revoked, wrong key).
 *
 * Keypair persistence (per Task 1 spec):
 *   - Mini PC: /opt/livos/data/secrets/openclaw-ed25519
 *   - Dev / Windows fallback: <repoRoot>/livos/data/secrets/openclaw-ed25519
 *   - Generated on first call via Node's native `crypto.generateKeyPairSync('ed25519')`
 *     (zero new deps — Node ≥16). Persisted as PEM (private + public concatenated
 *     in one file, JSON-wrapped for forward-compat).
 *
 * Token format:
 *   base64url(JSON({alg:"EdDSA", v:1, sub, iat, exp, jti})) + "." + base64url(signatureBytes)
 *
 * This is a compact JWT-ish envelope but NOT a strict RFC-7519 JWT (no header).
 * The plugin-side verifier (Plan 203-06) calls verifyToken() directly over HTTP
 * RPC so the exact wire shape is internal to LivOS.
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW, not on the 20-file list).
 */

import {generateKeyPairSync, sign as edSign, verify as edVerify, randomBytes, KeyObject, createPrivateKey, createPublicKey} from 'node:crypto'
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs'
import path from 'node:path'
import type {Redis} from 'ioredis'

const TOKEN_TTL_SECONDS = 300 // 5 minutes — T-203-02
const REDIS_KEY_PREFIX = 'liv:openclaw:device-token:'

const MINIPC_SECRETS_PATH = '/opt/livos/data/secrets/openclaw-ed25519'
const DEV_FALLBACK_REL = 'livos/data/secrets/openclaw-ed25519'

export interface TokenPayload {
	alg: 'EdDSA'
	v: number
	sub: string
	iat: number
	exp: number
	jti: string
}

export interface MintResult {
	token: string
	expiresAt: number // unix-ms (NOT seconds) for client convenience
	jti: string
}

export interface VerifiedToken {
	userId: string
	jti: string
	exp: number
}

interface Keypair {
	privateKey: KeyObject
	publicKey: KeyObject
}

let cachedKeypair: Keypair | null = null

/**
 * Resolve the keypair file path. Prefer the Mini PC production path when it
 * exists OR its parent directory is writable; otherwise fall back to the
 * dev-side path under the repo root.
 */
function resolveKeypairPath(): string {
	// Honor explicit override (used by tests + override flows)
	const envOverride = process.env['OPENCLAW_KEYPAIR_PATH']
	if (envOverride) return envOverride

	// On Linux/Mini PC, prefer the canonical production path
	try {
		const parent = path.dirname(MINIPC_SECRETS_PATH)
		if (existsSync(parent)) return MINIPC_SECRETS_PATH
	} catch {
		// fall through
	}

	// Dev fallback — relative to cwd (repo root when livinityd is run from there)
	return path.resolve(process.cwd(), DEV_FALLBACK_REL)
}

/**
 * Load or generate the gateway Ed25519 keypair. Idempotent — once loaded the
 * keypair is cached in module scope for the process lifetime.
 *
 * File format: JSON `{ privateKeyPem, publicKeyPem, createdAt }` so we can
 * extend with key-rotation metadata later (Plan 203-06+).
 */
export function loadOrCreateKeypair(filePath?: string): Keypair {
	if (cachedKeypair && !filePath) return cachedKeypair

	const target = filePath ?? resolveKeypairPath()

	let parsed: {privateKeyPem: string; publicKeyPem: string; createdAt: number} | null = null
	if (existsSync(target)) {
		try {
			const raw = readFileSync(target, 'utf8')
			parsed = JSON.parse(raw)
		} catch {
			parsed = null
		}
	}

	let keypair: Keypair
	if (parsed?.privateKeyPem && parsed?.publicKeyPem) {
		keypair = {
			privateKey: createPrivateKey({key: parsed.privateKeyPem, format: 'pem'}),
			publicKey: createPublicKey({key: parsed.publicKeyPem, format: 'pem'}),
		}
	} else {
		const {privateKey, publicKey} = generateKeyPairSync('ed25519')
		keypair = {privateKey, publicKey}

		// Persist for future boots — best-effort, never fatal
		try {
			mkdirSync(path.dirname(target), {recursive: true})
			const privateKeyPem = privateKey.export({type: 'pkcs8', format: 'pem'}) as string
			const publicKeyPem = publicKey.export({type: 'spki', format: 'pem'}) as string
			writeFileSync(
				target,
				JSON.stringify({privateKeyPem, publicKeyPem, createdAt: Date.now()}, null, 2),
				{mode: 0o600},
			)
		} catch {
			// If we cannot persist (read-only FS in tests, etc.), continue with
			// the in-memory keypair. Subsequent process restarts will regenerate.
		}
	}

	if (!filePath) cachedKeypair = keypair
	return keypair
}

/**
 * Reset the module-scope keypair cache. Test-only helper — production code
 * loads once at boot.
 */
export function _resetKeypairCacheForTests(): void {
	cachedKeypair = null
}

function base64UrlEncode(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Buffer {
	const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
	return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/**
 * Mint a 5-minute openclaw device token bound to `userId`. When `redis` is
 * supplied (production), also cache the jti → expiresAt in Redis with
 * `EXPIRE 300` so a parallel revoke path can invalidate before the natural TTL.
 */
export async function mintToken(
	userId: string,
	options: {redis?: Redis; keypair?: Keypair; now?: number} = {},
): Promise<MintResult> {
	if (typeof userId !== 'string' || userId.length === 0) {
		throw new Error('mintToken: userId is required')
	}

	const keypair = options.keypair ?? loadOrCreateKeypair()
	const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
	const exp = nowSec + TOKEN_TTL_SECONDS
	const jti = randomBytes(12).toString('hex')

	const payload: TokenPayload = {
		alg: 'EdDSA',
		v: 1,
		sub: userId,
		iat: nowSec,
		exp,
		jti,
	}

	const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
	const signatureBytes = edSign(null, Buffer.from(payloadEncoded, 'utf8'), keypair.privateKey)
	const signatureEncoded = base64UrlEncode(signatureBytes)
	const token = `${payloadEncoded}.${signatureEncoded}`

	if (options.redis) {
		try {
			await options.redis.set(`${REDIS_KEY_PREFIX}${jti}`, String(exp * 1000), 'EX', TOKEN_TTL_SECONDS)
		} catch {
			// Redis cache failure is non-fatal — the token still verifies via
			// signature + exp. Audit log surfaces this elsewhere.
		}
	}

	return {token, expiresAt: exp * 1000, jti}
}

/**
 * Verify a previously-minted token. Returns `null` on any failure path
 * (bad shape, wrong signature, expired, revoked from Redis).
 */
export async function verifyToken(
	token: string,
	options: {redis?: Redis; keypair?: Keypair; now?: number} = {},
): Promise<VerifiedToken | null> {
	if (typeof token !== 'string' || !token.includes('.')) return null

	const dotIndex = token.indexOf('.')
	if (dotIndex <= 0 || dotIndex === token.length - 1) return null
	if (token.indexOf('.', dotIndex + 1) !== -1) return null // exactly one dot

	const payloadEncoded = token.slice(0, dotIndex)
	const signatureEncoded = token.slice(dotIndex + 1)

	let signature: Buffer
	let payloadJson: string
	try {
		signature = base64UrlDecode(signatureEncoded)
		payloadJson = base64UrlDecode(payloadEncoded).toString('utf8')
	} catch {
		return null
	}

	const keypair = options.keypair ?? loadOrCreateKeypair()
	const sigOk = (() => {
		try {
			return edVerify(null, Buffer.from(payloadEncoded, 'utf8'), keypair.publicKey, signature)
		} catch {
			return false
		}
	})()
	if (!sigOk) return null

	let payload: TokenPayload
	try {
		payload = JSON.parse(payloadJson) as TokenPayload
	} catch {
		return null
	}

	if (
		!payload ||
		payload.alg !== 'EdDSA' ||
		payload.v !== 1 ||
		typeof payload.sub !== 'string' ||
		payload.sub.length === 0 ||
		typeof payload.iat !== 'number' ||
		typeof payload.exp !== 'number' ||
		typeof payload.jti !== 'string'
	) {
		return null
	}

	const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
	if (payload.exp <= nowSec) return null

	if (options.redis) {
		try {
			const cached = await options.redis.get(`${REDIS_KEY_PREFIX}${payload.jti}`)
			if (cached === null) return null // explicitly revoked or never minted via this path
		} catch {
			// Redis read failure → fall through (signature already validated)
		}
	}

	return {userId: payload.sub, jti: payload.jti, exp: payload.exp}
}

export const _internals = {
	TOKEN_TTL_SECONDS,
	REDIS_KEY_PREFIX,
	resolveKeypairPath,
	base64UrlEncode,
	base64UrlDecode,
}
