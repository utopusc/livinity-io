// Phase 174-02 / 174-04 — SidebarTree implementation.
//
// 174-02 — Queries vault.items.list via tRPC (Phase 171-04 router) with a
//   5s refetchInterval as the v1 real-time fallback. Transforms flat
//   Item[] -> react-arborist tree via tree-shape.ts. Empty state shows
//   centered hint.
//
// 174-04 — Drag-to-reparent via react-arborist's onMove callback.
//   Each dragId becomes a vault.items.move tRPC mutation. The synthetic
//   Main Liv id is guarded (never moves). On error, sonner toast.error
//   surfaces the structured cause (cycle / self / depth-exceeds-hard-cap)
//   AND we refetch the list to revert react-arborist's local optimistic
//   state to server truth. On success-with-warn (soft depth cap >= 5),
//   toast.warning surfaces but the move commits (no refetch — the 5s poll
//   reconciles).
//
// Plan 174-05 will add the footer Settings gear slot BELOW the <Tree>
// in the flex column.

import {Tree, type NodeRendererProps} from 'react-arborist'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'

import {ItemTreeRow} from './ItemTreeRow'
import {buildArboristTree, MAIN_LIV_ID, type TreeNode} from './tree-shape'

export interface SidebarTreeProps {
	/**
	 * Optional callback fired when a tree row is selected. Plan 175 wires this
	 * to the detail view opener (clicking a Project opens ProjectDetail,
	 * clicking a Chat resumes its CC PTY session, etc.).
	 */
	onSelect?: (itemId: string | null) => void
}

function TreeNodeRow({node}: NodeRendererProps<TreeNode>) {
	// 174-02 ships a thin wrapper around the 174-01 ItemTreeRow stub; 174-03
	// fills the real per-type styling inside ItemTreeRow. The MAIN_LIV pin
	// is rendered with a minimal inline label here — it's synthetic and has
	// no `item` field for ItemTreeRow to consume.
	if (node.id === MAIN_LIV_ID) {
		return <div className='px-2 py-1 text-sm font-semibold'>Main Liv</div>
	}
	return <ItemTreeRow item={node.data.item} />
}

export function SidebarTree(_props: SidebarTreeProps) {
	const list = trpcReact.vault.items.list.useQuery(undefined, {
		refetchInterval: 5_000,
	})

	const moveMutation = trpcReact.vault.items.move.useMutation({
		onSuccess: (data: {item: unknown; warn: string | null}) => {
			if (data?.warn) {
				toast.warning(data.warn)
			}
			// Success path: do NOT refetch — react-arborist's optimistic
			// local move is the truth and the 5s poll will reconcile.
		},
		onError: (err: {
			data?: {cause?: {kind?: string; depth?: number}}
			message?: string
		}) => {
			const kind = err?.data?.cause?.kind
			let msg = 'Move failed'
			if (kind === 'cycle') {
				msg = 'Move failed: would create a cycle'
			} else if (kind === 'self') {
				msg = 'Move failed: cannot drop onto self'
			} else if (kind === 'depth-exceeds-hard-cap') {
				msg = 'Move failed: tree too deep (limit 8)'
			} else if (kind === 'archived-parent') {
				msg = 'Move failed: parent is archived'
			} else if (kind === 'not-found') {
				msg = 'Move failed: item or parent not found'
			} else if (err?.message) {
				msg = err.message
			}
			toast.error(msg)
			// Error path: refetch to revert any local optimistic state to
			// server truth.
			list.refetch()
		},
	})

	const items = list.data?.items ?? []
	if (items.length === 0) {
		return (
			<div className='flex h-full flex-col items-center justify-center p-3'>
				<p className='text-center text-sm text-text-secondary'>
					talk to Liv in terminal ↓
				</p>
			</div>
		)
	}

	const treeData = buildArboristTree(items)

	return (
		<div className='flex h-full flex-col gap-2 p-3'>
			<div className='flex-1 overflow-y-auto'>
				<Tree<TreeNode>
					data={treeData}
					width='100%'
					height={400}
					rowHeight={32}
					idAccessor='id'
					childrenAccessor='children'
					onMove={({dragIds, parentId}) => {
						for (const id of dragIds) {
							// Guard: the Main Liv synthetic root is unmovable.
							if (id === MAIN_LIV_ID) continue
							moveMutation.mutate({id, newParentId: parentId})
						}
					}}
				>
					{TreeNodeRow}
				</Tree>
			</div>
		</div>
	)
}
