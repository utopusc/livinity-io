import os from 'node:os'

import {execa} from 'execa'
import fse from 'fs-extra'

/**
 * Phase 316 (GPU-02) — unprivileged NVIDIA host probes.
 *
 * Two read-only detections consumed by `apps/app.ts` `patchComposeFile()` to
 * decide whether a GPU-enabled app should receive an NVIDIA device reservation:
 *   - `detectNvidiaGpu()`        — is an NVIDIA display GPU present on the host?
 *   - `isNvidiaToolkitConfigured()` — has the Docker daemon an `nvidia` runtime?
 *
 * DESIGN CONTRACT — both functions MUST NEVER throw. A detection failure (tool
 * missing, non-Linux dev host, permission error, Docker down) degrades to
 * "no GPU" / "not configured" so a lifecycle transition that consumes them
 * (install/update/start → patchComposeFile) can never be crashed by a probe.
 * (Threat T-316-05: shell-out crash of a lifecycle transition — mitigated.)
 *
 * Host hardware + the Docker runtime set do not change while the process runs,
 * so each probe is memoized behind a module-level promise for the process
 * lifetime and re-run only on restart (or an explicit test reset). Repeated
 * `patchComposeFile()` calls therefore do not re-shell lspci/docker-info.
 *
 * Self-contained: imports ONLY `execa` — deliberately no dependency on the app
 * manager, the provider gateway modules, the agent runtime, or liv-core.
 */

const PROBE_TIMEOUT_MS = 5_000

let nvidiaGpuCache: Promise<boolean> | undefined
let nvidiaToolkitCache: Promise<boolean> | undefined

// ── Phase 330 (GPU-03) — WSL2 + vendor detection caches ──────────────────────
let wsl2Cache: Promise<boolean> | undefined
let nvidiaSmiCache: Promise<boolean> | undefined
let amdGpuCache: Promise<boolean> | undefined
let amdReadyCache: Promise<boolean> | undefined
let intelGpuCache: Promise<boolean> | undefined
let gpuInfoCache: Promise<GpuInfo> | undefined

/**
 * Phase 330 (GPU-03) — the richer, WSL2-aware, vendor-aware detection payload.
 *
 *   - `present`           — is any usable GPU visible to the host / distro?
 *   - `vendor`            — 'nvidia' | 'amd' | 'intel' | 'unknown' | 'none'
 *   - `wsl2`              — running under WSL2 (drives the toolkit-only install
 *                           path — the Windows driver is already in place, so the
 *                           guided flow never installs the Linux driver)
 *   - `toolkitConfigured` — is the container-GPU runtime already wired?
 *   - `driverSource`      — 'wsl-windows' (GPU-paravirtualized through Windows)
 *                           | 'linux-native' (bare-metal) | 'none'
 */
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown' | 'none'
export type GpuDriverSource = 'wsl-windows' | 'linux-native' | 'none'
export interface GpuInfo {
	present: boolean
	vendor: GpuVendor
	wsl2: boolean
	toolkitConfigured: boolean
	driverSource: GpuDriverSource
}

/**
 * Resolves `true` iff `lspci` reports an NVIDIA VGA / 3D / Display controller.
 * Never throws — any error resolves to `false` (no NVIDIA GPU).
 */
export async function detectNvidiaGpu(): Promise<boolean> {
	if (nvidiaGpuCache === undefined) {
		nvidiaGpuCache = probeNvidiaGpu()
	}
	return nvidiaGpuCache
}

async function probeNvidiaGpu(): Promise<boolean> {
	try {
		const {stdout} = await execa('lspci', {timeout: PROBE_TIMEOUT_MS})
		// Match ONLY a display-class controller line that also names NVIDIA — a
		// bare "NVIDIA" match would wrongly count the GPU's HDMI-audio function
		// (an `Audio device:` line) as a usable GPU.
		return stdout
			.split('\n')
			.some(
				(line) =>
					/\b(VGA compatible controller|3D controller|Display controller)\b/i.test(line) && /nvidia/i.test(line),
			)
	} catch {
		return false
	}
}

/**
 * Resolves `true` iff the Docker daemon exposes an `nvidia` runtime (i.e. the
 * nvidia-container-toolkit is installed and `nvidia-ctk runtime configure` has
 * run). Never throws — any error resolves to `false` (not configured).
 */
export async function isNvidiaToolkitConfigured(): Promise<boolean> {
	if (nvidiaToolkitCache === undefined) {
		nvidiaToolkitCache = probeNvidiaToolkit()
	}
	return nvidiaToolkitCache
}

async function probeNvidiaToolkit(): Promise<boolean> {
	try {
		const {stdout} = await execa('docker', ['info', '--format', '{{json .Runtimes}}'], {timeout: PROBE_TIMEOUT_MS})
		// `docker info` emits a JSON map of runtime-name → config, e.g.
		//   {"nvidia":{"path":"nvidia-container-runtime"},"runc":{"path":"runc"}}
		try {
			const runtimes = JSON.parse(stdout) as Record<string, unknown>
			return Object.keys(runtimes).some((name) => name.toLowerCase() === 'nvidia')
		} catch {
			// Non-JSON output (older docker or --format unsupported) — fall back to
			// a substring probe so we still degrade safely rather than throwing.
			return /nvidia/i.test(stdout)
		}
	} catch {
		return false
	}
}

/**
 * Phase 330 (GPU-03) — WSL2-aware, vendor-aware composite detection.
 *
 * 316's `detectNvidiaGpu()` is lspci-only, so on WSL2 it returns `false` even
 * when the GPU works: WSL2 passes the GPU through via `/dev/dxg` + the Windows
 * driver stubs in `/usr/lib/wsl/lib`, and `lspci` reports the device as
 * "Microsoft Corporation Device", not NVIDIA. `detectGpu()` layers a broader
 * probe matrix over the untouched 316 probes and returns the richer `GpuInfo`
 * shape the Software Update card (GPU-04) and the install popup (GPU-05) read.
 *
 * Same DESIGN CONTRACT as the 316 probes — every new probe NEVER throws: a
 * missing tool / non-Linux dev host / permission error degrades to the safe
 * default (`false` / `vendor:'none'`). All probes are memoized for the process
 * lifetime and cleared together by `resetGpuDetectionCache()`.
 */

/**
 * Resolves `true` under WSL2 — the GPU-paravirtualization device `/dev/dxg`
 * exists OR `/proc/sys/kernel/osrelease` names `microsoft`. Never throws
 * (→ `false`). Exported for reuse by the tRPC install guard (`system/routes.ts` —
 * the install-driver / install-amd-rocm WSL2 refusal) so WSL2-ness is decided in
 * exactly one place.
 *
 * IN-01 — SMART-05's virtual-disk notification suppression does NOT consume this:
 * `scheduler/jobs.ts` keys off smart.ts's `detectionMethod === 'unsupported'`
 * classification (which also covers USB-SAT enclosures), independent of isWsl2().
 */
export async function isWsl2(): Promise<boolean> {
	if (wsl2Cache === undefined) {
		wsl2Cache = probeWsl2()
	}
	return wsl2Cache
}

async function probeWsl2(): Promise<boolean> {
	try {
		if (await fse.pathExists('/dev/dxg')) return true
		const osrelease = await fse.readFile('/proc/sys/kernel/osrelease', 'utf8').catch(() => '')
		return /microsoft/i.test(osrelease)
	} catch {
		return false
	}
}

/**
 * Resolves `true` iff `nvidia-smi -L` succeeds (the WSL2 NVIDIA binary lives at
 * `/usr/lib/wsl/lib/nvidia-smi`). On ANY error, fall back to the WSL2 CUDA stub
 * `/usr/lib/wsl/lib/libcuda.so`. Never throws (→ `false`).
 */
async function probeNvidiaSmi(): Promise<boolean> {
	if (nvidiaSmiCache === undefined) {
		nvidiaSmiCache = (async (): Promise<boolean> => {
			try {
				await execa('nvidia-smi', ['-L'], {timeout: PROBE_TIMEOUT_MS})
				return true
			} catch {
				// nvidia-smi missing / non-zero — the CUDA stub still proves the WSL2
				// NVIDIA passthrough is present.
				try {
					return await fse.pathExists('/usr/lib/wsl/lib/libcuda.so')
				} catch {
					return false
				}
			}
		})()
	}
	return nvidiaSmiCache
}

/**
 * Resolves `true` iff `lspci` reports an AMD/ATI display controller OR the ROCm
 * compute node `/dev/kfd` exists. Never throws (→ `false`).
 */
async function probeAmdGpu(): Promise<boolean> {
	if (amdGpuCache === undefined) {
		amdGpuCache = (async (): Promise<boolean> => {
			try {
				const {stdout} = await execa('lspci', {timeout: PROBE_TIMEOUT_MS})
				const hasAmdDisplay = stdout
					.split('\n')
					.some(
						(line) =>
							/\b(VGA compatible controller|3D controller|Display controller)\b/i.test(line) &&
							/\b(Advanced Micro Devices|AMD|ATI)\b/i.test(line),
					)
				if (hasAmdDisplay) return true
			} catch {
				// lspci missing / errored — fall through to the /dev/kfd signal.
			}
			try {
				return await fse.pathExists('/dev/kfd')
			} catch {
				return false
			}
		})()
	}
	return amdGpuCache
}

/**
 * Resolves `true` iff `lspci` reports an Intel display controller. Detect-only
 * (no guided install this phase). Never throws (→ `false`).
 */
async function probeIntelGpu(): Promise<boolean> {
	if (intelGpuCache === undefined) {
		intelGpuCache = (async (): Promise<boolean> => {
			try {
				const {stdout} = await execa('lspci', {timeout: PROBE_TIMEOUT_MS})
				return stdout
					.split('\n')
					.some(
						(line) =>
							/\b(VGA compatible controller|3D controller|Display controller)\b/i.test(line) &&
							/\bIntel\b/i.test(line),
					)
			} catch {
				return false
			}
		})()
	}
	return intelGpuCache
}

/**
 * Resolves `true` iff the AMD ROCm compute node `/dev/kfd` exists AND the desktop
 * user is in BOTH the `render` and `video` groups (the group membership a ROCm
 * container needs). This is AMD's analog of `isNvidiaToolkitConfigured()`.
 * Never throws (→ `false`).
 *
 * WR-03: query a NAMED user's groups via `id -nG <user>`, NOT the no-arg `id -nG`.
 * The no-arg form reports the RUNNING process's own supplementary GIDs, which
 * POSIX freezes at process start — a `usermod -aG render,video` (what
 * install-amd-rocm runs) does NOT re-apply to an already-running livinityd (or its
 * `id` child) until the next login/restart, so no-arg `id -nG` reported the AMD
 * toolkit as never-ready right after a successful install. `id -nG <user>` instead
 * does a fresh getpwnam+getgrouplist lookup from /etc/group, so it reflects the
 * just-completed usermod immediately (after resetGpuDetectionCache() re-probes).
 * `os.userInfo().username` is the desktop user livinityd runs as — the same user
 * the wrapper resolves via logname/SUDO_USER and adds to the groups.
 */
async function isAmdReady(): Promise<boolean> {
	if (amdReadyCache === undefined) {
		amdReadyCache = (async (): Promise<boolean> => {
			try {
				if (!(await fse.pathExists('/dev/kfd'))) return false
				const user = os.userInfo().username
				const {stdout} = await execa('id', ['-nG', user], {timeout: PROBE_TIMEOUT_MS})
				const groups = stdout.split(/\s+/)
				return groups.includes('render') && groups.includes('video')
			} catch {
				return false
			}
		})()
	}
	return amdReadyCache
}

const NO_GPU: GpuInfo = {
	present: false,
	vendor: 'none',
	wsl2: false,
	toolkitConfigured: false,
	driverSource: 'none',
}

/**
 * Composite host GPU probe — WSL2-aware and vendor-aware. Returns the richer
 * `GpuInfo` shape. Never throws (degrades to the no-GPU default). Memoized for
 * the process lifetime; cleared by `resetGpuDetectionCache()`.
 */
export async function detectGpu(): Promise<GpuInfo> {
	if (gpuInfoCache === undefined) {
		gpuInfoCache = probeGpuInfo()
	}
	return gpuInfoCache
}

async function probeGpuInfo(): Promise<GpuInfo> {
	try {
		const wsl2 = await isWsl2()

		if (wsl2) {
			// WSL2 passes the GPU through via /dev/dxg; lspci reports "Microsoft
			// Corporation Device", so vendor comes from nvidia-smi, never lspci.
			if (await probeNvidiaSmi()) {
				return {
					present: true,
					vendor: 'nvidia',
					wsl2: true,
					toolkitConfigured: await isNvidiaToolkitConfigured(),
					driverSource: 'wsl-windows',
				}
			}
			// A1 — a GPU is paravirtualized but the vendor is undeterminable from
			// inside the distro (could be AMD/Intel); AMD-on-WSL2 is gated out anyway.
			return {
				present: true,
				vendor: 'unknown',
				wsl2: true,
				toolkitConfigured: false,
				driverSource: 'wsl-windows',
			}
		}

		// Bare-metal Linux — vendor from lspci (316's probe) + the AMD/Intel parses.
		if (await detectNvidiaGpu()) {
			return {
				present: true,
				vendor: 'nvidia',
				wsl2: false,
				toolkitConfigured: await isNvidiaToolkitConfigured(),
				driverSource: 'linux-native',
			}
		}
		if (await probeAmdGpu()) {
			return {
				present: true,
				vendor: 'amd',
				wsl2: false,
				toolkitConfigured: await isAmdReady(),
				driverSource: 'linux-native',
			}
		}
		if (await probeIntelGpu()) {
			return {
				present: true,
				vendor: 'intel',
				wsl2: false,
				toolkitConfigured: false,
				driverSource: 'linux-native',
			}
		}
		return NO_GPU
	} catch {
		return NO_GPU
	}
}

/**
 * Test-only: clear every memoized probe so a fresh mock can be re-exercised.
 * Also the WR-01 post-install invalidation hook (routes.ts `runGpuInstall`
 * calls it on success). Has no effect in production beyond forcing the next
 * call to re-probe.
 */
export function resetGpuDetectionCache(): void {
	nvidiaGpuCache = undefined
	nvidiaToolkitCache = undefined
	wsl2Cache = undefined
	nvidiaSmiCache = undefined
	amdGpuCache = undefined
	amdReadyCache = undefined
	intelGpuCache = undefined
	gpuInfoCache = undefined
}
