import type {Request, Response} from 'express'
import {isMultiUserMode} from '../ai/per-user-claude.js'
import {findUserById, getAdminUser} from '../database/index.js'
import type Livinityd from '../../index.js'

/**
 * Resolve userId from URL param + authorize.
 *
 * Behavior:
 *   - Returns HTTP 400 if userId fails the `/^[a-zA-Z0-9_-]+$/` shape check
 *     (defense-in-depth against path traversal at the gate, even before DB lookup)
 *   - Returns HTTP 404 if userId is not in the users table
 *   - Returns HTTP 403 if multi-user mode is OFF and userId != admin's id
 *     (the broker is a multi-user feature; single-user mode users should call
 *      /api/agent/stream directly via the existing chat UI)
 *
 * Returns the resolved userId on success, or `undefined` after writing the
 * error response (the caller should `return` immediately when undefined).
 *
 * Per 41-AUDIT.md Section 4 (corrected from plan example): users-table API
 * is `findUserById` + `getAdminUser` from `'../../database/index.js'`, not
 * `livinityd.users.*` methods.
 *
 * Phase 60 — `containerSourceIpGuard` removed from this module
 * (FR-BROKER-B2-01). Identity is now established by Phase 59 Bearer middleware
 * for external traffic via api.livinity.io; for internal Mini-PC-LAN traffic
 * without a Bearer header the Phase 59 middleware falls through and this
 * URL-path resolver remains the legacy identity surface.
 */
export async function resolveAndAuthorizeUserId(
	req: Request,
	res: Response,
	livinityd: Livinityd,
): Promise<{userId: string} | undefined> {
	const userId = req.params.userId
	// Defensive userId shape — same regex as getUserClaudeDir validation
	if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
		res.status(400).json({
			type: 'error',
			error: {type: 'invalid_request_error', message: 'invalid user id'},
		})
		return undefined
	}

	const user = await findUserById(userId).catch(() => null)
	if (!user) {
		res.status(404).json({
			type: 'error',
			error: {type: 'not_found_error', message: 'user not found'},
		})
		return undefined
	}

	const multiUser = await isMultiUserMode(livinityd).catch(() => false)
	if (!multiUser) {
		// Single-user mode: only the admin user is permitted on the broker.
		const admin = await getAdminUser().catch(() => null)
		if (!admin || admin.id !== userId) {
			res.status(403).json({
				type: 'error',
				error: {type: 'forbidden', message: 'single-user mode: only admin user permitted on broker'},
			})
			return undefined
		}
	}

	return {userId}
}
