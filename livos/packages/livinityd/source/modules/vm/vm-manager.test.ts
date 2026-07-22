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
	forceRemoveContainer: vi.fn(async () => {}),
	dockerInspectStatus: vi.fn(async () => 'running'),
	renderVmCompose: vi.fn(() => ({services: {vm: {}}})),
	writeVmCompose: vi.fn(async (dataDir: string) => `${dataDir}/docker-compose.yml`),
	// Phase 359 (VMSET-01): the pre-359 osEnv recovery seam. Default returns a
	// windows VERSION so a legacy record's update re-renders with a preserved OS.
	readOsRenderInputs: vi.fn(async () => ({osEnv: {VERSION: '10'}})),
}))

// Mock the 349/351 preflights so tests toggle KVM-present/absent + resource sanity.
// Phase 351: assertVmResourcesSane stays SYNC (pure verdict; the async lives in the
// disk probe) and takes an injected host; probeHostCapacity is the live disk-free
// probe create() awaits to build that host. The mock returns a roomy capacity by
// default so the happy path clears the gate.
vi.mock('../apps/vm-preflight.js', () => {
	// Local stand-in for the real error class (vi.mock is hoisted — can't close over
	// the real import). vm-manager maps nothing off it directly; the negative test
	// asserts create() rejects with THIS instance, mirroring the real throw.
	class VmResourceInvalid extends Error {
		constructor(message: string) {
			super(message)
			this.name = 'VmResourceInvalid'
		}
	}
	return {
		assertKvmAvailable: vi.fn(async () => {}),
		assertVmResourcesSane: vi.fn(() => {}),
		probeHostCapacity: vi.fn(async () => ({
			totalMemBytes: 64 * 1024 ** 3,
			cpuCount: 32,
			diskFreeBytes: 4096 * 1024 ** 3,
		})),
		// Phase 359 (VMSET-01): the resize gate — default ALLOW (null); the
		// shrink/capacity-reject test overrides it to return a reason.
		vmResizeVerdict: vi.fn(() => null),
		VmResourceInvalid,
	}
})

// Phase 362 (VMSTATS-01): mock the dockerode live-stats read + the du directory-size
// util so stats()/diskUsage() are fully offline. getContainerStats returns a fixed
// live payload; the memoryLimit/memoryPercent are ABSURD sentinels the code MUST
// ignore (a VM sets no cgroup mem_limit — allocated comes from the registry).
vi.mock('../docker/docker.js', () => ({
	getContainerStats: vi.fn(async () => ({
		cpuPercent: 12.5,
		memoryUsage: 2 * 1024 ** 3, // 2 GiB working set → 2048 MiB
		memoryLimit: 999_999_999_999, // SENTINEL — must be IGNORED (a VM has no cgroup cap)
		memoryPercent: 999, // SENTINEL — must be IGNORED
		networkRx: 0,
		networkTx: 0,
		pids: 1,
	})),
}))
vi.mock('../utilities/get-directory-size.js', () => ({default: vi.fn(async () => 21 * 1024 ** 3)}))

// Mock fs-extra so delete()'s rm -rf never touches a real disk (Task 2). Phase 351
// (VMCREATE-01 gap closure): the custom LOCAL-image path also uses fse.realpath (symlink-safe
// containment), fse.stat (regular-file), fse.ensureDir + fse.link/copyFile (hardlink into the
// VM's own dir). Defaults resolve a valid, contained, regular file so the happy path clears.
vi.mock('fs-extra', () => ({
	default: {
		remove: vi.fn(async () => {}),
		ensureDir: vi.fn(async () => {}),
		realpath: vi.fn(async (p: string) => p),
		stat: vi.fn(async () => ({isFile: () => true})),
		link: vi.fn(async () => {}),
		copyFile: vi.fn(async () => {}),
		// Default: compose file present (happy path for start()/reconcileOnBoot()).
		// Individual tests override to false to exercise the orphan/missing-compose paths.
		pathExists: vi.fn(async () => true),
	},
}))

const {
	composeUp,
	composeStop,
	composeRestart,
	composeDownVolumes,
	forceRemoveContainer,
	dockerInspectStatus,
	renderVmCompose,
	writeVmCompose,
	readOsRenderInputs,
} = await import('./vm-docker.js')
const {assertKvmAvailable, assertVmResourcesSane, probeHostCapacity, vmResizeVerdict, VmResourceInvalid} = await import(
	'../apps/vm-preflight.js'
)
const fse = (await import('fs-extra')).default
const {getContainerStats} = await import('../docker/docker.js')
const getDirectorySize = (await import('../utilities/get-directory-size.js')).default
const {vmPortAllocator, vmRdpPortAllocator, vmVncRawPortAllocator} = await import('./vm-ports.js')
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
	const logger = {error: vi.fn(), log: vi.fn()}
	// Phase 364 (VMENC-01): the StreamManager seam vm-manager calls INTO for the encoded
	// screen. Defaults: VAAPI present, a successful start, one session stopped on cascade.
	const streamManager = {
		encodeAvailable: vi.fn(() => true),
		startVmStream: vi.fn(async () => ({streamId: 's1', wsUrl: '/ws/vm-stream/s1'})),
		stopStreamsForVm: vi.fn(async () => 1),
	}
	const livinityd = {store, dataDirectory: '/fake/data', logger, streamManager} as unknown as Livinityd
	return {vm: new VmManager(livinityd), store, logger, streamManager}
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
		vncRawPort: patch.vncRawPort,
		createdAt: patch.createdAt ?? 1,
		lastError: patch.lastError,
		osEnv: patch.osEnv,
		bootFileMount: patch.bootFileMount,
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
		// Phase 351: the disk free space is probed LIVE against the data-dir, and the
		// freshly-probed capacity (never a cached value) is injected into the async
		// resource gate alongside the env.
		expect(probeHostCapacity).toHaveBeenCalledWith('/fake/data')
		expect(assertVmResourcesSane).toHaveBeenCalledWith(
			expect.objectContaining({DISK_SIZE: '64G'}),
			expect.objectContaining({diskFreeBytes: expect.any(Number)}),
		)

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
		// Phase 364 (VMENC-01): a raw-VNC port is allocated + persisted (in range).
		expect(rec.vncRawPort).toBeGreaterThanOrEqual(16300)
		expect(rec.vncRawPort).toBeLessThan(16400)

		// compose-up was invoked (detached) — the daemon never awaited it.
		expect(composeUp).toHaveBeenCalledWith(rec.composePath, `vm-${id}`)
	})

	test('linux kind: no RDP port allocated', async () => {
		const {vm, store} = makeManager()
		await vm.create(LINUX)
		const [rec] = await records(store)
		expect(rec.rdpPort).toBeUndefined()
	})

	// Phase 364 (VMENC-01): the raw-VNC port is UNIVERSAL — allocated for linux too
	// (unlike rdpPort), threaded into renderVmCompose as a NUMBER, and persisted.
	test('both kinds: allocate a numeric vncRawPort, thread it into renderVmCompose + persist it', async () => {
		const {vm, store} = makeManager()

		const {id: winId} = await vm.create(WIN)
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({vncRawPort: expect.any(Number)}),
		)
		const winRec = (await records(store)).find((r) => r.id === winId)!
		expect(winRec.vncRawPort).toEqual(expect.any(Number))

		vi.clearAllMocks()
		const {id: linId} = await vm.create(LINUX)
		// Linux gets a raw-VNC port even though it has NO rdpPort.
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({vncRawPort: expect.any(Number)}),
		)
		const linRec = (await records(store)).find((r) => r.id === linId)!
		expect(linRec.vncRawPort).toEqual(expect.any(Number))
		expect(linRec.rdpPort).toBeUndefined()
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

	// Phase 359 (VMSET-01): create() now PERSISTS osEnv onto the registry record so
	// a later vm.update re-renders without dropping the OS (no on-disk recovery needed).
	test('windows: persists osEnv {VERSION} onto the registry record', async () => {
		const {vm, store} = makeManager()
		await vm.create({...WIN, os: {edition: '10'}})
		expect((await records(store))[0].osEnv).toEqual({VERSION: '10'})
	})

	// Phase 359 (VMUSER-01): a supplied Windows username rides the SAME osEnv bag as
	// VERSION, so it is threaded into renderVmCompose AND persisted onto the registry
	// record (359-01 persistence → preserved across a later vm.update, zero extra code).
	test('windows + username: threads USERNAME beside VERSION into renderVmCompose osEnv', async () => {
		const {vm} = makeManager()
		await vm.create({...WIN, os: {edition: '10', username: 'my-user'}})
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({osEnv: {VERSION: '10', USERNAME: 'my-user'}}),
		)
	})

	test('windows + username: persists osEnv {VERSION, USERNAME} onto the registry record', async () => {
		const {vm, store} = makeManager()
		await vm.create({...WIN, os: {edition: '10', username: 'my-user'}})
		expect((await records(store))[0].osEnv).toEqual({VERSION: '10', USERNAME: 'my-user'})
	})

	// WITHOUT a username the osEnv carries no USERNAME key (optional — existing VMs
	// and username-less creates are untouched).
	test('windows WITHOUT username: osEnv has VERSION only (no USERNAME key)', async () => {
		const {vm, store} = makeManager()
		await vm.create({...WIN, os: {edition: '10'}})
		expect((await records(store))[0].osEnv).toEqual({VERSION: '10'})
		expect((await records(store))[0].osEnv).not.toHaveProperty('USERNAME')
	})

	test('linux custom LOCAL image: persists osEnv {} + bootFileMount onto the record', async () => {
		const {vm, store} = makeManager()
		const {id} = await vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/ubuntu.iso'}}})
		const rec = (await records(store)).find((r) => r.id === id)!
		expect(rec.osEnv).toEqual({})
		expect(rec.bootFileMount).toEqual({hostFileName: 'custom.iso', containerPath: '/boot.iso'})
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

	// WR-01: the http/https scheme is re-asserted at the MANAGER (not only the
	// router zod refine). A direct manager.create with a file:// custom-image URL
	// must reject at the manager before any provisioning — the docker seam is never
	// reached — so a non-router caller cannot reintroduce a file:// boot source.
	test('linux custom image with a non-http(s) scheme: rejected at the manager, docker seam 0 calls (WR-01)', async () => {
		const {vm, store} = makeManager()

		await expect(
			vm.create({...LINUX, os: {customImage: {url: 'file:///etc/passwd'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		// Rejected BEFORE provisioning: no registry write, no compose-up.
		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
	})

	// ── Custom LOCAL image (VMCREATE-01 gap closure) ─────────────────────────────
	// A valid, contained, regular file: hardlink it into the VM's OWN data dir and
	// thread a bootFileMount (/boot.<ext>) into the render — NO BOOT env (qemus
	// ignores BOOT when a /boot.<ext> file is bound; the host path never leaks to env).
	test('linux custom LOCAL image (contained, valid): hardlinks into the VM dir + binds /boot.<ext>, no BOOT env', async () => {
		const {vm, store} = makeManager()

		const {id} = await vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/ubuntu.iso'}}})

		// Hardlinked (not copied) from the realpath'd source into the VM's own dir.
		expect(fse.link).toHaveBeenCalledWith('/fake/data/isos/ubuntu.iso', `/fake/data/vm-data/${id}/custom.iso`)
		expect(fse.copyFile).not.toHaveBeenCalled()
		// Render receives the bind (VM-own-dir source, qemus container target) and NO BOOT env.
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				osEnv: {},
				bootFileMount: {hostFileName: 'custom.iso', containerPath: '/boot.iso'},
			}),
		)
		expect(await records(store)).toHaveLength(1)
	})

	// EXDEV / cross-device link failure → full-copy fallback (never a hard failure).
	test('linux custom LOCAL image: hardlink EXDEV → copyFile fallback', async () => {
		const {vm} = makeManager()
		vi.mocked(fse.link).mockRejectedValueOnce(Object.assign(new Error('cross-device link'), {code: 'EXDEV'}))

		const {id} = await vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/disk.qcow2'}}})

		expect(fse.copyFile).toHaveBeenCalledWith('/fake/data/isos/disk.qcow2', `/fake/data/vm-data/${id}/custom.qcow2`)
	})

	// CONTAINMENT (VMSEC-02): a real path OUTSIDE the data dir is refused at the
	// manager BEFORE any provisioning — docker seam 0 calls, registry empty.
	test('linux custom LOCAL image OUTSIDE the data dir: rejected, docker seam 0 calls', async () => {
		const {vm, store} = makeManager()

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/etc/evil.iso'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
		expect(fse.link).not.toHaveBeenCalled()
	})

	// SYMLINK ESCAPE: a path that LOOKS contained but whose realpath resolves
	// OUTSIDE the data dir is refused — proving fse.realpath (not a raw string
	// prefix) is the load-bearing containment gate against symlink/`..` traversal.
	test('linux custom LOCAL image via a symlink escaping the data dir: rejected via realpath', async () => {
		const {vm, store} = makeManager()
		// The file realpath resolves OUTSIDE (a symlink target); the root realpath is the default.
		vi.mocked(fse.realpath).mockImplementationOnce(async () => '/etc/shadow.iso')

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/innocent.iso'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
	})

	// A `..`-traversal path whose realpath resolves outside is refused the same way.
	test('linux custom LOCAL image with a .. that resolves outside: rejected via realpath', async () => {
		const {vm, store} = makeManager()
		vi.mocked(fse.realpath).mockImplementationOnce(async () => '/fake/secret.iso')

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/../secret.iso'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
	})

	// A non-locally-bootable extension (qemus won't bind a .vmdk) is refused BEFORE
	// touching the filesystem — no realpath probe, no provisioning.
	test('linux custom LOCAL image with a non-bootable extension (.vmdk): rejected before any fs probe', async () => {
		const {vm, store} = makeManager()

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/disk.vmdk'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(fse.realpath).not.toHaveBeenCalled()
		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
	})

	// A dangling / non-existent path (realpath throws) is refused honestly.
	test('linux custom LOCAL image that does not exist (realpath throws): rejected', async () => {
		const {vm, store} = makeManager()
		vi.mocked(fse.realpath).mockRejectedValueOnce(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos/missing.iso'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
	})

	// A contained path that is a DIRECTORY (not a regular file) is refused.
	test('linux custom LOCAL image pointing at a directory: rejected (not a regular file)', async () => {
		const {vm, store} = makeManager()
		vi.mocked(fse.stat).mockResolvedValueOnce({isFile: () => false} as unknown as Awaited<ReturnType<typeof fse.stat>>)

		await expect(
			vm.create({...LINUX, os: {customImage: {localPath: '/fake/data/isos.iso'}}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
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

	// VMCREATE-02 / T-351-07 (the assertion tsc CANNOT give): an over-large DISK
	// request must be REFUSED before ANY provisioning. The live probe reports a
	// nearly-full data-dir filesystem, so the (async) resource gate rejects — and
	// because the call site is properly `await`ed, that rejection propagates and the
	// docker/compose seam is NEVER reached. A dropped await would silently no-op the
	// disk check and let composeUp fire; this proves the await is load-bearing.
	test('too-big disk: rejects BEFORE provisioning — docker seam called 0 times (T-351-07 dropped-await guard)', async () => {
		const {vm, store} = makeManager()
		// The data-dir filesystem is almost full (1G free)...
		vi.mocked(probeHostCapacity).mockResolvedValueOnce({
			totalMemBytes: 64 * 1024 ** 3,
			cpuCount: 32,
			diskFreeBytes: 1 * 1024 ** 3,
		})
		// ...so the (sync) resource assert refuses the 512G disk request.
		vi.mocked(assertVmResourcesSane).mockImplementationOnce(() => {
			throw new VmResourceInvalid('Requested VM disk (512G) exceeds free space (1.0G available).')
		})

		await expect(
			vm.create({...WIN, resources: {cpus: 2, ramMiB: 4096, diskGiB: 512}}),
		).rejects.toBeInstanceOf(VmResourceInvalid)

		// The gate fired BEFORE provisioning: no registry write, no compose-up. This
		// is exactly the failure `tsc` cannot catch (a dropped Promise<void> await).
		expect(await records(store)).toHaveLength(0)
		expect(composeUp).toHaveBeenCalledTimes(0)
		// And the free space was probed LIVE against the data-dir (never cached).
		expect(probeHostCapacity).toHaveBeenCalledWith('/fake/data')
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

	// VMCREATE-04: the pessimistic `?? 'error'` fallback must be PRESERVED — an
	// UNMAPPED docker status (a crash-loop 'restarting', or any status not in the
	// table) derives 'error', NEVER a silent 'running'. Do NOT "fix" this toward
	// apps.ts's optimistic `|| 'ready'` (intentional divergence).
	test.each(['restarting', 'removing', 'wat-unknown'] as const)(
		'unmapped docker status %s → error (pessimistic fallback preserved)',
		async (dockerStatus) => {
			const {vm, store} = makeManager()
			await seed(store, {id: `u-${dockerStatus}`, containerName: `vm-u-${dockerStatus}`})
			vi.mocked(dockerInspectStatus).mockResolvedValueOnce(dockerStatus)

			const view = await vm.get(`u-${dockerStatus}`)
			expect(view?.state).toBe('error')
		},
	)

	// VMCREATE-04: an 'error' state with an EMPTY registry lastError still surfaces a
	// NON-EMPTY reason (the honest generic fallback) so the admin never sees a silent,
	// unexplained error. Here the container reports 'dead' (→ error) and no lastError
	// was ever recorded.
	test('error state + empty registry lastError → a non-empty generic reason is present', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'g1', containerName: 'vm-g1'}) // no lastError seeded
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('dead')

		const view = await vm.get('g1')
		expect(view?.state).toBe('error')
		expect(view?.lastError).toBeTruthy()
		expect(view?.lastError).toMatch(/unexpectedly|logs/i)
	})

	// A recorded reason ALWAYS wins over the synthesized generic one (no clobber).
	test('a recorded lastError is NOT overwritten by the generic reason', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'g2', containerName: 'vm-g2', lastError: 'compose-up: bind: address in use'})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('dead')

		const view = await vm.get('g2')
		expect(view?.state).toBe('error')
		expect(view?.lastError).toBe('compose-up: bind: address in use')
	})

	// lastError is NEVER fabricated for a healthy state — a 'running' VM has no error.
	test('a running VM does not fabricate a lastError', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'g3', containerName: 'vm-g3'})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')

		const view = await vm.get('g3')
		expect(view?.state).toBe('running')
		expect(view?.lastError).toBeUndefined()
	})

	// A cleanly stopped VM likewise has no fabricated reason.
	test('a stopped VM does not fabricate a lastError', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'g4', containerName: 'vm-g4', lastIntent: 'stopped'})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('exited')

		const view = await vm.get('g4')
		expect(view?.state).toBe('stopped')
		expect(view?.lastError).toBeUndefined()
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

	test('361 regression: restart() stays a plain composeRestart bounce — never composeStop/composeUp (do NOT repoint at apply)', async () => {
		// 361 adds an "Apply now" (stop+start = composeUp) affordance in the UI to
		// apply resource edits. The row Restart button + vm.restart MUST stay an
		// in-place `docker compose restart` bounce (the "unstick a hung VM" case) and
		// must NOT be repointed at the apply path — this pins that invariant forever.
		const {vm, store} = makeManager()
		await seed(store, {id: 'r361', containerName: 'vm-r361', lastIntent: 'running'})

		await vm.restart('r361')

		expect(composeRestart).toHaveBeenCalledWith('/fake/data/vm-data/seed-id/docker-compose.yml', 'vm-r361')
		expect(composeStop).not.toHaveBeenCalled()
		expect(composeUp).not.toHaveBeenCalled()
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

	// Phase 364 (VMENC-01): delete() releases the raw-VNC port (in lock-step with
	// novnc/rdp) so the slot recycles — and a record WITHOUT one (pre-364) is a no-op.
	test('delete releases the raw-VNC port (VMENC-01); a pre-364 record without one is a no-op', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'enc-del', containerName: 'vm-enc-del', novncPort: 16101, vncRawPort: 16307})
		const rawRel = vi.spyOn(vmVncRawPortAllocator, 'release')

		await vm.delete('enc-del', {confirm: true})
		expect(rawRel).toHaveBeenCalledWith(16307)

		// A record with NO vncRawPort (pre-364) must NOT call release with undefined.
		rawRel.mockClear()
		await seed(store, {id: 'legacy-del', containerName: 'vm-legacy-del', novncPort: 16102})
		await vm.delete('legacy-del', {confirm: true})
		expect(rawRel).not.toHaveBeenCalled()

		rawRel.mockRestore()
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

	// Live-found 2026-07-22 (the zombie-VM bug): a busy/locked guest data.img (held
	// by a qemu the compose-down couldn't reap, or an ORPHAN whose compose file is
	// already gone) makes fse.remove THROW. The durable teardown — force-remove the
	// container by name (frees the file), then registry.delete + port release — MUST
	// still run, or the VM the operator deleted resurrects in the list and gets
	// re-upped by reconcileOnBoot ("no such file or directory" on every boot).
	test('delete completes registry-delete even when fse.remove REJECTS (busy data.img) + force-removes by name', async () => {
		const {vm, store, logger} = makeManager()
		await seed(store, {id: 'zmb', containerName: 'vm-zmb', dataDir: '/fake/data/vm-data/zmb', novncPort: 16130, rdpPort: 16230})

		vi.mocked(fse.remove).mockRejectedValueOnce(Object.assign(new Error('EBUSY: resource busy'), {code: 'EBUSY'}))
		const novncRel = vi.spyOn(vmPortAllocator, 'release')
		const rdpRel = vi.spyOn(vmRdpPortAllocator, 'release')

		const result = await vm.delete('zmb', {confirm: true})

		expect(result).toEqual({deleted: true})
		// Container force-removed by its deterministic name (frees the busy file).
		expect(forceRemoveContainer).toHaveBeenCalledWith('vm-zmb')
		// The registry entry is GONE despite the dir-removal failure — no resurrection.
		expect(await records(store)).toHaveLength(0)
		expect(novncRel).toHaveBeenCalledWith(16130)
		expect(rdpRel).toHaveBeenCalledWith(16230)
		expect(logger.error).toHaveBeenCalled() // the dir-removal failure was logged

		novncRel.mockRestore()
		rdpRel.mockRestore()
	})

	// Live-found 2026-07-22: an orphaned record (compose file gone) gives a CLEAR
	// "files are missing — delete + recreate" error, not a raw docker "no such file
	// or directory", and never shells composeUp on a missing file.
	test('start throws a clear error (no composeUp) when the compose file is missing', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'orph', containerName: 'vm-orph', novncPort: 16140})
		vi.mocked(fse.pathExists).mockResolvedValueOnce(false as never)

		await expect(vm.start('orph')).rejects.toThrow(/files are missing/)
		expect(composeUp).not.toHaveBeenCalled()
	})
})

describe('rename — edit-where-safe (registry-only, single-flight)', () => {
	test('patches the name ONLY; every other field is untouched; NO docker calls', async () => {
		const {vm, store} = makeManager()
		await seed(store, {
			id: 'rn1',
			containerName: 'vm-rn1',
			name: 'old-name',
			kind: 'windows',
			resources: {cpus: 4, ramMiB: 8192, diskGiB: 128},
			novncPort: 16150,
			rdpPort: 16250,
		})

		await vm.rename('rn1', 'new-name')

		const rec = (await records(store)).find((r) => r.id === 'rn1')!
		expect(rec.name).toBe('new-name')
		// A rename is PURE metadata — nothing else moves.
		expect(rec.kind).toBe('windows')
		expect(rec.resources).toEqual({cpus: 4, ramMiB: 8192, diskGiB: 128})
		expect(rec.containerName).toBe('vm-rn1')
		expect(rec.novncPort).toBe(16150)
		expect(rec.rdpPort).toBe(16250)
		// No container/compose touched — nothing to recreate.
		expect(composeUp).not.toHaveBeenCalled()
		expect(composeStop).not.toHaveBeenCalled()
		expect(composeRestart).not.toHaveBeenCalled()
		expect(composeDownVolumes).not.toHaveBeenCalled()
	})

	test('rename of an unknown id throws not-found (no store write)', async () => {
		const {vm, store} = makeManager()
		await expect(vm.rename('ghost', 'whatever')).rejects.toThrow(/not found/)
		expect(await records(store)).toHaveLength(0)
	})

	test('rename refuses while another op on the SAME id is in flight (single-flight → already in progress)', async () => {
		const {vm, store} = makeManager()
		await seed(store, {id: 'rn2', containerName: 'vm-rn2', name: 'busy'})

		// Hold a stop open so the per-VM marker stays claimed.
		let releaseStop!: () => void
		vi.mocked(composeStop).mockImplementationOnce(
			() => new Promise<void>((res) => {
				releaseStop = () => res()
			}),
		)
		const first = vm.stop('rn2')
		// A rename on the same VM while the marker is held refuses immediately.
		await expect(vm.rename('rn2', 'nope')).rejects.toThrow(/already in progress/)
		releaseStop()
		await expect(first).resolves.toBeUndefined()
		// The name never changed — the rename was refused BEFORE any patch.
		expect((await records(store)).find((r) => r.id === 'rn2')!.name).toBe('busy')
	})
})

describe('encoded screen — VMENC-01 (honest VAAPI+running+port gate → StreamManager)', () => {
	test('happy: running VM with a vncRawPort → startVmStream({admin, vmId, port}); returns the stream handle', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'enc1', containerName: 'vm-enc1', vncRawPort: 16307})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')

		const res = await vm.startEncodedScreen('enc1')

		expect(res).toEqual({streamId: 's1', wsUrl: '/ws/vm-stream/s1'})
		expect(streamManager.startVmStream).toHaveBeenCalledWith({userId: 'admin', vmId: 'enc1', vncRawPort: 16307})
	})

	test('no VAAPI: refuses VmResourceInvalid; startVmStream NOT called (honest fallback to 355)', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'enc2', containerName: 'vm-enc2', vncRawPort: 16307})
		streamManager.encodeAvailable.mockReturnValueOnce(false)

		await expect(vm.startEncodedScreen('enc2')).rejects.toBeInstanceOf(VmResourceInvalid)
		expect(streamManager.startVmStream).not.toHaveBeenCalled()
	})

	test('not running: refuses VmResourceInvalid; startVmStream NOT called', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'enc3', containerName: 'vm-enc3', vncRawPort: 16307})
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('exited')

		await expect(vm.startEncodedScreen('enc3')).rejects.toBeInstanceOf(VmResourceInvalid)
		expect(streamManager.startVmStream).not.toHaveBeenCalled()
	})

	test('pre-364 record (no vncRawPort): refuses VmResourceInvalid; startVmStream NOT called', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'enc4', containerName: 'vm-enc4'}) // no vncRawPort
		// NOTE: no dockerInspectStatus once-mock — the vncRawPort guard throws BEFORE the
		// running check runs, so queuing one here would leak into a later test.

		await expect(vm.startEncodedScreen('enc4')).rejects.toBeInstanceOf(VmResourceInvalid)
		expect(streamManager.startVmStream).not.toHaveBeenCalled()
	})

	test('unknown id: not found; startVmStream NOT called', async () => {
		const {vm, streamManager} = makeManager()
		await expect(vm.startEncodedScreen('ghost')).rejects.toThrow(/not found/)
		expect(streamManager.startVmStream).not.toHaveBeenCalled()
	})

	test('stopEncodedScreen delegates to stopStreamsForVm and returns {stopped:true} when count>0', async () => {
		const {vm, streamManager} = makeManager()
		const res = await vm.stopEncodedScreen('enc5')
		expect(streamManager.stopStreamsForVm).toHaveBeenCalledWith('enc5')
		expect(res).toEqual({stopped: true})
	})

	test('stopEncodedScreen returns {stopped:false} when there was no live session', async () => {
		const {vm, streamManager} = makeManager()
		streamManager.stopStreamsForVm.mockResolvedValueOnce(0)
		const res = await vm.stopEncodedScreen('enc6')
		expect(res).toEqual({stopped: false})
	})

	test('stop() cascade-stops the VM’s encode session; a throwing cascade does NOT abort stop()', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'encstop', containerName: 'vm-encstop', lastIntent: 'running'})

		await vm.stop('encstop')
		expect(streamManager.stopStreamsForVm).toHaveBeenCalledWith('encstop')
		expect((await records(store))[0].lastIntent).toBe('stopped')

		// A throwing cascade is swallowed — stop() still resolves and records stopped intent.
		streamManager.stopStreamsForVm.mockRejectedValueOnce(new Error('cascade boom'))
		await seed(store, {id: 'encstop2', containerName: 'vm-encstop2', lastIntent: 'running'})
		await expect(vm.stop('encstop2')).resolves.toBeUndefined()
		expect((await records(store)).find((r) => r.id === 'encstop2')!.lastIntent).toBe('stopped')
	})

	test('delete() cascade-stops the encode session before teardown; a throwing cascade does NOT abort delete()', async () => {
		const {vm, store, streamManager} = makeManager()
		await seed(store, {id: 'encdel', containerName: 'vm-encdel', novncPort: 16109, vncRawPort: 16319})

		await vm.delete('encdel', {confirm: true})
		expect(streamManager.stopStreamsForVm).toHaveBeenCalledWith('encdel')
		expect(await records(store)).toHaveLength(0)

		// A throwing cascade must not abort the durable teardown.
		streamManager.stopStreamsForVm.mockRejectedValueOnce(new Error('cascade boom'))
		await seed(store, {id: 'encdel2', containerName: 'vm-encdel2', novncPort: 16110, vncRawPort: 16320})
		const res = await vm.delete('encdel2', {confirm: true})
		expect(res).toEqual({deleted: true})
		expect(await records(store)).toHaveLength(0)
	})
})

describe('update — sanctioned resize (VMSET-01: grow-only + capacity, restart-to-apply)', () => {
	const seedWin = (store: ReturnType<typeof makeFakeStore>, over: Partial<VmInstanceRecord> = {}) => {
		const id = over.id ?? 'up1'
		return seed(store, {
			id,
			containerName: `vm-${id}`,
			dataDir: `/fake/data/vm-data/${id}`,
			composePath: `/fake/data/vm-data/${id}/docker-compose.yml`,
			kind: 'windows',
			resources: {cpus: 2, ramMiB: 4096, diskGiB: 40},
			novncPort: 16160,
			rdpPort: 16260,
			osEnv: {VERSION: '10'},
			...over,
		})
	}

	test('happy: re-renders with the merged resources + preserved osEnv; patches registry; running → restartRequired', async () => {
		const {vm, store} = makeManager()
		await seedWin(store)
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')

		const res = await vm.update('up1', {resources: {ramMiB: 8192}})

		// Re-render carried the NEW ram + the UNCHANGED cpus/disk + the preserved OS env.
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({resources: {cpus: 2, ramMiB: 8192, diskGiB: 40}, osEnv: {VERSION: '10'}}),
		)
		// Registry now carries the new ram.
		const rec = (await records(store)).find((r) => r.id === 'up1')!
		expect(rec.resources).toEqual({cpus: 2, ramMiB: 8192, diskGiB: 40})
		// Honest restart-required (container is live) — NEVER auto-restarted.
		expect(res).toEqual({
			restartRequired: true,
			restartTriggered: false,
			restartReason: expect.any(String),
		})
	})

	test('a NON-running container → restartRequired:false (no restart claim)', async () => {
		const {vm, store} = makeManager()
		await seedWin(store)
		vi.mocked(dockerInspectStatus).mockRejectedValueOnce(new Error('No such container'))

		const res = await vm.update('up1', {resources: {ramMiB: 8192}})
		expect(res).toEqual({restartRequired: false, restartTriggered: false})
	})

	test('NEVER composeUp/composeStop/composeRestart inside the mutation (restart-to-apply)', async () => {
		const {vm, store} = makeManager()
		await seedWin(store)

		await vm.update('up1', {resources: {ramMiB: 8192}})

		expect(composeUp).not.toHaveBeenCalled()
		expect(composeStop).not.toHaveBeenCalled()
		expect(composeRestart).not.toHaveBeenCalled()
		// It DID rewrite the on-disk compose file (in place, same dataDir).
		expect(writeVmCompose).toHaveBeenCalledWith('/fake/data/vm-data/up1', expect.anything())
	})

	test('shrink/capacity reject: throws VmResourceInvalid, no render/write, registry unchanged', async () => {
		const {vm, store} = makeManager()
		await seedWin(store)
		vi.mocked(vmResizeVerdict).mockReturnValueOnce('Disk can only grow — requested 1G is below the current 40G.')

		await expect(vm.update('up1', {resources: {diskGiB: 1}})).rejects.toBeInstanceOf(VmResourceInvalid)

		expect(renderVmCompose).not.toHaveBeenCalled()
		expect(writeVmCompose).not.toHaveBeenCalled()
		// The registry resources are byte-unchanged — the resize was refused BEFORE any write.
		expect((await records(store)).find((r) => r.id === 'up1')!.resources).toEqual({cpus: 2, ramMiB: 4096, diskGiB: 40})
	})

	test('unknown id → not found (no write)', async () => {
		const {vm, store} = makeManager()
		await expect(vm.update('ghost', {resources: {ramMiB: 8192}})).rejects.toThrow(/not found/)
		expect(await records(store)).toHaveLength(0)
	})

	test('refuses while another op on the SAME id is in flight (single-flight → already in progress)', async () => {
		const {vm, store} = makeManager()
		await seedWin(store, {id: 'up2', containerName: 'vm-up2'})

		let releaseStop!: () => void
		vi.mocked(composeStop).mockImplementationOnce(
			() => new Promise<void>((res) => {
				releaseStop = () => res()
			}),
		)
		const first = vm.stop('up2')
		await expect(vm.update('up2', {resources: {ramMiB: 8192}})).rejects.toThrow(/already in progress/)
		releaseStop()
		await expect(first).resolves.toBeUndefined()
	})

	// LEGACY: a pre-359 record with NO osEnv recovers it from the on-disk compose
	// (readOsRenderInputs) so the OS is never dropped, AND backfills it onto the record.
	test('a legacy osEnv-less record: recovers the OS via readOsRenderInputs + backfills it', async () => {
		const {vm, store} = makeManager()
		await seedWin(store, {id: 'leg', containerName: 'vm-leg', osEnv: undefined})
		vi.mocked(readOsRenderInputs).mockResolvedValueOnce({osEnv: {VERSION: '10'}})

		await vm.update('leg', {resources: {ramMiB: 8192}})

		// The recovery seam was consulted (the record had no osEnv).
		expect(readOsRenderInputs).toHaveBeenCalledWith('/fake/data/vm-data/leg/docker-compose.yml', 'windows')
		// Re-render preserved the recovered OS.
		expect(renderVmCompose).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({osEnv: {VERSION: '10'}}),
		)
		// The record is now self-describing — osEnv backfilled.
		expect((await records(store)).find((r) => r.id === 'leg')!.osEnv).toEqual({VERSION: '10'})
	})

	// WR-01 (registry-first ordering): the grow-only guard's baseline is the REGISTRY
	// diskGiB, so the registry must be patched BEFORE the compose is written. A crash
	// between the two awaits must leave registry ahead-or-equal of compose (safe) — the
	// OPPOSITE ordering (compose-first) could leave compose>registry and let a later grow
	// re-render DISK_SIZE below the physical size (a forbidden shrink). Pin the call order.
	test('patches the registry BEFORE writing the compose file (WR-01 registry-first ordering)', async () => {
		const {vm, store} = makeManager()
		await seedWin(store)

		const order: string[] = []
		const patchSpy = vi.spyOn(VmRegistry.prototype, 'patch').mockImplementation(async () => {
			order.push('registry-patch')
		})
		vi.mocked(writeVmCompose).mockImplementationOnce(async (dataDir: string) => {
			order.push('write-compose')
			return `${dataDir}/docker-compose.yml`
		})

		await vm.update('up1', {resources: {ramMiB: 8192}})

		// Registry patch is authoritative-intent FIRST; the compose write is SECOND.
		expect(order).toEqual(['registry-patch', 'write-compose'])

		patchSpy.mockRestore()
	})

	// WR-02 (files-missing guard): parity with start() — update() on a VM whose compose
	// file (data dir / guest disk) was removed must refuse with a typed VmResourceInvalid
	// and NEVER render/write a fresh compose (which would silently recreate the data dir
	// over an unrecoverable VM and falsely report success).
	test('rejects (VmResourceInvalid) when the compose file is missing — no render/write (WR-02)', async () => {
		const {vm, store} = makeManager()
		await seedWin(store, {id: 'gone-up', containerName: 'vm-gone-up'})
		vi.mocked(fse.pathExists).mockResolvedValue(false as never)
		const patchSpy = vi.spyOn(VmRegistry.prototype, 'patch')

		await expect(vm.update('gone-up', {resources: {ramMiB: 8192}})).rejects.toBeInstanceOf(VmResourceInvalid)
		await expect(
			vm.update('gone-up', {resources: {ramMiB: 8192}}).catch((e) => (e as Error).message),
		).resolves.toMatch(/files are missing/)

		// Refused BEFORE any provisioning: no compose render/write, no registry patch,
		// and the registry resources are byte-unchanged.
		expect(renderVmCompose).not.toHaveBeenCalled()
		expect(writeVmCompose).not.toHaveBeenCalled()
		expect(patchSpy).not.toHaveBeenCalled()
		expect((await records(store)).find((r) => r.id === 'gone-up')!.resources).toEqual({cpus: 2, ramMiB: 4096, diskGiB: 40})

		patchSpy.mockRestore()
		vi.mocked(fse.pathExists).mockResolvedValue(true as never) // restore default for later tests
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

	// Live-found 2026-07-22: a record whose compose file is GONE (orphan/partial
	// delete) must be SKIPPED — not composeUp'd — so boot does not spam "no such
	// file or directory" on every restart. The other running VM still reconciles.
	test('reconcileOnBoot SKIPS a record whose compose file is missing (no composeUp) + still re-ups the others', async () => {
		const {vm, store, logger} = makeManager()
		await seed(store, {id: 'gone', containerName: 'vm-gone', composePath: '/p/gone.yml', lastIntent: 'running'})
		await seed(store, {id: 'ok', containerName: 'vm-ok', composePath: '/p/ok.yml', lastIntent: 'running'})
		// Only the 'gone' VM's compose file is missing.
		vi.mocked(fse.pathExists).mockImplementation(async (p: unknown) => p !== '/p/gone.yml')

		await vm.reconcileOnBoot()

		expect(composeUp).toHaveBeenCalledTimes(1)
		expect(composeUp).toHaveBeenCalledWith('/p/ok.yml', 'vm-ok')
		expect(composeUp).not.toHaveBeenCalledWith('/p/gone.yml', 'vm-gone')
		expect(logger.log).toHaveBeenCalled() // the skip was logged

		vi.mocked(fse.pathExists).mockResolvedValue(true as never) // restore default for later tests
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
		await seed(store, {id: 'p1', containerName: 'vm-p1', composePath: '/p/p1.yml', kind: 'windows', lastIntent: 'running', novncPort: 16100, rdpPort: 16200, vncRawPort: 16300})
		await seed(store, {id: 'p2', containerName: 'vm-p2', composePath: '/p/p2.yml', lastIntent: 'stopped', novncPort: 16101, vncRawPort: 16301}) // stopped still owns its ports

		const novncReserve = vi.spyOn(vmPortAllocator, 'reserve')
		const rdpReserve = vi.spyOn(vmRdpPortAllocator, 'reserve')
		const rawReserve = vi.spyOn(vmVncRawPortAllocator, 'reserve')

		await vm.reconcileOnBoot()

		// Every persisted noVNC port is reserved — including the STOPPED VM's.
		expect(novncReserve).toHaveBeenCalledWith(16100)
		expect(novncReserve).toHaveBeenCalledWith(16101)
		// The windows RDP port is reserved too; the linux VM has no RDP port to reserve.
		expect(rdpReserve).toHaveBeenCalledWith(16200)
		expect(rdpReserve).toHaveBeenCalledTimes(1)
		// Phase 364 (VMENC-01): every persisted raw-VNC port is re-primed — running AND
		// stopped — BEFORE any create() can re-hand-out a live VM's raw RFB port.
		expect(rawReserve).toHaveBeenCalledWith(16300)
		expect(rawReserve).toHaveBeenCalledWith(16301)

		novncReserve.mockRestore()
		rdpReserve.mockRestore()
		rawReserve.mockRestore()
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

describe('stats() + diskUsage() — live per-VM usage (VMSTATS-01)', () => {
	// A running windows VM seeded straight into the fake store. resources are the
	// ALLOCATED source of truth (ramMiB 4096 / cpus 2 / diskGiB 40); dataDir pins
	// the exact `${dataDir}/storage` du path the disk read must use.
	async function seedRunning(store: ReturnType<typeof makeFakeStore>) {
		return seed(store, {
			kind: 'windows',
			resources: {cpus: 2, ramMiB: 4096, diskGiB: 40},
			id: 'st1',
			containerName: 'vm-st1',
			dataDir: '/fake/data/vm-data/st1',
		})
	}

	test('running stats: pairs live cpu%/working-set RAM against registry-allocated', async () => {
		const {vm, store} = makeManager()
		await seedRunning(store)
		// An earlier test in this file sets a PERSISTENT mockResolvedValue('exited'),
		// so the running-path tests explicitly assert 'running' (mirrors :636/:657/:978).
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')
		const s = (await vm.stats('st1'))!
		expect(s.running).toBe(true)
		expect(s.cpuPercent).toBe(12.5)
		expect(s.ramUsedMiB).toBe(2048) // 2 GiB working set / 1024^2
		expect(s.ramAllocMiB).toBe(4096)
		expect(s.cpuAllocated).toBe(2)
	})

	test('allocated RAM comes from the registry, NEVER the cgroup memoryLimit sentinel', async () => {
		const {vm, store} = makeManager()
		await seedRunning(store)
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')
		const s = (await vm.stats('st1'))!
		// The mock returns an absurd memoryLimit (999_999_999_999) / memoryPercent
		// (999); ramAllocMiB must equal the registry ramMiB, proving neither leaks in.
		expect(s.ramAllocMiB).toBe(4096)
	})

	test('stopped stats: honest allocated-only, getContainerStats NEVER called', async () => {
		const {vm, store} = makeManager()
		await seedRunning(store)
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('exited')
		const s = (await vm.stats('st1'))!
		expect(s.running).toBe(false)
		expect(s.cpuPercent).toBeUndefined()
		expect(s.ramUsedMiB).toBeUndefined()
		expect(s.ramAllocMiB).toBe(4096)
		expect(s.cpuAllocated).toBe(2)
		expect(getContainerStats).not.toHaveBeenCalled()
	})

	test('running diskUsage: du of `${dataDir}/storage` paired with allocated', async () => {
		const {vm, store} = makeManager()
		await seedRunning(store)
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('running')
		const d = (await vm.diskUsage('st1'))!
		expect(d.running).toBe(true)
		expect(d.diskUsedBytes).toBe(21 * 1024 ** 3)
		expect(d.diskAllocGiB).toBe(40)
		expect(getDirectorySize).toHaveBeenCalledWith('/fake/data/vm-data/st1/storage')
	})

	test('stopped diskUsage: honest allocated-only, getDirectorySize NEVER shelled out', async () => {
		const {vm, store} = makeManager()
		await seedRunning(store)
		vi.mocked(dockerInspectStatus).mockResolvedValueOnce('exited')
		const d = (await vm.diskUsage('st1'))!
		expect(d.running).toBe(false)
		expect(d.diskUsedBytes).toBeUndefined()
		expect(d.diskAllocGiB).toBe(40)
		expect(getDirectorySize).not.toHaveBeenCalled()
	})

	test('unknown id → undefined (get() read convention, never a throw)', async () => {
		const {vm} = makeManager()
		await expect(vm.stats('ghost')).resolves.toBeUndefined()
		await expect(vm.diskUsage('ghost')).resolves.toBeUndefined()
	})
})
