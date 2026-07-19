import {toast} from '@/components/ui/toast'
import {trpcReact} from '@/trpc/trpc'

// Phase 311 UPDSAFE-04 — mutation wiring for the operator-triggered manual
// rollback. Mirrors useUpdate (global-system-state/update.tsx): fire the
// mutation, refetch/invalidate the deploy-history surfaces on success, and
// surface a classified toast on error.
//
// describeRollbackError adapts describeUpdateError's prefix-matching (the same
// unauthorized / forbidden / econnreset / enospc branches) with rollback-
// appropriate copy, plus a CONFLICT branch for the concurrent-update guard and a
// no-snapshot branch (the 311-02 script exit-2 / performRollback message). Falls
// back to the raw message so unknown failures still reach the operator.
function describeRollbackError(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error')
	const lower = raw.toLowerCase()
	if (lower.includes('conflict') || lower.includes('already in progress')) {
		return 'An update or rollback is already in progress. Wait for it to finish, then retry.'
	}
	if (lower.includes('unauthorized') || lower.includes('invalid token') || lower.includes('missing token')) {
		return 'Session expired — refresh the page and log in again, then retry the rollback.'
	}
	if (lower.includes('forbidden')) {
		return 'Only an admin can roll the system back. Switch to an admin account and retry.'
	}
	if (lower.includes('socket hang up') || lower.includes('econnreset') || lower.includes('econnrefused')) {
		return 'Lost connection to LivOS while starting the rollback. Refresh the page and retry.'
	}
	if (lower.includes('enospc') || lower.includes('no space')) {
		return 'Server is out of disk space to complete the rollback. Free up a few GB on /opt/livos and retry.'
	}
	if (lower.includes('no last-good') || lower.includes('no snapshot')) {
		return 'No last-good snapshot exists to roll back to on this box.'
	}
	return raw.slice(0, 240) // cap so the toast stays readable
}

export function useRollback({
	onMutate,
	onSuccess,
	onError,
}: {
	onMutate?: () => void
	onSuccess?: (didWork: boolean) => void
	onError?: (err: unknown) => void
}) {
	const utils = trpcReact.useUtils()
	const rollbackMut = trpcReact.system.rollbackToPrevious.useMutation({
		onMutate,
		onSuccess: async (didWork) => {
			// Refresh the deploy-history surfaces so the new `rolled-back` history
			// entry + the reverted current-version pill appear immediately, and
			// re-evaluate canRollback (the snapshot may have changed).
			await utils.system.checkUpdate.refetch()
			await utils.system.listUpdateHistory.invalidate()
			await utils.system.canRollback.invalidate()
			onSuccess?.(didWork)
		},
		// Surface mutation failures so the operator is never left staring at an
		// unchanged UI wondering whether the rollback did anything.
		onError: (err) => {
			toast.error(describeRollbackError(err))
			onError?.(err)
		},
	})

	return {
		// Phase 348 (ABUPD-02): optional opt-in DB restore. No-arg / withDb=false
		// callers send NO input (undefined) so the pre-348 wire shape is
		// byte-identical; only an explicit true sends {withDb: true}.
		rollback: (opts?: {withDb?: boolean}) => rollbackMut.mutate(opts?.withDb === true ? {withDb: true} : undefined),
		isPending: rollbackMut.isPending,
		error: rollbackMut.error,
	}
}
