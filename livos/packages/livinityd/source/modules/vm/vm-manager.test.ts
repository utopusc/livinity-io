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

const {composeUp, composeStop, composeRestart, composeDownVolumes, dockerInspectStatus, renderVmCompose} =
	await import('./vm-docker.js')
const {assertKvmAvailable, assertVmResourcesSane} = await import('../apps/vm-preflight.js')
const fse = (await import('fs-extra')).default
const {vmPortAllocator, vmRdpPortAllocator} = await import('./vm-ports.js')
const {VmRegistry} = await import('./vm-registry.js')
const {VmManager} = await import('./vm-manager.js')

// ── In-memory fake store + manager harness ───────────────────────────────────
function makeFakeStore() {
	const data: Record<string, unknown> = {}
	const get = async (key: string) => data[key]
	const set = async (key: string, value: unknown) => {
		data[key] = value
	}
	// Mirrors FileStore.getWriteLock: runs the job with the same get/set. These
	// vm-manager tests are single-flow (never fire concurrent registry mutations),
	// so an inline runner is faithful; the real PQueue serialization that WR-02
	// depends on is exercised against a REAL FileStore in vm-registry.test.ts.
	const getWriteLock = async (job: (m: {get: typeof get; set: typeof set}) => Promise<void>) =>
		job({get, set})
	return {get, set, getWriteLock}
}

function makeManager() {
	const store = makeFakeStore()
	const logger = {error: vi.fn()}
	const livinityd = {store, dataDirectory: '/fake/data', logger} as unknown as Livinityd
	return {vm: new VmManager(livinityd), store, logger}
}

// Phase 351 (VMCREATE-01): CreateVmInput now carries a discriminated `os`
// selection — a Windows edition or a Linux distro/custom-image.
const WIN = {
	name: 'my-win',
	kind: 'windows' as const,
	resources: {cpus: 2, ramMiB: 4096, diskGiB: 64},
	os: {edition: '11' as const},
}
const LINUX = {
	name: 'my-linux',
	kind: 'linux' as const,
	resources: {cpus: 2, ramMiB: 2048, diskGiB: 16},
	os: {distro: 'ubuntu' as const},
}

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

	// VMCREATE-01: the OS selection must ACTUALLY reach the compose render (not a
	// no-op) — assert osEnv is threaded into renderVmCompose as VERSION / BOOT.
	test('windows: threads VERSION into renderVmCompose osEnv', async () => {
		const {vm} = makeManager()
		await vm.create({...WIN, os: {edition: '10'}})
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({osEnv: {VERSION: '10'}}),
		)
	})

	test('linux distro: threads BOOT into renderVmCompose osEnv', async () => {
		const {vm} = makeManager()
		await vm.create({...LINUX, os: {distro: 'debian'}})
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({osEnv: {BOOT: 'debian'}}),
		)
	})

	test('linux custom image: threads the URL into BOOT', async () => {
		const {vm} = makeManager()
		await vm.create({...LINUX, os: {customImage: {url: 'https://cdn.example/boot.iso'}}})
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({osEnv: {BOOT: 'https://cdn.example/boot.iso'}}),
		)
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

		// Wait for BOTH detached effects — the registry write and the log — since
		// they settle across separate microtask hops (the getWriteLock-serialized
		// patch adds one) and racing the assertion between them would be flaky.
		await vi.waitFor(async () => {
			const rec = (await records(store)).find((r) => r.id === id)
			expect(rec?.lastError).toContain('boom')
			expect(logger.error).toHaveBeenCalled()
		})
	})

	// IN-02: a failed detached create must release its ports and flip to
	// stopped-intent so reconcileOnBoot never re-attempts a known-broken VM and
	// the allocator does not leak the slots until an explicit delete().
	test('a failed detached create releases its ports and marks stopped-intent (IN-02)', async () => {
		const {vm, store} = makeManager()
		const novncRel = vi.spyOn(vmPortAllocator, 'release')
		const rdpRel = vi.spyOn(vmRdpPortAllocator, 'release')
		vi.mocked(composeUp).mockRejectedValueOnce(new Error('bind fail'))

		const {id} = await vm.create(WIN)

		await vi.waitFor(async () => {
			const rec = (await records(store)).find((r) => r.id === id)
			expect(rec?.lastIntent).toBe('stopped')
			expect(rec?.lastError).toContain('bind fail')
		})

		const rec = (await records(store)).find((r) => r.id === id)!
		expect(novncRel).toHaveBeenCalledWith(rec.novncPort)
		expect(rdpRel).toHaveBeenCalledWith(rec.rdpPort)

		novncRel.mockRestore()
		rdpRel.mockRestore()
	})

	// IN-03: if the registry.patch inside the failure handler itself throws, the
	// handler must swallow-and-log — never surface as an unhandledRejection and
	// never break the already-returned create().
	test('the detached failure handler swallows a patch error (IN-03: no unhandledRejection)', async () => {
		const {vm, logger} = makeManager()
		vi.mocked(composeUp).mockRejectedValueOnce(new Error('up fail'))
		const patchSpy = vi
			.spyOn(VmRegistry.prototype, 'patch')
			.mockRejectedValueOnce(new Error('store down'))

		// create() itself resolves — the detached failure never reaches the caller.
		const {id} = await vm.create(LINUX)
		expect(id).toBeTruthy()

		// The handler logged the patch failure (and the create failure) rather than
		// rejecting; if it had escaped, the terminal .catch(()=>{}) still absorbs it.
		await vi.waitFor(() => {
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining('failure-handler patch failed'),
				expect.anything(),
			)
		})

		patchSpy.mockRestore()
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

	// IN-04: a transient docker stop/down error must NOT abort teardown — delete
	// stays best-effort on the docker steps and still reaches the durable teardown
	// (rmdir → registry-delete → port-release), so a VM is never un-deletable due
	// to a momentary docker hiccup.
	test('delete tolerates a throwing composeStop/composeDownVolumes and still completes teardown (IN-04)', async () => {
		const {vm, store, logger} = makeManager()
		await seed(store, {id: 'dz', containerName: 'vm-dz', dataDir: '/fake/data/vm-data/dz', novncPort: 16120, rdpPort: 16220})

		vi.mocked(composeStop).mockRejectedValueOnce(new Error('docker hiccup'))
		vi.mocked(composeDownVolumes).mockRejectedValueOnce(new Error('down hiccup'))
		const novncRel = vi.spyOn(vmPortAllocator, 'release')
		const rdpRel = vi.spyOn(vmRdpPortAllocator, 'release')

		const result = await vm.delete('dz', {confirm: true})

		expect(result).toEqual({deleted: true})
		// Durable teardown still ran despite BOTH docker steps throwing.
		expect(fse.remove).toHaveBeenCalledWith('/fake/data/vm-data/dz')
		expect(await records(store)).toHaveLength(0)
		expect(novncRel).toHaveBeenCalledWith(16120)
		expect(rdpRel).toHaveBeenCalledWith(16220)
		expect(logger.error).toHaveBeenCalled()

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

	// WR-01: the in-memory allocators reset to empty on every daemon restart, but
	// the ports on-disk are still bound by the re-upped containers. reconcileOnBoot
	// MUST re-prime the allocators from EVERY persisted record (running AND stopped)
	// before any subsequent create() can re-hand-out a live port and collide on bind.
	test('reconcileOnBoot re-primes the port allocators from every persisted record (running AND stopped)', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'p1', containerName: 'vm-p1', composePath: '/p/p1.yml', kind: 'windows', lastIntent: 'running', novncPort: 16100, rdpPort: 16200})
		await seed(store, {id: 'p2', containerName: 'vm-p2', composePath: '/p/p2.yml', lastIntent: 'stopped', novncPort: 16101}) // stopped still owns its port

		const novncReserve = vi.spyOn(vmPortAllocator, 'reserve')
		const rdpReserve = vi.spyOn(vmRdpPortAllocator, 'reserve')

		await vm.reconcileOnBoot()

		// Every persisted noVNC port is reserved — including the STOPPED VM's.
		expect(novncReserve).toHaveBeenCalledWith(16100)
		expect(novncReserve).toHaveBeenCalledWith(16101)
		// The windows RDP port is reserved too; the linux VM has no RDP port to reserve.
		expect(rdpReserve).toHaveBeenCalledWith(16200)
		expect(rdpReserve).toHaveBeenCalledTimes(1)

		novncReserve.mockRestore()
		rdpReserve.mockRestore()
	})

	// WR-01 end-to-end: after priming, a fresh allocate() on the same (module
	// singleton) allocator must never return a reserved port. Uses a fresh
	// PortAllocator to stay isolated from cumulative cross-test state.
	test('reserve()+allocate() interaction: a primed port is never re-handed-out', async () => {
		const {PortAllocator} = await import('../streaming/port-allocator.js')
		const a = new PortAllocator({min: 16100, max: 16103})
		a.reserve(16100)
		a.reserve(16101)
		// Only 16102 is free — allocate must pick it, never a reserved port.
		expect(a.allocate()).toBe(16102)
		expect(() => a.allocate()).toThrow(/exhausted/)
	})
})
