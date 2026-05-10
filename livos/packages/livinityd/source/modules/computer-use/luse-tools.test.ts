/**
 * Phase 72-01 — Luse tool schema shape tests (renamed P100-10-02 from
 * Bytebot per D-100-10-B).
 *
 * Spec source: 72-01-PLAN.md `<task type="auto" tdd="true">` Task 1, step 5.
 *
 * Coverage (must-have list, plan behavior section):
 *   1. LUSE_TOOLS is a non-empty array.
 *   2. Every tool has name + description + input_schema (Anthropic tool format).
 *   3. LUSE_TOOL_NAMES is derived from LUSE_TOOLS.
 *   4. A canonical screenshot tool name is present (upstream ships
 *      `computer_screenshot` per agent.tools.ts at fetch time 2026-05-04 —
 *      the test asserts the substring "screenshot" appears in some tool name
 *      so the assertion survives upstream's possible future renames between
 *      `computer_screenshot` and a consolidated `computer_action` form).
 *   5. Every tool name matches /^[a-z][a-z0-9_]*$/ (snake_case).
 *   6. Every description is non-empty + every input_schema.type === 'object'.
 *   7. isLuseToolName works as a type guard.
 */
import {describe, it, expect} from 'vitest'

import {
	LUSE_TOOLS,
	LUSE_TOOL_NAMES,
	isLuseToolName,
} from './luse-tools.js'

describe('LUSE_TOOLS', () => {
	it('is a non-empty array', () => {
		expect(Array.isArray(LUSE_TOOLS)).toBe(true)
		expect(LUSE_TOOLS.length).toBeGreaterThan(0)
	})

	it('every tool has name + description + input_schema (Anthropic tool format)', () => {
		for (const tool of LUSE_TOOLS) {
			expect(typeof tool.name).toBe('string')
			expect(tool.name.length).toBeGreaterThan(0)
			expect(typeof tool.description).toBe('string')
			expect(tool.input_schema).toBeDefined()
			expect(typeof tool.input_schema).toBe('object')
		}
	})

	it('LUSE_TOOL_NAMES is derived from LUSE_TOOLS', () => {
		expect(LUSE_TOOL_NAMES).toEqual(LUSE_TOOLS.map((t) => t.name))
	})

	it('a screenshot tool is present (canonical anchor across all tool versions)', () => {
		// Upstream as of 2026-05-04 ships `computer_screenshot`. Assert via
		// substring so this test survives the upstream rename to a
		// consolidated `computer_action` shape with action='screenshot'.
		const hasScreenshot = LUSE_TOOL_NAMES.some((n) =>
			n.toLowerCase().includes('screenshot'),
		)
		expect(hasScreenshot).toBe(true)
	})

	it('every tool name matches /^[a-z][a-z0-9_]*$/ (snake_case)', () => {
		for (const name of LUSE_TOOL_NAMES) {
			expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
		}
	})

	it('description is non-empty + input_schema.type is "object"', () => {
		for (const tool of LUSE_TOOLS) {
			expect(tool.description.length).toBeGreaterThan(0)
			expect(tool.input_schema.type).toBe('object')
		}
	})

	it('isLuseToolName works as a type guard', () => {
		// Pick the first real tool name from the array (verbatim-safe — works
		// regardless of whether upstream ships consolidated `computer_action`
		// or separate tools today).
		const firstReal = LUSE_TOOL_NAMES[0]
		expect(isLuseToolName(firstReal)).toBe(true)
		expect(isLuseToolName('not_a_real_tool_xyz')).toBe(false)
	})
})

describe('Phase 100-10-03 luse window-aware tool schemas', () => {
	it('T-10-03-SCHEMA-01: list_windows tool is defined with optional display arg (D-100-10-C)', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'list_windows')
		expect(tool).toBeDefined()
		expect(tool!.input_schema.type).toBe('object')
		// `display` is an optional string property (not in required[]).
		const props = tool!.input_schema.properties as Record<string, {type?: string}>
		expect(props.display).toBeDefined()
		expect(props.display.type).toBe('string')
		const required = tool!.input_schema.required ?? []
		expect(required).not.toContain('display')
	})

	it('T-10-03-SCHEMA-02: screenshot_window tool accepts either {wid} or {display} (D-100-10-C)', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'screenshot_window')
		expect(tool).toBeDefined()
		expect(tool!.input_schema.type).toBe('object')
		// Both wid (number) and display (string) properties should be declared.
		const props = tool!.input_schema.properties as Record<string, {type?: string}>
		expect(props.wid).toBeDefined()
		expect(props.wid.type).toMatch(/^(number|integer)$/)
		expect(props.display).toBeDefined()
		expect(props.display.type).toBe('string')
		// Neither is strictly required — the handler enforces the
		// "must provide wid OR display" contract at runtime.
		const required = tool!.input_schema.required ?? []
		expect(required).not.toContain('wid')
		expect(required).not.toContain('display')
	})

	it('T-10-03-SCHEMA-03: focus_window tool requires wid (D-100-10-C)', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'focus_window')
		expect(tool).toBeDefined()
		expect(tool!.input_schema.type).toBe('object')
		const props = tool!.input_schema.properties as Record<string, {type?: string}>
		expect(props.wid).toBeDefined()
		expect(props.wid.type).toMatch(/^(number|integer)$/)
		const required = tool!.input_schema.required ?? []
		expect(required).toContain('wid')
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 100-10-04 — luse stream-management tool schemas (D-100-10-C)
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 100-10-04 luse stream-management tool schemas', () => {
	it('T-10-04-SCHEMA-01: create_stream tool is defined; requires display, optional port (D-100-10-C)', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'create_stream')
		expect(tool).toBeDefined()
		expect(tool!.input_schema.type).toBe('object')
		const props = tool!.input_schema.properties as Record<string, {type?: string}>
		expect(props.display).toBeDefined()
		expect(props.display.type).toBe('string')
		expect(props.port).toBeDefined()
		expect(props.port.type).toMatch(/^(number|integer)$/)
		const required = tool!.input_schema.required ?? []
		expect(required).toContain('display')
		expect(required).not.toContain('port')
	})

	it('T-10-04-SCHEMA-02: list_streams tool is defined with empty input_schema (D-100-10-C)', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'list_streams')
		expect(tool).toBeDefined()
		expect(tool!.input_schema.type).toBe('object')
		const props = tool!.input_schema.properties ?? {}
		expect(Object.keys(props)).toHaveLength(0)
		const required = tool!.input_schema.required ?? []
		expect(required).toHaveLength(0)
	})
})
