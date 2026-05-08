// Phase 95-07.B — WebAppModeSelector.
//
// Four-pill segmented selector (Watch / Teach / Auto / Chat) with active
// highlight and keyboard arrow navigation. Mode is owned by the parent
// (webapp-stream-window.tsx) — D-95-MODE-LOCAL says mode is in-memory and
// resets on window close. Persistence is owned by P96 (Teach) and P97
// (Auto) when each phase consumes its mode.
//
// On mode change, this component additionally dispatches a namespaced
// CustomEvent so future phases can listen without prop-drilling:
//   window.dispatchEvent(new CustomEvent('liv-webapp-mode-change', {
//     detail: {webappId, mode}
//   }))
//
// Default mode = 'chat' per D-95-10 — selected on parent init, not here.

import {useCallback, useRef} from 'react'

import {cn} from '@/shadcn-lib/utils'

export type WebAppMode = 'watch' | 'teach' | 'auto' | 'chat'

export interface WebAppModeSelectorProps {
	mode: WebAppMode
	onModeChange: (mode: WebAppMode) => void
	/** Used as the detail payload for the dispatched CustomEvent. */
	webappId: string
	className?: string
}

interface ModeDef {
	id: WebAppMode
	label: string
	emoji: string
	hint: string
}

const MODE_ORDER: ReadonlyArray<ModeDef> = [
	{id: 'watch', label: 'Watch', emoji: '⏺', hint: 'Watch only — recording arrives in P96'},
	{id: 'teach', label: 'Teach', emoji: '🎙', hint: 'Teach mode arrives in P96'},
	{id: 'auto', label: 'Auto', emoji: '🤖', hint: 'Auto mode arrives in P97'},
	{id: 'chat', label: 'Chat', emoji: '💬', hint: 'Chat with the agent about this WebApp'},
]

export const WEBAPP_MODE_CHANGE_EVENT = 'liv-webapp-mode-change'

export function WebAppModeSelector({mode, onModeChange, webappId, className}: WebAppModeSelectorProps) {
	const containerRef = useRef<HTMLDivElement>(null)

	const dispatchModeChange = useCallback(
		(next: WebAppMode) => {
			if (next === mode) return
			onModeChange(next)
			try {
				window.dispatchEvent(
					new CustomEvent(WEBAPP_MODE_CHANGE_EVENT, {
						detail: {webappId, mode: next},
					}),
				)
			} catch {
				// JSDOM environments / very old browsers may lack CustomEvent.
				// Mode change still flows through onModeChange — non-blocking.
			}
		},
		[mode, onModeChange, webappId],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
			e.preventDefault()
			const idx = MODE_ORDER.findIndex((m) => m.id === mode)
			if (idx < 0) return
			const dir = e.key === 'ArrowRight' ? 1 : -1
			const nextIdx = (idx + dir + MODE_ORDER.length) % MODE_ORDER.length
			const nextMode = MODE_ORDER[nextIdx].id
			dispatchModeChange(nextMode)
			// Move keyboard focus to the new active button so the focus ring
			// follows the highlight.
			requestAnimationFrame(() => {
				const target = containerRef.current?.querySelector<HTMLButtonElement>(
					`button[data-mode="${nextMode}"]`,
				)
				target?.focus()
			})
		},
		[mode, dispatchModeChange],
	)

	return (
		<div
			ref={containerRef}
			role='radiogroup'
			aria-label='WebApp interaction mode'
			onKeyDown={handleKeyDown}
			className={cn(
				'inline-flex items-center gap-0.5 rounded-radius-sm bg-surface-2 p-0.5',
				className,
			)}
		>
			{MODE_ORDER.map(({id, label, emoji, hint}) => {
				const active = id === mode
				return (
					<button
						key={id}
						type='button'
						data-mode={id}
						role='radio'
						aria-checked={active}
						title={hint}
						onClick={() => dispatchModeChange(id)}
						className={cn(
							'flex h-7 items-center gap-1.5 rounded-radius-sm px-2.5 text-caption-sm transition-colors',
							'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
							active
								? 'bg-surface-base text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary',
							// Visual differentiator for teach (red pulsing dot) — purely
							// presentational in P95 per D-95-MODE-LOCAL. P96 will wire
							// real recording to it.
							active && id === 'teach' && 'animate-pulse',
						)}
					>
						<span aria-hidden>{emoji}</span>
						<span>{label}</span>
					</button>
				)
			})}
		</div>
	)
}

export default WebAppModeSelector
