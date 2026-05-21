// Phase 189-02 — setup-wizard-prompt.test.ts (TDD RED first)
// 4 assertions: W-01..W-04

import {describe, expect, it} from 'vitest'
import {getSetupWizardPrompt, WIZARD_PROMPT_MARKER} from './setup-wizard-prompt.js'

describe('getSetupWizardPrompt — Phase 189-02', () => {
	const agentItem = {id: 'a1', name: 'MyAgent'}
	const mcps = ['filesystem', 'git']

	it('W-01: returns string containing the agent name "MyAgent"', () => {
		const result = getSetupWizardPrompt(agentItem, mcps)
		expect(typeof result).toBe('string')
		expect(result).toContain('MyAgent')
	})

	it('W-02: result contains "agent_config_set" (tool name the wizard must call)', () => {
		const result = getSetupWizardPrompt(agentItem, mcps)
		expect(result).toContain('agent_config_set')
	})

	it('W-03: result contains "filesystem" and "git" (available MCPs injected)', () => {
		const result = getSetupWizardPrompt(agentItem, mcps)
		expect(result).toContain('filesystem')
		expect(result).toContain('git')
	})

	it('W-04: result contains "setup_done" or "setup is complete" (completion signal)', () => {
		const result = getSetupWizardPrompt(agentItem, mcps)
		const hasCompletionSignal = result.includes('setup_done') || result.includes('setup is complete') || result.includes('Setup complete')
		expect(hasCompletionSignal).toBe(true)
	})
})

describe('WIZARD_PROMPT_MARKER export', () => {
	it('is a non-empty string constant', () => {
		expect(typeof WIZARD_PROMPT_MARKER).toBe('string')
		expect(WIZARD_PROMPT_MARKER.length).toBeGreaterThan(0)
	})
})
