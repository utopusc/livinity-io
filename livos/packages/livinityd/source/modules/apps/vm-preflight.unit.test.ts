// Phase 349 (VM-01) — vm-preflight pure-verdict + probe tests.
import {access} from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {getDiskUsageByPath} from '../system/system.js'
import {
	kvmVerdict,
	probeKvm,
	assertKvmAvailable,
	KvmUnavailable,
	VmResourceInvalid,
	parseSizeToBytes,
	vmResourceVerdict,
	probeHostCapacity,
	assertVmResourcesSane,
} from './vm-preflight.js'

vi.mock('node:fs/promises', () => ({
	access: vi.fn(),
	constants: {F_OK: 0, R_OK: 4, W_OK: 2},
}))

// Phase 351 (VMCREATE-02): mock the shared df seam so probeHostCapacity is offline.
vi.mock('../system/system.js', () => ({
	getDiskUsageByPath: vi.fn(),
}))

const mockAccess = vi.mocked(access)
const mockDiskUsage = vi.mocked(getDiskUsageByPath)

afterEach(() => vi.clearAllMocks())

describe('kvmVerdict (pure policy)', () => {
	test('present + accessible → allow (null)', () => {
		expect(kvmVerdict({present: true, accessible: true})).toBeNull()
	})
	test('absent → refuse with BIOS/WSL guidance', () => {
		const r = kvmVerdict({present: false, accessible: false})
		expect(r).toMatch(/no \/dev\/kvm/i)
		expect(r).toMatch(/BIOS|UEFI/)
		expect(r).toMatch(/nestedVirtualization/)
	})
	test('present but daemon-inaccessible → STILL allow (container runs as root with device mapped in)', () => {
		// The VM container maps /dev/kvm and runs as root, so the daemon user not
		// being in the `kvm` group must NOT refuse the install (false-negative).
		expect(kvmVerdict({present: true, accessible: false})).toBeNull()
	})
})

describe('probeKvm (live probe, never throws)', () => {
	test('both checks pass → present+accessible', async () => {
		mockAccess.mockResolvedValue(undefined as never)
		expect(await probeKvm('/dev/kvm')).toEqual({present: true, accessible: true})
	})
	test('F_OK fails → absent', async () => {
		mockAccess.mockRejectedValue(new Error('ENOENT') as never)
		expect(await probeKvm('/dev/kvm')).toEqual({present: false, accessible: false})
	})
	test('F_OK ok but R_OK|W_OK fails → present, not accessible', async () => {
		mockAccess.mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error('EACCES') as never)
		expect(await probeKvm('/dev/kvm')).toEqual({present: true, accessible: false})
	})
})

describe('assertKvmAvailable', () => {
	test('usable KVM → resolves', async () => {
		mockAccess.mockResolvedValue(undefined as never)
		await expect(assertKvmAvailable('/dev/kvm')).resolves.toBeUndefined()
	})
	test('absent KVM → throws KvmUnavailable', async () => {
		mockAccess.mockRejectedValue(new Error('ENOENT') as never)
		await expect(assertKvmAvailable('/dev/kvm')).rejects.toBeInstanceOf(KvmUnavailable)
	})
})

describe('parseSizeToBytes', () => {
	test('units', () => {
		expect(parseSizeToBytes('4G')).toBe(4 * 1024 ** 3)
		expect(parseSizeToBytes('512M')).toBe(512 * 1024 ** 2)
		expect(parseSizeToBytes('2048K')).toBe(2048 * 1024)
		expect(parseSizeToBytes('1073741824')).toBe(1073741824)
		expect(parseSizeToBytes('8g')).toBe(8 * 1024 ** 3)
	})
	test('unparseable → null', () => {
		expect(parseSizeToBytes('lots')).toBeNull()
		expect(parseSizeToBytes(undefined)).toBeNull()
	})
})

describe('vmResourceVerdict (#6 foot-gun guard)', () => {
	// Phase 351: HostCapacity now carries diskFreeBytes (100G free here).
	const host = {totalMemBytes: 16 * 1024 ** 3, cpuCount: 8, diskFreeBytes: 100 * 1024 ** 3}
	test('reasonable request → allow', () => {
		expect(vmResourceVerdict({RAM_SIZE: '4G', CPU_CORES: '2', DISK_SIZE: '64G'}, host)).toBeNull()
	})
	test('RAM over 90% of host → refuse', () => {
		const r = vmResourceVerdict({RAM_SIZE: '999G'}, host)
		expect(r).toMatch(/exceeds this box/i)
	})
	test('CPU over host cores → refuse', () => {
		expect(vmResourceVerdict({CPU_CORES: '64'}, host)).toMatch(/cores/i)
	})
	test('missing/blank env → allow (defaults applied later)', () => {
		expect(vmResourceVerdict({}, host)).toBeNull()
	})

	// Phase 351 (VMCREATE-02): the disk bound.
	test('disk over free space → refuse, naming the resource + requested vs available', () => {
		const r = vmResourceVerdict({DISK_SIZE: '256G'}, {...host, diskFreeBytes: 30 * 1024 ** 3})
		expect(r).toMatch(/disk/i)
		expect(r).toContain('256G') // requested named
		expect(r).toContain('30.0G available') // available named
	})
	test('disk fits free space → allow (null)', () => {
		expect(vmResourceVerdict({DISK_SIZE: '20G'}, {...host, diskFreeBytes: 30 * 1024 ** 3})).toBeNull()
	})
	test('fail-closed: zero free space refuses any positive disk request', () => {
		expect(vmResourceVerdict({DISK_SIZE: '1G'}, {...host, diskFreeBytes: 0})).toMatch(/disk/i)
	})
})

describe('probeHostCapacity (live probe — disk via getDiskUsageByPath, fail-closed)', () => {
	test('df success → diskFreeBytes = available; RAM/CPU from os', async () => {
		mockDiskUsage.mockResolvedValueOnce({size: 500 * 1024 ** 3, totalUsed: 200 * 1024 ** 3, available: 300 * 1024 ** 3})
		const cap = await probeHostCapacity('/fake/data')
		expect(cap.diskFreeBytes).toBe(300 * 1024 ** 3)
		expect(cap.totalMemBytes).toBeGreaterThan(0)
		expect(cap.cpuCount).toBeGreaterThan(0)
		expect(mockDiskUsage).toHaveBeenCalledWith('/fake/data')
	})
	test('df throws → fails CLOSED with diskFreeBytes 0 (never throws)', async () => {
		mockDiskUsage.mockRejectedValueOnce(new Error('df: no such path'))
		const cap = await probeHostCapacity('/fake/data')
		expect(cap.diskFreeBytes).toBe(0)
		expect(cap.totalMemBytes).toBeGreaterThan(0)
	})
})

describe('assertVmResourcesSane (sync — throws VmResourceInvalid; disk injected via host)', () => {
	const host = {totalMemBytes: 16 * 1024 ** 3, cpuCount: 8, diskFreeBytes: 100 * 1024 ** 3}
	test('sane request → no throw', () => {
		expect(() => assertVmResourcesSane({RAM_SIZE: '4G', CPU_CORES: '2', DISK_SIZE: '32G'}, host)).not.toThrow()
	})
	test('over-large disk → throws VmResourceInvalid (propagates synchronously to the caller)', () => {
		expect(() =>
			assertVmResourcesSane({DISK_SIZE: '999G'}, {...host, diskFreeBytes: 10 * 1024 ** 3}),
		).toThrow(VmResourceInvalid)
	})
	// The legacy app-install caller (apps.ts) passes NO host: the default self-probes
	// RAM/CPU and leaves disk UNBOUNDED, so a bare DISK_SIZE never trips a false
	// refusal on the app path (only RAM/CPU are guarded there, exactly as in 349).
	test('default host (no host arg): RAM/CPU still guarded, disk unbounded', () => {
		expect(() => assertVmResourcesSane({DISK_SIZE: '999999G'})).not.toThrow()
		expect(() => assertVmResourcesSane({CPU_CORES: '999999'})).toThrow(VmResourceInvalid)
	})
})
