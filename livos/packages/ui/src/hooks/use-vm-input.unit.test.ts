// Phase 367-02 (VMENC-03, UI half) — source-regex invariants for the input
// capture hook. Like use-vm-encoded-screen.unit.test.ts: `@testing-library/
// react` is NOT installed and jsdom cannot meaningfully exercise pointer
// capture / rAF / the noVNC Keyboard class — the DOM lifecycle is pinned
// STRUCTURALLY here, while the coordinate/mask math the hook consumes is
// covered behaviorally in vm-input-coords.test.ts (the parse-avc-codec split).
//
// Invariants pinned (threat model T-367-01/04 + Pitfalls 4/7):
//  - keyboard derives keysyms from the ALREADY-INSTALLED noVNC Keyboard class
//    (dynamic import) — never a hand-rolled keysym table, never an RFB client;
//  - input rides the PROVIDED sendInput only — the hook opens no socket;
//  - pointermove is rAF-coalesced (latest-wins — the client half of flood
//    control; the server token bucket is the enforcement);
//  - contextmenu + wheel are preventDefault'ed (right-click and scroll belong
//    to the guest, not the browser);
//  - pointerdown captures the pointer AND focuses the container (Pitfall 7 —
//    without focus, key events never reach the Keyboard target);
//  - listeners die via one AbortController signal (the sibling-hook idiom).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const HOOK = 'src/hooks/use-vm-input.ts'

describe('keyboard — the noVNC Keyboard class, never a hand-rolled table, never an RFB client (Pitfall 4)', () => {
	it('dynamic-imports @novnc/novnc/lib/input/keyboard', () => {
		const src = read(HOOK)
		expect(src).toMatch(/@novnc\/novnc\/lib\/input\/keyboard/)
	})
	it('never imports the RFB client (this hook must not construct one)', () => {
		const src = read(HOOK)
		expect(src).not.toMatch(/lib\/rfb/)
	})
	it('drives the Keyboard lifecycle via grab()/ungrab() (ungrab releases held keys on teardown)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/\.grab\(\)/)
		expect(src).toMatch(/\.ungrab\(\)/)
	})
})

describe('input rides the provided sendInput — the hook opens NO socket (T-367-01)', () => {
	it('contains no `new WebSocket`', () => {
		const src = read(HOOK)
		expect(src).not.toMatch(/new WebSocket/)
	})
})

describe('pointermove coalescing — one send per animation frame, latest wins (T-367-04 client half)', () => {
	it('schedules sends via requestAnimationFrame and cancels the pending frame on teardown', () => {
		const src = read(HOOK)
		expect(src).toMatch(/requestAnimationFrame/)
		expect(src).toMatch(/cancelAnimationFrame/)
	})
})

describe('the guest owns right-click and scroll — preventDefault wiring', () => {
	it('handles contextmenu and wheel, each preventDefault-ed', () => {
		const src = read(HOOK)
		expect(src).toMatch(/'contextmenu'/)
		expect(src).toMatch(/'wheel'/)
		const pd = src.match(/preventDefault\(\)/g) ?? []
		expect(pd.length).toBeGreaterThanOrEqual(2)
	})
	it('registers wheel with passive: false (preventDefault is a no-op on a passive listener)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/passive:\s*false/)
	})
})

describe('pointerdown captures the pointer and focuses the container (Pitfall 7)', () => {
	it('calls setPointerCapture and .focus() on pointerdown', () => {
		const src = read(HOOK)
		expect(src).toMatch(/setPointerCapture/)
		expect(src).toMatch(/\.focus\(\)/)
	})
})

describe('release events force clamp semantics — a release outside the content must still reach the guest (CR-01)', () => {
	it('pointerup/pointercancel send with the release flag (e.buttons is already 0 on release)', () => {
		const src = read(HOOK)
		const releases = src.match(/sendPointer\(e\.clientX, e\.clientY, e\.buttons, true\)/g) ?? []
		expect(releases.length).toBeGreaterThanOrEqual(2)
	})
	it('the release flag flows into mapPointerToGuest as forceClamp', () => {
		const src = read(HOOK)
		expect(src).toMatch(/forceClamp/)
	})
})

describe('down/up/cancel drop any coalesced pending move — no stale-mask flush after an immediate send (WR-01)', () => {
	it('defines dropPendingMove (cancelAnimationFrame + pendingMove reset) and calls it in all three handlers', () => {
		const src = read(HOOK)
		expect(src).toMatch(/const dropPendingMove = /)
		const calls = src.match(/dropPendingMove\(\)/g) ?? []
		expect(calls.length).toBeGreaterThanOrEqual(3)
	})
})

describe("wheel carries the held-button mask — scrolling mid-drag must not release the drag (WR-02)", () => {
	it("the {t:'w'} send includes b: domButtonsToRfbMask(e.buttons)", () => {
		const src = read(HOOK)
		expect(src).toMatch(/t: 'w'[^}]*b: domButtonsToRfbMask\(e\.buttons\)/)
	})
})

describe('same-page focus loss releases held keys — focusout cycles ungrab()/grab() (WR-03)', () => {
	// The noVNC Keyboard class wires _allKeysUp to WINDOW blur only; LivOS is a same-page
	// multi-window desktop, so element-level focus loss must also release held modifiers.
	it('registers a focusout listener that cycles the keyboard (ungrab then grab)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/'focusout'/)
		expect(src).toMatch(/ungrab\(\)[\s\S]{0,120}\.grab\(\)/)
	})
})

describe('structure — AbortController listeners + the shared pure helpers', () => {
	it('attaches listeners with an AbortController signal (the use-vm-encoded-screen idiom)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/new AbortController\(\)/)
		expect(src).toMatch(/signal:\s*ac\.signal/)
	})
	it('consumes mapPointerToGuest + domButtonsToRfbMask (no inline duplicate math)', () => {
		const src = read(HOOK)
		expect(src).toMatch(/mapPointerToGuest/)
		expect(src).toMatch(/domButtonsToRfbMask/)
	})
})
