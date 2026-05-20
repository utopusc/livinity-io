/**
 * Phase 174-04 — vault-items-router move() structured-cause vitest spec.
 *
 * Additive extension of the move() TRPCError shape — the existing message
 * 'move rejected: <reason>' string is preserved for backward compat (the
 * existing 14 assertions in vault-items-router.test.ts STILL PASS). This
 * file owns the NEW assertion surface: each rejection reason carries a
 * structured `cause: {kind, depth?}` payload so the SidebarTree UI (Plan
 * 174-04 Task 2) can render type-specific sonner toast copy without
 * parsing the message string.
 *
 * 4 runtime assertions (B-server-1 through B-server-4):
 *   - B-server-1: cycle rejection → cause.kind === 'cycle'
 *   - B-server-2: self rejection  → cause.kind === 'self'
 *   - B-server-3: depth-hard reject → cause.kind === 'depth-exceeds-hard-cap'
 *   - B-server-4: depth-soft warn passthrough → result.warn truthy + result.item present
 *
 * IMPORTANT — reason-string discovery: tree-resolver.ts ships with the
 * SACRED literal `'depth-exceeds-hard-cap'` (NOT 'depth-hard' as the
 * 174-04 plan optimistically named it). The cause.kind passes the reason
 * value through verbatim, so the test asserts against the actual string.
 * The plan body explicitly allows this adjustment when the executor
 * confirms the source-of-truth differs (174-04-PLAN.md Task 1 read_first).
 *
 * Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
 * + D-09 + Phase 162-01/02 + Phase 166/168/169 + Phase 171-01/02/03
 * + the 14 existing assertions in vault-items-router.test.ts all UNCHANGED.
 */

import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import vaultItemsRouter from './vault-items-router.js'
import {ItemStore} from '../../vault-items/index.js'

describe('vault-items-router move() — structured cause field (Phase 174-04)', () => {
	let vaultRoot: string
	let store: ItemStore
	let caller: ReturnType<typeof vaultItemsRouter.createCaller>

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), 'vault-items-cause-' + randomUUID())
		await fs.mkdir(vaultRoot, {recursive: true})
		store = new ItemStore({vaultRoot})
		caller = vaultItemsRouter.createCaller({
			dangerouslyBypassAuthentication: true,
			currentUser: {id: 'admin', username: 'admin', role: 'admin'},
			livinityd: {itemStore: store},
			logger: {log: () => {}, warn: () => {}, error: () => {}},
		} as any)
	})

	afterEach(async () => {
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	it('B-server-1: move ancestor under its own descendant → cause.kind === "cycle"', async () => {
		// Create A (root) → B (child of A). Then attempt to move A under B.
		// This is the classic ancestor-under-descendant cycle case, caught by
		// validateMove Rule 4a (upward walk from newParentId hits itemId).
		const a = await caller.create({type: 'project', name: 'A'})
		const b = await caller.create({type: 'project', name: 'B'})
		// Move B under A first (a legal move — A is a root, no cycle yet).
		await caller.move({id: b.item.id, newParentId: a.item.id})
		// Now attempt the cycle: move A under B.
		let captured: any = null
		try {
			await caller.move({id: a.item.id, newParentId: b.item.id})
		} catch (err) {
			captured = err
		}
		expect(captured).not.toBeNull()
		expect(captured.cause).toBeDefined()
		expect(captured.cause.kind).toBe('cycle')
		// And the legacy message stays for backward compat.
		expect(String(captured.message)).toMatch(/move rejected: cycle/)
	})

	it('B-server-2: move item under itself → cause.kind === "self"', async () => {
		const x = await caller.create({type: 'project', name: 'X'})
		let captured: any = null
		try {
			await caller.move({id: x.item.id, newParentId: x.item.id})
		} catch (err) {
			captured = err
		}
		expect(captured).not.toBeNull()
		expect(captured.cause).toBeDefined()
		expect(captured.cause.kind).toBe('self')
		// Legacy message preserved.
		expect(String(captured.message)).toMatch(/move rejected: self/)
	})

	it('B-server-3: hard-cap depth violation → cause.kind === "depth-exceeds-hard-cap"', async () => {
		// Build a chain of nested items so that placing one more under the
		// deepest exceeds DEPTH_HARD_CAP (= 8 per tree-resolver.ts:45).
		// Chain: root(0) → c1(1) → c2(2) → c3(3) → c4(4) → c5(5) → c6(6) → c7(7).
		// Then attempt to move a new leaf under c7 → parentDepth(c7)=7, +1 child
		// edge, +0 subtree = 8 → triggers hard-cap.
		const chain: string[] = []
		let parentId: string | null = null
		for (let i = 0; i < 8; i++) {
			const created = await caller.create({
				type: 'project',
				name: `c${i}`,
				...(parentId !== null ? {parentId} : {}),
			})
			chain.push(created.item.id)
			parentId = created.item.id
		}
		// Create a fresh root leaf and try to nest it under the deepest.
		const leaf = await caller.create({type: 'project', name: 'leaf'})
		const deepest = chain[chain.length - 1]
		let captured: any = null
		try {
			await caller.move({id: leaf.item.id, newParentId: deepest})
		} catch (err) {
			captured = err
		}
		expect(captured).not.toBeNull()
		expect(captured.cause).toBeDefined()
		expect(captured.cause.kind).toBe('depth-exceeds-hard-cap')
		// Legacy message preserved.
		expect(String(captured.message)).toMatch(/move rejected: depth-exceeds-hard-cap/)
	})

	it('B-server-4: soft-cap warn passthrough → result.warn truthy + result.item present', async () => {
		// Build chain root(0) → c1(1) → c2(2) → c3(3) → c4(4). Then attempt to
		// nest a fresh leaf under c4 → parentDepth(c4)=4, +1 edge = 5 → soft cap.
		// Soft cap returns ok:true + warn:'depth-exceeds-soft-cap' (tree-resolver
		// returns warn as a string literal — the router passes it through verbatim).
		const chain: string[] = []
		let parentId: string | null = null
		for (let i = 0; i < 5; i++) {
			const created = await caller.create({
				type: 'project',
				name: `c${i}`,
				...(parentId !== null ? {parentId} : {}),
			})
			chain.push(created.item.id)
			parentId = created.item.id
		}
		const leaf = await caller.create({type: 'project', name: 'leaf'})
		const deepest = chain[chain.length - 1]
		// This move should SUCCEED but flag a warn (soft-cap).
		const result = await caller.move({id: leaf.item.id, newParentId: deepest})
		expect(result.item).toBeDefined()
		expect(result.item.id).toBe(leaf.item.id)
		expect(result.item.parentId).toBe(deepest)
		// Warn passthrough — backward-compat with 174-02 consumer.
		expect(result.warn).toBeTruthy()
		expect(typeof result.warn).toBe('string')
	})
})
