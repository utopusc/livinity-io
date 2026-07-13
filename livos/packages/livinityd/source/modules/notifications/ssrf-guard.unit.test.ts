// Phase 310-01 (ALERT-02, T-310-01) — SSRF guard unit tests.
//
// The guard is the crux of "no webhook/ntfy fetch to an internal address". These
// tests run fully offline: literal targets need no DNS, and name targets use the
// injectable `opts.lookup` seam so DNS-rebind is exercised deterministically.
//
// Every rejection must throw an Error whose message starts with `SSRF blocked`.

import {describe, expect, test} from 'vitest'

import {assertResolvedHostSafe} from './ssrf-guard.js'

describe('notifications/ssrf-guard assertResolvedHostSafe', () => {
	test('a: loopback literal http://127.0.0.1/x is rejected', async () => {
		await expect(assertResolvedHostSafe('http://127.0.0.1/x')).rejects.toThrow(/^SSRF blocked/)
	})

	test('b: integer-encoded IPv4 http://2130706433/ (== 127.0.0.1) is rejected', async () => {
		await expect(assertResolvedHostSafe('http://2130706433/')).rejects.toThrow(/^SSRF blocked/)
	})

	test('c: IPv4-mapped IPv6 http://[::ffff:127.0.0.1]/ is rejected', async () => {
		await expect(assertResolvedHostSafe('http://[::ffff:127.0.0.1]/')).rejects.toThrow(
			/^SSRF blocked/,
		)
	})

	test('d: disallowed scheme ftp://example.com is rejected', async () => {
		await expect(assertResolvedHostSafe('ftp://example.com')).rejects.toThrow(/^SSRF blocked/)
	})

	test('e: public IPv4 literal http://93.184.216.34/ resolves OK (no throw)', async () => {
		await expect(assertResolvedHostSafe('http://93.184.216.34/')).resolves.toBeUndefined()
	})

	test('f: DNS-rebind — a public name resolving to a private IP is rejected', async () => {
		await expect(
			assertResolvedHostSafe('https://totally-public-looking.example.com/hook', {
				lookup: async () => ['10.0.0.5'],
			}),
		).rejects.toThrow(/^SSRF blocked/)
	})

	test('g: a public name resolving to a public IP resolves OK (no throw)', async () => {
		await expect(
			assertResolvedHostSafe('https://totally-public-looking.example.com/hook', {
				lookup: async () => ['93.184.216.34'],
			}),
		).resolves.toBeUndefined()
	})

	// Extra coverage beyond the required 7 — the `localhost` name short-circuit and
	// a private RFC1918 literal, both common webhook-URL footguns.
	test('h: the localhost name literal is rejected without a DNS lookup', async () => {
		await expect(
			assertResolvedHostSafe('http://localhost:8080/hook', {
				lookup: async () => {
					throw new Error('lookup must not be called for localhost')
				},
			}),
		).rejects.toThrow(/^SSRF blocked/)
	})

	test('i: RFC1918 literal http://192.168.1.10/ is rejected', async () => {
		await expect(assertResolvedHostSafe('http://192.168.1.10/')).rejects.toThrow(/^SSRF blocked/)
	})

	test('j: one of several resolved addresses being private rejects the whole host', async () => {
		await expect(
			assertResolvedHostSafe('https://mixed.example.com/hook', {
				lookup: async () => ['93.184.216.34', '169.254.169.254'],
			}),
		).rejects.toThrow(/^SSRF blocked/)
	})
})
