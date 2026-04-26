import {useGlobalSystemState} from '@/providers/global-system-state'
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

// Phase 30 hot-patch round 6: shared confirm modal for "Install update".
// Used by both <UpdateNotification /> (desktop bottom-right card) and the
// Settings > Software Update list row "View" button. Replaces the
// route-based /settings/software-update/confirm dialog so the user is
// never bounced into Settings just to confirm an install.
//
// v29.0 UX-02: while the update mutation is pending, both the action button
// and the cancel/dismiss path are disabled. This prevents (a) double-fire on
// rapid re-clicks while the trpc round-trip is in flight, and (b) the user
// closing the modal mid-mutation, which previously left them with no UI
// signal that anything was happening (BACKLOG 999.6 silent-fail surface).
export function UpdateConfirmModal({
	open,
	onOpenChange,
	latestVersion,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	latestVersion: {
		version?: string
		shortSha: string
		message: string
	} | null
}) {
	const {update, updatePending} = useGlobalSystemState()

	const handleConfirm = () => {
		// Don't close yet — keep modal open until the mutation either resolves
		// (UpdatingCover takes over via system status) or errors (toast surfaces
		// via useUpdate.onError; modal closes via onOpenChange below).
		update()
	}

	// Guard dismissal while the mutation is in flight so the user can't
	// accidentally hide the only signal the modal is still doing something.
	const handleOpenChange = (next: boolean) => {
		if (updatePending && !next) return
		onOpenChange(next)
	}

	const versionLabel = latestVersion?.version || latestVersion?.shortSha

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{versionLabel ? `Update to ${versionLabel}?` : 'Install update?'}
					</AlertDialogTitle>
					<AlertDialogDescription className='space-y-3'>
						{latestVersion?.message && (
							<span className='block text-sm text-zinc-700'>
								{latestVersion.message.split('\n')[0].slice(0, 200)}
							</span>
						)}
						<span className='block text-sm text-zinc-500'>
							This will rebuild Livinity from the latest source and restart services. The
							process takes 2–4 minutes; your session is preserved (no reboot).
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={updatePending}>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm} disabled={updatePending}>
						{updatePending ? 'Starting update…' : 'Install Update'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
