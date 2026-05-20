// Phase 174-02 — SidebarTree implementation.
//
// - Queries vault.items.list via tRPC (Phase 171-04 router) with a 5s
//   refetchInterval as the v1 real-time fallback (subscribeTree doesn't
//   exist yet — confirmed by grep on vault-items-router.ts).
// - Transforms the flat Item[] into react-arborist's nested tree shape via
//   the pure transformer in tree-shape.ts (Main Liv synthetic root pinned
//   at the top).
// - Empty vault (length 0) renders ONLY the "talk to Liv in terminal ↓"
//   centered hint — no empty tree shell.
// - Per-row content is delegated to <ItemTreeRow> (174-01 stub, 174-03
//   fills the real per-type icon+label+badge body).
//
// Plan 174-04 extends this file with an onMove handler that calls
// vault.items.move tRPC; Plan 174-05 adds the footer Settings gear slot
// BELOW the <Tree> in the flex column.

import {Tree, type NodeRendererProps} from 'react-arborist'

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
				>
					{TreeNodeRow}
				</Tree>
			</div>
		</div>
	)
}
