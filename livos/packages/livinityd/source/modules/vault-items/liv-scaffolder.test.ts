// Phase 176-01 — liv-scaffolder.ts behavioral tests.
//
// 4 vitest assertions per the plan <behavior> block:
// T1: clean vault → creates settings/liv-rootagent.md
// T2: existing file → returns status:'exists', file content unchanged
// T3: existing file with user edit → re-run preserves the user-edited content
// T4: non-existent vaultRoot → returns {status:'failed-non-fatal'}, does NOT throw
//
// All tests use real fs on tmp directories (hermetic, no vi.mock needed).

import {describe, it, expect, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

import {ensureLivRootAgent} from './liv-scaffolder.js'

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
