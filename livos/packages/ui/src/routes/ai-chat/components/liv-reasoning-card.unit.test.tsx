/**
 * LivReasoningCard unit tests — Phase 75-02.
 *
 * Pure-helper coverage for `formatDuration` + source-text invariants on the
 * component file (CONTEXT D-13/D-14/D-15/D-16/D-33). Component-level render
 * tests are deferred to 75-07 integration; this file locks down the helper
 * surface that 75-07 wiring will rely on, and the file-level conventions
 * (label strings, GlowPulse import, IconBrain import, aria-expanded, no
 * dangerouslySetInnerHTML) per the P67-04 / P68-01 / P70-04 D-NO-NEW-DEPS
 * pattern (no @testing-library/react, no jest-dom).
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import {formatDuration} from './liv-reasoning-card'

describe('formatDuration (D-13 helper)', () => {
	it('returns empty string for undefined', () => {
		expect(formatDuration(undefined)).toBe('')
	})

	it('returns <1s for sub-second durations', () => {
		expect(formatDuration(0)).toBe('<1s')
		expect(formatDuration(500)).toBe('<1s')
		expect(formatDuration(999)).toBe('<1s')
	})

	it('returns Ns format for sub-minute durations', () => {
		expect(formatDuration(1000)).toBe('1.0s')
		expect(formatDuration(4250)).toBe('4.3s')
		expect(formatDuration(59999)).toBe('60.0s')
	})

	it('returns Nm Ns format for >=60000ms', () => {
		expect(formatDuration(60_000)).toBe('1m 0s')
		expect(formatDuration(133_000)).toBe('2m 13s')
		expect(formatDuration(3_725_000)).toBe('62m 5s')
	})
})

describe('LivReasoningCard source-text invariants (D-14, D-33)', () => {
	const src = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), 'liv-reasoning-card.tsx'),
		'utf8',
	)

	it('contains the streaming label "Liv is thinking…"', () => {
		expect(src).toContain('Liv is thinking…')
	})

	it('contains the done-state label "Reasoning"', () => {
		expect(src).toMatch(/'Reasoning'/)
	})

	it('imports GlowPulse from @/components/motion', () => {
		expect(src).toMatch(/import[\s\S]*GlowPulse[\s\S]*from\s+['"]@\/components\/motion['"]/)
	})

	it('imports IconBrain from @tabler/icons-react', () => {
		expect(src).toMatch(/IconBrain/)
		expect(src).toMatch(/@tabler\/icons-react/)
	})

	it('imports react-markdown for body rendering', () => {
		expect(src).toMatch(/from\s+['"]react-markdown['"]/)
	})

	it('defaults defaultOpen prop to false (D-13 / v31-DRAFT line 786)', () => {
		expect(src).toMatch(/defaultOpen\s*=\s*false/)
	})

	it('uses aria-expanded for accessibility', () => {
		expect(src).toContain('aria-expanded')
	})

	it('uses aria-controls for body association', () => {
		expect(src).toContain('aria-controls')
	})

	it('supports keyboard toggle (Enter / Space)', () => {
		expect(src).toMatch(/onKeyDown/)
		expect(src).toMatch(/'Enter'|"Enter"/)
	})

	it('does NOT use dangerouslySetInnerHTML (T-75-02-01 mitigation)', () => {
		expect(src).not.toContain('dangerouslySetInnerHTML')
	})

	it('does NOT import rehype-raw (T-75-02-01 mitigation)', () => {
		expect(src).not.toMatch(/rehype-raw/)
	})

	it('uses the amber-tinted background per D-14 (greppable token or rgba)', () => {
		// Either the liv-accent-amber CSS token, an inline rgba(255,189,56,...) value,
		// or a tailwind amber utility — D-14 specifies the visual; pick any that lands
		// on the amber-tint surface.
		const usesAmberToken = src.includes('liv-accent-amber')
		const usesAmberRgba = src.includes('rgba(255,189,56') || src.includes('rgba(255, 189, 56')
		const usesAmberClass = /\bbg-amber-/.test(src) || /\bborder-amber/.test(src)
		expect(usesAmberToken || usesAmberRgba || usesAmberClass).toBe(true)
	})

	it('uses --liv-border-subtle token for the card border (D-14)', () => {
		expect(src).toContain('liv-border-subtle')
	})

	it('exports LivReasoningCardProps interface (binding contract)', () => {
		expect(src).toMatch(/export\s+(?:interface|type)\s+LivReasoningCardProps/)
	})

	it('exports LivReasoningCard component', () => {
		expect(src).toMatch(/export\s+function\s+LivReasoningCard/)
	})

	it('renders chevron icons for collapsed/expanded states', () => {
		expect(src).toMatch(/IconChevronRight/)
		expect(src).toMatch(/IconChevronDown/)
	})
})
