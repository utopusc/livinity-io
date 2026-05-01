/**
 * Phase 46 Plan 02 — fail2ban audit event writer (REUSE device_audit_log).
 *
 * Per FR-F2B-04 and the must-have invariant in 46-02-PLAN.md: this module
 * REUSES the existing `device_audit_log` table from Phase 15 (AUDIT-01/02)
 * — NO new table, NO migration. Sentinel `device_id = 'fail2ban-host'`
 * marks rows as fail2ban events; `tool_name` carries the action verb
 * (`unban_ip` | `ban_ip` | `whitelist_ip`).
 *
 * REUSE invariants (verified by grep in 46-02-PLAN.md acceptance criteria):
 *   - `computeParamsDigest` from devices/audit-pg.ts (NOT redefined here)
 *   - `getPool` from database/index.ts (audit-pg.ts itself imports the same path)
 *   - `device_audit_log` SQL — same column shape as Phase 15
 *   - `'fail2ban-host'` sentinel literal — readable by listEvents in routes.ts
 *
 * Fire-and-forget contract (per threat T-46-08): this function MUST NEVER
 * re-throw to the caller. PG outage → log + try JSON belt-and-suspenders
 * write. JSON write failure → log + return. Routes.ts mutations never block
 * on audit-write failures.
 *
 * Belt-and-suspenders JSON row write (per architecture research §Cross-Cut +
 * pitfall M-02 UUID suffix): every event also writes a JSON file at
 * /opt/livos/data/security-events/<ts>-<uuid8>-<action>.json so an offline
 * forensics path exists if PG is down. This mirrors Phase 33 OBS-01 schema.
 */

import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import {getPool} from '../database/index.js'
// REUSE: computeParamsDigest is the existing audit hashing function.
// Importing from audit-pg.js (NOT redefining) is the FR-F2B-04 invariant.
import {computeParamsDigest} from '../devices/audit-pg.js'

const SECURITY_EVENTS_DIR = '/opt/livos/data/security-events'
const SENTINEL_DEVICE_ID = 'fail2ban-host'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface Fail2banAuditEvent {
	action: 'unban_ip' | 'ban_ip' | 'whitelist_ip'
	jail: string
	ip: string
	userId: string
	username: string
	source: 'ui' | 'api'
	success: boolean
	error?: string
}

interface MinimalLogger {
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

/**
 * Append a fail2ban admin action to the audit log. Fire-and-forget — caller
 * `await`s but never sees a thrown error. Both the PG INSERT and the JSON
 * row write are wrapped in independent try/catch.
 *
 * Schema written to device_audit_log:
 *   user_id       := event.userId (NIL_UUID fallback for missing-user cases)
 *   device_id     := 'fail2ban-host'           ← sentinel
 *   tool_name     := event.action              ← 'unban_ip' | 'ban_ip' | 'whitelist_ip'
 *   params_digest := sha256(JSON.stringify({jail, ip}))
 *   success       := event.success
 *   error         := event.error ?? null
 *   timestamp     := DEFAULT NOW()
 *
 * JSON row written to /opt/livos/data/security-events/<ts>-<uuid8>-<action>.json:
 *   { ts, action, jail, ip, userId, username, source, success, error? }
 */
export async function recordFail2banEvent(
	event: Fail2banAuditEvent,
	logger: MinimalLogger = console,
): Promise<void> {
	const paramsDigest = computeParamsDigest({jail: event.jail, ip: event.ip})

	// Path 1: PostgreSQL INSERT into device_audit_log (REUSE — no new table).
	const pool = getPool()
	if (pool) {
		try {
			await pool.query(
				`INSERT INTO device_audit_log
				   (user_id, device_id, tool_name, params_digest, success, error)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					event.userId && event.userId.length > 0 ? event.userId : NIL_UUID,
					SENTINEL_DEVICE_ID,
					event.action,
					paramsDigest,
					event.success,
					event.error ?? null,
				],
			)
		} catch (err) {
			logger.error('[fail2ban-events] PG INSERT failed:', err)
			// Fall through to JSON write.
		}
	}

	// Path 2: belt-and-suspenders JSON row (offline forensics path).
	try {
		const ts = Date.now()
		const id = randomUUID().slice(0, 8)
		const file = path.join(SECURITY_EVENTS_DIR, `${ts}-${id}-${event.action}.json`)
		await fs.mkdir(SECURITY_EVENTS_DIR, {recursive: true})
		await fs.writeFile(file, JSON.stringify({ts, ...event}, null, 2), 'utf8')
	} catch (err) {
		logger.warn('[fail2ban-events] JSON write failed (non-fatal):', err)
	}
	// Fire-and-forget: no re-throw. Caller proceeds regardless.
}
