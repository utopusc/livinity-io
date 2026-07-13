// Phase 310-01 (ALERT-02, T-310-01) — webhook/ntfy SSRF guard.
//
// This is a livinityd-LOCAL PORT of the liv core "mcp-ssrf-guard" module. The
// liv assistant core (an npm workspace) and livinityd (a pnpm workspace) are
// separate packages with no wired cross-package import, so the guard is copied
// here verbatim rather than imported. Keep the two in behavioural sync if either
// changes. The file is self-contained (only `node:dns`).
//
// A naive guard that tests only the LITERAL hostname against a regex is bypassed
// by:
//   - DNS rebinding: a public-looking name that resolves to a private IP.
//   - IPv4-mapped IPv6 literals: [::ffff:127.0.0.1] (and [::ffff:a.b.c.d]).
//   - Integer-encoded IPv4 hostnames: 2130706433 / 0x7f000001 == 127.0.0.1.
//
// assertResolvedHostSafe() closes those:
//   1. Enforce http/https.
//   2. Canonicalize the hostname (strip brackets, map ::ffff:a.b.c.d → dotted
//      quad, parse decimal/hex/octal integer hostnames → dotted quad).
//   3. If the host is an IP literal, classify it directly; otherwise DNS-resolve
//      (injectable lookup for offline tests) and classify EVERY resolved IP.
//   4. ANY private/loopback/link-local/ULA address → throw.

import dns from 'node:dns'

export interface AssertResolvedHostSafeOptions {
	/** Injectable resolver (offline tests). Returns the list of addresses for a host. */
	lookup?: (host: string) => Promise<string[]>
}

// ── IPv4 helpers ────────────────────────────────────────────────────────────

function parseDottedIPv4(host: string): [number, number, number, number] | null {
	const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (!m) return null
	const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [
		number,
		number,
		number,
		number,
	]
	if (o.some((n) => n > 255)) return null
	return o
}

// Parse an integer-encoded IPv4 hostname (decimal, hex 0x…, octal 0…) into a
// dotted quad. Returns null if it is not a bare integer literal.
function parseIntegerIPv4(host: string): [number, number, number, number] | null {
	let value: number | null = null
	if (/^0x[0-9a-f]+$/i.test(host)) {
		value = parseInt(host, 16)
	} else if (/^0[0-7]+$/.test(host)) {
		value = parseInt(host, 8)
	} else if (/^\d+$/.test(host)) {
		value = parseInt(host, 10)
	}
	if (value === null || !Number.isFinite(value) || value < 0 || value > 0xffffffff) {
		return null
	}
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function isPrivateIPv4(octets: [number, number, number, number]): boolean {
	const [a, b] = octets
	if (a === 10) return true // 10.0.0.0/8
	if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
	if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT / Tailscale tailnet
	if (a === 192 && b === 168) return true // 192.168.0.0/16
	if (a === 127) return true // 127.0.0.0/8 loopback
	if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
	if (a === 0) return true // 0.0.0.0/8 "this host"
	return false
}

// ── IPv6 helpers ────────────────────────────────────────────────────────────

// Canonicalize an IPv6 string: strip surrounding brackets, lowercase, and if it
// is an IPv4-mapped form (::ffff:a.b.c.d or ::ffff:7f00:0001) return the
// embedded dotted-quad IPv4 string so it is classified as IPv4.
function ipv4FromMappedV6(host: string): string | null {
	const lower = host.toLowerCase()
	// ::ffff:127.0.0.1 form
	const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
	if (dotted) return dotted[1]
	// ::ffff:7f00:0001 hex form
	const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
	if (hex) {
		const hi = parseInt(hex[1], 16)
		const lo = parseInt(hex[2], 16)
		return [(hi >>> 8) & 0xff, hi & 0xff, (lo >>> 8) & 0xff, lo & 0xff].join('.')
	}
	return null
}

function isPrivateIPv6(host: string): boolean {
	const lower = host.toLowerCase()
	if (lower === '::1') return true // loopback
	if (lower === '::') return true // unspecified
	// fc00::/7 ULA — first hextet fc.. or fd..
	if (/^f[cd][0-9a-f]{0,2}(:|$)/i.test(lower)) return true
	// fe80::/10 link-local
	if (/^fe[89ab][0-9a-f]?(:|$)/i.test(lower)) return true
	return false
}

// ── Classification ──────────────────────────────────────────────────────────

// Returns true if `address` (an IP literal OR a canonicalizable host token) is a
// private/loopback/link-local/ULA target.
function isPrivateAddress(address: string): boolean {
	let host = address.trim()
	if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
	host = host.toLowerCase()

	// IPv4-mapped IPv6 → reduce to the embedded IPv4.
	const mapped = ipv4FromMappedV6(host)
	if (mapped) host = mapped

	// Dotted-quad IPv4.
	const dotted = parseDottedIPv4(host)
	if (dotted) return isPrivateIPv4(dotted)

	// Integer-encoded IPv4 (decimal/hex/octal) — only when there is no ':' (so we
	// don't misread an IPv6 group) and it is a bare integer literal.
	if (!host.includes(':')) {
		const intV4 = parseIntegerIPv4(host)
		if (intV4) return isPrivateIPv4(intV4)
	}

	// IPv6 literal.
	if (host.includes(':')) return isPrivateIPv6(host)

	// localhost literal.
	if (host === 'localhost') return true

	return false
}

// Is `host` an IP literal (v4 dotted, v4 integer-encoded, or v6) rather than a
// DNS name we must resolve?
function isIpLiteral(host: string): boolean {
	let h = host.trim()
	if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
	if (parseDottedIPv4(h)) return true
	if (!h.includes(':') && parseIntegerIPv4(h) && !/[a-z]/i.test(h.replace(/^0x/i, ''))) {
		// bare integer (decimal/hex/octal) IPv4
		return true
	}
	if (h.includes(':')) return true // any IPv6 form
	return false
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

/**
 * Throws if `urlStr` targets a private/internal address — either as a literal,
 * an IPv4-mapped IPv6 / integer-encoded IP, or via DNS resolution (rebind).
 * Enforces http/https. Resolves names with `opts.lookup` (default node dns).
 */
export async function assertResolvedHostSafe(
	urlStr: string,
	opts: AssertResolvedHostSafeOptions = {},
): Promise<void> {
	let parsed: URL
	try {
		parsed = new URL(urlStr)
	} catch {
		throw new Error(`SSRF blocked: invalid URL ${urlStr}`)
	}

	if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
		throw new Error(
			`SSRF blocked: scheme '${parsed.protocol.replace(':', '')}' is not allowed (http/https only)`,
		)
	}

	const rawHost = parsed.hostname
	if (!rawHost) throw new Error(`SSRF blocked: URL ${urlStr} has no host`)

	// 1. Literal-target fast path (covers IPv4 dotted/integer, IPv6, IPv4-mapped).
	if (isIpLiteral(rawHost)) {
		if (isPrivateAddress(rawHost)) {
			throw new Error(`SSRF blocked: ${rawHost} is a private/internal address`)
		}
		return
	}

	// localhost literal (a name, but unambiguously internal).
	if (rawHost.toLowerCase() === 'localhost') {
		throw new Error('SSRF blocked: localhost resolves to a loopback address')
	}

	// 2. DNS-resolve the name and classify EVERY resolved address (DNS-rebind).
	const lookup =
		opts.lookup ??
		((h: string) => dns.promises.lookup(h, {all: true}).then((rows) => rows.map((r) => r.address)))

	let addresses: string[]
	try {
		addresses = await lookup(rawHost)
	} catch (err) {
		throw new Error(`SSRF blocked: could not resolve host '${rawHost}' (${(err as Error).message})`)
	}

	if (!addresses || addresses.length === 0) {
		throw new Error(`SSRF blocked: host '${rawHost}' resolved to no addresses`)
	}

	for (const addr of addresses) {
		if (isPrivateAddress(addr)) {
			throw new Error(
				`SSRF blocked: ${rawHost} resolves to a private/internal address (${addr})`,
			)
		}
	}
}
