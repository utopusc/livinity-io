// livos/packages/livinityd/source/modules/server/sso-handshake.ts
//
// Phase 259 — pure helpers for the cross-subdomain SSO bounce that lets a
// logged-in operator reach a GATED app subdomain. Background: Phase 257-04
// (LIVOS-023) made LIVINITY_SESSION host-only (it must NOT leak to the shared
// livinity.io platform / sibling tenants), but the 256-04 forward_auth gate at
// `<app>-<user>.<base>` still needs to see a session — and a host-only cookie set
// on `<user>.<base>` never reaches the hyphen-SIBLING app host. The bounce mints a
// host-scoped cookie on the app subdomain itself from a valid parent session.
//
// PURE module: no I/O, no Redis, no Express. The open-redirect / cross-tenant
// surface lives entirely in `parseSsoReturnTarget` + `sanitizeSsoPath`, so it is
// unit-tested in isolation. THE SECURITY GATE: only an app host that is a child
// of THIS operator's own main domain is ever an allowed redirect target — an
// attacker can neither bounce to `evil.com` nor to another tenant's
// `*-otheruser.livinity.io`.

export interface SsoReturnTarget {
	/** The validated app-subdomain host the cookie will be scoped to. */
	host: string
	/** The path (+ query) to send the browser back to after the cookie is set. */
	path: string
}

/**
 * Split a main domain (`bruce.livinity.io`) into its leading user label
 * (`bruce`) and the registrable-ish parent (`livinity.io`). Returns null when
 * the domain has no dot (can't derive an app-host pattern).
 */
function splitMainDomain(mainDomain: string): {userPart: string; parent: string} | null {
	const dot = mainDomain.indexOf('.')
	if (dot <= 0) return null
	return {userPart: mainDomain.slice(0, dot), parent: mainDomain.slice(dot + 1)}
}

/**
 * Validate that `host` is one of THIS operator's own app subdomains under
 * `mainDomain` — the hyphen pattern `<app>-<user>.<parent>` (Phase 210 canonical)
 * OR the legacy dot pattern `<app>.<user>.<parent>`. Rejects the apex itself,
 * other tenants, and unrelated domains.
 */
export function isOwnAppHost(host: string, mainDomain: string): boolean {
	if (!host || !mainDomain) return false
	host = host.toLowerCase()
	mainDomain = mainDomain.toLowerCase()
	if (host === mainDomain) return false // apex is not an app host
	const split = splitMainDomain(mainDomain)
	if (!split) return false
	const {userPart, parent} = split
	// hyphen canonical: `<app>-<user>.<parent>` (and there must be an <app> label
	// before the `-<user>` so the bare `-bruce.livinity.io` can't slip through).
	const hyphenSuffix = `-${userPart}.${parent}`
	if (host.endsWith(hyphenSuffix) && host.length > hyphenSuffix.length) return true
	// legacy dot: `<app>.<user>.<parent>` (i.e. `*.<mainDomain>`).
	const dotSuffix = `.${mainDomain}`
	if (host.endsWith(dotSuffix) && host.length > dotSuffix.length) return true
	return false
}

/**
 * Parse + validate the `return` URL handed to `/__livos_sso`. Returns the target
 * host + path ONLY when the URL is https and its host is one of this operator's
 * own app subdomains; otherwise null (caller rejects / falls back to login).
 */
export function parseSsoReturnTarget(returnUrl: string, mainDomain: string): SsoReturnTarget | null {
	if (!returnUrl || typeof returnUrl !== 'string') return null
	let url: URL
	try {
		url = new URL(returnUrl)
	} catch {
		return null
	}
	// Accept http OR https: behind the Cloudflare-tunnel relay Caddy serves plain
	// `http://` internally (the relay terminates TLS), so the gated-block 401 redirect
	// reflects `{scheme}=http` even though the browser-facing URL is https. The scheme
	// is NOT the security gate — the host check below is, and every OUTPUT redirect
	// (/__livos_sso → /__livos_auth, and the final landing) is forced to https.
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
	// No embedded credentials (userinfo) — defense against `https://app-bruce.livinity.io@evil.com`.
	if (url.username || url.password) return null
	if (!isOwnAppHost(url.hostname, mainDomain)) return null
	return {host: url.hostname, path: sanitizeSsoPath(url.pathname + url.search)}
}

/**
 * Normalize a return path to a SAFE same-host path: must be a single-leading-slash
 * absolute path. Rejects protocol-relative (`//evil.com`) and backslash tricks
 * (`/\evil.com`) that browsers treat as a host → open redirect. Falls back to `/`.
 */
export function sanitizeSsoPath(path: string | undefined): string {
	if (!path || typeof path !== 'string') return '/'
	if (!path.startsWith('/')) return '/'
	// `//x` and `/\x` are interpreted as a host by browsers — collapse to root.
	if (path.startsWith('//') || path.startsWith('/\\')) return '/'
	return path
}
