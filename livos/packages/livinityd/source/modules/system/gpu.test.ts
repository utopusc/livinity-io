import {beforeEach, describe, expect, test, vi} from 'vitest'

import {execa} from 'execa'
import fse from 'fs-extra'

import {detectGpu, detectNvidiaGpu, isNvidiaToolkitConfigured, isWsl2, resetGpuDetectionCache} from './gpu.js'

// Fully isolate the host probes: no real lspci / docker info / nvidia-smi / id
// subprocess, and no real /dev/dxg, /dev/kfd, /usr/lib/wsl/lib or osrelease reads.
vi.mock('execa', () => ({execa: vi.fn()}))
vi.mock('fs-extra', () => ({default: {pathExists: vi.fn(), readFile: vi.fn()}}))

beforeEach(() => {
	vi.mocked(execa).mockReset()
	vi.mocked(fse.pathExists).mockReset()
	vi.mocked(fse.readFile).mockReset()
	// Host hardware is cached for the process lifetime — clear it so each case
	// re-exercises the probe against its own mocked output.
	resetGpuDetectionCache()
})

describe('detectNvidiaGpu', () => {
	test('true when lspci reports an NVIDIA VGA controller', async () => {
		vi.mocked(execa).mockResolvedValue({
			stdout: '01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070]',
		} as any)
		expect(await detectNvidiaGpu()).toBe(true)
	})

	test('true for a headless 3D controller line (datacenter card)', async () => {
		vi.mocked(execa).mockResolvedValue({
			stdout: '00:1e.0 3D controller: NVIDIA Corporation GA100 [A100 SXM4 80GB]',
		} as any)
		expect(await detectNvidiaGpu()).toBe(true)
	})

	test('false when only Intel/AMD graphics are present', async () => {
		vi.mocked(execa).mockResolvedValue({
			stdout: '00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 630',
		} as any)
		expect(await detectNvidiaGpu()).toBe(false)
	})

	test('false when an NVIDIA audio function exists but NO display controller', async () => {
		// The GPU HDMI-audio function carries "NVIDIA" but is not a display
		// controller — it must not be counted as a usable GPU.
		vi.mocked(execa).mockResolvedValue({
			stdout: '01:00.1 Audio device: NVIDIA Corporation GA104 High Definition Audio Controller',
		} as any)
		expect(await detectNvidiaGpu()).toBe(false)
	})

	test('false (never throws) when lspci is missing / errors', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('spawn lspci ENOENT'))
		await expect(detectNvidiaGpu()).resolves.toBe(false)
	})

	test('memoized — lspci is shelled out only once across repeated calls', async () => {
		vi.mocked(execa).mockResolvedValue({
			stdout: '01:00.0 VGA compatible controller: NVIDIA Corporation GA104',
		} as any)
		await detectNvidiaGpu()
		await detectNvidiaGpu()
		await detectNvidiaGpu()
		expect(vi.mocked(execa)).toHaveBeenCalledTimes(1)
	})
})

describe('isNvidiaToolkitConfigured', () => {
	test('true when docker info Runtimes contains nvidia', async () => {
		vi.mocked(execa).mockResolvedValue({
			stdout: '{"nvidia":{"path":"nvidia-container-runtime"},"runc":{"path":"runc"}}',
		} as any)
		expect(await isNvidiaToolkitConfigured()).toBe(true)
	})

	test('false when only the default runc runtime is present', async () => {
		vi.mocked(execa).mockResolvedValue({stdout: '{"runc":{"path":"runc"}}'} as any)
		expect(await isNvidiaToolkitConfigured()).toBe(false)
	})

	test('false (never throws) when docker info errors', async () => {
		vi.mocked(execa).mockRejectedValue(new Error('Cannot connect to the Docker daemon'))
		await expect(isNvidiaToolkitConfigured()).resolves.toBe(false)
	})

	test('false (never throws) on unparseable non-JSON output without nvidia', async () => {
		vi.mocked(execa).mockResolvedValue({stdout: 'not json at all'} as any)
		await expect(isNvidiaToolkitConfigured()).resolves.toBe(false)
	})

	test('memoized — docker info is shelled out only once', async () => {
		vi.mocked(execa).mockResolvedValue({stdout: '{"nvidia":{}}'} as any)
		await isNvidiaToolkitConfigured()
		await isNvidiaToolkitConfigured()
		expect(vi.mocked(execa)).toHaveBeenCalledTimes(1)
	})
})

// WR-01 regression — a successful guided install (routes.ts runGpuInstall) must
// invalidate the process-lifetime probe cache so the very next detectGpu() /
// patchComposeFile() re-probe reflects the newly-configured toolkit WITHOUT a
// manual livinityd restart. This asserts the mechanism runGpuInstall relies on:
// after resetGpuDetectionCache(), a probe that previously memoized `false`
// re-shells and now returns the post-install `true`.
describe('resetGpuDetectionCache — post-install re-probe (WR-01)', () => {
	test('toolkit flips false→true after a reset (guided install then refetch)', async () => {
		// Pre-install: no nvidia runtime configured → memoized false.
		vi.mocked(execa).mockResolvedValue({stdout: '{"runc":{"path":"runc"}}'} as any)
		expect(await isNvidiaToolkitConfigured()).toBe(false)
		expect(await isNvidiaToolkitConfigured()).toBe(false) // served from cache
		expect(vi.mocked(execa)).toHaveBeenCalledTimes(1)

		// Guided install-toolkit succeeds → runGpuInstall clears the cache.
		resetGpuDetectionCache()

		// Post-install: docker now exposes the nvidia runtime → the next call
		// re-shells and reflects the new state (no livinityd restart needed).
		vi.mocked(execa).mockResolvedValue({
			stdout: '{"nvidia":{"path":"nvidia-container-runtime"},"runc":{"path":"runc"}}',
		} as any)
		expect(await isNvidiaToolkitConfigured()).toBe(true)
		expect(vi.mocked(execa)).toHaveBeenCalledTimes(2)
	})

	test('gpu detection re-probes after a reset (driver install reveals a card)', async () => {
		// Pre-driver: lspci shows no nvidia display controller → memoized false.
		vi.mocked(execa).mockResolvedValue({
			stdout: '00:02.0 VGA compatible controller: Intel Corporation UHD Graphics 630',
		} as any)
		expect(await detectNvidiaGpu()).toBe(false)

		resetGpuDetectionCache()

		vi.mocked(execa).mockResolvedValue({
			stdout: '01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070]',
		} as any)
		expect(await detectNvidiaGpu()).toBe(true)
	})
})

// ── Phase 330 (GPU-03) — WSL2-aware, vendor-aware composite detection ─────────
// Same shape as the 316 suite above: mocked probes, a "never throws" case and a
// memoize / reset-then-reprobe case, but now driving the fs-extra path/file reads
// (/dev/dxg, osrelease, /dev/kfd, libcuda stub) alongside the execa shell-outs.

describe('isWsl2', () => {
	test('true when /proc/sys/kernel/osrelease names microsoft', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('5.15.153.1-microsoft-standard-WSL2' as any)
		expect(await isWsl2()).toBe(true)
	})

	test('true when the /dev/dxg paravirtualization device exists', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(true as any)
		expect(await isWsl2()).toBe(true)
	})

	test('false when neither the dxg device nor a microsoft osrelease is present', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('6.8.0-45-generic' as any)
		expect(await isWsl2()).toBe(false)
	})

	test('false (never throws) when both probes reject', async () => {
		vi.mocked(fse.pathExists).mockRejectedValue(new Error('EACCES'))
		vi.mocked(fse.readFile).mockRejectedValue(new Error('EACCES'))
		await expect(isWsl2()).resolves.toBe(false)
	})

	test('memoized — the /dev/dxg check runs only once across repeated calls', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(true as any)
		await isWsl2()
		await isWsl2()
		await isWsl2()
		expect(vi.mocked(fse.pathExists)).toHaveBeenCalledTimes(1)
	})
})

describe('detectGpu', () => {
	test('WSL2 + nvidia-smi -L → nvidia via the Windows driver passthrough', async () => {
		// isWsl2 true via /dev/dxg; vendor comes from nvidia-smi, never lspci.
		vi.mocked(fse.pathExists).mockImplementation((async (p: string) => p === '/dev/dxg') as any)
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'nvidia-smi') return {stdout: 'GPU 0: NVIDIA GeForce RTX 5070 Ti (UUID: GPU-abc123)'}
			if (cmd === 'docker') return {stdout: '{"runc":{"path":"runc"}}'}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		const info = await detectGpu()
		expect(info).toMatchObject({present: true, vendor: 'nvidia', wsl2: true, driverSource: 'wsl-windows'})
	})

	test('WSL2 + /dev/dxg but no nvidia-smi → present, vendor unknown (A1)', async () => {
		// dxg present (WSL2) but neither nvidia-smi nor the libcuda stub → unknown.
		vi.mocked(fse.pathExists).mockImplementation((async (p: string) => p === '/dev/dxg') as any)
		vi.mocked(execa).mockRejectedValue(new Error('spawn nvidia-smi ENOENT'))
		const info = await detectGpu()
		expect(info).toMatchObject({present: true, vendor: 'unknown', wsl2: true, driverSource: 'wsl-windows'})
	})

	test('bare-metal NVIDIA (lspci) → linux-native driver source', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('6.8.0-45-generic' as any)
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'lspci')
				return {stdout: '01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070]'}
			if (cmd === 'docker') return {stdout: '{"nvidia":{"path":"nvidia-container-runtime"},"runc":{"path":"runc"}}'}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		const info = await detectGpu()
		expect(info).toMatchObject({present: true, vendor: 'nvidia', wsl2: false, driverSource: 'linux-native'})
	})

	test('bare-metal AMD (lspci AMD/ATI line) → vendor amd', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('6.8.0-45-generic' as any)
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'lspci')
				return {
					stdout: '03:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Navi 31 [Radeon RX 7900 XTX]',
				}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		const info = await detectGpu()
		expect(info).toMatchObject({present: true, vendor: 'amd', wsl2: false, driverSource: 'linux-native'})
	})

	test('no GPU (not WSL2, no display controller) → vendor none, present false', async () => {
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('6.8.0-45-generic' as any)
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'lspci') return {stdout: '00:1f.0 ISA bridge: Some Vendor LPC Controller'}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		const info = await detectGpu()
		expect(info).toMatchObject({present: false, vendor: 'none'})
	})

	test('never throws — returns vendor none when every probe rejects', async () => {
		vi.mocked(fse.pathExists).mockRejectedValue(new Error('EACCES'))
		vi.mocked(fse.readFile).mockRejectedValue(new Error('EACCES'))
		vi.mocked(execa).mockRejectedValue(new Error('spawn ENOENT'))
		await expect(detectGpu()).resolves.toMatchObject({present: false, vendor: 'none'})
	})

	test('re-probes after resetGpuDetectionCache() (driver install reveals the card)', async () => {
		// Pre-install: bare-metal, no display controller → vendor none, memoized.
		vi.mocked(fse.pathExists).mockResolvedValue(false as any)
		vi.mocked(fse.readFile).mockResolvedValue('6.8.0-45-generic' as any)
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'lspci') return {stdout: '00:1f.0 ISA bridge: Some Vendor LPC Controller'}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		expect((await detectGpu()).vendor).toBe('none')

		// Guided install succeeds → runGpuInstall clears the cache.
		resetGpuDetectionCache()

		// Post-install: lspci now shows the NVIDIA card → the next call re-probes.
		vi.mocked(execa).mockImplementation((async (cmd: string) => {
			if (cmd === 'lspci')
				return {stdout: '01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070]'}
			if (cmd === 'docker') return {stdout: '{"nvidia":{"path":"nvidia-container-runtime"},"runc":{"path":"runc"}}'}
			throw new Error(`unexpected execa ${cmd}`)
		}) as any)
		expect((await detectGpu()).vendor).toBe('nvidia')
	})
})
