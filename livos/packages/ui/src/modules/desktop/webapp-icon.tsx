// Phase 94-04 — WebAppIcon.
//
// Visual mirror of `AppIcon` but for WebApp rows (URL + favicon) instead
// of Docker apps. We reuse `AppIcon`'s layout/animation primitives by
// passing `iconUrl=faviconUrl` + a custom click handler — no parallel CSS.
//
// Click → `useLaunchWebApp()` stub (P95 fills in the spawn dispatch).
// Right-click → minimal context menu with `Remove WebApp` calling
// `webapp.delete` mutation behind a destructive AlertDialog confirmation.
//
// Tooltip / label = `webapp.title || hostname(webapp.url)`.

import {useState} from 'react'

import {useLaunchWebApp} from '@/hooks/use-launch-webapp'
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

export type WebAppIconProps = {
	id: string
	url: string
	title: string | null
	faviconUrl: string | null
}

function hostnameOrUrl(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return url
	}
}

export function WebAppIcon({id, url, title, faviconUrl}: WebAppIconProps) {
	const launch = useLaunchWebApp()
	const utils = trpcReact.useUtils()
	const deleteMut = trpcReact.webapp.delete.useMutation()

	const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

	const label = title?.trim() || hostnameOrUrl(url)
	const iconSrc = faviconUrl || ''

	const handleClick = launch(id)

	const handleRemove = async () => {
		try {
			await deleteMut.mutateAsync({id})
			await utils.webapp.list.invalidate()
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
						Remove WebApp
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove WebApp</AlertDialogTitle>
						<AlertDialogDescription>
							Remove "{label}" from your desktop? This only deletes the icon — the
							website itself is unaffected.
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
