// livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts
// Phase 104 plan 104-04 — Server5 control-plane subdomain mint helper.
// One of THREE acceptable Server5 touches under D-104-RELAY-ZERO-DATA-PLANE
// (control-plane only — no user data-plane bytes ever transit Server5).
//
// Flow:
//   1. install.sh `--mode hybrid` calls Server5 ONCE to mint
//      `<random>.home.livinity.io` and bind it to the user's LAN IP.
//   2. Caddy DNS-01 ACME (control-plane TXT writes) issues a real LE cert.
//   3. LAN clients resolve the public DNS A-record to 192.168.x.y and connect
//      LAN-direct to the local Caddy — Server5 sees ZERO data-plane traffic.
//
// On Server5 unreachable (likely on first cut — endpoint may not be deployed
// yet), the function throws `ServerSideProvisionUnavailable` so install.sh
// can fall back to the manual-prompt path documented in mode-hybrid.sh.
import {writeFile, chmod} from 'node:fs/promises'
import path from 'node:path'

export interface ProvisionInput {
	hostIp: string
	cloudflareApiToken: string
	/** Test injection point — defaults to global fetch. */
	fetcher?: typeof fetch
	/** Server5 endpoint override (test injection or future migration). */
	endpoint?: string
}

export interface ProvisionResult {
	subdomain: string // e.g., "ab12cd34.home.livinity.io"
	zoneId: string // Cloudflare zone ID for the apex
}

/**
 * Thrown when the Server5 control-plane endpoint is unreachable or returns a
 * 404/503. install.sh treats this as a recoverable failure and falls back to
 * the manual subdomain entry prompt.
 */
export class ServerSideProvisionUnavailable extends Error {
	readonly recoverable = true
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message)
		this.name = 'ServerSideProvisionUnavailable'
	}
}

// Phase 325-03 (NET-03, D-14): DEFERRED — the vendor mint endpoint
// `https://livinity.io/api/hybrid/provision` was never deployed on the vendor
// web app, and reviving it means shipping money/auth code to Vercel, which is
// operator-gated. The portal provision path now uses the BYO own-CF-zone flow
// instead (see local-dns/routes.ts → apps/cf-local.ts provisionPortalDnsRecord).
// This vendor helper + ServerSideProvisionUnavailable are left INTACT but unused
// so the deferred vendor path can be re-enabled by an operator decision later.
const DEFAULT_ENDPOINT = 'https://livinity.io/api/hybrid/provision'

// Strict shape — accept ONLY <label>.home.livinity.io (one or more dot-separated
// alphanumeric/dash labels under the home.livinity.io apex). Rejects:
//   - other domains (e.g. evil.example.com) — prevents Server5 spoofing
//     a different apex (T-104-04-T1)
//   - empty labels and trailing/leading dots
const HYBRID_DOMAIN_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.home\.livinity\.io$/

/**
 * Provision a random subdomain under `home.livinity.io` via the Server5
 * control-plane API. The hostIp is the LAN address Cloudflare's A-record will
 * point at; the cloudflareApiToken is the user-provided DNS-01 challenge token.
 *
 * Per D-104-RELAY-ZERO-DATA-PLANE: this is a control-plane call only. After
 * provision, ALL data-plane traffic is LAN-direct (Cloudflare DNS lookup ->
 * 192.168.x.y -> local Caddy).
 *
 * Security:
 *   - Validates the Server5 response shape (`subdomain` matches HYBRID_DOMAIN_RE
 *     under the home.livinity.io apex; `zoneId` non-empty string). Mitigates
 *     T-104-04-T1 (tampered subdomain response).
 *   - Never includes the cloudflareApiToken or request body in error messages
 *     (T-104-04-I1).
 *   - Honors `LIVINITY_INSTALL_TOKEN` env as a Bearer header for future
 *     control-plane authentication.
 */
export async function provisionHybridSubdomain(input: ProvisionInput): Promise<ProvisionResult> {
	const fetcher = input.fetcher ?? fetch
	const endpoint = input.endpoint ?? DEFAULT_ENDPOINT
	const installToken = process.env.LIVINITY_INSTALL_TOKEN

	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'user-agent': 'LivOS-install.sh/Phase104',
	}
	if (installToken) {
		headers.authorization = `Bearer ${installToken}`
	}

	let response: Response
	try {
		response = await fetcher(endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				hostIp: input.hostIp,
				cloudflareApiToken: input.cloudflareApiToken,
			}),
		})
	} catch (err) {
		// Network error (DNS failure, refused, TLS handshake error, etc.). The
		// underlying error is preserved in `.cause` for diagnostics but the
		// outer message is generic — NEVER leak request body contents.
		throw new ServerSideProvisionUnavailable(`Server5 control-plane unreachable at ${endpoint}`, err)
	}

	if (response.status === 404 || response.status === 503) {
		throw new ServerSideProvisionUnavailable(
			`Server5 control-plane endpoint not ready (HTTP ${response.status})`,
		)
	}
	if (!response.ok) {
		// IMPORTANT: do NOT include the request body in the error — that would
		// leak the Cloudflare API token to whichever log the error bubbles up to.
		throw new Error(`Server5 control-plane error: HTTP ${response.status} ${response.statusText}`)
	}

	const body = (await response.json()) as Partial<ProvisionResult>
	if (
		typeof body.subdomain !== 'string' ||
		!HYBRID_DOMAIN_RE.test(body.subdomain) ||
		typeof body.zoneId !== 'string' ||
		body.zoneId.length === 0
	) {
		throw new Error('Server5 control-plane returned malformed response (missing/invalid subdomain or zoneId)')
	}

	return {subdomain: body.subdomain, zoneId: body.zoneId}
}

/**
 * Write the Cloudflare API token to a 0600-perm file on disk. install.sh + the
 * Caddy systemd unit (via EnvironmentFile drop-in) read this path; Caddy then
 * resolves `{env.CLOUDFLARE_API_TOKEN}` in the Caddyfile DNS-01 directive.
 *
 * Defense-in-depth: parent dir is 0700, the file itself is 0600, set via both
 * `writeFile({mode})` and a follow-up explicit `chmod` (some filesystems
 * silently ignore the mode arg on first write — see Node `fs` docs).
 */
export async function writeCfTokenSecret(token: string, filePath: string): Promise<void> {
	const dir = path.dirname(filePath)
	const {mkdir} = await import('node:fs/promises')
	await mkdir(dir, {recursive: true, mode: 0o700})
	await writeFile(filePath, `CLOUDFLARE_API_TOKEN=${token}\n`, {mode: 0o600})
	await chmod(filePath, 0o600)
}

/** Canonical on-disk path for the Cloudflare API token EnvironmentFile. */
export const HYBRID_TOKEN_SECRET_PATH = '/etc/livos/secrets/cf-token'
