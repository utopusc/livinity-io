// AI Chat-scoped Settings panel — MCP Servers view only.
//
// After the AI Chat teardown, the "Claude Code" CC-PTY tab was stripped
// (trpc.ccPty.* router and cc-pty backend deleted). The panel now renders
// the classic McpPanelClassic exclusively.
//
// Triggered by the gear icon at the bottom of (now-deleted) SidebarFooter
// but kept as a feature module because McpPanelClassic (1404 LOC) is still
// the canonical MCP UI and is consumed by Settings.

import {useEffect} from 'react'
import {ArrowLeft} from 'lucide-react'

import McpPanelClassic from './McpPanelClassic'

export interface AiChatSettingsPanelProps {
	open: boolean
	onClose: () => void
}

export function AiChatSettingsPanel({open, onClose}: AiChatSettingsPanelProps) {
	// Keyboard: Esc closes.
	useEffect(() => {
		if (!open) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null

	return (
		<div
			data-testid='ai-chat-settings-panel'
			className='absolute inset-0 z-40 flex flex-col bg-bg-secondary'
			style={{backgroundColor: 'var(--bg-secondary, #fff)'}}
		>
			{/* Header — Back button + MCP Servers label */}
			<div className='flex items-center gap-3 border-b border-border px-4 py-2'>
				<button
					type='button'
					aria-label='Geri'
					data-testid='settings-back-btn'
					onClick={onClose}
					className='flex items-center gap-1.5 rounded px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<ArrowLeft size={16} />
					<span>Geri</span>
				</button>
				<div className='px-3 py-1.5 text-sm font-medium text-primary'>MCP Servers</div>
			</div>
			{/* Body */}
			<div className='flex-1 overflow-y-auto'>
				<McpPanelClassic />
			</div>
		</div>
	)
}
