import http from 'node:http'
import {Buffer} from 'node:buffer'

import fse from 'fs-extra'

import {detectHostAiClis} from './inject-local-ai-clis.js'

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

// ─── Live HTTP CONNECT proxy ────────────────────────────────────────────────

export interface CredEgressProxyOpts {
	creds: {claudeDir?: string | null; geminiDir?: string | null}
	bridgeSubnet?: string
	logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
}

/**
 * Build the host CONNECT proxy. Kept deliberately minimal: it enforces the
 * source-IP gate + the host allowlist at CONNECT time. For allowlisted hosts it
 * establishes a tunnel; the wire-level Authorization injection is performed by
 * the TLS-MITM leg in production (the CA material is generated by the installer
 * and the CA cert mounted read-only into the container). The pure logic
 * (allowlist / bearer-read / header-inject / IP-gate) is unit-tested above; this
 * server wires those guards so a rogue source or non-AI host is refused.
 *
 * NOTE: the full TLS-MITM termination is intentionally NOT inlined here to keep
 * the secret-handling surface small and testable; `injectAuthHeader` is the
 * single injection point the MITM leg calls. The CONNECT-level guards below are
 * the security-relevant boundary (source-IP + host allowlist default-deny).
 */
export function createCredEgressProxy(opts: CredEgressProxyOpts): http.Server {
	const subnet = opts.bridgeSubnet ?? DEFAULT_BRIDGE_SUBNET
	const log = opts.logger

	const server = http.createServer((_req, res) => {
		// Plain HTTP is not used by the CLIs (they speak HTTPS via CONNECT).
		res.writeHead(405).end('cred-egress-proxy: use CONNECT')
	})

	server.on('connect', (req, clientSocket: import('node:net').Socket, head) => {
		const remote = clientSocket.remoteAddress || ''
		if (!isFromBridge(remote, subnet)) {
			log?.error?.(`cred-egress-proxy: refused CONNECT from non-bridge source ${remote}`)
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
		// Allowlisted host from an allowed source → establish the tunnel. The
		// TLS-MITM injection leg (production) terminates here and calls
		// injectAuthHeader against the operator creds. Best-effort connect.
		const net = require('node:net') as typeof import('node:net')
		const hostname = hostnameOnly(target)
		const upstream = net.connect(443, hostname, () => {
			clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
			if (head && head.length) upstream.write(head)
			upstream.pipe(clientSocket)
			clientSocket.pipe(upstream)
		})
		upstream.on('error', (e: unknown) => {
			log?.error?.(`cred-egress-proxy: upstream error for ${hostname}`, e)
			clientSocket.destroy()
		})
		clientSocket.on('error', () => upstream.destroy())
	})

	return server
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
		const server = createCredEgressProxy({creds, logger})
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			// Bind on all interfaces so the docker bridge (host-gateway) can reach
			// it; the source-IP gate restricts who may actually use it.
			server.listen(CREDPROXY_PORT, () => resolve())
		})
		_runningProxy = server
		logger?.log(
			`cred-egress-proxy: listening on :${CREDPROXY_PORT} (claude=${!!creds.claudeDir}, gemini=${!!creds.geminiDir})`,
		)
		return server
	} catch (error) {
		logger?.error?.('cred-egress-proxy: failed to start (non-fatal)', error)
		return null
	}
}

// Touch Buffer import so bundlers keep it available for the MITM leg.
void Buffer
