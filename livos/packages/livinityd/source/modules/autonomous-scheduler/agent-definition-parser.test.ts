/**
 * Phase 164-01 — agent-definition-parser.test.ts
 *
 * Vitest suite for the YAML-frontmatter + markdown-body agent definition
 * parser. Locks the parser contract that the scheduler (164-02) and the
 * sample agents (164-04) build against.
 *
 * Invariants enforced:
 *   - Required fields (name, schedule, model) surface a structured error
 *   - Optional fields receive documented defaults
 *   - Cron validation goes through node-cron (no hand-rolled regex)
 *   - Directory walk is partial-failure resilient (one broken file does
 *     NOT block the rest)
 *   - Missing directory returns a structured error (does NOT throw)
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync, mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {parseAgentDefinition, parseAgentDefinitionsDir} from './agent-definition-parser.js'

const FAKE_SOURCE_PATH = '/tmp/test-agents/example.md'

function fm(lines: Record<string, string>): string {
	const yamlBody = Object.entries(lines)
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n')
	return `---\n${yamlBody}\n---\n`
}

describe('parseAgentDefinition — Phase 164-01 single-file parser', () => {
	it('Test 1 (happy path): full frontmatter + body returns ok=true with all fields populated', () => {
		const markdown = [
			'---',
			'name: nightly-backup-audit',
			'schedule: "0 3 * * *"',
			'model: claude-sonnet-4-6',
			'max_turns: 15',
			'max_budget_usd: 3',
			'allowed_tools: ["Read", "Bash", "Glob", "Grep"]',
			'mcp_servers: ["luse", "filesystem"]',
			'enabled: true',
			'---',
			'',
			'# Nightly Backup Audit',
			'',
			'Read /opt/livos/data/backups/ and report status.',
			'',
		].join('\n')

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.definition.name).toBe('nightly-backup-audit')
		expect(result.definition.schedule).toBe('0 3 * * *')
		expect(result.definition.model).toBe('claude-sonnet-4-6')
		expect(result.definition.maxTurns).toBe(15)
		expect(result.definition.maxBudgetUsd).toBe(3)
		expect(result.definition.allowedTools).toEqual(['Read', 'Bash', 'Glob', 'Grep'])
		expect(result.definition.mcpServers).toEqual(['luse', 'filesystem'])
		expect(result.definition.enabled).toBe(true)
		expect(result.definition.body).toContain('# Nightly Backup Audit')
		expect(result.definition.body).toContain('Read /opt/livos/data/backups/')
		expect(result.definition.sourcePath).toBe(FAKE_SOURCE_PATH)
	})

	it('Test 2 (defaults): only required fields → defaults applied', () => {
		const markdown = fm({
			name: 'minimal-agent',
			schedule: '"*/30 * * * *"',
			model: 'claude-haiku-4-5',
		}) + '\nSome body text.\n'

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.definition.name).toBe('minimal-agent')
		expect(result.definition.maxTurns).toBe(20)
		expect(result.definition.maxBudgetUsd).toBe(5)
		expect(result.definition.allowedTools).toEqual(['Read', 'Bash', 'Glob', 'Grep'])
		expect(result.definition.mcpServers).toEqual([])
		expect(result.definition.enabled).toBe(true)
	})

	it('Test 3 (missing required name): returns ok=false with structured err', () => {
		const markdown = fm({
			schedule: '"0 3 * * *"',
			model: 'claude-sonnet-4-6',
		})

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.err).toBe('missing required field: name')
	})

	it('Test 4 (missing required schedule): returns ok=false with structured err', () => {
		const markdown = fm({
			name: 'no-schedule',
			model: 'claude-sonnet-4-6',
		})

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.err).toBe('missing required field: schedule')
	})

	it('Test 4b (missing required model): returns ok=false with structured err', () => {
		const markdown = fm({
			name: 'no-model',
			schedule: '"0 3 * * *"',
		})

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.err).toBe('missing required field: model')
	})

	it('Test 5 (invalid cron): schedule "not a cron" returns ok=false with /invalid cron/i', () => {
		const markdown = fm({
			name: 'bad-cron',
			schedule: '"not a cron"',
			model: 'claude-sonnet-4-6',
		})

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.err).toMatch(/invalid cron/i)
	})

	it('Test 6 (valid cron variants): "0 3 * * *", "*/30 * * * *", "0 0 * * 0" all accepted', () => {
		const variants = ['0 3 * * *', '*/30 * * * *', '0 0 * * 0']
		for (const sched of variants) {
			const markdown = fm({
				name: `agent-${sched.replace(/[^a-z0-9]/gi, '-')}`,
				schedule: `"${sched}"`,
				model: 'claude-haiku-4-5',
			})
			const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
			expect(result.ok, `cron "${sched}" must parse`).toBe(true)
			if (!result.ok) continue
			expect(result.definition.schedule).toBe(sched)
		}
	})

	it('Test 7 (empty body): frontmatter only → ok=true with body=""', () => {
		const markdown = fm({
			name: 'empty-body',
			schedule: '"0 3 * * *"',
			model: 'claude-sonnet-4-6',
		})

		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.definition.body).toBe('')
	})

	it('Test 7b (missing frontmatter entirely): returns ok=false with frontmatter err', () => {
		const markdown = '# Just a markdown body, no frontmatter.\n'
		const result = parseAgentDefinition(markdown, FAKE_SOURCE_PATH)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.err).toMatch(/frontmatter/i)
	})
})

describe('parseAgentDefinitionsDir — Phase 164-01 directory walk', () => {
	let workDir: string

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'livos-agents-parse-'))
	})

	afterEach(() => {
		rmSync(workDir, {recursive: true, force: true})
	})

	it('Test 8 (partial-failure): one valid + one broken → ok=1 entry, errors=1 entry', async () => {
		const validMd = [
			'---',
			'name: valid-agent',
			'schedule: "0 3 * * *"',
			'model: claude-sonnet-4-6',
			'---',
			'Valid body.',
			'',
		].join('\n')

		// Broken: invalid cron expression — passes YAML parse but fails cron.validate()
		const brokenMd = [
			'---',
			'name: broken-agent',
			'schedule: "this-is-not-a-cron"',
			'model: claude-sonnet-4-6',
			'---',
			'',
		].join('\n')

		writeFileSync(join(workDir, 'valid.md'), validMd)
		writeFileSync(join(workDir, 'broken.md'), brokenMd)

		const result = await parseAgentDefinitionsDir(workDir)
		expect(result.ok).toHaveLength(1)
		expect(result.ok[0].name).toBe('valid-agent')
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0].path).toBe(join(workDir, 'broken.md'))
		expect(result.errors[0].err).toMatch(/invalid cron/i)
	})

	it('Test 9 (ignores non-.md): README.txt and .gitkeep silently skipped', async () => {
		const validMd = [
			'---',
			'name: only-agent',
			'schedule: "0 3 * * *"',
			'model: claude-haiku-4-5',
			'---',
			'',
		].join('\n')

		writeFileSync(join(workDir, 'only.md'), validMd)
		writeFileSync(join(workDir, 'README.txt'), 'not an agent\n')
		writeFileSync(join(workDir, '.gitkeep'), '')

		const result = await parseAgentDefinitionsDir(workDir)
		expect(result.ok).toHaveLength(1)
		expect(result.ok[0].name).toBe('only-agent')
		expect(result.errors).toHaveLength(0)
	})

	it('Test 10 (missing dir): does NOT throw, returns ok=[] + errors=1', async () => {
		const ghostDir = join(workDir, 'does-not-exist')
		const result = await parseAgentDefinitionsDir(ghostDir)
		expect(result.ok).toEqual([])
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0].path).toBe(ghostDir)
		expect(result.errors[0].err).toMatch(/not found|ENOENT|no such file/i)
	})

	it('Test 10b (stable sort by name): multiple valid agents → returned alphabetically', async () => {
		const mkAgent = (name: string) =>
			[
				'---',
				`name: ${name}`,
				'schedule: "0 3 * * *"',
				'model: claude-haiku-4-5',
				'---',
				'',
			].join('\n')

		// Write in non-alphabetical order to prove the sort is doing work.
		writeFileSync(join(workDir, 'zeta.md'), mkAgent('zeta'))
		writeFileSync(join(workDir, 'alpha.md'), mkAgent('alpha'))
		writeFileSync(join(workDir, 'mu.md'), mkAgent('mu'))

		const result = await parseAgentDefinitionsDir(workDir)
		expect(result.ok.map(d => d.name)).toEqual(['alpha', 'mu', 'zeta'])
	})

	it('Test 10c (ignores subdirectories): nested .md files NOT walked recursively', async () => {
		const validMd = [
			'---',
			'name: top-level',
			'schedule: "0 3 * * *"',
			'model: claude-haiku-4-5',
			'---',
			'',
		].join('\n')

		const nestedDir = join(workDir, 'nested')
		mkdirSync(nestedDir)
		writeFileSync(join(workDir, 'top.md'), validMd)
		writeFileSync(join(nestedDir, 'should-be-skipped.md'), validMd)

		const result = await parseAgentDefinitionsDir(workDir)
		expect(result.ok).toHaveLength(1)
		expect(result.ok[0].name).toBe('top-level')
	})
})
