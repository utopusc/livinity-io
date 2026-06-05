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

describe('displays-popover — Phase 260-04 (SC3) docked-window recall surface', () => {
	// A dedicated Docked section lists pinned windows for recall.
	it('renders a Docked section listing pinned windows', () => {
		expect(SRC).toMatch(/Docked\s*\(/)
		expect(SRC).toMatch(/\.filter\(\(w\)\s*=>\s*w\.isPinnedToTopBar\)/)
	})

	// Recall MUST go through unpinWindowFromTopBar (re-expands the still-mounted
	// window — stream stays alive), labeled "Recall".
	it('recalls a docked window via unpinWindowFromTopBar (labeled Recall)', () => {
		expect(SRC).toMatch(/unpinWindowFromTopBar\(w\.id\)/)
		expect(SRC).toMatch(/Recall/)
	})

	// LANDMINE — recall must NEVER call closeWindow (that tears the stream down).
	it('the recall path never CALLS closeWindow (keep-alive)', () => {
		expect(SRC).not.toMatch(/\.closeWindow\(/)
	})
})

describe('displays-popover — Phase 260.1 SC-C (side-by-side layout)', () => {
	it('lays cards out in a wrapping horizontal flex row (not a 2-col grid)', () => {
		expect(SRC).toMatch(/flex flex-wrap/)
		// the old stacked grid must be gone from the displays section
		expect(SRC).not.toMatch(/grid grid-cols-2/)
	})

	it('gives each card a fixed basis so they sit abreast', () => {
		expect(SRC).toMatch(/w-\[160px\]/)
	})

	it('uses the established hover-lift spring on the card', () => {
		expect(SRC).toMatch(/whileHover=\{\{translateY:\s*-6\}\}/)
		expect(SRC).toMatch(/stiffness:\s*500/)
	})

	it('keeps the thumbnail screenshot poll + DISPLAY_ click-to-open after the redesign', () => {
		expect(SRC).toMatch(/refetchInterval:\s*2000/)
		expect(SRC).toMatch(/openWindow\(`DISPLAY_\$\{d\.display\}`/)
	})
})

describe('displays-popover — Phase 260.1 SC-D (per-card × close)', () => {
	it('renders a hover-revealed × close button', () => {
		expect(SRC).toMatch(/aria-label='Close display'/)
		expect(SRC).toMatch(/group-hover:opacity-100/)
	})

	it('wires × close to the displays.close backend mutation', () => {
		expect(SRC).toMatch(/displays\.close\.useMutation/)
		expect(SRC).toMatch(/closeMutation\.mutate\(\{display:\s*d\.display\}\)/)
	})

	it('refetches the list after close so the card disappears + badge decrements', () => {
		expect(SRC).toMatch(/displaysQuery\.refetch\(\)/)
	})
})

describe('displays-popover — Phase 260.1 SC-F (last_input_at activity glow)', () => {
	it('extends DisplayRecord with last_input_at', () => {
		expect(SRC).toMatch(/last_input_at\?:\s*string/)
	})

	it('computes a ~3s recency flag from last_input_at', () => {
		expect(SRC).toMatch(/Date\.now\(\)\s*-\s*Date\.parse\(d\.last_input_at\)/)
		expect(SRC).toMatch(/ACTIVITY_WINDOW_MS/)
	})

	it('renders an on-brand pulsing boxShadow glow gated on the active flag', () => {
		expect(SRC).toMatch(/122,\s*162,\s*255/)
		expect(SRC).toMatch(/boxShadow:/)
		expect(SRC).toMatch(/repeat:\s*Infinity/)
		// the glow is mounted only when active (fades via AnimatePresence)
		expect(SRC).toMatch(/\{active\s*&&/)
		expect(SRC).toMatch(/AnimatePresence/)
	})
})

describe('displays-popover — Phase 260.1 SC-E (recall-by-drag + fullscreen)', () => {
	it('makes the card draggable with snap-to-origin', () => {
		expect(SRC).toMatch(/dragSnapToOrigin/)
		expect(SRC).toMatch(/onDragEnd=/)
	})

	it('recalls the display on a downward drag past the threshold', () => {
		expect(SRC).toMatch(/info\.offset\.y\s*>\s*80/)
		// recall opens the DISPLAY_ window (shared with the click fallback)
		expect(SRC).toMatch(/openWindow\(`DISPLAY_\$\{d\.display\}`/)
	})

	it('uses the established spring family for the drag snap-back', () => {
		expect(SRC).toMatch(/dragTransition=/)
		expect(SRC).toMatch(/bounceStiffness:\s*500/)
	})

	it('renders a hover-revealed fullscreen control that opens the display', () => {
		expect(SRC).toMatch(/aria-label='Fullscreen display'/)
		expect(SRC).toMatch(/Maximize2/)
	})

	it('keeps the thumbnail click-to-open as the recall fallback', () => {
		expect(SRC).toMatch(/onClick=\{recall\}/)
	})
})
