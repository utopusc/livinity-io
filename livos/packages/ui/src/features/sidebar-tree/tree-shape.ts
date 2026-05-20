// Phase 174-02 — Pure flat-Item[] → react-arborist tree-shape transformer.
//
// Used by SidebarTree.tsx to convert the vault.items.list response into the
// {id, children?}[] shape react-arborist's <Tree> consumes. Main Liv is a
// SYNTHETIC root pinned at the top — it is NOT a real Item in the vault.
//
// Sort: root-level siblings + children of every parent are sorted by
// createdAt ASC (matches tree-resolver.ts convention on the backend).
//
// Archived items (archivedAt !== null) are filtered out — the sidebar shows
// live items only. Plan 174-05 owns the Archive action; archived items are
// viewable in a future Archive panel (deferred to Phase 175+).
//
// Orphan tolerance: items whose parentId references a non-existent parent
// are promoted to root-level (don't throw — the server should never produce
// these, but the UI must not crash on transient inconsistency).

/** Minimal UI-side mirror of the SACRED Item discriminated union (types.ts).
 * Field names byte-identical so Phase 178 graph integration won't drift. */
export type ItemType = 'project' | 'agent' | 'chat'

export interface Item {
	type: ItemType
	id: string
	name: string
	parentId: string | null
	pinned: boolean
	createdAt: number
	updatedAt: number
	archivedAt: number | null
	schemaVersion: number
	userId: string
	cwd?: string
	schedule?: string
	ccSessionId?: string
}

/** Synthetic id for the Main Liv pin row. Never collides with real ids
 * (real nanoid/uuid ids are >= 20 chars; 'main-liv' is 8 chars). */
export const MAIN_LIV_ID = 'main-liv' as const

/** react-arborist node shape. `item` is undefined for the Main Liv synthetic root. */
export interface TreeNode {
	id: string
	name: string
	type?: ItemType
	item?: Item
	children?: TreeNode[]
}

/** Pure transformer — see file header for semantics. */
export function buildArboristTree(items: readonly Item[]): TreeNode[] {
	const live = items.filter((it) => it.archivedAt === null)
	const byId = new Map<string, Item>()
	for (const it of live) byId.set(it.id, it)
	const childrenOf = new Map<string, Item[]>()
	for (const it of live) {
		// Orphan handling: if parentId references missing id, promote to root.
		const key = it.parentId !== null && byId.has(it.parentId) ? it.parentId : '__root__'
		const arr = childrenOf.get(key) ?? []
		arr.push(it)
		childrenOf.set(key, arr)
	}
	// Sort every sibling bucket by createdAt ASC.
	for (const [, arr] of childrenOf) arr.sort((a, b) => a.createdAt - b.createdAt)
	function toNode(it: Item): TreeNode {
		const kids = childrenOf.get(it.id)
		const node: TreeNode = {id: it.id, name: it.name, type: it.type, item: it}
		if (kids && kids.length > 0) node.children = kids.map(toNode)
		return node
	}
	const mainLiv: TreeNode = {id: MAIN_LIV_ID, name: 'Main Liv'}
	const roots = (childrenOf.get('__root__') ?? []).map(toNode)
	return [mainLiv, ...roots]
}
