import {useEffect, useState} from 'react'

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
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {t} from '@/utils/i18n'

// Phase 311 UPDSAFE-04 — confirm dialog for the operator-triggered manual
// rollback to the last-good snapshot. Adapts UpdateConfirmModal's AlertDialog
// shape, but is a PURE presentational component: the mutation (`rollback`) and
// its pending flag are passed IN (the caller owns useRollback), unlike
// UpdateConfirmModal which reaches into useGlobalSystemState.
//
// Phase 348 (ABUPD-02): when the last-good snapshot carries a DB dump
// (canRollback.dbSnapshot), an OPT-IN checkbox offers restoring the database
// too. The warning copy is mutually exclusive and always honest:
//   • unchecked (or no dump) → the operator-locked "schema is NOT reverted"
//     warning (a code-only rollback cannot un-migrate Postgres);
//   • checked → the data-loss warning (everything written since the update is
//     permanently lost; the restore is all-or-nothing).
// The checkbox resets to unchecked every time the modal opens — a destructive
// opt-in must never be sticky across openings.
//
// While the mutation is pending, both the action and the cancel/dismiss path
// are disabled so the operator can neither double-fire nor hide the only signal
// the rollback is still running (mirrors UpdateConfirmModal's UX-02 guard).
export function RollbackConfirmModal({
	open,
	onOpenChange,
	target,
	dbSnapshotAvailable,
	rollback,
	rollbackPending,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: {tag?: string; shortSha?: string; snapshottedAt?: string} | null
	dbSnapshotAvailable: boolean
	rollback: (opts: {withDb: boolean}) => void
	rollbackPending: boolean
}) {
	const [withDb, setWithDb] = useState(false)

	// Reset the destructive opt-in on every open (never sticky).
	useEffect(() => {
		if (open) setWithDb(false)
	}, [open])

	const handleConfirm = () => {
		// Keep the modal open until the mutation resolves (system status takes
		// over) or errors (toast surfaces via useRollback.onError).
		rollback({withDb: dbSnapshotAvailable && withDb})
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
						{dbSnapshotAvailable && (
							<span className='flex items-start gap-2 text-left'>
								<Checkbox
									id='rollback-with-db'
									checked={withDb}
									onCheckedChange={(checked) => setWithDb(!!checked)}
									disabled={rollbackPending}
									className='mt-0.5 h-4 w-4 rounded-4'
								/>
								<label htmlFor='rollback-with-db' className='cursor-pointer text-xs text-text-secondary'>
									{t('software-update.rollback.confirm.db-checkbox')}
								</label>
							</span>
						)}
						{dbSnapshotAvailable && withDb ? (
							/* 348: explicit data-loss warning while the DB restore is opted in. */
							<span className='block rounded-lg border border-accent-red/20 bg-accent-red/5 p-3 text-left text-xs text-accent-red'>
								{t('software-update.rollback.confirm.db-warning')}
							</span>
						) : (
							/* Operator-locked (UPDSAFE-04): no automated schema revert happens
							   on a code-only rollback, so this warning is shown whenever the
							   DB restore is not opted in. */
							<span className='block rounded-lg border border-accent-red/20 bg-accent-red/5 p-3 text-left text-xs text-accent-red'>
								{t('software-update.rollback.confirm.schema-warning')}
							</span>
						)}
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
