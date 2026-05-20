// Phase 174-05 — Right-click context menu wrapper for sidebar tree rows.
//
// Structural component — handlers are stub props that Phase 175 wires to
// actual tRPC mutations (vault.items.archive, vault.items.delete, etc.).
// The agent-only items (Run Now / View Inbox / Stop Tmux) are conditional
// on itemType === 'agent' — defence-in-depth (real authorization lives
// server-side in Phase 175's vault.items.* mutations; the client-side
// gate is a UX affordance, not a security boundary).
//
// Uses @radix-ui/react-context-menu @ 2.1.4 (already a UI dep).
// Direct primitive import (NOT the local shadcn wrapper) keeps this
// component dependency-free at the Phase-174 layer; Phase 175 may swap
// to the wrapper when standardising menu styling across the sidebar.

import * as ContextMenu from '@radix-ui/react-context-menu'
import type {ReactNode} from 'react'

export interface ItemContextMenuProps {
	/** Discriminator for showing agent-only items. */
	itemType: 'project' | 'agent' | 'chat'
	/** Stub callbacks — Phase 175 supplies real impls. */
	onOpen?: () => void
	onRename?: () => void
	onDuplicate?: () => void
	onArchive?: () => void
	onDelete?: () => void
	onExport?: () => void
	onRevealInFiles?: () => void
	/** Agent-only stubs — Phase 175/177 supply real impls. */
	onRunNow?: () => void
	onViewInbox?: () => void
	onStopTmux?: () => void
	/** The row content the right-click triggers on. */
	children: ReactNode
}

// Shared item className — token-driven (no hard-coded hex). Hover uses
// surface-2 from Livinity DS tokens.
const ITEM_CLS =
	'cursor-pointer px-3 py-1.5 text-sm outline-none hover:bg-surface-2'
const DESTRUCTIVE_ITEM_CLS =
	'cursor-pointer px-3 py-1.5 text-sm text-accent-red outline-none hover:bg-surface-2'
const SEPARATOR_CLS = 'my-1 h-px bg-line'

export function ItemContextMenu(props: ItemContextMenuProps) {
	const {itemType, children} = props
	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Content className='min-w-[180px] rounded-md border border-line bg-card-bg p-1 shadow-pop'>
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onOpen?.()}
					>
						Open
					</ContextMenu.Item>
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onRename?.()}
					>
						Rename
					</ContextMenu.Item>
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onDuplicate?.()}
					>
						Duplicate
					</ContextMenu.Item>
					{itemType === 'agent' && (
						<>
							<ContextMenu.Separator className={SEPARATOR_CLS} />
							<ContextMenu.Item
								className={ITEM_CLS}
								onSelect={() => props.onRunNow?.()}
							>
								Run Now
							</ContextMenu.Item>
							<ContextMenu.Item
								className={ITEM_CLS}
								onSelect={() => props.onViewInbox?.()}
							>
								View Inbox
							</ContextMenu.Item>
							<ContextMenu.Item
								className={ITEM_CLS}
								onSelect={() => props.onStopTmux?.()}
							>
								Stop Tmux
							</ContextMenu.Item>
						</>
					)}
					<ContextMenu.Separator className={SEPARATOR_CLS} />
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onArchive?.()}
					>
						Archive
					</ContextMenu.Item>
					<ContextMenu.Item
						className={DESTRUCTIVE_ITEM_CLS}
						onSelect={() => props.onDelete?.()}
					>
						Delete
					</ContextMenu.Item>
					<ContextMenu.Separator className={SEPARATOR_CLS} />
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onExport?.()}
					>
						Export
					</ContextMenu.Item>
					<ContextMenu.Item
						className={ITEM_CLS}
						onSelect={() => props.onRevealInFiles?.()}
					>
						Reveal in Files
					</ContextMenu.Item>
				</ContextMenu.Content>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	)
}
