// Phase 169-03 — VaultGraph React feature.
//
// Renders a force-directed graph of vault contents via `react-force-graph-2d`
// (D-NEW-DEPS-v35 authorizes this single new dep). Data source is
// `GET /api/vault/graph` (169-02 route), fetched via @tanstack/react-query.
// Click a node → GraphNodeDetail drawer slides in from the right and fetches
// the file content from `/api/vault/file?path=<id>`.
//
// Threat mitigations (component-side):
//  - T-169-03-01 Tampering: encodeURIComponent applied to node.id in the
//    detail drawer fetch URL (GraphNodeDetail.tsx).
//  - T-169-03-02 Info disclosure: file content rendered inside <pre> only —
//    no markdown parser, no dangerouslySetInnerHTML. Rich rendering is a
//    deferred polish task (169-CONTEXT L292).
//  - T-169-03-03 Spoofing: credentials:'include' on graph + file fetches.
//  - T-169-03-05 DoS: server caps at 2000 nodes; cooldownTicks=100 limits
//    force-simulation iterations.

import {useState, useRef, useEffect, useMemo} from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import {useQuery} from '@tanstack/react-query'

import {GraphNodeDetail} from './GraphNodeDetail'
import {
	detectTheme,
	getEdgeColor,
	getEdgeHoverColor,
	type GraphTheme,
} from './graph-palette'
import {GraphControls} from './GraphControls'
import {GraphSearchBar} from './GraphSearchBar'
import {FiltersSection} from './sections/FiltersSection'
import {GroupsSection, resolveNodeColor} from './sections/GroupsSection'
import {DisplaySection} from './sections/DisplaySection'
import {ForcesSection} from './sections/ForcesSection'
import {useGraphSettings} from './hooks/useGraphSettings'
import {bfsSubgraph} from './local-graph-mode'
import {DepthChip} from './DepthChip'

interface GraphNode {
	id: string
	label: string
	type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
	size: number
	mtime: number
	tags: string[]    // Phase 179-01: from frontmatter
	topDir: string    // Phase 179-01: first path segment
}

interface GraphEdge {
	source: string
	target: string
	type: 'wikilink' | 'directory'
}

interface GraphResponse {
	nodes: GraphNode[]
	edges: GraphEdge[]
	truncated: boolean
	totalFiles: number
}

export function VaultGraph() {
	const [activeNode, setActiveNode] = useState<GraphNode | null>(null)
	const [hoveredLink, setHoveredLink] = useState<{
		source: string
		target: string
	} | null>(null)
	const theme: GraphTheme = detectTheme()
	// Phase 179-05: settings + search state
	const fgRef = useRef<any>(null)
	const settings = useGraphSettings()
	const [matchSet, setMatchSet] = useState<Set<string>>(new Set())

	const graphQ = useQuery<GraphResponse>({
		queryKey: ['vault-graph'],
		queryFn: async () => {
			const res = await fetch('/api/vault/graph', {credentials: 'include'})
			if (!res.ok) throw new Error('graph fetch failed')
			return (await res.json()) as GraphResponse
		},
		staleTime: 60_000,
	})

	// Phase 179-05: apply d3Force settings without remounting ForceGraph2D.
	// Threat T-179-05-A: forces come from sliders with parseFloat+clamp guards.
	useEffect(() => {
		const fg = fgRef.current
		if (!fg) return
		fg.d3Force('charge')?.strength(settings.forces.repelStrength)
		fg.d3Force('center')?.strength(settings.forces.centerStrength)
		fg.d3Force('link')?.strength(settings.forces.linkStrength).distance(settings.forces.linkDistance)
	}, [settings.forces])

	// Phase 179-05: filter nodes by enabledTypes before passing to canvas.
	// Threat T-179-05-C: O(N) filter on ≤2000 items ~0.1ms.
	const filteredNodes = useMemo(() => {
		if (!graphQ.data) return []
		return graphQ.data.nodes.filter((n) =>
			settings.filters.enabledTypes.includes(n.type),
		)
	}, [graphQ.data, settings.filters.enabledTypes])

	// Phase 180-01: local graph mode state
	const [graphMode, setGraphMode] = useState<'global' | 'local'>('global')
	const [localFocusId, setLocalFocusId] = useState<string | null>(null)
	const [localDepth, setLocalDepth] = useState<number>(2)

	// Phase 180-01: BFS subgraph for local mode.
	// Threat T-180-01-A: depth clamped inside bfsSubgraph to [1,4].
	// Threat T-180-01-B: bfsSubgraph visited set prevents infinite loops on cycles.
	const localNodes = useMemo(() => {
		if (graphMode !== 'local' || !localFocusId || !graphQ.data) return filteredNodes
		const result = bfsSubgraph(
			{ nodes: filteredNodes, edges: graphQ.data.edges },
			localFocusId,
			localDepth,
		)
		return result.nodes
	}, [graphMode, localFocusId, localDepth, filteredNodes, graphQ.data])

	const localEdges = useMemo(() => {
		if (graphMode !== 'local' || !localFocusId || !graphQ.data) return graphQ.data?.edges ?? []
		const result = bfsSubgraph(
			{ nodes: filteredNodes, edges: graphQ.data.edges },
			localFocusId,
			localDepth,
		)
		return result.edges
	}, [graphMode, localFocusId, localDepth, filteredNodes, graphQ.data])

	if (graphQ.isLoading) {
		return (
			<div className='flex h-full items-center justify-center text-[color:var(--fg-mute)]'>
				Loading vault graph…
			</div>
		)
	}
	if (graphQ.error || !graphQ.data) {
		return (
			<div className='flex h-full items-center justify-center text-[color:var(--accent-red)]'>
				Failed to load graph
			</div>
		)
	}

	return (
		<div className='relative h-full w-full'>
			{graphQ.data.truncated && (
				<div
					data-testid='truncated-banner'
					className='absolute left-2 top-2 z-10 flex items-center gap-2 rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-1 text-sm text-[color:var(--fg-dim)]'
				>
					<span>Vault exceeds 2000 files. Showing first 2000.</span>
					<a
						href='#settings/vault-graph'
						data-testid='settings-link'
						className='underline text-[color:var(--fg)]'
					>
						Adjust limit in Settings
					</a>
				</div>
			)}
			<button
				type='button'
				data-testid='refresh-btn'
				onClick={() => graphQ.refetch()}
				className='absolute right-2 top-2 z-10 rounded border border-[color:var(--line-strong)] bg-[color:var(--bg-2)] px-3 py-1 text-sm text-[color:var(--fg)]'
			>
				Refresh
			</button>
			{/* Phase 179-05: search bar + controls panel */}
			<GraphSearchBar
				nodes={filteredNodes}
				onMatchChange={setMatchSet}
				onClear={() => setMatchSet(new Set())}
			/>
			{/* Phase 180-01: DepthChip — top-center pill when in local mode */}
			{graphMode === 'local' && localFocusId && (
				<DepthChip
					depth={localDepth}
					onDepthChange={(d) => setLocalDepth(d)}
					onBackToGlobal={() => {
						setGraphMode('global')
						setLocalFocusId(null)
					}}
				/>
			)}
			<GraphControls>
				<FiltersSection
					initialFilters={settings.filters}
					onFiltersChange={settings.setFilters}
				/>
				<GroupsSection
					initialGroups={settings.groups}
					onGroupChange={settings.setGroups}
				/>
				<DisplaySection
					initialState={settings.display}
					onDisplayChange={settings.setDisplay}
				/>
				<ForcesSection
					initialState={settings.forces}
					onForcesChange={settings.setForces}
				/>
			</GraphControls>
			<ForceGraph2D
				ref={fgRef}
				graphData={{
					// Phase 179-05: use filteredNodes with resolveNodeColor; matchSet opacity.
					// Phase 180-01: switched to localNodes/localEdges (BFS subset in local mode).
					// Threat T-179-05-A/D: resolveNodeColor uses clamped sliders + arithmetic only.
					nodes: localNodes.map((n) => {
						const color = resolveNodeColor(n, settings.groups.mode, theme)
						return {
							...n,
							color:
								matchSet.size > 0
									? matchSet.has(n.id)
										? color
										: color + '66' // 40% opacity for non-matching nodes
									: color,
						}
					}),
					links: localEdges.map((e) => ({
						source: e.source,
						target: e.target,
					})),
				}}
				nodeLabel='label'
				onNodeClick={(node: any) => {
					setActiveNode(node as unknown as GraphNode)
					// Phase 180-01: clicking a node enters local mode centred on that node.
					setGraphMode('local')
					setLocalFocusId(node.id)
				}}
				cooldownTicks={100}
				linkColor={(link: any) => {
					if (
						hoveredLink &&
						(link.source?.id ?? link.source) === hoveredLink.source &&
						(link.target?.id ?? link.target) === hoveredLink.target
					) {
						const srcNode = graphQ.data?.nodes.find(
							(n) => n.id === hoveredLink.source,
						)
						return srcNode
							? getEdgeHoverColor(srcNode.type, theme)
							: getEdgeColor(theme)
					}
					return getEdgeColor(theme)
				}}
				linkWidth={(link: any) => {
					if (
						hoveredLink &&
						(link.source?.id ?? link.source) === hoveredLink.source &&
						(link.target?.id ?? link.target) === hoveredLink.target
					) {
						return 1.4
					}
					return 0.5
				}}
				onLinkHover={(link: any) => {
					if (link) {
						const src =
							typeof link.source === 'object' ? link.source.id : link.source
						const tgt =
							typeof link.target === 'object' ? link.target.id : link.target
						setHoveredLink({source: src, target: tgt})
					} else {
						setHoveredLink(null)
					}
				}}
				backgroundColor='transparent'
			/>
			{activeNode && (
				<GraphNodeDetail
					node={activeNode}
					edges={graphQ.data.edges}
					onClose={() => setActiveNode(null)}
				/>
			)}
		</div>
	)
}
