// @vitest-environment jsdom
//
// Phase 167-04 / 169-04 / 175-05 / 176-04 / 185-01 / 185-02 / 185-03 — AI Chat route tests.
// Phase 188-04 — Vault Graph tab REMOVED from Tab union + vault-graph mock deleted.
// Phase 190-03 — MCP tab REMOVED from AI Chat; TerminalTabStrip replaces static tab bar.
//   - Phase 186-01 describe block DELETED (MCP Servers tab gone from ai-chat)
//   - Phase 188-04 F-04-4 updated: checks terminal-tab-strip exists (not old buttons)
//   - Mobile "Terminal"/"MCP Servers" button test updated: no more MCP Servers
//   - Phase 185-01 B4 updated: no longer checks old Terminal/MCP buttons
//   - Phase 185-02 B3 (agent routing) preserved — now routes via tab
//   - 8 new P-01..P-08 assertions added for tab strip wiring
//   - Phase 190-04 adds L-01..L-06 localStorage persistence assertions (next plan)
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via act().

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

// Phase 176-04 — Mock trpcReact so vault.items.list.useQuery is controllable.
let itemListData: {items: any[]} = {items: [{id: 'fake-item-1', type: 'project'}]}
vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			items: {
				list: {
					useQuery: (_input: unknown, _opts?: unknown) => ({
						data: itemListData,
						isLoading: false,
						refetch: vi.fn(),
					}),
				},
				openItem: {
					useSubscription: vi.fn(),
				},
				move: {
					useMutation: (_opts?: unknown) => ({mutate: vi.fn()}),
				},
				create: {
					useMutation: (_opts?: unknown) => ({mutate: vi.fn(), isPending: false}),
				},
			},
		},
	},
}))

// Phase 176-04 — Mock useCurrentUser to return a stable userId.
vi.mock('@/hooks/use-current-user', () => ({
	useCurrentUser: () => ({userId: 'bruce', user: {id: 'bruce', username: 'bruce', role: 'admin'}}),
}))

// Phase 176-04 — Mock LivWelcomeTerminal so we can detect it in tests.
vi.mock('@/features/liv-welcome/LivWelcomeTerminal', () => ({
	LivWelcomeTerminal: ({userId}: {userId: string; loading?: boolean}) => (
		<div data-testid='liv-welcome-terminal' data-user-id={userId} />
	),
}))

// Phase 185-01 — Mock SidebarTree + window-manager so SidebarTree renders as
// a thin stub, capturing the props passed to it.
const sidebarTreeMock = vi.fn((_props: unknown) => null)
vi.mock('@/features/sidebar-tree', () => ({
	SidebarTree: (props: unknown) => {
		sidebarTreeMock(props)
		return <div data-testid='sidebar-tree-mock' />
	},
}))

vi.mock('@/providers/window-manager', () => ({
	useWindowManagerOptional: () => null,
}))

// Phase 190-03 — TerminalTabStrip mock: renders a stable stub with data-testid.
// Exposes tabs as data-tab-count so localStorage tests (190-04) can assert restoration.
// Each tab gets a button[data-testid="tab-{id}"] + close button[data-testid="tab-close-{id}"]
const terminalTabStripMock = vi.fn((_props: unknown) => null)
vi.mock('@/features/terminal-tabs/TerminalTabStrip', () => ({
	TerminalTabStrip: (props: {
		tabs: Array<{id: string; label: string}>
		activeId: string | null
		onSelect: (id: string) => void
		onClose: (id: string) => void
		onAddClaude: () => void
		onAddBareTerminal: () => void
		[k: string]: unknown
	}) => {
		terminalTabStripMock(props)
		return (
			<div
				data-testid='terminal-tab-strip'
				data-tab-count={props.tabs.length}
			>
				{props.tabs.map((tab) => (
					<button
						key={tab.id}
						type='button'
						data-testid={`tab-${tab.id}`}
						onClick={() => props.onSelect(tab.id)}
					>
						{tab.label}
					</button>
				))}
				{/* Close buttons for each tab */}
				{props.tabs.map((tab) => (
					<button
						key={`close-${tab.id}`}
						type='button'
						data-testid={`tab-close-${tab.id}`}
						onClick={() => props.onClose(tab.id)}
					>
						×
					</button>
				))}
				<button
					type='button'
					data-testid='add-claude-btn'
					onClick={props.onAddClaude}
				>
					Claude
				</button>
				<button
					type='button'
					data-testid='add-terminal-btn'
					onClick={props.onAddBareTerminal}
				>
					Terminal
				</button>
			</div>
		)
	},
}))

// Phase 190-03 — BareTerminal mock.
vi.mock('@/features/cc-terminal/BareTerminal', () => ({
	BareTerminal: ({sessionId}: {sessionId: string}) => (
		<div data-testid='bare-terminal-mock' data-session-id={sessionId} />
	),
}))

// Phase 190-03 — CcTerminal mock (used for type='claude' tabs).
vi.mock('@/features/cc-terminal/CcTerminal', () => ({
	CcTerminal: ({sessionId}: {sessionId: string}) => (
		<div data-testid='cc-terminal-mock' data-session-id={sessionId} />
	),
}))

// Phase 189-01 — Mock AgentTerminalPane so it renders a stable stub.
vi.mock('@/features/agent-terminal/AgentTerminalPane', () => ({
	AgentTerminalPane: ({agentItem}: {agentItem: {id: string; name: string; type: string}; userId: string}) => (
		<div data-testid='agent-terminal-pane' data-agent-id={agentItem.id} />
	),
}))

// Phase 185-02 — Mock item-detail components (ChatDetail, ProjectDetail, AgentDetail).
// Phase 185-03 — Extended to include AddItemModal.
vi.mock('@/features/item-detail', () => ({
	ChatDetail: ({item}: {item: {id: string}}) => (
		<div data-testid='chat-detail-mock' data-item-id={item.id} />
	),
	ProjectDetail: ({item}: {item: {id: string}}) => (
		<div data-testid='project-detail-mock' data-item-id={item.id} />
	),
	AgentDetail: ({item}: {item: {id: string}}) => (
		<div data-testid='agent-detail-mock' data-item-id={item.id} />
	),
	AddItemModal: ({open}: {open: boolean; onClose: () => void}) =>
		open ? <div data-testid='add-item-modal' /> : null,
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	useIsMobileMock.mockReset()
	useIsMobileMock.mockReturnValue(false)
	sidebarTreeMock.mockReset()
	terminalTabStripMock.mockReset()
	// Default: hasItems=true (preserves existing "Open a Chat" assertions)
	itemListData = {items: [{id: 'fake-item-1', type: 'project'}]}
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
		// hasItems=true (default mock) → shows the hint
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

	// Phase 185-03 — mobile early-return removed; mobile now shows split layout
	// with sidebar collapsed by default and a hamburger toggle in the tab-nav row.
	it('mounts without throwing on mobile', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toBeTruthy()
	})

	// Phase 190-03 — MCP Servers tab removed; tab bar is now TerminalTabStrip.
	// Tab strip itself is mocked. On mobile the hamburger button + add-item-btn still exist.
	it('TerminalTabStrip is rendered (no MCP Servers tab button) on mobile', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// The mock renders data-testid="terminal-tab-strip"
		expect(container.querySelector('[data-testid="terminal-tab-strip"]')).not.toBeNull()
		// MCP Servers text must be absent
		expect(container.textContent).not.toMatch(/MCP Servers/)
	})
})

// ── Source-text invariants (post-175-05) ──────────────────────────────────

describe('routes/ai-chat/index.tsx — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

	it('imports useIsMobile hook', () => {
		expect(SRC).toMatch(/from\s+['"]@\/hooks\/use-is-mobile['"]/)
		expect(SRC).toMatch(/useIsMobile/)
	})

	// Phase 185-03 — mobile early-return removed; /chat-mobile link now lives
	// in the /chat-mobile route itself. This test updated to reflect new behaviour.
	it('does NOT contain a /chat-mobile redirect (Phase 185-03 mobile collapse)', () => {
		expect(SRC).not.toMatch(/href.*\/chat-mobile/)
	})

	it('does NOT import the legacy AI chat panel module (D-V35-K)', () => {
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const matches = importLines.filter((l) => /legacy-ai-chat-panel/.test(l))
		expect(matches).toEqual([])
	})

	// Phase 188-04 — VaultGraph import REMOVED. Updated from Phase 169-04 assertion.
	it('does NOT import VaultGraph from @/features/vault-graph (Phase 188-04 deletion)', () => {
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const vgImports = importLines.filter((l) => /vault-graph/.test(l))
		expect(vgImports).toEqual([])
	})

	// Phase 175-05 — post-deletion invariants.
	it('does NOT import @/features/cc-sessions (Phase 175-05 deletion)', () => {
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const ccSessionsImport = importLines.filter((l) => /cc-sessions/.test(l))
		expect(ccSessionsImport).toEqual([])
		const sidebarImport = importLines.filter((l) => /SessionSidebar/.test(l))
		expect(sidebarImport).toEqual([])
	})

	// Phase 176-04 — new source-text invariants.
	it('T-176-04-A: imports LivWelcomeTerminal', () => {
		expect(SRC).toMatch(/import.*LivWelcomeTerminal/)
	})

	it('T-176-04-B: vault.items.list.useQuery is present', () => {
		expect(SRC).toMatch(/vault\.items\.list\.useQuery/)
	})

	it('T-176-04-C: hasItems conditional present', () => {
		expect(SRC).toMatch(/hasItems/)
	})

	it('T-176-04-D: Phase 175 empty-state text still present (inside hasItems branch)', () => {
		expect(SRC).toMatch(/Open a Chat from the sidebar/)
	})
})

// ── Phase 185-01 — Split layout + SidebarTree mount ───────────────────────

describe('AiChatRoute — Phase 185-01 split layout', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
		sidebarTreeMock.mockReset()
	})

	it('B1: renders data-testid="ai-chat-sidebar" in DOM', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="ai-chat-sidebar"]')).not.toBeNull()
	})

	it('B2: renders data-testid="ai-chat-right-pane" in DOM', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="ai-chat-right-pane"]')).not.toBeNull()
	})

	it('B3: sidebar pane has class w-[280px]', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const sidebar = container.querySelector('[data-testid="ai-chat-sidebar"]')
		expect(sidebar?.className).toMatch(/w-\[280px\]/)
	})

	// Phase 190-03 — B4 updated: old static buttons gone; TerminalTabStrip now renders.
	it('B4: TerminalTabStrip is rendered in the right pane (no Vault Graph or MCP Servers buttons)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="terminal-tab-strip"]')).not.toBeNull()
		expect(container.textContent).not.toMatch(/MCP Servers/)
		expect(container.textContent).not.toMatch(/Vault Graph/)
	})

	it('B5: SidebarTree mock is called at least once', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(sidebarTreeMock).toHaveBeenCalledTimes(1)
	})

	it('B6: source-text — index.tsx imports SidebarTree from @/features/sidebar-tree', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).toMatch(/from\s+['"]@\/features\/sidebar-tree['"]/)
		expect(SRC).toMatch(/SidebarTree/)
	})
})

// ── Phase 185-02 — Right-pane item routing ────────────────────────────────

describe('AiChatRoute — Phase 185-02 item-select routing', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
		sidebarTreeMock.mockReset()
		terminalTabStripMock.mockReset()
		itemListData = {
			items: [
				{id: 'chat-id-1', type: 'chat', name: 'Chat 1', ccSessionId: 'sess-abc', parentId: null},
				{id: 'proj-id-1', type: 'project', name: 'Proj 1', parentId: null},
				{id: 'agent-id-1', type: 'agent', name: 'Agent 1', parentId: null},
			],
		}
	})

	it('B1: SidebarTree onSelect("chat-id-1") renders chat-detail-mock in right pane', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('chat-id-1')
		})
		expect(container.querySelector('[data-testid="chat-detail-mock"]')).not.toBeNull()
	})

	it('B2: SidebarTree onSelect("proj-id-1") renders project-detail-mock in right pane', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('proj-id-1')
		})
		expect(container.querySelector('[data-testid="project-detail-mock"]')).not.toBeNull()
	})

	// Phase 189-01 — agent type now mounts AgentTerminalPane via tab system.
	it('B3: SidebarTree onSelect("agent-id-1") renders agent-terminal-pane in right pane (Phase 189-01)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		expect(container.querySelector('[data-testid="agent-terminal-pane"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="agent-detail-mock"]')).toBeNull()
	})

	// Phase 188-04 — B4/B5 Vault Graph tab tests DELETED (graph tab removed).

	it('B6: onSelect(null) clears detail view and shows default hint/welcome', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('chat-id-1')
		})
		act(() => {
			captured?.onSelect?.(null)
		})
		expect(container.querySelector('[data-testid="chat-detail-mock"]')).toBeNull()
		// When items exist, should show hint text
		expect(container.textContent).toMatch(/Open a Chat from the sidebar/)
	})

	it('B7: source-text — index.tsx imports ChatDetail from @/features/item-detail', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).toMatch(/from\s+['"]@\/features\/item-detail['"]/)
		expect(SRC).toMatch(/ChatDetail/)
	})

	it('B8: source-text — index.tsx contains selectedItemId state', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).toMatch(/selectedItemId/)
	})
})

// ── Phase 185-03 — Mobile collapse + AddItemModal trigger ─────────────────

describe('AiChatRoute — Phase 185-03 mobile collapse + modal trigger', () => {
	it('B1: on mobile, sidebar NOT in DOM on initial render', () => {
		useIsMobileMock.mockReturnValue(true)
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="ai-chat-sidebar"]')).toBeNull()
	})

	it('B2: on mobile, clicking sidebar-toggle-btn makes sidebar appear', () => {
		useIsMobileMock.mockReturnValue(true)
		act(() => {
			root.render(<AiChatRoute />)
		})
		const toggleBtn = container.querySelector('[data-testid="sidebar-toggle-btn"]') as HTMLButtonElement
		expect(toggleBtn).not.toBeNull()
		act(() => {
			toggleBtn.click()
		})
		expect(container.querySelector('[data-testid="ai-chat-sidebar"]')).not.toBeNull()
	})

	it('B3: on desktop, clicking add-item-btn makes add-item-modal appear', () => {
		useIsMobileMock.mockReturnValue(false)
		act(() => {
			root.render(<AiChatRoute />)
		})
		const addBtn = container.querySelector('[data-testid="add-item-btn"]') as HTMLButtonElement
		expect(addBtn).not.toBeNull()
		act(() => {
			addBtn.click()
		})
		expect(container.querySelector('[data-testid="add-item-modal"]')).not.toBeNull()
	})

	it('B4: source-text — index.tsx imports AddItemModal from @/features/item-detail', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).toMatch(/AddItemModal/)
		expect(SRC).toMatch(/from\s+['"]@\/features\/item-detail['"]/)
	})
})

// ── Phase 186-01 — MCP Servers tab REMOVED (Phase 190-03) ─────────────────
// Describe block deleted — MCP tab removed from AI Chat per Phase 190-03.
// MCP component FILES stay on disk (Phase 191 will re-use in settings gear panel).
// The absence of MCP Servers tab is asserted in Phase 190-03 P-02 assertion below.

// ── Phase 189-01 — AgentTerminalPane routing (replaces AgentDetail) ─────────

describe('AiChatRoute — Phase 189-01 agent routing', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
		sidebarTreeMock.mockReset()
		terminalTabStripMock.mockReset()
		itemListData = {
			items: [
				{id: 'agent-id-1', type: 'agent', name: 'Agent 1', parentId: null},
			],
		}
	})

	it('B-01: when selectedItem has type="agent", AgentTerminalPane is in the document', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		expect(container.querySelector('[data-testid="agent-terminal-pane"]')).not.toBeNull()
	})

	it('B-02: when selectedItem has type="agent", AgentDetail is NOT in the document', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		expect(container.querySelector('[data-testid="agent-detail-mock"]')).toBeNull()
	})
})

// ── Phase 188-04 — Vault Graph removal assertions ─────────────────────────

describe('AiChatRoute — Phase 188-04 vault-graph removal', () => {
	it('F-04-1: source-text — Tab type does NOT include graph', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).not.toMatch(/type Tab = .*'graph'/)
	})

	it('F-04-2: source-text — no import from @/features/vault-graph', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		const importLines = SRC.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l))
		const vgImports = importLines.filter((l) => /vault-graph/.test(l))
		expect(vgImports).toEqual([])
	})

	it('F-04-3: rendered tab nav does NOT contain "Vault Graph" button', () => {
		useIsMobileMock.mockReturnValue(false)
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
		expect(buttons).not.toContain('Vault Graph')
	})

	// Phase 190-03 updated: TerminalTabStrip replaces static buttons; no more "Terminal" or "MCP Servers" text buttons
	it('F-04-4: TerminalTabStrip is rendered in tab nav area (replacing static Terminal/MCP buttons)', () => {
		useIsMobileMock.mockReturnValue(false)
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="terminal-tab-strip"]')).not.toBeNull()
	})

	// Phase 190-03 — F-04-5 removed (was "clicking MCP Servers tab shows mcp-server-list-mock")
	// MCP Servers tab is gone from AI Chat. Settings route still shows MCP.
	it('F-04-5: source-text — no MCP Servers tab value in Tab union (mcp tab removed)', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		// The old "type Tab = 'terminal' | 'mcp'" union is gone
		expect(SRC).not.toMatch(/type Tab = ['"]terminal['"] \| ['"]mcp['"]/)
	})
})

// ── Phase 190-03 — Tab strip wiring + MCP tab removal ─────────────────────

describe('AiChatRoute — Phase 190-03 tab strip wiring', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
		sidebarTreeMock.mockReset()
		terminalTabStripMock.mockReset()
		itemListData = {
			items: [
				{id: 'agent-id-1', type: 'agent', name: 'Agent 1', parentId: null},
				{id: 'chat-id-1', type: 'chat', name: 'Chat 1', parentId: null},
			],
		}
	})

	it('P-01: TerminalTabStrip rendered in DOM (data-testid="terminal-tab-strip")', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="terminal-tab-strip"]')).not.toBeNull()
	})

	it('P-02: "MCP Servers" text NOT in rendered DOM (tab removed)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// No static "MCP Servers" button
		expect(container.textContent).not.toMatch(/MCP Servers/)
	})

	it('P-03: sidebar agent click → tab with data-testid="tab-liv-agent-{id}" appears in tab strip', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		// The tab strip mock renders a button with data-testid="tab-liv-agent-agent-id-1"
		expect(container.querySelector('[data-testid="tab-liv-agent-agent-id-1"]')).not.toBeNull()
	})

	it('P-04: second sidebar agent click for same item → no duplicate tab (focuses existing)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// First click — get fresh captured fn before the click
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let calls = sidebarTreeMock.mock.calls as any[]
		let captured = (calls[calls.length - 1]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		// After re-render, get the LATEST captured fn (updated handleItemSelect with new tabs)
		calls = sidebarTreeMock.mock.calls as any[]
		captured = (calls[calls.length - 1]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		// Only one tab for agent-id-1
		const agentTabs = container.querySelectorAll('[data-testid="tab-liv-agent-agent-id-1"]')
		expect(agentTabs).toHaveLength(1)
	})

	it('P-05: Claude icon click (add-claude-btn) → new tab labeled "Claude 1" appears', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const addBtn = container.querySelector('[data-testid="add-claude-btn"]') as HTMLButtonElement
		expect(addBtn).not.toBeNull()
		act(() => {
			addBtn.click()
		})
		// Tab strip mock renders tabs as buttons with their labels
		expect(container.textContent).toMatch(/Claude 1/)
	})

	it('P-06: Terminal icon click (add-terminal-btn) → new tab labeled "Terminal 1" appears', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const addBtn = container.querySelector('[data-testid="add-terminal-btn"]') as HTMLButtonElement
		expect(addBtn).not.toBeNull()
		act(() => {
			addBtn.click()
		})
		expect(container.textContent).toMatch(/Terminal 1/)
	})

	it('P-07: close button (tab-close-{id}) click removes that tab from the strip', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls = sidebarTreeMock.mock.calls as any[]
		const captured = (calls[0]?.[0] ?? {}) as {onSelect?: (id: string | null) => void}
		act(() => {
			captured?.onSelect?.('agent-id-1')
		})
		// Tab is now in the strip
		expect(container.querySelector('[data-testid="tab-liv-agent-agent-id-1"]')).not.toBeNull()
		// Close it
		const closeBtn = container.querySelector('[data-testid="tab-close-liv-agent-agent-id-1"]') as HTMLButtonElement
		expect(closeBtn).not.toBeNull()
		act(() => {
			closeBtn.click()
		})
		expect(container.querySelector('[data-testid="tab-liv-agent-agent-id-1"]')).toBeNull()
	})

	it('P-08: source-text — index.tsx does NOT contain "type Tab =" (old union type gone)', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).not.toMatch(/type Tab =/)
	})
})
