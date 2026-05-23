/**
 * Phase 201-03 — Approve / Reject mutation wrapper (Next.js subapp port).
 *
 * Ports the Phase 198-04 hook from livos/packages/ui/src/features/liv-ai/
 * but DROPS the tRPC React client dependency (the Next.js subapp has no
 * tRPC client — only HTTP-fetches livinityd per D-201-18).
 *
 * Transport: native fetch to the parent livinityd at the mastra approve
 * mutation route (tRPC batch shape).
 *   credentials: 'include'   (JWT cookie auto-flows — same-origin iframe)
 *   body: { "0": { json: { toolCallId, approved } } }   (tRPC v10 batch shape)
 *
 * Public API is UNCHANGED from the source hook (D-201-20 — generative
 * renderers frozen): { approve, reject, isPending } so tool-renderers.tsx
 * imports stay verbatim.
 *
 * Backend contract (P197-05 createMastraRouter, unchanged per INV-201-08):
 *   .input({toolCallId: z.string(), approved: z.boolean()})
 *   .mutation(({input}) => approvalManager.resolve(input.toolCallId, input.approved))
 *
 * Reject (approved=false) → wrapped tool returns REJECTED_TOOL_RESULT
 *   sentinel (W-02 lock, P197-04 — INV-201-04). The agent continuation
 *   explains the rejection naturally; no run-abort.
 */

'use client'

import {useCallback, useState} from 'react'

export interface UseApproveMutationResult {
	approve: (toolCallId: string) => void
	reject: (toolCallId: string) => void
	isPending: boolean
}

async function postApprove(input: {toolCallId: string; approved: boolean}): Promise<void> {
	const res = await fetch('/trpc/mastra.agent.approve?batch=1', {
		method: 'POST',
		credentials: 'include',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({'0': {json: input}}),
	})
	if (!res.ok) {
		throw new Error(`approve mutation failed: HTTP ${res.status}`)
	}
}

export function useApproveMutation(): UseApproveMutationResult {
	const [isPending, setIsPending] = useState(false)

	const fire = useCallback((input: {toolCallId: string; approved: boolean}) => {
		setIsPending(true)
		postApprove(input)
			.catch(() => {
				// Swallow — the suspended ApprovalManager Promise will time
				// out backend-side and the agent will surface the failure.
				// No toast surface in the iframe; logged via fetch's own
				// network panel.
			})
			.finally(() => setIsPending(false))
	}, [])

	const approve = useCallback(
		(toolCallId: string) => {
			fire({toolCallId, approved: true})
		},
		[fire],
	)
	const reject = useCallback(
		(toolCallId: string) => {
			fire({toolCallId, approved: false})
		},
		[fire],
	)

	return {approve, reject, isPending}
}
