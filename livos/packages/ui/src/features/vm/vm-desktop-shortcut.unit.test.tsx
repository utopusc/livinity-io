// @vitest-environment jsdom
//
// Phase 354-01 (VMSHORTCUT-01) — VM desktop-shortcut invariant guards.
//
// `@testing-library/react` is NOT installed in this UI package; per the
// established danger-zone / vm-registration.unit.test.tsx idiom these are pure
// source-string assertions (readFileSync + toMatch), NO DOM render. They exist
// to catch the load-bearing invariants tsc/pnpm build cannot flag:
//   - the two-site union widening (DockPinKind AND isValidPin) — a silent
//     drop-on-reload if only one site learns 'vm'.
//   - the admin-gate on the Dock's vm.list query (FORBIDDEN spam for non-admins).
//   - unpin ≠ delete — the unpin handler must reach the registry through
//     NOTHING except useDockPins().unpin('vm', …); it touches NO vm.* mutation.
//   - EN/TR parity on the two new strings.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const dockPinsSrc = read('src/modules/desktop/use-dock-pins.ts')
const dockSrc = read('src/modules/desktop/dock.tsx')
const dockItemSrc = read('src/modules/desktop/dock-item.tsx')
const windowContentSrc = read('src/modules/window/window-content.tsx')
const vmListItemSrc = read('src/features/vm/components/vm-list-item.tsx')
const enSrc = read('public/locales/en.json')
const trSrc = read('public/locales/tr.json')

// ── 1 + 2: two-site union widening (assert BOTH sites independently) ──────
describe('use-dock-pins: DockPinKind widened to vm at BOTH sites', () => {
	it("1. the DockPinKind type union contains 'vm'", () => {
		const union = dockPinsSrc.match(/export type DockPinKind =[^\n]*/)?.[0] ?? ''
		expect(union).toMatch(/'vm'/)
	})

	it("2. the isValidPin runtime guard OR-chain contains 'vm' (independent of the union)", () => {
		// Extract the isValidPin function body only — a union-only edit leaves this
		// block without 'vm' and this test fails (the Pitfall-1 two-site guard).
		const block = dockPinsSrc.match(/function isValidPin[\s\S]*?\n\}/)?.[0] ?? ''
		expect(block).toMatch(/v\.kind === 'vm'/)
	})
})

// ── 3 + 4: Dock renders the vm case, admin-gated ─────────────────────────
describe('dock.tsx: vm case + admin-gated vm.list query', () => {
	it("3. contains a case 'vm': arm in the pin switch", () => {
		expect(dockSrc).toMatch(/case 'vm':/)
	})

	it('4. the vm.list.useQuery is gated on enabled: isAdmin', () => {
		expect(dockSrc).toMatch(/vm\.list\.useQuery/)
		expect(dockSrc).toMatch(/enabled:\s*isAdmin/)
	})
})

// ── 5: DockItem gained the additive glyph override ───────────────────────
describe('dock-item.tsx: DockItemProps glyph override', () => {
	it('5. DockItemProps type block contains glyph?:', () => {
		const block = dockItemSrc.match(/type DockItemProps = \{[\s\S]*?\n\}/)?.[0] ?? ''
		expect(block).toMatch(/glyph\?:/)
	})
})

// ── 6: initialRoute threaded through the LIVINITY_vm arm ──────────────────
describe('window-content.tsx: LIVINITY_vm arm passes initialRoute', () => {
	it('6. the case LIVINITY_vm arm forwards initialRoute (not a bare <VmWindowContent />)', () => {
		const arm = windowContentSrc.match(/case ['"]LIVINITY_vm['"]:[\s\S]*?VmWindowContent[^\n]*/)?.[0] ?? ''
		expect(arm).toMatch(/initialRoute/)
	})
})

// ── 7: UNPIN INVARIANT (load-bearing) — unpin touches NO vm.* mutation ────
describe('vm-list-item.tsx: unpin ≠ delete invariant', () => {
	// Isolate the pin/unpin Button block only — the row's OTHER handlers
	// (start/stop/restart/rename/delete) legitimately reference vm.* mutations
	// and must NOT be in the extracted block.
	const pinBlock = vmListItemSrc.match(/Pin\/unpin to the desktop Dock[\s\S]*?<\/Button>/)?.[0] ?? ''

	it('7a. the isolated unpin handler actually exists', () => {
		expect(pinBlock).not.toBe('')
		expect(pinBlock).toMatch(/unpin\('vm'/)
	})

	it('7b. the isolated unpin handler matches NO generic vm.* mutation/invalidation', () => {
		const genericMutation =
			/trpcReact\.vm\.\w+\.(useMutation|mutate)|\bvm\.(delete|start|stop|restart|rename)\b|deleteMut|utils\.vm\.\w+\.invalidate/
		expect(pinBlock).not.toMatch(genericMutation)
	})

	it('7c. the isolated unpin handler references neither vm.delete nor deleteMut (explicit)', () => {
		expect(pinBlock).not.toMatch(/vm\.delete|deleteMut/)
	})
})

// ── 8: EN/TR parity on the two new strings ───────────────────────────────
describe('i18n parity: vm.controls.pin + vm.controls.unpin in both locales', () => {
	it('8. en.json and tr.json both carry the pin + unpin keys', () => {
		for (const src of [enSrc, trSrc]) {
			expect(src).toMatch(/"vm\.controls\.pin"/)
			expect(src).toMatch(/"vm\.controls\.unpin"/)
		}
	})
})
