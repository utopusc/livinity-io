/**
 * Phase 328 SEC-01 — security-audit event writer (REUSE device_audit_log).
 *
 * Third instance of the established twin pattern (after Phase 46 fail2ban and
 * Phase 59 api-keys). Every admin MUTATION appends one row via
 * `recordAdminActionEvent` (sentinel `device_id = 'admin-action'`); every login
 * success + failure appends one row via `recordAuthLoginEvent` (sentinel
 * `device_id = 'auth-login'`). NO new table, NO migration — the existing
 * Phase 15 `device_audit_log` is append-only at the DB level via the
 * `device_audit_log_no_modify` trigger (schema.sql), so this writer only ever
 * INSERTs; it never UPDATEs/DELETEs.
 *
 * REUSE invariants:
 *   - `computeParamsDigest` from devices/audit-pg.ts (NOT redefined here)
 *   - `getPool` from database/index.ts (fail-open: null pool → skip PG, still JSON)
 *   - `device_audit_log` SQL — same column shape as Phase 15 / 46 / 59
 *
 * Fire-and-forget contract: NEITHER writer ever re-raises. PG outage → log +
 * try the JSON belt-and-suspenders write; JSON failure → log + return. A failed
 * audit write must NEVER break the audited mutation or the login flow.
 */

import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import {getPool} from '../database/index.js'
// REUSE: computeParamsDigest is the existing audit hashing function from
// Phase 15. Importing from audit-pg.js (NOT redefining) is the SEC-01 invariant.
import {computeParamsDigest} from '../devices/audit-pg.js'

const SECURITY_EVENTS_DIR = '/opt/livos/data/security-events'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

// Two sentinels so listAdminAuditEvents (Plan 04) can filter admin mutations
// vs auth events independently — both live in the ONE shared device_audit_log.
const ADMIN_ACTION_SENTINEL = 'admin-action'
const AUTH_LOGIN_SENTINEL = 'auth-login'

export interface AdminActionAuditEvent {
	action: string // tRPC path, e.g. 'docker.pruneImages'
	userId: string
	// INVARIANT (Pitfall 3): the caller passes redact()ed input; events.ts never
	// sees raw secrets. This object flows into BOTH the params_digest hash AND
	// the JSON forensics file, so it must already be scrubbed upstream.
	redactedInput?: unknown
	success: boolean
	error?: string
}

export interface AuthLoginAuditEvent {
	userId: string
	success: boolean
	error?: string
}

interface MinimalLogger {
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

/**
 * Shared twin-sink writer. Fire-and-forget: both the PG INSERT and the JSON
 * row write are independently try/catch'd and NEITHER re-raises.
 *
 * @param sentinel      device_id sentinel ('admin-action' | 'auth-login')
 * @param toolName      action verb / tRPC path stored in tool_name
 * @param userId        actor user id (NIL_UUID fallback for missing user)
 * @param digestSource  object hashed into params_digest (already redacted; may be null)
 * @param jsonPayload   object serialized into the JSON forensics file (already redacted)
 * @param success       whether the audited action succeeded
 * @param error         optional failure reason (never a secret)
 * @param logger        injectable logger (defaults to console)
 */
async function writeAuditRow(
	sentinel: string,
	toolName: string,
	userId: string,
	digestSource: unknown,
	jsonPayload: Record<string, unknown>,
	success: boolean,
	error: string | undefined,
	logger: MinimalLogger,
): Promise<void> {
	const paramsDigest = computeParamsDigest(digestSource)

	// Path 1: PostgreSQL INSERT into device_audit_log (REUSE — no new table).
	const pool = getPool()
	if (pool) {
		try {
			await pool.query(
				`INSERT INTO device_audit_log
				   (user_id, device_id, tool_name, params_digest, success, error)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					userId && userId.length > 0 ? userId : NIL_UUID,
					sentinel,
					toolName,
					paramsDigest,
					success,
					error ?? null,
				],
			)
		} catch (err) {
			logger.error('[security-audit.events] PG INSERT failed:', err)
			// Fall through to JSON write.
		}
	}

	// Path 2: belt-and-suspenders JSON row (offline forensics path). The payload
	// is already redacted by the caller (Pitfall 3) — no raw secret reaches here.
	try {
		const ts = Date.now()
		const id = randomUUID().slice(0, 8)
		const file = path.join(SECURITY_EVENTS_DIR, `${ts}-${id}-${sentinel}.json`)
		await fs.mkdir(SECURITY_EVENTS_DIR, {recursive: true})
		await fs.writeFile(file, JSON.stringify({ts, ...jsonPayload}, null, 2), 'utf8')
	} catch (err) {
		logger.warn('[security-audit.events] JSON write failed (non-fatal):', err)
	}
	// Fire-and-forget: never re-raises. Caller proceeds regardless.
}

/**
 * Append one admin-action row (device_id='admin-action') for an audited admin
 * MUTATION. Called by the auditAdminAction middleware AFTER the role gate.
 * `redactedInput` MUST already be scrubbed by redact() at the call site.
 */
export async function recordAdminActionEvent(
	event: AdminActionAuditEvent,
	logger: MinimalLogger = console,
): Promise<void> {
	await writeAuditRow(
		ADMIN_ACTION_SENTINEL,
		event.action,
		event.userId,
		event.redactedInput,
		{
			action: event.action,
			userId: event.userId,
			redactedInput: event.redactedInput,
			success: event.success,
			error: event.error,
		},
		event.success,
		event.error,
		logger,
	)
}

/**
 * Append one auth-login row (device_id='auth-login') for a login success OR
 * failure. A manual call site (login is publicProcedure, so the adminProcedure
 * audit middleware never sees it). Pitfall 2: NO input is ever captured for
 * login — the password / totpToken must NEVER be passed here.
 */
export async function recordAuthLoginEvent(
	event: AuthLoginAuditEvent,
	logger: MinimalLogger = console,
): Promise<void> {
	await writeAuditRow(
		AUTH_LOGIN_SENTINEL,
		'login',
		event.userId,
		// No input digest source for login — the password is never captured.
		null,
		{
			action: 'login',
			userId: event.userId,
			success: event.success,
			error: event.error,
		},
		event.success,
		event.error,
		logger,
	)
}

// Re-export the sentinel literals so Plan 04's viewer can reference the same
// constants (it may also inline them).
export {ADMIN_ACTION_SENTINEL, AUTH_LOGIN_SENTINEL}
