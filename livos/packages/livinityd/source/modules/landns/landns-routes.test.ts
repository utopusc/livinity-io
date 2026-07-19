/**
 * Phase 347-03 (LANDNS-01, D-347-3/4/5) — landns tRPC route + disjointness-from-CF tests.
 *
 * Pins the trust boundary of the landns* routes WITHOUT a live sudo/dnsmasq/avahi, and
 * STRUCTURALLY proves the module can never read/write the CF/portal state:
 *   V4 — every route is admin-gated (a non-admin member is refused before the resolver).
 *   ZOD — landnsEnable rejects a malformed hostIp (IPv4) and a bad domain (bare TLD,
 *         `.local` FQDN, empty, path-injection) at the input boundary BEFORE any spawn.
 *   ACCEPT — a valid (hostIp, real-FQDN) pair resolves without throw; with spawn mocked
 *            to close(0) the store-mirror branch runs offline and writes the landns key.
 *   DISJOINTNESS — read the routes.ts SOURCE text and assert it contains NONE of the
 *            CF/portal substrings — a refactor-surviving guarantee that the LANDNS control
 *            plane is disjoint from the CF portal path (D-347-5, T-347-12).
 *
 * spawn is the only external effect; the admin-gate + zod tests reject before it.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {readFileSync} from 'node:fs'
import {EventEmitter} from 'events'
import {describe, beforeEach, expect, test, vi} from 'vitest'

const spawnMock = vi.fn()

// Mock child_process but keep every other export intact (routes.ts + its transitive
// imports pull additional symbols); override ONLY spawn (the runLandns effect under test).
vi.mock('child_process', async (importActual) => {
	const actual = await importActual<typeof import('child_process')>()
	return {...actual, spawn: (...args: unknown[]) => spawnMock(...args)}
})

// Import AFTER the mock is registered.
import landns from './routes.js'

// A controllable fake ChildProcess: emits optional stdout/stderr then `close` with `code`
// on the next tick (after runLandns has attached its listeners).
function makeChild({code = 0, stdout = '', stderr = ''} = {}) {
	const child = new EventEmitter() as EventEmitter & {stdout: EventEmitter; stderr: EventEmitter; kill: () => void}
	child.stdout = new EventEmitter()
	child.stderr = new EventEmitter()
	child.kill = () => {}
	process.nextTick(() => {
		if (stdout) child.stdout.emit('data', Buffer.from(stdout))
		if (stderr) child.stderr.emit('data', Buffer.from(stderr))
		child.emit('close', code)
	})
	return child
}

function makeStubLivinityd(initialLandns?: unknown) {
	const store: {landns?: unknown} = {landns: initialLandns}
	return {
		store: {
			get: async (k: string) => (k === 'landns' ? store.landns : undefined),
			set: async (k: string, v: unknown) => {
				if (k === 'landns') store.landns = v
				return true
			},
		},
		__store: store,
		notifications: {add: async () => {}, clear: async () => {}},
		files: {},
	}
}

function makeCtx(opts: {role?: string; livinityd?: unknown} = {}) {
	return {
		currentUser: {id: 'admin-1', username: 'admin', role: opts.role ?? 'admin'},
		dangerouslyBypassAuthentication: true,
		logger: {error() {}, info() {}, warn() {}, verbose() {}, log() {}},
		livinityd: opts.livinityd ?? makeStubLivinityd(),
		request: undefined,
		server: undefined,
	}
}

const caller = (opts?: Parameters<typeof makeCtx>[0]) => landns.createCaller(makeCtx(opts))

beforeEach(() => {
	spawnMock.mockReset()
	// Default: wrapper succeeds (exit 0) — enable/disable/mdns happy path.
	spawnMock.mockImplementation(() => makeChild({code: 0, stdout: 'ok\n'}))
})

describe('landns router — namespace shape', () => {
	test('exposes status / install / enable / disable / mdns-enable / mdns-disable', () => {
		const procs = (landns as any)._def?.procedures ?? {}
		for (const name of [
			'landnsStatus',
			'landnsInstall',
			'landnsEnable',
			'landnsDisable',
			'landnsMdnsEnable',
			'landnsMdnsDisable',
		]) {
			expect(procs[name]).toBeDefined()
		}
	})
})

describe('landns routes are admin-gated (V4)', () => {
	test('landnsStatus rejects a non-admin (member) before the resolver', async () => {
		await expect(caller({role: 'member'}).landnsStatus()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('landnsInstall rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).landnsInstall()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('landnsEnable rejects a non-admin', async () => {
		await expect(
			caller({role: 'member'}).landnsEnable({hostIp: '192.168.1.10', domain: 'box.example.com'}),
		).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('landnsDisable rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).landnsDisable()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('landnsMdnsEnable rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).landnsMdnsEnable()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
	test('landnsMdnsDisable rejects a non-admin', async () => {
		await expect(caller({role: 'member'}).landnsMdnsDisable()).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})
})

describe('landnsEnable zod rejects a malformed hostIp before the wrapper', () => {
	const BAD_IPS = ['', '999.1.1.1', '1.1.1', 'a.b.c.d', '192.168.1', '256.256.256.256', '1.2.3.4.5', ' 1.1.1.1']

	test('every malformed hostIp is refused at the zod boundary (admin caller)', async () => {
		for (const bad of BAD_IPS) {
			spawnMock.mockClear()
			await expect(caller().landnsEnable({hostIp: bad, domain: 'box.example.com'})).rejects.toThrow()
			expect(spawnMock).not.toHaveBeenCalled()
		}
	})
})

describe('landnsEnable zod rejects a bad domain (incl. .local) before the wrapper', () => {
	const BAD_DOMAINS = ['', 'local', 'box.local', 'sub.box.local', 'a/b', 'no space.com', 'box', '.com', 'box..com']

	test('every bad domain is refused at the zod boundary (admin caller)', async () => {
		for (const bad of BAD_DOMAINS) {
			spawnMock.mockClear()
			await expect(caller().landnsEnable({hostIp: '192.168.1.10', domain: bad})).rejects.toThrow()
			expect(spawnMock).not.toHaveBeenCalled()
		}
	})
})

describe('landnsEnable accepts a valid (hostIp, real-FQDN) pair + mirrors the store (spawn mocked)', () => {
	test('a valid pair resolves and mirrors {dnsmasqEnabled,hostIp,domain} into the landns key', async () => {
		const liv = makeStubLivinityd({mdnsEnabled: true}) // pre-existing state must survive the merge
		const res = await landns.createCaller(makeCtx({livinityd: liv})).landnsEnable({
			hostIp: '192.168.1.10',
			domain: 'box.example.com',
		})
		expect(res.ok).toBe(true)
		expect(liv.__store.landns.dnsmasqEnabled).toBe(true)
		expect(liv.__store.landns.hostIp).toBe('192.168.1.10')
		expect(liv.__store.landns.domain).toBe('box.example.com')
		expect(liv.__store.landns.mdnsEnabled).toBe(true) // existing field preserved, not clobbered
		expect(typeof liv.__store.landns.lastAppliedAt).toBe('number')
		// The wrapper was invoked with the exact validated argv (no injection surface).
		expect(spawnMock).toHaveBeenCalledWith(
			'sudo',
			['-n', expect.stringContaining('livos-landns.sh'), 'enable', '192.168.1.10', 'box.example.com'],
			expect.any(Object),
		)
	})

	test('a failing wrapper (exit 1) does NOT mirror into the store', async () => {
		spawnMock.mockImplementation(() => makeChild({code: 1, stderr: 'dnsmasq not installed'}))
		const liv = makeStubLivinityd({})
		const res = await landns.createCaller(makeCtx({livinityd: liv})).landnsEnable({
			hostIp: '192.168.1.10',
			domain: 'box.example.com',
		})
		expect(res.ok).toBe(false)
		expect(liv.__store.landns?.dnsmasqEnabled).toBeUndefined() // store write only happens on ok
	})

	test('a mixed-case domain is accepted and passed to the wrapper LOWERCASED (INFO-1)', async () => {
		const liv = makeStubLivinityd({})
		const res = await landns.createCaller(makeCtx({livinityd: liv})).landnsEnable({
			hostIp: '192.168.1.10',
			domain: 'Box.Example.COM',
		})
		expect(res.ok).toBe(true)
		// Store mirror holds the lowercased form (route and wrapper _valid_domain now agree).
		expect(liv.__store.landns.domain).toBe('box.example.com')
		// The wrapper argv carries the lowercased domain — no mixed-case exit-2 mismatch.
		expect(spawnMock).toHaveBeenCalledWith(
			'sudo',
			['-n', expect.stringContaining('livos-landns.sh'), 'enable', '192.168.1.10', 'box.example.com'],
			expect.any(Object),
		)
	})

	test('a mixed-case .LOCAL domain is still rejected AFTER lowercasing (INFO-1)', async () => {
		await expect(
			caller().landnsEnable({hostIp: '192.168.1.10', domain: 'Foo.LOCAL'}),
		).rejects.toThrow()
		expect(spawnMock).not.toHaveBeenCalled()
	})

	test('landnsMdnsEnable mirrors {mdnsEnabled:true} without clobbering dnsmasqEnabled', async () => {
		const liv = makeStubLivinityd({dnsmasqEnabled: true, hostIp: '192.168.1.10'})
		const res = await landns.createCaller(makeCtx({livinityd: liv})).landnsMdnsEnable()
		expect(res.ok).toBe(true)
		expect(liv.__store.landns.mdnsEnabled).toBe(true)
		expect(liv.__store.landns.dnsmasqEnabled).toBe(true) // preserved
	})
})

describe('DISJOINTNESS from the CF/portal path (structural, source-level) — D-347-5 / T-347-12', () => {
	// Read the sibling routes.ts SOURCE and assert NONE of the CF/portal substrings appear.
	// This survives refactors: any future edit that imports the CF portal DNS module /
	// portal-provision helper / free-tier own-zone primitive / reverse-proxy config module,
	// or references a portal token / Redis mode key, fails this test immediately.
	const src = readFileSync(new URL('./routes.ts', import.meta.url), 'utf8')
	const FORBIDDEN = [
		'local-dns',
		'hybrid-provision',
		'cf-local',
		'HYBRID_TOKEN',
		'livos:domain',
		'provisionPortalDnsRecord',
		'caddy',
		'cf-saas',
		'provisionPortal',
		'cf_api',
	]

	for (const needle of FORBIDDEN) {
		test(`routes.ts contains NO reference to '${needle}' (disjoint from CF/portal)`, () => {
			expect(src.includes(needle)).toBe(false)
		})
	}
})
