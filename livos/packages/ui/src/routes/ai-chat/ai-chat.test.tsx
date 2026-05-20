// @vitest-environment jsdom
//
// Phase 167-04 / 169-04 / 175-05 — AI Chat route tests (post-cc-sessions deletion).
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). Mocks @/hooks/use-is-mobile + @/features/vault-graph so the
// behavior under test is route composition, not the heavy children.
//
// Phase 175-05 — All SessionSidebar / CcTerminal / cc-sessions assertions
// were removed. The Terminal tab now renders an empty-state hint
// ("Open a Chat from the sidebar to attach a terminal.") because chat
// session lifecycle moved to Phase 174 SidebarTree + Phase 175 dock
// window manager. The remaining surface here is the tab nav + mobile
// redirect.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ─────────────────────────────────────────────────────────────────

const useIsMobileMock = vi.fn(() => false)
vi.mock('@/hooks/use-is-mobile', () => ({
	useIsMobile: () => useIsMobileMock(),
}))

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

describe('AiChatRoute — desktop branch (Phase 175-05)', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
	})

	it('mounts without throwing on desktop', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toBeTruthy()
	})

	it('Terminal tab shows the empty-state hint pointing to the global sidebar', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toMatch(/Open a Chat from the sidebar/)
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
})

// ── Phase 169-04 — Terminal | Vault Graph tab nav (still in scope) ────────

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

	it('on initial mount, activeTab="terminal" → empty-state hint, NOT VaultGraph', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toMatch(/Open a Chat from the sidebar/)
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
		expect(container.textContent).not.toMatch(/Open a Chat from the sidebar/)
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
		expect(container.querySelector('[data-testid="vault-graph"]')).toBeNull()
		expect(container.textContent).toMatch(/Open a Chat from the sidebar/)
	})
})

// ── Source-text invariants (post-175-05) ──────────────────────────────────

describe('routes/ai-chat/index.tsx — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

	it('imports useIsMobile hook', () => {
		expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-is-mobile['"]/)
		expect(SRC).toMatch(/useIsMobile/)
	})

	it('contains the /chat-mobile fallback link target', () => {
		expect(SRC).toMatch(/['"]\/chat-mobile['"]/)
	})

	it('does NOT import the legacy AI chat panel module (D-V35-K)', () => {
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const matches = importLines.filter((l) => /legacy-ai-chat-panel/.test(l))
		expect(matches).toEqual([])
	})

	it('imports VaultGraph from @/features/vault-graph (Phase 169-04)', () => {
		expect(SRC).toMatch(/from\s+['"]@\/features\/vault-graph['"]/)
		expect(SRC).toMatch(/VaultGraph/)
	})

	// Phase 175-05 — post-deletion invariants.
	it('does NOT import @/features/cc-sessions (Phase 175-05 deletion)', () => {
		// Check actual import lines only — a historical reference in a comment is allowed.
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const ccSessionsImport = importLines.filter((l) => /cc-sessions/.test(l))
		expect(ccSessionsImport).toEqual([])
		const sidebarImport = importLines.filter((l) => /SessionSidebar/.test(l))
		expect(sidebarImport).toEqual([])
	})

	it('does NOT import @/features/cc-terminal (Phase 175-05 — moved to dock window manager)', () => {
		expect(SRC).not.toMatch(/from\s+['"]@\/features\/cc-terminal['"]/)
	})
})
