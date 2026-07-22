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
 *
 * `wantDisk` (default FALSE) is an explicit opt-in for the disk du (W-01): the
 * disk query is AND-gated on it, so the compact row and a CLOSED Settings dialog
 * never pay a du shell-out. Only the OPEN dialog passes `wantDisk` truthy. Without
 * this gate a mounted-but-closed dialog fired one du per running VM on list load,
 * defeating the deliberate "keep du off the hot path" contract this hook documents.
 */
export function useVmStats(vmId: string | null, running: boolean, wantDisk = false) {
	const enabled = vmId !== null && running
	const statsQuery = trpcReact.vm.stats.useQuery({id: vmId!}, {enabled, retry: false, refetchInterval: 3000})
	// Disk: fetched once on open, NOT polled (no poll interval), and only when the
	// consumer opts in via wantDisk (W-01). refetchDisk lets a consumer refresh it
	// on demand (e.g. after an Apply) without a 3s du treadmill.
	const diskQuery = trpcReact.vm.diskUsage.useQuery({id: vmId!}, {enabled: enabled && wantDisk, retry: false})
	return {
		stats: statsQuery.data ?? null,
		disk: diskQuery.data ?? null,
		loading: (statsQuery.isLoading || diskQuery.isLoading) && enabled,
		refetchDisk: diskQuery.refetch,
	}
}
