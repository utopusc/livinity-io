import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import {Buffer} from 'node:buffer'
import {execFile} from 'node:child_process'
import {mkdtemp} from 'node:fs/promises'
import {promisify} from 'node:util'

import fse from 'fs-extra'

import {detectHostAiClis} from './inject-local-ai-clis.js'

const execFileAsync = promisify(execFile)

/**
 * Host-side credential-injecting egress proxy (LIVOS-001 / SC4).
 *
 * Closes the credential-theft + credential-overwrite vector created by
 * bind-mounting the operator's `~/.claude` / `~/.gemini` OAuth token dirs into
 * third-party app containers. Instead of lending the token FILES to a
 * container, the proxy:
 *
 *   1. Lives on the HOST on a fixed loopback port (`CREDPROXY_PORT`), reachable
 *      from the container as `livinity-credproxy:PORT` via
 *      `extra_hosts: livinity-credproxy:host-gateway` — the SAME mechanism
 *      `inject-ai-provider.ts` already uses for `livinity-broker`.
 *   2. Holds the operator's OAuth tokens ON THE HOST (read-only). The container
 *      receives only `HTTPS_PROXY` + a placeholder `ANTHROPIC_API_KEY`.
 *   3. Injects `Authorization: Bearer <real token>` AT THE WIRE, but ONLY for
 *      the allowlisted AI provider hosts (`isInjectableHost`). Every other host
 *      is default-DENIED (mirrors WS-A's egress allowlist).
 *   4. Source-IP gates to the docker bridge subnet, mirroring the broker's
 *      source-IP guard — the container holds NO secret; auth is enforced by the
 *      host proxy + source IP.
 *
 * The token files NEVER cross the container boundary in either direction. The
 * proxy reads them READ-ONLY (no write-back), so the overwrite vector is
 * eliminated too.
 *
 * This mirrors Infisical agent-vault / Cloudflare Sandbox credential-injection
 * (SECURITY-REMEDIATION-DESIGN.md Option A). The pure logic functions
 * (`isInjectableHost`, `readBearerFor`, `injectAuthHeader`, `isFromBridge`) are
 * exported so the unit test exercises the allowlist + header-mutation + IP-gate
 * + read-only-token logic WITHOUT standing up real TLS.
 */

export const CREDPROXY_HOST = 'livinity-credproxy'
export const CREDPROXY_PORT = 13129
export const CREDPROXY_HOST_GATEWAY = `${CREDPROXY_HOST}:host-gateway`

/** The placeholder key the container holds (never a real secret). */
export const CREDPROXY_PLACEHOLDER_KEY = '__livinity_credproxy__'

/** Default docker bridge CIDR (the docker default-bridge range). */
const DEFAULT_BRIDGE_SUBNET = '172.16.0.0/12'

/**
 * Hosts for which the proxy will inject the operator bearer. Default-deny:
 * anything not on this list is refused egress (consistent with WS-A).
 */
const INJECTABLE_HOSTS = new Set<string>(['api.anthropic.com', 'generativelanguage.googleapis.com'])

/**
 * Host paths to the cred-egress-proxy CA material (generated once by the
 * installer's `openssl req -x509` step — `deploy-livinityd.sh` / `update.sh`
 * Phase 256-02 region). The PRIVATE key (`credproxy-ca.key`, mode 0600) NEVER
 * leaves the host and is used ONLY to sign the per-host leaf certs below; the
 * public cert (`credproxy-ca.pem`, 0644) is what the container trusts via
 * `NODE_EXTRA_CA_CERTS`. Overridable for non-default layouts / tests.
 */
const SECRETS_DIR = process.env.LIVOS_CREDPROXY_SECRETS_DIR || '/opt/livos/data/secrets'
export const CREDPROXY_CA_CERT_PATH =
	process.env.LIVOS_CREDPROXY_CA || path.join(SECRETS_DIR, 'credproxy-ca.pem')
export const CREDPROXY_CA_KEY_PATH =
	process.env.LIVOS_CREDPROXY_CA_KEY || path.join(SECRETS_DIR, 'credproxy-ca.key')

/** Strip any `:port` suffix from a CONNECT/Host value, lowercase it. */
function hostnameOnly(host: string): string {
	const h = host.trim().toLowerCase()
	const colon = h.lastIndexOf(':')
	// Only treat as a port separator when the tail is numeric (avoid IPv6 mangling
	// — the AI hosts are plain DNS names, so this is sufficient here).
	if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) return h.slice(0, colon)
	return h
}

/** Exact-match allowlist for the AI provider hosts (host[:port] accepted). */
export function isInjectableHost(host: string): boolean {
	if (!host) return false
	return INJECTABLE_HOSTS.has(hostnameOnly(host))
}

/**
 * Read the operator's OAuth access token from the host cred file, READ-ONLY.
 * Best-effort: returns null on any failure (missing / garbage / unexpected
 * shape) and NEVER throws — the proxy must degrade, not crash the app. The
 * proxy never writes back to these files (the overwrite vector is removed).
 */
export async function readBearerFor(
	provider: 'anthropic' | 'gemini',
	creds: {claudeDir?: string | null; geminiDir?: string | null},
): Promise<string | null> {
	try {
		if (provider === 'anthropic') {
			if (!creds.claudeDir) return null
			const raw = await fse.readFile(`${creds.claudeDir}/.credentials.json`, 'utf8')
			const parsed = JSON.parse(raw)
			// Claude Code stores the OAuth token under claudeAiOauth.accessToken;
			// some builds use a flat accessToken / access_token. Try each.
			const tok =
				parsed?.claudeAiOauth?.accessToken ??
				parsed?.accessToken ??
				parsed?.access_token ??
				null
			return typeof tok === 'string' && tok.length > 0 ? tok : null
		}
		// gemini
		if (!creds.geminiDir) return null
		const raw = await fse.readFile(`${creds.geminiDir}/oauth_creds.json`, 'utf8')
		const parsed = JSON.parse(raw)
		const tok = parsed?.access_token ?? parsed?.accessToken ?? null
		return typeof tok === 'string' && tok.length > 0 ? tok : null
	} catch {
		return null
	}
}

/** Map an allowlisted host to its provider (which cred file to read). */
function providerForHost(host: string): 'anthropic' | 'gemini' | null {
	const h = hostnameOnly(host)
	if (h === 'api.anthropic.com') return 'anthropic'
	if (h === 'generativelanguage.googleapis.com') return 'gemini'
	return null
}

/**
 * Header-mutation step. For an allowlisted host, injects
 * `Authorization: Bearer <token>` (overwriting any placeholder the client sent).
 * For a non-allowlisted host the headers are left UNMUTATED and `denied:true`
 * is returned (default-deny egress, mirroring WS-A). `readBearer` is injected so
 * the unit test stubs the token source without touching disk/TLS.
 */
export async function injectAuthHeader(
	host: string,
	headers: Record<string, string>,
	deps: {readBearer: (provider: 'anthropic' | 'gemini') => Promise<string | null>},
): Promise<{injected: boolean; denied: boolean}> {
	const provider = providerForHost(host)
	if (!provider || !isInjectableHost(host)) {
		// Non-allowlisted: never inject, deny egress.
		return {injected: false, denied: true}
	}
	const token = await deps.readBearer(provider)
	if (!token) {
		// Degrade: allow the request through unmutated rather than crash. The CLI
		// will then surface its own auth error (no operator token available).
		return {injected: false, denied: false}
	}
	// Wire-level injection. Drop any container-supplied placeholder/x-api-key.
	headers['authorization'] = `Bearer ${token}`
	delete headers['x-api-key']
	return {injected: true, denied: false}
}

// ─── LIVOS-046 (262-04): per-app token registry (bind-on-first-use) ──────────
//
// Source-IP alone is NOT auth: ANY container on a docker bridge has a
// `172.16.0.0/12` source and sees the host gateway, so the old `isFromBridge`
// gate let any container borrow the operator's OAuth subscription. Each
// `requiresLocalAiClis` install now mints a unique opaque token delivered via
// the proxy URL userinfo (`http://app:<token>@livinity-credproxy:13129`), so the
// CLIs' CONNECT carries `Proxy-Authorization: Basic <base64(app:token)>`.
//
// BIND-ON-FIRST-USE: the container's compose-network IP is not deterministically
// known at inject time (no docker-inspect race), so the token claims its source
// IP on its FIRST CONNECT and is pinned to it thereafter — a later CONNECT
// presenting the SAME token from a DIFFERENT source is 403'd. The token (not a
// narrowed CIDR) is the PRIMARY auth; `isFromBridge` stays a coarse
// "are-you-on-a-docker-bridge-at-all" defence-in-depth gate.
const _appTokens = new Map<string, {bridgeIp: string | null}>() // token -> bound source IP (null until first use)

/** Normalise the IPv4-mapped-IPv6 form docker sometimes presents. */
function normalizeIp(ip: string): string {
	return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}

/** Register a per-app token. `bridgeIp` null (default) → bind-on-first-use. */
export function registerAppToken(token: string, bridgeIp: string | null = null): void {
	_appTokens.set(token, {bridgeIp})
}

/** Revoke a per-app token (app stop / uninstall). A revoked token → 403. */
export function revokeAppToken(token: string): void {
	_appTokens.delete(token)
}

/** Mint a fresh opaque token (48 hex chars). */
export function mintAppToken(): string {
	return crypto.randomBytes(24).toString('hex')
}

/**
 * Validate a presented token against its bound source IP. Unknown/absent token
 * → false. Known-but-unbound → claims `remoteIp` (bind-on-first-use) and passes.
 * Known-and-bound → passes only from the bound IP. Fail-closed.
 */
export function checkAppToken(token: string | null, remoteIp: string): boolean {
	if (!token) return false
	const rec = _appTokens.get(token)
	if (!rec) return false
	const src = normalizeIp(remoteIp)
	if (rec.bridgeIp == null) {
		// Bind-on-first-use: pin this token to the first source that presents it.
		rec.bridgeIp = src
		return true
	}
	return normalizeIp(rec.bridgeIp) === src
}

/**
 * Extract the per-app token from a CONNECT request's headers. Prefers
 * `Proxy-Authorization: Basic <base64(user:token)>` (what Node emits when
 * HTTPS_PROXY carries userinfo), falls back to `X-Livinity-App-Token`. Returns
 * null when neither is present / parseable.
 */
export function parseAppToken(headers: http.IncomingHttpHeaders): string | null {
	const xToken = headers['x-livinity-app-token']
	if (typeof xToken === 'string' && xToken.length > 0) return xToken
	const auth = headers['proxy-authorization']
	if (typeof auth === 'string' && /^Basic\s+/i.test(auth)) {
		try {
			const decoded = Buffer.from(auth.replace(/^Basic\s+/i, ''), 'base64').toString('utf8')
			const idx = decoded.indexOf(':')
			const token = idx >= 0 ? decoded.slice(idx + 1) : decoded
			return token.length > 0 ? token : null
		} catch {
			return null
		}
	}
	return null
}

/**
 * Resolve the docker-bridge gateway address to bind the proxy to (NOT 0.0.0.0).
 * This is the `host-gateway` IP every container uses to reach the host
 * (docker0's host-side address, conventionally 172.17.0.1) — containers on
 * per-app `br-*` networks still reach it via host-gateway while presenting their
 * own (172.18.x) source IP, which is why the source-IP CIDR stays at /12.
 * Binding here keeps the proxy off the public/LAN (eth0) interface. Falls back
 * to loopback (127.0.0.1) when docker0 is absent, so it never silently binds
 * 0.0.0.0.
 */
export function resolveBridgeGatewayAddr(): string {
	try {
		const ifaces = os.networkInterfaces()
		const docker0 = ifaces['docker0']
		if (docker0) {
			const v4 = docker0.find((a) => a.family === 'IPv4' && !a.internal)
			if (v4?.address) return v4.address
		}
	} catch {
		// fall through to loopback
	}
	return '127.0.0.1'
}

/** Parse a dotted IPv4 into a 32-bit unsigned int, or null. */
function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.')
	if (parts.length !== 4) return null
	let n = 0
	for (const p of parts) {
		if (!/^\d+$/.test(p)) return null
		const o = Number(p)
		if (o < 0 || o > 255) return null
		n = (n << 8) | o
	}
	return n >>> 0
}

/**
 * Source-IP gate: is `remoteAddr` inside `subnet` (CIDR)? Accepts the
 * IPv4-mapped-IPv6 form docker sometimes presents (`::ffff:172.17.0.2`).
 * Returns false on any parse failure (fail-closed).
 */
export function isFromBridge(remoteAddr: string, subnet: string = DEFAULT_BRIDGE_SUBNET): boolean {
	if (!remoteAddr) return false
	// Normalise IPv4-mapped IPv6.
	const v4 = remoteAddr.startsWith('::ffff:') ? remoteAddr.slice('::ffff:'.length) : remoteAddr
	const [netStr, bitsStr] = subnet.split('/')
	const bits = Number(bitsStr)
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
	const ipInt = ipv4ToInt(v4)
	const netInt = ipv4ToInt(netStr)
	if (ipInt === null || netInt === null) return false
	if (bits === 0) return true
	const mask = (0xffffffff << (32 - bits)) >>> 0
	return (ipInt & mask) === (netInt & mask)
}

// ─── TLS-MITM leaf certificates (signed by the cred-proxy CA) ────────────────

/** An in-memory minted leaf: PEM cert + PEM key for one allowlisted hostname. */
export interface LeafCert {
	cert: string
	key: string
}

/**
 * Mint a leaf certificate for `hostname`, signed by the cred-proxy CA, using the
 * HOST `openssl` binary (the SAME tool the installer used to create the CA — no
 * new npm cert-minting dependency, honouring the phase's no-new-deps invariant).
 *
 * The CA PRIVATE key (`caKeyPath`, 0600) is read by the HOST process only and
 * NEVER exposed to any container; only the resulting leaf cert/key (kept in
 * memory) terminate the intercepted TLS leg. The leaf carries a SAN for
 * `hostname` so node/the CLIs accept it for that host.
 *
 * Returns null on any openssl failure (caller fails CLOSED — no unauthenticated
 * pass-through).
 */
export async function mintLeafCert(
	hostname: string,
	caCertPath: string = CREDPROXY_CA_CERT_PATH,
	caKeyPath: string = CREDPROXY_CA_KEY_PATH,
): Promise<LeafCert | null> {
	// Reject anything that isn't a plain DNS hostname before it ever reaches the
	// shell-less execFile arg / openssl config (defence-in-depth — the caller
	// already gates on the exact-match allowlist).
	if (!/^[a-z0-9.-]+$/i.test(hostname)) return null
	let work: string | null = null
	try {
		// Both CA files must exist and be readable by the host process.
		if (!(await fse.pathExists(caCertPath)) || !(await fse.pathExists(caKeyPath))) return null

		work = await mkdtemp(path.join(os.tmpdir(), 'credproxy-leaf-'))
		const keyPath = path.join(work, 'leaf.key')
		const csrPath = path.join(work, 'leaf.csr')
		const certPath = path.join(work, 'leaf.crt')
		const extPath = path.join(work, 'leaf.ext')

		await fse.writeFile(extPath, `subjectAltName=DNS:${hostname}\n`)

		// 1) leaf private key
		await execFileAsync('openssl', ['genrsa', '-out', keyPath, '2048'])
		// 2) CSR (CN = hostname)
		await execFileAsync('openssl', [
			'req',
			'-new',
			'-key',
			keyPath,
			'-out',
			csrPath,
			'-subj',
			`/CN=${hostname}`,
		])
		// 3) sign the CSR with the CA → leaf cert (with the SAN extension)
		await execFileAsync('openssl', [
			'x509',
			'-req',
			'-in',
			csrPath,
			'-CA',
			caCertPath,
			'-CAkey',
			caKeyPath,
			'-CAcreateserial',
			'-days',
			'825',
			'-extfile',
			extPath,
			'-out',
			certPath,
		])

		const [cert, key] = await Promise.all([
			fse.readFile(certPath, 'utf8'),
			fse.readFile(keyPath, 'utf8'),
		])
		if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('PRIVATE KEY')) return null
		return {cert, key}
	} catch {
		return null
	} finally {
		if (work) await fse.remove(work).catch(() => {})
	}
}

/**
 * Pre-mint a `tls.SecureContext` for every host in the (small, static)
 * allowlist at proxy startup, keyed by hostname. The contexts are then selected
 * per-connection by `SNICallback`. Hosts that fail to mint are simply absent
 * from the map → their CONNECT fails closed (no MITM, no pass-through).
 */
export async function buildLeafContexts(
	hosts: Iterable<string> = INJECTABLE_HOSTS,
	caCertPath: string = CREDPROXY_CA_CERT_PATH,
	caKeyPath: string = CREDPROXY_CA_KEY_PATH,
): Promise<Map<string, tls.SecureContext>> {
	const map = new Map<string, tls.SecureContext>()
	for (const host of hosts) {
		const leaf = await mintLeafCert(host, caCertPath, caKeyPath)
		if (!leaf) continue
		map.set(host, tls.createSecureContext({cert: leaf.cert, key: leaf.key}))
	}
	return map
}

// ─── Live HTTP CONNECT proxy ────────────────────────────────────────────────

export interface CredEgressProxyOpts {
	creds: {claudeDir?: string | null; geminiDir?: string | null}
	bridgeSubnet?: string
	logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
	/**
	 * Pre-minted per-host TLS contexts (from `buildLeafContexts`). When omitted
	 * (e.g. unit tests that exercise only the CONNECT guards), CONNECT to an
	 * allowlisted host still fails CLOSED — there is NO unauthenticated
	 * pass-through fallback. Production wires this from `startCredEgressProxyIfNeeded`.
	 */
	leafContexts?: Map<string, tls.SecureContext>
	/**
	 * Bearer source. Defaults to the read-only on-disk cred reader; injectable so
	 * the unit test can supply a deterministic token without touching disk.
	 */
	readBearer?: (provider: 'anthropic' | 'gemini') => Promise<string | null>
	/**
	 * Upstream re-origination hook. Defaults to a genuine `https.request` to the
	 * real `hostname:443` (validating the real public cert). Injectable ONLY so
	 * the unit test can point the re-originated leg at a local mock upstream
	 * WITHOUT a DNS/:443 override — the production default always reaches the real
	 * AI host. The `headers` it receives already carry the injected
	 * `Authorization: Bearer` (placeholder dropped).
	 */
	forwardRequest?: (
		hostname: string,
		opts: {method?: string; path?: string; headers: Record<string, string>},
		onResponse: (res: http.IncomingMessage) => void,
	) => http.ClientRequest
}

/** Default upstream re-origination: a real TLS request to the genuine host:443. */
function defaultForwardRequest(
	hostname: string,
	opts: {method?: string; path?: string; headers: Record<string, string>},
	onResponse: (res: http.IncomingMessage) => void,
): http.ClientRequest {
	return https.request(
		{
			host: hostname,
			port: 443,
			method: opts.method,
			path: opts.path,
			headers: opts.headers,
			servername: hostname,
		},
		onResponse,
	)
}

/**
 * Build the host CONNECT proxy with the TLS-MITM credential-injection leg.
 *
 * SECURITY BOUNDARY (unchanged from the original, all preserved):
 *   - source-IP gate (`isFromBridge`) — non-bridge sources get 403.
 *   - host-allowlist DEFAULT-DENY (`isInjectableHost`) — a non-allowlisted
 *     CONNECT is REFUSED (403), never MITM'd and never passed through.
 *   - read-only token use (`readBearerFor`) — no write-back.
 *   - single injection point (`injectAuthHeader`).
 *
 * For an allowlisted host from an allowed source the proxy now actually:
 *   1. replies `200 Connection Established`,
 *   2. TERMINATES the client TLS with the pre-minted leaf cert for that host
 *      (selected by SNI; the container trusts it via the CA it has mounted),
 *   3. parses the decrypted HTTP request and injects `Authorization: Bearer`
 *      via `injectAuthHeader` (the placeholder key the container holds is
 *      dropped),
 *   4. RE-ORIGINATES a genuine upstream TLS connection to the real host:443
 *      (validating the real public cert) and streams the request/response.
 *
 * FAIL-CLOSED: if no leaf context exists for the host, or TLS termination fails,
 * the connection is destroyed — the proxy NEVER falls back to an unauthenticated
 * plain pass-through that would leak the container's placeholder key upstream.
 */
export function createCredEgressProxy(opts: CredEgressProxyOpts): http.Server {
	const subnet = opts.bridgeSubnet ?? DEFAULT_BRIDGE_SUBNET
	const log = opts.logger
	const leafContexts = opts.leafContexts
	const readBearer =
		opts.readBearer ?? ((provider: 'anthropic' | 'gemini') => readBearerFor(provider, opts.creds))
	const forwardRequest = opts.forwardRequest ?? defaultForwardRequest

	const server = http.createServer((_req, res) => {
		// Plain HTTP is not used by the CLIs (they speak HTTPS via CONNECT).
		res.writeHead(405).end('cred-egress-proxy: use CONNECT')
	})

	server.on('connect', (req, clientSocket: net.Socket, head) => {
		const remote = clientSocket.remoteAddress || ''
		if (!isFromBridge(remote, subnet)) {
			log?.error?.(`cred-egress-proxy: refused CONNECT from non-bridge source ${remote}`)
			clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
			clientSocket.destroy()
			return
		}
		// LIVOS-046 (262-04): per-app token is the PRIMARY auth — source-IP alone
		// is no longer sufficient. Require a known token (bind-on-first-use to this
		// container's source IP) AFTER the coarse bridge gate. Absent / unknown /
		// wrong-source token → 403.
		const appToken = parseAppToken(req.headers)
		if (!checkAppToken(appToken, remote)) {
			log?.error?.(`cred-egress-proxy: refused CONNECT — missing/invalid per-app token from ${remote}`)
			clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
			clientSocket.destroy()
			return
		}
		const target = req.url || ''
		if (!isInjectableHost(target)) {
			// Default-deny: only the AI provider hosts may be tunnelled.
			log?.error?.(`cred-egress-proxy: denied non-allowlisted CONNECT ${target} from ${remote}`)
			clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
			clientSocket.destroy()
			return
		}

		const hostname = hostnameOnly(target)
		const leafCtx = leafContexts?.get(hostname)
		if (!leafCtx) {
			// FAIL CLOSED: no leaf cert for this (allowlisted) host → we cannot
			// terminate TLS to inject the bearer. Refusing is correct — a plain
			// pass-through here would forward the container's PLACEHOLDER key
			// upstream (auth failure) and bypass injection.
			log?.error?.(
				`cred-egress-proxy: no leaf context for allowlisted host ${hostname} — refusing (fail-closed)`,
			)
			clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
			clientSocket.destroy()
			return
		}

		// Allowlisted host + allowed source + leaf cert present → MITM.
		clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
		mitmTerminateAndForward({hostname, clientSocket, head, leafCtx, readBearer, forwardRequest, log})
	})

	return server
}

/**
 * The TLS-MITM leg for a single allowlisted CONNECT. Terminates the client TLS
 * with `leafCtx`, parses the decrypted HTTP request(s), injects the bearer via
 * `injectAuthHeader`, and re-originates a genuine upstream TLS connection per
 * request to the real host. Any failure destroys both sockets (fail-closed).
 */
function mitmTerminateAndForward(args: {
	hostname: string
	clientSocket: net.Socket
	head: Buffer
	leafCtx: tls.SecureContext
	readBearer: (provider: 'anthropic' | 'gemini') => Promise<string | null>
	forwardRequest: NonNullable<CredEgressProxyOpts['forwardRequest']>
	log?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
}): void {
	const {hostname, clientSocket, head, leafCtx, readBearer, forwardRequest, log} = args

	const clientTls = new tls.TLSSocket(clientSocket, {
		isServer: true,
		secureContext: leafCtx,
		// SNI is fixed (we already know the host from CONNECT); the single context
		// is correct for this hostname.
	})
	clientTls.on('error', (e) => {
		log?.error?.(`cred-egress-proxy: client TLS error for ${hostname}`, e)
		clientSocket.destroy()
	})

	// Drive an in-process HTTP server over the decrypted client stream so node's
	// own parser handles framing/chunking. For each request we re-originate an
	// upstream HTTPS request with the injected Authorization header.
	const mitm = http.createServer()
	mitm.on('request', (creq: http.IncomingMessage, cres: http.ServerResponse) => {
		void (async () => {
			try {
				// Normalise incoming headers to a flat string map for injection.
				const headers: Record<string, string> = {}
				for (const [k, v] of Object.entries(creq.headers)) {
					if (typeof v === 'string') headers[k.toLowerCase()] = v
					else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ')
				}

				const result = await injectAuthHeader(hostname, headers, {readBearer})
				if (result.denied) {
					// Defensive: should never happen (host is allowlisted), fail closed.
					cres.writeHead(403).end()
					clientTls.destroy()
					return
				}

				const upstreamReq = forwardRequest(
					hostname,
					{method: creq.method, path: creq.url, headers},
					(upRes) => {
						cres.writeHead(upRes.statusCode || 502, upRes.headers)
						upRes.pipe(cres)
					},
				)
				upstreamReq.on('error', (e) => {
					log?.error?.(`cred-egress-proxy: upstream TLS error for ${hostname}`, e)
					if (!cres.headersSent) cres.writeHead(502).end()
					else cres.destroy()
				})
				creq.pipe(upstreamReq)
			} catch (e) {
				log?.error?.(`cred-egress-proxy: MITM request handling failed for ${hostname}`, e)
				if (!cres.headersSent) cres.writeHead(502).end()
				clientTls.destroy()
			}
		})()
	})

	// Feed the already-decrypted TLS socket to the HTTP server as a connection.
	mitm.emit('connection', clientTls)
	if (head && head.length) clientTls.unshift(head)
}

let _runningProxy: http.Server | null = null

/**
 * Idempotent start on CREDPROXY_PORT (loopback). Reads the operator cred dirs
 * once via detectHostAiClis at start. No-op if already listening. Called from
 * livinityd bootstrap / before a requiresLocalAiClis install.
 */
export async function startCredEgressProxyIfNeeded(logger?: {
	log: (m: string) => void
	error: (m: string, e?: unknown) => void
}): Promise<http.Server | null> {
	if (_runningProxy && _runningProxy.listening) return _runningProxy
	try {
		const detected = await detectHostAiClis()
		const creds = detected?.creds ?? {claudeDir: null, geminiDir: null}
		// Pre-mint the per-host TLS leaf contexts (signed by the cred-proxy CA) so
		// the CONNECT MITM leg can terminate TLS and inject the bearer. If the CA
		// material is absent / openssl fails, the map is empty and allowlisted
		// CONNECTs fail CLOSED (no unauthenticated pass-through).
		const leafContexts = await buildLeafContexts()
		if (leafContexts.size === 0) {
			logger?.error?.(
				'cred-egress-proxy: no leaf TLS contexts minted (CA material missing or openssl failed) — allowlisted egress will fail closed',
			)
		}
		const server = createCredEgressProxy({creds, logger, leafContexts})
		// LIVOS-046 (262-04): bind to the docker-bridge gateway interface (the
		// host-gateway IP every container uses to reach the host), NOT 0.0.0.0 —
		// keeps the proxy off the public/LAN (eth0) interface. Containers on
		// per-app br-* networks still reach it via host-gateway. Falls back to
		// loopback (never 0.0.0.0) when docker0 is absent.
		const bindAddr = resolveBridgeGatewayAddr()
		if (bindAddr === '127.0.0.1') {
			logger?.error?.(
				'cred-egress-proxy: could not resolve docker0 gateway — binding loopback (127.0.0.1); containers will be unable to reach the proxy until docker0 is up',
			)
		}
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(CREDPROXY_PORT, bindAddr, () => resolve())
		})
		_runningProxy = server
		logger?.log(
			`cred-egress-proxy: listening on ${bindAddr}:${CREDPROXY_PORT} (claude=${!!creds.claudeDir}, gemini=${!!creds.geminiDir}, leaf-ctx=${leafContexts.size})`,
		)
		return server
	} catch (error) {
		logger?.error?.('cred-egress-proxy: failed to start (non-fatal)', error)
		return null
	}
}

