/**
 * Phase 171-02 — ItemStore vitest spec (16 assertions).
 *
 * Coverage map (matches plan's <behavior> block 1:1):
 *   1  — construction is filesystem-quiet
 *   2  — create() returns a well-formed Item
 *   3  — project scaffolding writes exactly 5 files
 *   4  — agent scaffolding writes exactly 6 files
 *   5  — chat scaffolding writes exactly 5 files
 *   6  — read(unknownId) returns null (no throw)
 *   7  — read(createdId) round-trips create()
 *   8  — update bumps updatedAt monotonically
 *   9  — update preserves sibling fields
 *   10 — archive sets archivedAt, folder stays on disk
 *   11 — delete removes folder; second delete returns false
 *   12 — list() returns all types
 *   13 — list({archived: false}) hides archived
 *   14 — list({parentId}) filters by parent
 *   15 — atomic write: forced fs.rename throw leaves no partial item.json
 *   16 — write queue: 10 concurrent updates produce valid JSON
 *
 * Per-test isolated tmpdir under os.tmpdir() + randomUUID; cleanup in
 * afterEach. Mirrors cc-pty/session-store.test.ts shape.
 *
 * Sacred SHA f3538e1d... + D-09 + Phase 162-01/02 + Phase 166 cc-pty
 * + Phase 168 cc-pty-router + Phase 169 vault-graph all UNCHANGED.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {promises as fs, existsSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {ItemStore} from './item-store.js'

describe('ItemStore', () => {
	let vaultRoot: string
	let store: ItemStore

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), `vault-items-${randomUUID()}`)
		await fs.mkdir(vaultRoot, {recursive: true})
		store = new ItemStore({vaultRoot})
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	it('Assertion 1: constructor does not touch the filesystem before first op', async () => {
		const dir = path.join(os.tmpdir(), `vault-items-pristine-${randomUUID()}`)
		// vaultRoot ABSENT — never created
		const s = new ItemStore({vaultRoot: dir})
		expect(existsSync(dir)).toBe(false)
		// helper method itemDir() is also non-side-effecting
		expect(s.itemDir('abc123')).toBe(path.join(dir, 'items', 'abc123'))
		expect(existsSync(dir)).toBe(false)
	})

	it('Assertion 2: create() returns a well-formed Item with defaults', async () => {
		const before = Date.now()
		const item = await store.create({type: 'project', name: 'X'})
		const after = Date.now()
		expect(item.type).toBe('project')
		expect(typeof item.id).toBe('string')
		expect(item.id.length).toBeGreaterThan(8)
		expect(item.pinned).toBe(false)
		expect(item.archivedAt).toBeNull()
		expect(item.schemaVersion).toBe(1)
		expect(item.createdAt).toBeGreaterThanOrEqual(before)
		expect(item.createdAt).toBeLessThanOrEqual(after)
		expect(item.updatedAt).toBe(item.createdAt)
		expect(item.parentId).toBeNull()
	})

	it('Assertion 3: project create writes exactly {item, README, CLAUDE, settings, tasks} (5 files)', async () => {
		const item = await store.create({type: 'project', name: 'P', cwd: '/tmp/repo'})
		const files = await fs.readdir(store.itemDir(item.id))
		expect(new Set(files)).toEqual(
			new Set(['item.json', 'README.md', 'CLAUDE.md', 'settings.json', 'tasks.json']),
		)
		// Sanity: no agent.md, no tools.json, no transcript.json
		expect(files).not.toContain('agent.md')
		expect(files).not.toContain('tools.json')
		expect(files).not.toContain('transcript.json')
	})

	it('Assertion 4: agent create writes exactly {item, README, CLAUDE, settings, agent, tools} (6 files)', async () => {
		const item = await store.create({type: 'agent', name: 'A', schedule: '0 3 * * *'})
		const files = await fs.readdir(store.itemDir(item.id))
		expect(new Set(files)).toEqual(
			new Set([
				'item.json',
				'README.md',
				'CLAUDE.md',
				'settings.json',
				'agent.md',
				'tools.json',
			]),
		)
		expect(files).not.toContain('tasks.json')
		expect(files).not.toContain('transcript.json')
		// agent.md contains a YAML frontmatter naming the agent
		const agentMd = await fs.readFile(path.join(store.itemDir(item.id), 'agent.md'), 'utf-8')
		expect(agentMd).toContain('name: A')
		expect(agentMd).toContain('# Agent system prompt')
	})

	it('Assertion 5: chat create writes exactly {item, README, CLAUDE, settings, transcript} (5 files)', async () => {
		const item = await store.create({type: 'chat', name: 'C', ccSessionId: 'sess-1'})
		const files = await fs.readdir(store.itemDir(item.id))
		expect(new Set(files)).toEqual(
			new Set(['item.json', 'README.md', 'CLAUDE.md', 'settings.json', 'transcript.json']),
		)
		expect(files).not.toContain('tasks.json')
		expect(files).not.toContain('agent.md')
		// transcript.json is the canonical {messages: []} envelope
		const transcript = JSON.parse(
			await fs.readFile(path.join(store.itemDir(item.id), 'transcript.json'), 'utf-8'),
		)
		expect(transcript).toEqual({messages: []})
	})

	it('Assertion 6: read(unknownId) returns null, not a throw', async () => {
		// Use a syntactically valid but non-existent id — read() must NOT throw.
		const got = await store.read('017f00000000000000000000deadbeef')
		expect(got).toBeNull()
	})

	it('Assertion 7: read(createdId) round-trips create()', async () => {
		const created = await store.create({type: 'project', name: 'roundtrip', cwd: '/tmp/r'})
		const got = await store.read(created.id)
		expect(got).not.toBeNull()
		expect(got).toEqual(created)
	})

	it('Assertion 8: update bumps updatedAt monotonically (createdAt untouched)', async () => {
		const original = await store.create({type: 'project', name: 'orig'})
		// Sleep 5ms to guarantee clock advance — some platforms have low-res ms.
		await new Promise((r) => setTimeout(r, 5))
		const updated = await store.update(original.id, {name: 'updated'})
		expect(updated.name).toBe('updated')
		expect(updated.updatedAt).toBeGreaterThan(original.updatedAt)
		expect(updated.createdAt).toBe(original.createdAt)
	})

	it('Assertion 9: update preserves sibling fields (id, type, parentId, pinned, schemaVersion, type-extras)', async () => {
		const created = await store.create({
			type: 'project',
			name: 'orig',
			parentId: 'parent-abc',
			cwd: '/tmp/wd',
		})
		const updated = await store.update(created.id, {name: 'renamed'})
		expect(updated.id).toBe(created.id)
		expect(updated.type).toBe('project')
		expect(updated.parentId).toBe('parent-abc')
		expect(updated.pinned).toBe(false)
		expect(updated.archivedAt).toBeNull()
		expect(updated.schemaVersion).toBe(1)
		expect(updated.createdAt).toBe(created.createdAt)
		expect((updated as {cwd?: string}).cwd).toBe('/tmp/wd')
	})

	it('Assertion 10: archive sets archivedAt; folder stays on disk', async () => {
		const created = await store.create({type: 'agent', name: 'arch'})
		expect(existsSync(store.itemDir(created.id))).toBe(true)
		const archived = await store.archive(created.id)
		expect(archived.archivedAt).not.toBeNull()
		expect(typeof archived.archivedAt).toBe('number')
		// folder + all scaffolding files still present
		expect(existsSync(store.itemDir(created.id))).toBe(true)
		expect(existsSync(path.join(store.itemDir(created.id), 'item.json'))).toBe(true)
		expect(existsSync(path.join(store.itemDir(created.id), 'agent.md'))).toBe(true)
	})

	it('Assertion 11: delete removes folder recursively; second delete returns false', async () => {
		const created = await store.create({type: 'chat', name: 'goner'})
		const dir = store.itemDir(created.id)
		expect(existsSync(dir)).toBe(true)
		const firstResult = await store.delete(created.id)
		expect(firstResult).toBe(true)
		expect(existsSync(dir)).toBe(false)
		const secondResult = await store.delete(created.id)
		expect(secondResult).toBe(false)
	})

	it('Assertion 12: list() returns all three types when 3 items of distinct types exist', async () => {
		await store.create({type: 'project', name: 'P'})
		await store.create({type: 'agent', name: 'A'})
		await store.create({type: 'chat', name: 'C'})
		const all = await store.list()
		expect(all.length).toBe(3)
		const types = new Set(all.map((i) => i.type))
		expect(types).toEqual(new Set(['project', 'agent', 'chat']))
	})

	it('Assertion 13: list({archived: false}) hides archived items', async () => {
		const p = await store.create({type: 'project', name: 'P'})
		await store.create({type: 'agent', name: 'A'})
		await store.create({type: 'chat', name: 'C'})
		await store.archive(p.id)
		const visible = await store.list({archived: false})
		expect(visible.length).toBe(2)
		expect(visible.every((i) => i.archivedAt === null)).toBe(true)
		// Default (no opts) still returns all 3
		const everyone = await store.list()
		expect(everyone.length).toBe(3)
	})

	it('Assertion 14: list({parentId}) filters to that parent only', async () => {
		const a = await store.create({type: 'project', name: 'rootA', parentId: 'root-a'})
		await store.create({type: 'agent', name: 'inA', parentId: 'root-a'})
		await store.create({type: 'chat', name: 'inB', parentId: 'root-b'})
		await store.create({type: 'project', name: 'rootless'}) // parentId null
		const inA = await store.list({parentId: 'root-a'})
		expect(inA.length).toBe(2)
		expect(inA.every((i) => i.parentId === 'root-a')).toBe(true)
		const rootLevel = await store.list({parentId: null})
		expect(rootLevel.length).toBe(1)
		expect(rootLevel[0].parentId).toBeNull()
		// Touch `a` so the lint thinks it's used.
		expect(a.parentId).toBe('root-a')
	})

	it('Assertion 15: atomic write — fs.rename throw leaves no partial item.json', async () => {
		// Spy on fs.promises.rename — mockImplementationOnce so only the FIRST
		// rename in this test (the item.json write inside create()) throws.
		const renameSpy = vi.spyOn(fs, 'rename').mockImplementationOnce(async () => {
			throw new Error('disk full')
		})
		await expect(store.create({type: 'project', name: 'doomed'})).rejects.toThrow('disk full')
		renameSpy.mockRestore()

		// items/ may be empty OR contain an <id>/ dir with no item.json. Either
		// way: no finalized item.json should be observable, and no Item should
		// round-trip via list().
		const itemsDir = path.join(vaultRoot, 'items')
		const entries = existsSync(itemsDir) ? await fs.readdir(itemsDir) : []
		for (const entry of entries) {
			const itemJson = path.join(itemsDir, entry, 'item.json')
			// item.json must NOT exist (we tolerate an orphan .tmp or empty dir)
			expect(existsSync(itemJson)).toBe(false)
		}
		// list() also reflects the failure — no Items recoverable
		const all = await store.list()
		expect(all.length).toBe(0)
	})

	it('Assertion 16: write queue serializes 10 concurrent updates; final JSON parses cleanly', async () => {
		const seed = await store.create({type: 'project', name: 'seed'})
		const writes = Array.from({length: 10}, (_, i) => store.update(seed.id, {name: `N${i}`}))
		await Promise.all(writes)
		const final = await store.read(seed.id)
		expect(final).not.toBeNull()
		const allowed = new Set(Array.from({length: 10}, (_, i) => `N${i}`))
		expect(allowed.has(final!.name)).toBe(true)
		// Verify item.json is valid JSON (no torn write)
		const raw = await fs.readFile(path.join(store.itemDir(seed.id), 'item.json'), 'utf-8')
		expect(() => JSON.parse(raw)).not.toThrow()
		const parsed = JSON.parse(raw)
		expect(parsed.id).toBe(seed.id)
		expect(parsed.schemaVersion).toBe(1)
	})
})
