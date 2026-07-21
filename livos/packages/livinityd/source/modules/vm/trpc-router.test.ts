/**
 * Phase 350 (VMLIFE-02/03) — vm.* tRPC router trust-boundary tests.
 *
 * Pins the router's structural guarantees WITHOUT a live VmManager/docker,
 * mirroring landns-routes.test.ts's createCaller + fake-ctx shape:
 *   V4  — EVERY procedure (reads AND mutations) is admin-gated: a non-admin
 *         (member) caller is refused BEFORE the delegate runs (the mock method
 *         is asserted NOT called) — no member-VM path exists (T-350-14).
 *   ZOD — create rejects a bad input (missing name / kind not in enum /
 *         non-positive cpus) and delete rejects a missing/false confirm, all at
 *         the zod boundary before the manager is touched (T-350-15).
 *   MAP — a KvmUnavailable / VmResourceInvalid from create maps to BAD_REQUEST
 *         and an "...already in progress" race maps to CONFLICT — never a 500
 *         (T-350-18).
 *   DELEGATE — an admin caller reaches each handler and the VmManager method is
 *         invoked with the right args.
 *
 * The VmManager is faked as an object of vi.fn on ctx.livinityd.vm — the router
 * only delegates, so no docker/store is needed.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {beforeEach, describe, expect, test, vi} from 'vitest'

// Phase 351 (VMCREATE-03/04): createOptions calls probeHostCapacity (live df) +
// detectGpu (shells out). Mock BOTH so the router tests stay offline. The
// preflight mock uses importOriginal so KvmUnavailable/VmResourceInvalid keep
// their REAL class identity (the boundary `instanceof` checks + the tests'
// `new KvmUnavailable(...)` depend on it).
vi.mock('../apps/vm-preflight.js', async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...actual,
		probeHostCapacity: vi.fn(async () => ({
			totalMemBytes: 64 * 1024 ** 3,
			cpuCount: 32,
			diskFreeBytes: 4096 * 1024 ** 3,
		})),
	}
})
vi.mock('../system/gpu.js', () => ({
	detectGpu: vi.fn(async () => ({
		present: false,
		vendor: 'none',
		wsl2: false,
		toolkitConfigured: false,
		driverSource: 'none',
	})),
}))

import {KvmUnavailable, VmResourceInvalid, probeHostCapacity} from '../apps/vm-preflight.js'
import {detectGpu} from '../system/gpu.js'
import vm, {__resetVmCreateOptionsCache} from './trpc-router.js'

// A fake VmManager: every method a vi.fn with a benign default resolution.
function makeVmMock() {
	return {
		list: vi.fn(async () => []),
		get: vi.fn(async () => undefined),
		create: vi.fn(async () => ({id: '00000000-0000-0000-0000-000000000001'})),
		start: vi.fn(async () => {}),
		stop: vi.fn(async () => {}),
		restart: vi.fn(async () => {}),
		delete: vi.fn(async () => ({deleted: true})),
	}
}

function makeCtx(opts: {role?: string; vmMock?: ReturnType<typeof makeVmMock>} = {}) {
	const vmMock = opts.vmMock ?? makeVmMock()
	return {
		__vm: vmMock,
		currentUser: {id: 'admin-1', username: 'admin', role: opts.role ?? 'admin'},
		dangerouslyBypassAuthentication: true,
		logger: {error() {}, info() {}, warn() {}, verbose() {}, log() {}},
		livinityd: {vm: vmMock, dataDirectory: '/fake/data'},
		request: undefined,
		server: undefined,
	}
}

const caller = (opts?: Parameters<typeof makeCtx>[0]) => vm.createCaller(makeCtx(opts))

// A valid uuid + a valid create payload reused across the happy-path assertions.
// Phase 351 (VMCREATE-01): create now carries a discriminated `os` selection —
// a linux distro here (the manager delegate must receive the whole payload incl.
// `os`, so it is part of the reused fixture).
const UUID = '11111111-1111-4111-8111-111111111111'
const VALID_CREATE = {
	name: 'My VM',
	kind: 'linux',
	resources: {cpus: 2, ramMiB: 4096, diskGiB: 40},
	os: {distro: 'ubuntu'},
}

describe('vm router — namespace shape', () => {
	test('exposes list / get / create / start / stop / restart / delete', () => {
		const procs = (vm as any)._def?.procedures ?? {}
		for (const name of ['list', 'get', 'create', 'createOptions', 'start', 'stop', 'restart', 'delete']) {
			expect(procs[name]).toBeDefined()
		}
	})
})

describe('every vm.* procedure is admin-gated (V4 / T-350-14)', () => {
	test('list rejects a non-admin (member) before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).list()).rejects.toThrow()
		expect(vmMock.list).not.toHaveBeenCalled()
	})
	test('get rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).get({id: UUID})).rejects.toThrow()
		expect(vmMock.get).not.toHaveBeenCalled()
	})
	test('create rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).create(VALID_CREATE)).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('start rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).start({id: UUID})).rejects.toThrow()
		expect(vmMock.start).not.toHaveBeenCalled()
	})
	test('stop rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).stop({id: UUID})).rejects.toThrow()
		expect(vmMock.stop).not.toHaveBeenCalled()
	})
	test('restart rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).restart({id: UUID})).rejects.toThrow()
		expect(vmMock.restart).not.toHaveBeenCalled()
	})
	test('delete rejects a non-admin before the delegate', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'member', vmMock}).delete({id: UUID, confirm: true})).rejects.toThrow()
		expect(vmMock.delete).not.toHaveBeenCalled()
	})
	test('a guest role (unknown-to-admin) is also refused', async () => {
		const vmMock = makeVmMock()
		await expect(caller({role: 'guest', vmMock}).list()).rejects.toThrow()
		expect(vmMock.list).not.toHaveBeenCalled()
	})
})

describe('an admin caller reaches each handler and delegates with the right args', () => {
	test('list delegates to VmManager.list', async () => {
		const vmMock = makeVmMock()
		vmMock.list.mockResolvedValueOnce([{id: UUID, name: 'x'}])
		const res = await caller({vmMock}).list()
		expect(vmMock.list).toHaveBeenCalledTimes(1)
		expect(res).toEqual([{id: UUID, name: 'x'}])
	})
	test('get delegates the uuid to VmManager.get', async () => {
		const vmMock = makeVmMock()
		await caller({vmMock}).get({id: UUID})
		expect(vmMock.get).toHaveBeenCalledWith(UUID)
	})
	test('create delegates the whole validated payload to VmManager.create', async () => {
		const vmMock = makeVmMock()
		const res = await caller({vmMock}).create(VALID_CREATE)
		expect(vmMock.create).toHaveBeenCalledWith(VALID_CREATE)
		expect(res).toEqual({id: '00000000-0000-0000-0000-000000000001'})
	})
	test('start / stop / restart delegate the uuid', async () => {
		const vmMock = makeVmMock()
		const c = caller({vmMock})
		await c.start({id: UUID})
		await c.stop({id: UUID})
		await c.restart({id: UUID})
		expect(vmMock.start).toHaveBeenCalledWith(UUID)
		expect(vmMock.stop).toHaveBeenCalledWith(UUID)
		expect(vmMock.restart).toHaveBeenCalledWith(UUID)
	})
	test('delete delegates {confirm:true} to VmManager.delete', async () => {
		const vmMock = makeVmMock()
		const res = await caller({vmMock}).delete({id: UUID, confirm: true})
		expect(vmMock.delete).toHaveBeenCalledWith(UUID, {confirm: true})
		expect(res).toEqual({deleted: true})
	})
})

describe('zod validation rejects bad input BEFORE the manager (T-350-15)', () => {
	test('create with a missing name is refused at the boundary', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({kind: 'linux', resources: {cpus: 2, ramMiB: 4096, diskGiB: 40}} as any)).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('create with an empty name is refused (min(1))', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, name: ''})).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	// IN-03: name is upper-bounded (.max(255)) so an unbounded multi-MB name
	// cannot bloat the registry store. A 256-char name is refused; 255 is accepted.
	test('create with an over-long name (>255) is refused at the boundary (IN-03)', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, name: 'x'.repeat(256)})).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('create with a 255-char name is accepted (IN-03 boundary)', async () => {
		const vmMock = makeVmMock()
		const name = 'x'.repeat(255)
		await caller({vmMock}).create({...VALID_CREATE, name})
		expect(vmMock.create).toHaveBeenCalledWith(expect.objectContaining({name}))
	})
	test('create with a kind not in the enum is refused', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, kind: 'macos'} as any)).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('create with non-positive cpus is refused', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, resources: {cpus: 0, ramMiB: 4096, diskGiB: 40}})).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('create with a non-integer cpus is refused', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, resources: {cpus: 1.5, ramMiB: 4096, diskGiB: 40}})).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
	test('get / start with a non-uuid id is refused', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).get({id: 'not-a-uuid'})).rejects.toThrow()
		await expect(caller({vmMock}).start({id: 'not-a-uuid'})).rejects.toThrow()
		expect(vmMock.get).not.toHaveBeenCalled()
		expect(vmMock.start).not.toHaveBeenCalled()
	})
	test('delete WITHOUT confirm is refused at the boundary', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).delete({id: UUID} as any)).rejects.toThrow()
		expect(vmMock.delete).not.toHaveBeenCalled()
	})
	test('delete with confirm:false is refused (literal(true) only)', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).delete({id: UUID, confirm: false} as any)).rejects.toThrow()
		expect(vmMock.delete).not.toHaveBeenCalled()
	})
})

describe('OS selection discriminated union (VMCREATE-01) — schema is the cheap first gate', () => {
	test('windows + a valid edition is accepted and delegated with the os field', async () => {
		const vmMock = makeVmMock()
		const payload = {name: 'Win VM', kind: 'windows', resources: {cpus: 2, ramMiB: 4096, diskGiB: 64}, os: {edition: '11'}}
		await caller({vmMock}).create(payload)
		expect(vmMock.create).toHaveBeenCalledWith(payload)
	})

	test('linux + a valid distro is accepted and delegated', async () => {
		const vmMock = makeVmMock()
		await caller({vmMock}).create(VALID_CREATE)
		expect(vmMock.create).toHaveBeenCalledWith(VALID_CREATE)
	})

	test('linux + a custom https image URL is accepted', async () => {
		const vmMock = makeVmMock()
		const payload = {
			name: 'Custom VM',
			kind: 'linux',
			resources: {cpus: 2, ramMiB: 4096, diskGiB: 40},
			os: {customImage: {url: 'https://cdn.example/boot.iso'}},
		}
		await caller({vmMock}).create(payload)
		expect(vmMock.create).toHaveBeenCalledWith(payload)
	})

	test('windows + a macOS/unlisted edition is refused at the boundary (never reaches the manager)', async () => {
		const vmMock = makeVmMock()
		await expect(
			caller({vmMock}).create({name: 'x', kind: 'windows', resources: {cpus: 2, ramMiB: 4096, diskGiB: 64}, os: {edition: 'macos'}}),
		).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})

	test('linux + an unlisted distro is refused at the boundary', async () => {
		const vmMock = makeVmMock()
		await expect(caller({vmMock}).create({...VALID_CREATE, os: {distro: 'plan9'}})).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})

	test('linux + a custom file:// image URL is refused (http/https only)', async () => {
		const vmMock = makeVmMock()
		await expect(
			caller({vmMock}).create({...VALID_CREATE, os: {customImage: {url: 'file:///etc/passwd'}}}),
		).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})

	test('linux + a custom ftp:// image URL is refused (http/https only)', async () => {
		const vmMock = makeVmMock()
		await expect(
			caller({vmMock}).create({...VALID_CREATE, os: {customImage: {url: 'ftp://example.com/boot.iso'}}}),
		).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})

	test('a create with the os field entirely missing is refused', async () => {
		const vmMock = makeVmMock()
		await expect(
			caller({vmMock}).create({name: 'x', kind: 'linux', resources: {cpus: 2, ramMiB: 4096, diskGiB: 40}}),
		).rejects.toThrow()
		expect(vmMock.create).not.toHaveBeenCalled()
	})
})

describe('vm.createOptions (VMCREATE-03/04) — options surface + honest GPU verdict', () => {
	beforeEach(() => {
		__resetVmCreateOptionsCache()
		vi.mocked(detectGpu).mockResolvedValue({
			present: false,
			vendor: 'none',
			wsl2: false,
			toolkitConfigured: false,
			driverSource: 'none',
		})
		vi.mocked(probeHostCapacity).mockResolvedValue({
			totalMemBytes: 64 * 1024 ** 3,
			cpuCount: 32,
			diskFreeBytes: 4096 * 1024 ** 3,
		})
	})

	test('is admin-gated: a non-admin caller is refused before any probe runs', async () => {
		await expect(caller({role: 'member'}).createOptions()).rejects.toThrow()
		expect(probeHostCapacity).not.toHaveBeenCalled()
		expect(detectGpu).not.toHaveBeenCalled()
	})

	test('returns the OS catalog (windows editions + linux distros) data-driven from the catalog', async () => {
		const res = await caller().createOptions()
		// A representative, load-bearing edition/distro is present with its label + defaults.
		expect(res.os.windows['11'].label).toContain('Windows 11')
		expect(res.os.windows['11'].defaults).toMatchObject({cpus: expect.any(Number), ramMiB: expect.any(Number), diskGiB: expect.any(Number)})
		expect(res.os.linux.ubuntu.label).toContain('Ubuntu')
		expect(res.os.linux.debian.defaults.diskGiB).toBeGreaterThan(0)
		// macOS is ABSENT by construction — never a catalog key.
		expect((res.os.windows as any).macos).toBeUndefined()
	})

	test('carries the verbatim BYO-license notice', async () => {
		const res = await caller().createOptions()
		expect(res.byoLicenseNotice).toContain('supply your own valid Windows license')
	})

	test('reports host capacity {cpuCount, totalMemBytes, diskFreeBytes} (display-only disk)', async () => {
		const res = await caller().createOptions()
		expect(res.hostCapacity).toEqual({
			cpuCount: 32,
			totalMemBytes: 64 * 1024 ** 3,
			diskFreeBytes: 4096 * 1024 ** 3,
		})
		expect(probeHostCapacity).toHaveBeenCalledWith('/fake/data')
	})

	// The REGRESSION that pins VMCREATE-03: gpu.status is a HARDCODED literal and is
	// NEVER derived from detectGpu().present. A mocked-PRESENT GPU must NOT flip it —
	// if this ever fails, the wiring accidentally leaked hostGpu.present into status.
	test('gpu.status stays "unsupported" EVEN when detectGpu reports a present GPU (T-351-10)', async () => {
		vi.mocked(detectGpu).mockResolvedValue({
			present: true,
			vendor: 'nvidia',
			wsl2: false,
			toolkitConfigured: true,
			driverSource: 'linux-native',
		})
		const res = await caller().createOptions()
		expect(res.gpu.status).toBe('unsupported')
		// hostGpu is surfaced INFORMATIONALLY — present:true is reported, but it did
		// not (and must never) flip the verdict.
		expect(res.gpu.hostGpu.present).toBe(true)
		expect(res.gpu.hostGpu.vendor).toBe('nvidia')
	})

	test('a df-fail-closed probe (diskFreeBytes 0) still returns options, never 500s', async () => {
		vi.mocked(probeHostCapacity).mockResolvedValue({totalMemBytes: 64 * 1024 ** 3, cpuCount: 32, diskFreeBytes: 0})
		const res = await caller().createOptions()
		expect(res.hostCapacity.diskFreeBytes).toBe(0)
		expect(res.gpu.status).toBe('unsupported')
	})

	// IN-02: on a mis-wired daemon with NO dataDirectory, createOptions must surface
	// the wiring fault (INTERNAL_SERVER_ERROR) rather than probing '' → a misleading
	// "0 GB free". The probe is never reached.
	test('a mis-wired daemon (no dataDirectory) → INTERNAL_SERVER_ERROR, never a misleading "0 GB free" (IN-02)', async () => {
		vi.mocked(probeHostCapacity).mockClear() // this file has no per-test clearAllMocks — isolate the call assertion
		const ctx = makeCtx()
		;(ctx.livinityd as {dataDirectory?: string}).dataDirectory = undefined
		await expect(vm.createCaller(ctx).createOptions()).rejects.toMatchObject({code: 'INTERNAL_SERVER_ERROR'})
		expect(probeHostCapacity).not.toHaveBeenCalled()
	})
})

describe('domain errors map to typed TRPCErrors at the boundary (T-350-18)', () => {
	test('KvmUnavailable from create → BAD_REQUEST (not a 500)', async () => {
		const vmMock = makeVmMock()
		vmMock.create.mockRejectedValueOnce(new KvmUnavailable('no /dev/kvm on this box'))
		await expect(caller({vmMock}).create(VALID_CREATE)).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})
	test('VmResourceInvalid from create → BAD_REQUEST', async () => {
		const vmMock = makeVmMock()
		vmMock.create.mockRejectedValueOnce(new VmResourceInvalid('requested RAM exceeds host capacity'))
		await expect(caller({vmMock}).create(VALID_CREATE)).rejects.toMatchObject({code: 'BAD_REQUEST'})
	})
	test('an "already in progress" single-flight race → CONFLICT', async () => {
		const vmMock = makeVmMock()
		vmMock.start.mockRejectedValueOnce(new Error(`VM ${UUID}: an operation is already in progress`))
		await expect(caller({vmMock}).start({id: UUID})).rejects.toMatchObject({code: 'CONFLICT'})
	})
	test('an unrelated error is NOT relabeled (re-thrown → INTERNAL_SERVER_ERROR)', async () => {
		const vmMock = makeVmMock()
		vmMock.stop.mockRejectedValueOnce(new Error('some unexpected docker failure'))
		await expect(caller({vmMock}).stop({id: UUID})).rejects.toMatchObject({code: 'INTERNAL_SERVER_ERROR'})
	})
})

describe('a mis-wired daemon (no VmManager) surfaces a typed 500, not a crash', () => {
	beforeEach(() => vi.clearAllMocks())
	test('requireVm throws INTERNAL_SERVER_ERROR when ctx.livinityd.vm is absent', async () => {
		const ctx = makeCtx()
		// Strip the VM manager off the (admin) ctx to hit the requireVm guard.
		;(ctx.livinityd as any).vm = undefined
		await expect(vm.createCaller(ctx).list()).rejects.toMatchObject({code: 'INTERNAL_SERVER_ERROR'})
	})
})
