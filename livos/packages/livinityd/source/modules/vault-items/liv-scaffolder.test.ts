// Phase 176-01 — liv-scaffolder.ts behavioral tests.
//
// 4 vitest assertions per the plan <behavior> block:
// T1: clean vault → creates settings/liv-rootagent.md
// T2: existing file → returns status:'exists', file content unchanged
// T3: existing file with user edit → re-run preserves the user-edited content
// T4: non-existent vaultRoot → returns {status:'failed-non-fatal'}, does NOT throw
//
// Phase 176-03 — ensureLivSkills() tests (T5-T8):
// T5: clean vault → ensureLivSkills creates .claude/agents/ + copies all 4 skill files
// T6: existing agents dir with all 4 files → returns skipped=[4 files], created=[]
// T7: partial state (2 of 4 files present) → copies missing 2, skips existing 2
// T8: invalid vaultRoot (file not dir) → returns status:failed-non-fatal, does NOT throw
//
// All tests use real fs on tmp directories (hermetic, no vi.mock needed).

import {describe, it, expect, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

import {ensureLivRootAgent, ensureLivSkills} from './liv-scaffolder.js'

function tmpDir(): string {
	return path.join(os.tmpdir(), `liv-scaffolder-test-${crypto.randomUUID()}`)
}

const created: string[] = []

afterEach(async () => {
	// Clean up tmp dirs created during tests.
	for (const dir of created.splice(0)) {
		await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
	}
})

describe('liv-scaffolder — Phase 176-01', () => {
	it('T1: clean vault → creates settings/liv-rootagent.md', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		await fs.mkdir(vaultRoot, {recursive: true})

		const result = await ensureLivRootAgent({vaultRoot})

		expect(result.status).toBe('created')

		const dest = path.join(vaultRoot, 'settings', 'liv-rootagent.md')
		const content = await fs.readFile(dest, 'utf8')
		expect(content).toContain('---')
		expect(content).toContain('name: liv')
	})

	it('T2: existing file → returns status:exists, file content unchanged (idempotent)', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		const settingsDir = path.join(vaultRoot, 'settings')
		await fs.mkdir(settingsDir, {recursive: true})

		const dest = path.join(settingsDir, 'liv-rootagent.md')
		const existingContent = '# custom content by user'
		await fs.writeFile(dest, existingContent, 'utf8')

		const result = await ensureLivRootAgent({vaultRoot})

		expect(result.status).toBe('exists')
		// File content must be unchanged.
		const afterContent = await fs.readFile(dest, 'utf8')
		expect(afterContent).toBe(existingContent)
	})

	it('T3: existing file with user edit → re-run preserves the user-edited content byte-for-byte', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		const settingsDir = path.join(vaultRoot, 'settings')
		await fs.mkdir(settingsDir, {recursive: true})

		const dest = path.join(settingsDir, 'liv-rootagent.md')
		const userEdit = '---\nname: liv\ncustom: my-edit\n---\nUser customized body.\n'
		await fs.writeFile(dest, userEdit, 'utf8')

		await ensureLivRootAgent({vaultRoot})

		const afterContent = await fs.readFile(dest, 'utf8')
		expect(afterContent).toBe(userEdit)
	})

	it('T4: invalid vaultRoot (a file, not a dir) → returns status:failed-non-fatal, does NOT throw', async () => {
		// Create a PLAIN FILE and use it as vaultRoot — mkdir will fail with ENOTDIR/EEXIST.
		const fileAsRoot = path.join(os.tmpdir(), 'liv-scaffolder-notdir-' + crypto.randomUUID())
		created.push(fileAsRoot)
		await fs.writeFile(fileAsRoot, 'not a directory', 'utf8')

		// Must NOT throw.
		let result: Awaited<ReturnType<typeof ensureLivRootAgent>> | null = null
		let threw = false
		try {
			result = await ensureLivRootAgent({
				vaultRoot: fileAsRoot,
				// Suppress log output during test.
				logger: {
					log: () => {},
					error: () => {},
				},
			})
		} catch {
			threw = true
		}

		expect(threw).toBe(false)
		expect(result).not.toBeNull()
		expect(result!.status).toBe('failed-non-fatal')
	})
})

describe('liv-scaffolder — ensureLivSkills — Phase 176-03', () => {
	const SKILL_NAMES = ['luse-driver.md', 'livos-operator.md', 'appstore.md', 'window-manager.md']

	it('T5: clean vault → ensureLivSkills creates .claude/agents/ dir + copies all 4 skill files', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		await fs.mkdir(vaultRoot, {recursive: true})

		const result = await ensureLivSkills({vaultRoot})

		expect(result.status).toBe('created')
		expect(result.created).toHaveLength(4)
		expect(result.skipped).toHaveLength(0)

		// Verify all 4 files exist at expected location.
		const agentsDir = path.join(vaultRoot, '.claude', 'agents')
		for (const name of SKILL_NAMES) {
			const dest = path.join(agentsDir, name)
			const exists = await fs.access(dest).then(() => true).catch(() => false)
			expect(exists).toBe(true)
		}
	})

	it('T6: existing agents dir with all 4 files → returns skipped=[4 files], created=[]', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		const agentsDir = path.join(vaultRoot, '.claude', 'agents')
		await fs.mkdir(agentsDir, {recursive: true})

		// Pre-populate all 4 files with custom content.
		for (const name of SKILL_NAMES) {
			await fs.writeFile(path.join(agentsDir, name), `# custom ${name}`, 'utf8')
		}

		const result = await ensureLivSkills({vaultRoot})

		expect(result.status).toBe('exists')
		expect(result.created).toHaveLength(0)
		expect(result.skipped).toHaveLength(4)

		// Verify user content is preserved.
		for (const name of SKILL_NAMES) {
			const content = await fs.readFile(path.join(agentsDir, name), 'utf8')
			expect(content).toBe(`# custom ${name}`)
		}
	})

	it('T7: partial state (2 of 4 files present) → copies missing 2, skips existing 2', async () => {
		const vaultRoot = tmpDir()
		created.push(vaultRoot)
		const agentsDir = path.join(vaultRoot, '.claude', 'agents')
		await fs.mkdir(agentsDir, {recursive: true})

		// Pre-populate only first 2 files.
		const existingFiles = SKILL_NAMES.slice(0, 2)
		const missingFiles = SKILL_NAMES.slice(2)
		for (const name of existingFiles) {
			await fs.writeFile(path.join(agentsDir, name), `# existing ${name}`, 'utf8')
		}

		const result = await ensureLivSkills({vaultRoot})

		expect(result.status).toBe('partial')
		expect(result.created).toHaveLength(2)
		expect(result.skipped).toHaveLength(2)

		// Existing files preserved.
		for (const name of existingFiles) {
			const content = await fs.readFile(path.join(agentsDir, name), 'utf8')
			expect(content).toBe(`# existing ${name}`)
		}
		// Missing files now exist.
		for (const name of missingFiles) {
			const exists = await fs.access(path.join(agentsDir, name)).then(() => true).catch(() => false)
			expect(exists).toBe(true)
		}
	})

	it('T8: invalid vaultRoot (file not dir) → returns status:failed-non-fatal, does NOT throw', async () => {
		const fileAsRoot = path.join(os.tmpdir(), 'liv-scaffolder-skills-notdir-' + crypto.randomUUID())
		created.push(fileAsRoot)
		await fs.writeFile(fileAsRoot, 'not a directory', 'utf8')

		let result: Awaited<ReturnType<typeof ensureLivSkills>> | null = null
		let threw = false
		try {
			result = await ensureLivSkills({
				vaultRoot: fileAsRoot,
				logger: {log: () => {}, error: () => {}},
			})
		} catch {
			threw = true
		}

		expect(threw).toBe(false)
		expect(result).not.toBeNull()
		expect(result!.status).toBe('failed-non-fatal')
	})
})
