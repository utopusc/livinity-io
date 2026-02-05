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
 * @param domain - The domain to check (e.g. "myserver.example.com")
 * @param expectedIp - The server's public IP that the domain should point to
 */
export async function verifyDns(domain: string, expectedIp: string): Promise<DnsVerifyResult> {
	try {
		const addresses = await dns.resolve4(domain)
		const currentIp = addresses[0] || null

		return {
			resolved: true,
			currentIp,
			expected: expectedIp,
			match: currentIp === expectedIp,
		}
	} catch (err: any) {
		// ENOTFOUND, ENODATA, etc. — DNS record doesn't exist yet
		return {
			resolved: false,
			currentIp: null,
			expected: expectedIp,
			match: false,
		}
	}
}
