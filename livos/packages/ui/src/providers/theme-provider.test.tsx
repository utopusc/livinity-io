// @vitest-environment jsdom
//
// Phase 208 Plan 05 — Theme provider OS-preference auto-switch (R8).
//
// Locks the contract introduced by Plan 208-05:
//
//   1. Stored override ALWAYS wins over OS preference for any value
//      other than 'system' (light/dark/iridescent stay put when
//      matchMedia change fires).
//   2. When stored override is 'system', a live MediaQueryList
//      listener is registered for '(prefers-color-scheme: dark)'.
//   3. Firing the matchMedia `change` event while stored is 'system'
//      updates context.resolvedTheme reactively (light <-> dark).
//   4. Switching stored override from a manual value to 'system'
//      installs a fresh listener; subsequent change events update
//      resolvedTheme.
//   5. Unmount removes the listener (no leak).
//
// Per LivOS UI testing precedent (Plan 200-05, 199-04, etc.), the UI
// package has D-NO-NEW-DEPS — `@testing-library/react` is NOT installed.
// Tests use direct react-dom/client mounts against jsdom + a manual
// matchMedia mock that records listeners.

import {act, useContext} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ThemeProvider, ThemeProviderContext, type Theme} from './theme-provider'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─── Mutable matchMedia mock ───────────────────────────────────────────
// We need to (a) report `matches` based on a mutable OS-preference
// variable, (b) capture registered change listeners so tests can fire
// synthetic change events, (c) record removeEventListener calls so we
// can assert cleanup.

type Handler = (e: {matches: boolean; media: string}) => void

interface MqlRecord {
	media: string
	listeners: Set<Handler>
	removed: Handler[]
}

let osPrefersDark = false
let mqlRecords: MqlRecord[] = []

function installMatchMediaMock() {
	mqlRecords = []
	window.matchMedia = (query: string) => {
		const record: MqlRecord = {
			media: query,
			listeners: new Set(),
			removed: [],
		}
		mqlRecords.push(record)
		return {
			get matches() {
				return query === '(prefers-color-scheme: dark)' ? osPrefersDark : false
			},
			media: query,
			onchange: null,
			addEventListener(_type: string, handler: Handler) {
				record.listeners.add(handler)
			},
			removeEventListener(_type: string, handler: Handler) {
				record.listeners.delete(handler)
				record.removed.push(handler)
			},
			addListener(handler: Handler) {
				record.listeners.add(handler)
			},
			removeListener(handler: Handler) {
				record.listeners.delete(handler)
				record.removed.push(handler)
			},
			dispatchEvent: () => false,
		} as unknown as MediaQueryList
	}
}

function fireOsChange(matches: boolean) {
	osPrefersDark = matches
	// Fire on every active listener of the prefers-color-scheme query.
	for (const rec of mqlRecords) {
		if (rec.media !== '(prefers-color-scheme: dark)') continue
		for (const h of rec.listeners) {
			h({matches, media: rec.media})
		}
	}
}

function activeColorSchemeListenerCount(): number {
	let count = 0
	for (const rec of mqlRecords) {
		if (rec.media === '(prefers-color-scheme: dark)') {
			count += rec.listeners.size
		}
	}
	return count
}

// ─── Test harness ───────────────────────────────────────────────────────
// Render <ThemeProvider> + a probe child that exposes the context value
// to the test via a ref-style closure.

let container: HTMLDivElement
let root: Root
let lastContext: {
	theme: Theme
	resolvedTheme: string
	setTheme: (t: Theme) => void
} | null = null

function Probe() {
	const ctx = useContext(ThemeProviderContext)
	lastContext = ctx ?? null
	return null
}

function mount(initialStored: Theme | null) {
	if (initialStored === null) {
		localStorage.removeItem('liv-theme')
	} else {
		localStorage.setItem('liv-theme', initialStored)
	}
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	act(() => {
		root.render(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		)
	})
}

function unmount() {
	act(() => {
		root.unmount()
	})
	container.remove()
	lastContext = null
}

beforeEach(() => {
	installMatchMediaMock()
	osPrefersDark = false
	localStorage.clear()
	document.documentElement.className = ''
	document.body.className = ''
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ThemeProvider — OS preference auto-switch (Plan 208-05 R8)', () => {
	it('stored dark + OS prefers light → resolvedTheme stays dark (override wins)', () => {
		osPrefersDark = false
		mount('dark')
		expect(lastContext?.resolvedTheme).toBe('dark')
		unmount()
	})

	it('stored light + OS prefers dark → resolvedTheme stays light (override wins)', () => {
		osPrefersDark = true
		mount('light')
		expect(lastContext?.resolvedTheme).toBe('light')
		unmount()
	})

	it('stored system + OS prefers dark → resolvedTheme resolves to dark', () => {
		osPrefersDark = true
		mount('system')
		expect(lastContext?.resolvedTheme).toBe('dark')
		unmount()
	})

	it('stored system + OS prefers light → resolvedTheme resolves to light', () => {
		osPrefersDark = false
		mount('system')
		expect(lastContext?.resolvedTheme).toBe('light')
		unmount()
	})

	it('stored system + OS flips to dark via change event → resolvedTheme updates to dark', () => {
		osPrefersDark = false
		mount('system')
		expect(lastContext?.resolvedTheme).toBe('light')
		act(() => {
			fireOsChange(true)
		})
		expect(lastContext?.resolvedTheme).toBe('dark')
		unmount()
	})

	it('stored dark + OS flips via change event → resolvedTheme STAYS dark (no flip)', () => {
		osPrefersDark = false
		mount('dark')
		expect(lastContext?.resolvedTheme).toBe('dark')
		act(() => {
			fireOsChange(true)
		})
		expect(lastContext?.resolvedTheme).toBe('dark')
		unmount()
	})

	it('switching stored from dark to system installs a fresh listener that responds to change events', () => {
		osPrefersDark = false
		mount('dark')
		// dark override → no active prefers-color-scheme listener
		// (effect early-returns on non-system).
		expect(activeColorSchemeListenerCount()).toBe(0)
		act(() => {
			lastContext?.setTheme('system')
		})
		// system override → listener must be installed.
		expect(activeColorSchemeListenerCount()).toBeGreaterThanOrEqual(1)
		// And firing a change event must update resolvedTheme.
		act(() => {
			fireOsChange(true)
		})
		expect(lastContext?.resolvedTheme).toBe('dark')
		unmount()
	})

	it('unmount removes the matchMedia change listener (no leak)', () => {
		osPrefersDark = false
		mount('system')
		expect(activeColorSchemeListenerCount()).toBeGreaterThanOrEqual(1)
		unmount()
		expect(activeColorSchemeListenerCount()).toBe(0)
	})
})
