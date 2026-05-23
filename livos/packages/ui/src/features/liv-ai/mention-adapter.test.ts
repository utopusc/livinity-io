import { describe, it, expect } from 'vitest'
import { LIV_AI_MENTION_TOOLS } from './mention-adapter'

describe('LIV_AI_MENTION_TOOLS (D-200-08 static catalog)', () => {
	it('contains exactly 7 entries', () => {
		expect(LIV_AI_MENTION_TOOLS).toHaveLength(7)
	})

	it('contains the locked D-200-08 tool ids in order', () => {
		const ids = LIV_AI_MENTION_TOOLS.map((t) => t.id)
		expect(ids).toEqual([
			'weather',
			'luse_list_windows',
			'get_current_time',
			'luse_computer_screenshot',
			'luse_computer_click_mouse',
			'luse_computer_type_text',
			'luse_computer_application',
		])
	})

	it('every item is of type "tool"', () => {
		for (const item of LIV_AI_MENTION_TOOLS) {
			expect(item.type).toBe('tool')
		}
	})

	it('every item has a non-empty label and description', () => {
		for (const item of LIV_AI_MENTION_TOOLS) {
			expect(item.label.length).toBeGreaterThan(0)
			expect(item.description.length).toBeGreaterThan(0)
		}
	})
})
