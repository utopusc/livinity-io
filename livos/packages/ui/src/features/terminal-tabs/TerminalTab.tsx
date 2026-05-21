// Phase 190-02 — TerminalTab: single tab button with label + close × on hover.
// Used by TerminalTabStrip.

import {X} from 'lucide-react'
import type {TerminalTabInfo} from './types'

interface TerminalTabProps {
	tab: TerminalTabInfo
	isActive: boolean
	onSelect: (id: string) => void
	onClose: (id: string) => void
}

export function TerminalTab({tab, isActive, onSelect, onClose}: TerminalTabProps) {
	return (
		<button
			type='button'
			data-testid={`tab-${tab.id}`}
			onClick={() => onSelect(tab.id)}
			className={[
				'group flex min-w-[140px] max-w-[240px] items-center gap-1 rounded-t px-3 py-2 text-sm shrink-0',
				isActive
					? 'border-b-2 border-primary bg-bg-primary text-primary'
					: 'text-text-secondary hover:bg-surface-2',
			].join(' ')}
		>
			<span className='min-w-0 flex-1 truncate text-left'>{tab.label}</span>
			<span
				role='button'
				aria-label={`Close ${tab.label}`}
				data-testid={`tab-close-${tab.id}`}
				onClick={(e) => {
					e.stopPropagation()
					onClose(tab.id)
				}}
				className='ml-auto rounded p-0.5 opacity-0 hover:bg-surface-3 group-hover:opacity-100'
			>
				<X size={12} />
			</span>
		</button>
	)
}
