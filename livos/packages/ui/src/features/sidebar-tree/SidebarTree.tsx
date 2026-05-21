// Phase 174-02 / 174-04 / 176-05 — SidebarTree implementation.
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
// 176-05 — open_item feedback loop: when Liv calls open_item, the SidebarTree
//   scrolls to and highlights the corresponding row. Subscribes to
//   vault.items.openItem (WebSocket subscription) which forwards Redis
//   liv:open:item messages from Phase 176-02's MCP tool. The synthetic
//   Main Liv root is guarded (scrollIntoView is a no-op for it).

import {useRef} from 'react'
import {Tree, type NodeRendererProps, type TreeApi} from 'react-arborist'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'

import {ItemTreeRow} from './ItemTreeRow'
import {SidebarFooter} from './SidebarFooter'
import {buildArboristTree, MAIN_LIV_ID, type TreeNode} from './tree-shape'

export interface SidebarTreeProps {
	/**
	 * Optional callback fired when a tree row is selected. Plan 175 wires this
	 * to the detail view opener (clicking a Project opens ProjectDetail,
	 * clicking a Chat resumes its CC PTY session, etc.).
	 */
	onSelect?: (itemId: string | null) => void
	/**
	 * v38.2 hotfix — when provided, the footer gear button fires this instead of
	 * opening the global Settings WindowManager window. AI Chat surface uses
	 * this to open the in-pane AiChatSettingsPanel (MCP + Claude Code config).
	 */
	onOpenSettingsPanel?: () => void
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

export function SidebarTree(props: SidebarTreeProps) {
	const list = trpcReact.vault.items.list.useQuery(undefined, {
		refetchInterval: 5_000,
	})

	// Phase 176-05 — Tree ref for open_item scroll/focus feedback from Liv.
	const treeRef = useRef<TreeApi<TreeNode> | null>(null)

	// Subscribe to Liv's open_item MCP tool calls forwarded via Redis → tRPC subscription.
	// Security: MAIN_LIV_ID guard prevents synthetic root from being scrolled (T-176-05-01).
	trpcReact.vault.items.openItem.useSubscription(undefined, {
		onData: ({itemId}) => {
			// Guard: the Main Liv synthetic root is not scrollable.
			if (itemId === MAIN_LIV_ID) return
			treeRef.current?.scrollTo?.(itemId, 'auto')
		},
	})

	// Phase 183 — D-V38-N: gear icon opens Settings window via WindowManager.
	// useWindowManagerOptional does NOT throw outside provider — returns null.
	const windowManager = useWindowManagerOptional()

	const handleOpenSettings = () => {
		// v38.2 hotfix — prefer in-pane panel callback if parent provided one.
		// Operator: "AI Chat sidebar Settings butonu AI Chat'e ÖZEL olacak".
		if (props.onOpenSettingsPanel) {
			props.onOpenSettingsPanel()
			return
		}
		if (!windowManager) return
		const existing = windowManager.windows.find(
			(w) => w.appId === 'LIVINITY_settings',
		)
		if (existing) {
			windowManager.focusWindow(existing.id)
		} else {
			windowManager.openWindow(
				'LIVINITY_settings',
				'/settings',
				'Settings',
				'/figma-exports/dock-settings-new.svg',
			)
		}
	}

	const moveMutation = trpcReact.vault.items.move.useMutation({
		onSuccess: (data) => {
			if (data?.warn) {
				toast.warning(data.warn)
			}
			// Success path: do NOT refetch — react-arborist's optimistic
			// local move is the truth and the 5s poll will reconcile.
		},
		onError: (err) => {
			// err.data.cause is attached by the Phase 174-04 structured-cause extension.
			// Access via type assertion — the generated tRPC error shape doesn't expose
			// `cause` in its static type, but the server attaches it at runtime.
			const cause = (err as {data?: {cause?: {kind?: string}}}).data?.cause
			const kind = cause?.kind
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
			<div className='flex h-full flex-col p-3'>
				<div className='flex flex-1 items-center justify-center'>
					<p className='text-center text-sm text-text-secondary'>
						talk to Liv in terminal ↓
					</p>
				</div>
				<SidebarFooter onOpenSettings={handleOpenSettings} />
			</div>
		)
	}

	const treeData = buildArboristTree(items)

	return (
		<div className='flex h-full flex-col gap-2 p-3'>
			<div className='flex-1 overflow-y-auto'>
				<Tree<TreeNode>
					ref={treeRef}
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
					// v38.2 hotfix — wire onSelect to parent (Phase 174-02 typed the
					// prop but never connected it; sidebar clicks did nothing).
					onSelect={(nodes) => {
						if (!props.onSelect) return
						const first = nodes[0]
						if (!first || first.id === MAIN_LIV_ID) {
							props.onSelect(null)
							return
						}
						props.onSelect(first.id)
					}}
				>
					{TreeNodeRow}
				</Tree>
			</div>
			<SidebarFooter onOpenSettings={handleOpenSettings} />
		</div>
	)
}
