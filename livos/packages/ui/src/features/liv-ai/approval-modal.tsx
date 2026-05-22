/**
 * Phase 197-06 — ApprovalModal.
 *
 * Renders when pendingApproval is non-null. Approve / Reject buttons.
 * T-197-06-01 mitigation: Reject button autoFocus; Enter key does NOT
 * auto-submit Approve (handleKeyDown intercepts).
 * T-197-06-03 mitigation: tool args displayed via redactArgsForDisplay().
 */

import type {KeyboardEvent} from 'react'

import {redactArgsForDisplay} from './redact-args'
import type {PendingApproval} from './use-liv-ai'

export function ApprovalModal({
	pending,
	onApprove,
	onReject,
}: {
	pending: PendingApproval | null
	onApprove(): void
	onReject(): void
}) {
	if (!pending) return null

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		// T-197-06-01 — Enter MUST NOT auto-submit Approve. Escape → Reject.
		if (e.key === 'Enter') e.preventDefault()
		if (e.key === 'Escape') onReject()
	}

	const redacted = redactArgsForDisplay(pending.args)

	return (
		<div
			role='dialog'
			aria-modal='true'
			aria-labelledby='liv-ai-approval-title'
			data-testid='liv-ai-approval-modal'
			onKeyDown={handleKeyDown}
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'
		>
			<div className='w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900'>
				<h2 id='liv-ai-approval-title' className='mb-2 text-lg font-semibold'>
					Approve tool call
				</h2>
				<p className='mb-1 text-sm text-neutral-600 dark:text-neutral-400'>
					Liv AI wants to run:
				</p>
				<code className='mb-3 block break-all rounded-md bg-cyan-50 px-3 py-2 font-mono text-sm text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200'>
					{pending.toolName}
				</code>
				<pre className='mb-4 max-h-48 overflow-auto rounded-md bg-neutral-100 p-3 text-xs dark:bg-neutral-800'>
					{JSON.stringify(redacted, null, 2)}
				</pre>
				<div className='flex justify-end gap-2'>
					<button
						type='button'
						autoFocus
						onClick={onReject}
						data-testid='liv-ai-reject'
						className='rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
					>
						Reject
					</button>
					<button
						type='button'
						onClick={onApprove}
						data-testid='liv-ai-approve'
						className='rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700'
					>
						Approve
					</button>
				</div>
			</div>
		</div>
	)
}
