/**
 * Phase 59 Plan 04 — api-keys audit event writer (REUSE device_audit_log).
 *
 * Per FR-BROKER-B1-04 + T-59-19 (Repudiation mitigation): every successful
 * `apiKeys.create` and `apiKeys.revoke` mutation appends one row to the
 * existing Phase 15 `device_audit_log` table. Sentinel `device_id =
 * 'api-keys-system'` distinguishes Phase 59 rows from Phase 15 device-tool
 * rows and Phase 46 fail2ban rows (`'fail2ban-host'`); `tool_name` carries
 * the action verb (`'create_key' | 'revoke_key'`).
 *
 * REUSE invariants (verified by 59-04-PLAN.md acceptance criteria):
 *   - `computeParamsDigest` from devices/audit-pg.ts (NOT redefined here)
 *   - `getPool` from database/index.ts
 *   - `device_audit_log` SQL — same column shape as Phase 15 / Phase 46
 *   - `'api-keys-system'` sentinel literal — readable by any future audit
 *     listing route that wants to filter for key-lifecycle events
 *
 * Fire-and-forget contract (per threat T-59-19): this function MUST NEVER
 * re-throw to the caller. PG outage → log + try JSON belt-and-suspenders
 * write. JSON write failure → log + return. Routes.ts mutations never
 * block on audit-write failures.
 *
 * Belt-and-suspenders JSON row write (mirror Phase 46 events.ts:103-111):
 * every event also writes a JSON file at
 * /opt/livos/data/security-events/<ts>-<uuid8>-<action>.json so an offline
 * forensics path exists if PG is down.
 *
 * Delta vs fail2ban-admin/events.ts (twin pattern):
 *   - SENTINEL_DEVICE_ID is `'api-keys-system'`, not `'fail2ban-host'`
 *   - action union is `'create_key' | 'revoke_key'` (NOT IP/jail verbs)
 *   - paramsDigest hashes `{keyId}` (NOT `{jail, ip}`)
 *   - NIL_UUID fallback path is DROPPED — Phase 59 always has a valid userId
 *     from `ctx.currentUser.id` (route-side privateProcedure gate); leaving
 *     the fallback in would silently mask a missing-userId regression. If
 *     userId is ever empty here, that's a bug to throw on, not paper over.
 */

import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import {getPool} from '../database/index.js'
// REUSE: computeParamsDigest is the existing audit hashing function from
// Phase 15. Importing from audit-pg.js (NOT redefining) is the FR-BROKER-B1-04
// invariant — guarded by 59-04-PLAN.md verification grep.
import {computeParamsDigest} from '../devices/audit-pg.js'

const SECURITY_EVENTS_DIR = '/opt/livos/data/security-events'
const SENTINEL_DEVICE_ID = 'api-keys-system'

export interface ApiKeyAuditEvent {
	action: 'create_key' | 'revoke_key'
	keyId: string
	userId: string
	username: string
	success: boolean
	error?: string
}

interface MinimalLogger {
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

/**
 * Append an api-keys lifecycle event to the audit log. Fire-and-forget —
 * caller `await`s but never sees a thrown error. Both the PG INSERT and
 * the JSON row write are wrapped in independent try/catch.
 *
 * Schema written to device_audit_log:
 *   user_id       := event.userId       (non-empty per route-side gate)
 *   device_id     := 'api-keys-system'  ← sentinel
 *   tool_name     := event.action        ← 'create_key' | 'revoke_key'
 *   params_digest := sha256(JSON.stringify({keyId}))
 *   success       := event.success
 *   error         := event.error ?? null
 *   timestamp     := DEFAULT NOW()
 *
 * JSON row written to /opt/livos/data/security-events/<ts>-<uuid8>-<action>.json:
 *   { ts, action, keyId, userId, username, success, error? }
 */
export async function recordApiKeyEvent(
	event: ApiKeyAuditEvent,
	logger: MinimalLogger = console,
): Promise<void> {
	const paramsDigest = computeParamsDigest({keyId: event.keyId})

	// Path 1: PostgreSQL INSERT into device_audit_log (REUSE — no new table).
	const pool = getPool()
	if (pool) {
		try {
			await pool.query(
				`INSERT INTO device_audit_log
				   (user_id, device_id, tool_name, params_digest, success, error)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					event.userId,
					SENTINEL_DEVICE_ID,
					event.action,
					paramsDigest,
					event.success,
					event.error ?? null,
				],
			)
		} catch (err) {
			logger.error('[api-keys.events] PG INSERT failed:', err)
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
		logger.warn('[api-keys.events] JSON write failed (non-fatal):', err)
	}
	// Fire-and-forget: no re-throw. Caller proceeds regardless.
}
