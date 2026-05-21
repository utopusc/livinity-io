// @vitest-environment jsdom
//
// Phase 167-04 / 169-04 / 175-05 / 176-04 / 185-01 / 185-02 / 185-03 / 186-01 — AI Chat route tests.
// Phase 188-04 — Vault Graph tab REMOVED from Tab union + vault-graph mock deleted.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). Mocks @/hooks/use-is-mobile so the behavior under test is route
// composition, not the heavy children.
//
// Phase 188-04: Vault Graph describe blocks (Phase 169-04) deleted.
//   - vaultGraphMock removed
//   - vi.mock('@/features/vault-graph') removed
//   - Phase 169-04 tab nav describe block removed
//   - Mobile "Vault Graph" button test removed
//   - Phase 185-01 B4 "Vault Graph" regression test updated (no longer checks Vault Graph)
//   - Phase 185-02 B4/B5 Vault Graph tab tests removed
//   - Source invariant "imports VaultGraph from @/features/vault-graph" removed
//   - 5 new F-04-* assertions added

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
// Default: items=[{fakeItem}] → hasItems=true → "Open a Chat" hint shows
// (preserves 14 existing assertions unchanged).
// Phase 185-01 — Extended to include SidebarTree internal calls:
//   vault.items.openItem.useSubscription + vault.items.move.useMutation
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

// Phase 186-01 — Mock McpServerList + McpServerDetail (mounted in MCP tab).
vi.mock('@/components/mcp/McpServerList', () => ({
	McpServerList: ({
		servers,
		onSelect,
	}: {
		servers: unknown[]
		selectedName: string | null
		onSelect: (n: string) => void
		onToggleEnabled: unknown
		onRemove: unknown
		isLoading?: boolean
	}) => (
		<div
			data-testid='mcp-server-list-mock'
			data-server-count={servers.length}
			onClick={() => onSelect('brave-search')}
		/>
	),
}))

vi.mock('@/components/mcp/McpServerDetail', () => ({
	McpServerDetail: ({
		server,
	}: {
		server: {name: string} | null
		onClose: () => void
		onToggleEnabled: unknown
	}) =>
		server ? (
			<div data-testid='mcp-server-detail-mock' data-server-name={server.name} />
		) : (
			<div data-testid='mcp-detail-empty' />
		),
}))

// Phase 186-02 — Mock FeaturedMcpInstaller so it renders a stable stub in AI Chat tests.
vi.mock('@/components/mcp/FeaturedMcpInstaller', () => ({
	FeaturedMcpInstaller: () => <div data-testid='featured-mcp-installer-stub' />,
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
	// The /chat-mobile redirect link lives in the /chat-mobile route, not here.
	it('mounts without throwing on mobile', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.textContent).toBeTruthy()
	})

	// Phase 188-04 — "Vault Graph" tab removed; only Terminal + MCP Servers on mobile
	it('renders "Terminal" and "MCP Servers" tab buttons on mobile (no Vault Graph)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map(
			(b) => b.textContent,
		)
		expect(buttons).toContain('Terminal')
		expect(buttons).toContain('MCP Servers')
		expect(buttons).not.toContain('Vault Graph')
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
		// The link was in the old mobile early-return; now removed.
		// Test updated to assert the correct post-185 state.
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

	// Phase 188-04 — Updated: "Vault Graph" removed; only Terminal + MCP Servers present
	it('B4: "Terminal" and "MCP Servers" buttons still present (no Vault Graph regression)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
		expect(buttons).toContain('Terminal')
		expect(buttons).toContain('MCP Servers')
		expect(buttons).not.toContain('Vault Graph')
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

	// Phase 189-01 — agent type now mounts AgentTerminalPane, not AgentDetail.
	// Updated: assert agent-terminal-pane (not agent-detail-mock) renders.
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

// ── Phase 186-01 — MCP Servers tab in AI Chat ─────────────────────────────

describe('AiChatRoute — Phase 186-01 MCP Servers tab', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
	})

	it('B1: renders "MCP Servers" tab button in the tab nav', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
		expect(buttons).toContain('MCP Servers')
	})

	it('B2: initial render does NOT show mcp-server-list-mock (Terminal is default tab)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		expect(container.querySelector('[data-testid="mcp-server-list-mock"]')).toBeNull()
	})

	it('B3: clicking "MCP Servers" tab renders mcp-server-list-mock in right pane', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const mcpBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'MCP Servers',
		) as HTMLButtonElement
		expect(mcpBtn).toBeTruthy()
		act(() => {
			mcpBtn.click()
		})
		expect(container.querySelector('[data-testid="mcp-server-list-mock"]')).not.toBeNull()
	})

	it('B4: clicking "MCP Servers" tab renders mcp-detail-empty (no selection yet)', () => {
		act(() => {
			root.render(<AiChatRoute />)
		})
		const mcpBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'MCP Servers',
		) as HTMLButtonElement
		act(() => {
			mcpBtn.click()
		})
		expect(container.querySelector('[data-testid="mcp-detail-empty"]')).not.toBeNull()
	})

	it('B5: after mcp-server-list-mock click fires onSelect, mcp-server-detail-mock appears', async () => {
		// Mock fetch to return a servers list so mcpSelectedServer resolves correctly.
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				servers: [{name: 'brave-search', transport: 'stdio', enabled: true, installedAt: 0}],
				statuses: {},
			}),
		})
		vi.stubGlobal('fetch', mockFetch)

		await act(async () => {
			root.render(<AiChatRoute />)
		})
		const mcpBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'MCP Servers',
		) as HTMLButtonElement
		// Clicking MCP tab triggers fetch via useEffect
		await act(async () => {
			mcpBtn.click()
		})
		// Now mcpServers = [{name:'brave-search',...}]; click list mock calls onSelect('brave-search')
		const listMock = container.querySelector('[data-testid="mcp-server-list-mock"]') as HTMLElement
		act(() => {
			listMock.click()
		})
		expect(container.querySelector('[data-testid="mcp-server-detail-mock"]')).not.toBeNull()
		// Phase 188-04 — vault-graph element is gone (not even a stub)
		expect(container.querySelector('[data-testid="vault-graph"]')).toBeNull()

		vi.unstubAllGlobals()
	})

	it('B6: source-text — index.tsx Tab union contains "mcp"', () => {
		const SRC = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
		expect(SRC).toMatch(/'mcp'/)
	})
})

// ── Phase 189-01 — AgentTerminalPane routing (replaces AgentDetail) ─────────

describe('AiChatRoute — Phase 189-01 agent routing', () => {
	beforeEach(() => {
		useIsMobileMock.mockReturnValue(false)
		sidebarTreeMock.mockReset()
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
		// The Tab type union must not contain 'graph'
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

	it('F-04-4: rendered tab nav contains "Terminal" and "MCP Servers"', () => {
		useIsMobileMock.mockReturnValue(false)
		act(() => {
			root.render(<AiChatRoute />)
		})
		const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
		expect(buttons).toContain('Terminal')
		expect(buttons).toContain('MCP Servers')
	})

	it('F-04-5: clicking MCP Servers tab still shows mcp-server-list-mock (regression)', () => {
		useIsMobileMock.mockReturnValue(false)
		act(() => {
			root.render(<AiChatRoute />)
		})
		const mcpBtn = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent === 'MCP Servers',
		) as HTMLButtonElement
		expect(mcpBtn).toBeTruthy()
		act(() => {
			mcpBtn.click()
		})
		expect(container.querySelector('[data-testid="mcp-server-list-mock"]')).not.toBeNull()
	})
})
