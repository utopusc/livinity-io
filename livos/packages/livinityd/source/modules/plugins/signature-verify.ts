/**
 * Phase 153 — Ed25519 detached signature verification.
 *
 * The signing payload is the raw bytes of `plugin-manifest.json` (NOT
 * the bundle .tgz — the manifest is the trust root). Signature file
 * is a hex-encoded 64-byte Ed25519 signature.
 *
 * Pubkey registry: synced from
 *   https://raw.githubusercontent.com/utopusc/livinity-apps/main/.signing/pubkeys.json
 * cached locally at /opt/livos/plugins/.cache/pubkeys.json.
 */

import {createPublicKey, verify as cryptoVerify} from 'crypto'
import {promises as fs} from 'fs'

export interface PublicKeyRegistry {
	[publicKeyId: string]: {
		tier: 'operator' | 'verified' | 'community'
		publicKey: string // "ed25519:<base64-32-bytes>"
		addedAt: string
	}
}

const PUBKEY_REGISTRY_URL =
	'https://raw.githubusercontent.com/utopusc/livinity-apps/main/.signing/pubkeys.json'

export async function loadPubkeyRegistry(
	cachePath: string,
	options: {maxAgeMs?: number; allowStale?: boolean} = {},
): Promise<PublicKeyRegistry> {
	const maxAge = options.maxAgeMs ?? 24 * 60 * 60 * 1000 // 24h
	// 1) Read cache
	let cached: PublicKeyRegistry | null = null
	let cachedAge = Infinity
	try {
		const stat = await fs.stat(cachePath)
		cachedAge = Date.now() - stat.mtimeMs
		const raw = await fs.readFile(cachePath, 'utf8')
		cached = JSON.parse(raw) as PublicKeyRegistry
	} catch {
		// no cache or unreadable
	}
	if (cached && cachedAge < maxAge) return cached

	// 2) Try fresh fetch from GitHub raw.
	try {
		const res = await fetch(PUBKEY_REGISTRY_URL, {
			headers: {'User-Agent': 'LivinityPluginLoader/1.0'},
		})
		if (!res.ok) throw new Error(`pubkey registry HTTP ${res.status}`)
		const fresh = (await res.json()) as PublicKeyRegistry
		await fs.mkdir(cachePath.replace(/\/[^/]+$/, ''), {recursive: true})
		await fs.writeFile(cachePath, JSON.stringify(fresh, null, 2))
		return fresh
	} catch (err) {
		if (cached && options.allowStale !== false) return cached
		throw err
	}
}

/**
 * Verify a manifest's signature against the registered public key.
 *
 * @param manifestBytes — raw bytes of plugin-manifest.json
 * @param signatureHex  — 128-char hex string from plugin-manifest.sig
 * @param publicKeyId   — manifest.signing.publicKeyId
 * @param registry      — loaded pubkey registry
 * @param allowedTiers  — which signing tiers this install accepts
 *                        (v37 default: ['operator'])
 */
export function verifyManifestSignature(
	manifestBytes: Uint8Array,
	signatureHex: string,
	publicKeyId: string,
	registry: PublicKeyRegistry,
	allowedTiers: ReadonlyArray<'operator' | 'verified' | 'community'> = ['operator'],
): {ok: true; tier: 'operator' | 'verified' | 'community'} | {ok: false; reason: string} {
	const entry = registry[publicKeyId]
	if (!entry) return {ok: false, reason: `unknown publicKeyId "${publicKeyId}"`}
	if (!allowedTiers.includes(entry.tier)) {
		return {
			ok: false,
			reason: `tier "${entry.tier}" not allowed (allowed: ${allowedTiers.join(',')})`,
		}
	}
	if (!entry.publicKey.startsWith('ed25519:')) {
		return {ok: false, reason: `publicKey not in ed25519:<base64> format`}
	}
	const keyB64 = entry.publicKey.slice('ed25519:'.length)
	let keyBytes: Buffer
	try {
		keyBytes = Buffer.from(keyB64, 'base64')
	} catch {
		return {ok: false, reason: 'publicKey base64 decode failed'}
	}
	if (keyBytes.length !== 32) {
		return {ok: false, reason: `publicKey must be 32 bytes (got ${keyBytes.length})`}
	}

	// Build a Node KeyObject from the 32-byte raw key. Node 18+ requires
	// DER-wrapping for raw Ed25519 keys.
	const derPrefix = Buffer.from('302a300506032b6570032100', 'hex')
	const spkiDer = Buffer.concat([derPrefix, keyBytes])
	const publicKey = createPublicKey({
		key: spkiDer,
		format: 'der',
		type: 'spki',
	})

	let sigBytes: Buffer
	try {
		sigBytes = Buffer.from(signatureHex.trim(), 'hex')
	} catch {
		return {ok: false, reason: 'signature hex decode failed'}
	}
	if (sigBytes.length !== 64) {
		return {
			ok: false,
			reason: `Ed25519 signature must be 64 bytes (got ${sigBytes.length})`,
		}
	}

	const valid = cryptoVerify(null, manifestBytes, publicKey, sigBytes)
	if (!valid) return {ok: false, reason: 'signature does not verify'}
	return {ok: true, tier: entry.tier}
}
