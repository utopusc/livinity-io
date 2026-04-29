// Phase 38 Plan 04 — D-RT-01 post-reset redirect decision.
//
//   status: success + preserveApiKey: true   → /login
//   status: success + preserveApiKey: false  → /onboarding
//   anything else                            → 'stay' (overlay/error/recovery
//                                              page handles it)
//
// Pure / testable. Plan 04's overlay calls this once per refetch and triggers
// `window.location.href = ${route}` (a hard navigation to clear all in-memory
// state including auth tokens and cached queries) when the result is not
// 'stay'.

import type {FactoryResetEvent} from './types'

export type PostResetRoute = '/login' | '/onboarding' | 'stay'

export function selectPostResetRoute(event: FactoryResetEvent | null): PostResetRoute {
	if (!event) return 'stay'
	if (event.status !== 'success') return 'stay'
	return event.preserveApiKey ? '/login' : '/onboarding'
}
