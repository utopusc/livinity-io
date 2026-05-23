// @vitest-environment jsdom
//
// Phase 198-06 Task 2 — suggested-prompts.tsx tests (TDD RED → GREEN).
//
// Locks the SuggestedPrompts component contract:
//
//   1. Renders 4 chip buttons with the locked default prompt texts.
//   2. Clicking a chip fires onPick exactly once with that chip's text.
//   3. When `hidden` is true (e.g. thread has messages), renders null.
//
// Per LivOS UI testing precedent (Plan 30-02 → 198-05), the UI package
// has D-NO-NEW-DEPS — `@testing-library/react` is NOT installed. Tests
// use direct react-dom/client mounts against jsdom + querySelector.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {DEFAULT_SUGGESTED_PROMPTS, SuggestedPrompts} from './suggested-prompts'

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

describe('DEFAULT_SUGGESTED_PROMPTS', () => {
	it('ships exactly the 4 locked prompts from Plan 198-06', () => {
		expect(DEFAULT_SUGGESTED_PROMPTS).toHaveLength(4)
		expect(DEFAULT_SUGGESTED_PROMPTS).toEqual([
			'What is the weather in Istanbul?',
			'Take a screenshot of my screen',
			'List my open windows',
			'What can you do?',
		])
	})
})

describe('SuggestedPrompts', () => {
	it('Test 1: renders 4 chip buttons with the locked default prompt texts', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<SuggestedPrompts onPick={onPick} />)
		})

		const container = document.querySelector(
			'[data-testid="liv-ai-suggested-prompts"]',
		)
		expect(container).not.toBeNull()

		const buttons = container!.querySelectorAll('button')
		expect(buttons).toHaveLength(4)

		const texts = Array.from(buttons).map((b) => b.textContent?.trim())
		expect(texts).toEqual([
			'What is the weather in Istanbul?',
			'Take a screenshot of my screen',
			'List my open windows',
			'What can you do?',
		])
	})

	it('Test 2: clicking a chip fires onPick once with that chip text', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<SuggestedPrompts onPick={onPick} />)
		})

		const buttons = document.querySelectorAll(
			'[data-testid="liv-ai-suggested-prompts"] button',
		)
		expect(buttons.length).toBeGreaterThan(0)

		act(() => {
			;(buttons[0] as HTMLButtonElement).click()
		})

		expect(onPick).toHaveBeenCalledTimes(1)
		expect(onPick).toHaveBeenCalledWith('What is the weather in Istanbul?')
	})

	it('Test 3: when hidden=true, component returns null (renders nothing)', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<SuggestedPrompts onPick={onPick} hidden />)
		})
		const container = document.querySelector(
			'[data-testid="liv-ai-suggested-prompts"]',
		)
		expect(container).toBeNull()
	})

	it('Test 4: custom prompts array overrides DEFAULT_SUGGESTED_PROMPTS', () => {
		const onPick = vi.fn()
		const custom = ['Foo', 'Bar']
		act(() => {
			root.render(<SuggestedPrompts onPick={onPick} prompts={custom} />)
		})

		const buttons = document.querySelectorAll(
			'[data-testid="liv-ai-suggested-prompts"] button',
		)
		expect(buttons).toHaveLength(2)
		expect(buttons[0].textContent?.trim()).toBe('Foo')
		expect(buttons[1].textContent?.trim()).toBe('Bar')
	})
})
