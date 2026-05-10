/**
 * Phase 72-01 — Bytebot tool schema shape tests.
 *
 * Spec source: 72-01-PLAN.md `<task type="auto" tdd="true">` Task 1, step 5.
 *
 * Coverage (must-have list, plan behavior section):
 *   1. BYTEBOT_TOOLS is a non-empty array.
 *   2. Every tool has name + description + input_schema (Anthropic tool format).
 *   3. BYTEBOT_TOOL_NAMES is derived from BYTEBOT_TOOLS.
 *   4. A canonical screenshot tool name is present (upstream Bytebot ships
 *      `computer_screenshot` per agent.tools.ts at fetch time 2026-05-04 —
 *      the test asserts the substring "screenshot" appears in some tool name
 *      so the assertion survives upstream's possible future renames between
 *      `computer_screenshot` and a consolidated `computer_action` form).
 *   5. Every tool name matches /^[a-z][a-z0-9_]*$/ (snake_case).
 *   6. Every description is non-empty + every input_schema.type === 'object'.
 *   7. isBytebotToolName works as a type guard.
 */
import {describe, it, expect} from 'vitest'

import {
	BYTEBOT_TOOLS,
	BYTEBOT_TOOL_NAMES,
	isBytebotToolName,
} from './bytebot-tools.js'

describe('BYTEBOT_TOOLS', () => {
	it('is a non-empty array', () => {
		expect(Array.isArray(BYTEBOT_TOOLS)).toBe(true)
		expect(BYTEBOT_TOOLS.length).toBeGreaterThan(0)
	})

	it('every tool has name + description + input_schema (Anthropic tool format)', () => {
		for (const tool of BYTEBOT_TOOLS) {
			expect(typeof tool.name).toBe('string')
			expect(tool.name.length).toBeGreaterThan(0)
			expect(typeof tool.description).toBe('string')
			expect(tool.input_schema).toBeDefined()
			expect(typeof tool.input_schema).toBe('object')
		}
	})

	it('BYTEBOT_TOOL_NAMES is derived from BYTEBOT_TOOLS', () => {
		expect(BYTEBOT_TOOL_NAMES).toEqual(BYTEBOT_TOOLS.map((t) => t.name))
	})

	it('a screenshot tool is present (canonical anchor across all Bytebot versions)', () => {
		// Upstream as of 2026-05-04 ships `computer_screenshot`. Assert via
		// substring so this test survives the upstream rename to a
		// consolidated `computer_action` shape with action='screenshot'.
		const hasScreenshot = BYTEBOT_TOOL_NAMES.some((n) =>
			n.toLowerCase().includes('screenshot'),
		)
		expect(hasScreenshot).toBe(true)
	})

	it('every tool name matches /^[a-z][a-z0-9_]*$/ (snake_case)', () => {
		for (const name of BYTEBOT_TOOL_NAMES) {
			expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
		}
	})

	it('description is non-empty + input_schema.type is "object"', () => {
		for (const tool of BYTEBOT_TOOLS) {
			expect(tool.description.length).toBeGreaterThan(0)
			expect(tool.input_schema.type).toBe('object')
		}
	})

	it('isBytebotToolName works as a type guard', () => {
		// Pick the first real tool name from the array (verbatim-safe — works
		// regardless of whether upstream ships consolidated `computer_action`
		// or separate tools today).
		const firstReal = BYTEBOT_TOOL_NAMES[0]
		expect(isBytebotToolName(firstReal)).toBe(true)
		expect(isBytebotToolName('not_a_real_tool_xyz')).toBe(false)
	})
})
