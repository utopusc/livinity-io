// Phase 179-03 — Groups section inside GraphControls panel.
// 4-mode radio selector (by-type/by-folder/by-tag/custom) with auto-color assignment.
// Persists mode to localStorage key liv:vault-graph:settings:groups.
//
// Security: hashToOklch input (topDir, tag) is vault-relative path or frontmatter string —
// no code execution path. Output is an OKLCH literal consumed by canvas paint context.

import {useState} from 'react'

import {getNodeColor, type GraphNodeType, type GraphTheme} from '../graph-palette'

export type GroupMode = 'by-type' | 'by-folder' | 'by-tag' | 'custom'

export interface GroupsState {
	mode: GroupMode
	customRows: Array<{query: string; color: string}>
}

export const defaultGroups: GroupsState = {
	mode: 'by-type',
	customRows: [],
}

export const GROUPS_KEY = (userId?: string): string =>
	userId
		? `liv:vault-graph:settings:groups:${userId}`
		: 'liv:vault-graph:settings:groups'

// Deterministic hue from string — djb2 hash → hue in [0, 360]. Returns OKLCH literal.
// Threat T-179-03-A: input is vault-relative path/tag; output is numeric hash % 360 → OKLCH literal.
export function hashToOklch(s: string, theme: GraphTheme): string {
	let hash = 5381
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 33) ^ s.charCodeAt(i)
	}
	const hue = Math.abs(hash) % 360
	const L = theme === 'dark' ? 0.70 : theme === 'iridescent' ? 0.65 : 0.60
	const C = theme === 'iridescent' ? 0.13 : 0.11
	return `oklch(${L} ${C} ${hue})`
}

// Main export consumed by VaultGraph canvas.
// Returns an OKLCH color string appropriate for the node given current group mode.
export function resolveNodeColor(
	node: {type: GraphNodeType; topDir: string; tags: string[]},
	mode: GroupMode,
	theme: GraphTheme,
): string {
	switch (mode) {
		case 'by-type':
			return getNodeColor(node.type, theme)
		case 'by-folder':
			return hashToOklch(node.topDir || 'root', theme)
		case 'by-tag':
			return hashToOklch(node.tags[0] ?? node.topDir ?? 'root', theme)
		case 'custom':
			// Custom rows matching deferred to Phase 180 — fall back to by-type
			return getNodeColor(node.type, theme)
	}
}

const MODE_LABELS: Record<GroupMode, string> = {
	'by-type': 'By Type',
	'by-folder': 'By Folder',
	'by-tag': 'By Tag',
	custom: 'Custom',
}

const MODES: GroupMode[] = ['by-type', 'by-folder', 'by-tag', 'custom']

interface Props {
	initialGroups?: Partial<GroupsState>
	userId?: string
	onGroupChange?: (g: GroupsState) => void
}

export function GroupsSection({initialGroups, userId, onGroupChange}: Props) {
	const [state, setState] = useState<GroupsState>({
		...defaultGroups,
		...initialGroups,
	})

	function setMode(mode: GroupMode) {
		const next = {...state, mode}
		setState(next)
		onGroupChange?.(next)
		localStorage.setItem(GROUPS_KEY(userId), JSON.stringify(next))
	}

	return (
		<div className='flex flex-col gap-2 p-3'>
			<p className='text-xs font-medium text-[color:var(--fg-mute)] uppercase tracking-wide'>
				Groups
			</p>
			{MODES.map((m) => (
				<label key={m} className='flex items-center gap-2 cursor-pointer'>
					<input
						type='radio'
						name='group-mode'
						data-testid={`group-mode-${m}`}
						checked={state.mode === m}
						onChange={() => setMode(m)}
						className='accent-[color:var(--fg)]'
					/>
					<span className='text-sm text-[color:var(--fg)] transition-colors duration-300'>
						{MODE_LABELS[m]}
					</span>
				</label>
			))}
		</div>
	)
}
