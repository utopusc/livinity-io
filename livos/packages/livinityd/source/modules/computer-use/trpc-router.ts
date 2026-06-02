/**
 * Phase 254-01 — `displays.*` tRPC namespace (computer-use UI seam).
 *
 * Procedures:
 *   - displays.list()                 → {displays: DisplayRecord[], count} (same wrap as MCP computer_list_displays)
 *   - displays.getVncUrl({display})   → {wsUrl}  (whole-display x11vnc via StreamManager mode 'vnc-window')
 *
 * Until this plan there was NO tRPC route exposing the active X displays to
 * the LivOS UI — display data was only reachable via the stdio MCP server
 * (CONTEXT "GAP — no tRPC for UI"). This router is the seam the Plan 04 hover
 * panel (displays.list) and the Plan 03 live-VNC display window
 * (displays.getVncUrl) build against.
 *
 * STRIDE (threat_model 254-01):
 *   S — userId is ALWAYS sourced from ctx.currentUser.id, NEVER from input
 *       (T-254-02). Both routes are privateProcedure (auth-gated) (T-254-04).
 *   I — getVncUrl is owner-scoped: a non-empty owner_session that does not
 *       match the caller session → FORBIDDEN (T-254-01). The returned wsUrl is
 *       a capability token, so only the display id is logged, never the wsUrl
 *       (T-254-03).
 *   D — repeated getVncUrl reuses StreamManager's per-user stream cap
 *       (StreamCapExceededError) — no new control needed (T-254-05).
 *
 * Owner-session mapping note: the stdio MCP stores `owner_session` as the luse
 * session id (resolveLuseUserId → LUSE_USER_ID env, default 'bruce'), whereas
 * the UI carries ctx.currentUser.id. On the single-tenant Mini PC these may
 * differ; the FORBIDDEN gate is kept intact (it correctly denies a caller
 * whose id does not match a display's non-empty owner_session). Displays with
 * an empty owner_session (host/shared) are readable by any authenticated user.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'

// Same display-id shape the streaming router validates (`:N` or `:N.S`).
const displayIdSchema = z.string().regex(/^:\d+(\.\d+)?$/)

/**
 * Phase 254 Gap 2 (254-06 / CR-01 Option A) — authorization decision for
 * getVncUrl, extracted pure for unit-testing.
 *
 * Returns true when the caller may resolve a VNC ws URL for a display:
 *   - empty owner_session  → host/shared → ANY authenticated caller (true)
 *   - caller is admin      → bypass owner check (single-tenant operator;
 *                            the MCP writes owner_session as the luse user id
 *                            'bruce', which never equals the UI user's UUID —
 *                            without this bypass every MCP-created display is
 *                            permanently FORBIDDEN to the operator)
 *   - callerSession === owner_session → the legitimate owner (true)
 *   - otherwise → false (FORBIDDEN: a non-admin reaching ANOTHER user's display)
 *
 * STRIDE-I (T-254-01 amended): the admin bypass is scoped to role==='admin'
 * ONLY. A non-admin member/guest still cannot reach a display whose non-empty
 * owner_session does not equal their own session, preserving multi-user
 * isolation. Shared (empty owner_session) displays remain readable by anyone.
 */
export function canAccessDisplay(input: {
	ownerSession: string
	callerSession: string
	callerRole: string
}): boolean {
	if (!input.ownerSession) return true // host/shared
	if (input.callerRole === 'admin') return true // single-tenant operator bypass
	return input.callerSession === input.ownerSession // legitimate owner only
}

export const displaysRouter = router({
	list: privateProcedure.query(async ({ctx}) => {
		const dm = ctx.livinityd?.displayManager
		if (!dm) {
			throw new TRPCError({
				code: 'SERVICE_UNAVAILABLE',
				message: 'displayManager not initialised',
			})
		}
		const displays = await dm.list()
		// Same wrap as MCP computer_list_displays — a record, not a bare array.
		return {displays, count: displays.length}
	}),

	getVncUrl: privateProcedure
		.input(z.object({display: displayIdSchema}))
		.mutation(async ({ctx, input}) => {
			// STRIDE-S: caller identity from ctx.currentUser ONLY, never input.
			const userId = ctx.currentUser?.id
			if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})

			const dm = ctx.livinityd?.displayManager
			if (!dm) {
				throw new TRPCError({
					code: 'SERVICE_UNAVAILABLE',
					message: 'displayManager not initialised',
				})
			}

			const record = (await dm.list()).find((d) => d.display === input.display)
			if (!record) throw new TRPCError({code: 'NOT_FOUND'})

			// STRIDE-I (T-254-01): a non-empty owner_session that the caller does
			// not own → FORBIDDEN. Empty owner_session = host/shared = allowed.
			if (
				record.owner_session &&
				!(await dm.isOwner({display: input.display, session: userId}))
			) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'display owned by another session',
				})
			}

			const sm = ctx.livinityd?.streamManager
			if (!sm) {
				throw new TRPCError({
					code: 'SERVICE_UNAVAILABLE',
					message: 'StreamManager not initialised',
				})
			}

			// Whole-display x11vnc capture: mode 'vnc-window', target {display}.
			const {wsUrl} = sm.startStream({
				userId,
				mode: 'vnc-window',
				target: {display: input.display},
			})
			// STRIDE-I (T-254-03): never log the wsUrl (capability token) — only
			// the display id. ctx.logger exposes `.log` (Livinityd['logger']),
			// not `.info` — use the optional-chained `.log` so the Repudiation
			// trail is emitted without the type mismatch the streaming/webapps
			// routers' `.info?.()` calls carry.
			ctx.logger?.log?.(`displays.getVncUrl user=${userId} display=${input.display}`)
			return {wsUrl}
		}),
})

/**
 * Top-level computer-use router exposing the `displays` namespace. Mounted in
 * server/trpc/index.ts as `displays: computerUseRouter.displays` (or the inner
 * `displaysRouter` directly) so the path shape is exactly
 * `displays.list` / `displays.getVncUrl`.
 */
export const computerUseRouter = router({
	displays: displaysRouter,
})
