/** LivSlashMenu — Phase 70-02. Slash command menu with 6+ built-in commands.
 * Replaces (additively, NOT deletes) slash-command-menu.tsx. P66 design system. */

import {useEffect, useRef} from 'react'

import {cn} from '@/shadcn-lib/utils'

export interface SlashCommand {
	name: string
	description: string
	category: 'builtin' | 'command' | 'tool' | 'skill'
}

/** 6 built-in commands per CONTEXT D-25. Order matters (display order). */
export const LIV_BUILTIN_COMMANDS: SlashCommand[] = [
	{name: '/clear', description: 'Reset conversation', category: 'builtin'},
	{name: '/agents', description: 'Switch to agents tab', category: 'builtin'},
	{name: '/help', description: 'Show available commands', category: 'builtin'},
	{name: '/usage', description: 'Show token and cost usage', category: 'builtin'},
	{name: '/think', description: 'Force reasoning mode (P75)', category: 'builtin'},
	{name: '/computer', description: 'Start computer use task (P71)', category: 'builtin'},
]

/** Commands that fire immediately on select (no args). Per CONTEXT D-27. */
const IMMEDIATE_COMMANDS = new Set(['/clear', '/usage', '/help'])

export function executeImmediateCommand(name: string): boolean {
	return IMMEDIATE_COMMANDS.has(name)
}

/** Pure helper — substring match against name minus leading slash, case-insensitive. */
export function filterSlashCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
	if (!filter) return commands
	const f = filter.toLowerCase()
	return commands.filter((c) => c.name.slice(1).toLowerCase().includes(f))
}

interface LivSlashMenuProps {
	commands?: SlashCommand[] // optional override; defaults to LIV_BUILTIN_COMMANDS
	filter: string
	selectedIndex: number
	onSelect: (command: SlashCommand) => void
	onFilteredCountChange?: (count: number) => void
	filteredCommandsRef?: React.MutableRefObject<SlashCommand[]>
}

export function LivSlashMenu({
	commands = LIV_BUILTIN_COMMANDS,
	filter,
	selectedIndex,
	onSelect,
	onFilteredCountChange,
	filteredCommandsRef,
}: LivSlashMenuProps) {
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const filtered = filterSlashCommands(commands, filter)

	// Mirror filtered commands to parent ref (for keyboard nav in composer)
	if (filteredCommandsRef) filteredCommandsRef.current = filtered

	useEffect(() => {
		onFilteredCountChange?.(filtered.length)
	}, [filtered.length, onFilteredCountChange])

	useEffect(() => {
		itemRefs.current.get(selectedIndex)?.scrollIntoView({block: 'nearest'})
	}, [selectedIndex])

	if (filtered.length === 0) return null

	return (
		<div className='absolute bottom-full left-0 right-12 mb-2 max-h-64 overflow-y-auto rounded-lg border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] shadow-lg'>
			{filtered.map((cmd, i) => (
				<div
					key={cmd.name}
					ref={(el) => {
						if (el) itemRefs.current.set(i, el)
					}}
					onMouseDown={(e) => {
						e.preventDefault()
						onSelect(cmd)
					}}
					className={cn(
						'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
						i === selectedIndex
							? 'border-l-2 border-[color:var(--liv-accent-cyan)] bg-[color:var(--liv-bg-deep)]/50 text-[color:var(--liv-text-primary)]'
							: 'text-[color:var(--liv-text-secondary)] hover:bg-[color:var(--liv-bg-deep)]/30',
					)}
				>
					<span className='font-mono text-[color:var(--liv-accent-cyan)]'>{cmd.name}</span>
					<span className='truncate text-[color:var(--liv-text-tertiary)]'>{cmd.description}</span>
					{cmd.category !== 'builtin' && (
						<span className='ml-auto flex-shrink-0 text-[10px] uppercase text-[color:var(--liv-text-tertiary)]'>{cmd.category}</span>
					)}
				</div>
			))}
		</div>
	)
}
