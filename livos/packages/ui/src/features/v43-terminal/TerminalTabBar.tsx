/**
 * Phase 246-04 — Terminal tab strip.
 *
 * Pure controlled component: receives `tabs` + `activeTabKey` + callbacks.
 * Does NOT own session state; `PersistentTerminalPanel` owns it.
 *
 * Theme matches Phase 243 verbatim (background `#0b0b0c`, foreground
 * `#e7e7e8`, accent `#7dd3fc`) — see CONTEXT D-V44-THEME-PRESERVE.
 *
 * Interactions:
 *   - Click tab            → `onActivate(tabKey)`
 *   - Click "+ New"        → `onCreate()`
 *   - Right-click tab      → opens an inline context menu with "Rename"
 *                            and "Close" buttons
 *   - "Rename"             → swaps tab label for an inline `<input>`; commit
 *                            on Enter or blur, cancel on Escape; sends
 *                            `onRename(tabKey, newName)` only when the
 *                            trimmed draft is non-empty
 *   - "Close"              → `onClose(tabKey)`; the panel is responsible
 *                            for sending `{type:'close'}` on the WS and
 *                            removing the tab from state
 *
 * Tab status is surfaced as a small suffix glyph next to the label:
 *   - "connecting" → `·…`
 *   - "exited"     → `·exited`
 *   - "expired"    → `·expired` (red — reattach got 4404)
 */
import React, {useState} from 'react'

export interface TerminalTab {
	tabKey: string
	name: string
	status: 'connecting' | 'live' | 'exited' | 'expired'
}

export interface TerminalTabBarProps {
	tabs: TerminalTab[]
	activeTabKey: string | null
	onActivate: (tabKey: string) => void
	onCreate: () => void
	onRename: (tabKey: string, newName: string) => void
	onClose: (tabKey: string) => void
}

export function TerminalTabBar({
	tabs,
	activeTabKey,
	onActivate,
	onCreate,
	onRename,
	onClose,
}: TerminalTabBarProps) {
	const [menuFor, setMenuFor] = useState<string | null>(null)
	const [renamingKey, setRenamingKey] = useState<string | null>(null)
	const [renameDraft, setRenameDraft] = useState('')

	function handleContextMenu(e: React.MouseEvent, tabKey: string) {
		e.preventDefault()
		setMenuFor(tabKey)
	}

	function startRename(tabKey: string, currentName: string) {
		setRenamingKey(tabKey)
		setRenameDraft(currentName)
		setMenuFor(null)
	}

	function commitRename(tabKey: string) {
		const trimmed = renameDraft.trim()
		if (trimmed) onRename(tabKey, trimmed)
		setRenamingKey(null)
		setRenameDraft('')
	}

	return (
		<div
			className='flex items-center gap-1 border-b border-[#222] bg-[#0b0b0c] px-2 py-1'
			data-test='terminal-tab-bar'
		>
			{tabs.map((tab) => (
				<div
					key={tab.tabKey}
					data-test-tab={tab.tabKey}
					onClick={() => onActivate(tab.tabKey)}
					onContextMenu={(e) => handleContextMenu(e, tab.tabKey)}
					className={`group relative flex cursor-pointer items-center gap-1.5 rounded py-1 pl-3 pr-1.5 text-xs text-[#e7e7e8] ${
						tab.tabKey === activeTabKey ? 'bg-[#1f2937]' : 'hover:bg-[#15171b]'
					}`}
				>
					{renamingKey === tab.tabKey ? (
						<input
							autoFocus
							value={renameDraft}
							onChange={(e) => setRenameDraft(e.target.value)}
							onBlur={() => commitRename(tab.tabKey)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') commitRename(tab.tabKey)
								if (e.key === 'Escape') {
									setRenamingKey(null)
									setRenameDraft('')
								}
							}}
							onClick={(e) => e.stopPropagation()}
							className='w-24 border-b border-[#7dd3fc] bg-transparent outline-none'
						/>
					) : (
						<span>
							{tab.name}
							{tab.status === 'expired' && (
								<span className='ml-1 text-[#f87171]'>·expired</span>
							)}
							{tab.status === 'exited' && (
								<span className='ml-1 text-[#9ca3af]'>·exited</span>
							)}
							{tab.status === 'connecting' && (
								<span className='ml-1 text-[#9ca3af]'>·…</span>
							)}
						</span>
					)}
					{/* Phase 272 — visible close (X) on every tab, like the LivOS window
					    tabs. Was right-click-menu-only before, which the operator
					    couldn't find. Active tab shows it always; inactive tabs reveal
					    it on hover to keep the strip clean. stopPropagation so closing
					    doesn't first activate the tab. */}
					{renamingKey !== tab.tabKey && (
						<button
							type='button'
							data-test-tab-close={tab.tabKey}
							title='Close tab'
							aria-label={`Close ${tab.name}`}
							onClick={(e) => {
								e.stopPropagation()
								onClose(tab.tabKey)
								setMenuFor(null)
							}}
							className={`flex h-4 w-4 items-center justify-center rounded text-[13px] leading-none text-[#9ca3af] hover:bg-[#374151] hover:text-[#f87171] ${
								tab.tabKey === activeTabKey
									? 'opacity-100'
									: 'opacity-0 group-hover:opacity-100'
							}`}
						>
							×
						</button>
					)}
					{menuFor === tab.tabKey && (
						<div
							data-test-context-menu={tab.tabKey}
							className='absolute z-20 mt-1 rounded border border-[#333] bg-[#1f2937] py-1 text-xs'
							onMouseLeave={() => setMenuFor(null)}
							onClick={(e) => e.stopPropagation()}
						>
							<button
								type='button'
								className='block w-full px-3 py-1 text-left hover:bg-[#374151]'
								onClick={() => startRename(tab.tabKey, tab.name)}
							>
								Rename
							</button>
							<button
								type='button'
								className='block w-full px-3 py-1 text-left text-[#f87171] hover:bg-[#374151]'
								onClick={() => {
									onClose(tab.tabKey)
									setMenuFor(null)
								}}
							>
								Close
							</button>
						</div>
					)}
				</div>
			))}
			<button
				type='button'
				data-test='terminal-tab-create'
				onClick={onCreate}
				className='ml-2 rounded px-2 py-1 text-xs text-[#7dd3fc] hover:bg-[#15171b]'
			>
				+ New
			</button>
		</div>
	)
}
