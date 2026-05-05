/**
 * conversation-search.ts — GET /api/conversations/search. Phase 75-06.
 *
 * Wires Plan 75-01's MessagesRepository.search() up through an Express HTTP
 * route so the sidebar (Plan 75-07) can fetch full-text search results scoped
 * to the authenticated user. Per CONTEXT D-29..D-31:
 *
 *   D-29  Response shape:
 *           {query, count, results: [{messageId, conversationId,
 *             conversationTitle, role, snippet, createdAt: ISO, rank}]}
 *   D-30  q.trim().length < 2 ⇒ 200 with empty results (NOT 400 — the empty
 *           result IS the expected client-side behaviour for "still typing").
 *   D-30  q.length > 200 ⇒ 400 'query too long' (DoS mitigation T-75-06-04
 *           per the threat model — also enforced inside the repository as
 *           defense-in-depth).
 *   D-31  Auth via JWT (Authorization: Bearer or ?token= query — same shape
 *           as agent-runs.ts so EventSource clients can chain auth in URL).
 *
 * Auth helper: duplicated from agent-runs.ts to keep the 67-03 module
 * cohesive (smaller blast radius than re-exporting; matches D-NO-NEW-DEPS
 * spirit). The two helpers should stay byte-equivalent — if one drifts,
 * extract a shared util in a future plan.
 *
 * Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is read-only — this module
 * does NOT touch nexus internals.
 *
 * Mount: `mountConversationSearchRoute(app, livinityd)` from
 * `server/index.ts` alongside `mountAgentRunsRoutes`.
 */

import type {Application, Request, Response} from 'express'

import type Livinityd from '../../index.js'
import {getPool} from '../database/index.js'
import {MessagesRepository, type SearchResult} from '../database/messages-repository.js'

/**
 * Auth override — when present, replaces JWT verification. Used by tests;
 * never wired in production. Sets `(request as any).agentRunsUserId` to a
 * synthetic userId on success.
 */
export type AuthOverride = (
	request: Request,
	response: Response,
	next: () => void,
) => void

/**
 * Minimal repository contract — narrowed so tests can stub `search` without
 * pulling in the full pg-backed MessagesRepository.
 */
export interface SearchRepoContract {
	search: (userId: string, query: string, limit?: number) => Promise<SearchResult[]>
}

/** Options accepted by mountConversationSearchRoute. */
export interface MountConversationSearchOptions {
	/** Test-only: bypass JWT verification with a synthetic auth middleware. */
	authOverride?: AuthOverride
	/** Test-only: inject a stubbed repo (so tests don't need a real pg.Pool). */
	messagesRepoOverride?: SearchRepoContract
}

/**
 * Resolve and verify a JWT token from either an `Authorization: Bearer ...`
 * header or a `?token=<jwt>` query string param. Returns the userId on
 * success, or `null` on auth failure.
 *
 * Duplicated from agent-runs.ts — kept byte-equivalent so the two routes
 * share auth semantics. New multi-user token has `userId`; legacy
 * `{loggedIn:true}` maps to 'admin' (same fallback as agent-runs).
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
 * Mount GET /api/conversations/search on the existing livinityd Express app.
 *
 * Behaviour matrix:
 *   - missing/invalid JWT          → 401 {error: 'unauthorized'}
 *   - q.trim().length < 2          → 200 {query, count: 0, results: []}
 *   - q.length > 200               → 400 {error: 'query too long'}
 *   - valid q                      → 200 {query, count, results}
 *   - repository throw             → 500 {error: 'search failed'}
 *
 * Multi-user privacy boundary (T-75-06-02): the userId comes from the JWT
 * claim; MessagesRepository.search enforces `WHERE user_id = $userId`.
 */
export function mountConversationSearchRoute(
	app: Application,
	livinityd: Livinityd,
	options: MountConversationSearchOptions = {},
): void {
	app.get('/api/conversations/search', async (request: Request, response: Response) => {
		// ── Auth ───────────────────────────────────────────────────────────
		const authOverride = options.authOverride
		let userId: string | null = null
		if (authOverride) {
			authOverride(request, response, () => {})
			userId = (request as any).agentRunsUserId ?? null
		} else {
			userId = await resolveJwtUserId(livinityd, request)
		}
		if (!userId) {
			return response.status(401).json({error: 'unauthorized'})
		}

		// ── Query validation (CONTEXT D-30) ────────────────────────────────
		const q = String(request.query.q ?? '')

		if (q.trim().length < 2) {
			// Empty / single-char query is the expected "still typing" state on
			// the client — return 200 with an empty list, NOT 400. No DB hit.
			return response.status(200).json({query: q, count: 0, results: []})
		}
		if (q.length > 200) {
			return response.status(400).json({error: 'query too long'})
		}

		// ── Repository wiring (lazy / per-request — simpler for v1) ────────
		let repo: SearchRepoContract
		if (options.messagesRepoOverride) {
			repo = options.messagesRepoOverride
		} else {
			const pool = getPool()
			if (!pool) {
				// Database isn't initialized — surface a 500 rather than crash.
				const log = livinityd.logger?.error?.bind(livinityd.logger)
				log?.('[conversation-search] getPool() returned null — database not initialized')
				return response.status(500).json({error: 'search failed'})
			}
			repo = new MessagesRepository(pool)
		}

		// ── Search + map → response (CONTEXT D-29) ─────────────────────────
		try {
			const rows = await repo.search(userId, q, 25)
			return response.status(200).json({
				query: q,
				count: rows.length,
				results: rows.map((r) => ({
					messageId: r.messageId,
					conversationId: r.conversationId,
					conversationTitle: r.conversationTitle,
					role: r.role,
					snippet: r.snippet,
					createdAt:
						r.createdAt instanceof Date
							? r.createdAt.toISOString()
							: String(r.createdAt),
					rank: r.rank,
				})),
			})
		} catch (err) {
			const log = livinityd.logger?.error?.bind(livinityd.logger)
			const msg = err instanceof Error ? err.message : String(err)
			log?.(`[conversation-search] error: ${msg}`)
			return response.status(500).json({error: 'search failed'})
		}
	})
}
