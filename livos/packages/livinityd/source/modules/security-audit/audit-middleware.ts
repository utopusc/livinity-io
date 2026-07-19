/**
 * Phase 328 SEC-01 — adminProcedure audit middleware.
 *
 * A plain-async tRPC middleware (mirrors requireRole in is-authenticated.ts;
 * NOT t.middleware(), so there is no import cycle with trpc.ts). Mounted AFTER
 * requireRole('admin') on adminProcedure so an unauthorized caller throws in
 * the role gate and is NEVER logged as a legitimate admin action (ASVS V4 /
 * threat T-328-03). Only MUTATIONS are audited — queries return next()
 * immediately so a 5s-polling dashboard tab cannot flood the table (Pitfall 1
 * / threat T-328-02).
 *
 * The raw input is read via getRawInput() (the tRPC v11 API for a
 * base-procedure middleware mounted before .input(); opts.input is undefined
 * here) and passed through redact() BEFORE it reaches either audit sink
 * (Pitfall 3 / threat T-328-01). events.ts treats the input as already-safe.
 */

import {type Context} from '../server/trpc/context.js' // type-only → no runtime cycle with trpc.ts
import {recordAdminActionEvent} from './events.js'
import {redact} from './redaction.js'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export const auditAdminAction = async (opts: {
	ctx: Context
	type: 'query' | 'mutation' | 'subscription'
	path: string
	getRawInput: () => Promise<unknown>
	next: () => Promise<any>
}) => {
	const {ctx, type, path, getRawInput, next} = opts
	// Pitfall 1 / T-328-02: never audit queries (write amplification from polls).
	if (type !== 'mutation') return next()

	const userId = ctx.currentUser?.id ?? NIL_UUID
	// Phase 346-02 (D-346-7): thread the MCP-key attribution through to the audit
	// row. Undefined for a human admin action (non-MCP rows unchanged).
	const mcpKeyId = ctx.mcpKeyId

	// Read + redact the raw input BEFORE either sink (Pitfall 3 / T-328-01).
	// getRawInput() is the v11 API for a base-procedure middleware (opts.input
	// is undefined at this composition point). A read failure must not block the
	// mutation — degrade to no-input rather than throwing.
	let redactedInput: unknown
	try {
		redactedInput = redact(await getRawInput())
	} catch {
		redactedInput = undefined
	}

	try {
		const result = await next()
		void recordAdminActionEvent({userId, action: path, redactedInput, success: true, mcpKeyId})
		return result
	} catch (err) {
		void recordAdminActionEvent({userId, action: path, redactedInput, success: false, error: String(err), mcpKeyId})
		throw err
	}
}
