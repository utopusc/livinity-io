// Phase 349 (VMSEC-01/02/03) — vm-template pure-data structural tests.
// The template is pure data (zero I/O), so no mocks are needed. Exact-equality
// matchers (toEqual/toBe — NEVER toContain/toMatchObject on the elevated set)
// so an ADDED device or cap FAILS the test, per CONTEXT.md VMSEC-02.
import {describe, expect, test} from 'vitest'

import {WINDOWS_VM_TEMPLATE, LINUX_VM_TEMPLATE, getVmTemplate} from './vm-template.js'
import {isPublicForbidden} from '../apps/public-forbidden.js'

describe('vm-template — VMSEC-02 exact least-privilege set', () => {
	for (const t of [WINDOWS_VM_TEMPLATE, LINUX_VM_TEMPLATE]) {
		test(`${t.id}: elevated set is EXACTLY kvm+tun / NET_ADMIN — no more`, () => {
			expect(t.compose.devices).toEqual(['/dev/kvm', '/dev/net/tun'])
			expect(t.compose.cap_add).toEqual(['NET_ADMIN'])
			expect(t.compose.stop_grace_period).toBe('2m')
			expect('privileged' in t.compose).toBe(false)
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
