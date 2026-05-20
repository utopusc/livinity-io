// Phase 167-03 — LivOS theme → xterm.js ITheme bridge.
//
// Pure function: takes a resolved theme value (`light` | `dark` | `iridescent`
// per Phase 120-01) and returns a complete xterm ITheme with the full
// 16-color ANSI palette. All color values are LITERAL hex constants — no
// runtime user input flows into the palette (T-167-03-01 mitigation).
//
// The `iridescent` theme reuses the dark-palette values (white-on-near-black)
// because xterm.js cannot render the iridescent CSS gradient on its own
// canvas/DOM surface. The terminal foreground stays bright; surrounding
// LivOS chrome retains the iridescent gradient via tokens.css.

import type {ITheme} from '@xterm/xterm'
import type {ResolvedTheme} from '@/providers/theme-provider'

export function livosThemeToXtermTheme(resolvedTheme: ResolvedTheme): ITheme {
	const isDark = resolvedTheme === 'dark' || resolvedTheme === 'iridescent'
	return {
		background: isDark ? '#0a0a0a' : '#ffffff',
		foreground: isDark ? '#e5e5e5' : '#1a1a1a',
		cursor: isDark ? '#06b6d4' : '#0891b2',
		selectionBackground: isDark ? '#1e293b' : '#e0f2fe',
		black: isDark ? '#000000' : '#1a1a1a',
		red: '#ef4444',
		green: '#22c55e',
		yellow: '#eab308',
		blue: '#3b82f6',
		magenta: '#a855f7',
		cyan: '#06b6d4',
		white: isDark ? '#e5e5e5' : '#1a1a1a',
		brightBlack: '#525252',
		brightRed: '#f87171',
		brightGreen: '#4ade80',
		brightYellow: '#facc15',
		brightBlue: '#60a5fa',
		brightMagenta: '#c084fc',
		brightCyan: '#22d3ee',
		brightWhite: '#ffffff',
	}
}
