// Phase 174-02 — tree-shape pure transformer tests.
//
// Plan 174-02 Task 1 — 8 vitest assertions covering the flat Item[] →
// react-arborist tree-shape transformer in tree-shape.ts. The transformer is
// the boundary between the tRPC vault.items.list wire shape and the
// react-arborist <Tree> data prop, so isolating it from the render layer
// keeps shape bugs separate from render bugs (matches the SessionSidebar
// test-pattern split: pure helper specs + jsdom render specs).

import {describe, it, expect} from 'vitest'

import {
	buildArboristTree,
	MAIN_LIV_ID,
	type Item,
	type ItemType,
	type TreeNode,
} from './tree-shape'

function fakeItem(p: Partial<Item> & {id: string; type: ItemType}): Item {
	return {
		name: 'fake',
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		userId: 'admin',
		...p,
	}
}

describe('buildArboristTree', () => {
	it('Test 1: empty items → returns [MainLivRoot] only', () => {
		const tree = buildArboristTree([])
		expect(tree).toHaveLength(1)
		expect(tree[0].id).toBe(MAIN_LIV_ID)
		expect(tree[0].name).toBe('Main Liv')
		// Synthetic root has NO children when no real items exist.
		expect(tree[0].children === undefined || tree[0].children.length === 0).toBe(
			true,
		)
	})

	it('Test 2: single root item → [MainLivRoot, item] in that order (Main Liv pinned first)', () => {
		const it1 = fakeItem({id: 'aaaaaaaaaaaaaaaaaaaa1', type: 'project'})
		const tree = buildArboristTree([it1])
		expect(tree).toHaveLength(2)
		expect(tree[0].id).toBe(MAIN_LIV_ID)
		expect(tree[1].id).toBe('aaaaaaaaaaaaaaaaaaaa1')
	})

	it('Test 3: root siblings sorted by createdAt ASC (B createdAt:200 after A createdAt:100)', () => {
		const itB = fakeItem({
			id: 'bbbbbbbbbbbbbbbbbbbb1',
			type: 'project',
			createdAt: 200,
		})
		const itA = fakeItem({
			id: 'aaaaaaaaaaaaaaaaaaaa1',
			type: 'project',
			createdAt: 100,
		})
		const tree = buildArboristTree([itB, itA])
		expect(tree.map((n) => n.id)).toEqual([
			MAIN_LIV_ID,
			'aaaaaaaaaaaaaaaaaaaa1', // createdAt 100
			'bbbbbbbbbbbbbbbbbbbb1', // createdAt 200
		])
	})

	it('Test 4: parent+child → child nests under parent.children, root list = [MainLiv, parent]', () => {
		const parent = fakeItem({
			id: 'ppppppppppppppppppp1',
			type: 'project',
			name: 'parent',
		})
		const child = fakeItem({
			id: 'cccccccccccccccccccc1',
			type: 'chat',
			name: 'child',
			parentId: 'ppppppppppppppppppp1',
		})
		const tree = buildArboristTree([parent, child])
		expect(tree.map((n) => n.id)).toEqual([
			MAIN_LIV_ID,
			'ppppppppppppppppppp1',
		])
		const parentNode = tree[1]
		expect(parentNode.children).toBeDefined()
		expect(parentNode.children).toHaveLength(1)
		expect(parentNode.children![0].id).toBe('cccccccccccccccccccc1')
		expect(parentNode.children![0].item?.parentId).toBe('ppppppppppppppppppp1')
	})

	it('Test 5: orphan (parentId references missing id) promoted to root level — no throw', () => {
		const orphan = fakeItem({
			id: 'oooooooooooooooooooo1',
			type: 'agent',
			parentId: 'missing-id',
		})
		expect(() => buildArboristTree([orphan])).not.toThrow()
		const tree = buildArboristTree([orphan])
		expect(tree.map((n) => n.id)).toEqual([MAIN_LIV_ID, 'oooooooooooooooooooo1'])
	})

	it("Test 6: MAIN_LIV_ID === 'main-liv' literal — downstream plans depend on the exact value", () => {
		expect(MAIN_LIV_ID).toBe('main-liv')
	})

	it('Test 7: TreeNode shape — Main Liv synthetic root has NO item field; real rows have item field', () => {
		const real = fakeItem({id: 'rrrrrrrrrrrrrrrrrrrr1', type: 'project'})
		const tree = buildArboristTree([real])
		const mainLivNode: TreeNode = tree[0]
		const realNode: TreeNode = tree[1]
		expect(mainLivNode.item).toBeUndefined()
		expect(mainLivNode.type).toBeUndefined()
		expect(realNode.item).toBeDefined()
		expect(realNode.item?.id).toBe('rrrrrrrrrrrrrrrrrrrr1')
		expect(realNode.type).toBe('project')
	})

	it('Test 8: archived items (archivedAt !== null) are filtered out — sidebar shows live items only', () => {
		const live = fakeItem({id: 'llllllllllllllllllll1', type: 'project'})
		const archived = fakeItem({
			id: 'xxxxxxxxxxxxxxxxxxxx1',
			type: 'project',
			archivedAt: 1_000_000,
		})
		const tree = buildArboristTree([live, archived])
		expect(tree.map((n) => n.id)).toEqual([MAIN_LIV_ID, 'llllllllllllllllllll1'])
		// archived id never appears anywhere in tree
		const flat = JSON.stringify(tree)
		expect(flat).not.toContain('xxxxxxxxxxxxxxxxxxxx1')
	})
})
