// Phase 351 (VMCREATE-01) — vm-os-catalog pure-data structural tests.
// The catalog is pure data (zero I/O), so no mocks are needed. These pins:
//   - the Windows edition + Linux distro key sets match the verified-upstream
//     enum counts (drift-guarded against dockur/windows + qemus/qemu readmes),
//   - macOS is absent by construction (no macos/osx key anywhere),
//   - the catalog carries ZERO compose/device/cap field (pure display + env
//     metadata — the 349 template stays the single source of image knowledge),
//   - the BYO-license notice is a SUBSTRING of the template description (single
//     source, no drift).
import {describe, expect, test} from 'vitest'

import {WINDOWS_EDITIONS, LINUX_DISTROS, WINDOWS_BYO_LICENSE_NOTICE} from './vm-os-catalog.js'
import {WINDOWS_VM_TEMPLATE} from './vm-template.js'

describe('vm-os-catalog — verified-upstream enum counts', () => {
	test('WINDOWS_EDITIONS has exactly 18 keys (dockur/windows VERSION enum, fetched 2026-07-20)', () => {
		// Live upstream re-fetch 2026-07-20 shows 18 values (research doc said 17 —
		// it omitted `2k` Windows 2000 Professional; encoded here + noted in SUMMARY).
		expect(Object.keys(WINDOWS_EDITIONS).length).toBe(18)
	})

	test('LINUX_DISTROS has exactly 23 keys (qemus/qemu BOOT enum, fetched 2026-07-20)', () => {
		expect(Object.keys(LINUX_DISTROS).length).toBe(23)
	})

	test('WINDOWS_EDITIONS covers the exact upstream VERSION values', () => {
		expect(Object.keys(WINDOWS_EDITIONS).sort()).toEqual(
			[
				'11', '11l', '11e', '10', '10l', '10e', '8e', '7u', 'vu', 'xp', '2k',
				'2025', '2022', '2019', '2016', '2012', '2008', '2003',
			].sort(),
		)
	})

	test('LINUX_DISTROS covers the exact upstream BOOT values', () => {
		expect(Object.keys(LINUX_DISTROS).sort()).toEqual(
			[
				'alma', 'alpine', 'arch', 'cachy', 'centos', 'debian', 'fedora', 'gentoo',
				'kali', 'kubuntu', 'mint', 'manjaro', 'mx', 'nixos', 'suse', 'rocky',
				'slack', 'tails', 'ubuntu', 'ubuntus', 'xubuntu', 'zima', 'zorin',
			].sort(),
		)
	})
})

describe('vm-os-catalog — macOS is absent by construction (VMCREATE-01)', () => {
	test('neither table has a macos / osx / mac key', () => {
		for (const table of [WINDOWS_EDITIONS, LINUX_DISTROS]) {
			const keys = Object.keys(table).map((k) => k.toLowerCase())
			expect(keys).not.toContain('macos')
			expect(keys).not.toContain('osx')
			expect(keys).not.toContain('mac')
			expect(keys.some((k) => k.includes('mac') || k.includes('osx'))).toBe(false)
		}
	})
})

describe('vm-os-catalog — pure display + env metadata only (no compose/device leak)', () => {
	test('every Windows entry has a label + positive-number defaults, no compose field', () => {
		for (const [key, entry] of Object.entries(WINDOWS_EDITIONS)) {
			expect(typeof entry.label).toBe('string')
			expect(entry.label.length).toBeGreaterThan(0)
			expect(entry.defaults.cpus).toBeGreaterThan(0)
			expect(entry.defaults.ramMiB).toBeGreaterThan(0)
			expect(entry.defaults.diskGiB).toBeGreaterThan(0)
			// PURE DATA: no compose/device/cap/image field may ride the catalog —
			// the 349 template is the single source of image/elevated-set knowledge.
			const runtime = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>
			expect(Object.keys(runtime).sort()).toEqual(['defaults', 'label'])
			expect(runtime).not.toHaveProperty('devices')
			expect(runtime).not.toHaveProperty('cap_add')
			expect(runtime).not.toHaveProperty('image')
			expect(runtime).not.toHaveProperty('compose')
			void key
		}
	})

	test('every Linux entry has a label + positive-number defaults, no compose field', () => {
		for (const [, entry] of Object.entries(LINUX_DISTROS)) {
			expect(typeof entry.label).toBe('string')
			expect(entry.label.length).toBeGreaterThan(0)
			expect(entry.defaults.cpus).toBeGreaterThan(0)
			expect(entry.defaults.ramMiB).toBeGreaterThan(0)
			expect(entry.defaults.diskGiB).toBeGreaterThan(0)
			const runtime = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>
			expect(Object.keys(runtime).sort()).toEqual(['defaults', 'label'])
		}
	})

	test('Windows defaults are heavier than Linux defaults (VMCREATE-02 per-OS defaults)', () => {
		expect(WINDOWS_EDITIONS['11'].defaults.ramMiB).toBeGreaterThan(LINUX_DISTROS['ubuntu'].defaults.ramMiB)
		expect(WINDOWS_EDITIONS['11'].defaults.diskGiB).toBeGreaterThanOrEqual(LINUX_DISTROS['ubuntu'].defaults.diskGiB)
	})
})

describe('vm-os-catalog — BYO-license notice single-sourcing (no drift)', () => {
	test('WINDOWS_BYO_LICENSE_NOTICE is a substring of the template description', () => {
		expect(WINDOWS_VM_TEMPLATE.description.includes(WINDOWS_BYO_LICENSE_NOTICE)).toBe(true)
	})

	test('the notice is the re-homed verbatim BYO sentence', () => {
		expect(WINDOWS_BYO_LICENSE_NOTICE).toBe(
			'You must supply your own valid Windows license — LivOS does not provide Windows or an activation key.',
		)
	})
})
