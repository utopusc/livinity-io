// Phase 367-02 (VMENC-03, UI half) — REAL behavioral tests for the pure input
// helpers (the parse-avc-codec split rule: structural pins for DOM lifecycle,
// behavioral tests for pure logic). vm-input-coords.ts is DOM-free on purpose —
// exact coordinates in, exact guest coordinates out — so a subtly-wrong
// letterbox division or a swapped RFB button bit is caught HERE, where a
// source-regex pin cannot.
//
// The two correctness stakes:
//  - Pitfall 1: DOM MouseEvent.buttons (left=1, RIGHT=2, MIDDLE=4) vs the RFB
//    pointer mask (left=bit0, MIDDLE=bit1, RIGHT=bit2) — a naive passthrough
//    swaps right/middle clicks in the guest.
//  - Pitfall 5: the <video> is object-contain — clicks land in letterbox bars;
//    pure hovers there are DROPPED (null), held-button drags CLAMP into the
//    guest range (drag-out semantics), and every non-null output is an integer
//    inside 0..videoW-1 / 0..videoH-1 (the server clamp stays authoritative —
//    this is defense-in-depth, T-367-05).

import {describe, expect, it} from 'vitest'

import {domButtonsToRfbMask, mapPointerToGuest} from './vm-input-coords'

describe('domButtonsToRfbMask — DOM buttons → RFB pointer mask (Pitfall 1)', () => {
	it('maps no-buttons and left verbatim (bit0 is shared)', () => {
		expect(domButtonsToRfbMask(0)).toBe(0)
		expect(domButtonsToRfbMask(1)).toBe(1)
	})
	it('swaps DOM right (2) to RFB bit2 (4)', () => {
		expect(domButtonsToRfbMask(2)).toBe(4)
	})
	it('swaps DOM middle (4) to RFB bit1 (2)', () => {
		expect(domButtonsToRfbMask(4)).toBe(2)
	})
	it('combines held buttons correctly (left+right, all three)', () => {
		expect(domButtonsToRfbMask(3)).toBe(5) // left + right → bit0 + bit2
		expect(domButtonsToRfbMask(7)).toBe(7) // all three → bits 0..2
	})
	it('drops extra DOM bits (back=8, forward=16) instead of misrouting them', () => {
		expect(domButtonsToRfbMask(8)).toBe(0)
		expect(domButtonsToRfbMask(16)).toBe(0)
		expect(domButtonsToRfbMask(9)).toBe(1) // left + back → left only
	})
	it('stays within 0..7 for ANY DOM buttons value', () => {
		for (let dom = 0; dom <= 31; dom++) {
			const mask = domButtonsToRfbMask(dom)
			expect(mask).toBeGreaterThanOrEqual(0)
			expect(mask).toBeLessThanOrEqual(7)
			expect(Number.isInteger(mask)).toBe(true)
		}
	})
})

describe('mapPointerToGuest — exact fit (rect 1280×720, video 1280×720)', () => {
	const base = {
		rectLeft: 0,
		rectTop: 0,
		rectW: 1280,
		rectH: 720,
		videoW: 1280,
		videoH: 720,
		buttonsHeld: false,
	}
	it('maps the origin corner to (0,0)', () => {
		expect(mapPointerToGuest({...base, clientX: 0, clientY: 0})).toEqual({x: 0, y: 0})
	})
	it('maps the far corner to (1279,719) — round+clamp at the edge, never (1280,720)', () => {
		expect(mapPointerToGuest({...base, clientX: 1280, clientY: 720})).toEqual({x: 1279, y: 719})
	})
})

describe('mapPointerToGuest — letterboxed (rect 1280×720, video 640×480 → scale 1.5, offX 160)', () => {
	const base = {
		rectLeft: 0,
		rectTop: 0,
		rectW: 1280,
		rectH: 720,
		videoW: 640,
		videoH: 480,
		buttonsHeld: false,
	}
	it('maps the rect center to the video center', () => {
		expect(mapPointerToGuest({...base, clientX: 640, clientY: 360})).toEqual({x: 320, y: 240})
	})
	it('maps a click at the content edge (x=160) to gx 0', () => {
		expect(mapPointerToGuest({...base, clientX: 160, clientY: 360})?.x).toBe(0)
	})
	it('drops a bar HOVER (x < 160, no buttons) — null (Pitfall 5)', () => {
		expect(mapPointerToGuest({...base, clientX: 100, clientY: 360})).toBeNull()
	})
	it('CLAMPS the same bar point into range when buttons are held (drag-out semantics)', () => {
		expect(mapPointerToGuest({...base, clientX: 100, clientY: 360, buttonsHeld: true})).toEqual({x: 0, y: 240})
	})
})

describe('mapPointerToGuest — pillarboxed (rect 800×800, video 1280×720 → scale 0.625, offY 175)', () => {
	const base = {
		rectLeft: 0,
		rectTop: 0,
		rectW: 800,
		rectH: 800,
		videoW: 1280,
		videoH: 720,
		buttonsHeld: false,
	}
	it('maps the rect center to the video center (symmetric offY)', () => {
		expect(mapPointerToGuest({...base, clientX: 400, clientY: 400})).toEqual({x: 640, y: 360})
	})
	it('drops a top-bar hover (y < 175) and clamps the same point on drag', () => {
		expect(mapPointerToGuest({...base, clientX: 400, clientY: 100})).toBeNull()
		expect(mapPointerToGuest({...base, clientX: 400, clientY: 100, buttonsHeld: true})).toEqual({x: 640, y: 0})
	})
})

describe('mapPointerToGuest — forceClamp: release events must NEVER be dropped (CR-01)', () => {
	// Per the Pointer Events spec, `e.buttons` on pointerup/pointercancel reflects the
	// state AFTER the release — 0 for a single-button drag. The release frame must still
	// reach the guest wherever the pointer is, or the guest keeps the button held forever.
	const base = {
		rectLeft: 0,
		rectTop: 0,
		rectW: 1280,
		rectH: 720,
		videoW: 640,
		videoH: 480,
		buttonsHeld: false,
	}
	it('a release in a letterbox bar (buttons already 0) CLAMPS instead of dropping', () => {
		expect(mapPointerToGuest({...base, clientX: 100, clientY: 360, forceClamp: true})).toEqual({x: 0, y: 240})
	})
	it('a release entirely outside the element clamps to the nearest content edge', () => {
		expect(mapPointerToGuest({...base, clientX: -50, clientY: 9999, forceClamp: true})).toEqual({x: 0, y: 479})
	})
	it('forceClamp does NOT resurrect the no-frame case (videoW/videoH 0 stays null)', () => {
		expect(mapPointerToGuest({...base, videoW: 0, videoH: 0, clientX: 100, clientY: 100, forceClamp: true})).toBeNull()
	})
	it('without forceClamp the bar hover still drops (the CR-01 fix must not break hover-drop)', () => {
		expect(mapPointerToGuest({...base, clientX: 100, clientY: 360})).toBeNull()
	})
})

describe('mapPointerToGuest — no frame yet / degenerate input', () => {
	it('returns null while the video has no frame (videoW/videoH 0)', () => {
		const base = {rectLeft: 0, rectTop: 0, rectW: 1280, rectH: 720, clientX: 100, clientY: 100, buttonsHeld: false}
		expect(mapPointerToGuest({...base, videoW: 0, videoH: 0})).toBeNull()
		expect(mapPointerToGuest({...base, videoW: 0, videoH: 720})).toBeNull()
		expect(mapPointerToGuest({...base, videoW: 1280, videoH: 0})).toBeNull()
	})
})

describe('mapPointerToGuest — property: non-null outputs are ALWAYS integers in range', () => {
	it('holds over a grid of sample points across three geometries, hover and drag', () => {
		const geometries = [
			{rectLeft: 0, rectTop: 0, rectW: 1280, rectH: 720, videoW: 1280, videoH: 720},
			{rectLeft: 10.5, rectTop: 20.25, rectW: 1280, rectH: 720, videoW: 640, videoH: 480},
			{rectLeft: 0, rectTop: 0, rectW: 800, rectH: 800, videoW: 1280, videoH: 720},
		]
		for (const g of geometries) {
			for (let ix = -2; ix <= 12; ix++) {
				for (let iy = -2; iy <= 12; iy++) {
					const clientX = g.rectLeft + (ix / 10) * g.rectW
					const clientY = g.rectTop + (iy / 10) * g.rectH
					for (const buttonsHeld of [false, true]) {
						const pt = mapPointerToGuest({...g, clientX, clientY, buttonsHeld})
						if (pt === null) continue
						expect(Number.isInteger(pt.x), `x not int at ${clientX},${clientY}`).toBe(true)
						expect(Number.isInteger(pt.y), `y not int at ${clientX},${clientY}`).toBe(true)
						expect(pt.x).toBeGreaterThanOrEqual(0)
						expect(pt.x).toBeLessThanOrEqual(g.videoW - 1)
						expect(pt.y).toBeGreaterThanOrEqual(0)
						expect(pt.y).toBeLessThanOrEqual(g.videoH - 1)
					}
				}
			}
		}
	})
})
