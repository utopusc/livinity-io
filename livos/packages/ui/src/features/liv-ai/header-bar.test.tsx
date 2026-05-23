// @vitest-environment jsdom
//
// Phase 199-07 Task 2 — header-bar.tsx tests.
//
// Locks the LivAiHeaderBar component contract (D-199-20 / D-199-21 /
// INV-199-02):
//
//   1. <h1 data-testid='liv-ai-header-title'> renders the brand string
//      literally as 'Liv AI' (INV-199-02 / D-199-02).
//   2. Mounting with selectedModel='grok-4.3' surfaces 'Grok 4.3' on the
//      LivAiModelPicker trigger — proves the value prop is threaded into
//      the picker (Plan 199-04 contract).
//   3. Clicking [data-testid='liv-ai-header-new-thread'] fires the
//      onNewThread callback exactly once.
//   4. Outer <header> has data-testid='liv-ai-header-bar'.
//   5. Outer <header> has class names enforcing D-199-21 layout:
//      h-12 (~48px tall), border-b, flex-row with the model picker on the
//      right (justify-between + items-center).
//
// Per LivOS UI testing precedent (Plan 30-02 → 199-04), the UI package has
// D-NO-NEW-DEPS — direct react-dom/client mount under jsdom. The real
// LivAiModelPicker is rendered (not mocked) so this test doubles as an
// integration check between header-bar and Plan 199-04's picker.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// jsdom doesn't ship PointerEvent; radix DropdownMenu (inside LivAiModelPicker)
// expects it. Shim mirrors the model-picker.test.tsx pattern.
if (typeof (globalThis as {PointerEvent?: unknown}).PointerEvent === 'undefined') {
	class PointerEventShim extends MouseEvent {
		pointerType: string
		constructor(type: string, props: PointerEventInit = {}) {
			super(type, props)
			this.pointerType = props.pointerType ?? 'mouse'
		}
	}
	;(globalThis as {PointerEvent?: unknown}).PointerEvent = PointerEventShim
}
if (!HTMLElement.prototype.hasPointerCapture) {
	HTMLElement.prototype.hasPointerCapture = () => false
}
if (!HTMLElement.prototype.releasePointerCapture) {
	HTMLElement.prototype.releasePointerCapture = () => {}
}
if (!HTMLElement.prototype.setPointerCapture) {
	HTMLElement.prototype.setPointerCapture = () => {}
}
if (!HTMLElement.prototype.scrollIntoView) {
	HTMLElement.prototype.scrollIntoView = () => {}
}

import {LivAiHeaderBar} from './header-bar'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

describe('LivAiHeaderBar — Phase 199-07', () => {
	it('Test 1: renders brand title literally as "Liv AI" (INV-199-02 / D-199-02)', () => {
		act(() => {
			root.render(
				<LivAiHeaderBar
					selectedModel='grok-4.20-0309-fast'
					onModelChange={() => {}}
					onNewThread={() => {}}
				/>,
			)
		})
		const title = document.querySelector(
			'[data-testid="liv-ai-header-title"]',
		)
		expect(title).not.toBeNull()
		expect(title!.textContent?.trim()).toBe('Liv AI')
		// Defense-in-depth: no rogue 'Liv ' / 'LivinityAI' / 'Livinity AI' nearby.
		expect(title!.textContent?.trim()).not.toBe('Liv')
		expect(title!.textContent?.trim()).not.toBe('LivinityAI')
		expect(title!.textContent?.trim()).not.toBe('Livinity AI')
	})

	it('Test 2: mounts LivAiModelPicker with current selection on the trigger', () => {
		act(() => {
			root.render(
				<LivAiHeaderBar
					selectedModel='grok-4.3'
					onModelChange={() => {}}
					onNewThread={() => {}}
				/>,
			)
		})
		const trigger = document.querySelector(
			'[data-testid="liv-ai-model-picker-trigger"]',
		)
		expect(trigger).not.toBeNull()
		// Trigger shows 'Grok 4.3' for selectedModel='grok-4.3' per Plan 199-04.
		expect(trigger!.textContent).toContain('Grok 4.3')
	})

	it('Test 3: clicking "+ New conversation" fires onNewThread exactly once', () => {
		const onNewThread = vi.fn()
		act(() => {
			root.render(
				<LivAiHeaderBar
					selectedModel='grok-4.20-0309-fast'
					onModelChange={() => {}}
					onNewThread={onNewThread}
				/>,
			)
		})
		const btn = document.querySelector(
			'[data-testid="liv-ai-header-new-thread"]',
		) as HTMLButtonElement | null
		expect(btn).not.toBeNull()
		act(() => {
			btn!.click()
		})
		expect(onNewThread).toHaveBeenCalledTimes(1)
	})

	it('Test 4: outer header element carries data-testid="liv-ai-header-bar"', () => {
		act(() => {
			root.render(
				<LivAiHeaderBar
					selectedModel='grok-4.20-0309-fast'
					onModelChange={() => {}}
					onNewThread={() => {}}
				/>,
			)
		})
		const header = document.querySelector('[data-testid="liv-ai-header-bar"]')
		expect(header).not.toBeNull()
		// Must be the <header> landmark for a11y (screen readers announce as banner).
		expect(header!.tagName.toLowerCase()).toBe('header')
	})

	it('Test 5: header layout enforces D-199-21 (h-12 + border-b + flex/justify-between)', () => {
		act(() => {
			root.render(
				<LivAiHeaderBar
					selectedModel='grok-4.20-0309-fast'
					onModelChange={() => {}}
					onNewThread={() => {}}
				/>,
			)
		})
		const header = document.querySelector(
			'[data-testid="liv-ai-header-bar"]',
		) as HTMLElement | null
		expect(header).not.toBeNull()
		const cls = header!.getAttribute('class') ?? ''
		// Height token — D-199-21 says ~48px → tailwind h-12.
		expect(cls).toMatch(/\bh-12\b/)
		// Bottom border separates header from the 2-column layout.
		expect(cls).toMatch(/\bborder-b\b/)
		// Flex row with right-aligned model picker + new-thread cluster.
		expect(cls).toMatch(/\bflex\b/)
		expect(cls).toMatch(/\bitems-center\b/)
		expect(cls).toMatch(/\bjustify-between\b/)
	})
})
