// @vitest-environment jsdom
//
// Phase 227-02 — Dock smoke: Liv Assistant entry click → openWindow.
//
// Direct react-dom/client mount + heavy vi.mock surface to isolate the
// click → handleOpenWindow contract. NO @testing-library/react
// (D-NO-NEW-DEPS, Phase 224-03 + 227-01 precedent).
//
// Coverage:
//   1. Liv Assistant DockItem renders when useV42MigrationActive() === true.
//   2. Liv Assistant DockItem is absent when useV42MigrationActive() === false.
//   3. Clicking the Liv Assistant tile calls openWindow(
//        'LIVINITY_liv-assistant', '/liv-assistant', 'Liv Assistant',
//        '/figma-exports/liv-ai.svg', <originRect>).
//   4. Phase 231 retirement guard — legacy chat-iframe dock tiles are
//      absent (the Phase 227 coexistence assertion is gone; this assertion
//      replaces it).

import * as React from 'react'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Mutable per-test toggles.
let migrationActive = true
const openWindowSpy = vi.fn()

vi.mock('@/hooks/use-v42-migration-active', () => ({
	useV42MigrationActive: () => migrationActive,
}))

vi.mock('@/providers/window-manager', () => ({
	useWindowManagerOptional: () => ({openWindow: openWindowSpy}),
}))

vi.mock('@/providers/apps', () => ({
	systemAppsKeyed: {
		'LIVINITY_files': {icon: '/figma-exports/dock-files-new.svg', systemAppTo: '/files/Home'},
		'LIVINITY_settings': {icon: '/figma-exports/dock-settings-new.svg', systemAppTo: '/settings'},
		'LIVINITY_live-usage': {icon: '/figma-exports/dock-live-usage.png', systemAppTo: '?dialog=live-usage'},
		'LIVINITY_app-store': {icon: '/figma-exports/dock-app-store.png', systemAppTo: '/app-store'},
		'LIVINITY_server-control': {icon: '/figma-exports/dock-server.svg', systemAppTo: '/server-control'},
		'LIVINITY_my-devices': {icon: '/figma-exports/dock-settings.png', systemAppTo: '/my-devices'},
		'LIVINITY_terminal': {icon: '/figma-exports/dock-terminal.svg', systemAppTo: '/terminal'},
		'LIVINITY_liv-ai': {icon: '/figma-exports/liv-ai.svg', systemAppTo: '/liv-ai'},
		'LIVINITY_liv-assistant': {icon: '/figma-exports/liv-ai.svg', systemAppTo: '/liv-assistant'},
	},
	useApps: () => ({userAppsKeyed: {}}),
}))

vi.mock('@/hooks/use-query-params', () => ({
	useQueryParams: () => ({addLinkSearchParams: () => ''}),
}))
vi.mock('@/hooks/use-settings-notification-count', () => ({
	useSettingsNotificationCount: () => 0,
}))
vi.mock('@/hooks/use-is-mobile', () => ({
	useIsMobile: () => false,
}))
vi.mock('@/hooks/use-launch-app', () => ({
	useLaunchApp: () => () => undefined,
}))
vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		apps: {
			recentlyOpened: {useQuery: () => ({data: []})},
		},
	},
}))
vi.mock('react-router-dom', () => ({
	useLocation: () => ({pathname: '/'}),
	Link: ({children, to: _to, ...props}: {children?: React.ReactNode; to?: unknown} & Record<string, unknown>) => (
		<a {...(props as Record<string, unknown>)}>{children}</a>
	),
}))
vi.mock('./logout-dialog', () => ({
	LogoutDialog: () => null,
}))
vi.mock('@/routes/live-usage', () => ({
	default: () => null,
}))
// ErrorBoundary swallows the LiveUsageDialog Suspense tree — keep it simple.
vi.mock('react-error-boundary', () => ({
	ErrorBoundary: ({children}: {children?: React.ReactNode}) => <>{children}</>,
}))
// Suppress notification-badge / theme dependencies pulled in by DockItem —
// they are not central to the click contract.
vi.mock('@/hooks/use-theme', () => ({
	useTheme: () => ({resolvedTheme: 'light'}),
}))

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Stub matchMedia / ResizeObserver / IntersectionObserver — framer-motion
// + some hooks probe these. jsdom has matchMedia in newer versions but be
// defensive.
if (typeof window !== 'undefined') {
	if (!window.matchMedia) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(window as any).matchMedia = () => ({
			matches: false,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			addListener: () => undefined,
			removeListener: () => undefined,
			dispatchEvent: () => false,
		})
	}
	if (!(globalThis as {ResizeObserver?: unknown}).ResizeObserver) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(globalThis as any).ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	}
}

// Import AFTER mocks so the Dock module picks up the stubbed dependencies.
import {Dock} from './dock'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	openWindowSpy.mockReset()
	migrationActive = true
})

afterEach(() => {
	if (root) {
		act(() => {
			root!.unmount()
		})
	}
	root = null
	if (container?.parentNode) container.parentNode.removeChild(container)
	container = null
})

describe('Dock — Liv Assistant entry (Phase 227-02)', () => {
	it('renders the Liv Assistant DockItem when migration flag is ON', () => {
		migrationActive = true
		act(() => {
			root!.render(<Dock />)
		})
		const tile = container!.querySelector('[data-test-dock-item="liv-assistant"]')
		expect(tile).not.toBeNull()
	})

	it('hides the Liv Assistant DockItem when migration flag is OFF', () => {
		migrationActive = false
		act(() => {
			root!.render(<Dock />)
		})
		const tile = container!.querySelector('[data-test-dock-item="liv-assistant"]')
		expect(tile).toBeNull()
	})

	it('clicking the Liv Assistant entry invokes openWindow with the LIVINITY_liv-assistant route', () => {
		migrationActive = true
		act(() => {
			root!.render(<Dock />)
		})
		const tile = container!.querySelector('[data-test-dock-item="liv-assistant"]')
		expect(tile).not.toBeNull()
		// DockItem renders a button inside the wrapper when onOpenWindow is
		// provided (dock-item.tsx:345-359). Find that clickable and fire a click.
		const clickable = (tile as HTMLElement).querySelector('button, a') as HTMLElement | null
		expect(clickable).not.toBeNull()
		act(() => {
			clickable!.click()
		})
		expect(openWindowSpy).toHaveBeenCalledTimes(1)
		expect(openWindowSpy).toHaveBeenCalledWith(
			'LIVINITY_liv-assistant',
			'/liv-assistant',
			'Liv Assistant',
			'/figma-exports/liv-ai.svg',
			expect.anything(),
		)
	})

	it('Phase 231 retirement — legacy chat-iframe dock tiles are absent', () => {
		migrationActive = true
		act(() => {
			root!.render(<Dock />)
		})
		// The two legacy dock-tile wrappers and the appId-keyed DockItems
		// (legacy launcher) MUST be absent post Phase 231 excision.
		expect(container!.querySelector('[data-test-dock-item="liv-ai-chat"]')).toBeNull()
		// Liv Assistant (Phase 227) is the surviving AI chat dock tile.
		expect(container!.querySelector('[data-test-dock-item="liv-assistant"]')).not.toBeNull()
		// Negative-grep on the rendered HTML — no legacy dock label / link.
		const html = container!.innerHTML
		expect(html).not.toContain('/liv-ai-chat')
	})
})
