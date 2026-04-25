import {useMemo} from 'react'
import yaml from 'js-yaml'
import {
	ReactFlow,
	Background,
	Controls,
	Handle,
	Position,
	MarkerType,
	type Node,
	type Edge,
	type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {IconRefresh, IconAlertTriangle, IconAlertCircle} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ----------- Types ---------------------------------------------------------

type ComposeNodeData = {
	label: string
	image: string
	ports: string[]
	networks: string[]
}

type ParseResult =
	| {error: string}
	| {nodes: Node<ComposeNodeData>[]; edges: Edge[]; networks: string[]}

// ----------- Custom node (defined at module scope) -------------------------
// Defining nodeTypes inside a component triggers a documented React Flow warning
// and remounts the renderer on every render, so we hoist it.

function ComposeServiceNode({data}: NodeProps<ComposeNodeData>) {
	return (
		<div className='min-w-[180px] rounded-md border border-border-default bg-surface-1 px-3 py-2 shadow-sm'>
			<Handle type='target' position={Position.Left} className='!bg-blue-500' />
			<div className='text-sm font-semibold text-text-primary'>{data.label}</div>
			<div className='truncate font-mono text-[11px] text-text-secondary' title={data.image}>
				{data.image}
			</div>
			{data.ports?.length > 0 && (
				<div className='mt-1 flex flex-wrap gap-1'>
					{data.ports.map((p) => (
						<span
							key={p}
							className='inline-flex rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 dark:text-blue-300'
						>
							{p}
						</span>
					))}
				</div>
			)}
			{data.networks?.length > 0 && (
				<div className='mt-1 flex flex-wrap gap-1'>
					{data.networks.map((n) => (
						<span
							key={n}
							className='inline-flex rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-700 dark:text-purple-300'
						>
							{n}
						</span>
					))}
				</div>
			)}
			<Handle type='source' position={Position.Right} className='!bg-blue-500' />
		</div>
	)
}

const nodeTypes = {compose: ComposeServiceNode}

// ----------- Helpers -------------------------------------------------------

function normalisePorts(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	const out: string[] = []
	for (const p of raw) {
		if (typeof p === 'string') {
			out.push(p)
		} else if (p && typeof p === 'object') {
			const obj = p as {published?: number | string; target?: number | string; protocol?: string; host_ip?: string}
			const target = obj.target ?? ''
			const published = obj.published ?? target
			const proto = obj.protocol ? `/${obj.protocol}` : ''
			if (target !== '') out.push(`${published}:${target}${proto}`)
		}
	}
	return out
}

function normaliseDependsOn(raw: unknown): string[] {
	if (!raw) return []
	if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
	if (typeof raw === 'object') return Object.keys(raw as Record<string, unknown>)
	return []
}

function normaliseNetworks(raw: unknown): string[] {
	if (!raw) return ['default']
	if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
	if (typeof raw === 'object') return Object.keys(raw as Record<string, unknown>)
	return ['default']
}

/**
 * Topologically sort services so dependees appear left of dependers.
 * Falls back to insertion order if the graph has cycles.
 */
function topoSort(serviceNames: string[], dependsOnMap: Map<string, string[]>): string[] {
	const inDegree = new Map<string, number>()
	const knownSet = new Set(serviceNames)
	for (const name of serviceNames) inDegree.set(name, 0)
	for (const [name, deps] of dependsOnMap) {
		for (const dep of deps) {
			if (!knownSet.has(dep)) continue
			inDegree.set(name, (inDegree.get(name) ?? 0) + 1)
		}
	}

	const queue: string[] = []
	for (const name of serviceNames) {
		if ((inDegree.get(name) ?? 0) === 0) queue.push(name)
	}

	const sorted: string[] = []
	while (queue.length > 0) {
		const node = queue.shift()!
		sorted.push(node)
		for (const [name, deps] of dependsOnMap) {
			if (deps.includes(node)) {
				inDegree.set(name, (inDegree.get(name) ?? 0) - 1)
				if (inDegree.get(name) === 0) queue.push(name)
			}
		}
	}

	if (sorted.length !== serviceNames.length) {
		// Cycle — fall back to insertion order.
		return serviceNames
	}
	return sorted
}

// ----------- Compose YAML parser ------------------------------------------

function parseCompose(yamlSrc: string): ParseResult {
	let parsed: unknown
	try {
		parsed = yaml.load(yamlSrc)
	} catch (e: any) {
		return {error: `Invalid YAML: ${e?.message ?? String(e)}`}
	}

	if (!parsed || typeof parsed !== 'object') {
		return {error: 'Compose file is empty or not an object'}
	}

	const root = parsed as {services?: unknown; networks?: unknown}
	if (!root.services || typeof root.services !== 'object' || Array.isArray(root.services)) {
		return {error: 'No services found in compose file'}
	}

	const services = root.services as Record<string, any>
	const serviceNames = Object.keys(services)
	if (serviceNames.length === 0) {
		return {error: 'No services found in compose file'}
	}

	// Build per-service info
	const dependsOnMap = new Map<string, string[]>()
	const portMap = new Map<string, string[]>()
	const imageMap = new Map<string, string>()
	const netMap = new Map<string, string[]>()
	const allNetworks = new Set<string>()

	for (const [name, svc] of Object.entries(services)) {
		const svcObj = (svc ?? {}) as Record<string, unknown>
		imageMap.set(name, typeof svcObj.image === 'string' ? svcObj.image : '<no image>')
		portMap.set(name, normalisePorts(svcObj.ports))
		dependsOnMap.set(name, normaliseDependsOn(svcObj.depends_on))
		const nets = normaliseNetworks(svcObj.networks)
		netMap.set(name, nets)
		nets.forEach((n) => allNetworks.add(n))
	}

	// Top-level networks key
	if (root.networks && typeof root.networks === 'object' && !Array.isArray(root.networks)) {
		Object.keys(root.networks as Record<string, unknown>).forEach((n) => allNetworks.add(n))
	}

	// Topological sort → grid layout
	const sorted = topoSort(serviceNames, dependsOnMap)
	const knownSet = new Set(serviceNames)

	// Compute "level" (longest dependency chain length) for column placement
	const level = new Map<string, number>()
	for (const name of sorted) {
		const deps = dependsOnMap.get(name) ?? []
		const known = deps.filter((d) => knownSet.has(d))
		if (known.length === 0) {
			level.set(name, 0)
		} else {
			level.set(name, Math.max(...known.map((d) => (level.get(d) ?? 0) + 1)))
		}
	}

	// Group by level → row inside each column
	const columnRows = new Map<number, number>()
	const nodes: Node<ComposeNodeData>[] = sorted.map((name) => {
		const col = level.get(name) ?? 0
		const row = columnRows.get(col) ?? 0
		columnRows.set(col, row + 1)
		return {
			id: name,
			type: 'compose',
			position: {x: col * 260, y: row * 160},
			data: {
				label: name,
				image: imageMap.get(name) ?? '<no image>',
				ports: portMap.get(name) ?? [],
				networks: netMap.get(name) ?? [],
			},
			sourcePosition: Position.Right,
			targetPosition: Position.Left,
		}
	})

	// Edges: depends_on
	const edges: Edge[] = []
	for (const [name, deps] of dependsOnMap) {
		for (const dep of deps) {
			if (!knownSet.has(dep)) continue
			edges.push({
				id: `${dep}->${name}`,
				source: dep,
				target: name,
				label: 'depends_on',
				labelStyle: {fontSize: 10},
				markerEnd: {type: MarkerType.ArrowClosed},
				animated: false,
			})
		}
	}

	return {nodes, edges, networks: Array.from(allNetworks)}
}

// ----------- Component -----------------------------------------------------

export function ComposeGraphViewer({stackName}: {stackName: string}) {
	const {data, isLoading, error} = trpcReact.docker.getStackCompose.useQuery(
		{name: stackName},
		{enabled: !!stackName, retry: false},
	)

	const parsed = useMemo<ParseResult | null>(
		() => (data?.yaml ? parseCompose(data.yaml) : null),
		[data?.yaml],
	)

	if (isLoading) {
		return (
			<div className='flex h-[320px] w-full items-center justify-center rounded-lg border border-border-default bg-surface-base'>
				<div className='flex items-center gap-2 text-sm text-text-secondary'>
					<IconRefresh size={16} className='animate-spin' />
					Loading compose…
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className='flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400'>
				<IconAlertCircle size={16} className='mt-0.5 shrink-0' />
				<div>
					<div className='font-medium'>Failed to load compose file</div>
					<div className='text-xs opacity-90'>{error.message}</div>
				</div>
			</div>
		)
	}

	if (parsed && 'error' in parsed) {
		return (
			<div className='space-y-2'>
				<div className='flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400'>
					<IconAlertTriangle size={16} className='mt-0.5 shrink-0' />
					<div>
						<div className='font-medium'>Failed to parse compose: {parsed.error}</div>
						<div className='text-xs opacity-80'>The Graph view needs a valid services section to render.</div>
					</div>
				</div>
				{data?.yaml && (
					<details className='rounded border border-border-default bg-surface-1 p-2 text-xs'>
						<summary className='cursor-pointer text-text-secondary'>Show raw compose YAML</summary>
						<pre className='mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-text-secondary'>
							{data.yaml}
						</pre>
					</details>
				)}
			</div>
		)
	}

	if (!parsed) {
		return null
	}

	return (
		<div className='space-y-2'>
			<div
				className={cn(
					'relative h-[480px] w-full rounded-lg border border-border-default bg-surface-base',
				)}
			>
				<ReactFlow
					nodes={parsed.nodes}
					edges={parsed.edges}
					nodeTypes={nodeTypes}
					fitView
					proOptions={{hideAttribution: true}}
					nodesDraggable
					nodesConnectable={false}
					elementsSelectable
				>
					<Background />
					<Controls showInteractive={false} />
				</ReactFlow>
			</div>
			{parsed.networks.length > 0 && (
				<div className='flex flex-wrap items-center gap-2 text-xs text-text-secondary'>
					<span className='font-medium uppercase tracking-wider'>Networks:</span>
					{parsed.networks.map((n) => (
						<span
							key={n}
							className='inline-flex rounded bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-700 dark:text-purple-300'
						>
							{n}
						</span>
					))}
				</div>
			)}
		</div>
	)
}
