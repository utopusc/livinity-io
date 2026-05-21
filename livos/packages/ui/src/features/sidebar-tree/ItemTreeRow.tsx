// Phase 174-03 — ItemTreeRow: per-type icon + label + token colors.
//
// D-V38-O palette mapping:
//   Project → text-accent-amber  + FolderKanban  + font-semibold
//   Agent   → text-accent-blue   + Bot           + font-medium
//             (CONTEXT.md calls this "cyan"; design-tokens ships no
//              --accent-cyan, --accent-blue is the closest v36-preset
//              exposed token — see plan interfaces block.)
//   Chat    → text-text-secondary + MessageSquare + default weight
//
// ALL colors come from Livinity DS tokens (tailwind.preset.cjs +
// tokens.css body.dark overrides) so dark/light mode parity is automatic.
// NO hardcoded hex values in this file.
//
// The synthetic Main Liv row is rendered by SidebarTree.tsx directly —
// ItemTreeRow only fires for real Items, but defensively handles null/
// undefined `item` by returning null (B7 in ItemTreeRow.test.tsx).
//
// NOTE on icon class names: lucide-react @ 0.288.0 OVERWRITES its default
// `class="lucide lucide-<icon>"` when a `className` prop is supplied —
// the prop replaces the built-in class rather than merging. To preserve
// the `lucide-folder-kanban` / `lucide-bot` / `lucide-message-square`
// class hooks that downstream queries + tests (B4-B6) rely on, we
// concatenate them into className manually. Newer lucide-react versions
// (>=0.300) merge automatically — when we upgrade, the explicit
// `lucide-<icon>` literal here becomes redundant but harmless.

import {Bot, FolderKanban, MessageSquare} from 'lucide-react'

/** Minimal Item shape needed for rendering. The full discriminated union
 * lives in tree-shape.ts; we widen here so this component can accept the
 * 174-01 stub `unknown` type without breaking existing imports. */
interface RowItem {
	type: 'project' | 'agent' | 'chat'
	name: string
}

export interface ItemTreeRowProps {
	/** The Item shape from vault.items.list — Plan 174-03 narrows on `type`. */
	item: unknown
	/** Phase 177-04 — unread inbox entry count badge (agent rows only).
	 *  Integer-cast via Math.floor to prevent XSS via float/string input.
	 *  Badge hidden when value is 0, NaN, or item.type !== 'agent'. */
	unreadCount?: number
}

function isRowItem(x: unknown): x is RowItem {
	if (x === null || typeof x !== 'object') return false
	const t = (x as {type?: unknown}).type
	const n = (x as {name?: unknown}).name
	return (t === 'project' || t === 'agent' || t === 'chat') && typeof n === 'string'
}

export function ItemTreeRow({item, unreadCount}: ItemTreeRowProps) {
	if (!isRowItem(item)) return null

	if (item.type === 'project') {
		return (
			<div className='flex items-center gap-2 rounded px-2 py-1 text-sm font-semibold cursor-pointer transition-colors hover:bg-surface-2 active:bg-surface-2'>
				<FolderKanban size={16} className='lucide-folder-kanban text-accent-amber' />
				<span className='truncate'>{item.name}</span>
			</div>
		)
	}

	if (item.type === 'agent') {
		// Phase 177-04 — integer-cast to prevent XSS via float/string (T-177-04-01).
		const badgeCount = Math.max(0, Math.floor(Number(unreadCount ?? 0)))
		return (
			<div className='flex items-center gap-2 rounded px-2 py-1 text-sm font-medium cursor-pointer transition-colors hover:bg-surface-2 active:bg-surface-2'>
				<Bot size={16} className='lucide-bot text-accent-blue' />
				<span className='truncate'>{item.name}</span>
				{badgeCount > 0 && (
					<span
						data-testid='inbox-badge'
						className='ml-auto rounded-full bg-accent-blue px-1.5 py-0.5 text-xs font-medium text-bg'
					>
						{badgeCount}
					</span>
				)}
			</div>
		)
	}

	// chat — tertiary visual weight; icon AND label both use text-secondary.
	return (
		<div className='flex items-center gap-2 rounded px-2 py-1 text-sm text-text-secondary cursor-pointer transition-colors hover:bg-surface-2 hover:text-text-primary active:bg-surface-2'>
			<MessageSquare size={16} className='lucide-message-square text-text-secondary' />
			<span className='truncate'>{item.name}</span>
		</div>
	)
}
