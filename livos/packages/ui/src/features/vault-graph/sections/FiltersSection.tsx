// Phase 179-02 — Filters section inside GraphControls panel.
// 7 type checkboxes + 3 boolean toggles + excluded-paths textarea.
// Persists state to localStorage key liv:vault-graph:settings:filters (namespaced by userId).
//
// Threat T-179-02-A: excludedPaths stored as string, never eval'd.
// Threat T-179-02-B: localStorage key includes userId suffix for multi-user isolation.

import {useState} from 'react'

export type VaultNodeType =
	| 'memory'
	| 'session'
	| 'inbox'
	| 'agent'
	| 'skill'
	| 'command'
	| 'root'

export interface FiltersState {
	enabledTypes: VaultNodeType[]
	showOrphans: boolean
	showRecent: boolean
	showGhosts: boolean
	excludedPaths: string
}

export const defaultFilters: FiltersState = {
	enabledTypes: ['memory', 'session', 'inbox', 'agent', 'skill', 'command', 'root'],
	showOrphans: true,
	showRecent: false,
	showGhosts: true,
	excludedPaths: '',
}

export const FILTERS_KEY = (userId?: string): string =>
	userId
		? `liv:vault-graph:settings:filters:${userId}`
		: 'liv:vault-graph:settings:filters'

const ALL_TYPES: VaultNodeType[] = [
	'memory',
	'session',
	'inbox',
	'agent',
	'skill',
	'command',
	'root',
]

const TYPE_LABELS: Record<VaultNodeType, string> = {
	memory: 'Memory',
	session: 'Session',
	inbox: 'Inbox',
	agent: 'Agent',
	skill: 'Skill',
	command: 'Command',
	root: 'Root',
}

interface Props {
	initialFilters?: Partial<FiltersState>
	userId?: string
	onFiltersChange?: (f: FiltersState) => void
}

export function FiltersSection({initialFilters, userId, onFiltersChange}: Props) {
	const [state, setState] = useState<FiltersState>({
		...defaultFilters,
		...initialFilters,
	})

	function update(patch: Partial<FiltersState>) {
		const next = {...state, ...patch}
		setState(next)
		onFiltersChange?.(next)
		localStorage.setItem(FILTERS_KEY(userId), JSON.stringify(next))
	}

	function toggleType(type: VaultNodeType) {
		const enabled = state.enabledTypes.includes(type)
		update({
			enabledTypes: enabled
				? state.enabledTypes.filter((t) => t !== type)
				: [...state.enabledTypes, type],
		})
	}

	return (
		<div className='flex flex-col gap-2 p-3'>
			<p className='text-xs font-medium text-[color:var(--fg-mute)] uppercase tracking-wide'>
				Filters
			</p>

			<div className='flex flex-col gap-1'>
				<p className='text-xs text-[color:var(--fg-mute)]'>Node types</p>
				{ALL_TYPES.map((type) => (
					<label key={type} className='flex items-center gap-2 cursor-pointer'>
						<input
							type='checkbox'
							data-testid={`type-toggle-${type}`}
							checked={state.enabledTypes.includes(type)}
							onChange={() => toggleType(type)}
							className='accent-[color:var(--fg)]'
						/>
						<span className='text-sm text-[color:var(--fg)]'>{TYPE_LABELS[type]}</span>
					</label>
				))}
			</div>

			<div className='flex flex-col gap-1 pt-1'>
				<label className='flex items-center gap-2 cursor-pointer'>
					<input
						type='checkbox'
						data-testid='toggle-orphans'
						checked={state.showOrphans}
						onChange={(e) => update({showOrphans: e.target.checked})}
						className='accent-[color:var(--fg)]'
					/>
					<span className='text-sm text-[color:var(--fg)]'>Show orphans</span>
				</label>
				<label className='flex items-center gap-2 cursor-pointer'>
					<input
						type='checkbox'
						data-testid='toggle-recent'
						checked={state.showRecent}
						onChange={(e) => update({showRecent: e.target.checked})}
						className='accent-[color:var(--fg)]'
					/>
					<span className='text-sm text-[color:var(--fg)]'>Recent only (&lt;7d)</span>
				</label>
				<label className='flex items-center gap-2 cursor-pointer'>
					<input
						type='checkbox'
						data-testid='toggle-ghosts'
						checked={state.showGhosts}
						onChange={(e) => update({showGhosts: e.target.checked})}
						className='accent-[color:var(--fg)]'
					/>
					<span className='text-sm text-[color:var(--fg)]'>Show ghost links</span>
				</label>
			</div>

			<div className='flex flex-col gap-1 pt-1'>
				<label className='text-xs text-[color:var(--fg-mute)]' htmlFor='excluded-paths-input'>
					Excluded paths (one glob per line)
				</label>
				<textarea
					id='excluded-paths-input'
					data-testid='excluded-paths'
					value={state.excludedPaths}
					onChange={(e) => update({excludedPaths: e.target.value})}
					rows={3}
					placeholder={'sessions/**\nnode_modules/**'}
					className='w-full rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-2 py-1 font-mono text-xs text-[color:var(--fg)] placeholder:text-[color:var(--fg-mute)] focus:outline-none focus:ring-1 focus:ring-[color:var(--line-strong)] resize-none'
				/>
			</div>
		</div>
	)
}
