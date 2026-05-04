/**
 * LivTypingDots — Phase 70-05.
 *
 * Suna's breathing dots animation while waiting for the first assistant token.
 * Cycles `'' → '.' → '..' → '...'` at 500ms via `setInterval` inside `useEffect`.
 * CONTEXT D-39 / D-40.
 *
 * Hard rules honored:
 *   - D-07 (D-NO-NEW-DEPS): only React + cn util.
 *   - No keyframe animations beyond the stateful interval (CONTEXT scope_guard).
 *   - useEffect cleanup returns clearInterval — interval can never leak (T-70-05-04).
 */

import {useEffect, useState} from 'react'

import {cn} from '@/shadcn-lib/utils'

const DOT_CYCLE = ['', '.', '..', '...'] as const
type DotState = (typeof DOT_CYCLE)[number]

/**
 * Returns the next entry in the dot cycle. Defensive default: any unknown input
 * (e.g. '????', '....', 'foo') returns ''. Pure helper for vitest unit-testing.
 */
export function getNextDot(current: string): string {
	const idx = DOT_CYCLE.indexOf(current as DotState)
	if (idx === -1) return ''
	return DOT_CYCLE[(idx + 1) % DOT_CYCLE.length]
}

interface LivTypingDotsProps {
	/** When false, renders null and pauses the interval. Defaults to true. */
	active?: boolean
	className?: string
}

export function LivTypingDots({active = true, className}: LivTypingDotsProps) {
	const [dots, setDots] = useState<string>('')

	useEffect(() => {
		if (!active) return
		const interval = setInterval(() => {
			setDots((prev) => getNextDot(prev))
		}, 500)
		return () => clearInterval(interval)
	}, [active])

	if (!active) return null

	return (
		<span
			className={cn(
				'inline-block min-w-[1.5em] font-mono text-[color:var(--liv-text-tertiary)]',
				className,
			)}
			aria-label='Agent is typing'
		>
			{dots}
		</span>
	)
}
