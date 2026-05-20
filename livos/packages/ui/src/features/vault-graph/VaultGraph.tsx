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

import {useState} from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import {useQuery} from '@tanstack/react-query'

import {GraphNodeDetail} from './GraphNodeDetail'
import {
	detectTheme,
	getEdgeColor,
	getEdgeHoverColor,
	getNodeColor,
	type GraphTheme,
} from './graph-palette'

interface GraphNode {
	id: string
	label: string
	type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
	size: number
	mtime: number
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

	const graphQ = useQuery<GraphResponse>({
		queryKey: ['vault-graph'],
		queryFn: async () => {
			const res = await fetch('/api/vault/graph', {credentials: 'include'})
			if (!res.ok) throw new Error('graph fetch failed')
			return (await res.json()) as GraphResponse
		},
		staleTime: 60_000,
	})

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
			<ForceGraph2D
				graphData={{
					nodes: graphQ.data.nodes.map((n) => ({
						...n,
						color: getNodeColor(n.type, theme),
					})),
					links: graphQ.data.edges.map((e) => ({
						source: e.source,
						target: e.target,
					})),
				}}
				nodeLabel='label'
				onNodeClick={(node) => setActiveNode(node as unknown as GraphNode)}
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
