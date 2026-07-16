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

	const {mutateAsync: forceSyncOverride, isPending: isForcingSync} =
		trpcReact.storagePool.forceSyncOverride.useMutation({onError, onSettled: invalidate})

	// POOL-04 (318-09): guarded single-disk format for NON-pool internal drives.
	// The server (318-05/318-06) triple-gates this AND hard-refuses any device with
	// an in-flight replacement runbook — the UI mirrors that guard (T-318-18).
	const {mutateAsync: formatInternalDevice, isPending: isFormattingInternal} =
		trpcReact.storagePool.formatInternalDevice.useMutation({onError, onSettled: invalidate})

	// ── Replacement runbook (D-11 / POOL-03) — driven ONE step at a time by the
	// wizard's re-entry mode; each mutation persists `storagePool.runbookStep` so a
	// reload resumes. `replaceCheck` returns `hardStop` — the "do NOT proceed to
	// sync" signal (Trap 12); the UI NEVER auto-chains fix → sync.
	const {mutateAsync: replaceDetect, isPending: isDetecting} = trpcReact.storagePool.replaceDetect.useMutation({
		onError,
		onSettled: invalidate,
	})
	const {mutateAsync: replaceFormat, isPending: isReplaceFormatting} = trpcReact.storagePool.replaceFormat.useMutation(
		{onError, onSettled: invalidate},
	)
	const {mutateAsync: replaceMount, isPending: isReplaceMounting} = trpcReact.storagePool.replaceMount.useMutation({
		onError,
		onSettled: invalidate,
	})
	const {mutateAsync: replaceFix, isPending: isReplaceFixing} = trpcReact.storagePool.replaceFix.useMutation({
		onError,
		onSettled: invalidate,
	})
	const {mutateAsync: replaceCheck, isPending: isReplaceChecking} = trpcReact.storagePool.replaceCheck.useMutation({
		onError,
		onSettled: invalidate,
	})
	const {mutateAsync: replaceSync, isPending: isReplaceSyncing} = trpcReact.storagePool.replaceSync.useMutation({
		onError,
		onSettled: invalidate,
	})
	const {mutateAsync: replaceClear, isPending: isReplaceClearing} = trpcReact.storagePool.replaceClear.useMutation({
		onError,
		onSettled: invalidate,
	})

	return {
		status,
		pool: status?.pool ?? null,
		isWsl2: status?.isWsl2 ?? false,
		// Set while a D-11 replacement runbook is mid-flight (blocks competing formats).
		runbookStep: status?.pool?.runbookStep ?? null,
		eligibleDrives,
		isLoadingStatus,
		isLoadingEligible,
		createPool,
		isCreatingPool,
		addDisk,
		isAddingDisk,
		syncNow,
		isSyncing,
		forceSyncOverride,
		isForcingSync,
		formatInternalDevice,
		isFormattingInternal,
		// Replacement runbook steps + their in-flight flags.
		replaceDetect,
		isDetecting,
		replaceFormat,
		isReplaceFormatting,
		replaceMount,
		isReplaceMounting,
		replaceFix,
		isReplaceFixing,
		replaceCheck,
		isReplaceChecking,
		replaceSync,
		isReplaceSyncing,
		replaceClear,
		isReplaceClearing,
	}
}
