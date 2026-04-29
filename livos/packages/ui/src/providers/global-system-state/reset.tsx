import {trpcReact, type RouterError} from '@/trpc/trpc'

import type {PreserveApiKeyChoice} from '@/features/factory-reset/lib/types'
import {FactoryResetProgress} from '@/routes/factory-reset/_components/factory-reset-progress'

// Phase 38 Plan 01 — schema rewrite from {password: string} to
// {preserveApiKey: boolean}. The backend route was rewritten in Phase 37
// (D-BE-01); the v29.2 mutation accepts {preserveApiKey} and returns
// {accepted, eventPath, snapshotPath}.
//
// Phase 38 Plan 04 — ResettingCover swapped from the Plan 01 indeterminate
// stub to the real listUpdateHistory poller (FactoryResetProgress).

export function useReset({
	onMutate,
	onSuccess,
	onError,
}: {
	onMutate?: () => void
	onSuccess?: (didWork: boolean) => void
	onError?: (err: RouterError) => void
}) {
	const resetMut = trpcReact.system.factoryReset.useMutation({
		onMutate,
		// The mutation now returns {accepted: true, eventPath, snapshotPath}.
		// We treat any non-throw as "accepted" for the global-system-state cover.
		onSuccess: (_data) => onSuccess?.(true),
		onError,
	})

	const reset = (input: {preserveApiKey: PreserveApiKeyChoice}) =>
		resetMut.mutate({preserveApiKey: input.preserveApiKey})

	return reset
}

// Phase 38 Plan 04 — replaces the Plan 01 stub with the real listUpdateHistory
// poller + post-reset routing + error/recovery fan-out.
export function ResettingCover() {
	return <FactoryResetProgress />
}
