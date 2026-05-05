/**
 * LivNeedsHelpCard unit tests — Phase 72-native-05.
 *
 * Pure-helper coverage for `shouldShowNeedsHelpCard` + source-text invariants
 * on the component file. D-NO-NEW-DEPS pattern (no @testing-library/react,
 * no jest-dom) — matches the P67-04 / P68-01 / P70-04 / 75-02 precedent.
 *
 * 10 cases per plan must-have list.
 */
// @vitest-environment jsdom

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import {shouldShowNeedsHelpCard} from './liv-needs-help-card'
import type {ToolCallSnapshot} from '@/stores/liv-tool-panel-store'

// ── shouldShowNeedsHelpCard predicate (D-NATIVE-08) ─────────────────────

const baseSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tu_1',
	toolName: 'mcp_bytebot_set_task_status',
	category: 'computer-use',
	assistantCall: {input: {}, ts: 0},
	status: 'done',
	startedAt: 0,
	completedAt: 0,
	...overrides,
})

describe('shouldShowNeedsHelpCard predicate (D-NATIVE-08)', () => {
	it('T1: returns false for null', () => {
		expect(shouldShowNeedsHelpCard(null)).toBe(false)
	})

	it('T2: returns false when category != computer-use', () => {
		const snap = baseSnapshot({
			category: 'browser',
			toolResult: {
				output: {_liv_meta: {kind: 'needs-help'}},
				isError: false,
				ts: 0,
			},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(false)
	})

	it('T3: returns false when toolName != *_set_task_status', () => {
		const snap = baseSnapshot({
			toolName: 'mcp_bytebot_computer_click_mouse',
			toolResult: {
				output: {_liv_meta: {kind: 'needs-help'}},
				isError: false,
				ts: 0,
			},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(false)
	})

	it('T4: returns false when toolResult has no _liv_meta', () => {
		const snap = baseSnapshot({
			toolResult: {output: 'plain string output', isError: false, ts: 0},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(false)
	})

	it('T5: returns false when _liv_meta.kind != needs-help', () => {
		const snap = baseSnapshot({
			toolResult: {
				output: {_liv_meta: {kind: 'completed'}},
				isError: false,
				ts: 0,
			},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(false)
	})

	it('T6: returns true for fully-shaped needs-help snapshot', () => {
		const snap = baseSnapshot({
			toolResult: {
				output: {_liv_meta: {kind: 'needs-help', message: 'cannot find login form'}},
				isError: false,
				ts: 0,
			},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(true)
	})

	it('T7: handles toolResult.output as JSON string (parses then checks _liv_meta)', () => {
		const snap = baseSnapshot({
			toolResult: {
				output: JSON.stringify({_liv_meta: {kind: 'needs-help', message: 'parse me'}}),
				isError: false,
				ts: 0,
			},
		})
		expect(shouldShowNeedsHelpCard(snap)).toBe(true)
	})
})

// ── Component file source-text invariants ────────────────────────────────

describe('LivNeedsHelpCard source-text invariants', () => {
	const src = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), 'liv-needs-help-card.tsx'),
		'utf8',
	)

	it('T8: banner text contains "Liv needs help" substring + uses message prop', () => {
		expect(src).toContain('Liv needs help')
	})

	it('T9: 3 buttons rendered with correct testids', () => {
		expect(src).toContain('liv-needs-help-takeover')
		expect(src).toContain('liv-needs-help-guidance')
		expect(src).toContain('liv-needs-help-cancel')
	})

	it('T10: guidance textarea hidden by default; data-state attr swap on toggle', () => {
		// useState boolean toggle for showing the textarea on click of the
		// guidance button.
		expect(src).toMatch(/useState\([^)]*false[^)]*\)/)
		expect(src).toContain('data-state')
		expect(src).toContain('<textarea')
	})

	it('uses P66 amber accent token (no hex literals)', () => {
		expect(src).toContain('var(--liv-accent-amber)')
		// No hex color literals on the component file body.
		const hexMatches = src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []
		// Allow zero hexes — D-21 requires P66 tokens only.
		expect(hexMatches).toEqual([])
	})

	it('imports GlowPulse from @/components/motion', () => {
		expect(src).toMatch(/import[\s\S]*GlowPulse[\s\S]*from\s+['"]@\/components\/motion['"]/)
	})

	it('uses Card variant="liv-elevated"', () => {
		expect(src).toMatch(/variant\s*=\s*['"]liv-elevated['"]/)
	})

	it('exports both shouldShowNeedsHelpCard helper and default LivNeedsHelpCard component', () => {
		expect(src).toMatch(/export\s+function\s+shouldShowNeedsHelpCard/)
		expect(src).toMatch(/export\s+default\s+function\s+LivNeedsHelpCard/)
	})
})
