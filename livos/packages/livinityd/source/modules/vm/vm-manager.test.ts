import {beforeEach, describe, expect, test, vi} from 'vitest'

import type Livinityd from '../../index.js'
import type {VmInstanceRecord} from './vm-registry.js'

// ── Offline mocks ────────────────────────────────────────────────────────────
// Mock the docker seam directly (vm-manager consumes vm-docker's functions, not
// execa). render/write are stubbed — their real behavior is covered by
// vm-docker.test.ts; here we only need vm-manager's orchestration.
vi.mock('./vm-docker.js', () => ({
	composeUp: vi.fn(async () => {}),
	composeStop: vi.fn(async () => {}),
	composeRestart: vi.fn(async () => {}),
	composeDownVolumes: vi.fn(async () => {}),
	dockerInspectStatus: vi.fn(async () => 'running'),
	renderVmCompose: vi.fn(() => ({services: {vm: {}}})),
	writeVmCompose: vi.fn(async (dataDir: string) => `${dataDir}/docker-compose.yml`),
}))

// Mock the 349 preflights so tests toggle KVM-present/absent + resource sanity.
vi.mock('../apps/vm-preflight.js', () => ({
	assertKvmAvailable: vi.fn(async () => {}),
	assertVmResourcesSane: vi.fn(() => {}),
}))

// Mock fs-extra so delete()'s rm -rf never touches a real disk (Task 2).
vi.mock('fs-extra', () => ({default: {remove: vi.fn(async () => {})}}))

const {composeUp, composeStop, composeRestart, composeDownVolumes, dockerInspectStatus} =
	await import('./vm-docker.js')
const {assertKvmAvailable, assertVmResourcesSane} = await import('../apps/vm-preflight.js')
const fse = (await import('fs-extra')).default
const {vmPortAllocator, vmRdpPortAllocator} = await import('./vm-ports.js')
const {VmRegistry} = await import('./vm-registry.js')
const {VmManager} = await import('./vm-manager.js')

// ── In-memory fake store + manager harness ───────────────────────────────────
function makeFakeStore() {
	const data: Record<string, unknown> = {}
	return {
		get: async (key: string) => data[key],
		set: async (key: string, value: unknown) => {
			data[key] = value
		},
	}
}

function makeManager() {
	const store = makeFakeStore()
	const logger = {error: vi.fn()}
	const livinityd = {store, dataDirectory: '/fake/data', logger} as unknown as Livinityd
	return {vm: new VmManager(livinityd), store, logger}
}

const WIN = {name: 'my-win', kind: 'windows' as const, resources: {cpus: 2, ramMiB: 4096, diskGiB: 64}}
const LINUX = {name: 'my-linux', kind: 'linux' as const, resources: {cpus: 2, ramMiB: 2048, diskGiB: 16}}

async function records(store: ReturnType<typeof makeFakeStore>): Promise<VmInstanceRecord[]> {
	return ((await store.get('vmInstances')) as VmInstanceRecord[] | undefined) ?? []
}

/** Seed a registry record straight into the fake store (bypasses create). */
async function seed(store: ReturnType<typeof makeFakeStore>, patch: Partial<VmInstanceRecord>): Promise<VmInstanceRecord> {
	const rec: VmInstanceRecord = {
		id: patch.id ?? 'seed-id',
		name: patch.name ?? 'seed',
		kind: patch.kind ?? 'linux',
		resources: patch.resources ?? {cpus: 2, ramMiB: 2048, diskGiB: 16},
		lastIntent: patch.lastIntent ?? 'running',
		dataDir: patch.dataDir ?? '/fake/data/vm-data/seed-id',
		composePath: patch.composePath ?? '/fake/data/vm-data/seed-id/docker-compose.yml',
		containerName: patch.containerName ?? `vm-${patch.id ?? 'seed-id'}`,
		novncPort: patch.novncPort ?? 16100,
		rdpPort: patch.rdpPort,
		createdAt: patch.createdAt ?? 1,
		lastError: patch.lastError,
	}
	const all = await records(store)
	await store.set('vmInstances', [...all, rec])
	return rec
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('create — preflight-gated + detached', () => {
	test('KVM present + sane resources: writes registry record, allocates ports, detaches compose-up', async () => {
		const {vm, store} = makeManager()

		const {id} = await vm.create(WIN)

		expect(id).toBeTruthy()
		expect(assertKvmAvailable).toHaveBeenCalledOnce()
		expect(assertVmResourcesSane).toHaveBeenCalledOnce()

		const all = await records(store)
		expect(all).toHaveLength(1)
		const rec = all[0]
		expect(rec.id).toBe(id)
		expect(rec.lastIntent).toBe('running')
		expect(rec.containerName).toBe(`vm-${id}`)
		expect(rec.dataDir).toBe(`/fake/data/vm-data/${id}`)
		expect(rec.novncPort).toBeGreaterThanOrEqual(16100)
		expect(rec.novncPort).toBeLessThan(16200)
		// Windows allocates an RDP port too.
		expect(rec.rdpPort).toBeGreaterThanOrEqual(16200)
		expect(rec.rdpPort).toBeLessThan(16300)

		// compose-up was invoked (detached) — the daemon never awaited it.
		expect(composeUp).toHaveBeenCalledWith(rec.composePath, `vm-${id}`)
	})

	test('linux kind: no RDP port allocated', async () => {
		const {vm, store} = makeManager()
		await vm.create(LINUX)
		const [rec] = await records(store)
		expect(rec.rdpPort).toBeUndefined()
	})

	test('KVM absent: rejects BEFORE any registry write or compose-up (registry stays empty)', async () => {
		const {vm, store} = makeManager()
		vi.mocked(assertKvmAvailable).mockRejectedValueOnce(new Error('no /dev/kvm'))

		await expect(vm.create(WIN)).rejects.toThrow(/no \/dev\/kvm/)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).not.toHaveBeenCalled()
	})

	test('insane resources: rejects before provisioning (registry stays empty)', async () => {
		const {vm, store} = makeManager()
		vi.mocked(assertVmResourcesSane).mockImplementationOnce(() => {
			throw new Error('RAM too large')
		})

		await expect(vm.create(WIN)).rejects.toThrow(/RAM too large/)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).not.toHaveBeenCalled()
	})

	test('a failed detached compose-up writes lastError to the registry (never crashes create)', async () => {
		const {vm, store, logger} = makeManager()
		vi.mocked(composeUp).mockRejectedValueOnce(new Error('boom'))

		const {id} = await vm.create(LINUX)

		await vi.waitFor(async () => {
			const rec = (await records(store)).find((r) => r.id === id)
			expect(rec?.lastError).toContain('boom')
		})
		expect(logger.error).toHaveBeenCalled()
	})
})

describe('list/get — live state derivation (never the stored flag)', () => {
	test.each([
		['running', 'running'],
		['exited', 'stopped'],
		['created', 'stopped'],
		['paused', 'stopped'],
		['dead', 'error'],
	] as const)('docker status %s → vm state %s', async (dockerStatus, vmState) => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'a', containerName: 'vm-a'})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce(dockerStatus)

		const view = await vm.get('a')
		expect(view?.state).toBe(vmState)
	})

	test('missing container + running intent → error (was supposed to be up)', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'b', containerName: 'vm-b', lastIntent: 'running'})
		vi.mocked(dockerInspectStatus).mockRejectedValueOnce(new Error('No such container'))

		const view = await vm.get('b')
		expect(view?.state).toBe('error')
	})

	test('missing container + stopped intent → stopped (honestly down)', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'c', containerName: 'vm-c', lastIntent: 'stopped'})
		vi.mocked(dockerInspectStatus).mockRejectedValueOnce(new Error('No such container'))

		const view = await vm.get('c')
		expect(view?.state).toBe('stopped')
	})

	test('record with lastError + no container → error', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'd', containerName: 'vm-d', lastIntent: 'stopped', lastError: 'create failed'})
		vi.mocked(dockerInspectStatus).mockRejectedValueOnce(new Error('No such container'))

		const view = await vm.get('d')
		expect(view?.state).toBe('error')
		expect(view?.lastError).toBe('create failed')
	})

	test('installing-os is NEVER faked — a running container reports running (honest fallback)', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'e', containerName: 'vm-e'})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')

		const view = await vm.get('e')
		expect(view?.state).toBe('running')
		expect(view?.state).not.toBe('installing-os')
	})

	test('while a create detached compose-up is in flight the state is creating', async () => {
		const {vm} = makeManager()
		let resolveUp!: () => void
		vi.mocked(composeUp).mockImplementationOnce(
			() => new Promise<void>((res) => {
				resolveUp = () => res()
			}),
		)

		const {id} = await vm.create(WIN)

		// Marker held → creating (docker inspect is short-circuited).
		expect((await vm.get(id))?.state).toBe('creating')

		// Once the compose-up settles the marker clears and live state takes over.
		resolveUp()
		await vi.waitFor(async () => {
			expect((await vm.get(id))?.state).toBe('running')
		})
	})

	test('list derives state for every record', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'x', containerName: 'vm-x'})
		await seed(store, {id: 'y', containerName: 'vm-y'})
		vi.mocked(dockerInspectStatus).mockResolvedValue('exited')

		const views = await vm.list()
		expect(views).toHaveLength(2)
		expect(views.every((v) => v.state === 'stopped')).toBe(true)
	})

	test('get of an unknown id returns undefined', async () => {
		const {vm} = makeManager()
		expect(await vm.get('nope')).toBeUndefined()
	})
})

describe('lifecycle mutations — single-flight + graceful + ordered teardown', () => {
	test('start: composeUp + running intent', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 's1', containerName: 'vm-s1', lastIntent: 'stopped'})

		await vm.start('s1')

		expect(composeUp).toHaveBeenCalledWith('/fake/data/vm-data/seed-id/docker-compose.yml', 'vm-s1')
		expect((await records(store))[0].lastIntent).toBe('running')
	})

	test('stop: uses composeStop (graceful, NOT down) + stopped intent', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 's2', containerName: 'vm-s2', lastIntent: 'running'})

		await vm.stop('s2')

		expect(composeStop).toHaveBeenCalledWith('/fake/data/vm-data/seed-id/docker-compose.yml', 'vm-s2')
		expect(composeDownVolumes).not.toHaveBeenCalled()
		expect((await records(store))[0].lastIntent).toBe('stopped')
	})

	test('restart: composeRestart + running intent', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 's3', containerName: 'vm-s3', lastIntent: 'running'})

		await vm.restart('s3')

		expect(composeRestart).toHaveBeenCalledWith('/fake/data/vm-data/seed-id/docker-compose.yml', 'vm-s3')
		expect((await records(store))[0].lastIntent).toBe('running')
	})

	test('a second concurrent op on the SAME id refuses; a DIFFERENT id proceeds', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'same', containerName: 'vm-same'})
		await seed(store, {id: 'other', containerName: 'vm-other'})

		// Hold the first op open so the marker stays claimed.
		let releaseStop!: () => void
		vi.mocked(composeStop).mockImplementationOnce(
			() => new Promise<void>((res) => {
				releaseStop = () => res()
			}),
		)

		const first = vm.stop('same')
		// Same-id op while the marker is held → refuses immediately.
		await expect(vm.restart('same')).rejects.toThrow(/already in progress/)
		// Different id is unaffected.
		await expect(vm.start('other')).resolves.toBeUndefined()

		releaseStop()
		await expect(first).resolves.toBeUndefined()
	})

	test('delete without confirm:true is refused before any teardown', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'd1', containerName: 'vm-d1'})

		// @ts-expect-error — deliberately omitting the required confirm flag
		await expect(vm.delete('d1', {})).rejects.toThrow(/confirm:true/)

		expect(composeStop).not.toHaveBeenCalled()
		expect(composeDownVolumes).not.toHaveBeenCalled()
		expect(fse.remove).not.toHaveBeenCalled()
		// Still present.
		expect(await records(store)).toHaveLength(1)
	})

	test('delete of an unknown id returns {deleted:false} with no side effects', async () => {
		const {vm} = makeManager()
		const result = await vm.delete('ghost', {confirm: true})
		expect(result).toEqual({deleted: false})
		expect(composeStop).not.toHaveBeenCalled()
		expect(composeDownVolumes).not.toHaveBeenCalled()
		expect(fse.remove).not.toHaveBeenCalled()
	})

	test('delete: ORDERED teardown (stop → down --volumes → rmdir → registry-delete → port-release) + returns deleted', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'del', containerName: 'vm-del', novncPort: 16111, rdpPort: 16211})

		const order: string[] = []
		vi.mocked(composeStop).mockImplementationOnce(async () => {
			order.push('stop')
		})
		vi.mocked(composeDownVolumes).mockImplementationOnce(async () => {
			order.push('down')
		})
		vi.mocked(fse.remove).mockImplementationOnce(async () => {
			order.push('rmdir')
		})
		const delSpy = vi.spyOn(VmRegistry.prototype, 'delete').mockImplementation(async () => {
			order.push('registry-delete')
		})
		const novncRel = vi.spyOn(vmPortAllocator, 'release').mockImplementation(() => {
			order.push('port-release-novnc')
		})
		const rdpRel = vi.spyOn(vmRdpPortAllocator, 'release').mockImplementation(() => {
			order.push('port-release-rdp')
		})

		const result = await vm.delete('del', {confirm: true})

		expect(result).toEqual({deleted: true})
		expect(order).toEqual(['stop', 'down', 'rmdir', 'registry-delete', 'port-release-novnc', 'port-release-rdp'])
		expect(fse.remove).toHaveBeenCalledWith('/fake/data/vm-data/seed-id')
		expect(novncRel).toHaveBeenCalledWith(16111)
		expect(rdpRel).toHaveBeenCalledWith(16211)

		delSpy.mockRestore()
		novncRel.mockRestore()
		rdpRel.mockRestore()
	})
})

describe('reconcileOnBoot — boot durability (closes the cleanDockerState wipe)', () => {
	test('re-ups only lastIntent==="running" VMs; skips stopped', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'r1', containerName: 'vm-r1', composePath: '/p/r1.yml', lastIntent: 'running'})
		await seed(store, {id: 'r2', containerName: 'vm-r2', composePath: '/p/r2.yml', lastIntent: 'stopped'})
		await seed(store, {id: 'r3', containerName: 'vm-r3', composePath: '/p/r3.yml', lastIntent: 'running'})

		await vm.reconcileOnBoot()

		expect(composeUp).toHaveBeenCalledTimes(2)
		expect(composeUp).toHaveBeenCalledWith('/p/r1.yml', 'vm-r1')
		expect(composeUp).toHaveBeenCalledWith('/p/r3.yml', 'vm-r3')
		expect(composeUp).not.toHaveBeenCalledWith('/p/r2.yml', 'vm-r2')
	})

	test('a per-VM composeUp failure is logged and does NOT abort the loop', async () => {
		const {vm, store, logger} = makeManager()
		await seed(store, {id: 'f1', containerName: 'vm-f1', composePath: '/p/f1.yml', lastIntent: 'running'})
		await seed(store, {id: 'f2', containerName: 'vm-f2', composePath: '/p/f2.yml', lastIntent: 'running'})

		vi.mocked(composeUp).mockRejectedValueOnce(new Error('f1 boom')) // first VM fails

		await vm.reconcileOnBoot()

		// The second VM still reconciled despite the first failing.
		expect(composeUp).toHaveBeenCalledTimes(2)
		expect(composeUp).toHaveBeenCalledWith('/p/f2.yml', 'vm-f2')
		expect(logger.error).toHaveBeenCalled()
	})
})
