import dns from 'node:dns/promises'

// ─── DNS Check Utility ──────────────────────────────────────────
// Detects server public IP and verifies DNS A record propagation.
// Used by the domain setup wizard to confirm DNS is pointing
// to this server before activating HTTPS via Caddy.
// ─────────────────────────────────────────────────────────────────

export interface DnsVerifyResult {
	resolved: boolean
	currentIp: string | null
	expected: string
	match: boolean
	/**
	 * Phase 219 T4 — when `tunnelMode` is true, `match` is computed as
	 * `resolved` (any successful DNS resolution counts) instead of
	 * `currentIp === expected`. Reason: in LivOS multi-tenant deploys, the
	 * DNS A record points at Server5 / Cloudflare, NOT the Mini PC, so
	 * IP-equality is structurally unreachable. The operator wants "is DNS
	 * propagation done?" — that is `resolved`.
	 */
	tunnelMode?: boolean
	/** Human-readable explanation surfaced to the UI tooltip / log line. */
	reason?: string
}

/**
 * Detect the server's public IPv4 address using ipify.
 * Falls back to icanhazip if ipify is unreachable.
 */
export async function getPublicIp(): Promise<string> {
	try {
		const res = await fetch('https://api.ipify.org?format=json')
		const data = (await res.json()) as {ip: string}
		return data.ip
	} catch {
		// Fallback
		const res = await fetch('https://icanhazip.com')
		const text = await res.text()
		return text.trim()
	}
}

/**
 * Verify that a domain's A record resolves to the expected IP.
 *
 * Phase 219 T4 — gained the `tunnelMode` parameter. When true (the LivOS
 * Mini PC + Server5-relay topology), `match` reduces to `resolved` because
 * the A record points at Server5 / Cloudflare, not the Mini PC, so the
 * historical `currentIp === expectedIp` invariant is structurally
 * unreachable and the UI stuck on "DNS pending" forever (operator UAT
 * 2026-05-26: "DNS PENDING diyor surekli").
 *
 * @param domain - The domain to check (e.g. "myserver.example.com")
 * @param expectedIp - The server's public IP that the domain should point to (ignored when tunnelMode)
 * @param tunnelMode - Loosen IP-equality to "DNS resolves anywhere"; default false
 */
export async function verifyDns(
	domain: string,
	expectedIp: string,
	tunnelMode = false,
): Promise<DnsVerifyResult> {
	try {
		const addresses = await dns.resolve4(domain)
		const currentIp = addresses[0] || null
		const ipMatch = currentIp === expectedIp
		const match = tunnelMode ? Boolean(currentIp) : ipMatch
		return {
			resolved: true,
			currentIp,
			expected: expectedIp,
			match,
			tunnelMode,
			reason: tunnelMode
				? currentIp
					? `Resolved to ${currentIp} via tunnel/relay (IP-equality with Mini PC skipped — multi-tenant deploy).`
					: 'DNS resolved but returned no addresses.'
				: ipMatch
					? `Resolved to ${currentIp}, matches server public IP.`
					: `Resolved to ${currentIp} but expected ${expectedIp} — A record may still be propagating.`,
		}
	} catch (err: any) {
		// ENOTFOUND, ENODATA, etc. — DNS record doesn't exist yet
		return {
			resolved: false,
			currentIp: null,
			expected: expectedIp,
			match: false,
			tunnelMode,
			reason: `DNS lookup failed (${err?.code ?? 'unknown'}). The record may still be propagating or was never minted.`,
		}
	}
}
