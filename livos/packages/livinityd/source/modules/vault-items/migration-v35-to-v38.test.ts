/**
 * Phase 173-02 — migrateV35SessionsToV38() vitest spec.
 *
 * Coverage:
 *   1 — 3 sessions in → 3 ChatItems out (parentId=null, type='chat')
 *   2 — ccSessionId preserved
 *   3 — empty title → generated 'Session <ISO>'
 *   4 — custom title preserved verbatim
 *   5 — source file moved away from original path
 *   6 — backup at .backups/v35-cc-sessions.json with original envelope
 *   7 — idempotency: second run = no-op {migrated:0, skipped:true, reason:'already-migrated'}
 *   8 — no-source no-op: missing source → {migrated:0, skipped:true, reason:'no-source'}
 *
 * Per-test isolated tmpdir under os.tmpdir() + randomUUID; cleanup in
 * afterEach. Mirrors item-store.test.ts shape verbatim.
 *
 * Sacred SHA f3538e1d... + D-09 + Phase 162-01/02 + Phase 166 cc-pty
 * + Phase 168 cc-pty-router + Phase 169 vault-graph + Phase 171 vault-items
 * all UNCHANGED.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs, existsSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {ItemStore} from './item-store.js'
import {migrateV35SessionsToV38} from './migration-v35-to-v38.js'
import type {CcPtySession} from '../cc-pty/types.js'

describe('migrateV35SessionsToV38', () => {
	let vaultRoot: string
	let store: ItemStore
	let sourceFile: string
	let backupFile: string

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), `migration-v35-${randomUUID()}`)
		await fs.mkdir(path.join(vaultRoot, '.claude'), {recursive: true})
		store = new ItemStore({vaultRoot})
		sourceFile = path.join(vaultRoot, '.claude', 'livos-cc-sessions.json')
		backupFile = path.join(vaultRoot, '.backups', 'v35-cc-sessions.json')
	})

	afterEach(async () => {
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	function makeSession(overrides: Partial<CcPtySession> = {}): CcPtySession {
		const now = Date.now()
		return {
			id: randomUUID(),
			userId: 'admin',
			tmuxName: `livos-cc-admin-${randomUUID().slice(0, 8)}`,
			cwd: '/root/livinity-vault',
			createdAt: now,
			lastAttachedAt: now,
			lastMessageAt: now,
			...overrides,
		}
	}

	async function writeSource(sessions: CcPtySession[]): Promise<void> {
		const envelope = {schemaVersion: 1, sessions}
		await fs.writeFile(sourceFile, JSON.stringify(envelope, null, 2), 'utf-8')
	}

	// ── Assertion 1 ──
	it('Assertion 1: N sessions in → N ChatItems out at root level', async () => {
		const sessions = [makeSession(), makeSession(), makeSession()]
		await writeSource(sessions)
		const result = await migrateV35SessionsToV38({store, vaultRoot})
		expect(result.migrated).toBe(3)
		expect(result.skipped).toBe(false)
		const items = await store.list({parentId: null})
		expect(items).toHaveLength(3)
		for (const it of items) {
			expect(it.type).toBe('chat')
			expect(it.parentId).toBeNull()
		}
	})

	// ── Assertion 2 ──
	it('Assertion 2: ccSessionId preserved on every migrated ChatItem', async () => {
		const sessions = [
			makeSession({ccSessionId: 'cc-aaaa-1111'}),
			makeSession({ccSessionId: 'cc-bbbb-2222'}),
		]
		await writeSource(sessions)
		await migrateV35SessionsToV38({store, vaultRoot})
		const items = await store.list({parentId: null})
		const ccIds = items
			.filter((i) => i.type === 'chat')
			.map((i) => (i as {ccSessionId?: string}).ccSessionId)
			.sort()
		expect(ccIds).toEqual(['cc-aaaa-1111', 'cc-bbbb-2222'])
	})

	// ── Assertion 3 ──
	it('Assertion 3: empty/missing title → generated `Session <ISO>` name', async () => {
		const ts = Date.UTC(2026, 4, 20, 12, 0, 0) // 2026-05-20T12:00:00.000Z
		await writeSource([makeSession({title: undefined, createdAt: ts})])
		await migrateV35SessionsToV38({store, vaultRoot})
		const [item] = await store.list({parentId: null})
		expect(item.name).toMatch(/^Session 2026-05-20T/)
	})

	// ── Assertion 4 ──
	it('Assertion 4: custom non-empty title preserved verbatim', async () => {
		await writeSource([makeSession({title: 'My Custom Session Title'})])
		await migrateV35SessionsToV38({store, vaultRoot})
		const [item] = await store.list({parentId: null})
		expect(item.name).toBe('My Custom Session Title')
	})

	// ── Assertion 5 ──
	it('Assertion 5: source file moved away from original path', async () => {
		await writeSource([makeSession(), makeSession()])
		expect(existsSync(sourceFile)).toBe(true)
		await migrateV35SessionsToV38({store, vaultRoot})
		expect(existsSync(sourceFile)).toBe(false)
	})

	// ── Assertion 6 ──
	it('Assertion 6: backup at .backups/v35-cc-sessions.json contains original envelope', async () => {
		const sessions = [makeSession(), makeSession()]
		await writeSource(sessions)
		await migrateV35SessionsToV38({store, vaultRoot})
		expect(existsSync(backupFile)).toBe(true)
		const raw = await fs.readFile(backupFile, 'utf-8')
		const parsed = JSON.parse(raw) as {schemaVersion: number; sessions: CcPtySession[]}
		expect(parsed.schemaVersion).toBe(1)
		expect(parsed.sessions).toHaveLength(2)
	})

	// ── Assertion 7 ──
	it('Assertion 7: idempotency — second run = no-op', async () => {
		await writeSource([makeSession(), makeSession()])
		const first = await migrateV35SessionsToV38({store, vaultRoot})
		expect(first.migrated).toBe(2)
		const itemsAfterFirst = await store.list({parentId: null})
		const second = await migrateV35SessionsToV38({store, vaultRoot})
		expect(second.migrated).toBe(0)
		expect(second.skipped).toBe(true)
		expect(second.reason).toBe('already-migrated')
		const itemsAfterSecond = await store.list({parentId: null})
		expect(itemsAfterSecond).toHaveLength(itemsAfterFirst.length)
	})

	// ── Assertion 8 ──
	it('Assertion 8: no-source no-op when source file absent', async () => {
		// sourceFile never written
		const result = await migrateV35SessionsToV38({store, vaultRoot})
		expect(result.migrated).toBe(0)
		expect(result.skipped).toBe(true)
		expect(result.reason).toBe('no-source')
	})
})
