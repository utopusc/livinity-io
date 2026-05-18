/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi} from 'vitest'

// Phase 142-01 — local-lan mocks dropped (generateLocalCaddyfile,
// validateLocalTld, pki readRootCert).
// Phase 143-03 — caddy.ts exports renamed `*Hybrid*` → `*Portal*`. The mock
// below exposes BOTH names pointing at the same spies so legacy callers
// (back-compat aliases) and the renamed callers exercise identical behavior.
const _generateCaddyfileSpy = vi.fn().mockReturnValue('# generated portal\n')
const _validateDomainSpy = (d: string) =>
	typeof d === 'string' &&
	d.length > 0 &&
	d.length <= 253 &&
	!d.endsWith('.local') &&
	!d.includes('..') &&
	!d.includes('/') &&
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(d)
vi.mock('../domain/caddy.js', () => ({
	generatePortalCaddyfile: _generateCaddyfileSpy,
	generateHybridCaddyfile: _generateCaddyfileSpy, // alias, same spy
	validatePortalDomain: _validateDomainSpy,
	validateHybridDomain: _validateDomainSpy, // alias
	writeCaddyfile: vi.fn().mockResolvedValue(undefined),
	reloadCaddy: vi.fn().mockResolvedValue(undefined),
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

describe('local-dns/routes — Phase 142-01 retirement guard', () => {
	it('local.getStatus returns mode/tld/hostIp/caCertAvailable=false shape', async () => {
		// Phase 142-01: caCertAvailable always reports false (internal-CA
		// path retired with local-lan). Field retained for back-compat with
		// the wizard's existing destructure.
		const redis = makeFakeRedis()
		await redis.set('livos:domain:local_mode', 'portal')
		await redis.set('livos:domain:host_ip', '192.168.1.100')

		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const status = await caller.getStatus()
		expect(status.mode).toBe('portal')
		expect(status.hostIp).toBe('192.168.1.100')
		expect(status.caCertAvailable).toBe(false)
	})

	it('local.activate procedure is no longer in the router (Phase 142-01)', async () => {
		const localRouter = (await import('./routes.js')).default
		// tRPC v11 routers expose their procedure map at `_def.procedures`.
		const procs = (localRouter as any)._def?.procedures ?? {}
		expect(procs.activate).toBeUndefined()
	})

	it('local.getCaCert procedure is no longer in the router (Phase 142-01)', async () => {
		const localRouter = (await import('./routes.js')).default
		const procs = (localRouter as any)._def?.procedures ?? {}
		expect(procs.getCaCert).toBeUndefined()
	})
})

describe('local-dns/routes — Phase 104 plan 104-04 — hybrid procedures', () => {
	it('local.activateHybrid rejects invalid subdomain (.local)', async () => {
		const redis = makeFakeRedis()
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		await expect(
			caller.activateHybrid({
				subdomain: 'bruce.livinity.local',
				zoneId: 'cf-z',
				hostIp: '192.168.1.100',
			}),
		).rejects.toThrow()
	})

	it('local.activateHybrid rejects invalid hostIp', async () => {
		const redis = makeFakeRedis()
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		await expect(
			caller.activateHybrid({
				subdomain: 'ab12cd34.home.livinity.io',
				zoneId: 'cf-z',
				hostIp: '999.999.999.999',
			}),
		).rejects.toThrow()
	})

	it('local.activateHybrid writes Redis keys + calls generateHybridCaddyfile', async () => {
		const redis = makeFakeRedis()
		const caddyMod = await import('../domain/caddy.js')
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const r = await caller.activateHybrid({
			subdomain: 'ab12cd34.home.livinity.io',
			zoneId: 'cf-zone-abc',
			hostIp: '192.168.1.100',
		})
		expect(r.success).toBe(true)
		// Phase 142-02: activateHybrid now writes 'portal' (the rename)
		// while keeping the tRPC procedure name for wire-level back-compat.
		expect(r.mode).toBe('portal')
		expect(r.subdomain).toBe('ab12cd34.home.livinity.io')
		expect(await redis.get('livos:domain:local_mode')).toBe('portal')
		expect(await redis.get('livos:domain:hybrid_subdomain')).toBe(
			'ab12cd34.home.livinity.io',
		)
		expect(await redis.get('livos:domain:hybrid_zone_id')).toBe('cf-zone-abc')
		expect(await redis.get('livos:domain:host_ip')).toBe('192.168.1.100')
		expect(caddyMod.generatePortalCaddyfile).toHaveBeenCalled()
		expect(caddyMod.writeCaddyfile).toHaveBeenCalled()
		expect(caddyMod.reloadCaddy).toHaveBeenCalled()
	})

	it('local.getHybridStatus returns hybrid subdomain/zone shape', async () => {
		const redis = makeFakeRedis()
		await redis.set('livos:domain:hybrid_subdomain', 'ab12cd34.home.livinity.io')
		await redis.set('livos:domain:hybrid_zone_id', 'cf-z')
		await redis.set('livos:domain:host_ip', '192.168.1.100')
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const status = await caller.getHybridStatus()
		expect(status.subdomain).toBe('ab12cd34.home.livinity.io')
		expect(status.zoneId).toBe('cf-z')
		expect(status.hostIp).toBe('192.168.1.100')
		// cfTokenAvailable will be false (no real file in test env)
		expect(typeof status.cfTokenAvailable).toBe('boolean')
		expect(status.cfTokenAvailable).toBe(false)
	})

	it('local.getHybridStatus returns nulls when no Redis state', async () => {
		const redis = makeFakeRedis()
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const status = await caller.getHybridStatus()
		expect(status.subdomain).toBeNull()
		expect(status.zoneId).toBeNull()
		expect(status.hostIp).toBeNull()
		expect(status.cfTokenAvailable).toBe(false)
	})
})

// ─── Phase 143-01 — Portal wire-rename + alias back-compat ──────────────

describe('local-dns/routes — Phase 143-01 Portal procedures (wire rename)', () => {
	it('local.activatePortal writes Redis keys via the renamed procedure', async () => {
		const redis = makeFakeRedis()
		const caddyMod = await import('../domain/caddy.js')
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const r = await caller.activatePortal({
			subdomain: 'ab12cd34.home.livinity.io',
			zoneId: 'cf-zone-portal',
			hostIp: '192.168.1.100',
		})
		expect(r.success).toBe(true)
		expect(r.mode).toBe('portal')
		expect(await redis.get('livos:domain:local_mode')).toBe('portal')
		expect(caddyMod.generatePortalCaddyfile).toHaveBeenCalled()
	})

	it('local.getPortalStatus returns the same shape as getHybridStatus', async () => {
		const redis = makeFakeRedis()
		await redis.set('livos:domain:hybrid_subdomain', 'sample.home.livinity.io')
		await redis.set('livos:domain:hybrid_zone_id', 'cf-z')
		await redis.set('livos:domain:host_ip', '10.0.0.5')
		const localRouter = (await import('./routes.js')).default
		const caller = (localRouter as any).createCaller({
			livinityd: {ai: {redis}},
			currentUser: {id: 'test-user', role: 'admin', username: 'admin'},
			dangerouslyBypassAuthentication: true,
			logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}},
		})
		const status = await caller.getPortalStatus()
		expect(status.subdomain).toBe('sample.home.livinity.io')
		expect(status.zoneId).toBe('cf-z')
		expect(status.hostIp).toBe('10.0.0.5')
		expect(status.cfTokenAvailable).toBe(false)
	})

	it('legacy aliases (activateHybrid / getHybridStatus / provisionHybrid) still exist on the router', async () => {
		const localRouter = (await import('./routes.js')).default
		const procs = (localRouter as any)._def?.procedures ?? {}
		// Phase 143-01 back-compat contract: aliases stay until Phase 144+.
		expect(procs.activateHybrid).toBeDefined()
		expect(procs.getHybridStatus).toBeDefined()
		expect(procs.provisionHybrid).toBeDefined()
		// And the new canonical names are alongside them.
		expect(procs.activatePortal).toBeDefined()
		expect(procs.getPortalStatus).toBeDefined()
		expect(procs.provisionPortal).toBeDefined()
	})
})
