/** LivMentionMenu unit tests — Phase 70-07.
 * Covers filter algorithm + 9-mention placeholder shape (CONTEXT D-28). */

import {describe, expect, it} from 'vitest'

import {filterMentions, LIV_PLACEHOLDER_MENTIONS} from './liv-mention-menu'

describe('LIV_PLACEHOLDER_MENTIONS (D-28)', () => {
	it('has exactly 9 entries', () => {
		expect(LIV_PLACEHOLDER_MENTIONS.length).toBe(9)
	})

	it('has exactly 3 of each category', () => {
		const counts: Record<string, number> = {agent: 0, tool: 0, skill: 0}
		for (const m of LIV_PLACEHOLDER_MENTIONS) counts[m.category]++
		expect(counts.agent).toBe(3)
		expect(counts.tool).toBe(3)
		expect(counts.skill).toBe(3)
	})

	it('every mention has name + label + category + description', () => {
		for (const m of LIV_PLACEHOLDER_MENTIONS) {
			expect(typeof m.name).toBe('string')
			expect(m.name.length).toBeGreaterThan(0)
			expect(typeof m.label).toBe('string')
			expect(m.label.length).toBeGreaterThan(0)
			expect(['agent', 'tool', 'skill']).toContain(m.category)
			expect(typeof m.description).toBe('string')
			expect(m.description.length).toBeGreaterThan(0)
		}
	})

	it('mention names are unique', () => {
		const names = LIV_PLACEHOLDER_MENTIONS.map((m) => m.name)
		expect(new Set(names).size).toBe(names.length)
	})

	it('mention names contain no leading @ (parent inserts it)', () => {
		for (const m of LIV_PLACEHOLDER_MENTIONS) {
			expect(m.name.startsWith('@')).toBe(false)
		}
	})
})

describe('filterMentions (D-28)', () => {
	it('returns all when filter is empty', () => {
		expect(filterMentions(LIV_PLACEHOLDER_MENTIONS, '')).toEqual(LIV_PLACEHOLDER_MENTIONS)
	})

	it('matches case-insensitively against name', () => {
		const result = filterMentions(LIV_PLACEHOLDER_MENTIONS, 'RES')
		expect(result.find((m) => m.name === 'researcher')).toBeDefined()
	})

	it('matches against label', () => {
		const result = filterMentions(LIV_PLACEHOLDER_MENTIONS, 'brave')
		expect(result.find((m) => m.name === 'brave-search')).toBeDefined()
	})

	it('returns empty array when no match', () => {
		expect(filterMentions(LIV_PLACEHOLDER_MENTIONS, 'XYZ-NOPE')).toEqual([])
	})

	it('matches mid-substring within name', () => {
		const result = filterMentions(LIV_PLACEHOLDER_MENTIONS, 'mar')
		expect(result.some((m) => m.name === 'summarize')).toBe(true)
	})

	it('returns a stable subset preserving original order', () => {
		const result = filterMentions(LIV_PLACEHOLDER_MENTIONS, 'e')
		const indices = result.map((m) => LIV_PLACEHOLDER_MENTIONS.indexOf(m))
		const sorted = [...indices].sort((a, b) => a - b)
		expect(indices).toEqual(sorted)
	})

	it('does NOT match against description (only name + label)', () => {
		// Description "Web research + summarization agent" contains "summariz" but
		// filter "summariz" should match by NAME ('summarize') not description.
		// To prove name+label scope: filter "agent" matches only mentions whose
		// name or label contains "agent". None of the 9 placeholders do, so result is [].
		expect(filterMentions(LIV_PLACEHOLDER_MENTIONS, 'agent')).toEqual([])
	})

	it('handles a custom mentions array (defaults can be overridden)', () => {
		const custom = [
			{name: 'foo', label: 'Foo', category: 'agent' as const, description: 'foo desc'},
			{name: 'bar', label: 'Bar', category: 'tool' as const, description: 'bar desc'},
		]
		expect(filterMentions(custom, 'foo')).toHaveLength(1)
		expect(filterMentions(custom, '')).toHaveLength(2)
		expect(filterMentions(custom, 'baz')).toHaveLength(0)
	})
})
