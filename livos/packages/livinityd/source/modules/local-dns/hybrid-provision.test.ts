// livos/packages/livinityd/source/modules/local-dns/hybrid-provision.test.ts
// Phase 104 plan 104-04 Task 1 — TDD test suite for the Server5 control-plane
// subdomain mint helper.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect} from 'vitest'
import {mkdtemp, readFile, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {provisionHybridSubdomain, writeCfTokenSecret, ServerSideProvisionUnavailable} from './hybrid-provision.js'

// ─── Helpers ────────────────────────────────────────────────────────
function makeFetcher(status: number, body: unknown, opts: {throws?: boolean} = {}): typeof fetch {
	return (async (_url: any, _init: any) => {
		if (opts.throws) throw new Error('ENOTFOUND')
		return new Response(JSON.stringify(body), {
			status,
			headers: {'content-type': 'application/json'},
		}) as any
	}) as any
}

describe('provisionHybridSubdomain', () => {
	it('returns subdomain + zoneId on 200 happy path', async () => {
		const fetcher = makeFetcher(200, {
			subdomain: 'ab12cd34.home.livinity.io',
			zoneId: 'cf-zone-abc',
		})
		const r = await provisionHybridSubdomain({
			hostIp: '192.168.1.100',
			cloudflareApiToken: 'tok-xyz',
			fetcher,
		})
		expect(r.subdomain).toBe('ab12cd34.home.livinity.io')
		expect(r.zoneId).toBe('cf-zone-abc')
	})

	it('throws ServerSideProvisionUnavailable on 404', async () => {
		const fetcher = makeFetcher(404, {error: 'not yet deployed'})
		await expect(
			provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			}),
		).rejects.toBeInstanceOf(ServerSideProvisionUnavailable)
	})

	it('throws ServerSideProvisionUnavailable on 503', async () => {
		const fetcher = makeFetcher(503, {error: 'busy'})
		await expect(
			provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			}),
		).rejects.toBeInstanceOf(ServerSideProvisionUnavailable)
	})

	it('throws ServerSideProvisionUnavailable on network error', async () => {
		const fetcher = makeFetcher(0, null, {throws: true})
		await expect(
			provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			}),
		).rejects.toBeInstanceOf(ServerSideProvisionUnavailable)
	})

	it('marks ServerSideProvisionUnavailable as recoverable: true', async () => {
		const fetcher = makeFetcher(404, null)
		try {
			await provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			})
			throw new Error('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(ServerSideProvisionUnavailable)
			expect((err as ServerSideProvisionUnavailable).recoverable).toBe(true)
		}
	})

	it('rejects malformed Server5 response (missing zoneId)', async () => {
		const fetcher = makeFetcher(200, {subdomain: 'ab12.home.livinity.io'})
		await expect(
			provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			}),
		).rejects.toThrow(/malformed/)
	})

	it('rejects malformed Server5 response (wrong domain apex)', async () => {
		const fetcher = makeFetcher(200, {
			subdomain: 'evil.example.com',
			zoneId: 'cf-z',
		})
		await expect(
			provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			}),
		).rejects.toThrow(/malformed/)
	})

	it('does NOT leak the Cloudflare API token in error messages', async () => {
		const fetcher = makeFetcher(500, {error: 'internal'})
		const SECRET = 'super-secret-token-123'
		try {
			await provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: SECRET,
				fetcher,
			})
			throw new Error('should have thrown')
		} catch (err) {
			expect(String(err)).not.toContain(SECRET)
			// Also walk the cause chain in case fetch error preserved it
			const errObj: any = err
			expect(JSON.stringify(errObj.cause ?? '')).not.toContain(SECRET)
		}
	})

	it('honors LIVINITY_INSTALL_TOKEN env via Authorization header', async () => {
		const seen: any[] = []
		const fetcher = (async (_url: any, init: any) => {
			seen.push(init)
			return new Response(
				JSON.stringify({
					subdomain: 'ok.home.livinity.io',
					zoneId: 'z',
				}),
				{status: 200, headers: {'content-type': 'application/json'}},
			) as any
		}) as any
		process.env.LIVINITY_INSTALL_TOKEN = 'install-tok'
		try {
			await provisionHybridSubdomain({
				hostIp: '192.168.1.100',
				cloudflareApiToken: 'tok',
				fetcher,
			})
			expect(seen[0].headers.authorization).toBe('Bearer install-tok')
		} finally {
			delete process.env.LIVINITY_INSTALL_TOKEN
		}
	})
})

describe('writeCfTokenSecret', () => {
	it('writes file with 0600 mode and contains CLOUDFLARE_API_TOKEN=<value>', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'livos-cf-tok-'))
		const file = path.join(dir, 'cf-token')
		await writeCfTokenSecret('the-token-value', file)
		const s = await stat(file)
		// POSIX permission bits — verify owner-read+write only (0o600).
		// On Windows this is a no-op (NTFS doesn't honor POSIX mode bits); guard.
		if (process.platform !== 'win32') {
			expect(s.mode & 0o777).toBe(0o600)
		}
		const content = await readFile(file, 'utf-8')
		expect(content).toContain('CLOUDFLARE_API_TOKEN=the-token-value')
	})
})
