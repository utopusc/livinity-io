// Phase 101-07 Task 3 — NativeAppIcon.
//
// Dock icon for a persisted NativeAppConfig (apps.native.list[]). Visually
// identical to WebAppIcon (94-04) — wraps `<AppIcon>` (the shared layout/
// animation primitive) inside a `<ContextMenu>` for right-click → Remove
// Native App, with an `<AlertDialog>` confirm gate before destroying.
//
// Click flow:
//   icon click  → useLaunchNativeApp().launch({id, name})
//                → apps.native.spawn mutation (101-05 orchestrator)
//                → x11vnc stream started, returns {streamId, wsUrl}
//                  (stream-window mount is a future hookup — UAT row 7)
//
// Right-click → Remove:
//   ContextMenu → AlertDialog confirm → apps.native.delete mutation
//                → invalidate apps.native.list (re-renders desktop grid)
//
// Auth note: apps.native.delete is admin-gated server-side (native-routes.ts:
// 159-165, T-101-02 threat-register row). A non-admin user clicking Remove
// will hit a TRPCError UNAUTHORIZED — caught by deleteMut.isError and
// surfaced inline. We do NOT pre-hide the menu item; admin-gating is a
// server-side correctness boundary, not a UX-feature gate.

import {useState} from 'react'

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

import {AppIcon} from '../desktop/app-icon'
import {useLaunchNativeApp} from './use-launch-native-app'

export interface NativeAppIconProps {
	/** UUID matching the persisted NativeAppConfig (apps.native.list[].id). */
	id: string
	/** Display name — shown as the dock label AND used in failure-toast copy. */
	name: string
	/** Optional icon URL. Empty string falls back to the AppIcon placeholder. */
	iconUrl?: string
	/**
	 * Phase 203-10 — wmClassHint from the persisted config. When it starts
	 * with `liv-openui-`, useLaunchNativeApp short-circuits the binary-spawn
	 * path and opens an OpenUI iframe window (D-203-10). Legacy callers
	 * that omit it fall through to the existing NATIVE_<id> behaviour.
	 */
	wmClassHint?: string
}

export function NativeAppIcon({id, name, iconUrl, wmClassHint}: NativeAppIconProps) {
	const launch = useLaunchNativeApp()
	const utils = trpcReact.useUtils()
	const deleteMut = trpcReact.apps.native.delete.useMutation()

	const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

	const handleClick = () => {
		// Phase 157 round 5 — pass iconUrl so the spawned window chrome /
		// dock tile shows the right icon. Hook is fire-and-forget (returns
		// a Promise but failures surface via sonner inside the hook).
		// Phase 203-10 — also thread wmClassHint so the launcher can route
		// OpenUI apps to the iframe window instead of the binary-spawn path.
		void launch({id, name, iconUrl, wmClassHint})
	}

	const handleRemove = async () => {
		try {
			await deleteMut.mutateAsync({id})
			await utils.apps.native.list.invalidate()
		} finally {
			setShowRemoveConfirm(false)
		}
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger className='group'>
					<AppIcon
						label={name}
						src={iconUrl ?? ''}
						onClick={handleClick}
						state='ready'
					/>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem
						className={contextMenuClasses.item.rootDestructive}
						onSelect={() => setShowRemoveConfirm(true)}
					>
						Remove Native App
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {name}?</AlertDialogTitle>
						<AlertDialogDescription>
							The icon will be removed from the desktop. The native app itself
							stays installed on the system.
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
						<AlertDialogCancel disabled={deleteMut.isPending}>
							Cancel
						</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
