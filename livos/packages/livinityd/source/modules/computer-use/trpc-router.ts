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
 *   I — getVncUrl is authorization-scoped via canAccessDisplay (T-254-01
 *       amended, 254-06 / CR-01 Option A): see the owner-session mapping note
 *       below. The returned wsUrl is a capability token, so only the display id
 *       is logged, never the wsUrl (T-254-03).
 *   D — repeated getVncUrl reuses StreamManager's per-user stream cap
 *       (StreamCapExceededError) — no new control needed (T-254-05).
 *
 * Owner-session mapping note (T-254-01 amended, 254-06): the stdio MCP stores
 * `owner_session` as the luse session id (resolveLuseUserId → LUSE_USER_ID env,
 * default 'bruce'), whereas the UI carries ctx.currentUser.id (a PostgreSQL
 * UUID on the multi-user Mini PC). These never match, so the original
 * id-vs-owner_session gate FORBADE the admin operator from EVERY MCP-created
 * display. The gate is therefore DELIBERATELY amended: an admin-role caller
 * (the single-tenant operator) BYPASSES the owner-session check, restoring the
 * headline VNC feature. A non-admin member/guest is STILL FORBIDDEN from a
 * display whose non-empty owner_session is not their own session — multi-user
 * isolation is preserved. Displays with an empty owner_session (host/shared)
 * remain readable by any authenticated user. See canAccessDisplay below.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {captureScreenshot} from './native/screenshot.js'

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

			// STRIDE-I (T-254-01 amended, 254-06 / CR-01 Option A): empty
			// owner_session = host/shared = allowed; an admin caller (the
			// single-tenant operator) bypasses the owner check so MCP-created
			// displays (owner_session='bruce') are reachable despite the
			// UUID-vs-luse-id mismatch; otherwise only the legitimate owner.
			// Uses `record.owner_session` already in hand from dm.list() above —
			// no extra dm.isOwner round-trip.
			const callerRole = ctx.currentUser?.role ?? 'member'
			if (
				!canAccessDisplay({
					ownerSession: record.owner_session,
					callerSession: userId,
					callerRole,
				})
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

	/**
	 * Phase 255-02 — `displays.screenshot({display})` → {dataUrl, width, height}.
	 *
	 * Powers the ~2s auto-refreshing JPEG thumbnails in the Displays popover
	 * (D-255-THUMBS-SCREENSHOT) WITHOUT opening any RFB socket: the popover
	 * polls each card via useQuery({enabled: open, refetchInterval: 2000}).
	 *
	 * A QUERY (not a mutation) by design — refetchInterval-friendly and needs
	 * NO httpOnlyPaths entry (unlike getVncUrl, which spawns a survive-reconnect
	 * x11vnc). It reuses the SAME authorization contract getVncUrl uses:
	 * canAccessDisplay verbatim (254-06 / CR-01 Option A), with the caller
	 * identity sourced from ctx.currentUser ONLY (never input).
	 *
	 * STRIDE (threat_model 255-02):
	 *   S (T-255-02) — userId = ctx.currentUser?.id, UNAUTHORIZED if absent;
	 *                  role/userId NEVER read from input.
	 *   I (T-255-01) — canAccessDisplay gates BEFORE any capture: a non-admin
	 *                  member/guest cannot screenshot a display whose non-empty
	 *                  owner_session is not their own session (FORBIDDEN).
	 *   T (T-255-03) — `display` validated by displayIdSchema (`:N`/`:N.M`) at
	 *                  the zod boundary; passed as a subprocess env var (not a
	 *                  shell string), captureScreenshot uses execFile (not exec).
	 *   I (T-255-04) — captureScreenshot({display}) threads DISPLAY into the
	 *                  subprocess env only; process.env is never mutated, so
	 *                  concurrent 2s polls cannot cross-contaminate.
	 *   I (T-255-05) — only the display id is logged; the dataUrl/base64 image
	 *                  bytes are NEVER logged.
	 */
	screenshot: privateProcedure
		.input(z.object({display: displayIdSchema}))
		.query(async ({ctx, input}) => {
			// STRIDE-S (T-255-02): caller identity from ctx.currentUser ONLY.
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

			// STRIDE-I (T-255-01): reuse canAccessDisplay verbatim (254-06) —
			// empty owner_session = host/shared = allowed; admin bypass; else only
			// the legitimate owner. Gates BEFORE any capture so a foreign member
			// never triggers a screenshot of another user's display.
			const callerRole = ctx.currentUser?.role ?? 'member'
			if (
				!canAccessDisplay({
					ownerSession: record.owner_session,
					callerSession: userId,
					callerRole,
				})
			) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'display owned by another session',
				})
			}

			// STRIDE-I (T-255-05): log only the display id — never the dataUrl
			// or base64 image bytes.
			ctx.logger?.log?.(`displays.screenshot user=${userId} display=${input.display}`)

			// Subprocess-scoped DISPLAY (T-255-04): captureScreenshot threads
			// input.display into the maim/scrot env only, no global mutation.
			const shot = await captureScreenshot({display: input.display})
			return {
				dataUrl: `data:${shot.mimeType};base64,${shot.base64}`,
				width: shot.width,
				height: shot.height,
			}
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
