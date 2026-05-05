/**
 * Phase 76 Plan 76-05 — `<LivTour>` root component.
 *
 * Self-contained 9-step onboarding overlay (D-13 homegrown — D-NO-NEW-DEPS).
 * Composes:
 *   - `useTourState` (state machine + localStorage persistence)
 *   - `<Spotlight>` (SVG dim + cutout)
 *   - P66 `<SlideInPanel from='bottom'>` for tooltip entrance
 *   - P66 `<GlowPulse color='cyan'>` wrapping the welcome (step 1) modal
 *
 * Mount this once inside `/ai-chat` (Phase 76-07 wires that). On mount it
 * checks `localStorage.getItem('liv-tour-completed')` — if `'1'`, returns
 * `null`. Otherwise the 9-step sequence plays.
 *
 * Step 5 (`demo-prompt`) populates the composer via the optional
 * `onSetComposerDraft` callback (D-14 non-destructive — tour does NOT
 * auto-click Send; user clicks Send to advance, or Skip to move past).
 *
 * Keyboard contract:
 *   - `Escape`     → skip
 *   - `ArrowRight` → next
 *   - `ArrowLeft`  → back (clamped at 0)
 *
 * Production-safe degradation: if a step's `targetSelector` does not
 * resolve, Spotlight logs a warning and renders a fully opaque dim — the
 * tooltip still renders, the tour does NOT crash.
 */

import {useEffect} from 'react'
import {createPortal} from 'react-dom'

import {GlowPulse, SlideInPanel} from '@/components/motion'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'

import {Spotlight} from './spotlight'
import {useTourState} from './use-tour-state'

export type LivTourProps = {
	/** Callback invoked when step 5 (`demo-prompt`) becomes active. The
	 * consumer is responsible for setting the composer textarea draft. */
	onSetComposerDraft?: (text: string) => void
	/** Custom storage key — defaults to `'liv-tour-completed'`. */
	storageKey?: string
	/** Fired when tour is dismissed (skip OR finish). */
	onComplete?: () => void
}

const DEMO_PROMPT_TEXT = 'Take a screenshot of google.com'

export function LivTour({
	onSetComposerDraft,
	storageKey,
	onComplete,
}: LivTourProps) {
	const tour = useTourState({storageKey, onComplete})

	// Keyboard handler — attached only while tour is visible.
	useEffect(() => {
		if (!tour.isVisible) return

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				tour.skip()
			} else if (e.key === 'ArrowRight') {
				tour.next()
			} else if (e.key === 'ArrowLeft') {
				tour.back()
			}
		}

		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [tour.isVisible, tour.skip, tour.next, tour.back])

	// Step 5 effect — populate composer draft when `demo-prompt` becomes active.
	const stepId = tour.currentStep?.id
	useEffect(() => {
		if (stepId === 'demo-prompt' && onSetComposerDraft) {
			onSetComposerDraft(DEMO_PROMPT_TEXT)
		}
	}, [stepId, onSetComposerDraft])

	if (!tour.isVisible || !tour.currentStep) return null

	const isCenter = tour.currentStep.placement === 'center'
	const isFirst = tour.currentStepIndex === 0
	const isLast = tour.currentStepIndex === tour.totalSteps - 1

	const tooltipChrome = (
		<div
			role='dialog'
			aria-modal='true'
			aria-labelledby='liv-tour-title'
			aria-describedby='liv-tour-body'
			className={cn(
				'liv-glass pointer-events-auto rounded-radius-md border border-border-default p-5 shadow-xl',
				'w-[420px] max-w-[90vw]',
			)}
		>
			<h3
				id='liv-tour-title'
				className='text-h1 font-semibold text-text-primary'
			>
				{tour.currentStep.title}
			</h3>
			<p
				id='liv-tour-body'
				className='mt-2 text-body text-text-secondary'
			>
				{tour.currentStep.body}
			</p>

			<div className='mt-4 flex items-center justify-between gap-3'>
				<div
					className='text-caption text-text-tertiary'
					data-tour-counter='1'
				>
					{tour.currentStepIndex + 1} of {tour.totalSteps}
				</div>
				<div className='flex items-center gap-2'>
					<Button
						variant='ghost'
						size='sm'
						onClick={tour.back}
						disabled={isFirst}
						aria-label='Previous step'
					>
						Back
					</Button>
					<Button
						variant='ghost'
						size='sm'
						onClick={tour.skip}
						aria-label='Skip tour'
					>
						Skip
					</Button>
					<Button
						variant='liv-primary'
						size='sm'
						onClick={tour.next}
						aria-label={isLast ? 'Finish tour' : 'Next step'}
					>
						{isLast ? 'Finish' : 'Next'}
					</Button>
				</div>
			</div>
		</div>
	)

	const overlay = (
		<div data-tour-overlay='1' className='pointer-events-none'>
			<Spotlight targetSelector={tour.currentStep.targetSelector ?? null} />

			{isCenter ? (
				// Centered modal (welcome / done). Welcome wraps the chrome in
				// GlowPulse cyan per <interfaces>; done renders the chrome bare.
				<div className='pointer-events-none fixed inset-0 z-[1010] grid place-items-center px-4'>
					{isFirst ? (
						<GlowPulse color='cyan' blur='strong' duration={3}>
							{tooltipChrome}
						</GlowPulse>
					) : (
						tooltipChrome
					)}
				</div>
			) : (
				// Anchored tooltip — pinned to bottom-center of viewport for v1
				// (per PLAN <interfaces> simplification: avoids overflow / placement
				// math; placement-aware positioning is BACKLOG once visually wrong).
				<div className='pointer-events-none fixed inset-x-0 bottom-8 z-[1010] grid place-items-center px-4'>
					<SlideInPanel from='bottom'>{tooltipChrome}</SlideInPanel>
				</div>
			)}
		</div>
	)

	return createPortal(overlay, document.body)
}
