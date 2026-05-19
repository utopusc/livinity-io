/**
 * Phase 162-01 — vault-scaffolder.test.ts
 *
 * Vitest suite for the idempotent vault bootstrap (master plan D-V34-D).
 * Uses the REAL bundled vault-templates directory so the test catches
 * template content drift in addition to scaffolder logic bugs.
 *
 * Invariant: scaffolder API must export the canonical name
 * import { scaffoldVault } from './vault-scaffolder.js';
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

import {scaffoldVault} from './vault-scaffolder.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Resolve the real bundled templates dir (committed in Task 1).
const REAL_TEMPLATES_DIR = resolve(__dirname, '../../data/vault-templates')

function silentLogger() {
	const logs: string[] = []
	const errors: string[] = []
	return {
		logs,
		errors,
		logger: {
			log: (msg: string) => logs.push(msg),
			error: (msg: string, err?: unknown) => errors.push(msg + (err ? ` :: ${String(err)}` : '')),
		},
	}
}

describe('scaffoldVault — Phase 162-01 vault bootstrap', () => {
	let workDir: string
	let vaultPath: string

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), 'vault-scaffolder-test-'))
		vaultPath = join(workDir, 'vault')
	})

	afterEach(() => {
		rmSync(workDir, {recursive: true, force: true})
	})

	it('Test 1 (clean-create): materialises full template tree into empty vault path', async () => {
		const {logger, logs} = silentLogger()
		const result = await scaffoldVault({
			vaultPath,
			templatesDir: REAL_TEMPLATES_DIR,
			logger,
		})

		expect(result.status === 'scaffolded' || result.status === 'partial').toBe(true)
		// All 12 template files must exist after a clean scaffold.
		expect(existsSync(join(vaultPath, 'CLAUDE.md'))).toBe(true)
		expect(existsSync(join(vaultPath, '.claude/settings.json'))).toBe(true)
		expect(existsSync(join(vaultPath, '.claude/mcp.json'))).toBe(true)
		expect(existsSync(join(vaultPath, '.claude/skills/livos-status/SKILL.md'))).toBe(true)
		expect(existsSync(join(vaultPath, '.claude/commands/livos-deploy.md'))).toBe(true)
		expect(existsSync(join(vaultPath, 'memory/user/bruce-profile.md'))).toBe(true)
		expect(existsSync(join(vaultPath, 'memory/projects/v34.md'))).toBe(true)
		expect(existsSync(join(vaultPath, 'memory/references/mini-pc.md'))).toBe(true)
		expect(existsSync(join(vaultPath, 'memory/feedback/.gitkeep'))).toBe(true)
		expect(existsSync(join(vaultPath, 'sessions/.gitkeep'))).toBe(true)
		expect(existsSync(join(vaultPath, 'inbox/.gitkeep'))).toBe(true)
		expect(existsSync(join(vaultPath, 'livos-agents/.gitkeep'))).toBe(true)
		// Logger should record the scaffold result.
		expect(logs.some((l) => l.startsWith('vault-scaffolder:'))).toBe(true)
	})

	it('Test 2 (idempotency): user-edited file survives a re-run (NOT overwritten)', async () => {
		const {logger} = silentLogger()
		// First scaffold.
		await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})

		// User writes a marker file into the scaffold tree.
		const markerPath = join(vaultPath, 'memory/feedback/user-edit.md')
		writeFileSync(markerPath, 'MARKER', 'utf8')

		// Also mutate one of the templated files to verify it is preserved too.
		const claudeMd = join(vaultPath, 'CLAUDE.md')
		writeFileSync(claudeMd, 'USER OVERRIDE OF CLAUDE.MD', 'utf8')

		// Second scaffold — must NOT overwrite either file.
		const result = await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})
		expect(['existing', 'partial', 'scaffolded']).toContain(result.status)

		// Marker still exists with original content.
		expect(readFileSync(markerPath, 'utf8')).toBe('MARKER')
		// User-edited CLAUDE.md still has the override.
		expect(readFileSync(claudeMd, 'utf8')).toBe('USER OVERRIDE OF CLAUDE.MD')
	})

	it('Test 3 (settings.json validity): scaffolded settings.json is valid JSON with model=claude-opus-4-7', async () => {
		const {logger} = silentLogger()
		await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})

		const settingsPath = join(vaultPath, '.claude/settings.json')
		const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'))
		expect(parsed.model).toBe('claude-opus-4-7')
		expect(Array.isArray(parsed.allowed_tools)).toBe(true)
	})

	it('Test 4 (CLAUDE.md wikilink): scaffolded CLAUDE.md contains [[bruce-profile]]', async () => {
		const {logger} = silentLogger()
		await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})

		const claudeMd = readFileSync(join(vaultPath, 'CLAUDE.md'), 'utf8')
		expect(claudeMd).toContain('[[bruce-profile]]')
	})

	it('Test 5 (missing-subpath recreate): deleting memory/feedback/ → re-scaffold restores it', async () => {
		const {logger} = silentLogger()
		await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})

		// Nuke memory/feedback entirely.
		rmSync(join(vaultPath, 'memory/feedback'), {recursive: true, force: true})
		expect(existsSync(join(vaultPath, 'memory/feedback'))).toBe(false)

		// Re-scaffold should recreate it.
		await scaffoldVault({vaultPath, templatesDir: REAL_TEMPLATES_DIR, logger})
		expect(existsSync(join(vaultPath, 'memory/feedback/.gitkeep'))).toBe(true)
	})

	it('Test 6 (non-existent templates dir → failed-non-fatal): does NOT throw', async () => {
		const {logger, errors} = silentLogger()
		const result = await scaffoldVault({
			vaultPath,
			templatesDir: '/does/not/exist/anywhere',
			logger,
		})
		expect(result.status).toBe('failed-non-fatal')
		if (result.status === 'failed-non-fatal') {
			expect(result.reason).toContain('templates dir')
		}
		// Logger.error should have been called (non-fatal but logged).
		expect(errors.length).toBeGreaterThan(0)
	})
})
