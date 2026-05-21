// Phase 189-01 — AgentTerminalPane
// Wraps <CcTerminal> for an agent vault item.
// sessionId = "liv-agent-{agentItem.id}" (id immutable, name can change)
// cwd       = "~/liv/items/{agentItem.name}/" (Phase 188-02 writes here)
//
// SACRED GUARDS: CcTerminal.tsx additive only (31+ Phase-167 assertions stay green).

import {forwardRef, useImperativeHandle, useRef} from 'react'
import {CcTerminal, type CcTerminalHandle} from '@/features/cc-terminal/CcTerminal'

export interface AgentTerminalPaneProps {
	agentItem: {id: string; name: string; type: string}
	userId: string
}

export interface AgentTerminalPaneHandle {
	sendStdin: (data: string) => void
}

export const AgentTerminalPane = forwardRef<AgentTerminalPaneHandle, AgentTerminalPaneProps>(
	function AgentTerminalPane({agentItem, userId: _userId}, ref) {
		const termRef = useRef<CcTerminalHandle>(null)

		useImperativeHandle(
			ref,
			() => ({
				sendStdin: (data) => termRef.current?.sendStdin(data),
			}),
			[],
		)

		const sessionId = `liv-agent-${agentItem.id}`
		const cwd = `~/liv/items/${agentItem.name}/`

		return (
			<div
				data-testid='agent-terminal-pane'
				className='flex h-full flex-col overflow-hidden'
			>
				{/* Header row with agent name */}
				<div className='flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-text-secondary'>
					<span className='font-medium text-text-primary'>{agentItem.name}</span>
					<span className='text-text-tertiary'>agent</span>
				</div>
				{/* PTY area fills remaining height */}
				<div className='min-h-0 flex-1'>
					<CcTerminal ref={termRef} sessionId={sessionId} cwd={cwd} />
				</div>
			</div>
		)
	},
)
AgentTerminalPane.displayName = 'AgentTerminalPane'
