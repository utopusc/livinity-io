// Phase 190-02 — terminal-tabs type definitions.
// Shared across TerminalTabStrip, TerminalTab, and the AiChatRoute state machine.

export type TerminalTabType = 'agent' | 'chat' | 'claude' | 'terminal'

export interface TerminalTabInfo {
	/** Unique tab identifier. Conventions:
	 *  - claude tabs:    'liv-adhoc-claude-{uuid}'
	 *  - terminal tabs:  'liv-bare-{uuid}'
	 *  - agent tabs:     'liv-agent-{itemId}'
	 *  - chat tabs:      'liv-chat-{itemId}'
	 */
	id: string
	/** Display name shown in the tab. */
	label: string
	type: TerminalTabType
	/** Session id forwarded to CcTerminal / BareTerminal. For agent/chat matches id. */
	sessionId: string
}

export interface TerminalTabStripProps {
	tabs: TerminalTabInfo[]
	activeId: string | null
	onSelect: (id: string) => void
	onClose: (id: string) => void
	onAddClaude: () => void
	onAddBareTerminal: () => void
}
