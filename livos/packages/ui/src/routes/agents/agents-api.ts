// Phase 85 (UI slice) — agents tRPC hook wrappers.
//
// Thin typed adapters over `trpcReact.agents.*` so the route components
// can stay declarative. Each hook is a one-liner around the underlying
// react-query primitive — the value here is centralizing query-key
// invalidation behavior + giving the editor a single import surface.
//
// All 8 procedures route via HTTP (see httpOnlyPaths in livinityd
// server/trpc/common.ts) so they survive WS reconnect mid-autosave.
//
// Type strategy: `RouterOutput['agents']['get']` derives the Agent shape
// directly from the tRPC AppRouter. Date fields round-trip as ISO strings
// over the wire (no superjson transformer installed — verified via
// trpc/trpc.ts). The local `Agent` alias re-exports that shape so route
// components don't have to import from `@trpc/server`.

import {trpcReact, type RouterOutput} from '@/trpc/trpc'

// ─── Types ─────────────────────────────────────────────────────────────

/** Agent row as returned by the agents.get/list tRPC procedures. */
export type Agent = RouterOutput['agents']['get']

/** Paginated list result returned by agents.list. */
export type AgentList = RouterOutput['agents']['list']

/** Discriminating union for the autosave status pill. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Query hooks ───────────────────────────────────────────────────────

/**
 * Paginated agents list. Defaults `includePublic: true` so the 5 v32
 * system seeds always appear in the grid.
 */
export function useAgents(input: {
	search?: string
	sort?: 'name' | 'created_at' | 'updated_at' | 'download_count'
	order?: 'asc' | 'desc'
	limit?: number
	offset?: number
	includePublic?: boolean
}) {
	return trpcReact.agents.list.useQuery(input)
}

/** Single agent fetcher. Pass `enabled: false` while id is unknown. */
export function useAgent(agentId: string | undefined) {
	return trpcReact.agents.get.useQuery(
		// agentId is non-null when enabled is true. The cast satisfies the
		// input schema (.uuid()) at the network layer.
		{agentId: (agentId ?? '') as string},
		{enabled: Boolean(agentId)},
	)
}

// ─── Mutation hooks ────────────────────────────────────────────────────
//
// All mutations invalidate `agents.list` on success so the grid stays
// fresh. `update`/`publish`/`unpublish` additionally update the `agents.get`
// cache for the affected id so the editor sees the new shape immediately
// without a re-fetch round-trip.

export function useCreateAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.create.useMutation({
		onSuccess: () => {
			void utils.agents.list.invalidate()
		},
	})
}

export function useUpdateAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.update.useMutation({
		onSuccess: (updated) => {
			// Refresh the per-id cache so the editor and any preview re-render.
			utils.agents.get.setData({agentId: updated.id}, updated)
			void utils.agents.list.invalidate()
		},
	})
}

export function useDeleteAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.delete.useMutation({
		onSuccess: () => {
			void utils.agents.list.invalidate()
		},
	})
}

export function usePublishAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.publish.useMutation({
		onSuccess: (updated) => {
			utils.agents.get.setData({agentId: updated.id}, updated)
			void utils.agents.list.invalidate()
		},
	})
}

export function useUnpublishAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.unpublish.useMutation({
		onSuccess: (updated) => {
			utils.agents.get.setData({agentId: updated.id}, updated)
			void utils.agents.list.invalidate()
		},
	})
}

export function useCloneAgent() {
	const utils = trpcReact.useUtils()
	return trpcReact.agents.clone.useMutation({
		onSuccess: () => {
			void utils.agents.list.invalidate()
		},
	})
}
