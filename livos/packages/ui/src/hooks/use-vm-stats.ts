import {trpcReact} from '@/trpc/trpc'

/**
 * Phase 362 (VMSTATS-01): live per-VM usage for a mounted surface.
 *
 * Mirrors use-container-detail's 3s poll — but STRICTER: `enabled` requires BOTH
 * the surface being open (vmId non-null) AND the VM being running, so a stopped
 * VM is never polled (CONTEXT locked). CPU/RAM poll every 3s; DISK is fetched
 * ONCE on open (no poll interval) — a du shell-out causes CPU spikes, so it
 * stays off the hot path (live-usage-popover disk-not-polled precedent). Kept
 * decoupled from any dialog so 363 (the compact VM-row readout) can reuse it.
 */
export function useVmStats(vmId: string | null, running: boolean) {
	const enabled = vmId !== null && running
	const statsQuery = trpcReact.vm.stats.useQuery({id: vmId!}, {enabled, retry: false, refetchInterval: 3000})
	// Disk: fetched once on open, NOT polled (no poll interval). refetchDisk lets a
	// consumer refresh it on demand (e.g. after an Apply) without a 3s du treadmill.
	const diskQuery = trpcReact.vm.diskUsage.useQuery({id: vmId!}, {enabled, retry: false})
	return {
		stats: statsQuery.data ?? null,
		disk: diskQuery.data ?? null,
		loading: (statsQuery.isLoading || diskQuery.isLoading) && enabled,
		refetchDisk: diskQuery.refetch,
	}
}
