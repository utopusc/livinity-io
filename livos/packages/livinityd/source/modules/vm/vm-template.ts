/**
 * Phase 349 (VMSEC-01/02/03) — internal VM template module.
 * Re-homed VERBATIM from the REMOVED `windows`/`vm` builtin-apps.ts STORE
 * entries (commit 4f544fc0; removed in 349-02). VMs are NOT store apps — this
 * is backend-owned template DATA the forthcoming modules/vm/ lifecycle
 * (Phase 350) consumes programmatically, never via the app-install path.
 *
 * VMSEC-02: elevated set is EXACTLY devices:[/dev/kvm,/dev/net/tun] +
 *   cap_add:[NET_ADMIN] + stop_grace_period — nothing else. No privileged,
 *   no docker.sock, no host bind outside the VM data dir.
 * VMSEC-03: neverPublic:true is an immutable structural fact (literal-true
 *   type, data-compatible with public-forbidden.ts isPublicForbidden).
 * PURE DATA: zero I/O, no compose-generator/fse/path imports, not wired into
 *   any install/compose-write path (that is Phase 350).
 */

/**
 * The sanctioned VM container compose spec. Literal-typed elevation set so an
 * ADDED device/cap (or a widened `stop_grace_period`) fails to compile — the
 * type itself is the VMSEC-02 backstop. No `privileged`, no docker.sock, no
 * host bind outside `${APP_DATA_DIR}/storage`.
 */
export interface VmTemplateCompose {
	readonly image: string
	readonly restart: 'on-failure'
	readonly devices: readonly ['/dev/kvm', '/dev/net/tun']
	readonly cap_add: readonly ['NET_ADMIN']
	readonly stop_grace_period: '2m'
	readonly environment: Readonly<Record<string, string>>
	readonly volumes: readonly [`${string}/storage:/storage`]
	readonly ports: readonly string[] // every entry MUST start '127.0.0.1:'
}

export interface VmTemplate {
	readonly id: string
	readonly name: string
	readonly tagline: string
	readonly version: string
	readonly port: 8006
	readonly requiresKvm: true // literal true — VMSEC-02 admin-gate flag
	readonly neverPublic: true // literal true — VMSEC-03 structural fact, cannot be false/omitted
	readonly description: string
	readonly website: string
	readonly developer: string
	readonly icon: string
	readonly image: string
	readonly defaultUsername?: string
	readonly environmentDefaults: Readonly<Record<string, string>>
	readonly compose: VmTemplateCompose
}

/**
 * dockur/windows (MIT) — KVM-accelerated Windows guest, noVNC on 8006, RDP on
 * 3389 (loopback-only). BRING-YOUR-OWN Windows license. Values copied verbatim
 * from the removed builtin-apps.ts `windows` entry.
 */
export const WINDOWS_VM_TEMPLATE: VmTemplate = {
	id: 'windows',
	name: 'Windows',
	tagline: 'Run Windows in a VM — bring your own license',
	version: '4.00',
	port: 8006,
	requiresKvm: true,
	neverPublic: true,
	defaultUsername: 'Docker',
	description:
		'Run a full Windows desktop in a hardware-accelerated virtual machine, streamed to your browser. Windows installs automatically; you interact with it in a web viewer (or connect over RDP on port 3389 for a full-fidelity session). Requires a CPU with hardware virtualization (KVM). You must supply your own valid Windows license — LivOS does not provide Windows or an activation key.',
	website: 'https://github.com/dockur/windows',
	developer: 'dockur (MIT)',
	icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/windows-11.svg',
	image: 'dockurr/windows:latest',
	environmentDefaults: {
		VERSION: '11',
		RAM_SIZE: '4G',
		CPU_CORES: '2',
		DISK_SIZE: '64G',
	},
	compose: {
		image: 'dockurr/windows:latest',
		restart: 'on-failure',
		devices: ['/dev/kvm', '/dev/net/tun'],
		cap_add: ['NET_ADMIN'],
		stop_grace_period: '2m',
		environment: {
			VERSION: '11',
			RAM_SIZE: '4G',
			CPU_CORES: '2',
			DISK_SIZE: '64G',
		},
		volumes: ['${APP_DATA_DIR}/storage:/storage'],
		ports: ['127.0.0.1:8006:8006', '127.0.0.1:3389:3389/tcp', '127.0.0.1:3389:3389/udp'],
	},
}

/**
 * qemux/qemu (MIT) — the generalized any-OS sibling: boots any Linux/BSD guest
 * (or a custom ISO/qcow2/img) via the BOOT env var, KVM-accelerated, noVNC on
 * 8006. Values copied verbatim from the removed builtin-apps.ts `vm` entry.
 */
export const LINUX_VM_TEMPLATE: VmTemplate = {
	id: 'linux',
	name: 'Virtual Machine',
	tagline: 'Run any OS in a VM — Linux, BSD, or a custom image',
	version: '8.00',
	port: 8006,
	requiresKvm: true,
	neverPublic: true,
	description:
		'Run any operating system in a hardware-accelerated virtual machine, streamed to your browser. Pick a Linux/BSD distribution by name or point it at a custom ISO/qcow2/img (local file or URL). Requires a CPU with hardware virtualization (KVM).',
	website: 'https://github.com/qemus/qemu',
	developer: 'qemus (MIT)',
	icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/qemu.svg',
	image: 'qemux/qemu:latest',
	environmentDefaults: {
		BOOT: 'ubuntu',
		RAM_SIZE: '2G',
		CPU_CORES: '2',
		DISK_SIZE: '16G',
	},
	compose: {
		image: 'qemux/qemu:latest',
		restart: 'on-failure',
		devices: ['/dev/kvm', '/dev/net/tun'],
		cap_add: ['NET_ADMIN'],
		stop_grace_period: '2m',
		environment: {
			BOOT: 'ubuntu',
			RAM_SIZE: '2G',
			CPU_CORES: '2',
			DISK_SIZE: '16G',
		},
		volumes: ['${APP_DATA_DIR}/storage:/storage'],
		ports: ['127.0.0.1:8006:8006'],
	},
}

export type VmTemplateKind = 'windows' | 'linux'

/**
 * Pure lookup — no I/O. Returns the immutable template for the given guest kind.
 */
export function getVmTemplate(kind: VmTemplateKind): VmTemplate {
	return kind === 'windows' ? WINDOWS_VM_TEMPLATE : LINUX_VM_TEMPLATE
}
