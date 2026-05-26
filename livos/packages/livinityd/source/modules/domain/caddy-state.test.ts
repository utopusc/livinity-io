// livos/packages/livinityd/source/modules/domain/caddy-state.test.ts
// Phase 218 T2 — unit tests for buildCaddyConfigFromState.
import {describe, it, expect} from 'vitest'
import {buildCaddyConfigFromState, type CaddyStateDeps} from './caddy-state.js'

function makeDeps(overrides: Partial<CaddyStateDeps> = {}): CaddyStateDeps {
	return {
		getInstances: async () => [],
		getSubdomains: async () => [],
		getMainDomain: async () => 'bruce.livinity.io',
		...overrides,
	}
}

describe('buildCaddyConfigFromState', () => {
	it('emits one host block per running instance', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
					{userId: 'u1', username: 'bruce', appSlug: 'immich', port: 10002, status: 'running'},
					{userId: 'u1', username: 'bruce', appSlug: 'adguard-home', port: 10003, status: 'running'},
				],
			}),
		)
		expect(cfg.mainDomain).toBe('bruce.livinity.io')
		expect(cfg.subdomains).toHaveLength(3)
		expect(cfg.subdomains.map((s) => s.host)).toEqual([
			'bolt-diy-bruce.livinity.io',
			'immich-bruce.livinity.io',
			'adguard-home-bruce.livinity.io',
		])
		expect(cfg.subdomains.every((s) => s.enabled)).toBe(true)
	})

	it('skips non-running instances (stopped, failed)', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
					{userId: 'u1', username: 'bruce', appSlug: 'immich', port: 10002, status: 'stopped'},
					{userId: 'u1', username: 'bruce', appSlug: 'nextcloud', port: 10003, status: 'failed'},
				],
			}),
		)
		expect(cfg.subdomains).toHaveLength(1)
		expect(cfg.subdomains[0].appId).toBe('bolt-diy')
	})

	it('prefers cached canonical FQDN over compute fallback', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
				],
				getSubdomains: async () => [
					{userId: 'u1', appSlug: 'bolt-diy', subdomain: 'bolt.custom.example.com'},
				],
			}),
		)
		expect(cfg.subdomains[0].host).toBe('bolt.custom.example.com')
	})

	it('falls back to compute path when subdomain cache is empty', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
				],
				getSubdomains: async () => [],
			}),
		)
		expect(cfg.subdomains[0].host).toBe('bolt-diy-bruce.livinity.io')
	})

	it('survives missing user_app_subdomains table (pre-T3 box)', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
				],
				getSubdomains: async () => {
					throw new Error('relation "user_app_subdomains" does not exist')
				},
			}),
		)
		expect(cfg.subdomains).toHaveLength(1)
		expect(cfg.subdomains[0].host).toBe('bolt-diy-bruce.livinity.io')
	})

	it('drops instances when mainDomain is null and no cached host exists', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
				],
				getMainDomain: async () => null,
			}),
		)
		expect(cfg.mainDomain).toBe(null)
		expect(cfg.subdomains).toHaveLength(0)
	})

	it('still emits when only cached host exists (no mainDomain)', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'bolt-diy', port: 10001, status: 'running'},
				],
				getSubdomains: async () => [
					{userId: 'u1', appSlug: 'bolt-diy', subdomain: 'bolt-diy-bruce.livinity.io'},
				],
				getMainDomain: async () => null,
			}),
		)
		expect(cfg.subdomains).toHaveLength(1)
		expect(cfg.subdomains[0].host).toBe('bolt-diy-bruce.livinity.io')
	})

	it('multi-user: two users with same app slug emit distinct hosts', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'bruce', appSlug: 'immich', port: 10001, status: 'running'},
					{userId: 'u2', username: 'alice', appSlug: 'immich', port: 10002, status: 'running'},
				],
			}),
		)
		expect(cfg.subdomains.map((s) => s.host)).toEqual([
			'immich-bruce.livinity.io',
			'immich-alice.livinity.io',
		])
	})

	it('lowercases hosts', async () => {
		const cfg = await buildCaddyConfigFromState(
			makeDeps({
				getInstances: async () => [
					{userId: 'u1', username: 'Bruce', appSlug: 'Bolt-DIY', port: 10001, status: 'running'},
				],
			}),
		)
		expect(cfg.subdomains[0].host).toBe('bolt-diy-bruce.livinity.io')
	})
})
