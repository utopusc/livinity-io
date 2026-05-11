// Phase 101-08 Task 3 — WebAppTeachPopupHost (v3 popover-driven).
//
// REPLACES the Phase 100-09-06 Sonner-toast emission flow with the
// SelfClaude action-driven pattern:
//   - Subscribe to the recorder's `onAfterClick({x, y, button})` via
//     setOnAfterClick (Phase 101-08 recorder API).
//   - On callback, ENQUEUE a PendingStep {x, y, draftId}.
//   - Render the head of the queue via <TeachPopover>. Only ONE popover
//     visible at a time — rapid clicks accumulate FIFO (D-101-TEACH-V3
//     risk 3 mitigation).
//   - On Save (onCommit), call `recorder.pushNote(instruction)` → writes
//     a NoteStep into the v3 action log. ADVANCE the queue.
//   - On Cancel, just ADVANCE the queue (no NoteStep written).
//
// Props: legacy `events` + `eventCount` are kept for backwards-compat with
// existing call sites in webapp-stream-window.tsx (no rewire needed). They
// are unused in the new flow — the recorder callback is the canonical
// trigger.
//
// `recorder` prop is the v3 useTeachRecorder result (or shaped fake for
// tests). It is OPTIONAL at the type level for backwards-compat with the
// legacy callers that didn't pass it; when absent the host is a no-op
// pass-through (returns null, no popover).
//
// Sacred SHA: sdk-agent-runner.ts unchanged.

import {useCallback, useEffect, useRef, useState} from 'react'

import type {UseTeachRecorderResult} from '@/hooks/use-teach-recorder'

import {TeachPopover, type PendingStep} from '../teach-popover'

// Legacy ActionEvent shape kept on props for caller compat; no longer used
// by the body. v33-cleanup target: drop these props in a future plan.
import type {ActionEvent} from '@/hooks/use-teach-recorder'

export interface WebAppTeachPopupHostProps {
	isRecording: boolean
	/** @deprecated v3 popover host listens to recorder.onAfterClick instead. */
	events?: readonly ActionEvent[]
	/** @deprecated v3 popover host listens to recorder.onAfterClick instead. */
	eventCount?: number
	/** v3 recorder — provides setOnAfterClick + pushNote. */
	recorder?: Pick<UseTeachRecorderResult, 'setOnAfterClick' | 'pushNote'>
}

// Module-level monotonic counter — falls back when crypto.randomUUID is
// missing. Prefix kept short so the draftId stays compact in React keys.
let __draftSeq = 0
function randomDraftId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	__draftSeq += 1
	return `d-${__draftSeq}-${Math.random().toString(16).slice(2)}`
}

export function WebAppTeachPopupHost({
	isRecording,
	recorder,
}: WebAppTeachPopupHostProps) {
	// FIFO queue of pending steps awaiting user instruction.
	const [queue, setQueue] = useState<PendingStep[]>([])
	// Stable ref so the subscription callback (registered once) sees the
	// latest setter without re-running the effect on every queue change.
	const queueRef = useRef<PendingStep[]>([])
	queueRef.current = queue

	// Subscribe to recorder.onAfterClick when recording. Unsubscribe on
	// stop or unmount.
	useEffect(() => {
		if (!recorder?.setOnAfterClick) return
		if (!isRecording) {
			recorder.setOnAfterClick(null)
			return
		}
		recorder.setOnAfterClick(({x, y}) => {
			// Enqueue at the tail; head is rendered.
			setQueue((prev) => [...prev, {x, y, draftId: randomDraftId()}])
		})
		return () => {
			recorder.setOnAfterClick(null)
		}
	}, [recorder, isRecording])

	// Clear the queue when recording stops (covers stop + unmount cleanup
	// via the effect above's deps).
	useEffect(() => {
		if (!isRecording) {
			setQueue([])
		}
	}, [isRecording])

	const head: PendingStep | null = queue.length > 0 ? queue[0]! : null

	const advance = useCallback(() => {
		setQueue((prev) => prev.slice(1))
	}, [])

	const handleCommit = useCallback(
		(instruction: string) => {
			if (recorder?.pushNote) {
				recorder.pushNote(instruction)
			}
			advance()
		},
		[recorder, advance],
	)

	const handleCancel = useCallback(() => {
		advance()
	}, [advance])

	return <TeachPopover pendingStep={head} onCommit={handleCommit} onCancel={handleCancel} />
}

export default WebAppTeachPopupHost
