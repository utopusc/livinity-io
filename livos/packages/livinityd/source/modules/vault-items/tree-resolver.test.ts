/**
 * Phase 171-03 — TreeResolver vitest spec (12 assertions).
 *
 * Coverage map (matches plan's <behavior> block 1:1):
 *   A1  — buildTree([]) returns {roots: [], orphans: []}
 *   A2  — buildTree of two root-level items returns 2 roots, 0 orphans
 *   A3  — buildTree nests child under parent and assigns depth=1
 *   A4  — buildTree puts items with a missing parentId target into orphans
 *   A5  — sibling sort: pinned-first then updatedAt desc
 *   A6  — depthOf(root) === 0
 *   A7  — depthOf(grandchild) === 2
 *   A8  — validateMove(X, X) → {ok: false, reason: 'self'}
 *   A9  — validateMove(parent, child) cycle → {ok: false, reason: 'cycle'}
 *   A10 — validateMove(X, 'no-such-id') → {ok: false, reason: 'not-found'}
 *   A11 — depth caps: depth 5 → soft warn; depth 8 → hard reject
 *   A12 — writeTreeCache + readback round-trip preserves shape
 *
 * Per-test isolated tmpdir under os.tmpdir() + randomUUID; cleanup in
 * afterEach. Mirrors cc-pty/session-store.test.ts and
 * vault-items/item-store.test.ts shape.
 *
 * Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
 * + D-09 luse-system-prompt.ts
 * + Phase 162-01 vault-scaffolder.ts
 * + Phase 162-02 agent-session.ts
 * + Phase 166 cc-pty backend
 * + Phase 168 cc-pty-router.ts
 * + Phase 169 vault-graph backend
 * + Phase 171-01 + 171-02 vault-items siblings
 * all UNCHANGED. This NEW file owns the v38 tree-resolver test concern only.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'

import {buildTree, validateMove, depthOf, writeTreeCache} from './tree-resolver.js'
import type {ProjectItem} from './types.js'

/**
 * Build a deterministic ProjectItem with overridable fields. Mirrors
 * vault-items/item-store.test.ts pattern (no constructor-side effects;
 * all timestamps default to 0 so sort tests can pin updatedAt explicitly).
 */
function makeItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
	return {
		id: overrides.id ?? randomUUID(),
		parentId: overrides.parentId ?? null,
		name: overrides.name ?? 'X',
		pinned: overrides.pinned ?? false,
		createdAt: overrides.createdAt ?? 0,
		updatedAt: overrides.updatedAt ?? 0,
		archivedAt: overrides.archivedAt ?? null,
		schemaVersion: 1,
		type: 'project',
		...(overrides.cwd === undefined ? {} : {cwd: overrides.cwd}),
	}
}

describe('tree-resolver', () => {
	let vaultRoot: string

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), `tree-${randomUUID()}`)
		await fs.mkdir(vaultRoot, {recursive: true})
	})

	afterEach(async () => {
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	it('A1: buildTree([]) returns {roots: [], orphans: []}', () => {
		const out = buildTree([])
		expect(out).toEqual({roots: [], orphans: []})
	})

	it('A2: buildTree([root1, root2]) returns 2 roots, 0 orphans', () => {
		const r1 = makeItem({name: 'r1'})
		const r2 = makeItem({name: 'r2'})
		const out = buildTree([r1, r2])
		expect(out.roots.length).toBe(2)
		expect(out.orphans.length).toBe(0)
		// Both roots are at depth 0
		expect(out.roots[0].depth).toBe(0)
		expect(out.roots[1].depth).toBe(0)
	})

	it('A3: buildTree nests child under parent and assigns depth=1', () => {
		const parent = makeItem({name: 'parent'})
		const child = makeItem({name: 'child', parentId: parent.id})
		const out = buildTree([parent, child])
		expect(out.roots.length).toBe(1)
		expect(out.orphans.length).toBe(0)
		expect(out.roots[0].item.id).toBe(parent.id)
		expect(out.roots[0].depth).toBe(0)
		expect(out.roots[0].children.length).toBe(1)
		expect(out.roots[0].children[0].item.id).toBe(child.id)
		expect(out.roots[0].children[0].depth).toBe(1)
	})

	it('A4: items with missing parent go into orphans bucket', () => {
		const parent = makeItem({name: 'parent'})
		const orphan = makeItem({name: 'orphan', parentId: 'ghost-id-that-does-not-exist'})
		const out = buildTree([parent, orphan])
		expect(out.roots.length).toBe(1)
		expect(out.roots[0].item.id).toBe(parent.id)
		expect(out.orphans.length).toBe(1)
		expect(out.orphans[0].item.id).toBe(orphan.id)
	})

	it('A5: sibling sort — pinned-first then updatedAt desc', () => {
		// Three roots: pinned(updatedAt 100), unpinned(200), unpinned(300).
		// Expected order: pinned first, then 300, then 200.
		const pinned = makeItem({name: 'pinned', pinned: true, updatedAt: 100})
		const older = makeItem({name: 'older', pinned: false, updatedAt: 200})
		const newest = makeItem({name: 'newest', pinned: false, updatedAt: 300})
		// Intentionally feed in mixed order to prove sort is by output rule,
		// not input order.
		const out = buildTree([older, pinned, newest])
		expect(out.roots.length).toBe(3)
		expect(out.roots[0].item.id).toBe(pinned.id) // pinned first
		expect(out.roots[1].item.id).toBe(newest.id) // newest unpinned
		expect(out.roots[2].item.id).toBe(older.id) // older unpinned
	})

	it('A6: depthOf(root) === 0', () => {
		const r = makeItem({name: 'r'})
		expect(depthOf([r], r.id)).toBe(0)
	})

	it('A7: depthOf(grandchild) === 2 for a 3-level chain', () => {
		const root = makeItem({name: 'root'})
		const child = makeItem({name: 'child', parentId: root.id})
		const grand = makeItem({name: 'grand', parentId: child.id})
		expect(depthOf([root, child, grand], grand.id)).toBe(2)
	})

	it("A8: validateMove(X, X) → {ok: false, reason: 'self'}", () => {
		const x = makeItem({name: 'x'})
		const result = validateMove([x], x.id, x.id)
		expect(result).toEqual({ok: false, reason: 'self'})
	})

	it("A9: validateMove(parent, child) returns cycle (ancestor under descendant)", () => {
		const parent = makeItem({name: 'parent'})
		const child = makeItem({name: 'child', parentId: parent.id})
		// Attempting to move `parent` under `child` would create a cycle:
		// parent's parentId points at child, but child's parentId already
		// points at parent → A→B→A.
		const result = validateMove([parent, child], parent.id, child.id)
		expect(result).toEqual({ok: false, reason: 'cycle'})
	})

	it("A10: validateMove(X, 'no-such-id') → {ok: false, reason: 'not-found'}", () => {
		const x = makeItem({name: 'x'})
		const result = validateMove([x], x.id, 'no-such-id')
		expect(result).toEqual({ok: false, reason: 'not-found'})
	})

	it('A11: depth caps — depth 5 returns soft warn, depth 8 returns hard reject', () => {
		// Build a linear chain: root(d0) → c1(d1) → c2(d2) → c3(d3) → c4(d4) → c5(d5) → c6(d6) → c7(d7).
		// 8 items, depths 0..7.
		const root = makeItem({name: 'root'})
		const c1 = makeItem({name: 'c1', parentId: root.id})
		const c2 = makeItem({name: 'c2', parentId: c1.id})
		const c3 = makeItem({name: 'c3', parentId: c2.id})
		const c4 = makeItem({name: 'c4', parentId: c3.id})
		const c5 = makeItem({name: 'c5', parentId: c4.id})
		const c6 = makeItem({name: 'c6', parentId: c5.id})
		const c7 = makeItem({name: 'c7', parentId: c6.id})
		const chain = [root, c1, c2, c3, c4, c5, c6, c7]

		// Soft-cap scenario: a fresh leaf moved under c4 would land at
		// depthOf(c4) + 1 + 0 = 4 + 1 + 0 = 5 → soft warn (>= 5, < 8).
		const freshLeaf = makeItem({name: 'fresh'})
		const softItems = [...chain, freshLeaf]
		const soft = validateMove(softItems, freshLeaf.id, c4.id)
		expect(soft.ok).toBe(true)
		if (soft.ok) {
			expect(soft.warn).toBe('depth-exceeds-soft-cap')
		}

		// Hard-cap scenario: a fresh leaf moved under c7 would land at
		// depthOf(c7) + 1 + 0 = 7 + 1 + 0 = 8 → hard reject (>= 8).
		const hardLeaf = makeItem({name: 'hard'})
		const hardItems = [...chain, hardLeaf]
		const hard = validateMove(hardItems, hardLeaf.id, c7.id)
		expect(hard).toEqual({ok: false, reason: 'depth-exceeds-hard-cap'})
	})

	it('A12: writeTreeCache round-trip preserves shape (schemaVersion, roots, orphans, generatedAt)', async () => {
		const parent = makeItem({name: 'p', updatedAt: 1000})
		const child = makeItem({name: 'c', parentId: parent.id, updatedAt: 2000})
		const orphan = makeItem({name: 'o', parentId: 'ghost', updatedAt: 3000})
		const items = [parent, child, orphan]

		await writeTreeCache(vaultRoot, items)
		const treeJsonPath = path.join(vaultRoot, 'tree.json')
		const raw = await fs.readFile(treeJsonPath, 'utf-8')
		const parsed = JSON.parse(raw) as {
			schemaVersion: number
			generatedAt: number
			roots: Array<{item: {id: string}; children: unknown[]; depth: number}>
			orphans: Array<{item: {id: string}; depth: number}>
		}

		expect(parsed.schemaVersion).toBe(1)
		expect(typeof parsed.generatedAt).toBe('number')
		expect(Number.isFinite(parsed.generatedAt)).toBe(true)
		expect(Array.isArray(parsed.roots)).toBe(true)
		expect(Array.isArray(parsed.orphans)).toBe(true)
		expect(parsed.roots.length).toBe(1)
		expect(parsed.roots[0].item.id).toBe(parent.id)
		expect(parsed.roots[0].children.length).toBe(1)
		expect(parsed.orphans.length).toBe(1)
		expect(parsed.orphans[0].item.id).toBe(orphan.id)

		// .tmp must not linger after rename
		const tmpPath = treeJsonPath + '.tmp'
		await expect(fs.access(tmpPath)).rejects.toBeTruthy()
	})
})
