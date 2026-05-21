// Phase 190-02 — TerminalTabStrip: horizontal scroll tab container + right icon cluster.
// Props: { tabs, activeId, onSelect, onClose, onAddClaude, onAddBareTerminal }

import {Sparkles, Terminal as TerminalIcon} from 'lucide-react'
import {TerminalTab} from './TerminalTab'
import type {TerminalTabStripProps} from './types'

export function TerminalTabStrip({
	tabs,
	activeId,
	onSelect,
	onClose,
	onAddClaude,
	onAddBareTerminal,
	...rest
}: TerminalTabStripProps & Record<string, unknown>) {
	return (
		<div
			{...rest}
			className='flex flex-row items-center gap-1 overflow-x-auto border-b border-border bg-bg-secondary px-2'
		>
			{tabs.map((tab) => (
				<TerminalTab
					key={tab.id}
					tab={tab}
					isActive={tab.id === activeId}
					onSelect={onSelect}
					onClose={onClose}
				/>
			))}
			<div className='ml-auto flex shrink-0 flex-row items-center gap-1 px-2'>
				<button
					type='button'
					data-testid='add-claude-btn'
					aria-label='New Claude session'
					onClick={onAddClaude}
					className='rounded p-1.5 text-text-secondary hover:bg-surface-2 hover:text-primary'
					title='New Claude session'
				>
					<Sparkles size={16} />
				</button>
				<button
					type='button'
					data-testid='add-terminal-btn'
					aria-label='New Terminal'
					onClick={onAddBareTerminal}
					className='rounded p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary'
					title='New Terminal'
				>
					<TerminalIcon size={16} />
				</button>
			</div>
		</div>
	)
}
