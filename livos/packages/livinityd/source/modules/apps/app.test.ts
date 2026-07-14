import {beforeEach, describe, expect, test, vi} from 'vitest'

// Isolate the host GPU probes app.ts consumes so patchComposeFile's branch logic
// is driven by mocks, never a real host (WSL2 detection, lspci, docker info, id).
vi.mock('../system/gpu.js', () => ({
	detectGpu: vi.fn(),
	isNvidiaToolkitConfigured: vi.fn(),
	detectNvidiaGpu: vi.fn(),
}))

import fse from 'fs-extra'

import App from './app.js'
import {detectGpu, isNvidiaToolkitConfigured, type GpuInfo} from '../system/gpu.js'

const childLogger = {log: vi.fn(), error: vi.fn()}
const fakeLivinityd = {
	dataDirectory: '/tmp/livinity-gpu-test',
	logger: {createChildLogger: () => childLogger},
	ai: {redis: {get: vi.fn().mockResolvedValue(null)}},
} as any

// Build an App whose file I/O is fully stubbed — manifest, compose read/write and
// the gpuAccess store read are all spied so patchComposeFile touches no disk.
// Returns the captured written compose so a test can assert the GPU stanza.
async function runPatch({
	appId = 'ollama',
	permissions = ['GPU-NVIDIA'] as string[] | undefined,
	gpuAccess = true as boolean | undefined,
	image = 'ollama/ollama:latest',
	gpuInfo,
	toolkitConfigured,
	deviceHasDri = false,
}: {
	appId?: string
	permissions?: string[] | undefined
	gpuAccess?: boolean | undefined
	image?: string
	gpuInfo: GpuInfo | null
	toolkitConfigured: boolean
	deviceHasDri?: boolean
}) {
	if (gpuInfo) vi.mocked(detectGpu).mockResolvedValue(gpuInfo)
	vi.mocked(isNvidiaToolkitConfigured).mockResolvedValue(toolkitConfigured)
	vi.spyOn(fse, 'exists').mockResolvedValue(deviceHasDri as any)

	const app = new App(fakeLivinityd, appId)
	vi.spyOn(app, 'readManifest').mockResolvedValue({permissions} as any)
	vi.spyOn(app.store, 'get').mockResolvedValue(gpuAccess as any)
	vi.spyOn(app, 'readCompose').mockResolvedValue({services: {[appId]: {image}}} as any)
	let written: any
	vi.spyOn(app, 'writeCompose').mockImplementation(async (c: any) => {
		written = c
	})

	await app.patchComposeFile()
	return written
}

beforeEach(() => {
	vi.mocked(detectGpu).mockReset()
	vi.mocked(isNvidiaToolkitConfigured).mockReset()
	childLogger.log.mockReset()
	childLogger.error.mockReset()
})

// ── CR-01 regression — patchComposeFile()'s NVIDIA branch must fire on WSL2 ────
// The flagship desktop path: WSL2 + NVIDIA (lspci reports "Microsoft Corporation
// Device", so 316's detectNvidiaGpu() is always false there). Before the fix,
// `hostHasNvidia` came from that lspci-only probe → the reservation was never
// written and Ollama silently ran CPU-only despite a configured toolkit. Now it
// comes from detectGpu().vendor, which reads nvidia-smi under WSL2.
describe('patchComposeFile — NVIDIA GPU reservation (CR-01)', () => {
	test('WSL2 + NVIDIA + toolkit configured → NVIDIA device reservation IS written', async () => {
		const written = await runPatch({
			gpuInfo: {vendor: 'nvidia', wsl2: true, toolkitConfigured: true, present: true, driverSource: 'wsl-windows'},
			toolkitConfigured: true,
		})
		expect(written.services.ollama.deploy.resources.reservations.devices).toEqual([
			{driver: 'nvidia', count: 'all', capabilities: ['gpu']},
		])
	})

	test('bare-metal NVIDIA + toolkit configured → NVIDIA reservation still written (no regression)', async () => {
		const written = await runPatch({
			gpuInfo: {vendor: 'nvidia', wsl2: false, toolkitConfigured: true, present: true, driverSource: 'linux-native'},
			toolkitConfigured: true,
		})
		expect(written.services.ollama.deploy.resources.reservations.devices).toEqual([
			{driver: 'nvidia', count: 'all', capabilities: ['gpu']},
		])
	})

	test('NVIDIA present but toolkit NOT configured → no reservation added', async () => {
		const written = await runPatch({
			gpuInfo: {vendor: 'nvidia', wsl2: true, toolkitConfigured: false, present: true, driverSource: 'wsl-windows'},
			toolkitConfigured: false,
		})
		expect(written.services.ollama.deploy).toBeUndefined()
	})
})

// ── WR-04 regression — the AMD ROCm image swap must be reversible ─────────────
describe('patchComposeFile — AMD ROCm image swap + revert (WR-04)', () => {
	test('bare-metal AMD + GPU on → ollama image swapped to :rocm and KFD/DRI devices added', async () => {
		const written = await runPatch({
			gpuInfo: {vendor: 'amd', wsl2: false, toolkitConfigured: true, present: true, driverSource: 'linux-native'},
			toolkitConfigured: false,
		})
		expect(written.services.ollama.image).toBe('ollama/ollama:rocm')
		expect(written.services.ollama.devices).toEqual(expect.arrayContaining(['/dev/kfd', '/dev/dri']))
	})

	test('GPU turned off later → a previously-swapped :rocm image reverts to the default tag', async () => {
		// Persisted compose already carries the ROCm image; the user has toggled GPU
		// OFF (override false, no manifest GPU permission) → wantsGpu is false, so the
		// AMD branch is skipped and the revert must restore ollama/ollama:latest.
		const written = await runPatch({
			gpuAccess: false,
			permissions: [],
			image: 'ollama/ollama:rocm',
			gpuInfo: null,
			toolkitConfigured: false,
		})
		expect(written.services.ollama.image).toBe('ollama/ollama:latest')
	})

	test('bare-metal NVIDIA (not AMD) with a stale :rocm image → image reverts to default', async () => {
		// Switching an app from AMD to an NVIDIA host must not leave the ROCm image;
		// the NVIDIA branch fires (reservation added) AND the stale swap is reverted.
		const written = await runPatch({
			image: 'ollama/ollama:rocm',
			gpuInfo: {vendor: 'nvidia', wsl2: false, toolkitConfigured: true, present: true, driverSource: 'linux-native'},
			toolkitConfigured: true,
		})
		expect(written.services.ollama.image).toBe('ollama/ollama:latest')
		expect(written.services.ollama.deploy.resources.reservations.devices).toEqual([
			{driver: 'nvidia', count: 'all', capabilities: ['gpu']},
		])
	})
})
