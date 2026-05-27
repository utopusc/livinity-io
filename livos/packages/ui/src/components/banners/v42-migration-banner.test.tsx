// @vitest-environment jsdom
//
// Phase 224-03 — V42MigrationBanner unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04/68-03 precedent).
// This file ships **direct react-dom/client renders** against jsdom —
// covering the same behaviours that @testing-library/react would (mount,
// query by text content, dispatch click events) without requiring a new
// dependency.
//
// Coverage:
//   1. Renders the literal migration text when context='app-store'.
//   2. Renders the same text when context='settings'.
//   3. Clicking the dismiss button (aria-label='Dismiss banner') unmounts
//      the banner body (text disappears from DOM).
//   4. Dismissal is per-instance — a fresh `<V42MigrationBanner />` mount
//      re-shows the banner (no localStorage / sessionStorage persistence).
//
// References:
//   - .planning/phases/224-app-store-hide-ai-tabs/224-03-PLAN.md
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx (RTL-absent precedent)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {V42MigrationBanner, V42_MIGRATION_BANNER_TEXT} from './v42-migration-banner'

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
		root = null
	}
	if (container && container.parentNode) {
		container.parentNode.removeChild(container)
	}
	container = null
})

describe('V42MigrationBanner', () => {
	it('renders the migration text in app-store context', () => {
		act(() => {
			root!.render(<V42MigrationBanner context='app-store' />)
		})
		expect(container!.textContent).toContain(V42_MIGRATION_BANNER_TEXT)
		const el = container!.querySelector('[data-testid="v42-migration-banner"]') as HTMLElement | null
		expect(el).not.toBeNull()
		expect(el!.getAttribute('data-context')).toBe('app-store')
	})

	it('renders the migration text in settings context', () => {
		act(() => {
			root!.render(<V42MigrationBanner context='settings' />)
		})
		expect(container!.textContent).toContain(V42_MIGRATION_BANNER_TEXT)
		const el = container!.querySelector('[data-testid="v42-migration-banner"]') as HTMLElement | null
		expect(el).not.toBeNull()
		expect(el!.getAttribute('data-context')).toBe('settings')
	})

	it('hides itself when the dismiss button is clicked', () => {
		act(() => {
			root!.render(<V42MigrationBanner context='app-store' />)
		})
		expect(container!.textContent).toContain(V42_MIGRATION_BANNER_TEXT)
		const btn = container!.querySelector('[aria-label="Dismiss banner"]') as HTMLButtonElement | null
		expect(btn).not.toBeNull()
		act(() => {
			btn!.click()
		})
		// Banner element + text are gone after dismissal.
		expect(container!.querySelector('[data-testid="v42-migration-banner"]')).toBeNull()
		expect(container!.textContent ?? '').not.toContain(V42_MIGRATION_BANNER_TEXT)
	})

	it('dismissal is per-instance (no persistence across re-mounts)', () => {
		// First mount: dismiss it.
		act(() => {
			root!.render(<V42MigrationBanner context='settings' />)
		})
		const btn = container!.querySelector('[aria-label="Dismiss banner"]') as HTMLButtonElement
		act(() => {
			btn.click()
		})
		expect(container!.querySelector('[data-testid="v42-migration-banner"]')).toBeNull()

		// Unmount the first root.
		act(() => {
			root!.unmount()
		})
		container!.remove()

		// Fresh container + root — verifies no module-level / localStorage /
		// sessionStorage persistence keeps the banner hidden across instances.
		const container2 = document.createElement('div')
		document.body.appendChild(container2)
		const root2 = createRoot(container2)
		act(() => {
			root2.render(<V42MigrationBanner context='settings' />)
		})
		expect(container2.textContent).toContain(V42_MIGRATION_BANNER_TEXT)
		act(() => {
			root2.unmount()
		})
		container2.remove()

		// Re-prep the outer harness vars so `afterEach` cleanup does not blow up.
		container = document.createElement('div')
		document.body.appendChild(container)
		root = createRoot(container)
	})
})
