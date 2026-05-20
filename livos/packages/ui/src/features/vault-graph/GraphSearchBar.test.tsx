// @vitest-environment jsdom
//
// Phase 178-04 — GraphSearchBar tests (8 assertions: 5 matcher + 3 component).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {GraphSearchBar, matchNodes, type GraphNode} from './GraphSearchBar'

/**
 * React 18 controlled-input helper: setting `input.value = '...'` directly
 * bypasses React's internal value tracker, so the subsequent synthetic
 * onChange never fires. We must use the native HTMLInputElement value setter
 * (the prototype descriptor) and then dispatch a bubbling 'input' event so
 * React's synthetic event system observes the change.
 */
function setReactInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLInputElement.prototype,
		'value',
	)?.set
	setter?.call(input, value)
	input.dispatchEvent(new Event('input', {bubbles: true}))
}

const NODES: GraphNode[] = [
	{id: 'memory/foo.md',    label: 'foo',  type: 'memory',  size: 10, mtime: 0},
	{id: 'memory/bar.md',    label: 'bar',  type: 'memory',  size: 10, mtime: 0},
	{id: 'inbox/2026-01.md', label: '2026-01', type: 'inbox', size: 10, mtime: 0},
	{id: 'agent/baz.md',     label: 'baz',  type: 'agent',   size: 10, mtime: 0},
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	vi.restoreAllMocks()
})

describe('matchNodes (pure)', () => {
	it('empty query returns empty Set', () => {
		expect(matchNodes('', NODES).size).toBe(0)
		expect(matchNodes('   ', NODES).size).toBe(0)
	})

	it('bare-text query matches node.label (case-insensitive)', () => {
		const result = matchNodes('FOO', NODES)
		expect(result.size).toBe(1)
		expect(result.has('memory/foo.md')).toBe(true)
	})

	it('query containing "/" switches to path (node.id) substring match', () => {
		const result = matchNodes('memory/', NODES)
		expect(result.size).toBe(2)
		expect(result.has('memory/foo.md')).toBe(true)
		expect(result.has('memory/bar.md')).toBe(true)
	})

	it('"type:memory" matches all nodes with node.type === memory', () => {
		const result = matchNodes('type:memory', NODES)
		expect(result.size).toBe(2)
		expect(result.has('memory/foo.md')).toBe(true)
		expect(result.has('memory/bar.md')).toBe(true)
		expect(result.has('agent/baz.md')).toBe(false)
	})

	it('"TYPE:Inbox" is case-insensitive operator', () => {
		const result = matchNodes('TYPE:Inbox', NODES)
		expect(result.size).toBe(1)
		expect(result.has('inbox/2026-01.md')).toBe(true)
	})
})

describe('GraphSearchBar (component)', () => {
	it('Cmd+K focuses the input from anywhere on the page', () => {
		const onMatch = vi.fn()
		act(() => {
			root.render(<GraphSearchBar nodes={NODES} onMatchChange={onMatch} />)
		})
		const input = container.querySelector('[data-testid="graph-search-input"]') as HTMLInputElement
		expect(document.activeElement).not.toBe(input)
		// Fire keydown on window
		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', metaKey: true}))
		})
		expect(document.activeElement).toBe(input)
	})

	it('onMatchChange fires on every keystroke with matchNodes(value, nodes) output', () => {
		const onMatch = vi.fn()
		act(() => {
			root.render(<GraphSearchBar nodes={NODES} onMatchChange={onMatch} />)
		})
		const input = container.querySelector('[data-testid="graph-search-input"]') as HTMLInputElement
		act(() => {
			setReactInputValue(input, 'foo')
		})
		expect(onMatch).toHaveBeenCalled()
		const lastCall = onMatch.mock.calls[onMatch.mock.calls.length - 1][0] as Set<string>
		expect(lastCall instanceof Set).toBe(true)
		expect(lastCall.has('memory/foo.md')).toBe(true)
		expect(lastCall.size).toBe(1)
	})

	it('Esc clears input value, blurs input, fires onClear, and emits empty Set', () => {
		const onMatch = vi.fn()
		const onClear = vi.fn()
		act(() => {
			root.render(<GraphSearchBar nodes={NODES} onMatchChange={onMatch} onClear={onClear} />)
		})
		const input = container.querySelector('[data-testid="graph-search-input"]') as HTMLInputElement
		// Type something + focus
		act(() => {
			input.focus()
			setReactInputValue(input, 'foo')
		})
		expect(document.activeElement).toBe(input)
		expect(input.value).toBe('foo')
		onMatch.mockClear()
		// Press Esc
		act(() => {
			input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
		})
		expect(input.value).toBe('')
		expect(document.activeElement).not.toBe(input)
		expect(onClear).toHaveBeenCalledTimes(1)
		const lastCall = onMatch.mock.calls[onMatch.mock.calls.length - 1][0] as Set<string>
		expect(lastCall.size).toBe(0)
	})
})
