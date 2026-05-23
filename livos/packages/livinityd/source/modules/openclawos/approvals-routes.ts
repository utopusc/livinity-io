/**
 * Phase 203-10 — Express routes for HITL approval surfacing.
 *
 * Plan 203-09 deleted the assistant-ui ApprovalCard. This module ships the
 * minimal server-side surface the rebuilt claw-client ApprovalCard
 * subscribes to:
 *
 *   GET  /openclawos/approvals/stream    SSE — pushes 'pending' + 'resolved'
 *                                              events plus an initial batch
 *                                              of currently-pending approvals
 *                                              for late-joining clients.
 *
 *   POST /openclawos/approvals/respond   { toolCallId, decision: 'approved' |
 *                                          'rejected' } → calls
 *                                          ApprovalManager.resolve(toolCallId,
 *                                          approved).
 *
 * Auth — both routes use the same JWT cookie/Bearer gate as the handshake
 * route (admin-only by intent; the destructive-tool surface is always
 * admin-gated upstream). For now we require a non-empty admin token; per-user
 * approval scoping is Phase 220+ territory.
 *
 * Decisions honoured:
 *   D-203-14 / INV-203-04 — destructive-tool approval gate fires; we are
 *     ONLY rebuilding the UI surface that was deleted in 203-09. Backend
 *     semantics (ApprovalManager.resolve / requestSync) unchanged.
 *   T-203-06 — same-origin (claw-client iframe at /liv-ai-app/openclawos
 *     hits these routes on the parent host); LIVINITY_SESSION cookie
 *     SameSite=Lax auto-flows.
 */

import type {RequestHandler} from 'express'

import type {
	ApprovalEvent,
	ApprovalManager,
} from '../agent-runtime/approval-manager.js'

type VerifyTokenFn = (token: string) => Promise<unknown>

export interface ApprovalsRoutesOptions {
	approvalManager: ApprovalManager
	verifyToken: VerifyTokenFn
	logger?: {
		info: (msg: string) => void
		warn?: (msg: string, err?: unknown) => void
		error?: (msg: string, err?: unknown) => void
	}
}

async function authenticate(
	req: Parameters<RequestHandler>[0],
	verifyToken: VerifyTokenFn,
): Promise<boolean> {
	let token = req.headers.authorization?.split(' ')[1]
	if (!token) {
		const cookies = (req as unknown as {cookies?: {LIVINITY_SESSION?: string}})
			.cookies
		token = cookies?.LIVINITY_SESSION
	}
	if (!token) return false
	try {
		await verifyToken(token)
		return true
	} catch {
		return false
	}
}

/**
 * Build the SSE handler for GET /openclawos/approvals/stream.
 *
 * Wire format — newline-delimited SSE frames:
 *   event: bootstrap            { pending: PendingApprovalSummary[] }
 *   event: pending              PendingApprovalSummary
 *   event: resolved             { toolCallId, decision }
 *   event: ping                 (every 25s, keep-alive)
 */
export function createApprovalsStreamHandler(
	opts: ApprovalsRoutesOptions,
): RequestHandler {
	return async (req, res) => {
		const ok = await authenticate(req, opts.verifyToken)
		if (!ok) {
			res.status(401).json({error: 'unauthorized'})
			return
		}

		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache, no-transform')
		res.setHeader('Connection', 'keep-alive')
		// Same-origin (T-203-06) — no CORS frame needed.
		res.flushHeaders?.()

		const write = (event: string, payload: unknown): void => {
			try {
				res.write(`event: ${event}\n`)
				res.write(`data: ${JSON.stringify(payload)}\n\n`)
			} catch {
				// Client disconnected mid-write; cleanup happens via 'close'.
			}
		}

		// Bootstrap: send the currently-pending entries so a late-joining
		// client renders the cards immediately (no wait for the next event).
		write('bootstrap', {pending: opts.approvalManager.listPending()})

		const unsubscribe = opts.approvalManager.subscribe((event: ApprovalEvent) => {
			if (event.type === 'pending') {
				write('pending', event.entry)
			} else {
				write('resolved', {
					toolCallId: event.toolCallId,
					decision: event.decision,
					runId: event.runId,
				})
			}
		})

		// Periodic ping so intermediate proxies (Caddy / CF Tunnel) keep the
		// connection alive. flush_interval -1 in our Caddy block already
		// disables buffering, but the ping is cheap defense in depth.
		const pingTimer = setInterval(() => {
			write('ping', {ts: Date.now()})
		}, 25_000)

		const cleanup = (): void => {
			clearInterval(pingTimer)
			unsubscribe()
		}

		req.on('close', cleanup)
		req.on('error', cleanup)
		res.on('close', cleanup)

		opts.logger?.info('[openclawos-approvals] SSE client connected')
	}
}

/**
 * Build the POST handler for /openclawos/approvals/respond.
 * Body: { toolCallId: string, decision: 'approved' | 'rejected' }.
 */
export function createApprovalsRespondHandler(
	opts: ApprovalsRoutesOptions,
): RequestHandler {
	return async (req, res) => {
		const ok = await authenticate(req, opts.verifyToken)
		if (!ok) {
			res.status(401).json({error: 'unauthorized'})
			return
		}

		const body = (req as unknown as {body?: unknown}).body
		if (!body || typeof body !== 'object') {
			res.status(400).json({error: 'bad_request', detail: 'body required'})
			return
		}

		const b = body as Record<string, unknown>
		const toolCallId = typeof b['toolCallId'] === 'string' ? b['toolCallId'] : ''
		const decision = b['decision']
		if (!toolCallId) {
			res.status(400).json({error: 'bad_request', detail: 'toolCallId required'})
			return
		}
		if (decision !== 'approved' && decision !== 'rejected') {
			res.status(400).json({
				error: 'bad_request',
				detail: "decision must be 'approved' or 'rejected'",
			})
			return
		}

		opts.approvalManager.resolve(toolCallId, decision === 'approved')
		opts.logger?.info(
			`[openclawos-approvals] resolve toolCallId=${toolCallId.slice(0, 16)}… decision=${decision}`,
		)
		res.status(200).json({ok: true})
	}
}
