/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi} from 'vitest'

// Mock caddy.ts so we don't hit disk
vi.mock('../domain/caddy.js', () => ({
	generateLocalCaddyfile: vi.fn().mockReturnValue('# generated\n'),
	validateLocalTld: (t: string) =>
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
			t,
		),
	writeCaddyfile: vi.fn().mockResolvedValue(undefined),
	reloadCaddy: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./pki.js', () => ({
	readRootCert: vi.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----\n'),
}))

// Map-backed fake Redis (mirrors apps/native-app-config.test.ts pattern)
function makeFakeRedis() {
	const store = new Map<string, string>()
	return {
		async get(k: string) {
			return store.get(k) ?? null
		},
		async set(k: string, v: string) {
			store.set(k, v)
			return 'OK'
		},
		async del(k: string) {
			return store.delete(k) ? 1 : 0
		},
	}
}

describe('local-dns/routes — Phase 104 plan 104-03', () => {
	it('local.getStatus returns mode/tld/hostIp/caCertAvailable shape', async () => {
		const redis = makeFakeRedis()
		await redis.set('livos:domain:local_mode', 'local-lan')
		await redis.set('livos:domain:local_tld', 'livinity.local')
		await redis.set('livos:domain:host_ip', '192.168.1.100')

		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			// Bypass isAuthenticated middleware in unit tests (production calls
			// route through Express + JWT verification — see is-authenticated.ts:12)
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const status = await caller.getStatus()
		expect(status.mode).toBe('local-lan')
		expect(status.tld).toBe('livinity.local')
		expect(status.hostIp).toBe('192.168.1.100')
		expect(status.caCertAvailable).toBe(true)
	})

	it('local.activate rejects invalid hostIp', async () => {
		const redis = makeFakeRedis()
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			// Bypass isAuthenticated middleware in unit tests (production calls
			// route through Express + JWT verification — see is-authenticated.ts:12)
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		await expect(
			caller.activate({tld: 'livinity.local', hostIp: '999.999.999.999'}),
		).rejects.toThrow()
	})

	it('local.activate writes Redis keys + calls writeCaddyfile + reloadCaddy', async () => {
		const redis = makeFakeRedis()
		const caddyMod = await import('../domain/caddy.js')
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			// Bypass isAuthenticated middleware in unit tests (production calls
			// route through Express + JWT verification — see is-authenticated.ts:12)
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const r = await caller.activate({
			tld: 'livinity.local',
			hostIp: '192.168.1.100',
		})
		expect(r.success).toBe(true)
		expect(await redis.get('livos:domain:local_mode')).toBe('local-lan')
		expect(await redis.get('livos:domain:local_tld')).toBe('livinity.local')
		expect(await redis.get('livos:domain:host_ip')).toBe('192.168.1.100')
		expect(caddyMod.generateLocalCaddyfile).toHaveBeenCalled()
		expect(caddyMod.writeCaddyfile).toHaveBeenCalled()
		expect(caddyMod.reloadCaddy).toHaveBeenCalled()
	})
})
