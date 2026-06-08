// Phase 260.2 — useTopDockReveal (drag-reveal hysteresis controller).
//
// While a VNC/stream window is being dragged, the navbar must NOT vanish the
// instant the drag starts (R2-B). It only swaps to the displays strip when the
// dragged window is brought UP into the top "dock zone". To kill the flicker
// that plagued 260.1 (the surface swapping rapidly as the cursor hovered the
// boundary), we use HYSTERESIS: enter the zone at a higher line, leave it at a
// lower line, so the boundary is a band, not a hair-trigger.
//
//   reveal flips true  when pointerY < ENTER_Y (96)
//   reveal flips false when pointerY > LEAVE_Y (150)
//   between 96–150 → unchanged (the dead-band)
//
// Reusable in the real desktop container AND the harness — the caller feeds it
// the live pointer Y from the dragged window's onDrag (PanInfo.point.y) and
// calls reset() on drag end. See .planning/phases/260.2-.../CONTEXT.md §2/§4.

import {useCallback, useRef, useState} from 'react'

export const DOCK_ENTER_Y = 96
export const DOCK_LEAVE_Y = 150

export function useTopDockReveal() {
	const [reveal, setReveal] = useState(false)
	// Mirror in a ref so a drag-end handler can read the latest value
	// synchronously (to decide dock-vs-cancel) without a stale closure.
	const revealRef = useRef(false)

	const update = useCallback((pointerY: number) => {
		setReveal((prev) => {
			let next = prev
			if (!prev && pointerY < DOCK_ENTER_Y) next = true
			else if (prev && pointerY > DOCK_LEAVE_Y) next = false
			revealRef.current = next
			return next
		})
	}, [])

	const reset = useCallback(() => {
		revealRef.current = false
		setReveal(false)
	}, [])

	return {
		/** True while the dragged window is in the top dock zone. */
		reveal,
		/** Read the latest reveal value synchronously (for drag-end decisions). */
		isRevealed: () => revealRef.current,
		/** Feed the live pointer Y during a drag (e.g. PanInfo.point.y). */
		update,
		/** Call on drag end / cancel. */
		reset,
	}
}
