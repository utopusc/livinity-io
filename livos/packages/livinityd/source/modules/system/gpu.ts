import {execa} from 'execa'

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
 * Test-only: clear both memoized probes so a fresh mock can be re-exercised.
 * Has no effect in production beyond forcing the next call to re-probe.
 */
export function resetGpuDetectionCache(): void {
	nvidiaGpuCache = undefined
	nvidiaToolkitCache = undefined
}
