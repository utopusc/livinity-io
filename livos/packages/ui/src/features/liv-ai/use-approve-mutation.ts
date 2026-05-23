/**
 * Phase 198-04 — Approve / Reject mutation wrapper.
 *
 * Wraps the existing Phase 197-05 mastra.agent.approve tRPC mutation
 * (adminProcedure). Returns {approve, reject} callbacks that the
 * ApprovalCard component invokes on button click.
 *
 * Backend contract (P197-05 createMastraRouter):
 *   .input({toolCallId: z.string(), approved: z.boolean()})
 *   .mutation(({input}) => approvalManager.resolve(input.toolCallId, input.approved))
 *
 * Reject (approved=false) → wrapped tool returns REJECTED_TOOL_RESULT
 *   sentinel (W-02 lock, P197-04). The agent continuation explains the
 *   rejection naturally; no run-abort.
 *
 * The `as any` escape hatch around trpcReact mirrors the rest of the UI
 * codebase's approach to optional mastra.* paths — at TypeScript layer
 * the mastra namespace is generated through the inferred AppRouter, but
 * older tRPC type-helper drift across versions makes the typed access
 * path brittle. Runtime call shape is verified by use-approve-mutation
 * unit tests + integration tests in tool-renderers.test.tsx (Task 3).
 */

import {useCallback} from 'react'

import {trpcReact} from '@/trpc/trpc'

export interface UseApproveMutationResult {
	approve: (toolCallId: string) => void
	reject: (toolCallId: string) => void
	isPending: boolean
}

export function useApproveMutation(): UseApproveMutationResult {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trpcAny = trpcReact as any
	const mutation = trpcAny.mastra?.agent?.approve?.useMutation?.()

	const approve = useCallback(
		(toolCallId: string) => {
			mutation?.mutate?.({toolCallId, approved: true})
		},
		[mutation],
	)
	const reject = useCallback(
		(toolCallId: string) => {
			mutation?.mutate?.({toolCallId, approved: false})
		},
		[mutation],
	)

	return {
		approve,
		reject,
		isPending: mutation?.isPending ?? false,
	}
}
