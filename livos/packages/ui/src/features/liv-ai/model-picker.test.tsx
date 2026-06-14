// @vitest-environment jsdom
//
// Phase 199-04 Task 3 — model-picker.tsx tests (TDD RED).
//
// 7 cases lock the LivAiModelPicker contract:
//
//   1. Trigger renders the current model name for value='grok-4.20-0309-non-reasoning'.
//   2. Trigger renders 'Grok 4.3' for value='grok-4.3'.
//   3. Clicking the trigger opens the menu (4 items appear).
//   4. Clicking the grok-4.3 item fires onChange once with 'grok-4.3'.
//   5. Clicking the grok-4.20-0309-reasoning item fires onChange once
//      with 'grok-4.20-0309-reasoning'.
//   6. With value='grok-4.3' and menu open, the grok-4.3 item shows the
//      <Check> svg while non-selected items show their model Icon.
//   7. Escape closes the menu (radix DropdownMenu default).
//
// Per LivOS UI testing precedent (Plan 30-02 → 198-06), the UI package has
// D-NO-NEW-DEPS — `@testing-library/react` and `@testing-library/user-event`
// are NOT installed. Tests use direct react-dom/client mounts + manual DOM
// events (click via .click(), keyboard via dispatchEvent KeyboardEvent).

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Radix DropdownMenu uses Pointer Events under the hood; jsdom doesn't ship
// PointerEvent. Shim minimally — radix only reads .pointerType + button.
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

// HTMLElement.hasPointerCapture / scrollIntoView aren't in jsdom either.
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

import {LivAiModelPicker} from './model-picker'

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

function findTrigger(): HTMLButtonElement {
	const el = document.querySelector(
		'[data-testid="liv-ai-model-picker-trigger"]',
	) as HTMLButtonElement | null
	expect(el).not.toBeNull()
	return el!
}

function openMenu(): void {
	const trigger = findTrigger()
	// Radix DropdownMenu opens on pointerdown (not click) — see
	// `@radix-ui/react-menu` source `composeEventHandlers` chain. Under
	// jsdom we must dispatch a pointerdown that matches the
	// Radix-recognized predicate (button=0 + pointerType=mouse).
	act(() => {
		trigger.dispatchEvent(
			new (globalThis as {PointerEvent: typeof MouseEvent}).PointerEvent(
				'pointerdown',
				{bubbles: true, cancelable: true, button: 0, pointerType: 'mouse'} as PointerEventInit,
			),
		)
		// Radix's MenuTrigger also responds to onClick as a fallback path —
		// fire it so any focus-management side effects also resolve.
		trigger.click()
	})
}

function clickItem(el: HTMLElement): void {
	// DropdownMenuItem listens to pointerup AND click. Dispatch both for
	// radix robustness under jsdom (some radix versions short-circuit on
	// pointerup; others on click).
	act(() => {
		el.dispatchEvent(
			new (globalThis as {PointerEvent: typeof MouseEvent}).PointerEvent(
				'pointerdown',
				{bubbles: true, cancelable: true, button: 0, pointerType: 'mouse'} as PointerEventInit,
			),
		)
		el.dispatchEvent(
			new (globalThis as {PointerEvent: typeof MouseEvent}).PointerEvent(
				'pointerup',
				{bubbles: true, cancelable: true, button: 0, pointerType: 'mouse'} as PointerEventInit,
			),
		)
		el.click()
	})
}

describe('LivAiModelPicker (Phase 199-04)', () => {
	it('Test 1: renders trigger with current model name for value=grok-4.20-0309-non-reasoning', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(
				<LivAiModelPicker value='grok-4.20-0309-non-reasoning' onChange={onChange} />,
			)
		})
		const trigger = findTrigger()
		expect(trigger.textContent).toContain('Grok 4.20')
	})

	it('Test 2: renders trigger with Grok 4.3 for value=grok-4.3', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(<LivAiModelPicker value='grok-4.3' onChange={onChange} />)
		})
		const trigger = findTrigger()
		expect(trigger.textContent).toContain('Grok 4.3')
	})

	it('Test 3: clicking trigger opens menu with all 3 item testids', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(
				<LivAiModelPicker value='grok-4.20-0309-non-reasoning' onChange={onChange} />,
			)
		})
		openMenu()

		// Radix renders the content in a portal attached to document.body.
		const ids = [
			'grok-4.20-0309-non-reasoning',
			'grok-4.20-0309-reasoning',
			'grok-4.3',
		]
		for (const id of ids) {
			const item = document.querySelector(
				`[data-testid="liv-ai-model-picker-item-${id}"]`,
			)
			expect(item, `expected item ${id} in DOM after open`).not.toBeNull()
		}
	})

	it('Test 4: clicking grok-4.3 item fires onChange once with grok-4.3', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(
				<LivAiModelPicker value='grok-4.20-0309-non-reasoning' onChange={onChange} />,
			)
		})
		openMenu()

		const item = document.querySelector(
			'[data-testid="liv-ai-model-picker-item-grok-4.3"]',
		) as HTMLElement
		expect(item).not.toBeNull()
		clickItem(item)

		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenCalledWith('grok-4.3')
	})

	it('Test 5: clicking grok-4.20-0309-reasoning fires onChange once with that id', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(
				<LivAiModelPicker value='grok-4.20-0309-non-reasoning' onChange={onChange} />,
			)
		})
		openMenu()

		const item = document.querySelector(
			'[data-testid="liv-ai-model-picker-item-grok-4.20-0309-reasoning"]',
		) as HTMLElement
		expect(item).not.toBeNull()
		clickItem(item)

		expect(onChange).toHaveBeenCalledTimes(1)
		expect(onChange).toHaveBeenCalledWith('grok-4.20-0309-reasoning')
	})

	it('Test 6: with value=grok-4.3 open, selected item shows Check while others show their model Icon', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(<LivAiModelPicker value='grok-4.3' onChange={onChange} />)
		})
		openMenu()

		// lucide-react v0.288.0 does NOT add a `lucide-<kebab>` class —
		// only the caller-provided className. We discriminate by inner
		// geometry instead: Check renders a <polyline points="20 6 9 17 4 12">,
		// Zap renders a <polygon points="13 2 ...">, Crown renders a <path d="m2 4 ...">.
		// (Verified by renderToStaticMarkup against the installed v0.288.0.)
		const selected = document.querySelector(
			'[data-testid="liv-ai-model-picker-item-grok-4.3"]',
		) as HTMLElement
		const unselected = document.querySelector(
			'[data-testid="liv-ai-model-picker-item-grok-4.20-0309-non-reasoning"]',
		) as HTMLElement
		expect(selected).not.toBeNull()
		expect(unselected).not.toBeNull()

		const selectedFirstSvg = selected.querySelector('svg')
		const unselectedFirstSvg = unselected.querySelector('svg')
		expect(selectedFirstSvg).not.toBeNull()
		expect(unselectedFirstSvg).not.toBeNull()

		// Selected (grok-4.3) -> Check icon -> <polyline points="20 6 9 17 4 12">.
		const selectedPolyline = selectedFirstSvg!.querySelector('polyline')
		expect(selectedPolyline).not.toBeNull()
		expect(selectedPolyline!.getAttribute('points')).toBe('20 6 9 17 4 12')

		// Unselected (grok-4.20-0309-non-reasoning) -> Zap icon -> <polygon points starts with "13 2 3 14">.
		const unselectedPolygon = unselectedFirstSvg!.querySelector('polygon')
		expect(unselectedPolygon).not.toBeNull()
		const zapPoints = unselectedPolygon!.getAttribute('points') ?? ''
		expect(zapPoints.startsWith('13 2 3 14')).toBe(true)

		// And the unselected item must NOT carry a Check geometry.
		expect(unselectedFirstSvg!.querySelector('polyline')).toBeNull()
	})

	it('Test 7: pressing Escape closes the menu (radix default keyboard handling)', () => {
		const onChange = vi.fn()
		act(() => {
			root.render(
				<LivAiModelPicker value='grok-4.20-0309-non-reasoning' onChange={onChange} />,
			)
		})
		openMenu()

		// Menu open — at least one item present
		expect(
			document.querySelector('[data-testid="liv-ai-model-picker-item-grok-4.3"]'),
		).not.toBeNull()

		// Dispatch Escape on document — radix listens via global keydown
		act(() => {
			document.dispatchEvent(
				new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
			)
		})

		// Items removed from the DOM (radix unmounts the content on close)
		expect(
			document.querySelector('[data-testid="liv-ai-model-picker-item-grok-4.3"]'),
		).toBeNull()
	})
})
