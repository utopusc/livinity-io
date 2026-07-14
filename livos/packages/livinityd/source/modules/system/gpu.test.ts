import {beforeEach, describe, expect, test, vi} from 'vitest'

import {execa} from 'execa'

import {detectNvidiaGpu, isNvidiaToolkitConfigured, resetGpuDetectionCache} from './gpu.js'

// Fully isolate the host probes: no real lspci / docker info subprocess.
vi.mock('execa', () => ({execa: vi.fn()}))

beforeEach(() => {
	vi.mocked(execa).mockReset()
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
