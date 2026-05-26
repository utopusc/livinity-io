/**
 * Phase 219 T6 — SkillsLoader filesystem-roundtrip tests.
 *
 * Uses a temp dir as the vault root so each test is hermetic + parallel-safe.
 */
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SkillsLoader} from './loader.js'

const loggerSpy = () => ({info: vi.fn(), warn: vi.fn()})

describe('SkillsLoader', () => {
	let vaultRoot: string

	beforeEach(() => {
		vaultRoot = mkdtempSync(join(tmpdir(), 'liv-skills-test-'))
	})

	afterEach(() => {
		rmSync(vaultRoot, {recursive: true, force: true})
	})

	test('loadManifest auto-creates the skills dir on first call', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		const manifest = loader.loadManifest('liv-ai')
		expect(manifest.agent).toBe('liv-ai')
		expect(manifest.skills).toEqual([])
		expect(existsSync(join(vaultRoot, 'liv-ai', 'skills'))).toBe(true)
	})

	test('loadManifest indexes valid SKILL.md files and skips invalid ones', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		const skillsDir = join(vaultRoot, 'liv-ai', 'skills')
		mkdirSync(join(skillsDir, 'good-one'), {recursive: true})
		mkdirSync(join(skillsDir, 'bad-one'), {recursive: true})
		writeFileSync(
			join(skillsDir, 'good-one', 'SKILL.md'),
			'---\nname: good-one\ndescription: A working skill.\n---\nBody.',
		)
		writeFileSync(join(skillsDir, 'bad-one', 'SKILL.md'), 'No frontmatter here.')

		const manifest = loader.loadManifest('liv-ai')
		expect(manifest.skills).toHaveLength(1)
		expect(manifest.skills[0]!.name).toBe('good-one')
		expect(manifest.skills[0]!.description).toBe('A working skill.')
		expect(manifest.errors).toHaveLength(1)
		expect(manifest.errors[0]!.path).toContain('bad-one')
	})

	test('loadSkillBody returns parsed body for an existing skill', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		const skillDir = join(vaultRoot, 'liv-ai', 'skills', 'helper')
		mkdirSync(skillDir, {recursive: true})
		writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: helper\ndescription: Helps.\n---\nDo X.\nDo Y.')
		const parsed = loader.loadSkillBody('liv-ai', 'helper')
		expect(parsed).not.toBeNull()
		expect(parsed!.frontmatter.name).toBe('helper')
		expect(parsed!.body).toContain('Do X.')
	})

	test('loadSkillBody returns null for a non-existent skill', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		expect(loader.loadSkillBody('liv-ai', 'missing')).toBeNull()
	})

	test('deleteSkill removes the file and returns its frontmatter', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		const skillDir = join(vaultRoot, 'liv-ai', 'skills', 'to-delete')
		mkdirSync(skillDir, {recursive: true})
		const skillFile = join(skillDir, 'SKILL.md')
		writeFileSync(skillFile, '---\nname: to-delete\ndescription: Gone.\n---\n')

		const deleted = loader.deleteSkill('liv-ai', 'to-delete')
		expect(deleted?.name).toBe('to-delete')
		expect(existsSync(skillFile)).toBe(false)
	})

	test('deleteSkill returns null when the skill does not exist', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		expect(loader.deleteSkill('liv-ai', 'never-existed')).toBeNull()
	})

	test('agent slug validation rejects illegal characters', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		expect(() => loader.loadManifest('Has Spaces')).toThrow(/SKILL_AGENT_INVALID/)
		expect(() => loader.loadManifest('UpperCase')).toThrow(/SKILL_AGENT_INVALID/)
	})

	test('skill slug validation guards loadSkillBody + deleteSkill', () => {
		const loader = new SkillsLoader({logger: loggerSpy(), vaultRoot})
		// Path traversal attempts are rejected at the slug regex layer.
		expect(loader.loadSkillBody('liv-ai', '../etc/passwd')).toBeNull()
		expect(loader.deleteSkill('liv-ai', '../etc/passwd')).toBeNull()
	})
})
