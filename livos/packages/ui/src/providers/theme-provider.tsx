import {createContext, useCallback, useEffect, useMemo, useState} from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeProviderState {
	theme: Theme
	resolvedTheme: ResolvedTheme
	setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'liv-theme'

// Exported so use-theme.ts can reference it without a circular dep
export const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

interface ThemeProviderProps {
	children: React.ReactNode
	defaultTheme?: Theme
}

function getSystemTheme(): ResolvedTheme {
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
	const root = document.documentElement
	if (resolved === 'dark') {
		root.classList.add('dark')
	} else {
		root.classList.remove('dark')
	}
}

export function ThemeProvider({children, defaultTheme = 'system'}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
			if (stored === 'light' || stored === 'dark' || stored === 'system') {
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
