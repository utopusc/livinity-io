import {createContext, useCallback, useEffect, useMemo, useState} from 'react'

// Phase 120-01 (v35.0): `iridescent` is now a valid Theme + ResolvedTheme value
// alongside light/dark/system. System preference can still only resolve to
// light or dark (the OS doesn't know about iridescent); see getSystemTheme.
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

function getSystemTheme(): 'light' | 'dark' {
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
	const [theme, setThemeState] = useState<Theme>(() => {
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

	const resolvedTheme = useMemo<ResolvedTheme>(() => {
		return theme === 'system' ? getSystemTheme() : theme
	}, [theme])

	// Apply class immediately and on theme change
	useEffect(() => {
		applyTheme(resolvedTheme)
	}, [resolvedTheme])

	// Subscribe to system preference changes when theme === 'system'
	useEffect(() => {
		if (theme !== 'system') return

		const mql = window.matchMedia('(prefers-color-scheme: dark)')

		function handleChange() {
			applyTheme(getSystemTheme())
		}

		mql.addEventListener('change', handleChange)
		return () => mql.removeEventListener('change', handleChange)
	}, [theme])

	const setTheme = useCallback((next: Theme) => {
		try {
			localStorage.setItem(STORAGE_KEY, next)
		} catch {
			// ignore write failures
		}
		setThemeState(next)
	}, [])

	const value = useMemo<ThemeProviderState>(
		() => ({theme, resolvedTheme, setTheme}),
		[theme, resolvedTheme, setTheme],
	)

	return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}
