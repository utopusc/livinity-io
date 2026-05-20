// @vitest-environment node
//
// Phase 167-03 — terminal-theme unit tests.
//
// Pure-function tests — no jsdom/react needed. Source-text invariants
// lock the palette to literal hex constants.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

import {livosThemeToXtermTheme} from './terminal-theme'

describe('livosThemeToXtermTheme', () => {
	it('dark scheme returns #0a0a0a background and #e5e5e5 foreground', () => {
		const t = livosThemeToXtermTheme('dark')
		expect(t.background).toBe('#0a0a0a')
		expect(t.foreground).toBe('#e5e5e5')
	})

	it('light scheme returns #ffffff background and #1a1a1a foreground (structurally different from dark)', () => {
		const dark = livosThemeToXtermTheme('dark')
		const light = livosThemeToXtermTheme('light')
		expect(light.background).toBe('#ffffff')
		expect(light.foreground).toBe('#1a1a1a')
		expect(light.background).not.toBe(dark.background)
		expect(light.foreground).not.toBe(dark.foreground)
	})

	it('returns complete ANSI 16-color palette', () => {
		const ansi16 = [
			'black',
			'red',
			'green',
			'yellow',
			'blue',
			'magenta',
			'cyan',
			'white',
			'brightBlack',
			'brightRed',
			'brightGreen',
			'brightYellow',
			'brightBlue',
			'brightMagenta',
			'brightCyan',
			'brightWhite',
		] as const
		const t = livosThemeToXtermTheme('dark') as Record<string, string | undefined>
		ansi16.forEach((k) => {
			expect(t[k]).toBeDefined()
			expect(t[k]).toMatch(/^#[0-9a-f]{6}$/i)
		})
	})

	it('cursor + selectionBackground differ between dark and light', () => {
		const dark = livosThemeToXtermTheme('dark')
		const light = livosThemeToXtermTheme('light')
		expect(dark.cursor).toBe('#06b6d4')
		expect(light.cursor).toBe('#0891b2')
		expect(dark.selectionBackground).toBe('#1e293b')
		expect(light.selectionBackground).toBe('#e0f2fe')
		expect(dark.cursor).not.toBe(light.cursor)
		expect(dark.selectionBackground).not.toBe(light.selectionBackground)
	})

	it('iridescent scheme reuses the dark palette (white-on-near-black)', () => {
		// xterm cannot render the iridescent gradient — fall back to dark.
		const dark = livosThemeToXtermTheme('dark')
		const iridescent = livosThemeToXtermTheme('iridescent')
		expect(iridescent.background).toBe(dark.background)
		expect(iridescent.foreground).toBe(dark.foreground)
	})
})

describe('terminal-theme — source-text invariants', () => {
	const SRC = readFileSync(resolve(__dirname, 'terminal-theme.ts'), 'utf8')

	it('contains at least 20 hex color literals', () => {
		const matches = SRC.match(/#[0-9a-fA-F]{6}/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(20)
	})

	it('does NOT use template literals for color values (T-167-03-01)', () => {
		// Confirm no `${...}` template substitution feeds a color field.
		const colorTemplateLines = SRC
			.split(/\r?\n/)
			.filter(
				(line) =>
					/background|foreground|cursor|selectionBackground|black|red|green|yellow|blue|magenta|cyan|white|brightBlack|brightRed|brightGreen|brightYellow|brightBlue|brightMagenta|brightCyan|brightWhite/.test(
						line,
					) && /\$\{/.test(line),
			)
		expect(colorTemplateLines).toEqual([])
	})
})
