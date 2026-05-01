/**
 * Phase 46 Plan 03 — fail2ban-admin integration test.
 *
 * Mirrors livinity-broker/integration.test.ts: patches pg.Pool.prototype
 * BEFORE importing the fail2ban-admin module, then exercises the full tRPC
 * stack via `appRouter.createCaller(ctx)` with a synthetic admin context.
 *
 * Mocking strategy (per pitfall W-20 — no Vitest, no vi.mock):
 *   1. Patch pg.Pool.prototype.connect/query/end so events.ts and listEvents
 *      get a deterministic in-memory shim and we can assert INSERT happened.
 *   2. Re-bind `realFail2banClient` and `realActiveSessionsProvider` (mutable
 *      bindings via `Object.assign`) so the route handlers exercise our
 *      injected fakes without monkey-patching `child_process`.
 *   3. Build a tRPC caller from the real `appRouter` with a synthetic admin
 *      context (mimics ctx.currentUser + ctx.request shape Express produces).
 *
 * Coverage matrix (ten tests):
 *   1. listJails happy path                     →  state='running' + jails
 *   2. listJails ENOENT                          →  state='binary-missing'
 *   3. listJails service-down                    →  state='service-inactive'
 *   4. unbanIp happy path                        →  argv shape + audit row
 *   5. unbanIp + addToWhitelist=true             →  two execFile calls + tool_name='whitelist_ip'
 *   6. banIp self-ban without confirmation       →  TRPCError 'self_ban' (B-02)
 *   7. banIp self-ban WITH 'LOCK ME OUT'         →  succeeds + audit row
 *   8. banIp self-ban WITH cellularBypass=true   →  succeeds without confirmation (B-19)
 *   9. banIp CIDR /0                              →  Zod validation error BEFORE execFile (B-03)
 *  10. banIp shell-injection in jail name        →  Zod validation error (T-46-17)
 */

import assert from 'node:assert/strict'
import pg from 'pg'

// ─── Capture buffers (populated by mocks during each test) ───────────────────

interface AuditRow {
	user_id: string
	device_id: string
	tool_name: string
	params_digest: string
	success: boolean
	error: string | null
}
const insertedAuditRows: AuditRow[] = []

interface ExecCall {
	binary: string
	args: string[]
	opts: {timeout: number}
}
let execCalls: ExecCall[] = []

// ─── pg.Pool prototype patch (BEFORE module imports) ─────────────────────────

const originalConnect = pg.Pool.prototype.connect
const originalQuery = pg.Pool.prototype.query
const originalEnd = pg.Pool.prototype.end

;(pg.Pool.prototype as any).connect = async function () {
	return {
		query: async (sql: string, params?: unknown[]) => mockPoolQuery(sql, params),
		release: () => {},
	}
}
;(pg.Pool.prototype as any).query = async function (sql: string, params?: unknown[]) {
	return mockPoolQuery(sql, params)
}
;(pg.Pool.prototype as any).end = async function () {
	/* no-op */
}

function mockPoolQuery(sql: string, params?: unknown[]): {rows: unknown[]} {
	// Schema/migration queries → empty rows
	if (/CREATE TABLE|CREATE INDEX|CREATE EXTENSION|ALTER TABLE|^\s*--/.test(sql)) {
		return {rows: []}
	}
	// findUserById (used by auth middleware in ctx setup)
	if (/FROM users WHERE id = \$1/.test(sql)) {
		const id = (params?.[0] as string) || ''
		if (id === 'admin-1') {
			return {
				rows: [
					{
						id: 'admin-1',
						username: 'admin',
						display_name: 'Admin',
						hashed_password: 'mock',
						role: 'admin',
						avatar_color: '#000',
						is_active: true,
						created_at: new Date(),
						updated_at: new Date(),
					},
				],
			}
		}
		return {rows: []}
	}
	// fail2ban INSERT into device_audit_log
	if (/INSERT INTO device_audit_log/.test(sql)) {
		insertedAuditRows.push({
			user_id: (params?.[0] as string) || '',
			device_id: (params?.[1] as string) || '',
			tool_name: (params?.[2] as string) || '',
			params_digest: (params?.[3] as string) || '',
			success: (params?.[4] as boolean) ?? false,
			error: (params?.[5] as string | null) ?? null,
		})
		return {rows: []}
	}
	// listEvents SELECT
	if (/FROM device_audit_log d/.test(sql)) {
		return {rows: []}
	}
	return {rows: []}
}

// ─── Test main ───────────────────────────────────────────────────────────────

async function runTests() {
	// Initialize DB (patched pool succeeds via mockPoolQuery)
	const dbMod = await import('../database/index.js')
	const initOk = await dbMod.initDatabase({
		log: () => {},
		verbose: () => {},
		error: () => {},
	} as any)
	assert.equal(initOk, true, 'initDatabase with mocked pg.Pool should succeed')

	// Now import the modules under test. We import the LIVE bindings so we can
	// re-route them to test fakes by mutating the live exports for the duration
	// of each test (Node ES modules expose live bindings, but consumers that
	// destructured at import time get the original. We override at the property
	// level on the module-level objects instead).
	const clientMod = await import('./client.js')
	const sessionsMod = await import('./active-sessions.js')

	// Helper: replace methods on realFail2banClient + realActiveSessionsProvider
	// for the duration of one test, then restore.
	function withFakeExec(opts: {
		statusOk?: string
		statusErr?: {code?: string; stderr?: string}
		statusJailOk?: string
		statusJailErr?: {code?: string; stderr?: string}
		setOk?: string
		setErr?: {code?: string; stderr?: string}
		whoStdout?: string
		whoErr?: {code?: string}
	}): () => void {
		execCalls = []
		const fakeRun = clientMod.makeFail2banClient(async (binary, args, runOpts) => {
			execCalls.push({binary, args, opts: runOpts})
			// `set <jail> unbanip|banip|addignoreip <ip>`
			if (args[0] === 'set') {
				if (opts.setErr) {
					const e: any = new Error('set failed')
					if (opts.setErr.code) e.code = opts.setErr.code
					e.stderr = opts.setErr.stderr ?? ''
					throw e
				}
				return {stdout: opts.setOk ?? '', stderr: ''}
			}
			// `status` (no jail) → listJails
			if (args[0] === 'status' && args.length === 1) {
				if (opts.statusErr) {
					const e: any = new Error('status failed')
					if (opts.statusErr.code) e.code = opts.statusErr.code
					e.stderr = opts.statusErr.stderr ?? ''
					throw e
				}
				return {stdout: opts.statusOk ?? '', stderr: ''}
			}
			// `status <jail>` → getJailStatus
			if (args[0] === 'status' && args.length === 2) {
				if (opts.statusJailErr) {
					const e: any = new Error('status jail failed')
					if (opts.statusJailErr.code) e.code = opts.statusJailErr.code
					e.stderr = opts.statusJailErr.stderr ?? ''
					throw e
				}
				return {stdout: opts.statusJailOk ?? '', stderr: ''}
			}
			return {stdout: '', stderr: ''}
		})
		// Override every method of realFail2banClient with the fake's bound counterpart
		const original: Record<string, any> = {}
		for (const key of Object.keys(fakeRun) as Array<keyof typeof fakeRun>) {
			original[key as string] = (clientMod.realFail2banClient as any)[key]
			;(clientMod.realFail2banClient as any)[key] = (fakeRun as any)[key]
		}

		// Active sessions provider — override too if whoStdout/whoErr provided
		const originalListSessions =
			sessionsMod.realActiveSessionsProvider.listActiveSshSessions
		;(sessionsMod.realActiveSessionsProvider as any).listActiveSshSessions =
			async () => {
				if (opts.whoErr) return [] // graceful degrade
				const stdout = opts.whoStdout ?? ''
				const {parseWhoOutput} = await import('./parser.js')
				return parseWhoOutput(stdout)
			}

		return () => {
			for (const key of Object.keys(original)) {
				;(clientMod.realFail2banClient as any)[key] = original[key]
			}
			;(sessionsMod.realActiveSessionsProvider as any).listActiveSshSessions =
				originalListSessions
		}
	}

	const {default: fail2banRouter} = await import('./routes.js')

	// Build a synthetic admin ctx (mimics what trpc/context.ts produces for HTTP).
	function makeAdminCtx(opts?: {xForwardedFor?: string}) {
		return {
			livinityd: undefined as any,
			server: undefined as any,
			user: undefined as any,
			appStore: undefined as any,
			apps: undefined as any,
			logger: {log: () => {}, verbose: () => {}, error: () => {}, warn: () => {}},
			// Bypass JWT verification at the isAuthenticated middleware (we're
			// constructing the ctx synthetically for unit-level tRPC caller —
			// the requireRole('admin') middleware still runs on currentUser).
			dangerouslyBypassAuthentication: true,
			currentUser: {id: 'admin-1', username: 'admin', role: 'admin'},
			transport: 'express' as const,
			request: {
				headers: opts?.xForwardedFor
					? {'x-forwarded-for': opts.xForwardedFor}
					: ({} as Record<string, unknown>),
			} as any,
			response: undefined as any,
		}
	}

	const caller = (ctx: ReturnType<typeof makeAdminCtx>) =>
		fail2banRouter.createCaller(ctx as any)

	// ─── Test 1: listJails happy path ────────────────────────────────────────
	{
		const restore = withFakeExec({
			statusOk: `Status\n|- Number of jail:\t1\n\`- Jail list:\tsshd\n`,
		})
		const c = caller(makeAdminCtx())
		const r = await c.listJails()
		assert.equal(r.state, 'running')
		assert.deepEqual(r.jails, ['sshd'])
		assert.equal(r.transient, false)
		restore()
		console.log('  PASS Test 1: listJails happy path → state=running')
	}

	// ─── Test 2: listJails ENOENT → state='binary-missing' ───────────────────
	{
		const restore = withFakeExec({statusErr: {code: 'ENOENT'}})
		const c = caller(makeAdminCtx())
		const r = await c.listJails()
		assert.equal(r.state, 'binary-missing')
		assert.deepEqual(r.jails, [])
		restore()
		console.log('  PASS Test 2: listJails ENOENT → state=binary-missing')
	}

	// ─── Test 3: listJails service-down stderr → state='service-inactive' ────
	{
		const restore = withFakeExec({
			statusErr: {stderr: 'Could not find server'},
		})
		const c = caller(makeAdminCtx())
		const r = await c.listJails()
		assert.equal(r.state, 'service-inactive')
		assert.deepEqual(r.jails, [])
		restore()
		console.log('  PASS Test 3: listJails service-down → state=service-inactive')
	}

	// ─── Test 4: unbanIp happy path → argv + audit row ───────────────────────
	{
		const restore = withFakeExec({setOk: ''})
		insertedAuditRows.length = 0
		const c = caller(makeAdminCtx())
		const r = await c.unbanIp({jail: 'sshd', ip: '1.2.3.4', addToWhitelist: false})
		assert.deepEqual(r, {ok: true})
		// Argv shape (B-01: action-targeted)
		assert.equal(execCalls.length, 1, `expected 1 execFile call, got ${execCalls.length}`)
		assert.deepEqual(execCalls[0].args, ['set', 'sshd', 'unbanip', '1.2.3.4'])
		// Audit row
		assert.equal(insertedAuditRows.length, 1)
		assert.equal(insertedAuditRows[0].device_id, 'fail2ban-host')
		assert.equal(insertedAuditRows[0].tool_name, 'unban_ip')
		assert.equal(insertedAuditRows[0].user_id, 'admin-1')
		assert.equal(insertedAuditRows[0].success, true)
		restore()
		console.log('  PASS Test 4: unbanIp → set sshd unbanip 1.2.3.4 + audit unban_ip')
	}

	// ─── Test 5: unbanIp + addToWhitelist=true → two execFile + 'whitelist_ip' ─
	{
		const restore = withFakeExec({setOk: ''})
		insertedAuditRows.length = 0
		const c = caller(makeAdminCtx())
		const r = await c.unbanIp({jail: 'sshd', ip: '1.2.3.4', addToWhitelist: true})
		assert.deepEqual(r, {ok: true})
		assert.equal(execCalls.length, 2, `expected 2 execFile calls, got ${execCalls.length}`)
		assert.deepEqual(execCalls[0].args, ['set', 'sshd', 'unbanip', '1.2.3.4'])
		assert.deepEqual(execCalls[1].args, ['set', 'sshd', 'addignoreip', '1.2.3.4'])
		assert.equal(insertedAuditRows.length, 1)
		assert.equal(insertedAuditRows[0].tool_name, 'whitelist_ip')
		restore()
		console.log(
			'  PASS Test 5: unbanIp+addToWhitelist → unbanip + addignoreip + audit whitelist_ip',
		)
	}

	// ─── Test 6: banIp self-ban WITHOUT confirmation → TRPCError 'self_ban' ──
	{
		// who -u returns the admin's IP as an active session → admin attempts
		// to ban that same IP without typing 'LOCK ME OUT' → CONFLICT.
		const restore = withFakeExec({
			whoStdout: `bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
`,
		})
		insertedAuditRows.length = 0
		execCalls = []
		const c = caller(makeAdminCtx({xForwardedFor: '203.0.113.5'}))
		let threw = false
		try {
			await c.banIp({jail: 'sshd', ip: '203.0.113.5', cellularBypass: false})
		} catch (err: any) {
			threw = true
			assert.equal(err.code, 'CONFLICT', `expected CONFLICT, got ${err.code}`)
			assert.equal(err.message, 'self_ban')
		}
		assert.equal(threw, true, 'self-ban without confirmation MUST throw')
		// CRITICAL: execFile MUST NOT have been called — we abort BEFORE spawning.
		assert.equal(
			execCalls.length,
			0,
			`self-ban detection must abort before execFile; got ${execCalls.length} calls`,
		)
		// No audit row written either (the ban was not attempted).
		assert.equal(insertedAuditRows.length, 0)
		restore()
		console.log('  PASS Test 6: banIp self-ban without confirmation → TRPCError CONFLICT self_ban')
	}

	// ─── Test 7: banIp self-ban WITH 'LOCK ME OUT' → succeeds + audit row ────
	{
		const restore = withFakeExec({
			setOk: '',
			whoStdout: `bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
`,
		})
		insertedAuditRows.length = 0
		execCalls = []
		const c = caller(makeAdminCtx({xForwardedFor: '203.0.113.5'}))
		const r = await c.banIp({
			jail: 'sshd',
			ip: '203.0.113.5',
			confirmation: 'LOCK ME OUT',
			cellularBypass: false,
		})
		assert.deepEqual(r, {ok: true})
		assert.equal(execCalls.length, 1)
		assert.deepEqual(execCalls[0].args, ['set', 'sshd', 'banip', '203.0.113.5'])
		assert.equal(insertedAuditRows.length, 1)
		assert.equal(insertedAuditRows[0].tool_name, 'ban_ip')
		assert.equal(insertedAuditRows[0].success, true)
		restore()
		console.log("  PASS Test 7: banIp self-ban with 'LOCK ME OUT' → succeeds + audit ban_ip")
	}

	// ─── Test 8: banIp self-ban with cellularBypass=true → succeeds (B-19) ───
	{
		const restore = withFakeExec({
			setOk: '',
			whoStdout: `bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
`,
		})
		insertedAuditRows.length = 0
		execCalls = []
		const c = caller(makeAdminCtx({xForwardedFor: '203.0.113.5'}))
		const r = await c.banIp({
			jail: 'sshd',
			ip: '203.0.113.5',
			cellularBypass: true,
		})
		assert.deepEqual(r, {ok: true})
		// No confirmation needed when cellularBypass=true — execFile spawns
		assert.equal(execCalls.length, 1)
		assert.deepEqual(execCalls[0].args, ['set', 'sshd', 'banip', '203.0.113.5'])
		assert.equal(insertedAuditRows.length, 1)
		assert.equal(insertedAuditRows[0].tool_name, 'ban_ip')
		restore()
		console.log('  PASS Test 8: banIp cellularBypass=true → succeeds without confirmation (B-19)')
	}

	// ─── Test 9: banIp CIDR /0 → Zod rejection BEFORE execFile (B-03) ────────
	{
		const restore = withFakeExec({setOk: ''})
		insertedAuditRows.length = 0
		execCalls = []
		const c = caller(makeAdminCtx())
		let threw = false
		try {
			await c.banIp({jail: 'sshd', ip: '0.0.0.0/0'} as any)
		} catch (err: any) {
			threw = true
			assert.equal(err.code, 'BAD_REQUEST', `expected BAD_REQUEST (Zod), got ${err.code}`)
		}
		assert.equal(threw, true, 'CIDR /0 must be rejected at Zod layer')
		// CRITICAL: execFile MUST NOT have been called.
		assert.equal(
			execCalls.length,
			0,
			`Zod rejection must abort before execFile; got ${execCalls.length} calls`,
		)
		restore()
		console.log('  PASS Test 9: banIp CIDR /0 → Zod BAD_REQUEST before execFile (B-03)')
	}

	// ─── Test 10: banIp with shell-injection in jail name → Zod rejection ────
	{
		const restore = withFakeExec({setOk: ''})
		execCalls = []
		const c = caller(makeAdminCtx())
		let threw = false
		try {
			await c.banIp({jail: 'sshd; rm -rf /', ip: '1.2.3.4'} as any)
		} catch (err: any) {
			threw = true
			assert.equal(err.code, 'BAD_REQUEST', `expected BAD_REQUEST (Zod), got ${err.code}`)
		}
		assert.equal(threw, true, 'shell-injection jail name must be Zod-rejected')
		assert.equal(execCalls.length, 0, 'execFile must not be called for invalid jail')
		restore()
		console.log('  PASS Test 10: banIp shell-injection jail name → Zod BAD_REQUEST (T-46-17)')
	}

	console.log('\nAll integration.test.ts tests passed (10/10)')

	// Restore prototypes (good citizenship for any subsequent test in same process)
	pg.Pool.prototype.connect = originalConnect
	pg.Pool.prototype.query = originalQuery
	pg.Pool.prototype.end = originalEnd
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
