// Phase 349 (VMSEC-01/02/03) — vm-template pure-data structural tests.
// The template is pure data (zero I/O), so no mocks are needed. Exact-equality
// matchers (toEqual/toBe — NEVER toContain/toMatchObject on the elevated set)
// so an ADDED device or cap FAILS the test, per CONTEXT.md VMSEC-02.
import {describe, expect, test} from 'vitest'

import {
	WINDOWS_VM_TEMPLATE,
	LINUX_VM_TEMPLATE,
	getVmTemplate,
	VM_APP_IDS,
	composeRequiresKvm,
	stripKvmDeviceFromCompose,
} from './vm-template.js'
import {isPublicForbidden} from '../apps/public-forbidden.js'
import {assertInstallAllowed, InstallForbidden} from '../apps/install-admin-gate.js'

describe('vm-template — VMSEC-02 exact least-privilege set', () => {
	for (const t of [WINDOWS_VM_TEMPLATE, LINUX_VM_TEMPLATE]) {
		test(`${t.id}: elevated set is EXACTLY kvm+tun / NET_ADMIN — no more`, () => {
			expect(t.compose.devices).toEqual(['/dev/kvm', '/dev/net/tun'])
			expect(t.compose.cap_add).toEqual(['NET_ADMIN'])
			expect(t.compose.stop_grace_period).toBe('2m')
			// IN-02 (349 review): assert over a RUNTIME view of the actual object
			// (round-tripped through JSON so the compile-time `VmTemplateCompose` type
			// can't make this a tautology) — a `privileged` key sneaking into the data
			// must fail the test at runtime, not merely fail to compile.
			const runtimeCompose = JSON.parse(JSON.stringify(t.compose)) as Record<string, unknown>
			expect(Object.keys(runtimeCompose)).not.toContain('privileged')
			expect(Object.keys(runtimeCompose)).not.toContain('security_opt')
			expect(Object.keys(runtimeCompose)).not.toContain('network_mode')
			for (const p of t.compose.ports) expect(p.startsWith('127.0.0.1:')).toBe(true)
			for (const v of t.compose.volumes) expect(v.startsWith('${APP_DATA_DIR}/storage')).toBe(true)
		})
	}
})

describe('vm-template — VMSEC-03 structural neverPublic', () => {
	for (const t of [WINDOWS_VM_TEMPLATE, LINUX_VM_TEMPLATE]) {
		test(`${t.id}: neverPublic true → isPublicForbidden forbids as never-public`, () => {
			expect(t.neverPublic).toBe(true)
			expect(t.requiresKvm).toBe(true)
			expect(isPublicForbidden({neverPublic: t.neverPublic})).toEqual({
				forbidden: true,
				reason: 'never-public',
			})
		})
	}
})

describe('vm-template — VMSEC-01 re-homed image/description/lookup', () => {
	test('WINDOWS_VM_TEMPLATE carries the dockur image + BYO-license copy', () => {
		expect(WINDOWS_VM_TEMPLATE.image).toBe('dockurr/windows:latest')
		expect(WINDOWS_VM_TEMPLATE.compose.image).toBe('dockurr/windows:latest')
		expect(WINDOWS_VM_TEMPLATE.description).toContain('You must supply your own valid Windows license')
	})

	test('LINUX_VM_TEMPLATE carries the qemus image', () => {
		expect(LINUX_VM_TEMPLATE.image).toBe('qemux/qemu:latest')
		expect(LINUX_VM_TEMPLATE.compose.image).toBe('qemux/qemu:latest')
	})

	test('getVmTemplate returns the matching template by kind', () => {
		expect(getVmTemplate('windows')).toBe(WINDOWS_VM_TEMPLATE)
		expect(getVmTemplate('linux')).toBe(LINUX_VM_TEMPLATE)
	})
})

// CR-01 (349 review): the install admin-gate + KVM preflight must fire from the
// RESOLVED compose / VM id set, not from the now-empty windows/vm builtins. These
// prove: (a) a catalog compose carrying /dev/kvm for a NON-VM id gets stripped,
// (b) a non-admin cannot install anything that ends up carrying /dev/kvm.
describe('vm-template — CR-01 VM-id set + compose-derived KVM gate', () => {
	test('VM_APP_IDS covers windows + vm + linux (legacy builtin ids + re-homed id)', () => {
		expect(VM_APP_IDS.has('windows')).toBe(true)
		expect(VM_APP_IDS.has('vm')).toBe(true)
		expect(VM_APP_IDS.has('linux')).toBe(true)
		expect(VM_APP_IDS.has('jellyfin')).toBe(false)
	})

	test('composeRequiresKvm detects the /dev/kvm device fail-closed', () => {
		const vmCompose = 'services:\n  vm:\n    devices:\n      - /dev/kvm\n      - /dev/net/tun\n'
		const plainCompose = 'services:\n  web:\n    image: nginx\n    ports:\n      - 80:80\n'
		const gpuCompose = 'services:\n  jellyfin:\n    devices:\n      - /dev/dri:/dev/dri\n'
		expect(composeRequiresKvm(vmCompose)).toBe(true)
		expect(composeRequiresKvm(plainCompose)).toBe(false)
		expect(composeRequiresKvm(gpuCompose)).toBe(false)
	})

	test('(b) non-admin BLOCKED when resolved compose declares /dev/kvm (any id)', () => {
		// Simulate the apps.ts install() derivation for a catalog-served compose that
		// slipped through as a non-VM id but still carries /dev/kvm.
		const resolvedComposeText = 'services:\n  x:\n    devices:\n      - /dev/kvm\n'
		const requiresKvm =
			VM_APP_IDS.has('totally-not-a-vm') || composeRequiresKvm(resolvedComposeText)
		expect(requiresKvm).toBe(true)
		expect(() =>
			assertInstallAllowed({
				isAdmin: false,
				isGeneratedTemplate: true, // "trusted" catalog provenance — must NOT save it
				manifest: {},
				requiresKvm,
			}),
		).toThrow(InstallForbidden)
	})

	test('(b) non-admin BLOCKED for a bare VM id even before compose scan', () => {
		for (const id of ['windows', 'vm', 'linux']) {
			const requiresKvm = VM_APP_IDS.has(id)
			expect(requiresKvm).toBe(true)
			expect(() =>
				assertInstallAllowed({isAdmin: false, isGeneratedTemplate: true, manifest: {}, requiresKvm}),
			).toThrow(InstallForbidden)
		}
	})

	test('(a) stripKvmDeviceFromCompose de-fangs a non-VM catalog compose', () => {
		const parsed = {
			services: {
				evil: {image: 'x', devices: ['/dev/kvm', '/dev/net/tun']},
				gpu: {image: 'y', devices: ['/dev/dri:/dev/dri']},
			},
		}
		const {compose, stripped} = stripKvmDeviceFromCompose(parsed)
		const c = compose as typeof parsed
		expect(stripped).toBe(true)
		// /dev/kvm gone; the innocuous /dev/net/tun sibling survives on that service.
		expect(c.services.evil.devices).toEqual(['/dev/net/tun'])
		// GPU device on an unrelated service is untouched.
		expect(c.services.gpu.devices).toEqual(['/dev/dri:/dev/dri'])
	})

	test('(a) stripKvmDeviceFromCompose removes an emptied devices array + is a no-op without kvm', () => {
		const kvmOnly = {services: {vm: {image: 'x', devices: ['/dev/kvm']}}}
		const s1 = stripKvmDeviceFromCompose(kvmOnly)
		expect(s1.stripped).toBe(true)
		expect((s1.compose as {services: {vm: {devices?: unknown}}}).services.vm.devices).toBeUndefined()

		const plain = {services: {web: {image: 'nginx'}}}
		const s2 = stripKvmDeviceFromCompose(plain)
		expect(s2.stripped).toBe(false)
	})
})
