// @vitest-environment jsdom
//
// Phase 186-02 — FeaturedMcpInstaller component tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via act().
// Mocks @/components/mcp/featured-mcps to return exactly 6 entries.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/components/mcp/featured-mcps', () => ({
	FEATURED_MCPS: [
		{
			name: 'brave-search',
			displayName: 'Brave Search',
			description: 'Web search',
			category: 'Search',
			icon: 'search',
			gradient: 'from-orange-500/30 to-red-500/30',
			npmPackage: '@modelcontextprotocol/server-brave-search',
			transport: 'stdio',
		},
		{
			name: 'github',
			displayName: 'GitHub',
			description: 'GitHub tools',
			category: 'Dev Tools',
			icon: 'github',
			gradient: 'from-gray-500/30 to-slate-500/30',
			npmPackage: '@modelcontextprotocol/server-github',
			transport: 'stdio',
		},
		{
			name: 'filesystem',
			displayName: 'Filesystem',
			description: 'File ops',
			category: 'File System',
			icon: 'filesystem',
			gradient: 'from-blue-500/30 to-cyan-500/30',
			npmPackage: '@modelcontextprotocol/server-filesystem',
			transport: 'stdio',
		},
		{
			name: 'puppeteer',
			displayName: 'Puppeteer',
			description: 'Browser automation',
			category: 'Browser',
			icon: 'browser',
			gradient: 'from-green-500/30 to-emerald-500/30',
			npmPackage: '@modelcontextprotocol/server-puppeteer',
			transport: 'stdio',
		},
		{
			name: 'postgres',
			displayName: 'PostgreSQL',
			description: 'Postgres access',
			category: 'Database',
			icon: 'database',
			gradient: 'from-indigo-500/30 to-blue-500/30',
			npmPackage: '@modelcontextprotocol/server-postgres',
			transport: 'stdio',
		},
		{
			name: 'memory',
			displayName: 'Memory',
			description: 'Knowledge graph memory',
			category: 'AI',
			icon: 'brain',
			gradient: 'from-purple-500/30 to-pink-500/30',
			npmPackage: '@modelcontextprotocol/server-memory',
			transport: 'stdio',
		},
	],
}))

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

import {FeaturedMcpInstaller} from './FeaturedMcpInstaller'

// ── Tests ─────────────────────────────────────────────────────────────────

describe('FeaturedMcpInstaller', () => {
	it('B1: renders 6 featured cards (data-testid="featured-mcp-{name}" for each)', () => {
		act(() => {
			root.render(
				<FeaturedMcpInstaller installedNames={new Set()} onInstall={async () => {}} />,
			)
		})
		// Exclude the wrapper div 'featured-mcp-installer' — select only card divs (children of the grid)
		const cards = container.querySelectorAll(
			'[data-testid^="featured-mcp-"]:not([data-testid="featured-mcp-installer"])',
		)
		expect(cards.length).toBe(6)
		expect(container.querySelector('[data-testid="featured-mcp-brave-search"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="featured-mcp-github"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="featured-mcp-filesystem"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="featured-mcp-puppeteer"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="featured-mcp-postgres"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="featured-mcp-memory"]')).not.toBeNull()
	})

	it('B2: each card shows the displayName text', () => {
		act(() => {
			root.render(
				<FeaturedMcpInstaller installedNames={new Set()} onInstall={async () => {}} />,
			)
		})
		expect(container.textContent).toMatch(/Brave Search/)
		expect(container.textContent).toMatch(/GitHub/)
		expect(container.textContent).toMatch(/Filesystem/)
		expect(container.textContent).toMatch(/Puppeteer/)
		expect(container.textContent).toMatch(/PostgreSQL/)
		expect(container.textContent).toMatch(/Memory/)
	})

	it('B3: a card not in installedNames shows "Install" label (not "Installed")', () => {
		act(() => {
			root.render(
				<FeaturedMcpInstaller installedNames={new Set()} onInstall={async () => {}} />,
			)
		})
		const braveCard = container.querySelector('[data-testid="featured-mcp-brave-search"]')
		expect(braveCard?.textContent).toMatch(/Install/)
		expect(braveCard?.textContent).not.toMatch(/Installed/)
	})

	it('B4: a card whose name is in installedNames shows "Installed" label', () => {
		act(() => {
			root.render(
				<FeaturedMcpInstaller
					installedNames={new Set(['brave-search'])}
					onInstall={async () => {}}
				/>,
			)
		})
		const braveCard = container.querySelector('[data-testid="featured-mcp-brave-search"]')
		expect(braveCard?.textContent).toMatch(/Installed/)
	})

	it('B5: clicking a non-installed card calls onInstall with the correct FeaturedMcp object', async () => {
		const onInstall = vi.fn().mockResolvedValue(undefined)
		act(() => {
			root.render(
				<FeaturedMcpInstaller installedNames={new Set()} onInstall={onInstall} />,
			)
		})
		const braveCard = container.querySelector('[data-testid="featured-mcp-brave-search"]') as HTMLElement
		act(() => {
			braveCard.click()
		})
		// Wait for the async call
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0))
		})
		expect(onInstall).toHaveBeenCalledTimes(1)
		expect(onInstall).toHaveBeenCalledWith(
			expect.objectContaining({name: 'brave-search', transport: 'stdio'}),
		)
	})

	it('B6: clicking an already-installed card does NOT call onInstall', () => {
		const onInstall = vi.fn().mockResolvedValue(undefined)
		act(() => {
			root.render(
				<FeaturedMcpInstaller
					installedNames={new Set(['brave-search'])}
					onInstall={onInstall}
				/>,
			)
		})
		const braveCard = container.querySelector('[data-testid="featured-mcp-brave-search"]') as HTMLElement
		act(() => {
			braveCard.click()
		})
		expect(onInstall).not.toHaveBeenCalled()
	})
})
