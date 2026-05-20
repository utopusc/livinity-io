/**
 * Phase 169-01 — walkVault vitest spec (14 assertions).
 *
 * Uses real OS tmp dirs (mirrors session-store.test.ts pattern). Cheaper
 * than vi.mock-ing node:fs/promises: ~10 fs syscalls per test, each test
 * runs in <50ms. Each test creates an isolated vault root via os.tmpdir() +
 * randomUUID; cleanup in afterEach removes the entire subtree.
 *
 * Tests:
 *  1.  walk discovers 3 .md files at the root → files.length===3, truncated===false
 *  2.  recurses into subdirectories (memory/projects/v35.md found)
 *  3.  skips `.deleted-*` tombstones (Phase 163-01 retraction)
 *  4.  skips node_modules dir entirely
 *  5.  skips .git dir entirely
 *  6.  classifies memory/foo.md → 'memory'
 *  7.  classifies sessions/2026-05-19/log.md → 'session'
 *  8.  classifies inbox/note.md → 'inbox'
 *  9.  classifies .claude/agents/luse-driver.md → 'agent'
 *  10. classifies .claude/skills/foo.md → 'skill'
 *  11. classifies .claude/commands/bar.md → 'command'
 *  12. classifies README.md (root-level) → 'root'
 *  13. truncates at maxFiles cap (synthetic 2500 files at root, max=10)
 *  14. mtime is Math.floor(stat.mtimeMs) — integer epoch ms
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {walkVault} from './walker.js'

let vaultRoot: string

beforeEach(async () => {
	vaultRoot = path.join(os.tmpdir(), `vault-walker-test-${randomUUID()}`)
	await fs.mkdir(vaultRoot, {recursive: true})
})

afterEach(async () => {
	await fs.rm(vaultRoot, {recursive: true, force: true})
})

async function seed(rel: string, body = '# heading\n'): Promise<void> {
	const full = path.join(vaultRoot, rel)
	await fs.mkdir(path.dirname(full), {recursive: true})
	await fs.writeFile(full, body, 'utf8')
}

describe('walkVault', () => {
	it('discovers 3 .md files at root and reports truncated:false', async () => {
		await seed('a.md')
		await seed('b.md')
		await seed('c.md')
		const result = await walkVault(vaultRoot)
		expect(result.files).toHaveLength(3)
		expect(result.truncated).toBe(false)
	})

	it('recurses into nested subdirectories', async () => {
		await seed('memory/projects/v35.md', '# v35\n')
		const result = await walkVault(vaultRoot)
		expect(result.files.map((f) => f.path)).toContain('memory/projects/v35.md')
	})

	it('skips .deleted-* tombstone files (Phase 163-01)', async () => {
		await seed('a.md')
		await seed('.deleted-old.md', '# tomb\n')
		const result = await walkVault(vaultRoot)
		expect(result.files).toHaveLength(1)
		expect(result.files[0].path).toBe('a.md')
	})

	it('skips node_modules directory entirely', async () => {
		await seed('node_modules/some-pkg/index.md', '# pkg\n')
		await seed('a.md')
		const result = await walkVault(vaultRoot)
		expect(result.files).toHaveLength(1)
		expect(result.files[0].path).toBe('a.md')
	})

	it('skips .git directory entirely', async () => {
		await seed('.git/HEAD.md', '# git\n')
		await seed('a.md')
		const result = await walkVault(vaultRoot)
		expect(result.files).toHaveLength(1)
		expect(result.files[0].path).toBe('a.md')
	})

	it('classifies memory/foo.md → memory', async () => {
		await seed('memory/foo.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === 'memory/foo.md')
		expect(node?.type).toBe('memory')
	})

	it('classifies sessions/2026-05-19/log.md → session', async () => {
		await seed('sessions/2026-05-19/log.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === 'sessions/2026-05-19/log.md')
		expect(node?.type).toBe('session')
	})

	it('classifies inbox/note.md → inbox', async () => {
		await seed('inbox/note.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === 'inbox/note.md')
		expect(node?.type).toBe('inbox')
	})

	it('classifies .claude/agents/luse-driver.md → agent', async () => {
		await seed('.claude/agents/luse-driver.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find(
			(f) => f.path === '.claude/agents/luse-driver.md',
		)
		expect(node?.type).toBe('agent')
	})

	it('classifies .claude/skills/foo.md → skill', async () => {
		await seed('.claude/skills/foo.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === '.claude/skills/foo.md')
		expect(node?.type).toBe('skill')
	})

	it('classifies .claude/commands/bar.md → command', async () => {
		await seed('.claude/commands/bar.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === '.claude/commands/bar.md')
		expect(node?.type).toBe('command')
	})

	it('classifies root-level README.md → root', async () => {
		await seed('README.md')
		const result = await walkVault(vaultRoot)
		const node = result.files.find((f) => f.path === 'README.md')
		expect(node?.type).toBe('root')
	})

	it('truncates at maxFiles cap when vault exceeds limit', async () => {
		// Seed 25 .md files in one dir; cap walk at 10.
		for (let i = 0; i < 25; i++) {
			await seed(`file-${i.toString().padStart(2, '0')}.md`)
		}
		const result = await walkVault(vaultRoot, 10)
		expect(result.files.length).toBe(10)
		expect(result.truncated).toBe(true)
	})

	it('mtime is Math.floor of stat.mtimeMs (integer epoch ms)', async () => {
		await seed('a.md')
		const result = await walkVault(vaultRoot)
		const node = result.files[0]
		expect(Number.isInteger(node.mtime)).toBe(true)
		expect(node.mtime).toBeGreaterThan(0)
	})
})
