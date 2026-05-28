/**
 * Phase 243-03 — Persistent UI Terminal feature flag (default OFF).
 *
 * Inverse default of `useV42MigrationActive`: this hook returns `false`
 * while the tRPC query is loading or errored so the operator never briefly
 * sees the new persistent-terminal surfaces during pre-fetch. Only the
 * literal Redis value `'true'` opens the gate, mirroring the server-side
 * `livos/packages/livinityd/source/modules/pty-sessions/feature-flag.ts`
 * `isTerminalPanelEnabled` and `server/trpc/config-router.ts`
 * `getTerminalPanelEnabled` contracts (L-243-D).
 *
 * Operator opt-in:
 *
 *     redis-cli SET livos:v43:terminal_panel true
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — this
 * hook is UI-only.
 */
import {trpcReact} from '@/trpc/trpc'

export function useTerminalPanelEnabled(): boolean {
	const q = trpcReact.config.getTerminalPanelEnabled.useQuery(undefined, {
		// Snappy: the flag rarely changes. Cache for the session, refetch on
		// window focus so the operator can flip the Redis key and see the UI
		// update by alt-tab without a hard reload (mirrors the v42 hook).
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	})
	// Default OFF: loading/error → false (L-243-D safety).
	if (q.isLoading || q.isError) return false
	return q.data?.enabled === true
}
