/**
 * Phase 76 Plan 76-05 — `useTourState` state-machine hook.
 *
 * Self-contained tour controller. Mirrors the canonical
 * `install-prompt-banner.tsx:19,42` localStorage init pattern
 * (`useState(() => localStorage.getItem(KEY) === '1')`) for first-paint-clean
 * visibility resolution.
 *
 * D-NO-NEW-DEPS — pure React + window.localStorage. No reducer libs.
 *
 * Contract:
 *   - `currentStepIndex` increments via `next()`, decrements via `back()`
 *     (clamped at 0).
 *   - `next()` past last step calls `finish()`.
 *   - `skip()` and `finish()` both set the persistence flag and hide.
 *   - `isVisible` drives the wrapping component's null-render decision; while
 *     visible, `currentStep` is `steps[currentStepIndex] ?? null`.
 *   - Re-mounting the consumer re-reads localStorage (init lambda).
 *
 * SSR guard included for completeness — UI is a Vite SPA so `window` is
 * always defined in production, but tests / future SSR shouldn't crash.
 */

import {useCallback, useState} from 'react'

import {LIV_TOUR_STEPS, type LivTourStep} from './liv-tour-steps'

export const DEFAULT_STORAGE_KEY = 'liv-tour-completed'

export type TourState = {
	currentStepIndex: number
	currentStep: LivTourStep | null
	isVisible: boolean
	totalSteps: number
	next: () => void
	back: () => void
	skip: () => void
	finish: () => void
}

export type UseTourStateOptions = {
	storageKey?: string
	steps?: LivTourStep[]
	onComplete?: () => void
}

function readPersistedFlag(storageKey: string): boolean {
	if (typeof window === 'undefined') return false
	try {
		return window.localStorage.getItem(storageKey) === '1'
	} catch {
		// localStorage may throw in private-browsing modes — treat as "not completed".
		return false
	}
}

function writePersistedFlag(storageKey: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(storageKey, '1')
	} catch {
		/* ignore — non-fatal */
	}
}

export function useTourState(opts?: UseTourStateOptions): TourState {
	const storageKey = opts?.storageKey ?? DEFAULT_STORAGE_KEY
	const steps = opts?.steps ?? LIV_TOUR_STEPS
	const onComplete = opts?.onComplete

	const [index, setIndex] = useState(0)
	// Init lambda mirrors install-prompt-banner.tsx:19 — first paint sees
	// the persisted flag without an extra effect-driven re-render.
	const [visible, setVisible] = useState<boolean>(() => !readPersistedFlag(storageKey))

	const finish = useCallback(() => {
		writePersistedFlag(storageKey)
		setVisible(false)
		onComplete?.()
	}, [storageKey, onComplete])

	const skip = useCallback(() => {
		writePersistedFlag(storageKey)
		setVisible(false)
		onComplete?.()
	}, [storageKey, onComplete])

	const next = useCallback(() => {
		setIndex((i) => {
			if (i >= steps.length - 1) {
				// Past last step → finish (also flips visible=false).
				writePersistedFlag(storageKey)
				setVisible(false)
				onComplete?.()
				return i
			}
			return i + 1
		})
	}, [steps.length, storageKey, onComplete])

	const back = useCallback(() => {
		setIndex((i) => Math.max(0, i - 1))
	}, [])

	return {
		currentStepIndex: index,
		currentStep: visible ? steps[index] ?? null : null,
		isVisible: visible,
		totalSteps: steps.length,
		next,
		back,
		skip,
		finish,
	}
}
