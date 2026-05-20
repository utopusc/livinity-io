// Phase 178-04 — Floating Cmd+K search bar for vault-graph.
//
// Standalone component: this plan ships the search UI + matchNodes() pure
// helper without touching VaultGraph.tsx (wave-1 file-disjoint rule). The
// component emits a Set<string> of matching node ids via onMatchChange; the
// VaultGraph consumer (wired in a follow-on plan) uses that set to drop
// non-matching node opacity to 8% and bump matching radius by 1.15×.
//
// Operators (matchNodes):
//   bare text     → label substring match (case-insensitive)
//   `foo/bar`     → path (node.id) substring match when query contains '/'
//   `type:memory` → exact node.type match (case-insensitive)

import {useCallback, useEffect, useRef, useState} from 'react'

export type GraphNodeType =
	| 'memory'
	| 'session'
	| 'inbox'
	| 'agent'
	| 'skill'
	| 'command'
	| 'root'

export interface GraphNode {
	id: string
	label: string
	type: GraphNodeType
	size: number
	mtime: number
}

/**
 * Pure matcher — returns the set of node ids that match `query`.
 * Empty query → empty Set (downstream interprets empty as "no filter").
 */
export function matchNodes(query: string, nodes: GraphNode[]): Set<string> {
	const matches = new Set<string>()
	const q = query.trim().toLowerCase()
	if (q.length === 0) return matches

	if (q.startsWith('type:')) {
		const wanted = q.slice('type:'.length)
		for (const n of nodes) {
			if (n.type === wanted) matches.add(n.id)
		}
		return matches
	}

	if (q.includes('/')) {
		for (const n of nodes) {
			if (n.id.toLowerCase().includes(q)) matches.add(n.id)
		}
		return matches
	}

	for (const n of nodes) {
		if (n.label.toLowerCase().includes(q)) matches.add(n.id)
	}
	return matches
}

interface Props {
	nodes: GraphNode[]
	onMatchChange: (matches: Set<string>) => void
	onClear?: () => void
}

export function GraphSearchBar({nodes, onMatchChange, onClear}: Props) {
	const [value, setValue] = useState('')
	const inputRef = useRef<HTMLInputElement | null>(null)

	// Cmd+K / Ctrl+K global focus shortcut
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const handleChange = useCallback(
		(next: string) => {
			setValue(next)
			onMatchChange(matchNodes(next, nodes))
		},
		[nodes, onMatchChange],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				setValue('')
				onMatchChange(new Set())
				onClear?.()
				inputRef.current?.blur()
			}
		},
		[onMatchChange, onClear],
	)

	return (
		<div
			data-testid='graph-search-bar'
			className='absolute left-1/2 top-4 z-30 w-[480px] -translate-x-1/2'
		>
			<input
				ref={inputRef}
				data-testid='graph-search-input'
				type='text'
				value={value}
				onChange={(e) => handleChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder='Search vault…'
				className='w-full rounded-md border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-2 font-mono text-[13px] text-[color:var(--fg)] placeholder:text-[color:var(--fg-mute)] focus:outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]'
				aria-label='Search vault nodes'
			/>
		</div>
	)
}
