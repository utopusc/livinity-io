/**
 * Phase 46 Plan 03 — fail2ban-admin module barrel.
 *
 * Re-exports the public API surface of the four Wave-2 source files
 * (parser/client/active-sessions/events) and adds six high-level convenience
 * functions that wrap `realFail2banClient` so `routes.ts` can import a stable
 * functional facade.
 *
 * The convenience functions are thin pass-throughs, NOT a second abstraction
 * layer — their purpose is purely to give routes.ts a tidy import surface
 * (`import {listJails, banIp, ...} from './index.js'`) instead of forcing
 * routes.ts to deal with the `realFail2banClient` object directly.
 *
 * `listEvents` is the one outlier: it queries `device_audit_log` directly
 * instead of going through fail2ban-client. It REUSES `getPool()` from
 * `database/index.js` and the sentinel device_id='fail2ban-host' contract
 * from `events.ts`. Returns an empty array when the pool is null (test rigs
 * / pre-init).
 */

export {
	realFail2banClient,
	makeFail2banClient,
	Fail2banClientError,
	type Fail2banErrorKind,
	type ExecFileFn,
	type Fail2banClient,
} from './client.js'
export {
	realActiveSessionsProvider,
	makeActiveSessionsProvider,
	type ActiveSessionsProvider,
	type ActiveSshSession,
} from './active-sessions.js'
export {recordFail2banEvent, type Fail2banAuditEvent} from './events.js'
export {parseJailList, parseJailStatus, parseAuthLogForLastUser, parseWhoOutput} from './parser.js'

import {realFail2banClient} from './client.js'
import {getPool} from '../database/index.js'

// ─── Convenience high-level functions (wrap realFail2banClient) ──────────────

export async function listJails(): Promise<string[]> {
	return realFail2banClient.listJails()
}

export async function getJailStatus(jail: string): Promise<{
	currentlyFailed: number
	totalFailed: number
	currentlyBanned: number
	totalBanned: number
	bannedIps: string[]
}> {
	return realFail2banClient.getJailStatus(jail)
}

export async function unbanIp(jail: string, ip: string): Promise<void> {
	return realFail2banClient.unbanIp(jail, ip)
}

export async function banIp(jail: string, ip: string): Promise<void> {
	return realFail2banClient.banIp(jail, ip)
}

export async function addIgnoreIp(jail: string, ip: string): Promise<void> {
	return realFail2banClient.addIgnoreIp(jail, ip)
}

// ─── Audit-log read API (FR-F2B-04 surfacing) ────────────────────────────────

export interface Fail2banEventRow {
	id: number
	timestamp: string
	user_id: string
	admin_username: string | null
	tool_name: 'unban_ip' | 'ban_ip' | 'whitelist_ip'
	params_digest: string
	success: boolean
	error: string | null
}

/**
 * Read the most recent fail2ban events from device_audit_log. Filters by
 * sentinel `device_id='fail2ban-host'` and the three known tool_name values.
 * JOINs `users u ON u.id = user_id` to surface the admin username for UI.
 *
 * Returns `[]` if the pool is null (test rigs / pre-init / shutdown). Never
 * throws — read-side audit failures should not break the UI.
 */
export async function listEvents(opts: {limit: number}): Promise<Fail2banEventRow[]> {
	const pool = getPool()
	if (!pool) return []
	const limit = Math.max(1, Math.min(200, Math.floor(opts.limit)))
	try {
		const result = await pool.query(
			`SELECT
			   d.id,
			   d.timestamp,
			   d.user_id,
			   u.username AS admin_username,
			   d.tool_name,
			   d.params_digest,
			   d.success,
			   d.error
			 FROM device_audit_log d
			 LEFT JOIN users u ON u.id = d.user_id
			 WHERE d.device_id = 'fail2ban-host'
			   AND d.tool_name IN ('unban_ip', 'ban_ip', 'whitelist_ip')
			 ORDER BY d.timestamp DESC
			 LIMIT $1`,
			[limit],
		)
		return (result.rows ?? []) as Fail2banEventRow[]
	} catch {
		return []
	}
}
