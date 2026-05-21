// Phase 189-04 — Conversation starter chips.
// Displayed in AgentTerminalPane empty state. Auto-hidden after first user message.
// Research Pattern #3: OpenClaw OS EmptyAgentHero pattern.
// Static strings — locale awareness deferred to v38.3.

export const STARTER_CHIP_PROMPTS: readonly string[] = [
	'Tell me what you can do',
	'Schedule a daily summary',
	'Watch a folder for changes',
	'Help me plan something',
] as const

export interface StarterChipsProps {
	onPick: (prompt: string) => void
	hidden?: boolean
}

export function StarterChips({onPick, hidden = false}: StarterChipsProps) {
	if (hidden) return null
	return (
		<div
			data-testid='starter-chips'
			className='flex flex-wrap gap-2 border-t border-border p-3'
		>
			{STARTER_CHIP_PROMPTS.map((prompt) => (
				<button
					key={prompt}
					type='button'
					onClick={() => onPick(prompt)}
					className='rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary/40 hover:bg-surface-3 hover:text-text-primary'
				>
					{prompt}
				</button>
			))}
		</div>
	)
}
