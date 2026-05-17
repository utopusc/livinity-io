import {useEffect, useRef, useState} from 'react'

import {useSound} from './sound-provider'

/**
 * Floating help FAB in the bottom-right with an expandable FAQ card.
 * Ported from reference effects.jsx HelpBubble. Click-outside closes it.
 *
 * Links are currently href="#" stubs — wire to real docs / chat when those
 * surfaces exist. The "Chat with Liv" button can be wired to the v32 chat
 * window via window-manager in a follow-up phase.
 */
export function HelpBubble() {
	const [open, setOpen] = useState(false)
	const {play} = useSound()
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const onDoc = (e: MouseEvent) => {
			if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', onDoc)
		return () => document.removeEventListener('mousedown', onDoc)
	}, [open])

	return (
		<div className={`fx-help ${open ? 'open' : ''}`} ref={ref}>
			{open && (
				<div className='fx-help-card'>
					<div className='fx-help-head'>
						<div>
							<div className='fx-help-eyebrow'>Need a hand?</div>
							<div className='fx-help-title'>
								Ask <em>Liv</em>, or skim the basics.
							</div>
						</div>
						<button className='fx-help-close' onClick={() => setOpen(false)} aria-label='Close help'>
							<svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
								<path d='M6 6l12 12M18 6L6 18' />
							</svg>
						</button>
					</div>
					<div className='fx-help-list'>
						<a href='#' className='fx-help-row'>
							<span>Why can't I reset my password?</span>
							<svg viewBox='0 0 24 24' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
								<path d='M7 17L17 7M9 7h8v8' />
							</svg>
						</a>
						<a href='#' className='fx-help-row'>
							<span>What is Liv and what can it do?</span>
							<svg viewBox='0 0 24 24' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
								<path d='M7 17L17 7M9 7h8v8' />
							</svg>
						</a>
						<a href='#' className='fx-help-row'>
							<span>Where is my data stored?</span>
							<svg viewBox='0 0 24 24' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
								<path d='M7 17L17 7M9 7h8v8' />
							</svg>
						</a>
						<a href='#' className='fx-help-row'>
							<span>How do I connect my own AI later?</span>
							<svg viewBox='0 0 24 24' width='12' height='12' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
								<path d='M7 17L17 7M9 7h8v8' />
							</svg>
						</a>
					</div>
					<div className='fx-help-foot'>
						<button className='fx-help-chat'>
							<span className='fx-help-dot'></span>
							Chat with Liv
						</button>
					</div>
				</div>
			)}
			<button
				className='fx-help-fab'
				onClick={() => {
					play('click')
					setOpen((v) => !v)
				}}
				aria-label='Help'
			>
				{open ? (
					<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
						<path d='M6 6l12 12M18 6L6 18' />
					</svg>
				) : (
					<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
						<circle cx='12' cy='12' r='9' />
						<path d='M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.3-1.5 2.5M12 17h.01' />
					</svg>
				)}
			</button>
		</div>
	)
}
