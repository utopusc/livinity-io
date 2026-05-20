/**
 * Phase 166-02 — SessionStore vitest spec.
 *
 * 12 assertions covering CRUD + atomic write + schemaVersion guard +
 * single-writer mutex + .claude/ dir auto-create. Per-test isolated
 * temp vault dir via os.tmpdir() + randomUUID; cleaned up in afterEach.
 *
 * Mirrors convention from claude-runner/idle-reaper.test.ts.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import {existsSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {SessionStore} from './session-store.js'
import type {CcPtySession} from './types.js'

function makeSession(overrides: Partial<CcPtySession> = {}): CcPtySession {
	const id = overrides.id ?? randomUUID()
	const userId = overrides.userId ?? 'admin'
	return {
		id,
		userId,
		tmuxName: `livos-cc-${userId}-${id.slice(0, 8)}`,
		cwd: '/home/bruce/livinity-vault',
		createdAt: Date.now(),
		lastAttachedAt: 0,
		lastMessageAt: 0,
		...overrides,
	}
}

describe('SessionStore', () => {
	let vaultPath: string
	let storePath: string
	let store: SessionStore

	beforeEach(async () => {
		vaultPath = path.join(os.tmpdir(), `cc-pty-store-${randomUUID()}`)
		await fs.mkdir(vaultPath, {recursive: true})
		storePath = path.join(vaultPath, '.claude', 'livos-cc-sessions.json')
		store = new SessionStore({vaultPath})
	})

	afterEach(async () => {
		await fs.rm(vaultPath, {recursive: true, force: true}).catch(() => {})
	})

	it('Assertion 1: load() on missing file returns [] (ENOENT swallowed)', async () => {
		const out = await store.load()
		expect(out).toEqual([])
	})

	it('Assertion 2: add(session) then load() returns array with exactly 1 entry whose id matches', async () => {
		const s = makeSession()
		await store.add(s)
		const out = await store.load()
		expect(out.length).toBe(1)
		expect(out[0].id).toBe(s.id)
	})

	it('Assertion 3: getByUser filters correctly across multiple users', async () => {
		const s1 = makeSession({userId: 'admin'})
		const s2 = makeSession({userId: 'admin'})
		const s3 = makeSession({userId: 'other'})
		await store.add(s1)
		await store.add(s2)
		await store.add(s3)
		const adminSessions = await store.getByUser('admin')
		expect(adminSessions.length).toBe(2)
		const otherSessions = await store.getByUser('other')
		expect(otherSessions.length).toBe(1)
	})

	it('Assertion 4: getById returns row for known id, null for unknown', async () => {
		const s = makeSession()
		await store.add(s)
		const got = await store.getById(s.id)
		expect(got?.id).toBe(s.id)
		const miss = await store.getById('nonexistent')
		expect(miss).toBeNull()
	})

	it('Assertion 5: update(id, patch) preserves other fields and only mutates patched keys', async () => {
		const s = makeSession({title: 'original-title', model: 'claude-opus-4-7'})
		await store.add(s)
		await store.update(s.id, {lastAttachedAt: 12345})
		const after = await store.getById(s.id)
		expect(after?.lastAttachedAt).toBe(12345)
		expect(after?.title).toBe('original-title')
		expect(after?.model).toBe('claude-opus-4-7')
		expect(after?.id).toBe(s.id)
		expect(after?.tmuxName).toBe(s.tmuxName)
	})

	it('Assertion 6: update on nonexistent id is a no-op (does not throw)', async () => {
		await expect(store.update('nonexistent', {lastAttachedAt: 999})).resolves.toBeUndefined()
		const all = await store.load()
		expect(all.length).toBe(0)
	})

	it('Assertion 7: remove(id) drops exactly one entry', async () => {
		const s = makeSession()
		await store.add(s)
		await store.remove(s.id)
		const after = await store.load()
		expect(after.length).toBe(0)
	})

	it('Assertion 8: atomic write — .tmp does not exist after save() resolves', async () => {
		const s = makeSession()
		await store.save([s])
		expect(existsSync(storePath)).toBe(true)
		expect(existsSync(storePath + '.tmp')).toBe(false)
	})

	it('Assertion 9: schemaVersion guard rejects mismatch (load() throws with "unsupported schemaVersion")', async () => {
		await fs.mkdir(path.dirname(storePath), {recursive: true})
		await fs.writeFile(storePath, JSON.stringify({schemaVersion: 99, sessions: []}), 'utf-8')
		await expect(store.load()).rejects.toThrow(/unsupported schemaVersion/)
	})

	it('Assertion 10: concurrent-read safety — 10 parallel getByUser calls all return identical-length arrays', async () => {
		const s1 = makeSession({userId: 'admin'})
		const s2 = makeSession({userId: 'admin'})
		await store.add(s1)
		await store.add(s2)
		const reads = await Promise.all(
			Array.from({length: 10}, () => store.getByUser('admin')),
		)
		expect(reads.length).toBe(10)
		for (const r of reads) expect(r.length).toBe(2)
	})

	it('Assertion 11: single-writer serialization — 5 parallel add() calls preserve all 5 entries', async () => {
		const sessions = Array.from({length: 5}, () => makeSession())
		await Promise.all(sessions.map((s) => store.add(s)))
		const after = await store.load()
		expect(after.length).toBe(5)
		// Verify all ids present (no lost writes)
		const afterIds = new Set(after.map((s) => s.id))
		for (const s of sessions) expect(afterIds.has(s.id)).toBe(true)
	})

	it('Assertion 12: .claude/ directory auto-creation when vault exists but .claude does not', async () => {
		// vaultPath exists from beforeEach but .claude/ subdir does NOT.
		expect(existsSync(path.join(vaultPath, '.claude'))).toBe(false)
		await store.save([])
		expect(existsSync(path.join(vaultPath, '.claude'))).toBe(true)
		expect(existsSync(storePath)).toBe(true)
	})
})
