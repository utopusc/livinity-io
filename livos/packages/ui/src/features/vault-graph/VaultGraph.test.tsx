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

vi.mock('react-force-graph-2d', () => ({
	default: vi.fn((props: any) => {
		lastGraphData = props.graphData
		lastOnNodeClick = props.onNodeClick
		return null
	}),
}))

// ── GraphNodeDetail mock — minimal stub so we can detect mount/unmount ────

vi.mock('./GraphNodeDetail', () => ({
	GraphNodeDetail: ({node, onClose}: {node: any; onClose: () => void}) => {
		return (
			<div data-testid='detail-drawer'>
				<span data-testid='detail-label'>{node.label}</span>
				<button data-testid='detail-close' onClick={onClose}>
					close
				</button>
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
})
