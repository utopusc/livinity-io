/**
 * Phase 197-04 — Wraps a destructive tool's execute() with an approval gate.
 *
 * W-02 lock: When the operator REJECTS an approval, the wrapped tool returns
 * the REJECTED_TOOL_RESULT sentinel as a NORMAL tool result — Mastra surfaces
 * it as a tool-result chunk and the agent continuation naturally produces a
 * text reply explaining the rejection. The agent run stays alive; only this
 * one tool call is denied. Plan 197-05's SSE layer therefore needs ZERO
 * special abort path on Reject.
 *
 * Cross-wave note: Plan 197-04 (Wave 2) ships the ApprovalGate INTERFACE
 * only. Plan 197-05 (Wave 3)'s ApprovalManager class structurally satisfies
 * this interface (TypeScript ducktyping) — no Wave 3 → Wave 2 dep inversion.
 */

import {randomUUID} from 'node:crypto'

export interface ApprovalGate {
	registerPending(toolCallId: string, runId: string): Promise<boolean>
}

/**
 * The rejected sentinel returned by a wrapped tool when the operator rejects
 * the approval. Stable shape; Plan 197-05's SSE layer + Plan 197-06's UI
 * both inspect via structural typing.
 *
 * W-02 lock: this is the load-bearing alternative to throwing /
 * aborting the run.
 */
export const REJECTED_TOOL_RESULT = {
	rejected: true as const,
	reason: 'operator rejected this tool call' as const,
}

export interface MinimalTool {
	description?: string
	parameters?: unknown
	execute: (input: unknown, ctx: unknown) => Promise<unknown>
}

/**
 * Returns a NEW tool object delegating description + parameters to the
 * original. execute() first awaits gate.registerPending(toolCallId, runId).
 * On approved=true → delegate to originalTool.execute. On approved=false →
 * return REJECTED_TOOL_RESULT.
 *
 * runId is read from ctx.runId if present (Mastra runtime surface); falls back
 * to randomUUID() otherwise (still works — just no cross-tool grouping for
 * this call).
 */
export function wrapToolWithApproval(
	originalTool: MinimalTool,
	toolName: string,
	gate: ApprovalGate,
): MinimalTool {
	void toolName // reserved for future logging / metrics
	return {
		description: originalTool.description,
		parameters: originalTool.parameters,
		async execute(input: unknown, ctx: unknown): Promise<unknown> {
			const toolCallId = randomUUID()
			const runId =
				typeof ctx === 'object' &&
				ctx !== null &&
				'runId' in ctx &&
				typeof (ctx as {runId?: unknown}).runId === 'string'
					? (ctx as {runId: string}).runId
					: randomUUID()
			const approved = await gate.registerPending(toolCallId, runId)
			if (!approved) {
				return REJECTED_TOOL_RESULT
			}
			return originalTool.execute(input, ctx)
		},
	}
}
