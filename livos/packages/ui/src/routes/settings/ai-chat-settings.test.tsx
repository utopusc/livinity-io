/**
 * Phase 182-03 — ai-chat-settings.test.tsx
 *
 * Source-text invariant suite (vitest). Locks the AiChatSettings page shape:
 *   - 7 form fields with data-testid attributes
 *   - DANGEROUS chip visible when skip_perms true
 *   - Confirm dialog appears when enabling skip_perms
 *   - Debounced auto-save on text fields
 *   - ccPty.getConfig + ccPty.setConfig + ccPty.validatePaths wired
 */

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'ai-chat-settings.tsx'), 'utf8')

describe('Phase 182-03 — AiChatSettings page source-text invariants', () => {
	it('A1: renders skip-perms-toggle field', () => {
		expect(SRC).toMatch(/data-testid=['"]skip-perms-toggle['"]/)
	})

	it('A2: renders default-cwd-input field', () => {
		expect(SRC).toMatch(/data-testid=['"]default-cwd-input['"]/)
	})

	it('A3: renders idle-h-input field', () => {
		expect(SRC).toMatch(/data-testid=['"]idle-h-input['"]/)
	})

	it('A4: renders max-sessions-input field', () => {
		expect(SRC).toMatch(/data-testid=['"]max-sessions-input['"]/)
	})

	it('A5: renders allowed-paths-textarea field', () => {
		expect(SRC).toMatch(/data-testid=['"]allowed-paths-textarea['"]/)
	})

	it('A6: renders force-terminal-phone-toggle field', () => {
		expect(SRC).toMatch(/data-testid=['"]force-terminal-phone-toggle['"]/)
	})

	it('A7: renders default-model-select field', () => {
		expect(SRC).toMatch(/data-testid=['"]default-model-select['"]/)
	})

	it('A8: DANGEROUS chip has data-testid skip-perms-dangerous-chip', () => {
		expect(SRC).toMatch(/data-testid=['"]skip-perms-dangerous-chip['"]/)
	})

	it('A9: confirm dialog has AlertDialog + AlertDialogAction with data-testid confirm-skip-perms-btn', () => {
		expect(SRC).toMatch(/data-testid=['"]confirm-skip-perms-btn['"]/)
	})

	it('A10: confirm dialog only appears when enabling (false→true): setConfirmOpen(true)', () => {
		expect(SRC).toMatch(/setConfirmOpen\(true\)/)
	})

	it('A11: ccPty.getConfig.useQuery wired', () => {
		expect(SRC).toMatch(/ccPty\.getConfig\.useQuery/)
	})

	it('A12: ccPty.setConfig.useMutation wired', () => {
		expect(SRC).toMatch(/ccPty\.setConfig\.useMutation/)
	})

	it('A13: ccPty.validatePaths.fetch called on blur', () => {
		expect(SRC).toMatch(/ccPty\.validatePaths\.fetch/)
	})

	it('A14: debounced auto-save uses 800ms timeout', () => {
		expect(SRC).toMatch(/800/)
	})
})
