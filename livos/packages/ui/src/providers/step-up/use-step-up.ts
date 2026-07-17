/**
 * Phase 334 (STEPUP-01) — useStepUp(): run a sensitive mutation, transparently
 * satisfying the server's step-up gate.
 *
 *   const {withStepUp} = useStepUp()
 *   await withStepUp(() => deleteMut.mutateAsync({userId}))
 *
 * First attempt runs as-is (a still-valid 5-min grant just works). On the
 * STEP_UP_REQUIRED denial the provider dialog opens; once the user re-verifies
 * (grant cookie minted) the SAME action is retried exactly once. Dismissing the
 * dialog rejects with StepUpCancelledError — call sites treat that as a silent
 * no-op (the user changed their mind). Every other error propagates untouched.
 *
 * NOTE for call sites using useMutation onError toasts: the FIRST attempt's
 * STEP_UP_REQUIRED rejection still fires the mutation's onError — filter it
 * with isStepUpRequired(error) so the user never sees the internal denial.
 */
import {useCallback} from 'react'

import {isStepUpRequired, useStepUpContext} from './step-up-provider'

export function useStepUp() {
	const {requestStepUp} = useStepUpContext()

	const withStepUp = useCallback(
		async <T>(action: () => Promise<T>): Promise<T> => {
			try {
				return await action()
			} catch (error) {
				if (!isStepUpRequired(error)) throw error
				// Rejects with StepUpCancelledError on dismiss — propagates to the caller.
				await requestStepUp()
				return await action()
			}
		},
		[requestStepUp],
	)

	return {withStepUp}
}
