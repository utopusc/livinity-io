/**
 * Phase 198-04 — Approval Card for HITL destructive tool calls.
 *
 * Renders inline in the assistant-ui message stream (NOT a floating
 * modal — assistant-ui/mastra-hitl reference pattern). Approve/Reject
 * buttons fire useApproveMutation → trpc.mastra.agent.approve from
 * Phase 197-05, which resolves the suspended ApprovalManager Promise.
 *
 * Threat mitigations:
 *   T-198-04-01 — Reject autoFocus on mount; Enter key intercepted via
 *     onKeyDown e.preventDefault. Operator must reach for Approve.
 *   T-198-04-02 — args scrubbed via redactArgsForDisplay before any
 *     JSON.stringify display. Test 'C' regression-locks the contract.
 *   T-197-06-02 carry-over — ZERO raw HTML injection. Only React text
 *     interpolation. Tool args / tool names are escaped automatically
 *     by React when rendered as children — no innerHTML escape hatch.
 *
 * Behavioural truth — D-NO-NEW-DEPS: this component only uses the
 * already-installed react primitives + the preserved redact-args
 * helper. No new shadcn / radix / framer dependencies are introduced.
 */

import {useCallback, type KeyboardEvent} from 'react'

import {redactArgsForDisplay} from '@/features/liv-ai/redact-args'

export interface ApprovalCardProps {
	/** Destructive tool name (one of the 6 from P197-02 N-01 lock). */
	toolName: string
	/** Raw tool args object. Passed through redactArgsForDisplay before display. */
	args: unknown
	/** Stable tool-call ID — passed back to onApprove / onReject and used in data-testid. */
	toolCallId: string
	/** Called with toolCallId when the operator clicks Approve. */
	onApprove(toolCallId: string): void
	/** Called with toolCallId when the operator clicks Reject. */
	onReject(toolCallId: string): void
	/** When true, both buttons are visually disabled (e.g. while a mutation is in-flight). */
	disabled?: boolean
}

export function ApprovalCard({
	toolName,
	args,
	toolCallId,
	onApprove,
	onReject,
	disabled,
}: ApprovalCardProps): JSX.Element {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			// T-198-04-01 — Enter MUST NOT auto-submit Approve. Reject
			// has autoFocus by default; a bare Enter on the focused button
			// would fire the button's onClick. Intercepting at the region
			// level keeps the keystroke from triggering either action when
			// focus drifts (e.g. tab-key cycles through the args <pre>).
			if (e.key === 'Enter') {
				e.preventDefault()
			}
			// Defensive UX — Escape collapses to Reject (safe default).
			if (e.key === 'Escape') {
				onReject(toolCallId)
			}
		},
		[onReject, toolCallId],
	)

	// T-198-04-02 — scrub credential-looking fields before display.
	const redactedArgs = redactArgsForDisplay(args)

	return (
		<div
			role='region'
			aria-label={`Approval required for tool ${toolName}`}
			onKeyDown={handleKeyDown}
			className='my-2 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 shadow-sm'
			data-testid={`liv-ai-approval-card-${toolCallId}`}
		>
			<div className='mb-3 flex items-start gap-2'>
				<span className='text-2xl' aria-hidden='true'>
					{'⚠'}
				</span>
				<div className='flex-1'>
					<h3 className='font-semibold text-amber-900 dark:text-amber-100'>
						Approval required
					</h3>
					<p className='text-sm text-amber-800 dark:text-amber-200'>
						Liv AI wants to run a destructive tool:
					</p>
					<code className='mt-1 inline-block break-all rounded bg-amber-100 px-2 py-0.5 font-mono text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100'>
						{toolName}
					</code>
				</div>
			</div>
			<pre className='mb-3 max-h-40 overflow-auto rounded bg-white p-2 text-xs dark:bg-neutral-900'>
				{JSON.stringify(redactedArgs, null, 2)}
			</pre>
			<div className='flex justify-end gap-2'>
				{/*
				 * T-198-04-01 mitigation: Reject autoFocus on mount. Operator
				 * has to deliberately reach for Approve. Stops accidental
				 * approvals from a stray Enter / Space keystroke right when
				 * the card mounts.
				 */}
				<button
					type='button'
					autoFocus
					disabled={disabled}
					onClick={() => onReject(toolCallId)}
					data-testid={`liv-ai-reject-${toolCallId}`}
					className='rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800'
				>
					Reject
				</button>
				<button
					type='button'
					disabled={disabled}
					onClick={() => onApprove(toolCallId)}
					data-testid={`liv-ai-approve-${toolCallId}`}
					className='rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'
				>
					Approve
				</button>
			</div>
		</div>
	)
}

export default ApprovalCard
