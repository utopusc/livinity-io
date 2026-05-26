/**
 * Phase 219 T6 — schema + frontmatter parser tests.
 */
import {describe, expect, test} from 'vitest'

import {parseFrontmatter, parseSkill, SkillFrontmatterSchema} from './schema.js'

describe('parseFrontmatter', () => {
	test('extracts name + description + tools from a well-formed SKILL.md', () => {
		const raw = `---\nname: code-reviewer\ndescription: Reviews TS / JS code for bugs.\ntools: [git_diff, fs_read]\n---\nBody starts here.\nSecond line.`
		const m = parseFrontmatter(raw)
		expect(m).not.toBeNull()
		expect(m!.frontmatter.name).toBe('code-reviewer')
		expect(m!.frontmatter.description).toBe('Reviews TS / JS code for bugs.')
		expect(m!.frontmatter.tools).toEqual(['git_diff', 'fs_read'])
		expect(m!.body).toContain('Body starts here.')
	})

	test('returns null when document does not open with ---', () => {
		expect(parseFrontmatter('# No frontmatter here\nJust markdown.')).toBeNull()
	})

	test('strips wrapping single and double quotes from string values', () => {
		const raw = `---\nname: "quoted-name"\ndescription: 'single-quoted'\n---\n`
		const m = parseFrontmatter(raw)!
		expect(m.frontmatter.name).toBe('quoted-name')
		expect(m.frontmatter.description).toBe('single-quoted')
	})
})

describe('parseSkill', () => {
	test('returns a validated frontmatter + body when valid', () => {
		const raw = `---\nname: greeter\ndescription: Says hi.\n---\nHello.`
		const parsed = parseSkill(raw, '/tmp/greeter/SKILL.md')
		expect(parsed.frontmatter.name).toBe('greeter')
		expect(parsed.body).toBe('Hello.')
		expect(parsed.path).toBe('/tmp/greeter/SKILL.md')
	})

	test('throws SKILL_NO_FRONTMATTER when --- block is missing', () => {
		expect(() => parseSkill('no frontmatter', '/tmp/x/SKILL.md')).toThrow(/SKILL_NO_FRONTMATTER/)
	})

	test('rejects invalid name via zod', () => {
		const raw = `---\nname: HasUpper\ndescription: x\n---\n`
		expect(() => parseSkill(raw, '/tmp/x/SKILL.md')).toThrow(/lowercase alphanumeric/)
	})

	test('rejects missing description via zod', () => {
		const raw = `---\nname: ok\n---\n`
		expect(() => parseSkill(raw, '/tmp/x/SKILL.md')).toThrow()
	})
})

describe('SkillFrontmatterSchema (direct)', () => {
	test('tools default to omitted when absent', () => {
		const out = SkillFrontmatterSchema.parse({name: 'x', description: 'y'})
		expect(out.tools).toBeUndefined()
	})
})
