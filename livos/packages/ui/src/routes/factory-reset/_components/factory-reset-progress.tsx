// Phase 38 Plan 04 — BarePage overlay that takes over after the user confirms
// the modal. Polls listUpdateHistory every 2s, picks the latest factory-reset
// event, derives display state via the pure helpers, and fans out:
//
//   - status:in-progress          -> ProgressLayout with state-derived label
//   - status:success+preserve:T   -> window.location.href = '/login'
//   - status:success+preserve:F   -> window.location.href = '/onboarding'
//   - status:failed               -> <FactoryResetErrorPage event={...} />
//   - status:rolled-back          -> <FactoryResetRecoveryPage event={...} />
//
// Connection-failure handling (D-OV-04):
//   - listUpdateHistory throws -> retain lastEvent, show "Reconnecting to LivOS…"
//   - 90s of consecutive failures -> show manual-recovery hint (no redirect)
//
// All decision logic lives in pure lib helpers (Plan 04 Task 1) — this
// component is thin wiring + render-fan-out.

import {useEffect, useRef, useState} from 'react'

import {computePollingDisplayState} from '@/features/factory-reset/lib/polling-state'
import {selectLatestFactoryResetEvent} from '@/features/factory-reset/lib/select-latest-event'
import {selectPostResetRoute} from '@/features/factory-reset/lib/post-reset-redirect'
import type {FactoryResetEvent} from '@/features/factory-reset/lib/types'
import {BarePage} from '@/layouts/bare/bare-page'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {FactoryResetErrorPage} from './factory-reset-error-page'
import {FactoryResetRecoveryPage} from './factory-reset-recovery-page'

const POLL_INTERVAL_MS = 2_000

export function FactoryResetProgress() {
	const historyQ = trpcReact.system.listUpdateHistory.useQuery(
		{limit: 10},
		{
			// D-OV-04 polling cadence
			refetchInterval: POLL_INTERVAL_MS,
			refetchOnWindowFocus: false,
			retry: false,
			// Keep prev data visible while errored so the UI can show the last-
			// known status during the brief livinityd-restart window between
			// wipe-end and reinstall-start (D-OV-04 / specifics #2).
			staleTime: POLL_INTERVAL_MS,
		},
	)

	const [lastKnownEvent, setLastKnownEvent] = useState<FactoryResetEvent | null>(null)
	const failureStartRef = useRef<number | null>(null)
	const [consecutiveFailureMs, setConsecutiveFailureMs] = useState(0)

	// Track query state -> derive lastKnownEvent + failure window.
	useEffect(() => {
		if (historyQ.isError) {
			// Failure: start the failure clock; re-render every second so the
			// 90s threshold can fire even if listUpdateHistory never recovers.
			if (failureStartRef.current === null) {
				failureStartRef.current = Date.now()
				setConsecutiveFailureMs(0)
			}
			const tick = setInterval(() => {
				if (failureStartRef.current !== null) {
					setConsecutiveFailureMs(Date.now() - failureStartRef.current)
				}
			}, 1_000)
			return () => clearInterval(tick)
		}
		// Success: reset the failure clock + capture the latest event.
		failureStartRef.current = null
		setConsecutiveFailureMs(0)
		if (historyQ.data) {
			const latest = selectLatestFactoryResetEvent(historyQ.data)
			if (latest) setLastKnownEvent(latest)
		}
	}, [historyQ.isError, historyQ.data])

	// Post-reset redirect (D-RT-01).
	useEffect(() => {
		const route = selectPostResetRoute(lastKnownEvent)
		if (route === 'stay') return
		// Hard navigation — the bash has reinstalled livinityd; we want a fresh
		// page load to clear all in-memory state (auth tokens, cached queries).
		window.location.href = route
	}, [lastKnownEvent])

	// Render fan-out: failed / rolled-back render their own pages so the user
	// must consciously read the result (D-RT-02 / D-RT-03 — no auto-redirect).
	if (lastKnownEvent?.status === 'failed') {
		return <FactoryResetErrorPage event={lastKnownEvent} />
	}
	if (lastKnownEvent?.status === 'rolled-back') {
		return <FactoryResetRecoveryPage event={lastKnownEvent} />
	}

	// In-progress / unknown — render the BarePage progress overlay.
	const display = computePollingDisplayState({
		lastEvent: lastKnownEvent,
		queryFailing: historyQ.isError,
		consecutiveFailureMs,
	})

	const message = display.label + (display.hint ? ` — ${display.hint}` : '')

	return (
		<BarePage>
			<ProgressLayout
				title={t('factory-reset.modal.heading')}
				callout={t('factory-reset.progress.callout')}
				progress={undefined} // indeterminate — bash doesn't emit % progress
				message={message}
				isRunning={display.mode === 'live' || display.mode === 'reconnecting'}
			/>
		</BarePage>
	)
}
