// @vitest-environment jsdom
//
// Phase 357-01 (VMDESK-01) — VM DESKTOP-surface icon invariant guards.
//
// A SEPARATE surface from 354's dock pin (whose guards live in
// vm-desktop-shortcut.unit.test.tsx — left untouched). `@testing-library/react`
// is NOT installed in this UI package; per the established danger-zone /
// vm-desktop-shortcut.unit.test.tsx idiom these are pure source-string
// assertions (readFileSync + toMatch), NO DOM render. They pin the invariants
// tsc/pnpm build cannot flag:
//   - use-desktop-pins is an INDEPENDENT store (own keys, vm-only union, no
//     reorder) — never the 354 dock keys.
//   - the DesktopContent vm.list query is admin-gated (FORBIDDEN spam otherwise)
//     and stale pins self-heal.
//   - the desktop tile's open handler BRANCHES on isMobile (356 convergence) —
//     never an unconditional openWindow.
//   - AppIcon's glyph override is additive (the URL path is byte-untouched).
//   - unpin ≠ delete — the desktop unpin button touches NO vm.* mutation.
//   - EN/TR parity on the two new keys + the 354 TR dock fix + jargon-free.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const desktopPinsSrc = read('src/modules/desktop/use-desktop-pins.ts')
const desktopContentSrc = read('src/modules/desktop/desktop-content.tsx')
const appIconSrc = read('src/modules/desktop/app-icon.tsx')
const vmListItemSrc = read('src/features/vm/components/vm-list-item.tsx')
const enSrc = read('public/locales/en.json')
const trSrc = read('public/locales/tr.json')

// ── A: use-desktop-pins — two-site union widening + distinct keys ─────────
describe('use-desktop-pins: independent vm-only store, own keys, no reorder', () => {
	it("A1. the DesktopPinKind type union is 'vm'", () => {
		const union = desktopPinsSrc.match(/export type DesktopPinKind =[^\n]*/)?.[0] ?? ''
		expect(union).toMatch(/'vm'/)
	})

	it("A2. the isValidPin runtime guard checks kind === 'vm' (independent of the union)", () => {
		const block = desktopPinsSrc.match(/function isValidPin[\s\S]*?\n\}/)?.[0] ?? ''
		expect(block).toMatch(/v\.kind === 'vm'/)
	})

	it('A3. its OWN storage + preference keys are present', () => {
		expect(desktopPinsSrc).toMatch(/'livinity-desktop-vm-pins'/)
		expect(desktopPinsSrc).toMatch(/'desktop-vm-pins'/)
	})

	it('A4. it NEVER references the 354 dock keys (independence)', () => {
		expect(desktopPinsSrc).not.toMatch(/'livinity-dock-pins'|'dock-pins'/)
	})

	it('A5. the API surface is exactly isPinned/pin/unpin (no reorder fn)', () => {
		// PLAN-CHECK FIX: a positive export-surface check, NOT a /reorder/ word-ban
		// (the header comment legitimately mentions AppGrid owning ordering).
		expect(desktopPinsSrc).toMatch(/return \{\s*pins,\s*isPinned,\s*pin,\s*unpin\s*\}/)
		expect(desktopPinsSrc).not.toMatch(/const reorder|function reorder|reorder\s*[:=(]/)
	})
})

// ── B: desktop-content — admin-gate + stale-pin self-heal + isMobile branch ─
describe('desktop-content: admin-gated vm.list, stale-pin self-heal, isMobile open branch', () => {
	it('B1. wires useDesktopPins + an admin-gated vm.list query', () => {
		expect(desktopContentSrc).toMatch(/useDesktopPins/)
		expect(desktopContentSrc).toMatch(/vm\.list\.useQuery/)
		expect(desktopContentSrc).toMatch(/enabled:\s*isAdmin/)
	})

	it('B2. the resolver drops unresolved (deleted) pins — self-heal', () => {
		expect(desktopContentSrc).toMatch(/\.filter\(\(vm\).*=> *!!vm\)/)
	})

	it('B3. the vm-pin onClick BRANCHES on isMobile — never an unconditional openWindow', () => {
		const vmClick = desktopContentSrc.match(/vm-pin-\$\{vm\.id\}[\s\S]*?<\/motion\.div>/)?.[0] ?? ''
		expect(vmClick).toMatch(/isMobile\s*\?/)
		expect(vmClick).toMatch(/openWindow\('LIVINITY_vm',\s*`\/vm\/\$\{vm\.id\}`,\s*vm\.name,\s*''\)/)
		expect(vmClick).toMatch(/openApp\('LIVINITY_vm',\s*`\/vm\/\$\{vm\.id\}`,\s*vm\.name,\s*''\)/)
		expect(vmClick).toMatch(/glyph=\{pickIcon\(vm\.kind\)\}/)
	})
})

// ── C: AppIcon — glyph additive, URL path byte-untouched ──────────────────
describe('app-icon: additive glyph override, URL path preserved', () => {
	it('C1. AppIcon gained an optional glyph?: ComponentType prop', () => {
		expect(appIconSrc).toMatch(/glyph\?:\s*ComponentType/)
	})

	it('C2. the existing URL-icon render path is untouched', () => {
		expect(appIconSrc).toMatch(/<LauncherIcon src=\{src\}/)
	})
})

// ── D: UNPIN INVARIANT (crown) — the desktop button touches NO vm.* mutation ─
describe('vm-list-item: desktop unpin ≠ delete', () => {
	// Isolate on the DISTINCT desktop-surface comment (NOT "Dock") so this can
	// never match 354's dock button block.
	const pinBlock = vmListItemSrc.match(/Pin\/unpin to the desktop surface[\s\S]*?<\/Button>/)?.[0] ?? ''

	it('D1. the isolated desktop unpin handler exists', () => {
		expect(pinBlock).not.toBe('')
		expect(pinBlock).toMatch(/unpinDesktop\('vm'/)
	})

	it('D2. it matches NO generic vm.* mutation/invalidation (354 regex, verbatim)', () => {
		const genericMutation =
			/trpcReact\.vm\.\w+\.(useMutation|mutate)|\bvm\.(delete|start|stop|restart|rename)\b|\w*Mut\.mutate\b|deleteMut|utils\.vm\.\w+\.invalidate/
		expect(pinBlock).not.toMatch(genericMutation)
	})

	it('D3. references neither vm.delete nor deleteMut (explicit)', () => {
		expect(pinBlock).not.toMatch(/vm\.delete|deleteMut/)
	})
})

// ── E: EN/TR parity + 354 TR fix + jargon-free ────────────────────────────
describe('i18n: pin-desktop/unpin-desktop parity, 354 TR fix, jargon-free', () => {
	it('E1. both locales carry the two new keys', () => {
		for (const src of [enSrc, trSrc]) {
			expect(src).toMatch(/"vm\.controls\.pin-desktop"/)
			expect(src).toMatch(/"vm\.controls\.unpin-desktop"/)
		}
	})

	it("E2. the 354 dock TR mistranslation is corrected to \"Dock'a Sabitle\"", () => {
		expect(trSrc).toMatch(/"vm\.controls\.pin":\s*"Dock'a Sabitle"/)
		expect(trSrc).not.toMatch(/"vm\.controls\.pin":\s*"Masaüstüne Sabitle"/)
	})

	it('E3. no VNC/noVNC/RFB/websockify jargon in any NEW-string surface', () => {
		// Scoped to the surfaces THIS phase introduces — NOT the whole
		// vm-list-item.tsx, whose pre-existing 353 "…noVNC screen view…" comment
		// is legitimate and out of scope (deviation from the plan's literal
		// vmListItemSrc list, which would false-positive on that 353 comment).
		const vmClick = desktopContentSrc.match(/vm-pin-\$\{vm\.id\}[\s\S]*?<\/motion\.div>/)?.[0] ?? ''
		const desktopPinBtn = vmListItemSrc.match(/Pin\/unpin to the desktop surface[\s\S]*?<\/Button>/)?.[0] ?? ''
		for (const src of [desktopPinsSrc, vmClick, desktopPinBtn, enSrc, trSrc]) {
			expect(src).not.toBe('')
			expect(src).not.toMatch(/VNC|noVNC|RFB|websockify/i)
		}
	})
})
