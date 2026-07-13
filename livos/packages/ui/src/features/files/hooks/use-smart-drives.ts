import {keepPreviousData} from '@tanstack/react-query'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import type {RouterError} from '@/trpc/trpc'

/**
 * Hook to read per-drive SMART health (Phase 313 SMART-01 / SMART-04).
 *
 * A NEW hook — deliberately NOT an extension of useExternalStorage, whose
 * underlying tRPC procedure is scoped to the USB-only external-devices path.
 * SMART covers every block device (internal SATA/NVMe + USB), read via
 * monitoring.diskHealth.list. SMART data changes far more slowly than USB
 * plug/unplug events, so we poll at 60s rather than the USB hook's 5s.
 *
 * runSelfTest is admin-gated at the tRPC boundary (adminProcedure); the caller
 * (DriveHealthBlock) also hides the trigger for non-admins.
 */
export function useSmartDrives() {
	const utils = trpcReact.useUtils()

	const {data: drives, isLoading} = trpcReact.monitoring.diskHealth.list.useQuery(undefined, {
		placeholderData: keepPreviousData,
		refetchInterval: 60_000, // SMART changes slowly — 60s (unlike USB plug events)
		staleTime: 0,
	})

	const {mutateAsync: runSelfTest, isPending: isSelfTesting} = trpcReact.monitoring.diskHealth.runSelfTest.useMutation({
		onError: (error: RouterError) => {
			toast.error(error.message)
		},
		onSettled: () => {
			// Re-read so selfTestInProgress / lastSelfTest reflect the trigger.
			utils.monitoring.diskHealth.list.invalidate()
		},
	})

	return {drives, isLoading, runSelfTest, isSelfTesting}
}
