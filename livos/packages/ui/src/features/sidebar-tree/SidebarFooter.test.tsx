// @vitest-environment jsdom
//
// Phase 174-05 — SidebarFooter unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). No mocks needed; SidebarFooter is pure (single button + lucide
// icon + stub onClick).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {SidebarFooter} from './SidebarFooter'

// ── Test setup ────────────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────

describe('SidebarFooter — behavior', () => {
	it('B-sf-1: renders exactly one button containing the lucide Settings icon', () => {
		act(() => {
			root.render(<SidebarFooter />)
		})
		const buttons = container.querySelectorAll('button')
		expect(buttons.length).toBe(1)
		// lucide-react attaches a .lucide-settings class on the rendered SVG
		// (each icon component gets `.lucide-<kebab-name>` by convention).
		const icon = container.querySelector('.lucide-settings')
		expect(icon).not.toBeNull()
	})

	it('B-sf-2: button exposes aria-label="Settings" for screen readers', () => {
		act(() => {
			root.render(<SidebarFooter />)
		})
		const button = container.querySelector('button')
		expect(button?.getAttribute('aria-label')).toBe('Settings')
	})

	it('B-sf-3: clicking the button fires onOpenSettings exactly once; no crash when prop is omitted', () => {
		// Case 1 — prop supplied.
		const onOpenSettings = vi.fn()
		act(() => {
			root.render(<SidebarFooter onOpenSettings={onOpenSettings} />)
		})
		const button = container.querySelector('button') as HTMLButtonElement
		expect(button).toBeTruthy()
		act(() => {
			button.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(onOpenSettings).toHaveBeenCalledTimes(1)

		// Case 2 — prop omitted: clicking must not throw.
		act(() => root.unmount())
		const container2 = document.createElement('div')
		document.body.appendChild(container2)
		const root2 = createRoot(container2)
		act(() => {
			root2.render(<SidebarFooter />)
		})
		const button2 = container2.querySelector('button') as HTMLButtonElement
		expect(() => {
			act(() => {
				button2.dispatchEvent(new MouseEvent('click', {bubbles: true}))
			})
		}).not.toThrow()
		act(() => root2.unmount())
		container2.remove()
	})

	it('B-sf-4: source imports Settings from lucide-react AND uses no hardcoded hex colors', () => {
		const src = readFileSync(
			resolve(__dirname, 'SidebarFooter.tsx'),
			'utf8',
		)
		expect(src).toMatch(/from 'lucide-react'/)
		expect(src).not.toMatch(/#[0-9a-fA-F]{6}/)
	})
})
