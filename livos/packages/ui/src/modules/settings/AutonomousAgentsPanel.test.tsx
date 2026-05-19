// Phase 165-02 — AutonomousAgentsPanel source-text invariants.
//
// @testing-library/react NOT installed in @livos/ui (D-NO-NEW-DEPS).
// Mirrors master-chrome-login.test.tsx pattern: source-text grep + smoke import.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC_PATH = resolve(__dirname, 'AutonomousAgentsPanel.tsx')
const SRC = readFileSync(SRC_PATH, 'utf8')

describe('AutonomousAgentsPanel — Phase 165-02', () => {
	it('exports AutonomousAgentsPanel as a named export', () => {
		expect(SRC).toMatch(/export\s+function\s+AutonomousAgentsPanel\b/)
	})

	it('wires trpcReact.autonomous.list.useQuery', () => {
		expect(SRC).toMatch(/trpcReact\.autonomous\.list\.useQuery/)
	})
	it('wires trpcReact.autonomous.toggle.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.autonomous\.toggle\.useMutation/)
	})
	it('wires trpcReact.autonomous.runNow.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.autonomous\.runNow\.useMutation/)
	})
	it('wires trpcReact.autonomous.getDailySpend.useQuery', () => {
		expect(SRC).toMatch(/trpcReact\.autonomous\.getDailySpend\.useQuery/)
	})
	it('wires trpcReact.autonomous.setDailyBudgetCap.useMutation (CONTEXT.md budget cap editor)', () => {
		expect(SRC).toMatch(/trpcReact\.autonomous\.setDailyBudgetCap\.useMutation/)
	})

	it('renders "Run now" button label', () => {
		expect(SRC).toMatch(/Run now/)
	})

	it('renders editable cap input (type=\'number\')', () => {
		expect(SRC).toMatch(/type=['"]number['"]/)
	})

	it('Apply button bound to setBudgetMutation.mutate (>=2 occurrences: declaration + invocation)', () => {
		const matches = SRC.match(/setBudgetMutation/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
		expect(SRC).toMatch(/setBudgetMutation\.mutate/)
	})

	it('renders a <table> element', () => {
		expect(SRC).toMatch(/<table\b/)
	})

	it('source contains lastRunAt AND lastRunCostUsd (CONTEXT.md last-run + cost columns)', () => {
		expect(SRC).toMatch(/lastRunAt/)
		expect(SRC).toMatch(/lastRunCostUsd/)
	})

	it('table has "Last run" AND "Last cost" headers', () => {
		expect(SRC).toMatch(/<th[^>]*>Last run<\/th>/)
		expect(SRC).toMatch(/<th[^>]*>Last cost<\/th>/)
	})

	it('checkbox toggle invokes toggle.mutate({name, enabled})', () => {
		expect(SRC).toMatch(/toggle\.mutate\(\s*\{[\s\S]*?name:[\s\S]*?enabled:/)
	})

	it('spend bar reads spent / cap from getDailySpend', () => {
		expect(SRC).toMatch(/spentCents/)
		expect(SRC).toMatch(/capCents/)
	})
})
