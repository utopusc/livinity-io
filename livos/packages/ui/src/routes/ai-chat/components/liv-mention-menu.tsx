/** LivMentionMenu — Phase 70-07. Placeholder mention menu for @ trigger.
 * 9 hardcoded items (3 agents + 3 tools + 3 skills) with coming-soon badges.
 * Real data integration is P76 (Agent Marketplace). CONTEXT D-28, D-29. */

import {useEffect, useRef} from 'react'

import {cn} from '@/shadcn-lib/utils'

export type MentionCategory = 'agent' | 'tool' | 'skill'

export interface Mention {
	name: string // e.g. 'researcher' (no leading @)
	label: string // e.g. 'Researcher'
	category: MentionCategory
	description: string
}

/** 9 hardcoded placeholder mentions per CONTEXT D-28. P76 replaces with real data. */
export const LIV_PLACEHOLDER_MENTIONS: Mention[] = [
	{name: 'researcher', label: 'Researcher', category: 'agent', description: 'Web research + summarization agent'},
	{name: 'coder', label: 'Coder', category: 'agent', description: 'Multi-file refactoring agent'},
	{name: 'analyst', label: 'Analyst', category: 'agent', description: 'Data analysis + chart generation agent'},
	{name: 'brave-search', label: 'Brave Search', category: 'tool', description: 'MCP web search tool'},
	{name: 'github', label: 'GitHub', category: 'tool', description: 'MCP GitHub repository tool'},
	{name: 'docker', label: 'Docker', category: 'tool', description: 'MCP Docker container tool'},
	{name: 'summarize', label: 'Summarize', category: 'skill', description: 'Summarize a long document'},
	{name: 'translate', label: 'Translate', category: 'skill', description: 'Translate text to another language'},
	{name: 'extract', label: 'Extract', category: 'skill', description: 'Extract structured data from text'},
]

/** Pure helper — substring match against name + label, case-insensitive. */
export function filterMentions(mentions: Mention[], filter: string): Mention[] {
	if (!filter) return mentions
	const f = filter.toLowerCase()
	return mentions.filter((m) => {
		const haystack = `${m.name} ${m.label}`.toLowerCase()
		return haystack.includes(f)
	})
}

interface LivMentionMenuProps {
	mentions?: Mention[] // defaults to LIV_PLACEHOLDER_MENTIONS
	filter: string
	selectedIndex: number
	onSelect: (mention: Mention) => void
	onFilteredCountChange?: (count: number) => void
	filteredMentionsRef?: React.MutableRefObject<Mention[]>
}

export function LivMentionMenu({
	mentions = LIV_PLACEHOLDER_MENTIONS,
	filter,
	selectedIndex,
	onSelect,
	onFilteredCountChange,
	filteredMentionsRef,
}: LivMentionMenuProps) {
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
	const filtered = filterMentions(mentions, filter)

	if (filteredMentionsRef) filteredMentionsRef.current = filtered

	useEffect(() => {
		onFilteredCountChange?.(filtered.length)
	}, [filtered.length, onFilteredCountChange])

	useEffect(() => {
		itemRefs.current.get(selectedIndex)?.scrollIntoView({block: 'nearest'})
	}, [selectedIndex])

	if (filtered.length === 0) return null

	const categoryLabels: Record<MentionCategory, string> = {
		agent: 'Agents',
		tool: 'Tools',
		skill: 'Skills',
	}

	// Group by category for visual grouping (preserve order: agent, tool, skill)
	const byCategory: Partial<Record<MentionCategory, Mention[]>> = {}
	for (const m of filtered) {
		;(byCategory[m.category] ??= []).push(m)
	}

	const orderedCategories: MentionCategory[] = ['agent', 'tool', 'skill']

	let runningIdx = 0

	return (
		<div className='absolute bottom-full left-0 right-12 mb-2 max-h-64 overflow-y-auto rounded-lg border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] shadow-lg'>
			{orderedCategories
				.filter((cat) => byCategory[cat] && byCategory[cat]!.length > 0)
				.map((cat) => (
					<div key={cat}>
						<div className='px-3 py-1.5 text-[10px] uppercase tracking-wider text-[color:var(--liv-text-tertiary)]'>
							{categoryLabels[cat]}
						</div>
						{byCategory[cat]?.map((m) => {
							const myIdx = runningIdx++
							return (
								<div
									key={m.name}
									ref={(el) => {
										if (el) itemRefs.current.set(myIdx, el)
									}}
									onMouseDown={(e) => {
										e.preventDefault()
										onSelect(m)
									}}
									className={cn(
										'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
										myIdx === selectedIndex
											? 'border-l-2 border-[color:var(--liv-accent-cyan)] bg-[color:var(--liv-bg-deep)]/50 text-[color:var(--liv-text-primary)]'
											: 'text-[color:var(--liv-text-secondary)] hover:bg-[color:var(--liv-bg-deep)]/30',
									)}
								>
									<span className='font-mono text-[color:var(--liv-accent-violet)]'>@{m.name}</span>
									<span className='truncate text-[color:var(--liv-text-tertiary)]'>{m.description}</span>
									<span className='ml-auto flex-shrink-0 rounded-full border border-[color:var(--liv-border-subtle)] px-1.5 py-0.5 text-[10px] uppercase text-[color:var(--liv-text-tertiary)]'>
										coming soon
									</span>
								</div>
							)
						})}
					</div>
				))}
		</div>
	)
}
