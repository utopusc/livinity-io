import {BarePage} from '@/layouts/bare/bare-page'
import {ProgressLayout} from '@/modules/bare/progress-layout'
import {trpcReact, type RouterError} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import type {PreserveApiKeyChoice} from '@/features/factory-reset/lib/types'

// Phase 38 Plan 01 — schema rewrite from {password: string} to
// {preserveApiKey: boolean}. The backend route was rewritten in Phase 37
// (D-BE-01); the v29.2 mutation accepts {preserveApiKey} and returns
// {accepted, eventPath, snapshotPath}. Plan 03 wires a real new modal flow;
// for Plan 01 we just un-break the type system.

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

// Plan 01 STUB — indeterminate progress overlay while the bash detaches and
// starts writing the JSON event row. Plan 04 replaces this with a real polling
// overlay (`listUpdateHistory` + state machine + 90s consecutive-failure
// reconnect handling). For Plan 01 it just keeps the legacy 'resetting' branch
// of GlobalSystemStateProvider compiling and visually intact.
export function ResettingCover() {
	return (
		<BarePage>
			<ProgressLayout
				title={t('factory-reset')}
				callout={t('factory-reset.resetting.dont-turn-off-device')}
				progress={undefined}
				message={'Reinstalling LivOS…'}
				isRunning={true}
			/>
		</BarePage>
	)
}
