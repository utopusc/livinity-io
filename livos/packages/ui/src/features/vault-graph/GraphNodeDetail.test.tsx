// @vitest-environment jsdom
//
// Phase 178-02 — GraphNodeDetail rewrite tests (10 assertions).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Mock streamdown — capture children + class
vi.mock('streamdown', () => ({
	Streamdown: ({children, className}: {children: string; className?: string}) => (
		<div data-testid='streamdown' data-classname={className}>
			{children}
		</div>
	),
}))

import {GraphNodeDetail} from './GraphNodeDetail'

const NODE = {
	id: 'memory/foo.md',
	label: 'foo',
	type: 'memory' as const,
	size: 100,
	mtime: 1700000000000,
}

const EDGES = [
	{source: 'memory/bar.md', target: 'memory/foo.md', type: 'wikilink' as const},
	{source: 'memory/baz.md', target: 'memory/foo.md', type: 'wikilink' as const},
	{source: 'memory/foo.md', target: 'memory/qux.md', type: 'wikilink' as const},
	{source: 'memory/foo.md', target: 'memory/quux.md', type: 'directory' as const},
	{source: 'memory/other.md', target: 'memory/unrelated.md', type: 'wikilink' as const},
]

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

async function flushPromises() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
}

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	fetchMock = vi.fn()
	;(globalThis as any).fetch = fetchMock
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	vi.restoreAllMocks()
})

describe('GraphNodeDetail (178-02)', () => {
	it('renders type pill with uppercase Geist Mono 11px', async () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		const pill = container.querySelector('[data-testid="type-pill"]')
		expect(pill?.textContent).toBe('memory')
		expect(pill?.className).toMatch(/font-mono/)
		expect(pill?.className).toMatch(/uppercase/)
		expect(pill?.className).toMatch(/text-\[11px\]/)
	})

	it('renders h3 filename with text-[17px] font-semibold', async () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		const h3 = container.querySelector('h3')
		expect(h3?.textContent).toBe('foo')
		expect(h3?.className).toMatch(/text-\[17px\]/)
		expect(h3?.className).toMatch(/font-semibold/)
	})

	it('fetches /api/vault/file with encoded path on mount', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`/api/vault/file?path=${encodeURIComponent('memory/foo.md')}`)
		expect(init.credentials).toBe('include')
	})

	it('renders content via <Streamdown> (not <pre>) on success', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({path: 'memory/foo.md', content: '# hello\n\nbody **bold**'}),
		})
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		await flushPromises()
		const sd = container.querySelector('[data-testid="streamdown"]')
		expect(sd).not.toBeNull()
		expect(sd?.textContent).toBe('# hello\n\nbody **bold**')
		expect(container.querySelector('pre')).toBeNull()
	})

	it('shows error state on non-OK fetch', async () => {
		fetchMock.mockResolvedValue({ok: false, status: 404, json: async () => ({})})
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		await flushPromises()
		expect(container.textContent).toContain('Failed to load')
		expect(container.textContent).toContain('HTTP 404')
	})

	it('Close button invokes onClose', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		const onClose = vi.fn()
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={onClose} />)
		})
		const btn = container.querySelector('button[aria-label="Close detail"]') as HTMLButtonElement
		act(() => btn.click())
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('Backlinks section count === edges where target === node.id', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={EDGES} onClose={() => {}} />)
		})
		const heading = container.querySelector('[data-testid="backlinks-section"] h4')
		expect(heading?.textContent).toBe('Backlinks (2)')
		const items = container.querySelectorAll('[data-testid="backlinks-list"] li')
		expect(items.length).toBe(2)
		expect(items[0].textContent).toBe('memory/bar.md')
		expect(items[1].textContent).toBe('memory/baz.md')
	})

	it('Outgoing section count === edges where source === node.id (with type label)', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={EDGES} onClose={() => {}} />)
		})
		const heading = container.querySelector('[data-testid="outgoing-section"] h4')
		expect(heading?.textContent).toBe('Outgoing (2)')
		const items = container.querySelectorAll('[data-testid="outgoing-list"] li')
		expect(items.length).toBe(2)
		expect(items[0].textContent).toBe('memory/qux.md (wikilink)')
		expect(items[1].textContent).toBe('memory/quux.md (directory)')
	})

	it('shows "No backlinks" + "No outgoing links" when edges array empty', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		expect(container.querySelector('[data-testid="backlinks-section"]')?.textContent).toContain('No backlinks')
		expect(container.querySelector('[data-testid="outgoing-section"]')?.textContent).toContain('No outgoing links')
	})

	it('scrolls body to top when node.id changes (scroll-on-focus)', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({path: 'x', content: 'x'}),
		})
		act(() => {
			root.render(<GraphNodeDetail node={NODE} edges={[]} onClose={() => {}} />)
		})
		await flushPromises()
		const body = container.querySelector('[data-testid="detail-body"]') as HTMLDivElement
		// Simulate user scrolling down
		body.scrollTop = 200
		expect(body.scrollTop).toBe(200)
		// Re-render with different node.id
		const NODE2 = {...NODE, id: 'memory/bar.md', label: 'bar'}
		act(() => {
			root.render(<GraphNodeDetail node={NODE2} edges={[]} onClose={() => {}} />)
		})
		await flushPromises()
		expect(body.scrollTop).toBe(0)
	})
})
