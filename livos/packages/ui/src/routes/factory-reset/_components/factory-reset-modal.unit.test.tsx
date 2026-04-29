// @vitest-environment jsdom
//
// Phase 38 Plan 03 — FactoryResetModal smoke + wiring tests.
//
// `@testing-library/react` is NOT installed. The substantive behaviors are
// covered by pure-logic tests:
//   - Strict-equality typed confirm (Plan 01: typed-confirm.unit.test.ts)
//   - Pre-flight 5s AbortController timeout (Plan 01: network-preflight.unit.test.ts)
//   - 7-item DELETION_LIST verbatim (Plan 01: deletion-list.unit.test.ts)
//   - Confirm-button gating precedence (this plan: preflight-decision.unit.test.ts)
//
// What's left for this file: smoke imports + textual assertions on the
// component source itself (the `<ul>` shape, `<RadioGroup defaultValue>`,
// `onPointerDownOutside`).
//
// Deferred RTL tests (uncomment when @testing-library/react lands):
//   FRM1: opens by default; getByTestId('factory-reset-modal') exists
//   FRM2: getAllByRole('listitem') under the deletion list returns 7
//   FRM3: getByTestId('factory-reset-radio') has data-state='checked' on the
//         'preserve' RadioGroupItem on first render
//   FRM4: typing 'factory reset' (lower) in confirm input: confirm button
//         remains disabled (aria-disabled='true')
//   FRM5: typing 'FACTORY RESET' enables the confirm button
//   FRM6: when system.updateStatus mock returns running:true, confirm button
//         disabled with tooltip "An update is currently running. Try again
//         after it completes."
//   FRM7: when fetchImpl rejects, after re-render confirm button disabled with
//         tooltip "Cannot reach livinity.io. Reinstall would fail. Check your
//         internet connection and try again."
//   FRM8: clicking outside the modal does NOT close it (onPointerDownOutside
//         preventDefault)
//   FRM9: pressing Escape closes the modal (default Radix behavior)
//   FRM10: clicking confirm with valid state calls
//          useGlobalSystemState().reset({preserveApiKey: true}) once

import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const MODAL_SRC = path.join(__dirname, 'factory-reset-modal.tsx')

describe('FactoryResetModal smoke', () => {
	it('module exports FactoryResetModal', async () => {
		const mod = await import('./factory-reset-modal')
		expect(typeof mod.FactoryResetModal).toBe('function')
	})
})

describe('FactoryResetModal source-text invariants (D-MD-01 / D-CF-03 / D-RD-01 wiring)', () => {
	const src = readFileSync(MODAL_SRC, 'utf8')

	it('imports DELETION_LIST from the lib (D-MD-01 single source of truth)', () => {
		expect(src).toMatch(/from\s+['"]@\/features\/factory-reset\/lib\/deletion-list['"]/)
		expect(src).toMatch(/DELETION_LIST\.map/)
	})

	it('renders the deletion list as a REAL <ul> (not a paragraph)', () => {
		expect(src).toMatch(/<ul[\s\S]*?data-testid=['"]factory-reset-deletion-list['"]/)
	})

	it('imports isFactoryResetTrigger for strict-equality confirm', () => {
		expect(src).toMatch(/isFactoryResetTrigger/)
	})

	it('uses computeConfirmEnabled for the destructive button gate', () => {
		expect(src).toMatch(/computeConfirmEnabled\s*\(/)
	})

	it('uses usePreflight for network reachability', () => {
		expect(src).toMatch(/usePreflight\s*\(/)
	})

	it('imports system.updateStatus for the update-in-progress check', () => {
		expect(src).toMatch(/system\.updateStatus/)
	})

	it('passes onPointerDownOutside preventDefault to DialogContent (D-CF-03)', () => {
		expect(src).toMatch(/onPointerDownOutside=\{[^}]*preventDefault/)
	})

	it('default radio value is "preserve" (D-RD-01 safer default)', () => {
		// either useState<RadioValue>('preserve') or value='preserve' on RadioGroup
		expect(src).toMatch(/useState<RadioValue>\(\s*['"]preserve['"]\s*\)/)
	})

	it('renders Cancel button alongside the destructive button', () => {
		expect(src).toMatch(/data-testid=['"]factory-reset-cancel['"]/)
		expect(src).toMatch(/data-testid=['"]factory-reset-confirm['"]/)
	})

	it('forward-compat backup-mutex TODO comment is present (D-PF-01 item 3)', () => {
		expect(src).toMatch(/TODO\(v30\.0\)[\s\S]*backup-mutex/i)
	})

	it('NO references to Server4 or Server5', () => {
		expect(src).not.toContain('Server4')
		expect(src).not.toContain('Server5')
	})

	it('calls reset({preserveApiKey}) — Plan 01 contract', () => {
		expect(src).toMatch(/reset\(\{preserveApiKey/)
	})

	it('confirm input uses EXPECTED_CONFIRM_PHRASE as placeholder', () => {
		expect(src).toMatch(/placeholder=\{EXPECTED_CONFIRM_PHRASE\}/)
	})
})
