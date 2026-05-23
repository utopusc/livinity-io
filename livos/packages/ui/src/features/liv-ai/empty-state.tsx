/**
 * Phase 198-07 — Empty-thread state for Liv AI.
 *
 * Rendered inside the Liv AI Assistant when the active thread has no
 * messages. Layers the Liv AI logo + tagline + the 4 SuggestedPrompts
 * chips into a single centered presentation block.
 *
 * Plan 198-06 shipped a bare `<SuggestedPrompts>` floating-pill overlay
 * (`EmptyStateSuggestedPrompts` inner component in assistant.tsx); Plan
 * 198-07 replaces that bare overlay with this richer EmptyState that
 * adds:
 *
 *   - Liv AI logo (figma-exports/liv-ai.svg — same asset as the dock
 *     icon for visual continuity with the rest of LivOS)
 *   - 'Liv AI' heading
 *   - Locked operator-visible tagline:
 *     "LivOS'un yapay zekası — ekranını yönetir, sorularına cevap
 *      verir, hatırlar." (Phase 198-07 must_haves truth #1)
 *   - The same `<SuggestedPrompts>` chip row (delegates onPick to the
 *     parent so the assistant.tsx wire-up — useThreadRuntime().append —
 *     stays the single source of truth for chip → user-message routing)
 *
 * Tailwind dark-mode classes (`dark:text-neutral-400`) honour the
 * existing LivOS ThemeProvider's `.dark` html class — no new theming
 * code (Plan 198-07 must_haves truth #2).
 */

import type {ReactElement} from 'react'

import {SuggestedPrompts} from './suggested-prompts'

/**
 * The locked Liv AI tagline shipped per Plan 198-07 must_haves truth #1.
 * Exported so any future surface (Liv AI dock tooltip, settings panel,
 * onboarding "Connect AI" step copy) can render the same phrase without
 * drift.
 */
export const LIV_AI_TAGLINE =
	"LivOS'un yapay zekası — ekranını yönetir, sorularına cevap verir, hatırlar."

export interface EmptyStateProps {
	/**
	 * Fired with the chip's text when the operator clicks a chip. Parent
	 * (assistant.tsx) wires this to `useThreadRuntime().append(...)` so
	 * clicking a chip injects the text directly as a user message and
	 * kicks off the agent stream in one click.
	 */
	onPick: (text: string) => void
}

export function EmptyState({onPick}: EmptyStateProps): ReactElement {
	return (
		<div
			className='flex h-full flex-col items-center justify-center gap-4 p-8 text-center'
			data-testid='liv-ai-empty-state'
		>
			<img
				src='/figma-exports/liv-ai.svg'
				alt='Liv AI'
				className='h-20 w-20'
			/>
			<h2 className='text-xl font-semibold text-neutral-900 dark:text-neutral-100'>
				Liv AI
			</h2>
			<p className='max-w-md text-sm text-neutral-600 dark:text-neutral-400'>
				{LIV_AI_TAGLINE}
			</p>
			<SuggestedPrompts onPick={onPick} />
		</div>
	)
}

export default EmptyState
