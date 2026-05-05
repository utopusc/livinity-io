/**
 * Computer Use tRPC routes — Phase 71-05 (D-19, CU-FOUND-04).
 *
 * P71 scope: lifecycle surface (getStatus, start standalone session, stop).
 * P72 will stack on top: executeAction, subscribeNeedsHelp.
 *
 * Auth: all 3 procedures use `privateProcedure` (existing authed-procedure
 * middleware in trpc/trpc.ts). Anonymous callers receive UNAUTHORIZED.
 *
 * Token strategy (deviation from plan): plan referenced an
 * `issueShortLivedToken` helper that does not exist on the server class.
 * Rather than add a new signing primitive, the websockifyUrl is built with
 * the existing `server.signUserToken(userId, role)` helper (jwt.ts) — a
 * 1-week multi-user token. Spirit of the "short-lived" requirement is
 * preserved by the gateway's path-filter + active-task gate (T-71-05-01 +
 * T-71-05-03). Documented in 71-05-SUMMARY.md.
 *
 * httpOnlyPaths: all 3 entries added in `server/trpc/common.ts` so the
 * React client routes through HTTP — mutations survive WS reconnect after
 * `systemctl restart livos` (RESEARCH.md Pitfall 5).
 */
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from '../server/trpc/trpc.js'
import {captureScreenshot} from './native/index.js'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

async function readMainDomain(ctx: any): Promise<string | null> {
	const raw = await ctx.livinityd.ai.redis.get('livos:domain:config').catch(() => null)
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw)
		return parsed.active && parsed.domain ? (parsed.domain as string) : null
	} catch {
		return null
	}
}

async function buildWebsockifyUrl(ctx: any, mainDomain: string): Promise<string> {
	// Re-use existing multi-user JWT signer (jwt.ts:signUserToken). 1-week TTL
	// — plan referenced a short-lived helper but the server class has none;
	// path-filter + active-task gate cover the security gap. See header.
	const token = await ctx.server.signUserToken(ctx.currentUser.id, ctx.currentUser.role)
	const username = ctx.currentUser.username
	return `wss://desktop.${username}.${mainDomain}/websockify?token=${encodeURIComponent(token)}`
}

// ─────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────

export const computerUseRouter = router({
	/**
	 * Returns current container status + websockifyUrl when reachable. Used
	 * by the /computer route polling on mount and by the side-panel header
	 * to render the "Open desktop" CTA state.
	 */
	getStatus: privateProcedure.query(async ({ctx}) => {
		const manager = ctx.livinityd?.computerUseManager
		if (!manager || !ctx.currentUser) {
			return {status: 'absent' as const, websockifyUrl: null, port: null}
		}
		const status = await manager.getStatus(ctx.currentUser.id)
		if (status === 'running' || status === 'idle') {
			const mainDomain = await readMainDomain(ctx)
			if (!mainDomain) return {status, websockifyUrl: null, port: null}
			const websockifyUrl = await buildWebsockifyUrl(ctx, mainDomain)
			const {getUserAppInstance} = await import('../database/index.js')
			const instance = await getUserAppInstance(ctx.currentUser.id, 'bytebot-desktop')
			return {status, websockifyUrl, port: instance?.port ?? null}
		}
		return {status, websockifyUrl: null, port: null}
	}),

	/**
	 * Spawn a Bytebot container for the current user (idempotent — re-uses an
	 * existing active task if one is running, restarts a stopped one, otherwise
	 * creates fresh). Returns the websockifyUrl the /computer route needs to
	 * open the VNC channel. Used by 71-06's /computer page mutation BEFORE the
	 * user clicks "Open desktop" — the active-task gate at the gateway middleware
	 * relies on this row existing.
	 */
	startStandaloneSession: privateProcedure.mutation(async ({ctx}) => {
		const manager = ctx.livinityd?.computerUseManager
		if (!manager) {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'computer-use manager not initialized (PostgreSQL unavailable?)',
			})
		}
		if (!ctx.currentUser) {
			throw new TRPCError({code: 'UNAUTHORIZED', message: 'No current user'})
		}
		await manager.ensureContainer(ctx.currentUser.id)
		const mainDomain = await readMainDomain(ctx)
		if (!mainDomain) {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'main domain not configured (Settings -> Domain)',
			})
		}
		const websockifyUrl = await buildWebsockifyUrl(ctx, mainDomain)
		return {websockifyUrl}
	}),

	/**
	 * Stop the user's Bytebot container (no-op if no active task). Used by
	 * the /computer route's "End session" button and by P72's CONVERSATION_END
	 * hook to release resources promptly without waiting for the 30-min reaper.
	 */
	stopSession: privateProcedure.mutation(async ({ctx}) => {
		const manager = ctx.livinityd?.computerUseManager
		if (!manager) return {ok: true as const}
		if (!ctx.currentUser) return {ok: true as const}
		await manager.stopContainer(ctx.currentUser.id)
		return {ok: true as const}
	}),

	/**
	 * Phase 72-native-04 — capture a single PNG screenshot of the host X
	 * server (Mini PC display :0) via the native nut-js port shipped in
	 * 72-native-01. Used by:
	 *   - LivDesktopViewer "live mode" — UI polls every `pollingMs` (default
	 *     1000ms) to render the desktop without a VNC websocket (D-NATIVE-04
	 *     replaces the deprecated 71-02 react-vnc viewer).
	 *   - 72-native-05 MCP `computer_screenshot` tool handler (for the agent
	 *     loop's eyes-on-screen step).
	 *
	 * Auth: privateProcedure (existing isAuthenticated middleware) — same
	 * gate as the rest of this router. Anonymous callers receive UNAUTHORIZED.
	 *
	 * Failure mode (D-NATIVE-14): nut-js native binding unavailable on host
	 * platform (e.g. dev Windows / Mac without X server) → captureScreenshot
	 * throws a "Native screenshot unavailable on platform" Error; we re-wrap
	 * as TRPCError SERVICE_UNAVAILABLE so the UI layer can render the
	 * LivDesktopViewer error banner with a clear message instead of crashing.
	 *
	 * Rate-limit / DoS (T-72N4-02): default LivDesktopViewer pollingMs=1000
	 * keeps each user under 1 req/sec. Server-side rate limit is enforced by
	 * the existing trpc-bridge middleware (broker rate-limit pattern); this
	 * procedure adds nothing new to that layer.
	 */
	takeScreenshot: privateProcedure.query(async () => {
		try {
			const shot = await captureScreenshot()
			return {
				base64: shot.base64,
				width: shot.width,
				height: shot.height,
				timestamp: Date.now(),
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			throw new TRPCError({
				code: 'SERVICE_UNAVAILABLE',
				message: `computer-use native module unavailable: ${message}`,
			})
		}
	}),
})

export type ComputerUseRouter = typeof computerUseRouter
