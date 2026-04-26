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
	const {update} = useGlobalSystemState()

	const handleConfirm = () => {
		onOpenChange(false)
		update()
	}

	const versionLabel = latestVersion?.version || latestVersion?.shortSha

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
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
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm}>Install Update</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
