/**
 * Phase 198-07 — Empty-thread state for Liv AI.
 *
 * Plan 198-07 shipped this as a self-contained component (logo +
 * heading + tagline + SuggestedPrompts) mounted via an absolute-
 * positioned overlay on top of <Thread />. That overlay shape was
 * deleted by Plan 199-05 in favour of the canonical assistant-ui
 * `<AuiIf condition={(s) => s.thread.isEmpty}>` branching primitive
 * (RESEARCH B1 + Pattern 2; D-199-17 + D-199-28).
 *
 * Plan 199-05 inlined the centered-hero layout INSIDE assistant.tsx
 * as `<EmptyStateBranch />` so the layout becomes natural flex-column
 * flow (no `absolute inset-0`) and the Composer is rendered in the same
 * branch tree as the chat-state Composer (single shared module
 * instance — D-199-18 / Pitfall 7).
 *
 * This file now exports:
 *   - `LIV_AI_TAGLINE` — the locked operator-visible tagline (Plan
 *     198-07 must_haves truth #1). Consumed by `EmptyStateBranch` in
 *     assistant.tsx + tests + any future surface (dock tooltip,
 *     onboarding step copy) that needs the same phrase.
 *   - `EmptyState({onPick})` — a thin stand-alone wrapper rendering the
 *     centered hero in isolation. Used by the existing empty-state
 *     vitest (Phase 198-07 + 199-01 brand regression-lock cases). The
 *     production tree in assistant.tsx mounts `<EmptyStateBranch />`
 *     instead so the SuggestedPrompts callback can reach
 *     `useThreadRuntime().append()` — but the standalone <EmptyState />
 *     remains useful for isolated rendering / storybook / regression
 *     tests that verify the brand assertion contract.
 *
 * Plan 199-05 tightening: logo h-20/w-20 → h-16/w-16 (D-199-25).
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
	"Liv AI — your operating system's assistant."

export interface EmptyStateProps {
	/**
	 * Fired with the chip's text when the operator clicks a chip. The
	 * production tree (assistant.tsx EmptyStateBranch) wires this to
	 * `useThreadRuntime().append(...)` so clicking a chip injects the
	 * text directly as a user message and kicks off the agent stream in
	 * one click.
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
				className='h-16 w-16'
			/>
			<h2 className='text-2xl font-semibold text-neutral-900 dark:text-neutral-100'>
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
