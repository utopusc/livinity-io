// @vitest-environment jsdom
//
// Phase 190-02 — TerminalTabStrip + TerminalTab unit tests.
//
// 10 vitest assertions covering:
// T-190-02-01: renders N tab elements when given N TerminalTabInfo items (N=3)
// T-190-02-02: clicking a tab fires onSelect with that tab's id
// T-190-02-03: close button (data-testid="tab-close-{id}") click fires onClose with id
// T-190-02-04: active tab (activeId matches) has class 'border-b-2' in its className
// T-190-02-05: inactive tabs do NOT have class 'border-b-2'
// T-190-02-06: Sparkles icon button (data-testid="add-claude-btn") click fires onAddClaude
// T-190-02-07: Terminal icon button (data-testid="add-terminal-btn") click fires onAddBareTerminal
// T-190-02-08: strip container has class 'overflow-x-auto'
// T-190-02-09: tab labels appear as text content in the DOM
// T-190-02-10: source-text — TerminalTabStrip.tsx imports Sparkles, TerminalIcon, X from lucide-react

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {TerminalTabStrip} from './TerminalTabStrip'
import type {TerminalTabInfo} from './types'

// ── Test fixtures ─────────────────────────────────────────────────────────

const makeTabs = (n: number): TerminalTabInfo[] =>
	Array.from({length: n}, (_, i) => ({
		id: `tab-${i + 1}`,
		label: `Tab ${i + 1}`,
		type: 'claude' as const,
		sessionId: `liv-adhoc-claude-${i + 1}`,
	}))

// ── Test setup / teardown ─────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* already unmounted */
	}
	container.remove()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('TerminalTabStrip — Phase 190-02', () => {
	it('T-190-02-01: renders N=3 tab elements when given 3 TerminalTabInfo items', () => {
		const tabs = makeTabs(3)
		const onSelect = vi.fn()
		const onClose = vi.fn()
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId={null}
					onSelect={onSelect}
					onClose={onClose}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		// Each tab renders a button with data-testid="tab-{id}"
		const tabButtons = container.querySelectorAll('[data-testid^="tab-tab-"]')
		expect(tabButtons).toHaveLength(3)
	})

	it('T-190-02-02: clicking a tab fires onSelect with that tab\'s id', () => {
		const tabs = makeTabs(3)
		const onSelect = vi.fn()
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId={null}
					onSelect={onSelect}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		const tab2 = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement
		expect(tab2).not.toBeNull()
		act(() => {
			tab2.click()
		})
		expect(onSelect).toHaveBeenCalledWith('tab-2')
	})

	it('T-190-02-03: close button (data-testid="tab-close-{id}") click fires onClose with id', () => {
		const tabs = makeTabs(2)
		const onClose = vi.fn()
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId={null}
					onSelect={vi.fn()}
					onClose={onClose}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		const closeBtn = container.querySelector('[data-testid="tab-close-tab-1"]') as HTMLElement
		expect(closeBtn).not.toBeNull()
		act(() => {
			closeBtn.click()
		})
		expect(onClose).toHaveBeenCalledWith('tab-1')
	})

	it('T-190-02-04: active tab (activeId matches) has class "border-b-2" in its className', () => {
		const tabs = makeTabs(2)
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId='tab-1'
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		const activeTab = container.querySelector('[data-testid="tab-tab-1"]') as HTMLElement
		expect(activeTab?.className).toMatch(/border-b-2/)
	})

	it('T-190-02-05: inactive tabs do NOT have class "border-b-2"', () => {
		const tabs = makeTabs(3)
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId='tab-1'
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		const inactiveTab2 = container.querySelector('[data-testid="tab-tab-2"]') as HTMLElement
		const inactiveTab3 = container.querySelector('[data-testid="tab-tab-3"]') as HTMLElement
		expect(inactiveTab2?.className).not.toMatch(/border-b-2/)
		expect(inactiveTab3?.className).not.toMatch(/border-b-2/)
	})

	it('T-190-02-06: Sparkles icon button (data-testid="add-claude-btn") click fires onAddClaude', () => {
		const onAddClaude = vi.fn()
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={[]}
					activeId={null}
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={onAddClaude}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		const btn = container.querySelector('[data-testid="add-claude-btn"]') as HTMLElement
		expect(btn).not.toBeNull()
		act(() => {
			btn.click()
		})
		expect(onAddClaude).toHaveBeenCalledTimes(1)
	})

	it('T-190-02-07: Terminal icon button (data-testid="add-terminal-btn") click fires onAddBareTerminal', () => {
		const onAddBareTerminal = vi.fn()
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={[]}
					activeId={null}
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={onAddBareTerminal}
				/>,
			)
		})
		const btn = container.querySelector('[data-testid="add-terminal-btn"]') as HTMLElement
		expect(btn).not.toBeNull()
		act(() => {
			btn.click()
		})
		expect(onAddBareTerminal).toHaveBeenCalledTimes(1)
	})

	it('T-190-02-08: strip container has class "overflow-x-auto"', () => {
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={makeTabs(15)}
					activeId={null}
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		// The root element (first child of container) should have overflow-x-auto
		const strip = container.firstElementChild
		expect(strip?.className).toMatch(/overflow-x-auto/)
	})

	it('T-190-02-09: tab labels appear as text content in the DOM', () => {
		const tabs = makeTabs(2)
		act(() => {
			root.render(
				<TerminalTabStrip
					tabs={tabs}
					activeId={null}
					onSelect={vi.fn()}
					onClose={vi.fn()}
					onAddClaude={vi.fn()}
					onAddBareTerminal={vi.fn()}
				/>,
			)
		})
		expect(container.textContent).toMatch(/Tab 1/)
		expect(container.textContent).toMatch(/Tab 2/)
	})

	it('T-190-02-10: source-text — TerminalTabStrip.tsx imports Sparkles + TerminalIcon; TerminalTab.tsx imports X from lucide-react', () => {
		const SRC = readFileSync(resolve(__dirname, 'TerminalTabStrip.tsx'), 'utf8')
		const TAB_SRC = readFileSync(resolve(__dirname, 'TerminalTab.tsx'), 'utf8')
		// TerminalTabStrip imports Sparkles and Terminal (aliased as TerminalIcon)
		expect(SRC).toMatch(/Sparkles/)
		expect(SRC).toMatch(/Terminal/)
		expect(SRC).toMatch(/lucide-react/)
		// TerminalTab imports X (close icon)
		expect(TAB_SRC).toMatch(/\bX\b/)
		expect(TAB_SRC).toMatch(/lucide-react/)
	})
})
