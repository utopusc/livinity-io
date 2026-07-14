// Phase 322 (IDENT-02, D-322-3) — asymmetric OIDC signing key. DEK-encrypted at
// rest (5th dek.ts consumer). MUST NOT reuse the HS256 session secret (Pitfall 6):
// OIDC tokens are verified by third-party apps via the public /oidc/jwks.

import crypto from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {exportJWK, generateKeyPair} from 'jose'

import {decrypt, encrypt, getKey} from '../secrets/dek.js'

// Same secrets dir as the DEK itself (dek.ts → /opt/livos/data/secrets). The
// signing key is a DISTINCT file from the HS256 session secret — never shared.
const SECRETS_DIR = '/opt/livos/data/secrets'
const SIGNING_JWK_PATH = `${SECRETS_DIR}/oidc-signing-jwk`

/**
 * A JSON Web Key Set as oidc-provider's `jwks` config option expects it — the
 * single element is the PRIVATE JWK (carries `d`/`p`/`q`/… for signing).
 */
export interface Jwks {
	keys: Array<Record<string, unknown>>
}

// Injectable fs seam so unit tests run fully offline, mirroring dek.ts's
// _setKeyProvidersForTests. In production these are the real fs/promises calls.
type FsDeps = {
	readFile: (p: string, enc: BufferEncoding) => Promise<string>
	writeFile: (p: string, data: string, opts: {mode: number}) => Promise<void>
	mkdir: (p: string, opts: {recursive: boolean}) => Promise<unknown>
	jwkPath: string
}

const realFsDeps: FsDeps = {
	readFile: (p, enc) => readFile(p, enc),
	writeFile: (p, data, opts) => writeFile(p, data, opts),
	mkdir: (p, opts) => mkdir(p, opts),
	jwkPath: SIGNING_JWK_PATH,
}

let _fsDeps: FsDeps = realFsDeps

// Test-only injection hook — override the fs deps for offline unit tests.
export function _setFsForTests(overrides: Partial<FsDeps> | null): void {
	_fsDeps = overrides ? {...realFsDeps, ...overrides} : realFsDeps
}

/**
 * Load — or, on first boot, generate + persist — the single asymmetric RS256
 * key oidc-provider signs ID/access tokens with. The PRIVATE JWK is stored
 * DEK-encrypted (base64 iv‖tag‖ciphertext, mode 0600) beside the other
 * credential stores, so the `kid` stays stable across restarts and third-party
 * apps' cached JWKS keep verifying. Entirely independent of the HS256 session
 * secret — third parties verify tokens via the public /oidc/jwks, never a
 * shared secret.
 */
export async function getOrCreateSigningJwks(): Promise<Jwks> {
	const d = _fsDeps
	const key = await getKey()

	// Load-or-create: try the persisted, DEK-encrypted blob first.
	try {
		const blob = await d.readFile(d.jwkPath, 'utf-8')
		const jwk = JSON.parse(decrypt(blob, key)) as Record<string, unknown>
		return {keys: [jwk]}
	} catch {
		// ENOENT (first boot) or an unreadable/corrupt blob — fall through and
		// generate a fresh key, overwriting any corrupt blob (self-heal).
	}

	const {privateKey} = await generateKeyPair('RS256', {extractable: true})
	const jwk = (await exportJWK(privateKey)) as Record<string, unknown>
	jwk.kid = crypto.randomUUID()
	jwk.use = 'sig'
	jwk.alg = 'RS256'

	try {
		await d.mkdir(dirname(d.jwkPath), {recursive: true})
		await d.writeFile(d.jwkPath, encrypt(JSON.stringify(jwk), key), {mode: 0o600})
	} catch {
		// Persistence failure is non-fatal in-process (mirrors dek.ts getKey): the
		// key works for this boot; the next start regenerates. A regenerated key
		// rotates the kid, which oidc-provider + third-party JWKS refresh tolerate.
	}

	return {keys: [jwk]}
}
