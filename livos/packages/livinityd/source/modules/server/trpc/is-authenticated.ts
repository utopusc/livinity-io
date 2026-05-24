import {TRPCError} from '@trpc/server'
import {timingSafeEqual} from 'node:crypto'

import {type Context} from './context.js'
import {findUserById, getAdminUser} from '../../database/index.js'

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
			// Legacy single-user mode (no DB) — fall through with no
			// currentUser; downstream procedures handle that case.
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
			// New multi-user token: look up user by ID
			const dbUser = await findUserById(payload.userId)
			if (dbUser && dbUser.isActive) {
				ctx.currentUser = {
					id: dbUser.id,
					username: dbUser.username,
					role: dbUser.role,
				}
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
			}
			// If no DB admin found, that's okay -- legacy single-user mode still works
		}
	} catch (error) {
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
export const requireRole = (requiredRole: string) => {
	return async ({ctx, next}: MiddlewareOptions) => {
		// If no currentUser is set, we're in legacy single-user mode -- treat as admin
		if (!ctx.currentUser) return next()

		const roleHierarchy: Record<string, number> = {
			admin: 3,
			member: 2,
			guest: 1,
		}

		const userLevel = roleHierarchy[ctx.currentUser.role] || 0
		const requiredLevel = roleHierarchy[requiredRole] || 0

		if (userLevel < requiredLevel) {
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: `This action requires ${requiredRole} role`,
			})
		}

		return next()
	}
}
