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

/**
 * Phase 351 (VMCREATE-01): the bring-your-own-license notice, SINGLE-SOURCED.
 * This is the exact verbatim sentence already embedded in
 * `WINDOWS_VM_TEMPLATE.description` (line 67) — exported as its own const so the
 * OS catalog + the future `vm.createOptions` surface (plan 03) can carry it to
 * the UI WITHOUT restating the copy (a `vm-os-catalog.test.ts` drift-guard
 * asserts it stays a substring of the description). Additive const only — the
 * `description` string, `devices`/`cap_add`, and `getVmTemplate` are untouched.
 */
export const WINDOWS_BYO_LICENSE_NOTICE =
	'You must supply your own valid Windows license — LivOS does not provide Windows or an activation key.'

export type VmTemplateKind = 'windows' | 'linux'

/**
 * Pure lookup — no I/O. Returns the immutable template for the given guest kind.
 *
 * WR-01 (349 review): exhaustive `switch` + `never` guard. This is a
 * security-ground-truth lookup that decides which elevated compose gets
 * materialized, so the day a third `VmTemplateKind` is added the compiler MUST
 * fail here rather than silently aliasing the unknown kind to the Linux
 * template (wrong image/ports/env). Fail-to-compile beats silent mis-map.
 */
export function getVmTemplate(kind: VmTemplateKind): VmTemplate {
	switch (kind) {
		case 'windows':
			return WINDOWS_VM_TEMPLATE
		case 'linux':
			return LINUX_VM_TEMPLATE
		default: {
			const _exhaustive: never = kind
			throw new Error(`unknown VM kind: ${String(_exhaustive)}`)
		}
	}
}

/**
 * CR-01 (349 review): the canonical set of VM app-ids that MUST be treated as
 * KVM/privileged regardless of which resolution tier (builtin, platform
 * catalog, future vm-module) produced the compose. Belt-and-suspenders for the
 * install admin-gate + KVM preflight now that the `windows`/`vm` builtins are
 * gone (their `getBuiltinApp(id)?.requiresKvm` flag is permanently `undefined`).
 *   - `windows` + `vm` — legacy builtin ids / any existing install or catalog row.
 *   - `linux` — the re-homed qemus template id (349 IN-03: thread all three).
 */
export const VM_APP_IDS: ReadonlySet<string> = new Set(['windows', 'vm', 'linux'])

/**
 * CR-01 fail-closed detector: does this RESOLVED compose grant KVM device
 * access? Pure string scan (no I/O). Any reference to the kernel-facing
 * `/dev/kvm` device means the container is a hardware VM and must clear the
 * admin gate + KVM preflight — no matter what provenance flag the template
 * carries (a "trusted" catalog row must not mint a privileged VM on flag alone).
 */
export function composeRequiresKvm(composeText: string): boolean {
	return composeText.includes('/dev/kvm')
}

/**
 * CR-01 defense-in-depth: strip the `/dev/kvm` device from every service of a
 * parsed compose object (mutates + returns it). Used by the platform-catalog
 * fetch to de-fang a NON-VM catalog row that carries the kernel-facing KVM
 * device — no non-VM app has any legitimate use for `/dev/kvm`. Deliberately
 * leaves `/dev/dri` (GPU transcode) and `/dev/net/tun` + `NET_ADMIN` (VPN) devices
 * intact — those are legitimately used by non-VM catalog apps and are not the
 * VM privilege-escalation vector. Returns whether anything was stripped.
 */
export function stripKvmDeviceFromCompose(compose: unknown): {compose: unknown; stripped: boolean} {
	let stripped = false
	const services = (compose as {services?: Record<string, {devices?: unknown[]}>} | null)?.services
	if (services && typeof services === 'object') {
		for (const svc of Object.values(services)) {
			if (svc && Array.isArray(svc.devices)) {
				const before = svc.devices.length
				svc.devices = svc.devices.filter((d) => !String(d).includes('/dev/kvm'))
				if (svc.devices.length !== before) stripped = true
				if (svc.devices.length === 0) delete svc.devices
			}
		}
	}
	return {compose, stripped}
}
