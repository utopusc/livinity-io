// @vitest-environment jsdom
//
// Phase 356-01 (VMWIN-01, VMWIN-02) — VM screen as a first-class app window.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone /
// vm-desktop-shortcut precedent) — these are pure source-string invariants
// (readFileSync + toMatch, NO DOM render). They pin the load-bearing guarantees
// tsc / pnpm build cannot flag:
//   - titleIcon threaded at EVERY touched type site (a dropped destructure like
//     the dead `icon` prop = a silently absent glyph).
//   - the render-time-ONLY invariant: titleIcon must never enter window-manager
//     (WindowState / OPEN_WINDOW / the reducer / the pinned-window Postgres
//     icon:string field — a ReactNode cannot round-trip).
//   - the convergence invariant: on DESKTOP the app-list "Open screen" button
//     routes through windowManager.openWindow with the SAME shape as the 354 dock
//     pin (also the 357 desktop-shortcut's shape); on MOBILE it falls back to the
//     pre-356 in-panel setScreenVmId swap (M-01 — WindowsContainer renders nothing
//     on mobile, so a desktop window would be an invisible accretion), gated on
//     the SAME useIsMobile signal windows-container.tsx uses — while the internal
//     screenVmId seed machinery stays intact.
//   - missing/stale VM → the title icon renders nothing (never crashes).
//   - no NEW VNC jargon on the touched user-facing surface (355 guard intent).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const CHROME = 'src/modules/window/window-chrome.tsx'
const WINDOW = 'src/modules/window/window.tsx'
const CONTAINER = 'src/modules/window/windows-container.tsx'
const TITLE_ICON = 'src/features/vm/components/vm-window-title-icon.tsx'
const VM_LIST = 'src/features/vm/components/vm-list.tsx'
const DOCK = 'src/modules/desktop/dock.tsx'
const WM = 'src/providers/window-manager.tsx'

const chromeSrc = read(CHROME)
const windowSrc = read(WINDOW)
const containerSrc = read(CONTAINER)
const titleIconSrc = read(TITLE_ICON)
const vmListSrc = read(VM_LIST)
const dockSrc = read(DOCK)

// ── A: titleIcon threading exists at ALL touched type sites ───────────────
describe('A. titleIcon ReactNode threaded chrome → window → container', () => {
	it('A1. window-chrome.tsx declares titleIcon?: ReactNode, destructures it, and renders it in the pill', () => {
		const propsBlock = chromeSrc.match(/type WindowChromeProps = \{[\s\S]*?\n\}/)?.[0] ?? ''
		expect(propsBlock).toMatch(/titleIcon\?:\s*(React\.)?ReactNode/)
		const sig = chromeSrc.match(/function WindowChrome\(\{[^}]*\}/)?.[0] ?? ''
		// Destructured (unlike the dead `icon` prop which is declared but dropped).
		expect(sig).toMatch(/titleIcon/)
		// Rendered in the drag-bar pill.
		expect(chromeSrc).toMatch(/\{titleIcon\s*\?/)
	})

	it('A2. window.tsx adds titleIcon to WindowProps and passes it to WindowChrome', () => {
		const propsBlock = windowSrc.match(/type WindowProps = \{[\s\S]*?\n\}/)?.[0] ?? ''
		expect(propsBlock).toMatch(/titleIcon\?:/)
		expect(windowSrc).toMatch(/titleIcon=\{titleIcon\}/)
	})

	it('A3. windows-container.tsx derives vmScreenId from appId+route and passes VmWindowTitleIcon', () => {
		expect(containerSrc).toMatch(/VmWindowTitleIcon/)
		expect(containerSrc).toMatch(/window\.appId === 'LIVINITY_vm'/)
		// Gated on BOTH the appId AND a real vm id in the route (the generic list
		// window, route '/vm', constructs no component / fires no query).
		expect(containerSrc).toMatch(/route\.startsWith\('\/vm\/'\)/)
		expect(containerSrc).toMatch(/titleIcon=\{[^}]*VmWindowTitleIcon/)
	})
})

// ── B: NO persistence / NO schema change (the load-bearing invariant) ─────
describe('B. titleIcon is render-time ONLY — never persisted', () => {
	it('B1. window-manager.tsx contains no titleIcon (not in WindowState / OPEN_WINDOW / the reducer)', () => {
		expect(read(WM)).not.toMatch(/titleIcon/)
	})
})

// ── C: VmWindowTitleIcon uses OsIcon + vm.list + missing-vm graceful ──────
describe('C. VmWindowTitleIcon derives the per-OS glyph, gracefully missing', () => {
	it('C1. reads trpcReact.vm.list gated on !!vmId and renders OsIcon', () => {
		expect(titleIconSrc).toMatch(/trpcReact\.vm\.list\.useQuery/)
		expect(titleIconSrc).toMatch(/enabled:\s*!!vmId/)
		expect(titleIconSrc).toMatch(/<OsIcon/)
	})

	it('C2. a missing/stale VM renders nothing (never crashes)', () => {
		expect(titleIconSrc).toMatch(/if \(!vm\) return null/)
	})

	it('C3. the decorative glyph adds NO hardcoded aria-label string', () => {
		expect(titleIconSrc).not.toMatch(/aria-label/)
	})
})

// ── D: List open-screen — desktop → openWindow, mobile → in-panel swap (M-01) ─
describe('D. app-list "Open screen" converges on windowManager.openWindow (desktop) with an in-panel mobile fallback', () => {
	// Isolate the onOpenScreen handler expression. Post-M-01 the handler is a
	// multi-line isMobile ternary (no single-line `)}` to anchor on), so capture
	// from `onOpenScreen={` to the first line that is just whitespace + the closing
	// brace of the JSX expression container — the comment lines carry `//` text (no
	// bare `}`), so the earliest `\n\s*}` is the real terminator, not an overshoot.
	const openHandler = vmListSrc.match(/onOpenScreen=\{[\s\S]*?\n\s*\}/)?.[0] ?? ''

	it('D1. the DESKTOP branch opens a dedicated LIVINITY_vm window with the dock-pin shape', () => {
		expect(openHandler).not.toBe('')
		expect(openHandler).toMatch(/openWindow\('LIVINITY_vm',\s*`\/vm\/\$\{v\.id\}`,\s*v\.name,\s*''\)/)
	})

	it('D2. the handler gates on the sanctioned useIsMobile signal, falling back to the in-panel setScreenVmId swap on mobile (M-01)', () => {
		// WindowManagerProvider is mounted unconditionally, so `windowManager` is
		// non-null on mobile too and a desktop openWindow would accrete an UNRENDERED
		// window (WindowsContainer returns null on mobile). The fix branches on the
		// SAME useIsMobile signal windows-container.tsx gates on: desktop → first-class
		// window, mobile → the pre-356 in-panel <VmScreen> swap. Both branches + the
		// gate must be present so the two renderers can never disagree.
		expect(vmListSrc).toMatch(/const isMobile = useIsMobile\(\)/)
		expect(vmListSrc).toMatch(/from '@\/hooks\/use-is-mobile'/)
		expect(openHandler).toMatch(/isMobile\b/)
		expect(openHandler).toMatch(/setScreenVmId\(v\.id\)/)
	})

	it('D3. VmList wires up useWindowManagerOptional', () => {
		expect(vmListSrc).toMatch(/useWindowManagerOptional/)
	})

	it('D4. the internal screenVmId seed machinery is preserved (not ripped out)', () => {
		expect(vmListSrc).toMatch(/initialScreenVmId/)
		expect(vmListSrc).toMatch(/setScreenVmId\(null\)/)
		expect(vmListSrc).toMatch(/<VmScreen/)
	})
})

// ── E: Dock-pin path still passes vm.name (shared shape; also 357's shape) ─
describe('E. the 354 dock-pin open call keeps the identical shape', () => {
	// Isolate the dock case 'vm' onOpenWindow call, anchored on its closing `)}`.
	const dockVmCall = dockSrc.match(/case 'vm':[\s\S]*?onOpenWindow=\{[\s\S]*?\)\}/)?.[0] ?? ''

	it('E1. dock.tsx case \'vm\' opens LIVINITY_vm with /vm/${vm.id} + vm.name', () => {
		expect(dockVmCall).not.toBe('')
		expect(dockVmCall).toMatch(/onOpenWindow\('LIVINITY_vm',\s*`\/vm\/\$\{vm\.id\}`,\s*vm\.name,\s*''/)
	})
})

// ── F: no NEW VNC jargon on the touched user-facing surface (355 intent) ───
describe('F. this phase adds no user-facing VNC jargon / no new string', () => {
	it('F1. the new VmWindowTitleIcon introduces no jargon', () => {
		expect(titleIconSrc).not.toMatch(/VNC|noVNC|RFB|websockify/i)
	})

	it('F2. the window-chrome drag-bar pill (the render surface this phase touched) has no jargon', () => {
		// NB: window-chrome.tsx ALREADY carries pre-existing developer comments that
		// mention "VNC/stream windows" (the − minimize gating) — those predate this
		// phase and are not user-facing, so a whole-file grep is the wrong surface.
		// The load-bearing guard is the drag-bar pill (where titleIcon + title
		// render): assert IT gains no jargon.
		const pill = chromeSrc.match(/gap-2 rounded-full[\s\S]*?<\/div>/)?.[0] ?? ''
		expect(pill).not.toBe('')
		expect(pill).toMatch(/\{titleIcon\s*\?/)
		expect(pill).not.toMatch(/VNC|noVNC|RFB|websockify/i)
	})
})
