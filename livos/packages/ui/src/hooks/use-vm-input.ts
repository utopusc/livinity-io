// Phase 367-02 (VMENC-03, UI half) — useVmInput: pointer/keyboard/wheel
// capture for the encoded VM view, feeding {t:'p'|'k'|'w'} frames into the
// provided sendInput (the 365 hook's OWN /ws/vm-stream socket — this hook
// opens NO socket of its own; the multiplex invariant is pinned).
//
// PARALLEL TO, NOT REUSING, use-webapp-vnc.ts (VMENC-RESEARCH §6): there the
// noVNC RFB class owns capture + the RFB protocol end-to-end; here the video
// arrives via MSE and only the INPUT half is needed — so we capture events
// ourselves, map coordinates through the object-contain letterbox
// (vm-input-coords.ts, behaviorally tested), and borrow ONLY the noVNC
// `Keyboard` class (already an installed dependency) for KeyboardEvent→keysym
// derivation: AltGr sequences, OS key-repeat suppression, and
// release-all-held-keys on WINDOW blur. The class watches window blur ONLY —
// LivOS is a same-page multi-window desktop, so element-level focus loss
// (clicking another in-page window) is covered separately by a focusout
// ungrab()/grab() cycle below (Pitfall 4 / review WR-03 — focus loss must
// never leave a stuck modifier in the guest).
//
// Controller model (documented, per 367-01): any-admin, last-write-wins —
// every admitted viewer relays onto the one shared RFB connection; N viewers
// interleave exactly like N USB keyboards. No arbitration built (out of v51).
//
// Flood posture (T-367-04, client half): pointermove is coalesced to ONE send
// per requestAnimationFrame (latest wins). The server token bucket is the
// enforcement; this just keeps a well-behaved client well-behaved.

import {useEffect, useRef} from 'react'

import {domButtonsToRfbMask, mapPointerToGuest, type VmInputMessage} from '@/utils/vm-input-coords'

/** The subset of the noVNC Keyboard class this hook drives (untyped upstream). */
interface NoVncKeyboard {
	onkeyevent: ((keysym: number, code: string, down: boolean) => void) | null
	grab: () => void
	ungrab: () => void
}

/**
 * Capture pointer/keyboard/wheel on `containerRef` (a focusable wrapper
 * around the encoded <video>) and relay them via `sendInput`. Everything is
 * dead while `enabled` is false — the consumer gates on
 * `status === 'connected'`, so input can never flow into a surface not
 * genuinely presented as live.
 */
export function useVmInput({
	containerRef,
	videoRef,
	sendInput,
	enabled,
}: {
	containerRef: React.RefObject<HTMLDivElement>
	videoRef: React.RefObject<HTMLVideoElement>
	sendInput: (msg: VmInputMessage) => void
	enabled: boolean
}) {
	// Stash the callback in a ref so the capture effect never re-runs (and
	// never re-grabs the keyboard) on a mere identity change (the
	// use-vm-encoded-screen mutation-in-ref idiom).
	const sendInputRef = useRef(sendInput)
	useEffect(() => {
		sendInputRef.current = sendInput
	}, [sendInput])

	useEffect(() => {
		if (!enabled) return
		const containerEl = containerRef.current
		const videoEl = videoRef.current
		if (!containerEl || !videoEl) return

		const ac = new AbortController()
		let cancelled = false
		let kbd: NoVncKeyboard | null = null
		let rafId: number | null = null
		let pendingMove: {clientX: number; clientY: number; buttons: number} | null = null

		// Map a client point through the <video>'s object-contain letterbox to
		// guest coords; null = drop (bar hover / no frame yet). The rect is read
		// per event — cheap, and immune to window/layout moves. `forceClamp`
		// (CR-01): release events must NEVER be dropped — `e.buttons` is already
		// 0 on pointerup/pointercancel, so without it a release over a letterbox
		// bar (or outside the element — pointer capture keeps events coming)
		// would be swallowed and the guest would keep the button held.
		const toGuest = (clientX: number, clientY: number, domButtons: number, forceClamp = false) => {
			const rect = videoEl.getBoundingClientRect()
			return mapPointerToGuest({
				rectLeft: rect.left,
				rectTop: rect.top,
				rectW: rect.width,
				rectH: rect.height,
				videoW: videoEl.videoWidth,
				videoH: videoEl.videoHeight,
				clientX,
				clientY,
				buttonsHeld: domButtons !== 0,
				forceClamp,
			})
		}

		const sendPointer = (clientX: number, clientY: number, domButtons: number, isRelease = false) => {
			const pt = toGuest(clientX, clientY, domButtons, isRelease)
			if (!pt) return
			sendInputRef.current({t: 'p', x: pt.x, y: pt.y, b: domButtonsToRfbMask(domButtons)})
		}

		// WR-01: down/up/cancel are sent IMMEDIATELY while moves are rAF-deferred
		// — an already-queued move flushing AFTER the immediate send would replay
		// a STALE button mask (phantom re-press after a release / phantom release
		// after a press). Drop the pending move (never flush it — the immediate
		// event carries fresher coordinates AND the authoritative mask).
		const dropPendingMove = () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId)
				rafId = null
			}
			pendingMove = null
		}

		// pointerdown: capture the pointer (drag-out keeps streaming events to
		// us — the clamp-on-drag semantics in mapPointerToGuest depend on it)
		// and FOCUS the wrapper (Pitfall 7 — without focus, key events never
		// reach the Keyboard target), then send the pressed mask.
		containerEl.addEventListener(
			'pointerdown',
			(e) => {
				dropPendingMove() // WR-01: a stale queued move must not flush after the press
				try {
					containerEl.setPointerCapture(e.pointerId)
				} catch {
					/* capture can fail on exotic pointer types — clicks still work */
				}
				containerEl.focus()
				sendPointer(e.clientX, e.clientY, e.buttons)
			},
			{signal: ac.signal},
		)

		// pointermove: coalesce to ONE send per animation frame, latest wins —
		// a 1 kHz gaming mouse must not turn into 1000 WS frames/sec (the
		// client half of T-367-04; the server bucket is the enforcement).
		containerEl.addEventListener(
			'pointermove',
			(e) => {
				pendingMove = {clientX: e.clientX, clientY: e.clientY, buttons: e.buttons}
				if (rafId !== null) return
				rafId = requestAnimationFrame(() => {
					rafId = null
					const m = pendingMove
					pendingMove = null
					if (m) sendPointer(m.clientX, m.clientY, m.buttons)
				})
			},
			{signal: ac.signal},
		)

		// pointerup / pointercancel: send the remaining (released) mask so the
		// guest never keeps a phantom held button. The release flag (CR-01)
		// forces clamp semantics — e.buttons is already 0 here, and a dropped
		// release would leave the guest dragging forever. dropPendingMove first
		// (WR-01): a queued move with the pre-release mask must not flush after
		// the release and re-press the button.
		containerEl.addEventListener(
			'pointerup',
			(e) => {
				dropPendingMove()
				sendPointer(e.clientX, e.clientY, e.buttons, true)
			},
			{signal: ac.signal},
		)
		containerEl.addEventListener(
			'pointercancel',
			(e) => {
				dropPendingMove()
				sendPointer(e.clientX, e.clientY, e.buttons, true)
			},
			{signal: ac.signal},
		)

		// Right-click belongs to the guest, not the browser menu.
		containerEl.addEventListener(
			'contextmenu',
			(e) => {
				e.preventDefault()
			},
			{signal: ac.signal},
		)

		// Wheel: direction pulses ({t:'w'} → a server-side press+release of RFB
		// buttons 4/5) CARRYING the held-button mask (WR-02: the server ORs it
		// into both pulse masks — scrolling mid-drag must not release the drag).
		// preventDefault needs passive: false or the page scrolls behind the guest.
		containerEl.addEventListener(
			'wheel',
			(e) => {
				e.preventDefault()
				if (e.deltaY === 0) return
				const pt = toGuest(e.clientX, e.clientY, e.buttons)
				if (!pt) return
				sendInputRef.current({
					t: 'w',
					x: pt.x,
					y: pt.y,
					dy: Math.sign(e.deltaY) as 1 | -1,
					b: domButtonsToRfbMask(e.buttons),
				})
			},
			{signal: ac.signal, passive: false},
		)

		// Keyboard: the noVNC Keyboard class (already installed — zero new
		// deps) handles KeyboardEvent→keysym, AltGr sequences, key repeat, and
		// releases all held keys on WINDOW blur (its _allKeysUp is wired to
		// window blur ONLY — the same-page focus-loss case is the focusout
		// cycle below). Dynamic import with a cancelled-flag guard: `enabled`
		// may flip during the await.
		void (async () => {
			// @ts-expect-error — no bundled types (the use-webapp-vnc loadRfbCtor idiom)
			const mod = await import('@novnc/novnc/lib/input/keyboard')
			if (cancelled) return
			const KeyboardCtor = (mod && (mod.default ?? mod)) as new (target: Element) => NoVncKeyboard
			const k = new KeyboardCtor(containerEl)
			k.onkeyevent = (keysym: number, _code: string, down: boolean) => {
				// The class can emit a null/0 keysym for keys it cannot map — the
				// wire requires k >= 1 (a zero would be a server-side strike).
				if (!keysym) return
				sendInputRef.current({t: 'k', k: keysym, d: down ? 1 : 0})
			}
			k.grab()
			kbd = k
		})()

		// WR-03: same-page focus loss (clicking another in-page window / the
		// dock / the escape-hatch strip) blurs the WRAPPER, not the window — the
		// Keyboard class's window-blur release never fires, so a held Alt/Ctrl/
		// Shift would stick in the guest. Cycle ungrab()/grab(): ungrab() runs
		// _allKeysUp() (the socket is still OPEN, so the key-up frames reach the
		// guest), grab() re-arms capture for the next focus.
		containerEl.addEventListener(
			'focusout',
			() => {
				try {
					kbd?.ungrab()
					kbd?.grab()
				} catch {
					/* best-effort — a detached target must not throw */
				}
			},
			{signal: ac.signal},
		)

		return () => {
			cancelled = true
			ac.abort()
			if (rafId !== null) {
				cancelAnimationFrame(rafId)
				rafId = null
			}
			pendingMove = null
			try {
				kbd?.ungrab()
			} catch {
				/* best-effort — ungrab of a detached target must not throw */
			}
			kbd = null
		}
	}, [enabled, containerRef, videoRef])
}
