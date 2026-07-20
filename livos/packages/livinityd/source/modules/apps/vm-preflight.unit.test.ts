// Phase 349 (VM-01) — vm-preflight pure-verdict + probe tests.
import {access} from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {
	kvmVerdict,
	probeKvm,
	assertKvmAvailable,
	KvmUnavailable,
	parseSizeToBytes,
	vmResourceVerdict,
} from './vm-preflight.js'

vi.mock('node:fs/promises', () => ({
	access: vi.fn(),
	constants: {F_OK: 0, R_OK: 4, W_OK: 2},
}))

const mockAccess = vi.mocked(access)

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
	const host = {totalMemBytes: 16 * 1024 ** 3, cpuCount: 8}
	test('reasonable request → allow', () => {
		expect(vmResourceVerdict({RAM_SIZE: '4G', CPU_CORES: '2'}, host)).toBeNull()
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
})
