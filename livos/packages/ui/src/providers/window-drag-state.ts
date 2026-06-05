import {useEffect, useState} from 'react'

/**
 * Tiny external-store for "is a window currently being dragged".
 *
 * Why this exists (Phase 130-08): the TopBar drop-zone shelf wants to
 * expand the moment the user picks up a window and starts moving it,
 * collapse when the drag ends, and pin the window if the drop landed
 * inside the shelf. Windows are dragged via a hand-rolled mousedown /
 * mousemove / mouseup chain in `modules/window/window.tsx` — they do
 * NOT use HTML5 drag-and-drop, so there is no global `dragstart` /
 * `dragend` event to listen for.
 *
 * Rather than refactor the window drag into HTML5 DnD (which would
 * regress the smooth-motion + cursor-grabbing UX), this module gives
 * the window code a single setter to call on drag start / end. Any
 * subscriber (e.g. the TopBar) can read the state via the hook.
 *
 * No external dependency — a 30-line implementation beats pulling in
 * Zustand for one shared boolean.
 */

export type WindowDragState = {
	isDragging: boolean
	windowId?: string
}

let currentState: WindowDragState = {isDragging: false}
let listeners: Array<(state: WindowDragState) => void> = []

export function setWindowDragState(next: WindowDragState) {
	currentState = next
	for (const l of listeners) l(next)
}

export function getWindowDragState(): WindowDragState {
	return currentState
}

export function useWindowDragState(): WindowDragState {
	const [state, setState] = useState<WindowDragState>(currentState)
	useEffect(() => {
		const sub = (next: WindowDragState) => setState(next)
		listeners.push(sub)
		// Sync immediately in case state changed between render + effect.
		setState(currentState)
		return () => {
			listeners = listeners.filter((l) => l !== sub)
		}
	}, [])
	return state
}

// ── Drop event channel ──────────────────────────────────────────────
// Fires once on mouseup with the cursor position + windowId. Drop-zone
// subscribers (TopBar shelf) hit-test the cursor against their bounding
// rect and pin the window if it lands inside.

export type WindowDragDropEvent = {
	clientX: number
	clientY: number
	windowId: string
}

let dropListeners: Array<(e: WindowDragDropEvent) => void> = []

export function emitWindowDragDrop(event: WindowDragDropEvent) {
	for (const l of dropListeners) l(event)
}

export function onWindowDragDrop(listener: (e: WindowDragDropEvent) => void): () => void {
	dropListeners.push(listener)
	return () => {
		dropListeners = dropListeners.filter((l) => l !== listener)
	}
}

// ── Displays-button rect channel (Phase 260-03 / SC4) ───────────────
// The TopBar publishes the LIVE center coordinates of the Displays/Monitor
// button here (on mount + on window resize). window.tsx reads them so the
// pin "shrink-to-chip" morph lands ON the Displays button (slide-RIGHT into
// it) instead of the old hard-coded navbar center. A plain module-scope
// value (no subscription needed): window.tsx reads it lazily at render time
// for the animation target and falls back gracefully when it's null.

export type DisplaysButtonRect = {x: number; y: number}

let displaysButtonRect: DisplaysButtonRect | null = null

export function setDisplaysButtonRect(rect: DisplaysButtonRect | null) {
	displaysButtonRect = rect
}

export function getDisplaysButtonRect(): DisplaysButtonRect | null {
	return displaysButtonRect
}
