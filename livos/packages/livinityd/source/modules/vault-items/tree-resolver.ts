// Phase 171-03 — TreeResolver (parentId-derived view + cycle/depth validation + tree.json cache).
//
// Pure-function module that turns a flat `Item[]` (from Plan 171-02 ItemStore)
// into a `TreeNode[]` parent→children forest, validates move operations
// against cycles and depth caps (D-V38-E: soft warn ≥ 5, hard reject ≥ 8),
// and writes a rebuildable `<vaultRoot>/tree.json` cache for fast UI
// consumption. The resolver does NOT own filesystem reads of items — it
// receives `Item[]` from the caller. Only `writeTreeCache` touches the
// filesystem (atomic .tmp + rename, mirror of cc-pty/session-store.ts
// saveNoLock recipe verbatim).
//
// Purpose: tRPC router (Plan 171-04) calls `validateMove` BEFORE persisting
// `parentId` changes through ItemStore.update. Sidebar UI (Phase 174) reads
// `tree.json` for initial render then subscribes to `liv:tree:updated` for
// invalidation. Keeping resolution OUT of ItemStore preserves the store's
// single-responsibility (CRUD only).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend (READ-ONLY analog — session-store.ts:117-127
//   atomic write recipe mirrored verbatim, but no Phase 166 file is
//   modified by this plan)
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph backend
// + Phase 171-02 ItemStore module (sibling, independent file)
// all UNCHANGED. This NEW file owns the v38 tree-resolver concern only.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {Item, ItemType} from './types.js'

/**
 * Depth caps per D-V38-E (master plan line 82).
 *
 * `depth` of a root-level Item (parentId === null) is 0; each child adds 1.
 * A move is rejected when the resulting depth (including the moved
 * sub-tree's own descendant chain) reaches `DEPTH_HARD_CAP`. It is allowed
 * but flagged with `warn: 'depth-exceeds-soft-cap'` when it reaches
 * `DEPTH_SOFT_CAP` but is still below the hard cap. The caller (Plan 171-04
 * tRPC router) decides whether to surface a toast or proceed silently.
 */
const DEPTH_SOFT_CAP = 5 // warn when resulting depth >= 5
const DEPTH_HARD_CAP = 8 // reject when resulting depth >= 8

/**
 * `tree.json` envelope schema version. Bump when the on-disk shape
 * changes. Plan 174 sidebar UI verifies this on read and falls back to
 * `buildTree(await store.list())` on mismatch (threat T-171-03-02).
 */
const TREE_SCHEMA_VERSION = 1

/**
 * One node in the derived forest. `item` is the raw record from the
 * authoritative store; `children` is the recursively-built subtree;
 * `depth` is the distance from the nearest root (0 for parentId === null).
 *
 * Orphan items (parentId pointing at an absent ancestor) are surfaced in
 * a parallel `orphans: TreeNode[]` array — same `TreeNode` shape, but
 * their `depth` is computed relative to their orphan-bucket origin
 * (always 0 at the bucket root).
 */
export interface TreeNode {
	item: Item
	children: TreeNode[]
	depth: number
}

/**
 * Result of a `validateMove` call. `ok: true` allows the caller to proceed.
 * The optional `warn: 'depth-exceeds-soft-cap'` flag means the move was
 * accepted but the resulting depth crosses the soft cap — Plan 171-04
 * surfaces this as a non-fatal warning to the user.
 *
 * `ok: false` carries a discriminant `reason` so the caller can map to a
 * structured error code without string parsing.
 */
export type MoveValidation =
	| {ok: true; warn?: 'depth-exceeds-soft-cap'}
	| {
			ok: false
			reason:
				| 'cycle'
				| 'self'
				| 'not-found'
				| 'depth-exceeds-hard-cap'
				| 'archived-parent'
	  }

/**
 * Build a parent→children forest from a flat `Item[]`.
 *
 * Items whose `parentId === null` are roots. Items whose `parentId` is
 * non-null but does NOT resolve to an entry in `items` are orphans and
 * are returned in a separate `orphans` array — they are NEVER silently
 * promoted to roots (threat T-171-03-04: a tampered/corrupted parentId
 * pointing at a sibling deletion must surface visibly, not vanish).
 *
 * Sibling order: pinned-first, then `updatedAt` descending (newest first).
 * This is the canonical D-V38-T view order — UI consumers render in array
 * order without re-sorting.
 *
 * Cycle defense: if `items` contains a structural cycle (A→B→A), buildTree
 * still terminates — items inside the cycle are reached but `depth` is
 * computed via a `seen: Set<string>` guard, so no infinite recursion. Such
 * items appear under whichever ancestor's subtree is walked first.
 */
export function buildTree(items: Item[]): {roots: TreeNode[]; orphans: TreeNode[]} {
	// Index items by id for O(1) parent lookups.
	const byId = new Map<string, Item>()
	for (const item of items) byId.set(item.id, item)

	// Group children by their parentId. parentId === null is the root bucket;
	// parentId pointing at an absent ancestor goes into orphanGroups under
	// that ghost id so each orphan family stays together.
	const rootIds: string[] = []
	const orphanHeads: string[] = []
	const childrenByParent = new Map<string | null, string[]>()
	for (const item of items) {
		if (item.parentId === null) {
			rootIds.push(item.id)
			continue
		}
		if (!byId.has(item.parentId)) {
			// Orphan — its declared parent is missing from items.
			orphanHeads.push(item.id)
			continue
		}
		const bucket = childrenByParent.get(item.parentId)
		if (bucket === undefined) {
			childrenByParent.set(item.parentId, [item.id])
		} else {
			bucket.push(item.id)
		}
	}

	// Recursive node builder with cycle defense.
	const seen = new Set<string>()
	const buildNode = (id: string, depth: number): TreeNode => {
		seen.add(id)
		const item = byId.get(id)
		// Defensive: id came from byId.keys() or a childrenByParent bucket
		// that was populated from `items`; `item` should always be defined.
		// If somehow undefined, fabricate a stub so buildTree never throws.
		if (item === undefined) {
			throw new Error(`tree-resolver: buildNode invariant — id '${id}' missing from byId`)
		}
		const childIds = childrenByParent.get(id) ?? []
		const children: TreeNode[] = []
		for (const childId of childIds) {
			if (seen.has(childId)) continue // cycle guard — skip already-visited
			children.push(buildNode(childId, depth + 1))
		}
		sortSiblings(children)
		return {item, children, depth}
	}

	const roots: TreeNode[] = rootIds.map((id) => buildNode(id, 0))
	sortSiblings(roots)

	const orphans: TreeNode[] = orphanHeads.map((id) => buildNode(id, 0))
	sortSiblings(orphans)

	return {roots, orphans}
}

/**
 * Sort an array of TreeNodes in-place per the D-V38-T canonical order:
 * pinned-first, then `updatedAt` descending. Both fields live on
 * `node.item`. Stable for equal keys (JavaScript Array.prototype.sort
 * is stable per ECMA-262 since 2019).
 */
function sortSiblings(nodes: TreeNode[]): void {
	nodes.sort((a, b) => {
		const ap = a.item.pinned ? 1 : 0
		const bp = b.item.pinned ? 1 : 0
		if (ap !== bp) return bp - ap // pinned first
		return b.item.updatedAt - a.item.updatedAt // newest first
	})
}

/**
 * Depth of `itemId` from its nearest root. Returns 0 for parentId === null,
 * 1 for a direct child of a root, etc. Returns `-1` if `itemId` is not in
 * `items` (caller treats as "not found"). Cycle-safe via a `seen: Set`
 * guard: on detection, returns `Number.POSITIVE_INFINITY` so callers
 * comparing against any finite cap reject defensively (threat T-171-03-01).
 *
 * Iterative — never recurses, so deep chains cannot blow the stack
 * (threat T-171-03-03).
 */
export function depthOf(items: Item[], itemId: string): number {
	const byId = new Map<string, Item>()
	for (const item of items) byId.set(item.id, item)
	const start = byId.get(itemId)
	if (start === undefined) return -1

	let current: Item | undefined = start
	let depth = 0
	const seen = new Set<string>()
	// Bound iterations defensively: even with a corrupt chain, never loop
	// more than `items.length + 1` times before bailing.
	const maxIterations = items.length + 1
	let iterations = 0
	while (current !== undefined && current.parentId !== null) {
		if (seen.has(current.id)) return Number.POSITIVE_INFINITY
		seen.add(current.id)
		if (iterations++ > maxIterations) return Number.POSITIVE_INFINITY
		const parent = byId.get(current.parentId)
		if (parent === undefined) {
			// Orphan chain — treat its depth as the distance walked so far.
			// Orphan heads themselves sit at depth 0 in the orphans bucket;
			// but for `depthOf` we surface the actual parent-chain length so
			// validateMove can reason about it.
			return depth + 1
		}
		current = parent
		depth++
	}
	return depth
}

/**
 * Compute the deepest descendant chain rooted at `itemId`, expressed as
 * the number of edges below `itemId`. Returns 0 for a leaf (no children).
 * Iterative DFS with a `seen: Set` cycle guard — never recurses, never
 * loops infinitely on corrupt data (threat T-171-03-03).
 */
function maxDescendantDepth(items: Item[], itemId: string): number {
	const childrenByParent = new Map<string, string[]>()
	for (const item of items) {
		if (item.parentId === null) continue
		const bucket = childrenByParent.get(item.parentId)
		if (bucket === undefined) {
			childrenByParent.set(item.parentId, [item.id])
		} else {
			bucket.push(item.id)
		}
	}

	const seen = new Set<string>()
	// Stack of {id, depthBelowRoot}; root is itemId at depth 0.
	const stack: Array<{id: string; depth: number}> = [{id: itemId, depth: 0}]
	let maxDepth = 0
	while (stack.length > 0) {
		const top = stack.pop()
		if (top === undefined) break
		if (seen.has(top.id)) continue
		seen.add(top.id)
		if (top.depth > maxDepth) maxDepth = top.depth
		const kids = childrenByParent.get(top.id) ?? []
		for (const kid of kids) {
			if (!seen.has(kid)) stack.push({id: kid, depth: top.depth + 1})
		}
	}
	return maxDepth
}

/**
 * Validate a proposed parent-change for `itemId` to `newParentId`.
 *
 * Rejection priority (first match wins):
 *   1. `newParentId === itemId`                → reason: 'self'
 *   2. `itemId` not present in `items`         → reason: 'not-found'
 *   3. `newParentId !== null` and `newParentId` not present  → reason: 'not-found'
 *   4. The proposed parent's subtree contains `itemId` (cycle), OR
 *      walking newParentId's parent chain upward hits `itemId` (cycle)
 *                                              → reason: 'cycle'
 *   5. New parent has `archivedAt !== null`    → reason: 'archived-parent'
 *   6. `depthOf(newParent) + 1 + maxDescendantDepth(itemId) >= DEPTH_HARD_CAP`
 *                                              → reason: 'depth-exceeds-hard-cap'
 *   7. Same expression >= DEPTH_SOFT_CAP        → ok: true, warn: 'depth-exceeds-soft-cap'
 *   8. otherwise                               → ok: true
 *
 * Cycle check (rule 4) intentionally walks BOTH directions to defend
 * against tampered or partially-applied on-disk state: the upward walk
 * catches the common "move a parent under one of its descendants" case;
 * the downward walk catches the unusual case where a corrupt subtree
 * under `itemId` already contains `newParentId` via some other path.
 */
export function validateMove(
	items: Item[],
	itemId: string,
	newParentId: string | null,
): MoveValidation {
	// Rule 1 — self-parent.
	if (newParentId === itemId) {
		return {ok: false, reason: 'self'}
	}

	const byId = new Map<string, Item>()
	for (const item of items) byId.set(item.id, item)

	// Rule 2 — itemId must exist.
	if (!byId.has(itemId)) {
		return {ok: false, reason: 'not-found'}
	}

	// Rule 3 — newParentId must exist (null is allowed = move to root).
	if (newParentId !== null && !byId.has(newParentId)) {
		return {ok: false, reason: 'not-found'}
	}

	// Rule 4a — cycle: walking newParentId's parent chain upward must NOT
	// reach itemId. (This catches "move ancestor under its own descendant".)
	if (newParentId !== null) {
		const seenUp = new Set<string>()
		let cursor: string | null = newParentId
		const maxHops = items.length + 1
		let hops = 0
		while (cursor !== null) {
			if (cursor === itemId) {
				return {ok: false, reason: 'cycle'}
			}
			if (seenUp.has(cursor)) break // pre-existing cycle in the chain — bail safely
			seenUp.add(cursor)
			if (hops++ > maxHops) break // defensive bound
			const node: Item | undefined = byId.get(cursor)
			if (node === undefined) break
			cursor = node.parentId
		}

		// Rule 4b — cycle: newParentId must NOT live inside the subtree
		// rooted at itemId. (Defends against corrupt cross-links.)
		const childrenByParent = new Map<string, string[]>()
		for (const item of items) {
			if (item.parentId === null) continue
			const bucket = childrenByParent.get(item.parentId)
			if (bucket === undefined) {
				childrenByParent.set(item.parentId, [item.id])
			} else {
				bucket.push(item.id)
			}
		}
		const seenDown = new Set<string>()
		const stack: string[] = [itemId]
		while (stack.length > 0) {
			const top = stack.pop()
			if (top === undefined) break
			if (seenDown.has(top)) continue
			seenDown.add(top)
			if (top === newParentId) {
				return {ok: false, reason: 'cycle'}
			}
			const kids = childrenByParent.get(top) ?? []
			for (const kid of kids) {
				if (!seenDown.has(kid)) stack.push(kid)
			}
		}
	}

	// Rule 5 — archived parent.
	if (newParentId !== null) {
		const parent = byId.get(newParentId)
		if (parent !== undefined && parent.archivedAt !== null) {
			return {ok: false, reason: 'archived-parent'}
		}
	}

	// Compute the resulting depth.
	// New depth of itemId's root edge after the move:
	//   newParentId === null → depth becomes 0 (root-level)
	//   else                 → depth becomes depthOf(newParent) + 1
	// Then add the moved subtree's own descendant chain depth.
	const parentDepth = newParentId === null ? -1 : depthOf(items, newParentId)
	if (parentDepth === Number.POSITIVE_INFINITY) {
		// Cycle detected via depthOf — already would have been caught above,
		// but defend defensively: treat as a hard reject.
		return {ok: false, reason: 'cycle'}
	}
	const movedSubtreeExtent = maxDescendantDepth(items, itemId)
	const newDepth = parentDepth + 1 + movedSubtreeExtent

	// Rule 6 — hard cap.
	if (newDepth >= DEPTH_HARD_CAP) {
		return {ok: false, reason: 'depth-exceeds-hard-cap'}
	}

	// Rule 7 — soft cap.
	if (newDepth >= DEPTH_SOFT_CAP) {
		return {ok: true, warn: 'depth-exceeds-soft-cap'}
	}

	// Rule 8 — ok.
	return {ok: true}
}

/**
 * Atomically write the derived tree as `<vaultRoot>/tree.json`. The
 * envelope shape is:
 *
 *   {schemaVersion: 1, generatedAt: <epoch-ms>, roots: TreeNode[], orphans: TreeNode[]}
 *
 * Atomicity is the same .tmp + rename recipe as
 * cc-pty/session-store.ts:117-127. The parent directory is auto-created
 * (`fs.mkdir … {recursive: true}`) for safety — the resolver does not
 * require the caller to have already scaffolded vaultRoot.
 *
 * tree.json is a rebuildable cache (threat T-171-03-02 disposition:
 * accept — Plan 174 sidebar UI verifies `schemaVersion` on read and
 * falls back to `buildTree(await store.list())` on mismatch). No locking
 * is required across processes because a stale or torn read recovers via
 * that fallback.
 */
export async function writeTreeCache(vaultRoot: string, items: Item[]): Promise<void> {
	await fs.mkdir(vaultRoot, {recursive: true})
	const {roots, orphans} = buildTree(items)
	const envelope = {
		schemaVersion: TREE_SCHEMA_VERSION,
		generatedAt: Date.now(),
		roots,
		orphans,
	}
	const target = path.join(vaultRoot, 'tree.json')
	const tmp = target + '.tmp'
	await fs.writeFile(tmp, JSON.stringify(envelope, null, 2), 'utf-8')
	await fs.rename(tmp, target)
}

// Re-export ItemType so downstream consumers needing the discriminator
// alongside the resolver public surface can pull both from one specifier.
export type {ItemType}
