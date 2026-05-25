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
	/** Phase 203-10 — snapshot of the request payload so the UI can render it. */
	toolName: string
	args: unknown
	agentId?: string
	userId?: string
	createdAt: number
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

/**
 * Phase 203-10 — public summary of a pending approval. The SSE endpoint
 * (modules/openclawos/approvals-routes.ts) serializes these to clients;
 * the claw-client ApprovalCard renders one row per entry.
 */
export interface PendingApprovalSummary {
	toolCallId: string
	toolName: string
	args: unknown
	agentId?: string
	userId?: string
	runId: string
	createdAt: number
}

/**
 * Phase 203-10 — events emitted on the ApprovalManager event bus.
 * Subscribers (SSE handler) get a 'pending' for every new request and a
 * 'resolved' for every approve/reject/timeout/cancel. UI uses these to
 * render + retract approval cards.
 */
export type ApprovalEvent =
	| {type: 'pending'; entry: PendingApprovalSummary}
	| {
			type: 'resolved'
			toolCallId: string
			decision: ApprovalDecision
			runId: string
	  }

export type ApprovalEventListener = (event: ApprovalEvent) => void

export class ApprovalManager {
	private pending = new Map<string, PendingApproval>()
	private readonly timeoutMs: number
	/** Phase 203-10 — event subscribers (SSE stream handlers in livinityd). */
	private readonly listeners = new Set<ApprovalEventListener>()
	/**
	 * Phase 207 UAT 2026-05-24 — auto-approve resolver.
	 *
	 * When set and returns true, `requestSync()` resolves immediately with
	 * `decision='approved'` WITHOUT surfacing a pending event to the SSE
	 * stream. Operator request: "LuseMCP yi Onayli calisiyor ya bunun icin
	 * bir ayar olustur Sormadan onay istemeden devam etmesini ayarlayabilmemiz
	 * icin" — they want a configurable bypass for destructive-tool approval
	 * during fast iteration.
	 *
	 * Default resolver (boot wire-up) reads
	 * `LIVOS_AUTO_APPROVE_DESTRUCTIVE` env var (true/1/yes); unset = approval
	 * gate remains active (the secure default). A future UI surfaces this
	 * as a per-session toggle that writes to Redis; this env var is the
	 * minimal hook so the operator can flip it without a UI rebuild.
	 *
	 * INV-203-04 carry-forward: the resolver is a CALLBACK, not a static
	 * boolean — so a future runtime-controlled flag (Redis hash, tRPC
	 * mutation) can swap behaviour without a server restart.
	 */
	private readonly autoApproveResolver: () => boolean
	/**
	 * Phase 207 UAT 2026-05-24 round 4 — runtime override for the
	 * auto-approve resolver. Set via the `setAutoApprove(bool)` setter
	 * (called by the openclaw.config.setAutoApprove tRPC mutation + by
	 * the boot-time Redis hydration). When set to `true`, every
	 * `requestSync()` call short-circuits as 'approved' regardless of
	 * the constructor-injected env-var resolver. Setting to `null`
	 * (default) defers to the env-var resolver.
	 */
	private autoApproveRuntimeOverride: boolean | null = null

	constructor(opts?: {
		timeoutMs?: number
		autoApprove?: () => boolean
	}) {
		this.timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000
		this.autoApproveResolver = opts?.autoApprove ?? (() => false)
	}

	/**
	 * Phase 207 UAT 2026-05-24 round 4 — UI-facing toggle.
	 *
	 * The Settings → Providers tab's "Auto-approve destructive tool calls"
	 * checkbox calls the openclaw.config.setAutoApprove mutation; the
	 * boot wire-up forwards the new value to this method so the
	 * ApprovalManager picks up the change without a restart. The
	 * boolean value is also persisted to the Redis key
	 * `liv:config:auto_approve_destructive` so the choice survives a
	 * service restart (mcp-config-router reads it on boot and seeds the
	 * runtime override).
	 *
	 * Pass `null` to clear the runtime override and revert to the
	 * env-var-driven default.
	 */
	setAutoApprove(value: boolean | null): void {
		this.autoApproveRuntimeOverride = value
	}

	/**
	 * Phase 207 UAT 2026-05-24 round 4 — getter for the UI initial state.
	 * Returns the runtime override if set, else evaluates the env-var
	 * resolver. The Settings checkbox reads this to seed its initial
	 * `checked` state.
	 */
	getAutoApprove(): boolean {
		if (this.autoApproveRuntimeOverride !== null) {
			return this.autoApproveRuntimeOverride
		}
		return this.autoApproveResolver()
	}

	registerPending(toolCallId: string, runId: string): Promise<boolean> {
		return new Promise((resolve) => {
			const timeoutHandle = setTimeout(() => {
				const entry = this.pending.get(toolCallId)
				if (entry) {
					this.pending.delete(toolCallId)
					entry.resolve(false)
					this.emit({
						type: 'resolved',
						toolCallId,
						decision: 'timeout',
						runId: entry.runId,
					})
				}
			}, this.timeoutMs)
			const entry: PendingApproval = {
				resolve,
				runId,
				timeoutHandle,
				toolName: 'unknown',
				args: undefined,
				createdAt: Date.now(),
			}
			this.pending.set(toolCallId, entry)
			this.emit({type: 'pending', entry: this.toSummary(toolCallId, entry)})
		})
	}

	/**
	 * Phase 203-06 — named entry-point consumed by the openclaw plugin RPC
	 * dispatcher. Differentiates 'timeout' from explicit 'rejected' so the
	 * plugin can surface a clearer message inside the `before_tool_call`
	 * hook's rejection payload (T-197-05-05).
	 *
	 * Phase 203-10 — emits a 'pending' event so the SSE stream can push the
	 * approval card to the claw-client UI; emits 'resolved' on completion.
	 */
	async requestSync(opts: RequestSyncOptions): Promise<ApprovalDecisionResult> {
		const toolCallId = opts.toolCallId ?? randomToolCallId()
		const runId =
			opts.agentId && opts.agentId.length > 0
				? `openclawos:${opts.agentId}`
				: 'openclawos:default'
		const timeoutMs = opts.timeoutMs ?? this.timeoutMs

		// Phase 207 UAT 2026-05-24 — auto-approve short-circuit. Runtime
		// override (Settings checkbox) wins over the env-var resolver
		// (LIVOS_AUTO_APPROVE_DESTRUCTIVE); when neither says yes the
		// approval card fires as before. We still emit the 'resolved'
		// event so any open SSE consumer sees the decision land in the
		// audit stream (don't fire 'pending' first — that'd flash the
		// card for a single render).
		if (this.getAutoApprove()) {
			this.emit({
				type: 'resolved',
				toolCallId,
				decision: 'approved',
				runId,
			})
			return {decision: 'approved', toolCallId, runId}
		}

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
					this.emit({
						type: 'resolved',
						toolCallId,
						decision: 'timeout',
						runId: entry.runId,
					})
				}
			}, timeoutMs)
			const entry: PendingApproval = {
				resolve,
				runId,
				timeoutHandle,
				toolName: opts.toolName,
				args: opts.args,
				agentId: opts.agentId,
				userId: opts.userId,
				createdAt: Date.now(),
			}
			this.pending.set(toolCallId, entry)
			this.emit({type: 'pending', entry: this.toSummary(toolCallId, entry)})
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
		this.emit({
			type: 'resolved',
			toolCallId,
			decision: approved ? 'approved' : 'rejected',
			runId: entry.runId,
		})
	}

	cancelAll(runId: string): void {
		for (const [toolCallId, entry] of this.pending.entries()) {
			if (entry.runId === runId) {
				clearTimeout(entry.timeoutHandle)
				this.pending.delete(toolCallId)
				entry.resolve(false)
				this.emit({type: 'resolved', toolCallId, decision: 'rejected', runId})
			}
		}
	}

	/**
	 * Phase 203-10 — snapshot of currently-pending approvals. SSE handler
	 * uses this to send an initial batch when a new client connects so the
	 * UI does not have to wait for the next 'pending' event to populate.
	 */
	listPending(): PendingApprovalSummary[] {
		return Array.from(this.pending.entries()).map(([toolCallId, entry]) =>
			this.toSummary(toolCallId, entry),
		)
	}

	/**
	 * Phase 203-10 — subscribe to approval events. Returns an unsubscribe
	 * function. Listeners are called synchronously; throwing inside one
	 * does NOT prevent others from firing.
	 */
	subscribe(listener: ApprovalEventListener): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	private emit(event: ApprovalEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event)
			} catch {
				// Subscriber faults must not break the request lifecycle.
			}
		}
	}

	private toSummary(
		toolCallId: string,
		entry: PendingApproval,
	): PendingApprovalSummary {
		return {
			toolCallId,
			toolName: entry.toolName,
			args: entry.args,
			agentId: entry.agentId,
			userId: entry.userId,
			runId: entry.runId,
			createdAt: entry.createdAt,
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
