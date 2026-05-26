/**
 * Phase 219 T4 — unit tests for verifyDns + tunnelMode loosening.
 *
 * The historical bug: subdomain DNS records in LivOS hybrid/tunnel
 * deploys point at Server5 (the relay), not the Mini PC, so the
 * `currentIp === expectedIp` test was structurally unreachable and the
 * UI sat on "DNS pending" forever. tunnelMode=true reduces match to
 * "DNS resolved to anything" — the operator's actual question.
 */
import {describe, expect, test, vi} from 'vitest'

import {verifyDns} from './dns-check.js'

vi.mock('node:dns/promises', () => {
	const records = new Map<string, string[]>()
	return {
		default: {
			resolve4: vi.fn(async (domain: string) => {
				const addrs = records.get(domain)
				if (!addrs) {
					const err = new Error(`ENOTFOUND ${domain}`) as Error & {code: string}
					err.code = 'ENOTFOUND'
					throw err
				}
				return addrs
			}),
			__setRecord: (domain: string, ips: string[] | null) => {
				if (ips === null) records.delete(domain)
				else records.set(domain, ips)
			},
		},
	}
})

const dns = (await import('node:dns/promises')).default as unknown as {
	__setRecord: (domain: string, ips: string[] | null) => void
}

describe('verifyDns', () => {
	test('legacy direct-A-record case: match true when currentIp === expectedIp', async () => {
		dns.__setRecord('legacy.example.com', ['1.2.3.4'])
		const result = await verifyDns('legacy.example.com', '1.2.3.4')
		expect(result.resolved).toBe(true)
		expect(result.currentIp).toBe('1.2.3.4')
		expect(result.match).toBe(true)
		expect(result.tunnelMode).toBe(false)
	})

	test('legacy direct-A-record case: match false when IPs differ', async () => {
		dns.__setRecord('drift.example.com', ['9.9.9.9'])
		const result = await verifyDns('drift.example.com', '1.2.3.4')
		expect(result.resolved).toBe(true)
		expect(result.match).toBe(false)
		expect(result.reason).toMatch(/may still be propagating/)
	})

	test('Phase 219 T4: tunnelMode loosens match to "any successful resolution"', async () => {
		// Real LivOS topology: DNS A record points at Server5 (45.137.194.102),
		// but the LivOS Mini PC's public IP is something completely different
		// (e.g. CGNAT, residential WAN). Without tunnelMode this would be a
		// permanent "DNS pending" — the operator's exact complaint on 2026-05-26.
		dns.__setRecord('filebrowser-bruce.livinity.io', ['45.137.194.102'])
		const result = await verifyDns(
			'filebrowser-bruce.livinity.io',
			'104.28.143.55' /* fake Mini PC public IP — unrelated to Server5 */,
			true /* tunnelMode */,
		)
		expect(result.resolved).toBe(true)
		expect(result.currentIp).toBe('45.137.194.102')
		expect(result.match).toBe(true) // ← the fix: doesn't require IP equality
		expect(result.tunnelMode).toBe(true)
		expect(result.reason).toMatch(/via tunnel\/relay/)
	})

	test('Phase 219 T4: tunnelMode still fails when DNS itself is unresolved', async () => {
		dns.__setRecord('never-minted.livinity.io', null)
		const result = await verifyDns('never-minted.livinity.io', '1.2.3.4', true)
		expect(result.resolved).toBe(false)
		expect(result.match).toBe(false)
		expect(result.reason).toMatch(/lookup failed/)
	})

	test('Phase 219 T4: tunnelMode reason text mentions multi-tenant / tunnel', async () => {
		dns.__setRecord('apex.example.com', ['1.1.1.1'])
		const result = await verifyDns('apex.example.com', '1.1.1.1', true)
		expect(result.reason).toMatch(/tunnel|relay|multi-tenant/)
	})
})
