// @vitest-environment jsdom
//
// Phase 359-02 (VMSET-01 / VMSET-03) — VM Settings dialog honesty guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone /
// 352 / 355 precedent) — no render/screen. These are source-text invariants over
// the raw component text (readFileSync) pinning the honesty guarantees the
// 359 threat model (T-359-10/11/12) depends on, which tsc/pnpm build cannot catch
// (they are string/structure invariants, not type errors).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const DIALOG = 'src/features/vm/components/vm-settings-dialog.tsx'
const LIST_ITEM = 'src/features/vm/components/vm-list-item.tsx'
const EN = 'public/locales/en.json'
const TR = 'public/locales/tr.json'

describe('Settings edits resources via the sanctioned vm.update mutation (VMSET-01)', () => {
	it('vm-settings-dialog.tsx dispatches vm.update with verbatim server-error surfacing', () => {
		const src = read(DIALOG)
		expect(src).toMatch(/trpcReact\.vm\.update\.useMutation/)
		// The mutate call carries the id + a resources object (allowed keys only).
		expect(src).toMatch(/updateMut\.mutate\(/)
		expect(src).toMatch(/resources:\s*\{/)
		// The server refusal (BAD_REQUEST grow-only / capacity) surfaces verbatim.
		expect(src).toMatch(/toast\.error\(error\.message\)/)
		expect(src).toMatch(/updateMut\.error\?\.message/)
	})
})

describe('the disk field is grow-only in the UI (VMSET-01 / T-359-11)', () => {
	it('vm-settings-dialog.tsx binds the disk Input min to the VM current diskGiB', () => {
		const src = read(DIALOG)
		expect(src).toMatch(/min=\{vm\.resources\.diskGiB\}/)
		// An honest grow-only hint key is rendered beside the disk field.
		expect(src).toMatch(/vm\.settings\.disk-grow-only-hint/)
	})
})

describe('restart-to-apply is honest — never an "applied/live" claim (T-359-12)', () => {
	it('vm-settings-dialog.tsx shows the restart-required hint iff data.restartRequired', () => {
		const src = read(DIALOG)
		expect(src).toMatch(/data\.restartRequired/)
		// The dialog renders honesty via the restart-required KEY (the actual
		// user-facing copy is honesty-guarded by the locale-value test below —
		// the source only references t() keys, never a raw "applied" string).
		expect(src).toMatch(/vm\.settings\.restart-required/)
	})
	it('the restart-required copy is honest in BOTH locales (stop+start, never "applied")', () => {
		const en = JSON.parse(read(EN)) as Record<string, string>
		const tr = JSON.parse(read(TR)) as Record<string, string>
		expect(en['vm.settings.restart-required']).toMatch(/stop and start/i)
		expect(en['vm.settings.restart-required']).not.toMatch(/applied|already|now live/i)
		expect(tr['vm.settings.restart-required']).toBeTruthy()
		expect(tr['vm.settings.restart-required']).not.toMatch(/uygulandı|zaten/i)
	})
})

describe('the RDP endpoint is re-homed windows-only + admin-gated (T-359-10)', () => {
	it('vm-settings-dialog.tsx gates the RDP block on windows + rdpPort + host IP, never unconditional', () => {
		const src = read(DIALOG)
		// The re-homed host-LAN-IP endpoint renders ONLY for a windows VM with an rdpPort.
		expect(src).toMatch(/vm\.kind === 'windows'/)
		expect(src).toMatch(/vm\.rdpPort/)
		expect(src).toMatch(/getIpAddresses/)
		expect(src).toMatch(/vm\.settings\.rdp-hint/)
		// Admin-gated: the query only fires for an admin (never an adminProcedure as a member).
		expect(src).toMatch(/isAdmin/)
		// The deleted 358 screen key is NOT resurrected.
		expect(src).not.toMatch(/vm\.screen\.rdp-hint/)
	})
})

describe('zero user-facing VNC jargon — every vm.settings.* value is jargon-free (VMVNC-02 discipline extended, WARN-2)', () => {
	it('no vm.settings.* EN or TR locale value contains VNC/noVNC/RFB/websockify', () => {
		const en = JSON.parse(read(EN)) as Record<string, string>
		const tr = JSON.parse(read(TR)) as Record<string, string>
		for (const locale of [en, tr]) {
			for (const [k, v] of Object.entries(locale)) {
				if (!k.startsWith('vm.settings.')) continue
				expect(v, `jargon in ${k}: ${v}`).not.toMatch(/VNC|noVNC|RFB|websockify/i)
			}
		}
	})
})

describe('EN/TR parity for every new vm.settings.* + vm.controls.settings key (hard gate)', () => {
	it('every vm.settings.* / vm.controls.settings EN key has a TR counterpart and vice-versa', () => {
		const en = JSON.parse(read(EN)) as Record<string, string>
		const tr = JSON.parse(read(TR)) as Record<string, string>
		const isNew = (k: string) => k.startsWith('vm.settings.') || k === 'vm.controls.settings'
		const enKeys = Object.keys(en).filter(isNew)
		const trKeys = Object.keys(tr).filter(isNew)
		expect(enKeys.length).toBeGreaterThan(0)
		for (const k of enKeys) {
			expect(tr[k], `missing TR key: ${k}`).toBeTruthy()
		}
		for (const k of trKeys) {
			expect(en[k], `missing EN key: ${k}`).toBeTruthy()
		}
	})
})

describe('the Settings affordance is wired row-local on each VM row (VMSET-01)', () => {
	it('vm-list-item.tsx renders a Settings button + a row-local <VmSettingsDialog>', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/vm\.controls\.settings/)
		expect(src).toMatch(/TbSettings/)
		expect(src).toMatch(/settingsOpen/)
		expect(src).toMatch(/<VmSettingsDialog\b/)
		expect(src).toMatch(/open=\{settingsOpen\}/)
	})
})
