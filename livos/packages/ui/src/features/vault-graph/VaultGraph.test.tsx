// @vitest-environment jsdom
//
// Phase 169-03 — VaultGraph unit tests (8 assertions).
//
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed).
// Mocks: react-force-graph-2d (spy capturing graphData + onNodeClick),
// global fetch (controlled GraphResponse).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

// ── ForceGraph2D mock — capture graphData + expose onNodeClick handler ────

let lastGraphData: any = null
let lastOnNodeClick: ((node: any) => void) | null = null
let lastNodeVal: ((n: any) => number) | null = null
let lastLinkWidth: ((link: any) => number) | null = null
let lastLinkColor: ((link: any) => string) | null = null
let lastNodeCanvasObject: ((node: any, ctx: any) => void) | null = null

vi.mock('react-force-graph-2d', () => ({
	default: vi.fn((props: any) => {
		lastGraphData = props.graphData
		lastOnNodeClick = props.onNodeClick
		lastNodeVal = props.nodeVal ?? null
		lastLinkWidth = props.linkWidth ?? null
		lastLinkColor = props.linkColor ?? null
		lastNodeCanvasObject = props.nodeCanvasObject ?? null
		return null
	}),
}))

// ── GraphNodeDetail mock — minimal stub so we can detect mount/unmount ────

vi.mock('./GraphNodeDetail', () => ({
	GraphNodeDetail: ({node, onClose, onNavigateTo}: {node: any; onClose: () => void; onNavigateTo?: (id: string) => void}) => {
		return (
			<div data-testid='detail-drawer'>
				<span data-testid='detail-label'>{node.label}</span>
				<button data-testid='detail-close' onClick={onClose}>
					close
				</button>
				{onNavigateTo && (
					<button data-testid='detail-nav' onClick={() => onNavigateTo('test-node-id')}>
						nav
					</button>
				)}
			</div>
		)
	},
}))

import {VaultGraph} from './VaultGraph'

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>
let qc: QueryClient

function freshClient() {
	return new QueryClient({
		defaultOptions: {queries: {retry: false, gcTime: 0, staleTime: 0}},
	})
}

async function flushPromises() {
	// React Query v5 schedules state updates through a microtask chain
	// (queryClient.executeMutation → query.dispatch → react setState).
	// Multiple Promise.resolve() ticks aren't always enough on Windows runtimes —
	// we also wrap a setTimeout(0) so the macro-task fires once before assertion.
	await act(async () => {
		await new Promise((r) => setTimeout(r, 0))
		await Promise.resolve()
		await Promise.resolve()
		await new Promise((r) => setTimeout(r, 0))
		await Promise.resolve()
	})
}

function render() {
	act(() => {
		root.render(
			<QueryClientProvider client={qc}>
				<VaultGraph />
			</QueryClientProvider>,
		)
	})
}

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	fetchMock = vi.fn()
	;(globalThis as any).fetch = fetchMock
	lastGraphData = null
	lastOnNodeClick = null
	lastNodeVal = null
	lastLinkWidth = null
	lastLinkColor = null
	lastNodeCanvasObject = null
	qc = freshClient()
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	qc.clear()
	vi.restoreAllMocks()
})

describe('VaultGraph', () => {
	it('renders loading state while query is in flight', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		render()
		expect(container.textContent).toContain('Loading vault graph')
	})

	it('renders error state when fetch fails', async () => {
		fetchMock.mockResolvedValue({ok: false, status: 500})
		render()
		await flushPromises()
		expect(container.textContent).toContain('Failed to load graph')
	})

	it('shows truncated banner when response.truncated === true', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{
						id: 'a.md',
						label: 'a',
						type: 'memory',
						size: 10,
						mtime: 0,
					},
				],
				edges: [],
				truncated: true,
				totalFiles: 2000,
			}),
		})
		render()
		await flushPromises()
		expect(container.textContent).toContain(
			'Vault exceeds 2000 files. Showing first 2000.',
		)
	})

	it('does NOT show truncated banner when truncated === false', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(container.textContent).not.toContain('Vault exceeds')
	})

	it('Refresh button triggers a second fetch', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const refreshBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Refresh',
		) as HTMLButtonElement
		expect(refreshBtn).toBeTruthy()
		act(() => refreshBtn.click())
		await flushPromises()
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('clicking a node opens GraphNodeDetail drawer with the node', async () => {
		const node = {
			id: 'memory/foo.md',
			label: 'foo',
			type: 'memory',
			size: 10,
			mtime: 0,
		}
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [node],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(container.querySelector('[data-testid="detail-drawer"]')).toBeNull()
		act(() => {
			lastOnNodeClick?.(node)
		})
		expect(
			container.querySelector('[data-testid="detail-drawer"]'),
		).not.toBeNull()
		expect(
			container.querySelector('[data-testid="detail-label"]')?.textContent,
		).toBe('foo')
	})

	it('clicking detail Close button clears activeNode (drawer unmounts)', async () => {
		const node = {
			id: 'memory/foo.md',
			label: 'foo',
			type: 'memory',
			size: 10,
			mtime: 0,
		}
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [node],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		act(() => {
			lastOnNodeClick?.(node)
		})
		const closeBtn = container.querySelector(
			'[data-testid="detail-close"]',
		) as HTMLButtonElement
		act(() => closeBtn.click())
		expect(container.querySelector('[data-testid="detail-drawer"]')).toBeNull()
	})

	it('each ForceGraph2D node receives color from graph-palette getNodeColor', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0},
					{id: 'b.md', label: 'b', type: 'agent', size: 10, mtime: 0},
				],
				edges: [],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		expect(lastGraphData).not.toBeNull()
		// jsdom default body has no .dark / .iridescent class → light theme.
		expect(lastGraphData.nodes[0].color).toBe('oklch(0.56 0.10 245)') // memory, light
		expect(lastGraphData.nodes[1].color).toBe('oklch(0.62 0.10 180)') // agent, light
	})

	it('linkColor function returns var(--line-strong) for non-hovered edges', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0},
					{id: 'b.md', label: 'b', type: 'memory', size: 10, mtime: 0},
				],
				edges: [{source: 'a.md', target: 'b.md', type: 'wikilink'}],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		const ForceGraph2DMock = (await import('react-force-graph-2d'))
			.default as any
		const lastCall =
			ForceGraph2DMock.mock.calls[ForceGraph2DMock.mock.calls.length - 1]
		const props = lastCall[0]
		expect(typeof props.linkColor).toBe('function')
		// No hover state → baseline color from getEdgeColor.
		expect(
			props.linkColor({source: {id: 'a.md'}, target: {id: 'b.md'}}),
		).toBe('var(--line-strong)')
	})

	// ── Phase 178-03: chrome restyle assertions (3 new) ──────────────────────

	it('Refresh button uses bg-[color:var(--bg-2)] token class (no bg-bg-secondary literal)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		const btn = container.querySelector(
			'[data-testid="refresh-btn"]',
		) as HTMLButtonElement
		expect(btn).not.toBeNull()
		expect(btn.className).toContain('bg-[color:var(--bg-2)]')
		expect(btn.className).toContain('border-[color:var(--line-strong)]')
		expect(btn.className).not.toContain('bg-bg-secondary')
	})

	it('truncated banner includes "Adjust limit in Settings" link with href="#settings/vault-graph"', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0}],
				edges: [],
				truncated: true,
				totalFiles: 2000,
			}),
		})
		render()
		await flushPromises()
		const banner = container.querySelector('[data-testid="truncated-banner"]')
		expect(banner).not.toBeNull()
		expect(banner?.className).toContain('bg-[color:var(--bg-2)]')
		expect(banner?.className).not.toContain('bg-amber-500/20')
		const link = container.querySelector(
			'[data-testid="settings-link"]',
		) as HTMLAnchorElement
		expect(link).not.toBeNull()
		expect(link.textContent).toBe('Adjust limit in Settings')
		expect(link.getAttribute('href')).toBe('#settings/vault-graph')
	})

	it('error state uses text-[color:var(--accent-red)] (no text-red-500 literal)', async () => {
		fetchMock.mockResolvedValue({ok: false, status: 500})
		render()
		await flushPromises()
		const wrapper = Array.from(container.querySelectorAll('div')).find(
			(d) => d.textContent === 'Failed to load graph',
		)
		expect(wrapper).toBeTruthy()
		expect(wrapper?.className).toContain('text-[color:var(--accent-red)]')
		expect(wrapper?.className).not.toContain('text-red-500')
	})

	// ── Phase 179-05: GraphControls + GraphSearchBar wiring assertions ──────

	it('renders data-testid="controls-chip" (GraphControls is mounted)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(container.querySelector('[data-testid="controls-chip"]')).not.toBeNull()
	})

	it('renders data-testid="graph-search-bar" (GraphSearchBar is mounted)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(container.querySelector('[data-testid="graph-search-bar"]')).not.toBeNull()
	})

	// ── Phase 187-01: nodeVal degree-proportional sizing assertions ──────────

	it('nodeVal callback is passed to ForceGraph2D (function)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(typeof lastNodeVal).toBe('function')
	})

	it('nodeVal({degree:0}) returns >= 0.5 (isolated nodes stay visible)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(lastNodeVal).not.toBeNull()
		const result = lastNodeVal!({degree: 0})
		expect(result).toBeGreaterThanOrEqual(0.5)
	})

	it('nodeVal({degree:4}) returns Math.sqrt(4) * nodeSizeScale (default 1.0)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 4, wikiDegree: 2, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(lastNodeVal).not.toBeNull()
		const result = lastNodeVal!({degree: 4})
		// Math.sqrt(max(1,4)) * 1.0 = 2.0
		expect(result).toBeCloseTo(2.0, 5)
	})

	it('DisplaySection node-size slider label contains "degree" (open controls first)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		// Open the controls panel (click the chip button)
		const chip = container.querySelector('[data-testid="controls-chip"]') as HTMLButtonElement
		if (chip) act(() => chip.click())
		// Find the slider within the open panel
		const slider = container.querySelector('[data-testid="slider-node-size"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		// The outer flex div holding the slider also contains the label element.
		// The slider is inside a div; that div's parent div contains the label as first child.
		const sliderWrap = slider?.closest('.flex.flex-col.gap-1')
		const labelEl = sliderWrap?.querySelector('label')
		expect(labelEl?.textContent?.toLowerCase()).toContain('degree')
	})

	// ── Phase 187-02: nodeCanvasObject orphan ring assertions ────────────────

	it('nodeCanvasObject prop is a function passed to ForceGraph2D', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(typeof lastNodeCanvasObject).toBe('function')
	})

	it('nodeCanvasObject: orphan node (wikiDegree=0) triggers ctx.stroke', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(lastNodeCanvasObject).not.toBeNull()
		const strokeCalls: string[] = []
		let strokeStyleSet = ''
		const ctx = {
			beginPath: () => {},
			arc: () => {},
			fill: () => {},
			stroke: () => { strokeCalls.push('stroke') },
			get strokeStyle() { return strokeStyleSet },
			set strokeStyle(v: string) { strokeStyleSet = v },
			fillStyle: '',
			lineWidth: 0,
		}
		lastNodeCanvasObject!({id: 'a.md', degree: 0, wikiDegree: 0, color: 'oklch(0.56 0.10 245)', x: 10, y: 10}, ctx)
		expect(strokeCalls.length).toBeGreaterThan(0)
		expect(strokeStyleSet).toBe('oklch(0.55 0.20 20)') // light theme orphan ring color
	})

	it('nodeCanvasObject: connected node (wikiDegree>0) does NOT trigger ctx.stroke', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 2, wikiDegree: 2, tags: [], topDir: 'root'}],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		expect(lastNodeCanvasObject).not.toBeNull()
		const strokeCalls: string[] = []
		const ctx = {
			beginPath: () => {},
			arc: () => {},
			fill: () => {},
			stroke: () => { strokeCalls.push('stroke') },
			strokeStyle: '',
			fillStyle: '',
			lineWidth: 0,
		}
		lastNodeCanvasObject!({id: 'a.md', degree: 2, wikiDegree: 2, color: 'oklch(0.56 0.10 245)', x: 10, y: 10}, ctx)
		expect(strokeCalls.length).toBe(0)
	})

	// ── Phase 187-04: semantic edge thickness assertions ─────────────────────

	it('linkWidth returns 1.5 for wikilink edge with weight=1', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 1, tags: [], topDir: 'root'},
					{id: 'b.md', label: 'b', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 1, tags: [], topDir: 'root'},
				],
				edges: [{source: 'a.md', target: 'b.md', type: 'wikilink', weight: 1}],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		expect(lastLinkWidth).not.toBeNull()
		const result = lastLinkWidth!({_edge: {type: 'wikilink', weight: 1}})
		expect(result).toBeCloseTo(1.5, 5) // 1.2 + 1*0.3
	})

	it('linkWidth returns 0.3 for directory edge', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 0, tags: [], topDir: 'root'},
					{id: 'b.md', label: 'b', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 0, tags: [], topDir: 'root'},
				],
				edges: [{source: 'a.md', target: 'b.md', type: 'directory', weight: 1}],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		expect(lastLinkWidth).not.toBeNull()
		const result = lastLinkWidth!({_edge: {type: 'directory', weight: 1}})
		expect(result).toBeCloseTo(0.3, 5)
	})

	it('linkWidth returns 1.8 for wikilink edge with weight=2', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 1, tags: [], topDir: 'root'},
					{id: 'b.md', label: 'b', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 1, tags: [], topDir: 'root'},
				],
				edges: [{source: 'a.md', target: 'b.md', type: 'wikilink', weight: 2}],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		expect(lastLinkWidth).not.toBeNull()
		const result = lastLinkWidth!({_edge: {type: 'wikilink', weight: 2}})
		expect(result).toBeCloseTo(1.8, 5) // 1.2 + 2*0.3
	})

	it('linkColor for directory edge is not var(--line-strong) (gets muted rgba)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 0, tags: [], topDir: 'root'},
					{id: 'b.md', label: 'b', type: 'memory', size: 10, mtime: 0, degree: 1, wikiDegree: 0, tags: [], topDir: 'root'},
				],
				edges: [{source: 'a.md', target: 'b.md', type: 'directory', weight: 1}],
				truncated: false,
				totalFiles: 2,
			}),
		})
		render()
		await flushPromises()
		expect(lastLinkColor).not.toBeNull()
		const dirColor = lastLinkColor!({_edge: {type: 'directory', weight: 1}})
		expect(dirColor).not.toBe('var(--line-strong)')
		// Should be an rgba value
		expect(dirColor).toContain('rgba')
	})

	// ── Phase 187-03: handleNavigateTo assertions ────────────────────────────

	it('handleNavigateTo: GraphNodeDetail receives onNavigateTo prop (detail-nav renders)', async () => {
		const node = {id: 'memory/foo.md', label: 'foo', type: 'memory' as const, size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [] as string[], topDir: 'root'}
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [node],
				edges: [],
				truncated: false,
				totalFiles: 1,
			}),
		})
		render()
		await flushPromises()
		// Click node to open detail drawer
		act(() => { lastOnNodeClick?.(node) })
		// The mocked GraphNodeDetail renders detail-nav when onNavigateTo is passed
		const navBtn = container.querySelector('[data-testid="detail-nav"]') as HTMLButtonElement
		expect(navBtn).not.toBeNull()
		// Clicking it should not crash (graceful no-op since fgRef not injectable in test)
		expect(() => act(() => navBtn.click())).not.toThrow()
	})

	it('handleNavigateTo with unknown id is a no-op (no crash)', async () => {
		const node = {id: 'memory/foo.md', label: 'foo', type: 'memory' as const, size: 10, mtime: 0, degree: 0, wikiDegree: 0, tags: [] as string[], topDir: 'root'}
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ nodes: [node], edges: [], truncated: false, totalFiles: 1 }),
		})
		render()
		await flushPromises()
		act(() => { lastOnNodeClick?.(node) })
		const navBtn = container.querySelector('[data-testid="detail-nav"]') as HTMLButtonElement
		// handleNavigateTo calls fgRef.current?.graphData() — fgRef.current is null in test,
		// so it should gracefully no-op without throwing
		expect(() => { if (navBtn) act(() => navBtn.click()) }).not.toThrow()
	})

	it('filteredNodes only includes nodes whose type is in filters.enabledTypes', async () => {
		// Pre-set localStorage so only 'memory' type is enabled
		window.localStorage.setItem(
			'liv:vault-graph:settings:filters',
			JSON.stringify({
				enabledTypes: ['memory'],
				showOrphans: true,
				showRecent: false,
				showGhosts: true,
				excludedPaths: '',
			}),
		)
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				nodes: [
					{id: 'a.md', label: 'a', type: 'memory', size: 10, mtime: 0, tags: [], topDir: 'root'},
					{id: 'b.md', label: 'b', type: 'agent', size: 10, mtime: 0, tags: [], topDir: 'root'},
					{id: 'c.md', label: 'c', type: 'session', size: 10, mtime: 0, tags: [], topDir: 'root'},
				],
				edges: [],
				truncated: false,
				totalFiles: 3,
			}),
		})
		render()
		await flushPromises()
		// ForceGraph2D mock captures lastGraphData — only memory nodes should be present
		expect(lastGraphData).not.toBeNull()
		expect(lastGraphData.nodes).toHaveLength(1)
		expect(lastGraphData.nodes[0].id).toBe('a.md')
	})
})
