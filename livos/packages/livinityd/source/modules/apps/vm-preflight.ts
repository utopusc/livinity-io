/**
 * Phase 349 (VM-01) — hardware-virtualization preflight for VM apps.
 *
 * A VM app (dockur/windows, qemus/qemu) needs a working `/dev/kvm` for KVM
 * acceleration. Without it QEMU silently falls back to TCG software emulation —
 * an order of magnitude slower, so the VM "installs and runs" but is unusable
 * (the `feedback_app_running_vs_ready_state` silent-degraded pitfall class).
 * install() calls assertKvmAvailable() for any `requiresKvm` app and refuses
 * with a clear, actionable error rather than letting that trap happen.
 *
 * Split into a PURE decision core (kvmVerdict) + a thin live probe (probeKvm)
 * so the refuse/allow logic is unit-testable with no filesystem.
 */

import {access, constants} from 'node:fs/promises'
import os from 'node:os'

export class KvmUnavailable extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'KvmUnavailable'
	}
}

export class VmResourceInvalid extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'VmResourceInvalid'
	}
}

export type KvmProbe = {
	/** `/dev/kvm` exists on the host. */
	present: boolean
	/**
	 * `/dev/kvm` is readable+writable by THIS process (the daemon's uid).
	 * INFORMATIONAL ONLY — it does NOT gate install: the VM runs inside a docker
	 * container as root with `devices: [/dev/kvm]` mapping the device in, so
	 * whether the (non-root) livinityd daemon user can read /dev/kvm directly is
	 * irrelevant to whether the container can use KVM. Gating on it would be a
	 * false-negative (the box's /dev/kvm is typically root:kvm 0660 and the
	 * service user need not be in the `kvm` group). Presence is the real gate.
	 */
	accessible: boolean
}

/**
 * Pure verdict from a probe result. Returns null when install may proceed, or a
 * human-actionable reason string when it must be refused. Kept pure (no I/O) so
 * the refuse/allow policy is testable in isolation. Refuses ONLY on absence —
 * see KvmProbe.accessible for why daemon-user accessibility is not gated.
 */
export function kvmVerdict(probe: KvmProbe): string | null {
	if (!probe.present) {
		return (
			'This box has no /dev/kvm — hardware virtualization (VT-x/AMD-V) is not available. ' +
			'On bare metal, enable virtualization in the BIOS/UEFI. Under WSL2, enable nested ' +
			'virtualization (nestedVirtualization=true in .wslconfig, Windows 11) and restart WSL. ' +
			'Without KVM a VM would run under slow software emulation, so installation is refused.'
		)
	}
	return null
}

/** Live probe of /dev/kvm. Never throws — a probe failure reads as absent. */
export async function probeKvm(devPath = '/dev/kvm'): Promise<KvmProbe> {
	let present = false
	let accessible = false
	try {
		await access(devPath, constants.F_OK)
		present = true
		// Informational only (see KvmProbe.accessible) — never gates the verdict.
		await access(devPath, constants.R_OK | constants.W_OK)
		accessible = true
	} catch {
		// F_OK failed → absent; R_OK|W_OK failed → present but daemon-inaccessible.
	}
	return {present, accessible}
}

/**
 * Throws KvmUnavailable when this box cannot run a KVM-accelerated VM. Call
 * before installing any `requiresKvm` app. No-op when KVM is present+usable.
 */
export async function assertKvmAvailable(devPath = '/dev/kvm'): Promise<void> {
	const reason = kvmVerdict(await probeKvm(devPath))
	if (reason) throw new KvmUnavailable(reason)
}

// ── Phase 349 (VM-01 security review #6): sanity-bound the guest RAM/CPU ──────
// RAM_SIZE/CPU_CORES/DISK_SIZE are guest-facing QEMU env vars with no other
// server-side bound. VM install is admin-only (install-admin-gate), so this is a
// foot-gun guard (catch RAM_SIZE=999G / CPU_CORES=64 typos that would OOM/starve
// the box), not a privilege boundary. Pure + host-injected so it unit-tests with
// no real os calls.

/** Parse a size like "4G"/"512M"/"2048K"/"1073741824" to bytes; null if unparseable. */
export function parseSizeToBytes(v: string | undefined): number | null {
	if (!v) return null
	const m = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)B?\s*$/i.exec(v)
	if (!m) return null
	const n = parseFloat(m[1])
	const mult = {'': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4}[m[2].toUpperCase()] ?? 1
	return n * mult
}

export type HostCapacity = {totalMemBytes: number; cpuCount: number}

/**
 * Returns a refusal reason (or null to allow). Rejects a guest RAM request that
 * exceeds `ramFraction` of host RAM (default 0.9 — leave headroom for the host +
 * QEMU overhead) or a CPU_CORES request above the host core count.
 */
export function vmResourceVerdict(
	env: Record<string, string | undefined>,
	host: HostCapacity,
	ramFraction = 0.9,
): string | null {
	const ram = parseSizeToBytes(env.RAM_SIZE)
	if (ram !== null && ram > host.totalMemBytes * ramFraction) {
		const cap = ((host.totalMemBytes * ramFraction) / 1024 ** 3).toFixed(1)
		return `Requested VM RAM (${env.RAM_SIZE}) exceeds this box's capacity — keep it under ~${cap}G (host has ${(host.totalMemBytes / 1024 ** 3).toFixed(1)}G).`
	}
	const cores = env.CPU_CORES ? parseInt(env.CPU_CORES, 10) : null
	if (cores !== null && Number.isFinite(cores) && cores > host.cpuCount) {
		return `Requested VM CPU cores (${env.CPU_CORES}) exceeds this box's ${host.cpuCount} cores.`
	}
	return null
}

/** Throws VmResourceInvalid when the requested guest RAM/CPU is unreasonable for this host. */
export function assertVmResourcesSane(env: Record<string, string | undefined>): void {
	const reason = vmResourceVerdict(env, {totalMemBytes: os.totalmem(), cpuCount: os.cpus().length})
	if (reason) throw new VmResourceInvalid(reason)
}
