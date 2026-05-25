import {createContext, useCallback, useEffect, useState} from 'react'

// Phase 120-01 (v35.0): `iridescent` is now a valid Theme + ResolvedTheme value
// alongside light/dark/system. System preference can still only resolve to
// light or dark (the OS doesn't know about iridescent); see the prefers-color-
// scheme effect below.
export type Theme = 'light' | 'dark' | 'iridescent' | 'system'
export type ResolvedTheme = 'light' | 'dark' | 'iridescent'

export interface ThemeProviderState {
	theme: Theme
	resolvedTheme: ResolvedTheme
	setTheme: (theme: Theme) => void
}

// Existing storage key preserved (NOT changed to design-tokens'
// recommended `liv_theme`) per D-120-MINI-PC-OPERATOR-PRIORITY — changing
// would migrate every existing Mini PC user's theme to default.
const STORAGE_KEY = 'liv-theme'

// Exported so use-theme.ts can reference it without a circular dep
export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

interface ThemeProviderProps {
	children: React.ReactNode
	defaultTheme?: Theme
}

function applyTheme(resolved: ResolvedTheme) {
	const root = document.documentElement
	const body = document.body
	// Existing contract (preserved): toggle `html.dark` for Tailwind dark: variants.
	if (resolved === 'dark') {
		root.classList.add('dark')
	} else {
		root.classList.remove('dark')
	}
	// Phase 120-01: mirror to <body> so @livinity/design-tokens body.dark { }
	// and body.iridescent { } override blocks fire. tokens.css scopes its
	// theme overrides to `body.*`, NOT `html.*`, so this mirror is required.
	body.classList.remove('dark', 'iridescent')
	if (resolved === 'dark') {
		body.classList.add('dark')
	} else if (resolved === 'iridescent') {
		body.classList.add('iridescent')
	}
}

export function ThemeProvider({children, defaultTheme = 'system'}: ThemeProviderProps) {
	const [storedTheme, setStoredTheme] = useState<Theme>(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
			if (
				stored === 'light' ||
				stored === 'dark' ||
				stored === 'iridescent' ||
				stored === 'system'
			) {
				return stored
			}
		} catch {
			// localStorage unavailable (e.g., sandboxed iframe) — fall through
		}
		return defaultTheme
	})

	// `resolvedTheme` is reactive React state — NOT a useMemo derivation —
	// because Plan 208-05 requires it to update LIVE when the OS
	// `prefers-color-scheme` flips (override === 'system' branch). A useMemo
	// keyed only on `storedTheme` would miss MediaQueryList change events
	// entirely and leave consumers (theme-toggle, dock-item,
	// settings-content) reading a stale value until the next manual
	// setTheme call.
	//
	// First-paint value defaults to the stored theme (or 'light' for
	// 'system'); the prefers-color-scheme effect below performs an
	// immediate sync on mount so consumers get the correct OS-derived
	// value before paint.
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
		storedTheme === 'system' ? 'light' : storedTheme,
	)

	// Keep `resolvedTheme` in sync with manual overrides (light/dark/
	// iridescent flips out of `'system'` or between concrete themes).
	useEffect(() => {
		if (storedTheme === 'system') return
		setResolvedTheme(storedTheme)
	}, [storedTheme])

	// Apply class immediately and on resolvedTheme change.
	useEffect(() => {
		applyTheme(resolvedTheme)
	}, [resolvedTheme])

	// Plan 208-05 R8 — live OS-preference auto-switch.
	//
	// Operator's explicit override ALWAYS wins: when storedTheme is
	// anything other than 'system', we early-return WITHOUT registering a
	// listener. Only when storedTheme === 'system' do we subscribe to the
	// MediaQueryList and propagate `change` events into React state so the
	// UI flips within one render tick (well under the 200ms acceptance
	// budget per Plan 208-05 CONTEXT).
	useEffect(() => {
		if (storedTheme !== 'system') return
		if (typeof window === 'undefined' || !window.matchMedia) return

		const mq = window.matchMedia('(prefers-color-scheme: dark)')

		// Initial sync — OS preference may have changed between mount
		// and effect run, or while no listener was active because the
		// operator was on a manual override.
		setResolvedTheme(mq.matches ? 'dark' : 'light')

		const handler = (e: MediaQueryListEvent) => {
			setResolvedTheme(e.matches ? 'dark' : 'light')
		}

		mq.addEventListener('change', handler)
		return () => mq.removeEventListener('change', handler)
	}, [storedTheme])

	const setTheme = useCallback((next: Theme) => {
		try {
			localStorage.setItem(STORAGE_KEY, next)
		} catch {
			// ignore write failures
		}
		setStoredTheme(next)
	}, [])

	const value: ThemeProviderState = {theme: storedTheme, resolvedTheme, setTheme}

	return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}
