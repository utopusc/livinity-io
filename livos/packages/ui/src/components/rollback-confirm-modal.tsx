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
import {t} from '@/utils/i18n'

// Phase 311 UPDSAFE-04 — confirm dialog for the operator-triggered manual
// rollback to the last-good snapshot. Adapts UpdateConfirmModal's AlertDialog
// shape, but is a PURE presentational component: the mutation (`rollback`) and
// its pending flag are passed IN (the caller owns useRollback), unlike
// UpdateConfirmModal which reaches into useGlobalSystemState.
//
// The operator-locked "database schema is NOT reverted" warning is rendered
// UNCONDITIONALLY — there is no automated schema-revert mechanism (a code-only
// rollback cannot un-migrate Postgres; RESEARCH Q1 / Assumption A3), so the
// operator must always be told the rollback reverts code + deps + units only.
//
// While the mutation is pending, both the action and the cancel/dismiss path
// are disabled so the operator can neither double-fire nor hide the only signal
// the rollback is still running (mirrors UpdateConfirmModal's UX-02 guard).
export function RollbackConfirmModal({
	open,
	onOpenChange,
	target,
	rollback,
	rollbackPending,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: {tag?: string; shortSha?: string; snapshottedAt?: string} | null
	rollback: () => void
	rollbackPending: boolean
}) {
	const handleConfirm = () => {
		// Keep the modal open until the mutation resolves (system status takes
		// over) or errors (toast surfaces via useRollback.onError).
		rollback()
	}

	// Guard dismissal while the mutation is in flight.
	const handleOpenChange = (next: boolean) => {
		if (rollbackPending && !next) return
		onOpenChange(next)
	}

	// The rollback-target label from the 311-02 manifest (tag preferred, short
	// SHA as fallback). When neither is known (manifest absent/corrupt) fall back
	// to a generic localized phrase so the title never renders a placeholder.
	const versionLabel = target?.tag || target?.shortSha

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t('software-update.rollback.confirm.title', {
							name: versionLabel || t('software-update.rollback.confirm.generic-target'),
						})}
					</AlertDialogTitle>
					<AlertDialogDescription className='space-y-3'>
						<span className='block text-sm text-text-tertiary'>
							{t('software-update.rollback.confirm.body')}
						</span>
						{/* Operator-locked (UPDSAFE-04): no automated schema revert exists,
						    so this warning is shown unconditionally. */}
						<span className='block rounded-lg border border-accent-red/20 bg-accent-red/5 p-3 text-left text-xs text-accent-red'>
							{t('software-update.rollback.confirm.schema-warning')}
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={rollbackPending}>{t('cancel')}</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm} disabled={rollbackPending}>
						{rollbackPending
							? t('software-update.rollback.confirm.submitting')
							: t('software-update.rollback.confirm.submit')}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
