// Phase 24-01 — Docker app theme module.
//
// Scoped to /routes/docker/* — when the user opens the Docker app window we
// mount `useDockerTheme(rootRef)` inside DockerApp; the hook applies a
// `dark` / `light` class to the docker-app root (or document.documentElement
// if no ref is supplied) and persists the chosen mode to localStorage.
//
// Why scoped instead of global: no other LivOS surface uses `dark:` Tailwind
// variants today. Scoping keeps the legacy server-control + every other route
// rendering exactly as before. When v29.0 rolls dark-mode out app-wide we'll
// promote the hook to a top-level provider; until then this stays local.
//
// Persistence key: `livos:docker:theme` — mirrors the env-store key naming
// convention from Phase 22-02 D-01.
//
// Design notes
//   - mode='system' tracks `prefers-color-scheme: dark` via MediaQueryList; when
//     the OS setting flips, resolved updates without re-mounting the hook.
//   - useEffect cleanup REMOVES the `dark` class on unmount so closing the
//     Docker window leaves the rest of LivOS in light mode.
//   - resolveTheme() is exported as a pure function so the test file can
//     verify the lookup table without spinning up React.

import {useEffect, useState, type RefObject} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const STORAGE_KEY = 'livos:docker:theme'

/** Pure resolver: maps (mode, prefersDark) → 'light' | 'dark'. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
	if (mode === 'light') return 'light'
	if (mode === 'dark') return 'dark'
	return prefersDark ? 'dark' : 'light'
}

function readStoredMode(): ThemeMode {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
	} catch {
		// localStorage may throw in private browsing or sandboxed iframes — fall through.
	}
	return 'system'
}

function safeMatchMedia(): MediaQueryList | null {
	try {
		return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-color-scheme: dark)')
			: null
	} catch {
		return null
	}
}

/**
 * Subscribes to localStorage + system-preference changes and applies a
 * `dark` / `light` class to the supplied root element when `rootRef` is
 * provided. When `rootRef` is omitted the hook is "read-only" — it returns
 * `{mode, resolved, setMode}` without mutating the DOM, intended for
 * sub-components like ThemeToggle that only need to display the active
 * mode and write `setMode(next)`.
 *
 * Cross-instance sync: Plan 24-02 mounts ThemeToggle inside the StatusBar
 * which calls `useDockerTheme()` without a ref. When that toggle writes
 * localStorage via setMode, the DockerApp shell's `useDockerTheme(rootRef)`
 * instance must pick up the change so the dark class flips on the docker-app
 * root. We do this with a `storage` event listener PLUS a custom
 * `livos:docker:theme-changed` window event for same-tab updates (the
 * `storage` event only fires in OTHER tabs).
 *
 * @param rootRef Optional ref to scope the dark class. Omit for read-only
 * mode (sub-component access to mode + setMode).
 */
export function useDockerTheme(rootRef?: RefObject<HTMLElement>) {
	const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
	const [prefersDark, setPrefersDark] = useState<boolean>(() => safeMatchMedia()?.matches ?? false)

	// Track system preference changes (only matters for mode='system' but we
	// always subscribe — cheaper than conditional logic).
	useEffect(() => {
		const mql = safeMatchMedia()
		if (!mql) return
		const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
		// Older Safari uses addListener/removeListener; modern uses addEventListener.
		if (typeof mql.addEventListener === 'function') {
			mql.addEventListener('change', handler)
			return () => mql.removeEventListener('change', handler)
		}
		mql.addListener(handler)
		return () => mql.removeListener(handler)
	}, [])

	// Cross-instance sync: when one useDockerTheme caller writes setMode,
	// every other caller (different tab OR different sub-component in the
	// same tab) re-reads the persisted value.
	useEffect(() => {
		if (typeof window === 'undefined') return
		const sync = () => setModeState(readStoredMode())
		const onStorage = (e: StorageEvent) => {
			if (e.key === STORAGE_KEY) sync()
		}
		window.addEventListener('storage', onStorage) // other tabs
		window.addEventListener(THEME_EVENT, sync) // same tab
		return () => {
			window.removeEventListener('storage', onStorage)
			window.removeEventListener(THEME_EVENT, sync)
		}
	}, [])

	const resolved = resolveTheme(mode, prefersDark)

	// Apply dark/light class to root — ONLY when a rootRef is supplied.
	// Read-only callers (ThemeToggle) skip this branch so the DOM is mutated
	// exactly once per Docker window mount.
	useEffect(() => {
		if (!rootRef) return
		const root = rootRef.current
		if (!root) return
		if (resolved === 'dark') root.classList.add('dark')
		else root.classList.remove('dark')
		return () => {
			root.classList.remove('dark')
		}
	}, [resolved, rootRef])

	const setMode = (m: ThemeMode) => {
		setModeState(m)
		try {
			localStorage.setItem(STORAGE_KEY, m)
		} catch {
			// localStorage write can fail (quota, private mode); state still updates in-memory.
		}
		// Notify other useDockerTheme instances in this same tab
		// (the `storage` event fires in OTHER tabs only).
		try {
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new Event(THEME_EVENT))
			}
		} catch {
			// CustomEvent dispatch can fail in exotic environments; non-fatal.
		}
	}

	return {mode, resolved, setMode}
}

/** Same-tab notification channel for cross-instance theme sync. */
const THEME_EVENT = 'livos:docker:theme-changed'
