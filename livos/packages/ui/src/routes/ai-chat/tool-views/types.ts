/**
 * Tool view shared types — Phase 68-02 (CONTEXT D-21).
 *
 * `ToolViewProps` is the binding contract for P69 per-tool view
 * components. `ToolCallSnapshot` mirrors P67 D-12 (CONTEXT D-14) — it
 * is RE-DECLARED locally (not imported from `@nexus/core`) because:
 *   - 68-01 (the panel store, also wave-1) may not yet have shipped.
 *   - `@nexus/core` is a server-only package and not a UI dep
 *     (D-NO-NEW-DEPS). Once P67 publishes the types in a UI-consumable
 *     form, 68-03 (dispatcher) MAY swap to importing from there.
 *
 * The shape MUST stay byte-for-byte identical to:
 *   - P67 67-CONTEXT.md D-12
 *   - P68 68-CONTEXT.md D-14
 * Drift is detectable via a single grep across the codebase.
 */

export type ToolCallSnapshot = {
	toolId: string
	toolName: string
	category:
		| 'browser'
		| 'terminal'
		| 'file'
		| 'fileEdit'
		| 'webSearch'
		| 'webCrawl'
		| 'webScrape'
		| 'mcp'
		| 'computer-use'
		| 'generic'
	assistantCall: {input: Record<string, unknown>; ts: number}
	toolResult?: {output: unknown; isError: boolean; ts: number}
	status: 'running' | 'done' | 'error'
	startedAt: number
	completedAt?: number
}

export interface ToolViewProps {
	snapshot: ToolCallSnapshot
	/** Whether the panel currently has this snapshot focused (for animations/glow). */
	isActive: boolean
	/** Optional callback for views that emit events (e.g. takeover for computer-use). Future. */
	onEvent?: (event: {type: string; payload?: unknown}) => void
}
