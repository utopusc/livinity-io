// Phase 290 R3 (REQ4) — terminal-template-library integrity tests.
//
// Pure-data guard for the Add Shortcut → Terminal "More templates" library.
// Asserts the contract the dialog (and operator UAT) relies on: a big enough
// catalog, every field present, only allowed categories, A-Z sortable with no
// duplicate names, and no destructive / guard-off commands slipped in (M5).

import {describe, expect, it} from 'vitest'

import {
	TERMINAL_TEMPLATE_CATEGORIES,
	TERMINAL_TEMPLATE_LIBRARY,
	terminalTemplateIconUrl,
	type TerminalTemplateCategory,
} from './terminal-template-library'

const ALLOWED: ReadonlySet<TerminalTemplateCategory> = new Set([
	'AI',
	'Dev',
	'Git',
	'System',
	'Network',
	'Files',
	'Monitoring',
	'Docker',
	'Database',
	'Editor',
	'Cloud',
	'Fun',
])

describe('TERMINAL_TEMPLATE_LIBRARY', () => {
	it('ships at least 80 entries', () => {
		expect(TERMINAL_TEMPLATE_LIBRARY.length).toBeGreaterThanOrEqual(80)
	})

	it('has every field non-empty on every entry', () => {
		for (const e of TERMINAL_TEMPLATE_LIBRARY) {
			expect(typeof e.name).toBe('string')
			expect(e.name.trim().length).toBeGreaterThan(0)
			expect(typeof e.command).toBe('string')
			expect(e.command.trim().length).toBeGreaterThan(0)
			expect(typeof e.description).toBe('string')
			expect(e.description.trim().length).toBeGreaterThan(0)
			expect(typeof e.iconSlug).toBe('string')
			expect(e.iconSlug.trim().length).toBeGreaterThan(0)
		}
	})

	it('uses only allowed categories', () => {
		for (const e of TERMINAL_TEMPLATE_LIBRARY) {
			expect(ALLOWED.has(e.category)).toBe(true)
		}
	})

	it('keeps the exported category list in sync with the allowed set', () => {
		expect(new Set(TERMINAL_TEMPLATE_CATEGORIES)).toEqual(ALLOWED)
	})

	it('has no duplicate names', () => {
		const names = TERMINAL_TEMPLATE_LIBRARY.map((e) => e.name)
		expect(new Set(names).size).toBe(names.length)
	})

	it('is A-Z sortable by name (stable, unique ordering)', () => {
		const names = TERMINAL_TEMPLATE_LIBRARY.map((e) => e.name)
		const sorted = [...names].sort((a, b) => a.localeCompare(b))
		// A clean A-Z sort must produce a deterministic permutation with no ties.
		expect(sorted.length).toBe(names.length)
		for (let i = 1; i < sorted.length; i++) {
			expect(sorted[i - 1].localeCompare(sorted[i])).toBeLessThan(0)
		}
	})

	it('builds a dashboard-icons jsDelivr CDN URL from each iconSlug (M4)', () => {
		for (const e of TERMINAL_TEMPLATE_LIBRARY) {
			expect(terminalTemplateIconUrl(e)).toBe(
				`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${e.iconSlug}.svg`,
			)
		}
	})

	it('contains no destructive or guard-off commands (M5)', () => {
		const FORBIDDEN = [
			/\brm\s+-rf\b/i,
			/--dangerously-skip-permissions/i,
			/--dangerously-bypass-approvals-and-sandbox/i,
			/--yolo\b/i,
			/--yes-always/i,
			/\bmkfs\b/i,
			/\bdd\s+if=/i,
			/:\(\)\s*\{/, // fork bomb
		]
		for (const e of TERMINAL_TEMPLATE_LIBRARY) {
			for (const bad of FORBIDDEN) {
				expect(bad.test(e.command), `${e.name} → ${e.command}`).toBe(false)
			}
		}
	})

	it('covers every required category at least once', () => {
		const used = new Set(TERMINAL_TEMPLATE_LIBRARY.map((e) => e.category))
		for (const c of ALLOWED) {
			expect(used.has(c), `missing category: ${c}`).toBe(true)
		}
	})
})
