// Phase 290 — ShortcutIcon.
//
// Visual mirror of WebAppIcon but for `shortcuts` rows (web/terminal/local).
// Reuses AppIcon's layout/animation. Click → useLaunchShortcut (open-mode
// engine). Right-click → "Remove Shortcut" behind a destructive confirm.

import {useState} from 'react'

import {useLaunchShortcut} from '@/hooks/use-launch-shortcut'
import type {ShortcutEntry} from '@/providers/apps'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from '@/shadcn-components/ui/context-menu'
import {contextMenuClasses} from '@/shadcn-components/ui/shared/menu'
import {trpcReact} from '@/trpc/trpc'

import {AppIcon} from './app-icon'

export type ShortcutIconProps = {
	shortcut: ShortcutEntry
}

export function ShortcutIcon({shortcut}: ShortcutIconProps) {
	const launch = useLaunchShortcut()
	const utils = trpcReact.useUtils()
	const deleteMut = trpcReact.shortcut.delete.useMutation()

	const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

	const label = shortcut.title?.trim() || 'Shortcut'
	const iconSrc = shortcut.iconUrl || ''

	const handleClick = launch({
		id: shortcut.id,
		kind: shortcut.kind,
		title: label,
		iconUrl: iconSrc,
		openMode: shortcut.openMode,
		payload: shortcut.payload,
	})

	const handleRemove = async () => {
		try {
			await deleteMut.mutateAsync({id: shortcut.id})
			// L5 — invalidate the shortcut list AND apps.list (its data feeds the
			// desktop grid alongside Docker apps).
			await utils.shortcut.list.invalidate()
			await utils.apps.list.invalidate().catch(() => {})
		} finally {
			setShowRemoveConfirm(false)
		}
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger className='group'>
					<AppIcon label={label} src={iconSrc} onClick={handleClick} state='ready' />
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem
						className={contextMenuClasses.item.rootDestructive}
						onSelect={() => setShowRemoveConfirm(true)}
					>
						Remove Shortcut
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove Shortcut</AlertDialogTitle>
						<AlertDialogDescription>
							Remove "{label}" from your desktop? This only deletes the tile — the
							target is unaffected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							onClick={handleRemove}
							disabled={deleteMut.isPending}
						>
							{deleteMut.isPending ? 'Removing…' : 'Remove'}
						</AlertDialogAction>
						<AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
