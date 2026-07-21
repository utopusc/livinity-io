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

const {composeUp, dockerInspectStatus} = await import('./vm-docker.js')
const {assertKvmAvailable, assertVmResourcesSane} = await import('../apps/vm-preflight.js')
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
