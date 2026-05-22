/**
 * Phase 197-05 — ApprovalManager.
 *
 * In-memory pending-approval registry. Plan 197-04's wrapped destructive
 * tools call `registerPending(toolCallId, runId)`; the SSE layer / UI calls
 * `resolve(toolCallId, approved)` once the operator clicks Approve / Reject.
 *
 * Structurally satisfies Plan 197-04's ApprovalGate interface — TypeScript
 * ducktyping; no explicit `implements` to keep the cross-wave coupling loose.
 *
 * Threat mitigations:
 *   T-197-05-04 (D): cancelAll(runId) tears down all pending approvals for a
 *                    run (called from SSE disconnect handler and from
 *                    mastra.agent.cancel mutation).
 *   T-197-05-05 (D): 5-minute auto-reject timeout per pending approval.
 */

export interface PendingApproval {
	resolve(approved: boolean): void
	runId: string
	timeoutHandle: ReturnType<typeof setTimeout>
}

export class ApprovalManager {
	private pending = new Map<string, PendingApproval>()
	private readonly timeoutMs: number

	constructor(opts?: {timeoutMs?: number}) {
		this.timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000
	}

	registerPending(toolCallId: string, runId: string): Promise<boolean> {
		return new Promise((resolve) => {
			const timeoutHandle = setTimeout(() => {
				const entry = this.pending.get(toolCallId)
				if (entry) {
					this.pending.delete(toolCallId)
					entry.resolve(false)
				}
			}, this.timeoutMs)
			this.pending.set(toolCallId, {resolve, runId, timeoutHandle})
		})
	}

	resolve(toolCallId: string, approved: boolean): void {
		const entry = this.pending.get(toolCallId)
		if (!entry) return // no-op (defensive against double-click in UI)
		clearTimeout(entry.timeoutHandle)
		this.pending.delete(toolCallId)
		entry.resolve(approved)
	}

	cancelAll(runId: string): void {
		for (const [toolCallId, entry] of this.pending.entries()) {
			if (entry.runId === runId) {
				clearTimeout(entry.timeoutHandle)
				this.pending.delete(toolCallId)
				entry.resolve(false)
			}
		}
	}
}
