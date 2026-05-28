// @vitest-environment jsdom
//
// Phase 246-04 Task 2 — TerminalTabBar component tests.
//
// Coverage (5 cases):
//   1. Renders one `[data-test-tab]` element per entry in `tabs` prop
//   2. Click tab → onActivate called with that tabKey
//   3. Click "+ New" → onCreate called
//   4. Right-click tab → context menu appears (with Rename + Close buttons)
//   5. Click "Close" in context menu → onClose called with that tabKey
//
// Uses raw react-dom/client + jsdom (same pattern as Phase 243
// PersistentTerminalPanel.test.tsx — no @testing-library dep in ui package).
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from 'react'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {TerminalTabBar, type TerminalTab} from './TerminalTabBar'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	if (root) {
		act(() => {
			root!.unmount()
		})
	}
	root = null
	if (container?.parentNode) container.parentNode.removeChild(container)
	container = null
})

function makeTabs(n: number): TerminalTab[] {
	return Array.from({length: n}, (_, i) => ({
		tabKey: `tab-${i + 1}`,
		name: `Terminal ${i + 1}`,
		status: 'live' as const,
	}))
}

function dispatchMouse(target: Element, type: string, init: MouseEventInit = {}) {
	const event = new MouseEvent(type, {bubbles: true, cancelable: true, ...init})
	target.dispatchEvent(event)
}

describe('TerminalTabBar — Phase 246-04', () => {
	it('1) renders one [data-test-tab] per entry in tabs prop (3 tabs → 3 elements)', () => {
		const tabs = makeTabs(3)
		act(() => {
			root!.render(
				<TerminalTabBar
					tabs={tabs}
					activeTabKey={'tab-1'}
					onActivate={vi.fn()}
					onCreate={vi.fn()}
					onRename={vi.fn()}
					onClose={vi.fn()}
				/>,
			)
		})
		const rendered = container!.querySelectorAll('[data-test-tab]')
		expect(rendered).toHaveLength(3)
		expect(rendered[0].getAttribute('data-test-tab')).toBe('tab-1')
		expect(rendered[2].getAttribute('data-test-tab')).toBe('tab-3')
	})

	it('2) click tab → onActivate called with that tabKey', () => {
		const onActivate = vi.fn()
		const tabs = makeTabs(2)
		act(() => {
			root!.render(
				<TerminalTabBar
					tabs={tabs}
					activeTabKey={'tab-1'}
					onActivate={onActivate}
					onCreate={vi.fn()}
					onRename={vi.fn()}
					onClose={vi.fn()}
				/>,
			)
		})
		const tab2 = container!.querySelector('[data-test-tab="tab-2"]') as HTMLElement
		expect(tab2).not.toBeNull()
		act(() => {
			dispatchMouse(tab2, 'click')
		})
		expect(onActivate).toHaveBeenCalledTimes(1)
		expect(onActivate).toHaveBeenCalledWith('tab-2')
	})

	it('3) click "+ New" → onCreate called', () => {
		const onCreate = vi.fn()
		const tabs = makeTabs(1)
		act(() => {
			root!.render(
				<TerminalTabBar
					tabs={tabs}
					activeTabKey={'tab-1'}
					onActivate={vi.fn()}
					onCreate={onCreate}
					onRename={vi.fn()}
					onClose={vi.fn()}
				/>,
			)
		})
		const createBtn = container!.querySelector(
			"[data-test='terminal-tab-create']",
		) as HTMLElement
		expect(createBtn).not.toBeNull()
		act(() => {
			dispatchMouse(createBtn, 'click')
		})
		expect(onCreate).toHaveBeenCalledTimes(1)
	})

	it('4) right-click tab → context menu appears with Rename + Close buttons', () => {
		const tabs = makeTabs(2)
		act(() => {
			root!.render(
				<TerminalTabBar
					tabs={tabs}
					activeTabKey={'tab-1'}
					onActivate={vi.fn()}
					onCreate={vi.fn()}
					onRename={vi.fn()}
					onClose={vi.fn()}
				/>,
			)
		})
		const tab1 = container!.querySelector('[data-test-tab="tab-1"]') as HTMLElement
		act(() => {
			dispatchMouse(tab1, 'contextmenu')
		})
		const menu = container!.querySelector(
			'[data-test-context-menu="tab-1"]',
		) as HTMLElement
		expect(menu).not.toBeNull()
		const buttonLabels = Array.from(menu!.querySelectorAll('button')).map((b) =>
			b.textContent?.trim(),
		)
		expect(buttonLabels).toContain('Rename')
		expect(buttonLabels).toContain('Close')
	})

	it('5) click "Close" in context menu → onClose called with that tabKey', () => {
		const onClose = vi.fn()
		const tabs = makeTabs(2)
		act(() => {
			root!.render(
				<TerminalTabBar
					tabs={tabs}
					activeTabKey={'tab-1'}
					onActivate={vi.fn()}
					onCreate={vi.fn()}
					onRename={vi.fn()}
					onClose={onClose}
				/>,
			)
		})
		const tab2 = container!.querySelector('[data-test-tab="tab-2"]') as HTMLElement
		act(() => {
			dispatchMouse(tab2, 'contextmenu')
		})
		const menu = container!.querySelector(
			'[data-test-context-menu="tab-2"]',
		) as HTMLElement
		expect(menu).not.toBeNull()
		const closeBtn = Array.from(menu!.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'Close',
		) as HTMLElement
		expect(closeBtn).not.toBeUndefined()
		act(() => {
			dispatchMouse(closeBtn, 'click')
		})
		expect(onClose).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledWith('tab-2')
	})
})
