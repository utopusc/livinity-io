/**
 * Phase 224 — Liv Assistant migration feature flag.
 *
 * Returns `true` when the legacy AI surfaces (App Store `ai` category,
 * Settings → MCP Servers + AI Chat Settings entries) should be HIDDEN.
 * Defaults to `true` (migration-mode active) while the query is loading
 * so the operator never briefly sees the about-to-be-hidden surfaces
 * flash before being filtered out (D-V42-ROLLBACK reversibility:
 * flipping the Redis key `liv:config:liv_v42_migration_active` to the
 * literal string "false" restores pre-Phase-224 visibility live, no
 * server restart).
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — this
 * hook is UI-only.
 */
import {trpcReact} from '@/trpc/trpc'

export function useV42MigrationActive(): boolean {
	const q = trpcReact.config.getV42MigrationActive.useQuery(undefined, {
		// Snappy: the flag rarely changes. Cache for the session, refetch on
		// window focus so the operator can flip the Redis key and see the UI
		// update by alt-tab without a hard reload.
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	})
	// Loading default = true (hide first, reveal on confirmation it's off)
	if (q.isLoading || q.isError) return true
	return q.data?.active ?? true
}
