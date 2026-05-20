// Phase 179-02 — Collapsible right-edge floating Controls panel shell.
// Renders as a chip when collapsed; expands to a card showing children sections.
// Threat T-179-02-C: z-20 layer is UI-only, no auth surface.

import {useState} from 'react'

export function GraphControls({children}: {children?: React.ReactNode}) {
	const [isOpen, setIsOpen] = useState(false)

	if (!isOpen) {
		return (
			<button
				type='button'
				data-testid='controls-chip'
				aria-label='Open graph controls'
				onClick={() => setIsOpen(true)}
				className='absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 rounded-[var(--r-lg)] border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-1.5 text-sm text-[color:var(--fg)]'
			>
				<svg
					width='14'
					height='14'
					viewBox='0 0 14 14'
					fill='none'
					aria-hidden='true'
				>
					<path
						d='M2 4h10M4 7h6M6 10h2'
						stroke='currentColor'
						strokeWidth='1.5'
						strokeLinecap='round'
					/>
				</svg>
				Controls
			</button>
		)
	}

	return (
		<div
			data-testid='controls-panel'
			className='absolute right-4 top-16 z-20 w-72 rounded-[var(--r-lg)] border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] shadow-pop overflow-y-auto max-h-[calc(100vh-6rem)]'
		>
			<div className='flex items-center justify-between border-b border-[color:var(--line-strong)] px-3 py-2'>
				<span className='text-sm font-medium text-[color:var(--fg)]'>Controls</span>
				<button
					type='button'
					data-testid='controls-close'
					onClick={() => setIsOpen(false)}
					aria-label='Close graph controls'
					className='rounded p-0.5 text-[color:var(--fg-mute)] hover:text-[color:var(--fg)]'
				>
					<svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
						<path
							d='M2 2l10 10M12 2L2 12'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
						/>
					</svg>
				</button>
			</div>
			<div className='flex flex-col divide-y divide-[color:var(--line-strong)]'>
				{children}
			</div>
		</div>
	)
}

export function useControlsOpen() {
	return useState(false)
}
