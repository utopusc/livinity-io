// @vitest-environment jsdom
//
// Phase 169-03 — GraphNodeDetail unit tests (6 assertions).
//
// Pattern: createRoot + act() — mirrors CcTerminal.test.tsx (D-NEW-DEPS-v35:
// @testing-library/react NOT installed in @livos/ui).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {GraphNodeDetail} from './GraphNodeDetail'

const NODE = {
	id: 'memory/foo.md',
	label: 'foo',
	type: 'memory' as const,
	size: 100,
	mtime: 1700000000000,
}

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

// Helper: yield to microtasks so pending fetch promises resolve.
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

describe('GraphNodeDetail', () => {
	it('renders heading with node.label', async () => {
		fetchMock.mockReturnValue(new Promise(() => {})) // never resolves — stays loading
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={() => {}} />)
		})
		const heading = container.querySelector('h3')
		expect(heading?.textContent).toBe('foo')
	})

	it('on mount fetches /api/vault/file with encoded path + credentials:include', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={() => {}} />)
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`/api/vault/file?path=${encodeURIComponent('memory/foo.md')}`)
		expect(init.credentials).toBe('include')
	})

	it('shows loading state while fetch pending', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={() => {}} />)
		})
		expect(container.textContent).toContain('Loading')
	})

	it('renders file content in <pre> on successful fetch', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({path: 'memory/foo.md', content: '# hello world\n'}),
		})
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={() => {}} />)
		})
		await flushPromises()
		const pre = container.querySelector('pre')
		expect(pre?.textContent).toBe('# hello world\n')
	})

	it('renders error state on non-OK fetch response', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({error: 'file not found'}),
		})
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={() => {}} />)
		})
		await flushPromises()
		expect(container.textContent).toContain('Failed to load')
		expect(container.textContent).toContain('HTTP 404')
	})

	it('clicking Close button invokes onClose prop', () => {
		fetchMock.mockReturnValue(new Promise(() => {}))
		const onClose = vi.fn()
		act(() => {
			root.render(<GraphNodeDetail node={NODE} onClose={onClose} />)
		})
		const closeBtn = container.querySelector(
			'button[aria-label="Close detail"]',
		) as HTMLButtonElement
		act(() => closeBtn.click())
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
