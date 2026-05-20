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

const NODE_COLORS: Record<GraphNode['type'], string> = {
	memory: '#06b6d4',
	session: '#a855f7',
	inbox: '#22c55e',
	agent: '#f59e0b',
	skill: '#3b82f6',
	command: '#ec4899',
	root: '#e5e5e5',
}

export function VaultGraph() {
	const [activeNode, setActiveNode] = useState<GraphNode | null>(null)

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
			<div className='flex h-full items-center justify-center'>
				Loading vault graph...
			</div>
		)
	}
	if (graphQ.error || !graphQ.data) {
		return (
			<div className='flex h-full items-center justify-center text-red-500'>
				Failed to load graph
			</div>
		)
	}

	return (
		<div className='relative h-full w-full'>
			{graphQ.data.truncated && (
				<div className='absolute left-2 top-2 z-10 rounded bg-amber-500/20 px-3 py-1 text-sm'>
					Vault exceeds 2000 files. Showing first 2000.
				</div>
			)}
			<button
				type='button'
				onClick={() => graphQ.refetch()}
				className='absolute right-2 top-2 z-10 rounded bg-bg-secondary px-3 py-1 text-sm'
			>
				Refresh
			</button>
			<ForceGraph2D
				graphData={{
					nodes: graphQ.data.nodes.map((n) => ({
						...n,
						color: NODE_COLORS[n.type],
					})),
					links: graphQ.data.edges.map((e) => ({
						source: e.source,
						target: e.target,
					})),
				}}
				nodeLabel='label'
				onNodeClick={(node) => setActiveNode(node as unknown as GraphNode)}
				cooldownTicks={100}
				linkColor={() => '#525252'}
				backgroundColor='transparent'
			/>
			{activeNode && (
				<GraphNodeDetail
					node={activeNode}
					onClose={() => setActiveNode(null)}
				/>
			)}
		</div>
	)
}
