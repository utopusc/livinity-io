// Phase 86 V32-MKT — typed tRPC client hooks for the public marketplace.
//
// Centralizes the marketplace.* tRPC surface so the route + card + filter
// component all consume the same shape. Thin wrappers — they exist for
// discoverability and future-proofing (one place to add cache invalidation
// or default options across all marketplace consumers).
//
// All three procedures route via HTTP per D-PROCEDURE-HTTP (registered in
// `livinityd/source/modules/server/trpc/common.ts` httpOnlyPaths) — the
// split-link in `trpc/trpc.ts` will pick the HTTP transport regardless of
// auth state.

import {trpcReact, type RouterInput, type RouterOutput} from '@/trpc/trpc'

// ─── Types ──────────────────────────────────────────────────────────────

export type MarketplaceListInput = NonNullable<RouterInput['marketplace']['list']>
export type MarketplaceListOutput = RouterOutput['marketplace']['list']
export type MarketplaceAgent = MarketplaceListOutput['rows'][number]

export type MarketplaceSort = NonNullable<MarketplaceListInput['sort']>

export const SORT_OPTIONS: Array<{value: MarketplaceSort; label: string}> = [
	{value: 'newest', label: 'Newest First'},
	{value: 'popular', label: 'Most Popular'},
	{value: 'most_downloaded', label: 'Most Downloaded'},
]

// ─── Hooks ──────────────────────────────────────────────────────────────

/**
 * List marketplace agents with optional search/sort/tag filters and
 * paged limit/offset. Public — no auth required.
 *
 * Caller is expected to memoize the input object, otherwise every render
 * triggers a new query key. Filter changes RESET offset to 0 in the parent
 * (route component owns that state machine).
 */
export function useMarketplaceList(input: MarketplaceListInput) {
	return trpcReact.marketplace.list.useQuery(input, {
		// Keep previously-loaded data on the screen during a refetch (better
		// UX during search debounce / sort / tag changes — avoids the empty-
		// flash between filter change and new rows arrival).
		keepPreviousData: true,
	})
}

/**
 * List the distinct set of tag strings across public agents. Drives the
 * chip-strip filter. Public — no auth required.
 *
 * Cached for 5 min server-side is BACKLOG (the query is cheap; client
 * react-query staleTime keeps the chip strip stable across nav).
 */
export function useMarketplaceTags() {
	return trpcReact.marketplace.tags.useQuery(undefined, {
		// Tags rarely change — keep the data fresh for 5 minutes between
		// implicit refetches. Manual invalidation happens on cloneToLibrary
		// success via utils.marketplace.tags.invalidate() (caller's job).
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * Mutation hook for "Add to Library". Wraps marketplace.cloneToLibrary.
 * Caller is expected to handle onSuccess/onError (toast + optimistic UI
 * update) — this hook intentionally does NOT bake in side effects so each
 * call site can compose its own UX.
 */
export function useCloneToLibrary() {
	return trpcReact.marketplace.cloneToLibrary.useMutation()
}
