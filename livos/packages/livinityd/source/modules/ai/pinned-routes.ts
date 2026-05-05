/**
 * pinned-routes.ts — POST /api/pinned-messages, DELETE /api/pinned-messages/:id,
 *                    GET  /api/pinned-messages. Phase 75-07.
 *
 * Wires Plan 75-03's PinnedMessagesRepository up through three Express HTTP
 * routes so the chat UI (Plan 75-07 frontend) can pin/unpin messages and the
 * sidebar can list them. Auto-injection into agent system prompt is wired
 * separately in `ai/index.ts` via `pinnedRepo.getContextString(userId, 4096)`.
 *
 * All routes are JWT-authed using the same shape as `agent-runs.ts` and
 * `conversation-search.ts` (Authorization: Bearer or ?token= query). Per
 * CONTEXT D-19 / 75-03 threat register T-75-03-02: every read/delete is
 * scoped by the JWT claim's userId — the repository SQL enforces
 * `WHERE user_id = $userId` as defense-in-depth.
 *
 * Auth helper: duplicated from `conversation-search.ts` to keep the 75-07
 * module cohesive (smaller blast radius than re-exporting; matches the
 * D-NO-NEW-DEPS spirit). The two helpers should stay byte-equivalent — if
 * one drifts, extract a shared util in a future plan.
 *
 * Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is read-only — this module
 * does NOT touch nexus internals.
 *
 * Mount: `mountPinnedRoutes(app, livinityd)` from `server/index.ts` alongside
 * `mountConversationSearchRoute`.
 */

import type {Application, Request, Response} from 'express'

import type Livinityd from '../../index.js'
import {getPool} from '../database/index.js'
import {
	PinnedMessagesRepository,
	type PinInput,
	type PinnedMessageRow,
} from '../database/pinned-messages-repository.js'

/**
 * Auth override — when present, replaces JWT verification. Used by tests;
 * never wired in production. Sets `(request as any).pinnedRoutesUserId` to a
 * synthetic userId on success.
 */
export type AuthOverride = (
	request: Request,
	response: Response,
	next: () => void,
) => void

/**
 * Minimal repository contract — narrowed so tests can stub the four methods
 * the routes call without pulling in the full pg-backed
 * PinnedMessagesRepository.
 */
export interface PinnedRepoContract {
	pin: (input: PinInput) => Promise<string>
	unpin: (userId: string, messageId: string) => Promise<void>
	unpinById: (userId: string, pinId: string) => Promise<void>
	listForUser: (userId: string, limit?: number) => Promise<PinnedMessageRow[]>
}

/** Options accepted by mountPinnedRoutes. */
export interface MountPinnedRoutesOptions {
	/** Test-only: bypass JWT verification with a synthetic auth middleware. */
	authOverride?: AuthOverride
	/** Test-only: inject a stubbed repo (so tests don't need a real pg.Pool). */
	pinnedRepoOverride?: PinnedRepoContract
}

/**
 * Resolve and verify a JWT token from either an `Authorization: Bearer ...`
 * header or a `?token=<jwt>` query string param. Returns the userId on
 * success, or `null` on auth failure.
 *
 * Duplicated from conversation-search.ts — kept byte-equivalent so the
 * three routes (agent-runs, conversation-search, pinned-messages) share auth
 * semantics. New multi-user token has `userId`; legacy `{loggedIn:true}`
 * maps to 'admin' (same fallback as the other routes).
 */
async function resolveJwtUserId(
	livinityd: Livinityd,
	request: Request,
): Promise<string | null> {
	const headerAuth = request.headers.authorization
	const headerToken =
		typeof headerAuth === 'string' && /^Bearer\s+/i.test(headerAuth)
			? headerAuth.replace(/^Bearer\s+/i, '').trim()
			: undefined
	const queryToken =
		typeof request.query.token === 'string' ? request.query.token : undefined
	const token = headerToken || queryToken
	if (!token) return null

	try {
		const payload = await livinityd.server.verifyToken(token)
		if (payload.userId) return payload.userId
		if (payload.loggedIn) return 'admin'
		return null
	} catch {
		return null
	}
}

/**
 * Resolve the repo: prefer the test override, otherwise build a fresh
 * PinnedMessagesRepository from the database singleton pool. Returns null
 * when the database is not initialized so the route returns 500 cleanly.
 */
function resolveRepo(
	options: MountPinnedRoutesOptions,
	livinityd: Livinityd,
): PinnedRepoContract | null {
	if (options.pinnedRepoOverride) return options.pinnedRepoOverride
	const pool = getPool()
	if (!pool) {
		const log = livinityd.logger?.error?.bind(livinityd.logger)
		log?.('[pinned-routes] getPool() returned null — database not initialized')
		return null
	}
	return new PinnedMessagesRepository(pool)
}

/**
 * Mount the three pinned-message routes on the existing livinityd Express app.
 *
 * Routes:
 *   - POST   /api/pinned-messages          { messageId?, conversationId?, content, label? }  → 200 { id }
 *   - DELETE /api/pinned-messages/:id                                                        → 200 { ok: true }
 *   - GET    /api/pinned-messages                                                             → 200 { count, results: [...] }
 *
 * Behaviour matrix:
 *   - missing/invalid JWT          → 401 {error: 'unauthorized'}
 *   - POST missing/empty content   → 400 {error: 'content is required'}
 *   - DB not initialized           → 500 {error: 'persistence unavailable'}
 *   - repository throw             → 500 {error: 'pin operation failed'}
 *
 * Multi-user privacy boundary (T-75-03-02): the userId comes from the JWT
 * claim; PinnedMessagesRepository enforces `WHERE user_id = $userId` at the
 * SQL layer.
 */
export function mountPinnedRoutes(
	app: Application,
	livinityd: Livinityd,
	options: MountPinnedRoutesOptions = {},
): void {
	const authOverride = options.authOverride

	const resolveAuth = async (
		request: Request,
		response: Response,
	): Promise<string | null> => {
		if (authOverride) {
			authOverride(request, response, () => {})
			return (request as any).pinnedRoutesUserId ?? null
		}
		return await resolveJwtUserId(livinityd, request)
	}

	// ── POST /api/pinned-messages ────────────────────────────────────────
	app.post('/api/pinned-messages', async (request: Request, response: Response) => {
		const userId = await resolveAuth(request, response)
		if (!userId) {
			return response.status(401).json({error: 'unauthorized'})
		}

		const body = (request.body ?? {}) as {
			messageId?: unknown
			conversationId?: unknown
			content?: unknown
			label?: unknown
		}
		const content = typeof body.content === 'string' ? body.content : ''
		if (!content || content.trim().length === 0) {
			return response.status(400).json({error: 'content is required'})
		}
		const messageId =
			typeof body.messageId === 'string' && body.messageId.length > 0
				? body.messageId
				: undefined
		const conversationId =
			typeof body.conversationId === 'string' && body.conversationId.length > 0
				? body.conversationId
				: undefined
		const label =
			typeof body.label === 'string' && body.label.length > 0
				? body.label
				: undefined

		const repo = resolveRepo(options, livinityd)
		if (!repo) {
			return response.status(500).json({error: 'persistence unavailable'})
		}

		try {
			const id = await repo.pin({userId, messageId, conversationId, content, label})
			return response.status(200).json({id})
		} catch (err) {
			const log = livinityd.logger?.error?.bind(livinityd.logger)
			const msg = err instanceof Error ? err.message : String(err)
			log?.(`[pinned-routes] POST error: ${msg}`)
			return response.status(500).json({error: 'pin operation failed'})
		}
	})

	// ── DELETE /api/pinned-messages/:id ──────────────────────────────────
	// Idempotent — DELETE on a non-existent pin returns 200 (matches the repo
	// SQL which is a no-op on missing rows). Scoped by the JWT userId.
	app.delete('/api/pinned-messages/:id', async (request: Request, response: Response) => {
		const userId = await resolveAuth(request, response)
		if (!userId) {
			return response.status(401).json({error: 'unauthorized'})
		}

		const pinId = request.params.id
		if (!pinId || pinId.trim().length === 0) {
			return response.status(400).json({error: 'id is required'})
		}

		const repo = resolveRepo(options, livinityd)
		if (!repo) {
			return response.status(500).json({error: 'persistence unavailable'})
		}

		try {
			await repo.unpinById(userId, pinId)
			return response.status(200).json({ok: true})
		} catch (err) {
			const log = livinityd.logger?.error?.bind(livinityd.logger)
			const msg = err instanceof Error ? err.message : String(err)
			log?.(`[pinned-routes] DELETE error: ${msg}`)
			return response.status(500).json({error: 'pin operation failed'})
		}
	})

	// ── GET /api/pinned-messages ─────────────────────────────────────────
	app.get('/api/pinned-messages', async (request: Request, response: Response) => {
		const userId = await resolveAuth(request, response)
		if (!userId) {
			return response.status(401).json({error: 'unauthorized'})
		}

		const repo = resolveRepo(options, livinityd)
		if (!repo) {
			return response.status(500).json({error: 'persistence unavailable'})
		}

		try {
			const rows = await repo.listForUser(userId, 50)
			return response.status(200).json({
				count: rows.length,
				results: rows.map((r) => ({
					id: r.id,
					messageId: r.messageId,
					conversationId: r.conversationId,
					content: r.content,
					label: r.label,
					pinnedAt:
						r.pinnedAt instanceof Date
							? r.pinnedAt.toISOString()
							: String(r.pinnedAt),
				})),
			})
		} catch (err) {
			const log = livinityd.logger?.error?.bind(livinityd.logger)
			const msg = err instanceof Error ? err.message : String(err)
			log?.(`[pinned-routes] GET error: ${msg}`)
			return response.status(500).json({error: 'pin operation failed'})
		}
	})
}
