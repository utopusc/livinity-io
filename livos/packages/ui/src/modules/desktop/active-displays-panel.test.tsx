// @vitest-environment jsdom
//
// Phase 254-04 — active-displays-panel source-text invariants.
//
// Locks the consumer contract: top-edge hover-reveal strip driven by
// displays.list (Plan 01), opening sized DISPLAY_ VNC windows on click
// (Plan 03), DISPLAYS ONLY (locked decision #2 — never LivOS app windows
// and never list_windows).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const PANEL_PATH = resolve(__dirname, 'active-displays-panel.tsx')
const SRC = readFileSync(PANEL_PATH, 'utf8')

describe('active-displays-panel — Phase 254-04 contract', () => {
	it('exports ActiveDisplaysPanel as a function component', () => {
		expect(SRC).toMatch(/export function ActiveDisplaysPanel\(\)/)
	})

	it('drives the strip from displays.list useQuery', () => {
		expect(SRC).toMatch(/displays\.list\.useQuery/)
	})

	it('gates the poll on open (enabled + refetchInterval)', () => {
		expect(SRC).toMatch(/enabled:\s*open/)
		expect(SRC).toMatch(/refetchInterval:\s*4000/)
	})

	it('opens a DISPLAY_ window sized to the display real WxH on click', () => {
		// openWindow(`DISPLAY_${d.display}`, …, {width: d.width, height: d.height})
		expect(SRC).toMatch(/openWindow\(`DISPLAY_\$\{/)
		expect(SRC).toMatch(/width:\s*d\.width/)
		expect(SRC).toMatch(/height:\s*d\.height/)
	})

	it('shows :N, WxH, and running-app count per row', () => {
		expect(SRC).toMatch(/d\.display/)
		expect(SRC).toMatch(/d\.width/)
		expect(SRC).toMatch(/d\.height/)
		expect(SRC).toMatch(/running_apps/)
	})

	it('closes the panel after opening a window', () => {
		expect(SRC).toMatch(/setOpen\(false\)/)
	})

	it('renders an empty state', () => {
		expect(SRC).toMatch(/No active displays/)
	})

	it('returns null on mobile (mirrors TopBar)', () => {
		expect(SRC).toMatch(/useIsMobile/)
		expect(SRC).toMatch(/if\s*\(isMobile\)\s*return null/)
	})

	it('uses the optional window-manager hook (guarded)', () => {
		expect(SRC).toMatch(/useWindowManagerOptional/)
	})

	it('is DISPLAYS-ONLY — never reads windowManager.windows or any list_windows source (decision #2)', () => {
		expect(SRC).not.toMatch(/windowManager\.windows|\blist_windows\b|listWindows/)
	})

	it('anchors a top-edge reveal above TopBar z-50', () => {
		expect(SRC).toMatch(/top-0/)
		expect(SRC).toMatch(/AnimatePresence/)
	})
})
