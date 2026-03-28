import {useEffect, useRef} from 'react'

import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

export interface SlashCommand {
	name: string
	description: string
	category: 'builtin' | 'command' | 'tool' | 'skill'
}

const UI_COMMANDS: SlashCommand[] = [
	{name: '/usage', description: 'Show token and cost usage', category: 'builtin'},
	{name: '/new', description: 'Start a new conversation', category: 'builtin'},
	{name: '/help', description: 'Show available commands', category: 'builtin'},
	{name: '/agents', description: 'Switch to agents tab', category: 'builtin'},
	{name: '/loops', description: 'List active loops', category: 'builtin'},
	{name: '/skills', description: 'List available skills', category: 'builtin'},
]

interface SlashCommandMenuProps {
	filter: string
	selectedIndex: number
	onSelect: (command: SlashCommand) => void
	onFilteredCountChange: (count: number) => void
	filteredCommandsRef: React.MutableRefObject<SlashCommand[]>
}

export function SlashCommandMenu({filter, selectedIndex, onSelect, onFilteredCountChange, filteredCommandsRef}: SlashCommandMenuProps) {
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

	// Fetch dynamic commands from backend (cached, refetch every 60s)
	const dynamicQuery = trpcReact.ai.listSlashCommands.useQuery(undefined, {
		staleTime: 30_000,
		refetchInterval: 60_000,
	})

	// Merge UI commands + backend commands, deduplicate by name (UI_COMMANDS take priority)
	const allCommands: SlashCommand[] = [...UI_COMMANDS]
	if (dynamicQuery.data?.commands) {
		for (const cmd of dynamicQuery.data.commands) {
			if (!allCommands.some((c) => c.name === cmd.name)) {
				allCommands.push({...cmd, category: cmd.category as SlashCommand['category']})
			}
		}
	}

	// Filter by substring match (case-insensitive)
	const filtered = filter
		? allCommands.filter((c) => c.name.slice(1).toLowerCase().includes(filter))
		: allCommands

	// Expose filtered commands to parent for Enter key selection
	filteredCommandsRef.current = filtered

	// Inform parent of filtered count for index clamping
	useEffect(() => {
		onFilteredCountChange(filtered.length)
	}, [filtered.length, onFilteredCountChange])

	// Auto-scroll selected item into view
	useEffect(() => {
		itemRefs.current.get(selectedIndex)?.scrollIntoView({block: 'nearest'})
	}, [selectedIndex])

	if (filtered.length === 0) return null

	return (
		<div className='absolute bottom-full left-0 right-12 mb-2 max-h-64 overflow-y-auto rounded-lg border border-border-default bg-surface-base shadow-lg'>
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
						i === selectedIndex ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-1',
					)}
				>
					<span className='font-mono text-brand'>{cmd.name}</span>
					<span className='truncate text-text-tertiary'>{cmd.description}</span>
					{cmd.category !== 'builtin' && (
						<span className='ml-auto flex-shrink-0 text-[10px] uppercase text-text-quaternary'>{cmd.category}</span>
					)}
				</div>
			))}
		</div>
	)
}
