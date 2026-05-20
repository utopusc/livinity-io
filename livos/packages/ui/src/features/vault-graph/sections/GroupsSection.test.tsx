// @vitest-environment jsdom
//
// Phase 179-03 — GroupsSection unit tests (8 assertions, RED gate).
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {
	GroupsSection,
	hashToOklch,
	resolveNodeColor,
} from './GroupsSection'
import {getNodeColor} from '../graph-palette'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	window.localStorage.clear()
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	vi.restoreAllMocks()
})

describe('GroupsSection', () => {
	it('renders 4 radio inputs with correct data-testid values', () => {
		act(() => {
			root.render(<GroupsSection />)
		})
		expect(container.querySelector('[data-testid="group-mode-by-type"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="group-mode-by-folder"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="group-mode-by-tag"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="group-mode-custom"]')).not.toBeNull()
	})

	it('by-type radio is checked by default (defaultGroups.mode === "by-type")', () => {
		act(() => {
			root.render(<GroupsSection />)
		})
		const byType = container.querySelector('[data-testid="group-mode-by-type"]') as HTMLInputElement
		expect(byType.checked).toBe(true)
	})

	it('clicking by-folder radio calls onGroupChange with mode: "by-folder"', () => {
		const changes: any[] = []
		act(() => {
			root.render(<GroupsSection onGroupChange={(g) => changes.push(g)} />)
		})
		act(() => {
			;(container.querySelector('[data-testid="group-mode-by-folder"]') as HTMLInputElement).click()
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].mode).toBe('by-folder')
	})

	it('clicking by-tag radio calls onGroupChange with mode: "by-tag"', () => {
		const changes: any[] = []
		act(() => {
			root.render(<GroupsSection onGroupChange={(g) => changes.push(g)} />)
		})
		act(() => {
			;(container.querySelector('[data-testid="group-mode-by-tag"]') as HTMLInputElement).click()
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].mode).toBe('by-tag')
	})

	it('hashToOklch("memory", "light") returns a string matching /^oklch(/', () => {
		expect(hashToOklch('memory', 'light')).toMatch(/^oklch\(/)
	})

	it('hashToOklch is deterministic — same input yields same output', () => {
		expect(hashToOklch('memory', 'light')).toBe(hashToOklch('memory', 'light'))
	})

	it('resolveNodeColor in by-type mode delegates to getNodeColor', () => {
		const node = {type: 'memory' as const, topDir: 'memory', tags: []}
		expect(resolveNodeColor(node, 'by-type', 'light')).toBe(getNodeColor('memory', 'light'))
	})

	it('resolveNodeColor in by-tag mode returns a string matching /^oklch(/', () => {
		const node = {type: 'memory' as const, topDir: 'agent', tags: ['work']}
		expect(resolveNodeColor(node, 'by-tag', 'light')).toMatch(/^oklch\(/)
	})
})
