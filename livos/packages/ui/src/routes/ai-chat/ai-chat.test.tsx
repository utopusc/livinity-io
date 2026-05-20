// @vitest-environment jsdom
//
// Phase 167-04 — AI Chat route swap unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). Mocks @/features/cc-terminal + @/hooks/use-is-mobile so the
// behavior under test is route composition, not xterm rendering.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

// useIsMobile — toggled per test via vi.mocked(...).mockReturnValue(...)
const useIsMobileMock = vi.fn(() => false)
vi.mock('@/hooks/use-is-mobile', () => ({
	useIsMobile: () => useIsMobileMock(),
}))

// CcTerminal — capture sessionId prop, render a sentinel div.
const ccTerminalMock = vi.fn((_props: {sessionId: string}) => null)
vi.mock('@/features/cc-terminal', () => ({
	CcTerminal: (props: {sessionId: string}) => {
		ccTerminalMock(props)
		return <div data-testid='cc-terminal' data-session={props.sessionId} />
	},
}))

// Phase 169-04 — VaultGraph mock for the new tab.
const vaultGraphMock = vi.fn(() => null)
vi.mock('@/features/vault-graph', () => ({
	VaultGraph: () => {
		vaultGraphMock()
		return <div data-testid='vault-graph' />
	},
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	useIsMobileMock.mockReset()
	useIsMobileMock.mockReturnValue(false)
	ccTerminalMock.mockReset()
	vaultGraphMock.mockReset()
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

import AiChatRoute from './index'

describe('AiChatRoute — desktop branch', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
	})

	it('mounts without throwing on desktop', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toBeTruthy()
	})

	it('renders the grid container with 260px sidebar template', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const grid = container.querySelector('div.grid')
		expect(grid).not.toBeNull()
		const style = (grid as HTMLElement).getAttribute('style') ?? ''
		expect(style).toMatch(/grid-template-columns:\s*260px/i)
	})

	it('renders the Phase 168 sidebar placeholder text', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toMatch(/Session sidebar — Phase 168/)
	})

	it('with no activeSessionId renders the "Select or create a session to start" empty state', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toMatch(/Select or create a session to start/)
		// CcTerminal should NOT have been rendered
		expect(ccTerminalMock).not.toHaveBeenCalled()
	})
})

describe('AiChatRoute — mobile branch', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(true)
	})

	it('renders the "AI Chat requires a desktop browser" headline', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toMatch(/AI Chat requires a desktop browser/)
	})

	it('renders an <a href="/chat-mobile"> link to the legacy chat', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const link = container.querySelector('a[href="/chat-mobile"]')
		expect(link).not.toBeNull()
		expect(link?.textContent).toMatch(/Open mobile chat/i)
	})

	it('does NOT render the grid layout or CcTerminal on mobile', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('div.grid')).toBeNull()
		expect(ccTerminalMock).not.toHaveBeenCalled()
	})
})

// ── Phase 169-04 — Terminal | Vault Graph tab nav ─────────────────────────

describe('AiChatRoute — Phase 169-04 tab nav', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
	})

	it('renders both "Terminal" and "Vault Graph" tab buttons', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map(
			(b) => b.textContent,
		)
		expect(buttons).toContain('Terminal')
		expect(buttons).toContain('Vault Graph')
	})

	it('on initial mount, activeTab="terminal" → EmptyState renders (NOT VaultGraph)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// With no activeSessionId AND terminal tab, the empty state shows.
		expect(container.textContent).toMatch(/Select or create a session to start/)
		// VaultGraph must NOT have been mounted.
		expect(vaultGraphMock).not.toHaveBeenCalled()
		expect(container.querySelector('[data-testid="vault-graph"]')).toBeNull()
	})

	it('clicking "Vault Graph" tab mounts VaultGraph and unmounts the Terminal branch', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const vgBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Vault Graph',
		) as HTMLButtonElement
		expect(vgBtn).toBeTruthy()
		act(() => {
			vgBtn.click()
		})
		expect(vaultGraphMock).toHaveBeenCalled()
		expect(container.querySelector('[data-testid="vault-graph"]')).not.toBeNull()
		// Empty-state text should no longer be present after switch.
		expect(container.textContent).not.toMatch(
			/Select or create a session to start/,
		)
	})

	it('clicking "Terminal" after switching to Vault Graph restores the Terminal branch', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const vgBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Vault Graph',
		) as HTMLButtonElement
		act(() => vgBtn.click())
		const tBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'Terminal',
		) as HTMLButtonElement
		act(() => tBtn.click())
		// VaultGraph is unmounted.
		expect(container.querySelector('[data-testid="vault-graph"]')).toBeNull()
		// EmptyState (no activeSessionId) re-renders.
		expect(container.textContent).toMatch(/Select or create a session to start/)
	})

	it('with activeTab="terminal" and activeSessionId=null, EmptyState renders (not VaultGraph)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// Initial mount: terminal tab + null session → EmptyState text present.
		expect(container.textContent).toMatch(/Select or create a session to start/)
		// VaultGraph stub never invoked at this point.
		expect(vaultGraphMock).not.toHaveBeenCalled()
	})
})

// ── Source-text invariants ─────────────────────────────────────────────────

describe('routes/ai-chat/index.tsx — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

	it('imports CcTerminal from @/features/cc-terminal', () => {
		expect(SRC).toMatch(/from\s+['"]@\/features\/cc-terminal['"]/)
		expect(SRC).toMatch(/CcTerminal/)
	})

	it('imports useIsMobile hook', () => {
		expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-is-mobile['"]/)
		expect(SRC).toMatch(/useIsMobile/)
	})

	it('contains the /chat-mobile fallback link target', () => {
		expect(SRC).toMatch(/['"]\/chat-mobile['"]/)
	})

	it('does NOT import the legacy AI chat panel module (D-V35-K)', () => {
		// The new ai-chat/index.tsx must not import the relocated legacy panel.
		// `legacy-ai-chat-panel` may appear in a comment but NEVER in an import.
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const matches = importLines.filter((l) => /legacy-ai-chat-panel/.test(l))
		expect(matches).toEqual([])
	})

	// Phase 169-04 — sacred-invariants for the tab nav additions.
	it('imports VaultGraph from @/features/vault-graph (Phase 169-04)', () => {
		expect(SRC).toMatch(/from\s+['"]@\/features\/vault-graph['"]/)
		expect(SRC).toMatch(/VaultGraph/)
	})

	it('preserves the Phase 167 CcTerminal mount with sessionId key (sacred guard)', () => {
		// CcTerminal must still be mounted with key={activeSessionId} (Phase 167-04).
		expect(SRC).toMatch(/CcTerminal\s+key=\{activeSessionId\}/)
	})
})
