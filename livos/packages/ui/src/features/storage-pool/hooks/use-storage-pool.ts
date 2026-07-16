import {keepPreviousData} from '@tanstack/react-query'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import type {RouterError} from '@/trpc/trpc'

/**
 * Hook for the multi-drive pooling surface (Phase 318 POOL-02).
 *
 * Wraps the `storagePool.*` tRPC namespace (mounted 318-06) — deliberately a
 * NEW hook, cloning the shape of `use-smart-drives.ts`: two read queries with
 * `keepPreviousData` + a slow poll, and mutations that invalidate the read
 * queries `onSettled` so the wizard/status card reflect the new pool state.
 *
 * Read queries (`poolStatus` / `listEligibleDrives`) sit on the server's
 * public-when-no-user read gate; the mutations are `adminProcedure`-gated at
 * the tRPC boundary and re-validate every device server-side — this hook is a
 * convenience surface only, never the authority (T-318-16).
 *
 * Pool state changes slowly (a pool is built once, synced nightly), so we poll
 * at 30s rather than the USB hook's 5s.
 */
export function useStoragePool() {
	const utils = trpcReact.useUtils()

	// Persisted pool state + the isWsl2 hard-hide flag (D-14) + a live status
	// snapshot for protected pools. The whole pooling UI hides when isWsl2.
	const {data: status, isLoading: isLoadingStatus} = trpcReact.storagePool.poolStatus.useQuery(undefined, {
		placeholderData: keepPreviousData,
		refetchInterval: 30_000,
		staleTime: 0,
	})

	// The server-filtered set of internal, non-removable, non-system drives the
	// wizard may offer. OS/USB drives are already excluded server-side (318-03).
	const {data: eligibleDrives, isLoading: isLoadingEligible} = trpcReact.storagePool.listEligibleDrives.useQuery(
		undefined,
		{
			placeholderData: keepPreviousData,
			refetchInterval: 30_000,
			staleTime: 0,
		},
	)

	const invalidate = () => {
		utils.storagePool.poolStatus.invalidate()
		utils.storagePool.listEligibleDrives.invalidate()
	}

	const onError = (error: RouterError) => {
		toast.error(error.message)
	}

	const {mutateAsync: createPool, isPending: isCreatingPool} = trpcReact.storagePool.createPool.useMutation({
		onError,
		onSettled: invalidate,
	})

	const {mutateAsync: addDisk, isPending: isAddingDisk} = trpcReact.storagePool.addDisk.useMutation({
		onError,
		onSettled: invalidate,
	})

	const {mutateAsync: syncNow, isPending: isSyncing} = trpcReact.storagePool.syncNow.useMutation({
		onError,
		onSettled: invalidate,
	})

	return {
		status,
		pool: status?.pool ?? null,
		isWsl2: status?.isWsl2 ?? false,
		eligibleDrives,
		isLoadingStatus,
		isLoadingEligible,
		createPool,
		isCreatingPool,
		addDisk,
		isAddingDisk,
		syncNow,
		isSyncing,
	}
}
