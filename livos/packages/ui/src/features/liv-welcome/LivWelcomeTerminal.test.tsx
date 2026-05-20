// @vitest-environment jsdom
//
// Phase 176-04 — LivWelcomeTerminal behavioral tests (6 assertions).
//
// Pattern: Phase 174 createRoot + act + vi.hoisted (NOT @testing-library/react).
// Mocks @/features/cc-terminal so CcTerminal is a thin stub that captures sessionId.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	CcTerminalSessionId: '',
	CcTerminalCalled: 0,
}))

vi.mock('@/features/cc-terminal', () => ({
	CcTerminal: ({sessionId}: {sessionId: string}) => {
		mocks.CcTerminalSessionId = sessionId
		mocks.CcTerminalCalled++
		return null
	},
}))

// ── Import under test ──────────────────────────────────────────────────────────

import {LivWelcomeTerminal} from './LivWelcomeTerminal'

// ── Test setup ─────────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	mocks.CcTerminalSessionId = ''
	mocks.CcTerminalCalled = 0
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LivWelcomeTerminal — Phase 176-04', () => {
	it('T1: renders a container div with data-testid="liv-welcome-terminal"', () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="bruce" />)
		})
		expect(container.querySelector('[data-testid="liv-welcome-terminal"]')).not.toBeNull()
	})

	it('T2: renders CcTerminal with sessionId="livos-liv-root-bruce" when userId="bruce"', () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="bruce" />)
		})
		expect(mocks.CcTerminalSessionId).toBe('livos-liv-root-bruce')
	})

	it('T3: userId with special chars "user@123" → sanitized to "user123" in session name', () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="user@123" />)
		})
		// @ is stripped, leaving "user123"
		expect(mocks.CcTerminalSessionId).toBe('livos-liv-root-user123')
	})

	it('T4: empty userId "" → session name "livos-liv-root-anonymous"', () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="" />)
		})
		expect(mocks.CcTerminalSessionId).toBe('livos-liv-root-anonymous')
	})

	it("T5: renders welcome text \"Hi, I'm Liv\" somewhere in the container", () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="bruce" />)
		})
		expect(container.textContent).toMatch(/Hi, I'm Liv/i)
	})

	it('T6: when loading=true prop → renders a loading skeleton (no CcTerminal mount)', () => {
		act(() => {
			root.render(<LivWelcomeTerminal userId="bruce" loading />)
		})
		// CcTerminal should NOT be mounted.
		expect(mocks.CcTerminalCalled).toBe(0)
		// But the container div must still exist.
		expect(container.querySelector('[data-testid="liv-welcome-terminal"]')).not.toBeNull()
	})
})
