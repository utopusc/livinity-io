// Phase 367-02 (VMENC-03, UI half) — pure pointer-coordinate + button-mask
// helpers for the encoded VM view's input capture.
//
// DOM-FREE ON PURPOSE (the parse-avc-codec precedent): this file imports no
// `window`/`document`/event types — it is a plain data transform (client
// pixel coordinates + DOM button bits in, guest framebuffer coordinates + RFB
// mask out) so it can be tested BEHAVIORALLY (exact numbers in, exact numbers
// out). The DOM lifecycle (listeners, pointer capture, rAF coalescing, the
// noVNC Keyboard class) lives in use-vm-input.ts and is covered by
// source-regex pins only.
//
// The wire type mirrors the server's vm-input.ts (367-01) field-for-field —
// the server re-validates and clamps every field (parseVmInput + the session
// dims clamp in sendVmInput); everything here is client-side correctness +
// defense-in-depth, never the trust boundary (T-367-05).

/**
 * A client→server input frame for the /ws/vm-stream socket — matches the
 * backend's `VmInputMessage` (livinityd vm-input.ts) shape field-for-field:
 *   {t:'p', x, y, b}   pointer — guest coords + 5-bit RFB button mask
 *   {t:'k', k, d}      key     — X11 keysym (u32) + down flag (0|1)
 *   {t:'w', x, y, dy}  wheel   — guest coords + direction (±1)
 */
export type VmInputMessage =
	| {t: 'p'; x: number; y: number; b: number}
	| {t: 'k'; k: number; d: 0 | 1}
	| {t: 'w'; x: number; y: number; dy: -1 | 1}

/**
 * DOM `MouseEvent.buttons` → RFB pointer mask (Pitfall 1). The two encodings
 * agree on left (bit0) but SWAP the other two:
 *   DOM: left=1, RIGHT=2, MIDDLE=4
 *   RFB: left=bit0(1), MIDDLE=bit1(2), RIGHT=bit2(4)
 * Extra DOM bits (back=8, forward=16, eraser=32) have no RFB slot in the
 * 3-button mask and are DROPPED, never misrouted. Output is always 0..7.
 */
export function domButtonsToRfbMask(domButtons: number): number {
	return (domButtons & 1) | ((domButtons & 4) >> 1) | ((domButtons & 2) << 1)
}

/**
 * Map a client (viewport) pointer position to guest framebuffer coordinates
 * through the `object-contain` letterbox of the encoded <video> (Pitfall 5).
 *
 * The rendered content rect is centered inside the element rect at
 * scale = min(rectW/videoW, rectH/videoH); the bars around it belong to the
 * browser, not the guest:
 *  - no frame yet (videoW/videoH 0) → null (nothing to map onto);
 *  - a pure HOVER in a bar (no buttons held) → null (drop — the guest cursor
 *    must not chase letterbox mouse travel);
 *  - a bar position with buttons HELD → clamped into range (drag-out
 *    semantics: releasing a drag outside the content must not lose the drag).
 * Non-null outputs are always integers in 0..videoW-1 / 0..videoH-1 (round +
 * clamp at the edges); the server clamp remains authoritative (T-367-05).
 */
export function mapPointerToGuest(args: {
	rectLeft: number
	rectTop: number
	rectW: number
	rectH: number
	videoW: number
	videoH: number
	clientX: number
	clientY: number
	buttonsHeld: boolean
}): {x: number; y: number} | null {
	const {rectLeft, rectTop, rectW, rectH, videoW, videoH, clientX, clientY, buttonsHeld} = args
	if (videoW <= 0 || videoH <= 0 || rectW <= 0 || rectH <= 0) return null
	const scale = Math.min(rectW / videoW, rectH / videoH)
	const contentW = videoW * scale
	const contentH = videoH * scale
	const offX = (rectW - contentW) / 2
	const offY = (rectH - contentH) / 2
	const px = clientX - rectLeft - offX
	const py = clientY - rectTop - offY
	if (!buttonsHeld && (px < 0 || px > contentW || py < 0 || py > contentH)) return null
	const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max)
	return {
		x: clamp(Math.round(px / scale), videoW - 1),
		y: clamp(Math.round(py / scale), videoH - 1),
	}
}
