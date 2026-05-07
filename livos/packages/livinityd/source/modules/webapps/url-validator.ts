// Phase 92-03 — URL validator (pure function).
//
// Single entrypoint that turns user-typed input into a normalized URL OR a
// structured rejection. Pure: no I/O, no DNS, no logger. Called from the
// orchestrator (92-08) before any fetch attempt and from any future P93 /
// P94 touchpoint that needs the same trust gate.
//
// Reject rules (per CONTEXT.md In-scope item 4):
//   - Non-http(s) schemes: file:, javascript:, data:, chrome:, ws:, etc.
//   - Malformed URLs (URL constructor throws).
//   - Private intranet IPs unless caller is admin:
//       * IPv4 RFC1918:  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
//       * IPv4 loopback: 127.0.0.0/8
//       * IPv4 link-local: 169.254.0.0/16
//       * IPv6 loopback: ::1
//       * IPv6 ULA:      fc00::/7  (covers fc00..fdff)
//       * "localhost" hostname literal
//
// Normalization (per gray-area #5 — same URL with/without trailing slash
// must hit the same cache row):
//   - Lowercase host.
//   - Strip default port (80 for http, 443 for https).
//   - Drop trailing slash on path == '/' (so 'https://x.com/' becomes
//     'https://x.com'). Other paths keep their trailing slash verbatim.
//   - Preserve query string verbatim (no UTM stripping — out of scope).

export type ValidateOk = {
	ok: true
	normalized: URL
}

export type ValidateErrCode = 'INVALID_URL' | 'INVALID_SCHEME' | 'PRIVATE_IP'

export type ValidateErr = {
	ok: false
	code: ValidateErrCode
	reason: string
}

export type ValidateResult = ValidateOk | ValidateErr

const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

// IPv4 dotted-quad parser. Returns null if `host` is not an IPv4 literal.
function parseIPv4(host: string): [number, number, number, number] | null {
	const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (!m) return null
	const a = Number(m[1])
	const b = Number(m[2])
	const c = Number(m[3])
	const d = Number(m[4])
	if (a > 255 || b > 255 || c > 255 || d > 255) return null
	return [a, b, c, d]
}

function isPrivateIPv4(octets: [number, number, number, number]): boolean {
	const [a, b] = octets
	// 10.0.0.0/8
	if (a === 10) return true
	// 172.16.0.0/12 — covers 172.16..172.31
	if (a === 172 && b >= 16 && b <= 31) return true
	// 192.168.0.0/16
	if (a === 192 && b === 168) return true
	// 127.0.0.0/8 — loopback
	if (a === 127) return true
	// 169.254.0.0/16 — link-local
	if (a === 169 && b === 254) return true
	return false
}

function isPrivateIPv6(host: string): boolean {
	// URL.hostname for IPv6 includes brackets stripped already, e.g. '::1'.
	const lower = host.toLowerCase()
	if (lower === '::1') return true
	// fc00::/7 — covers fc00..fdff first hextet
	if (/^fc[0-9a-f]{0,2}:/i.test(lower) || /^fd[0-9a-f]{0,2}:/i.test(lower)) return true
	if (/^fc[0-9a-f]{0,2}$/i.test(lower) || /^fd[0-9a-f]{0,2}$/i.test(lower)) return true
	return false
}

function isPrivateHost(host: string): boolean {
	let lower = host.toLowerCase()
	// Node's URL.hostname for IPv6 keeps brackets, e.g. '[::1]' — strip
	// before pattern-matching against the literal address.
	if (lower.startsWith('[') && lower.endsWith(']')) {
		lower = lower.slice(1, -1)
	}
	if (lower === 'localhost') return true
	const v4 = parseIPv4(lower)
	if (v4 && isPrivateIPv4(v4)) return true
	if (lower.includes(':') && isPrivateIPv6(lower)) return true
	return false
}

function normalize(parsed: URL): URL {
	// `URL` does not let us mutate hostname casing in-place reliably across
	// Node versions; reconstruct via toString chunks.
	const host = parsed.hostname.toLowerCase()
	const isDefaultPort =
		(parsed.protocol === 'http:' && parsed.port === '80') ||
		(parsed.protocol === 'https:' && parsed.port === '443')
	const port = isDefaultPort ? '' : parsed.port
	const authority = port ? `${host}:${port}` : host

	// Drop trailing slash only when path is exactly '/'. Anything deeper
	// keeps the user's literal pathname.
	const pathname = parsed.pathname === '/' ? '' : parsed.pathname

	const search = parsed.search // preserve verbatim
	const hash = '' // strip fragment — never sent to server, irrelevant for metadata

	const reconstructed = `${parsed.protocol}//${authority}${pathname}${search}${hash}`
	return new URL(reconstructed)
}

export function validateUrl(input: string, opts: {isAdmin: boolean}): ValidateResult {
	if (typeof input !== 'string' || input.length === 0) {
		return {ok: false, code: 'INVALID_URL', reason: 'URL must be a non-empty string'}
	}

	let parsed: URL
	try {
		parsed = new URL(input.trim())
	} catch {
		return {ok: false, code: 'INVALID_URL', reason: 'URL could not be parsed'}
	}

	if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
		return {
			ok: false,
			code: 'INVALID_SCHEME',
			reason: `Scheme '${parsed.protocol.replace(':', '')}' is not allowed (only http/https)`,
		}
	}

	const host = parsed.hostname
	if (host.length === 0) {
		return {ok: false, code: 'INVALID_URL', reason: 'URL is missing a host'}
	}

	if (!opts.isAdmin && isPrivateHost(host)) {
		return {
			ok: false,
			code: 'PRIVATE_IP',
			reason: `Host '${host}' resolves to a private/loopback address; admin-only`,
		}
	}

	return {ok: true, normalized: normalize(parsed)}
}
