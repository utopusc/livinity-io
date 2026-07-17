import {TRPCError} from '@trpc/server'
import {timingSafeEqual} from 'node:crypto'

import {type Context} from './context.js'
import {findUserById, getAdminUser, getPool} from '../../database/index.js'
import {isSessionRevoked} from '../../database/sessions.js'

type MiddlewareOptions = {
	ctx: Context
	next: () => Promise<any>
}

// Phase 203 Hot-fix F5 — constant-time compare for the service-token shortcut.
// Length mismatch returns false without invoking timingSafeEqual (which throws
// on differing-length buffers). The length leak is acceptable because the
// expected token length is derived from a public env var generator.
function safeTokenCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const isAuthenticated = async ({ctx, next}: MiddlewareOptions) => {
	if (ctx.dangerouslyBypassAuthentication === true) return next()

	// Bypass authentication for websocket requests since auth is handled
	// on connection by express.
	if (ctx.transport === 'ws') return next()

	// Phase 203 Hot-fix F5 — service-token auth shortcut.
	// `openclawos-router.ts:23` (D-203-12) anticipated this path: the openclaw
	// gateway plugin (`liv-claw-os/packages/claw-plugin`) calls livinityd's
	// tRPC layer over loopback but cannot hold an admin JWT. When the request
	// carries an `X-Api-Key` header matching `process.env.LIV_API_KEY`, treat
	// it as an internal service call and map to the admin user. Falls through
	// to the JWT/cookie path on mismatch (NOT throw).
	const apiKeyHeader = ctx.request?.headers['x-api-key']
	const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader
	const expectedApiKey = process.env['LIV_API_KEY']
	if (
		typeof apiKey === 'string' &&
		typeof expectedApiKey === 'string' &&
		expectedApiKey.length >= 8 &&
		safeTokenCompare(apiKey, expectedApiKey)
	) {
		try {
			const adminUser = await getAdminUser()
			if (adminUser) {
				ctx.currentUser = {
					id: adminUser.id,
					username: adminUser.username,
					role: adminUser.role,
				}
			}
		} catch {
			// Legacy single-user mode (no DB) — Phase 256-04 fix E:
			// mark the service call as admin-equivalent via the EXPLICIT
			// legacySingleUser flag so the new requireRole rule (which no
			// longer treats absent currentUser as admin) does NOT regress
			// the openclaw/loopback service path to FORBIDDEN.
			ctx.legacySingleUser = true
		}
		return next()
	}

	try {
		// Try Bearer token first, then fall back to LIVINITY_SESSION cookie
		let token = ctx.request?.headers.authorization?.split(' ')[1]
		if (!token) {
			token = ctx.request?.cookies?.LIVINITY_SESSION
		}
		if (token === undefined) throw new Error('Missing token')
		const payload = await ctx.server.verifyToken(token)

		// Try to resolve the current user from the token payload
		if (payload.userId) {
			// New multi-user token: look up user by ID.
			// Phase 256-04 (LIVOS-004): a userId-bearing token MUST resolve to
			// an ACTIVE user. If the user was deactivated or deleted, FAIL
			// CLOSED — throw UNAUTHORIZED rather than falling through with no
			// currentUser (which requireRole previously treated as legacy
			// admin, silently promoting a disabled user to admin-equivalent).
			const dbUser = await findUserById(payload.userId)
			if (dbUser && dbUser.isActive) {
				// Phase 257-04 (LIVOS-005), FAIL-OPEN-FIXED 257-04.1: jti revocation
				// gate. Reject ONLY when the token's jti has an EXPLICITLY revoked
				// row (password change / deactivation set revoked=TRUE). A MISSING
				// row → ALLOW: tokens minted before session-tracking existed (or if
				// createSession ever fails) carry a jti but no row, and must NOT be
				// locked out (the original isSessionActive check rejected on missing
				// row → false-revoked every existing session = production lockout).
				// Legacy no-jti tokens + single-user no-DB path skip this entirely.
				if (payload.jti && getPool()) {
					const revoked = await isSessionRevoked(payload.jti)
					if (revoked) {
						throw new TRPCError({
							code: 'UNAUTHORIZED',
							message: 'Session revoked',
						})
					}
				}
				ctx.currentUser = {
					id: dbUser.id,
					username: dbUser.username,
					role: dbUser.role,
				}
			} else {
				throw new TRPCError({
					code: 'UNAUTHORIZED',
					message: 'User inactive or not found',
				})
			}
		} else {
			// Legacy token (no userId): map to admin user if DB is available
			const adminUser = await getAdminUser()
			if (adminUser) {
				ctx.currentUser = {
					id: adminUser.id,
					username: adminUser.username,
					role: adminUser.role,
				}
			} else {
				// Genuine legacy single-user mode (no DB admin). Phase 256-04:
				// mark admin-equivalent via the EXPLICIT flag so requireRole
				// admits it (no longer inferring admin from absent currentUser).
				ctx.legacySingleUser = true
			}
		}
	} catch (error) {
		// Preserve the fail-closed UNAUTHORIZED from the userId branch above;
		// don't relabel it as a generic "Invalid token".
		if (error instanceof TRPCError) throw error
		ctx.logger.error('Failed to verify token', error)
		throw new TRPCError({code: 'UNAUTHORIZED', message: 'Invalid token'})
	}

	return next()
}

export const isAuthenticatedIfUserExists = async ({ctx, next}: MiddlewareOptions) => {
	// Allow request through if user has not yet been registered
	const userExists = await ctx.user.exists()
	if (!userExists) {
		return next()
	}

	// If a user exists, follow usual authentication flow
	return isAuthenticated({ctx, next})
}

/**
 * Middleware factory that requires a specific role.
 * Must be used AFTER isAuthenticated.
 */
/**
 * Backups-v2 P0 (D10) — role gate that opens ONLY pre-first-user.
 * Composes after isAuthenticatedIfUserExists: while no user exists (fresh-box
 * onboarding restore) the request passes; the moment any user exists the full
 * requireRole check applies. Without this, restoreBackup (full-box restore +
 * reboot) was callable by ANY authenticated user.
 */
export const requireRoleIfUserExists = (requiredRole: string) => {
	return async ({ctx, next}: MiddlewareOptions) => {
		// ctx.user! — same runtime guarantee as isAuthenticatedIfUserExists above;
		// the `!` keeps this NEW middleware off the ctx-partial tsc baseline.
		const userExists = await ctx.user!.exists()
		if (!userExists) return next()
		return requireRole(requiredRole)({ctx, next})
	}
}

export const requireRole = (requiredRole: string) => {
	return async ({ctx, next}: MiddlewareOptions) => {
		// Phase 256-04 (LIVOS-004): never INFER legacy/admin from an absent
		// currentUser. Admit the no-currentUser case ONLY when isAuthenticated
		// set the EXPLICIT ctx.legacySingleUser flag (genuine single-user mode
		// or the X-Api-Key service-token no-DB path / fix E). Any other absent
		// currentUser (e.g. a userId-bearing token that failed to resolve —
		// which now throws upstream anyway) is FORBIDDEN, not admin.
		if (!ctx.currentUser) {
			if (ctx.legacySingleUser === true) return next()
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: 'Authentication required',
			})
		}

		const roleHierarchy: Record<string, number> = {
			admin: 3,
			member: 2,
			guest: 1,
		}

		// Phase 335 (fail-open fix): an UNRECOGNIZED role string used to map to
		// level 0 via `|| 0`, which PASSED any gate whose required level was also
		// 0 (e.g. requireRole('guest')-class checks). Unknown roles now map to -1
		// and fail EVERY gate — fail closed.
		const userLevel = roleHierarchy[ctx.currentUser.role] ?? -1
		// Review INFO-1: symmetric fail-closed on an unknown REQUIRED role. `|| 0`
		// let an unrecognized requiredRole map to level 0 (everyone passes); ??
		// Infinity denies all. `requireRole` is only ever called with 'admin'
		// today, so this is latent-hole hardening, not a behavior change.
		const requiredLevel = roleHierarchy[requiredRole] ?? Infinity

		if (userLevel < requiredLevel) {
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: `This action requires ${requiredRole} role`,
			})
		}

		return next()
	}
}
