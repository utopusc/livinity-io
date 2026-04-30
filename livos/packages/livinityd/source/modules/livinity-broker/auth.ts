import type {Request, Response, NextFunction} from 'express'
import {isMultiUserMode} from '../ai/per-user-claude.js'
import {findUserById, getAdminUser} from '../database/index.js'
import type Livinityd from '../../index.js'

/**
 * Container source IP guard for the broker route.
 *
 * Allowlist (per D-41-08 + 41-AUDIT.md Section 7b — expanded in Phase 41.1 hotfix):
 *   - 127.0.0.1            (IPv4 loopback)
 *   - ::1                  (IPv6 loopback)
 *   - ::ffff:127.0.0.1     (IPv4-mapped-IPv6 loopback — strip prefix before matching)
 *   - 172.16.0.0/12        (RFC 1918 Docker bridge range — covers default bridge 172.17.x.x
 *                           AND per-app compose networks 172.18-172.31.x.x; required because
 *                           every per-app docker-compose creates its own bridge network in
 *                           172.18+ subnets, not the default 172.17 bridge)
 *
 * Everything else → HTTP 401 + JSON error body.
 *
 * Threat model note: external traffic CANNOT reach this route in production
 * because the Mini PC firewall blocks port 8080 externally and livinityd's
 * existing CORS + helmet stack handles internet-facing routes elsewhere — but
 * this guard is defense-in-depth in case of future misconfiguration. See
 * 41-AUDIT.md Section 7b for full rationale.
 */
export function containerSourceIpGuard(req: Request, res: Response, next: NextFunction): void {
	let ip = req.socket.remoteAddress || ''
	// Strip IPv4-mapped-IPv6 prefix (e.g. ::ffff:127.0.0.1)
	if (ip.startsWith('::ffff:')) ip = ip.slice(7)

	if (ip === '127.0.0.1' || ip === '::1') {
		next()
		return
	}

	// CIDR check for 172.16.0.0/12 (Docker bridge networks — RFC 1918 block)
	// Covers default bridge (172.17.x.x) and per-app compose networks (172.18.x.x ... 172.31.x.x)
	if (ip.startsWith('172.')) {
		const parts = ip.split('.')
		if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p) && +p >= 0 && +p <= 255)) {
			const second = +parts[1]
			if (second >= 16 && second <= 31) {
				next()
				return
			}
		}
	}

	res.status(401).json({
		type: 'error',
		error: {
			type: 'authentication_error',
			message: `request source ip ${ip || '(unknown)'} not on broker allowlist`,
		},
	})
}

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
