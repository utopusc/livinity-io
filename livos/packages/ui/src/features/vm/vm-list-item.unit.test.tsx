// @vitest-environment jsdom
//
// Phase 352-02 (VMAPP-02) — VM list/lifecycle guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone
// precedent, verified 2026-07-21) — no render/screen. These are source-text
// invariants over the raw component text (readFileSync) pinning the honesty +
// destruction-safety guarantees the threat model (T-352-05/06/07) depends on,
// which tsc/pnpm build cannot catch (they are string/structure invariants, not
// type errors).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const readJson = (rel: string) => JSON.parse(read(rel))

const DELETE_DIALOG = 'src/features/vm/components/delete-vm-dialog.tsx'
const LIST_ITEM = 'src/features/vm/components/vm-list-item.tsx'
const EN = 'public/locales/en.json'
const TR = 'public/locales/tr.json'

describe('delete is confirm-gated (T-352-06 — no data loss without explicit ack)', () => {
	it('delete-vm-dialog.tsx fires vm.delete only with confirm: true', () => {
		const src = read(DELETE_DIALOG)
		expect(src).toMatch(/trpcReact\.vm\.delete/)
		// The literal confirm:true is the acknowledgement the backend z.literal(true) double-gates.
		expect(src).toMatch(/confirm:\s*true/)
	})
})

describe('errored VM surfaces its reason and never renders as healthy (T-352-05)', () => {
	it('vm-list-item.tsx renders vm.lastError', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/lastError/)
	})
	it('vm-list-item.tsx has an explicit error-state branch (state cannot fall through to running)', () => {
		const src = read(LIST_ITEM)
		// The badge switches on state; an 'error' arm exists distinct from 'running'.
		expect(src).toMatch(/case 'error'/)
		expect(src).toMatch(/case 'running'/)
		// The error reason is gated on the error state, not shown for a healthy VM.
		expect(src).toMatch(/vm\.state === 'error'/)
	})
})

describe('open-screen opens the state-aware screen view (353-02 — no dead placeholder)', () => {
	it('vm-list-item.tsx wires open-screen to onOpenScreen(vm), retiring the coming-353 placeholder', () => {
		const src = read(LIST_ITEM)
		// The dishonest disabled placeholder is gone; the button now calls back up.
		expect(src).not.toMatch(/vm\.open-screen\.coming-353/)
		expect(src).toMatch(/onOpenScreen/)
		expect(src).toMatch(/onClick=\{\(\) => onOpenScreen\(vm\)\}/)
		// Still no router navigation from the row — the screen is a view within the app window.
		expect(src).not.toMatch(/navigate\(|useNavigate|<Link/)
	})
})

describe('lifecycle mutations are wired (VMAPP-02)', () => {
	it('vm-list-item.tsx wires start / stop / restart / rename with verbatim error surfacing', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/trpcReact\.vm\.start/)
		expect(src).toMatch(/trpcReact\.vm\.stop/)
		expect(src).toMatch(/trpcReact\.vm\.restart/)
		expect(src).toMatch(/trpcReact\.vm\.rename/)
		// The server message surfaces verbatim (CONFLICT "...already in progress").
		expect(src).toMatch(/toast\.error\(error\.message\)/)
	})
})

describe('the Settings affordance is row-local, like rename — never list-owned (359-02)', () => {
	it('vm-list-item.tsx renders a Settings button opening a per-row <VmSettingsDialog>', () => {
		const src = read(LIST_ITEM)
		// A Settings affordance (icon + label) in the controls cluster.
		expect(src).toMatch(/TbSettings/)
		expect(src).toMatch(/vm\.controls\.settings/)
		// Row-local open-state (mirrors renameOpen — NOT a single list-owned dialog).
		expect(src).toMatch(/const \[settingsOpen, setSettingsOpen\] = useState\(false\)/)
		// 363: Settings moved into the overflow DropdownMenuItem, which fires onSelect.
		expect(src).toMatch(/onSelect=\{\(\) => setSettingsOpen\(true\)\}/)
		// The heavy form is a dedicated component wired for THIS vm.
		expect(src).toMatch(/<VmSettingsDialog open=\{settingsOpen\} onOpenChange=\{setSettingsOpen\} vm=\{vm\} \/>/)
	})
})

// ── 363 VMUX: the row consolidates 7–8 flat buttons → primary + overflow menu ──

describe('the row consolidates to a primary + overflow menu (363 VMUX)', () => {
	it('keeps Open screen as the always-visible PRIMARY button (not a menu item)', () => {
		const src = read(LIST_ITEM)
		// The primary callback is unchanged from 353 and stays a top-level onClick.
		expect(src).toMatch(/onClick=\{\(\) => onOpenScreen\(vm\)\}/)
		// It is the filled primary variant — the hierarchy signal.
		expect(src).toMatch(/variant='primary'/)
	})

	it('holds every other action in a visible DropdownMenu behind a dots trigger', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/DropdownMenuTrigger/)
		expect(src).toMatch(/DropdownMenuContent/)
		expect(src).toMatch(/DropdownMenuItem/)
		// The trigger is a dots glyph carrying an accessible label.
		expect(src).toMatch(/TbDots/)
		expect(src).toMatch(/aria-label=\{t\('vm\.controls\.more'\)\}/)
	})

	it('uses a touch-usable DropdownMenu, NOT a right-click ContextMenu', () => {
		const src = read(LIST_ITEM)
		expect(src).not.toMatch(/ContextMenuTrigger/)
	})
})

describe('every secondary action is present as a menu item with its wiring intact (354/357/359 + lifecycle)', () => {
	it('keeps the lifecycle + rename mutations wired', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/trpcReact\.vm\.start/)
		expect(src).toMatch(/trpcReact\.vm\.stop/)
		expect(src).toMatch(/trpcReact\.vm\.restart/)
		expect(src).toMatch(/trpcReact\.vm\.rename/)
	})

	it('carries the reused label key for each moved action', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/vm\.controls\.stop/)
		expect(src).toMatch(/vm\.controls\.restart/)
		expect(src).toMatch(/vm\.controls\.start/)
		expect(src).toMatch(/vm\.controls\.rename/)
		expect(src).toMatch(/vm\.controls\.settings/)
		expect(src).toMatch(/vm\.controls\.pin\b/)
		expect(src).toMatch(/vm\.controls\.pin-desktop/)
	})

	it('preserves 354 dock pin (unpin rides the pin hook, never a vm.* mutation)', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/useDockPins/)
		expect(src).toMatch(/unpin\('vm', vm\.id\)/)
	})

	it('preserves 357 desktop pin', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/useDesktopPins/)
		expect(src).toMatch(/unpinDesktop\('vm', vm\.id\)/)
	})

	it('preserves 359 settings (row-local dialog)', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/const \[settingsOpen, setSettingsOpen\] = useState\(false\)/)
		expect(src).toMatch(/<VmSettingsDialog open=\{settingsOpen\} onOpenChange=\{setSettingsOpen\} vm=\{vm\} \/>/)
	})

	it('keeps the lifecycle items disable-gated', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/disabled=\{controlsDisabled\}/)
	})
})

describe('Delete is the last menu item and destructive (mirrors app-icon uninstall placement)', () => {
	it('stays wired to the list-owned confirm dialog', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/onSelect=\{onDelete\}/)
	})

	it('is destructive-styled with the shared tokens inline', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/text-destructive2-lightest/)
	})

	it('comes AFTER Rename and Settings (last in the menu)', () => {
		const src = read(LIST_ITEM)
		expect(src.indexOf('vm.controls.delete')).toBeGreaterThan(src.indexOf('vm.controls.settings'))
		expect(src.indexOf('vm.controls.delete')).toBeGreaterThan(src.indexOf('vm.controls.rename'))
	})
})

describe('the compact live readout is running-gated (362 hook reuse)', () => {
	it('reuses the running-gated useVmStats hook, opting OUT of the disk du (W-01 — wantDisk falsey)', () => {
		const src = read(LIST_ITEM)
		// Two-arg call: wantDisk falls back to its false default, so the compact row
		// NEVER triggers a du shell-out. The heavier disk read stays in the dialog.
		expect(src).toMatch(/useVmStats\(vm\.id,\s*vm\.state === 'running'\)/)
		expect(src).not.toMatch(/useVmStats\([^)]*,\s*true\)/)
	})

	it('renders the readout ONLY for a running VM with stats', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/vm\.state === 'running' && stats/)
	})

	it('reads live CPU + RAM fields, not just the allocated caption', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/stats\.cpuPercent/)
		expect(src).toMatch(/stats\.ramUsedMiB/)
	})

	it('does NOT render a heavy per-row Gauge', () => {
		const src = read(LIST_ITEM)
		expect(src).not.toMatch(/<Gauge/)
	})
})

describe('EN/TR parity for the two new 363 keys', () => {
	it('both locales carry vm.controls.more + vm.usage.summary', () => {
		const en = readJson(EN)
		const tr = readJson(TR)
		for (const k of ['vm.controls.more', 'vm.usage.summary']) {
			expect(en[k]).toBeTruthy()
			expect(tr[k]).toBeTruthy()
		}
	})

	it('mints NO new label keys for moved actions — the reused keys still exist in both locales', () => {
		const en = readJson(EN)
		const tr = readJson(TR)
		for (const k of ['vm.controls.open-screen', 'vm.controls.delete']) {
			expect(en[k]).toBeTruthy()
			expect(tr[k]).toBeTruthy()
		}
	})
})
