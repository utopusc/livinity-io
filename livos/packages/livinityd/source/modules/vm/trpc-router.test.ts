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

import {KvmUnavailable, VmResourceInvalid} from '../apps/vm-preflight.js'
import vm from './trpc-router.js'

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
		livinityd: {vm: vmMock},
		request: undefined,
		server: undefined,
	}
}

const caller = (opts?: Parameters<typeof makeCtx>[0]) => vm.createCaller(makeCtx(opts))

// A valid uuid + a valid create payload reused across the happy-path assertions.
const UUID = '11111111-1111-4111-8111-111111111111'
const VALID_CREATE = {name: 'My VM', kind: 'linux', resources: {cpus: 2, ramMiB: 4096, diskGiB: 40}}

describe('vm router — namespace shape', () => {
	test('exposes list / get / create / start / stop / restart / delete', () => {
		const procs = (vm as any)._def?.procedures ?? {}
		for (const name of ['list', 'get', 'create', 'start', 'stop', 'restart', 'delete']) {
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
