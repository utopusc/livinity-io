// @vitest-environment jsdom
//
// Phase 255-04 — displays-popover source-text invariants.
//
// Locks the consumer contract of the SINGLE navbar display/windows surface:
//   • display cards driven by displays.list (254-01)
//   • ~2s auto-refreshing JPEG thumbnails via displays.screenshot (255-02) —
//     screenshot polling ONLY, NEVER an RFB / WebSocket socket
//     (D-255-THUMBS-SCREENSHOT / T-255-13)
//   • card click opens the live DISPLAY_ VNC window (254-03 contract)
//   • the Phase 159 windows-manager rows folded in (WindowsManagerPanel)
//   • mobile guard (mirrors TopBar / active-displays-panel)

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const POPOVER_PATH = resolve(__dirname, 'displays-popover.tsx')
const SRC = readFileSync(POPOVER_PATH, 'utf8')

describe('displays-popover — Phase 255-04 contract', () => {
	it('exports DisplaysPopover as a function component', () => {
		expect(SRC).toMatch(/export function DisplaysPopover\(/)
	})

	it('drives the cards from displays.list useQuery (gated on open)', () => {
		expect(SRC).toMatch(/displays\.list\.useQuery/)
		expect(SRC).toMatch(/enabled:\s*open/)
		expect(SRC).toMatch(/refetchInterval:\s*4000/)
	})

	it('renders ~2s auto-refreshing screenshot thumbnails via displays.screenshot', () => {
		expect(SRC).toMatch(/displays\.screenshot\.useQuery/)
		expect(SRC).toMatch(/refetchInterval:\s*2000/)
		// the thumbnail is an <img> sourced from the screenshot dataUrl
		expect(SRC).toMatch(/src=\{shot\.data\.dataUrl\}/)
	})

	it('opens a DISPLAY_ VNC window sized to real WxH on card click (254-03 contract)', () => {
		expect(SRC).toMatch(/openWindow\(`DISPLAY_\$\{/)
		expect(SRC).toMatch(/width:\s*d\.width/)
		expect(SRC).toMatch(/height:\s*d\.height/)
	})

	it('folds in the Phase 159 windows-manager rows', () => {
		expect(SRC).toMatch(/WindowsManagerPanel/)
	})

	it('shows :N, WxH, and running-app count per card', () => {
		expect(SRC).toMatch(/d\.display/)
		expect(SRC).toMatch(/d\.width/)
		expect(SRC).toMatch(/d\.height/)
		expect(SRC).toMatch(/running_apps/)
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

	it('NEVER opens a live RFB / WebSocket socket in the popover (D-255-THUMBS-SCREENSHOT)', () => {
		// thumbs are screenshots only — no live sockets in the popover body.
		expect(SRC).not.toMatch(/RFB\(/)
		expect(SRC).not.toMatch(/new WebSocket\(/)
	})
})
