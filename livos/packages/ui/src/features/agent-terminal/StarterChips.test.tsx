// @vitest-environment jsdom
//
// Phase 189-04 — StarterChips tests (TDD RED first)
// 4 assertions: S-01..S-04

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

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

import {StarterChips, STARTER_CHIP_PROMPTS} from './StarterChips'

describe('StarterChips — Phase 189-04', () => {
	it('S-01: renders 4 buttons when hidden=false (default)', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<StarterChips onPick={onPick} />)
		})
		const buttons = container.querySelectorAll('button')
		expect(buttons).toHaveLength(4)
	})

	it('S-02: renders no buttons when hidden=true', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<StarterChips onPick={onPick} hidden={true} />)
		})
		const buttons = container.querySelectorAll('button')
		expect(buttons).toHaveLength(0)
	})

	it('S-03: clicking chip "Tell me what you can do" fires onPick with exact string', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<StarterChips onPick={onPick} />)
		})
		const btn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Tell me what you can do',
		) as HTMLButtonElement
		expect(btn).toBeTruthy()
		act(() => {
			btn.click()
		})
		expect(onPick).toHaveBeenCalledWith('Tell me what you can do')
	})

	it('S-04: STARTER_CHIP_PROMPTS export is an array of 4 non-empty strings', () => {
		expect(Array.isArray(STARTER_CHIP_PROMPTS)).toBe(true)
		expect(STARTER_CHIP_PROMPTS).toHaveLength(4)
		for (const p of STARTER_CHIP_PROMPTS) {
			expect(typeof p).toBe('string')
			expect(p.length).toBeGreaterThan(0)
		}
	})
})
