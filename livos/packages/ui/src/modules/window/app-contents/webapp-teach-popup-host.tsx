// Phase 100-09-06 — WebAppTeachPopupHost.
//
// V33-MULTI-09-06-TEACH-POPUP: replaces the Teach drawer's inline event
// list with transient toast popups, one per captured event. Per user
// intent (CONTEXT.md 09-06): "tiklandiginda panel acilmasin onun yerine
// Click yapildiktan sonra Pop up a yazsin step i".
//
// SelfClaude pattern reference: src/teach-recorder.js per-event toast
// at the top-right of the stream window, ~2s auto-dismiss.
//
// Subscription model: this component reads the recorder's events via
// the parent-injected props. The parent (webapp-stream-window.tsx)
// manages the recorder lifecycle and passes the latest event list +
// count to trigger toast emissions. The component itself is a pure
// side-effect (returns null) — toasts render via sonner's <Toaster/>
// mounted at the app root.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {useEffect, useRef} from 'react'
import {toast} from 'sonner'

import type {ActionEvent} from '@/hooks/use-teach-recorder'

export interface WebAppTeachPopupHostProps {
	isRecording: boolean
	events: readonly ActionEvent[]
	/** Monotonic counter — fires effect on each new event without deep-equality on `events`. */
	eventCount: number
}

function describeEvent(ev: ActionEvent, stepNumber: number): string {
	switch (ev.type) {
		case 'click':
			return `Step ${stepNumber}: Click at (${ev.coords.x}, ${ev.coords.y})`
		case 'key':
			return `Step ${stepNumber}: Key ${ev.key}`
		case 'wheel':
			return `Step ${stepNumber}: Wheel dy=${ev.dy}`
		case 'scroll':
			return `Step ${stepNumber}: Scroll dy=${ev.dy}`
		case 'wait':
			return `Step ${stepNumber}: Wait ${ev.durationMs}ms`
	}
}

export function WebAppTeachPopupHost({isRecording, events, eventCount}: WebAppTeachPopupHostProps) {
	const lastSeenCount = useRef(0)

	// Reset counter on recording start so a fresh session begins at Step 1.
	useEffect(() => {
		if (isRecording) lastSeenCount.current = 0
	}, [isRecording])

	// Fire toast per new event — slice from lastSeen → eventCount so back-to-back
	// captures (faster than React frame coalescing) all surface.
	useEffect(() => {
		if (!isRecording) return
		if (eventCount <= lastSeenCount.current) return
		const newEvents = events.slice(lastSeenCount.current, eventCount)
		for (let i = 0; i < newEvents.length; i++) {
			const stepNumber = lastSeenCount.current + i + 1
			const ev = newEvents[i]
			if (!ev) continue
			toast(describeEvent(ev, stepNumber), {
				duration: 2000,
				position: 'top-right',
			})
		}
		lastSeenCount.current = eventCount
	}, [isRecording, events, eventCount])

	return null
}

export default WebAppTeachPopupHost
