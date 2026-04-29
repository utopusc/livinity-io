// @vitest-environment jsdom
// Phase 38 Plan 04 — error/recovery/help-page smoke + source-text invariants.
//
// We don't full-render (no router/i18n provider in the unit-test layer); we
// assert structural wiring via source-text regex + a smoke import.

import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const ERR_SRC = path.join(__dirname, 'factory-reset-error-page.tsx')
const REC_SRC = path.join(__dirname, 'factory-reset-recovery-page.tsx')
const HELP_SRC = path.join(__dirname, '..', '..', 'help', 'factory-reset-recovery.tsx')

describe('FactoryResetErrorPage smoke', () => {
	it('exports FactoryResetErrorPage as a function', async () => {
		const mod = await import('./factory-reset-error-page')
		expect(typeof mod.FactoryResetErrorPage).toBe('function')
	})
})

describe('FactoryResetErrorPage source-text invariants (D-RT-02)', () => {
	const src = readFileSync(ERR_SRC, 'utf8')

	it('uses mapErrorTagToMessage from the lib', () => {
		expect(src).toMatch(/mapErrorTagToMessage\(/)
	})

	it('renders all 3 D-RT-02 buttons (View event log / Try again / Manual SSH recovery)', () => {
		expect(src).toMatch(/factory-reset\.error\.view-event-log/)
		expect(src).toMatch(/factory-reset\.error\.try-again/)
		expect(src).toMatch(/factory-reset\.error\.manual-ssh/)
	})

	it('Manual SSH button links to /help/factory-reset-recovery', () => {
		expect(src).toMatch(/href=['"]\/help\/factory-reset-recovery['"]/)
	})

	it('Try again button navigates to /factory-reset (re-opens the modal)', () => {
		expect(src).toMatch(/navigate\(['"]\/factory-reset['"]\)/)
	})

	it('NO Server4 / Server5 references', () => {
		expect(src).not.toContain('Server4')
		expect(src).not.toContain('Server5')
	})
})

describe('FactoryResetRecoveryPage smoke', () => {
	it('exports FactoryResetRecoveryPage as a function', async () => {
		const mod = await import('./factory-reset-recovery-page')
		expect(typeof mod.FactoryResetRecoveryPage).toBe('function')
	})
})

describe('FactoryResetRecoveryPage source-text invariants (D-RT-03)', () => {
	const src = readFileSync(REC_SRC, 'utf8')

	it('uses the rolled-back heading i18n key', () => {
		expect(src).toMatch(/factory-reset\.recovery\.heading/)
	})

	it('uses the body-pre-error i18n key', () => {
		expect(src).toMatch(/factory-reset\.recovery\.body-pre-error/)
	})

	it('Return-to-dashboard link uses reloadDocument (clears in-memory state)', () => {
		expect(src).toMatch(/reloadDocument/)
	})

	it('Return-to-dashboard link points at /', () => {
		expect(src).toMatch(/to=['"]\/['"]/)
	})

	it('NO Server4 / Server5 references', () => {
		expect(src).not.toContain('Server4')
		expect(src).not.toContain('Server5')
	})
})

describe('FactoryResetRecoveryHelp (static SSH page) source-text invariants (D-RT-02 verbatim)', () => {
	const src = readFileSync(HELP_SRC, 'utf8')

	it('contains the literal recovery tar command (D-RT-02 verbatim)', () => {
		expect(src).toContain('tar -xzf $(cat /tmp/livos-pre-reset.path) -C /')
	})

	it('contains the literal systemctl restart line (D-RT-02 verbatim)', () => {
		expect(src).toContain('systemctl restart livos liv-core liv-worker liv-memory')
	})

	it('exports a default React component (smoke)', async () => {
		const mod = await import('../../help/factory-reset-recovery')
		expect(typeof mod.default).toBe('function')
	})

	it('NO Server4 / Server5 references in the help page', () => {
		expect(src).not.toContain('Server4')
		expect(src).not.toContain('Server5')
	})
})
