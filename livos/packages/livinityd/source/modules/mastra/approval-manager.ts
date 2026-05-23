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
 *
 * Phase 203-06 (D-203-14 / INV-203-04) — adds requestSync(...) entry point
 * consumed by the openclaw plugin RPC dispatcher (modules/openclawos/plugin-rpc.ts).
 * Semantically identical to registerPending(), but takes a named opts object
 * (toolName / agentId / userId / timeoutMs?) and returns a richer decision
 * tuple — the plugin can distinguish 'approved' / 'rejected' / 'timeout' for
 * better error surfacing inside the openclaw `before_tool_call` hook.
 */

export interface PendingApproval {
	resolve(approved: boolean): void
	runId: string
	timeoutHandle: ReturnType<typeof setTimeout>
}

export interface RequestSyncOptions {
	toolName: string
	args?: unknown
	agentId?: string
	userId?: string
	toolCallId?: string
	/** Override the manager's default 5-min timeout for this single call. */
	timeoutMs?: number
}

export type ApprovalDecision = 'approved' | 'rejected' | 'timeout'

export interface ApprovalDecisionResult {
	decision: ApprovalDecision
	toolCallId: string
	runId: string
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

	/**
	 * Phase 203-06 — named entry-point consumed by the openclaw plugin RPC
	 * dispatcher. Differentiates 'timeout' from explicit 'rejected' so the
	 * plugin can surface a clearer message inside the `before_tool_call`
	 * hook's rejection payload (T-197-05-05).
	 */
	async requestSync(opts: RequestSyncOptions): Promise<ApprovalDecisionResult> {
		const toolCallId = opts.toolCallId ?? randomToolCallId()
		const runId =
			opts.agentId && opts.agentId.length > 0
				? `openclawos:${opts.agentId}`
				: 'openclawos:default'
		const timeoutMs = opts.timeoutMs ?? this.timeoutMs

		// Tag the pending entry with a per-call timeout sentinel so we can
		// distinguish 'timeout' from 'rejected' on the resolution side.
		let timedOut = false
		const result = await new Promise<boolean>((resolve) => {
			const timeoutHandle = setTimeout(() => {
				const entry = this.pending.get(toolCallId)
				if (entry) {
					timedOut = true
					this.pending.delete(toolCallId)
					entry.resolve(false)
				}
			}, timeoutMs)
			this.pending.set(toolCallId, {resolve, runId, timeoutHandle})
		})

		const decision: ApprovalDecision = result
			? 'approved'
			: timedOut
				? 'timeout'
				: 'rejected'
		return {decision, toolCallId, runId}
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

function randomToolCallId(): string {
	// Avoid a top-level `node:crypto` import to keep the module's existing
	// surface (zero deps, browser-renderer-safe in tests that mock crypto).
	// Math.random is acceptable here because the id is opaque + correlation-only,
	// NOT a security boundary.
	return `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
