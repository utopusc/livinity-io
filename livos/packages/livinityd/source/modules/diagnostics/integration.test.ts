/**
 * Phase 47 Plan 05 — diagnostics tRPC integration test.
 *
 * Mirrors fail2ban-admin/integration.test.ts: patches pg.Pool.prototype
 * BEFORE importing modules, then exercises the full tRPC stack via
 * `capabilitiesRouter.createCaller(ctx)` / `appsHealthRouter.createCaller(ctx)`
 * with synthetic admin / member / unauthenticated contexts.
 *
 * Mocking strategy (per pitfall W-20 — no Vitest, no vi.mock):
 *   1. Patch pg.Pool.prototype.{connect,query,end} BEFORE module imports.
 *   2. Override the live binding methods on `realDiagnoseRegistry`,
 *      `realFlushAndResync`, `realDiagnoseModelIdentity`, `realProbeAppHealth`
 *      via Object property mutation. The facade in `index.ts` calls
 *      `realFoo.method()` so mutating the method swaps the implementation.
 *   3. Build tRPC callers with synthetic admin / member / unauthenticated ctx.
 *
 * Coverage matrix (seven tests):
 *   1. admin diagnoseRegistry          → returns categorized snapshot shape
 *   2. member diagnoseRegistry         → throws FORBIDDEN
 *   3. admin flushAndResync            → returns durationMs/scope shape
 *   4. admin modelIdentityDiagnose     → returns verdict
 *   5. private healthProbe (not owned) → returns app_not_owned (no throw)
 *   6. healthProbe without ctx user    → throws UNAUTHORIZED
 *   7. modelIdentityDiagnose redaction → ANTHROPIC_API_KEY value masked
 *
 * Test-isolation guard (G-06 / W-15): refuses to run against production
 * Redis (10.69.31.68) or live livos@ DSN.
 */

import assert from 'node:assert/strict'
import pg from 'pg'

// ─── Test isolation guard (G-06 / W-15) ──────────────────────────────────────
{
	const url = process.env.REDIS_URL ?? ''
	const dburl = process.env.DATABASE_URL ?? ''
	if (/10\.69\.31\.68/.test(url) || /10\.69\.31\.68/.test(dburl) || /livos@/.test(url)) {
		console.error('REFUSING to run integration.test.ts against production:', url, dburl)
		process.exit(99)
	}
}

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

function mockPoolQuery(sql: string, _params?: unknown[]): {rows: unknown[]} {
	if (/CREATE TABLE|CREATE INDEX|CREATE EXTENSION|ALTER TABLE|CREATE TRIGGER|CREATE OR REPLACE|^\s*--/.test(sql)) {
		return {rows: []}
	}
	if (/to_regclass/.test(sql)) {
		return {rows: [{r: 'public.user_capability_overrides'}]}
	}
	if (/FROM users WHERE id = \$1/.test(sql)) {
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

// ─── Test main ───────────────────────────────────────────────────────────────

async function runTests() {
	let passed = 0
	let failed = 0
	const test = async (name: string, fn: () => Promise<void>) => {
		try {
			await fn()
			console.log('  PASS ' + name)
			passed++
		} catch (e) {
			console.error('  FAIL ' + name + ':', e)
			failed++
		}
	}

	// Initialize DB (patched pool succeeds via mockPoolQuery)
	const dbMod = await import('../database/index.js')
	if (typeof (dbMod as any).initDatabase === 'function') {
		await (dbMod as any).initDatabase({
			log: () => {},
			verbose: () => {},
			info: () => {},
			error: () => {},
			warn: () => {},
		})
	}

	// Import the modules under test AFTER pg patching so any import-time
	// connections use the mocked pool.
	const capMod = await import('./capabilities.js')
	const modelMod = await import('./model-identity.js')
	const appHealthMod = await import('./app-health.js')
	const {capabilitiesRouter, appsHealthRouter} = await import('./routes.js')

	// Synthetic context factories — mirror fail2ban-admin/integration.test.ts:213-235
	function makeAdminCtx() {
		return {
			livinityd: undefined as any,
			server: undefined as any,
			user: undefined as any,
			appStore: undefined as any,
			apps: undefined as any,
			logger: {
				log: () => {},
				verbose: () => {},
				info: () => {},
				error: () => {},
				warn: () => {},
				debug: () => {},
			},
			dangerouslyBypassAuthentication: true,
			currentUser: {id: 'admin-1', username: 'admin', role: 'admin' as const},
			transport: 'express' as const,
			request: {headers: {}} as any,
			response: undefined as any,
		}
	}
	function makeMemberCtx() {
		const c = makeAdminCtx()
		c.currentUser = {id: 'user-A', username: 'alice', role: 'member' as any}
		return c
	}
	function makeUnauthenticatedCtx() {
		const c = makeAdminCtx()
		;(c as any).currentUser = undefined
		// Clear bypass — privateProcedure needs to actually fail here.
		c.dangerouslyBypassAuthentication = false
		return c
	}

	const capCaller = (ctx: any) => capabilitiesRouter.createCaller(ctx)
	const appsCaller = (ctx: any) => appsHealthRouter.createCaller(ctx)

	// ─── Test 1: admin diagnoseRegistry returns shape ──────────────────────────
	await test('Test 1: admin diagnoseRegistry returns categorized shape', async () => {
		const originalDiagnose = (capMod.realDiagnoseRegistry as any).diagnose
		;(capMod.realDiagnoseRegistry as any).diagnose = async () => ({
			redisManifestCount: 5,
			builtInToolCount: 9,
			syncedAt: '2026-05-01T00:00:00Z',
			categorized: {
				expectedAndPresent: ['tool:shell'],
				missing: {lost: [], precondition: [], disabledByUser: []},
				unexpectedExtras: [],
			},
		})
		try {
			const result = await capCaller(makeAdminCtx()).diagnoseRegistry()
			assert.equal(typeof result.redisManifestCount, 'number')
			assert.equal(result.redisManifestCount, 5)
			assert.ok('categorized' in result)
			assert.ok('expectedAndPresent' in result.categorized)
		} finally {
			;(capMod.realDiagnoseRegistry as any).diagnose = originalDiagnose
		}
	})

	// ─── Test 2: member caller → diagnoseRegistry FORBIDDEN ────────────────────
	await test('Test 2: member caller → diagnoseRegistry FORBIDDEN', async () => {
		await assert.rejects(
			capCaller(makeMemberCtx()).diagnoseRegistry(),
			(err: any) => {
				return err?.code === 'FORBIDDEN' || /forbidden/i.test(err?.message ?? '')
			},
		)
	})

	// ─── Test 3: admin flushAndResync returns durationMs ───────────────────────
	await test('Test 3: admin flushAndResync returns durationMs/scope', async () => {
		const originalRun = (capMod.realFlushAndResync as any).run
		;(capMod.realFlushAndResync as any).run = async (opts: any) => ({
			before: 5,
			after: 9,
			overridesPreserved: [],
			durationMs: 42,
			auditRowId: 'a1',
			scope: opts.scope ?? 'builtins',
		})
		try {
			const result = await capCaller(makeAdminCtx()).flushAndResync({scope: 'builtins'})
			assert.equal(typeof result.durationMs, 'number')
			assert.equal(result.scope, 'builtins')
			assert.equal(result.before, 5)
			assert.equal(result.after, 9)
		} finally {
			;(capMod.realFlushAndResync as any).run = originalRun
		}
	})

	// ─── Test 4: admin modelIdentityDiagnose returns verdict ───────────────────
	await test('Test 4: admin modelIdentityDiagnose returns verdict', async () => {
		const originalDiagnose = (modelMod.realDiagnoseModelIdentity as any).diagnose
		;(modelMod.realDiagnoseModelIdentity as any).diagnose = async () => ({
			verdict: 'clean' as const,
			steps: {
				step1_brokerProbe: {
					url: 'http://localhost/probe',
					responseModel: 'claude-opus-4-7',
					expected: 'claude-opus-4-7',
					match: true,
				},
				step2_responseModelInterpretation: 'clean',
				step3_environSnapshot: 'NONE' as const,
				step4_pnpmStoreCount: {dirs: ['x'], count: 1, driftRisk: false},
				step5_resolvedDist: {path: '/x', ls: '...'},
				step6_identityMarker: {
					resolvedDistPath: '/x/dist/index.js',
					markerCount: 5,
					mtime: 1700000000,
					markerPresent: true,
				},
			},
			capturedAt: '2026-05-01T00:00:00Z',
		})
		try {
			const result = await capCaller(makeAdminCtx()).modelIdentityDiagnose()
			assert.equal(result.verdict, 'clean')
		} finally {
			;(modelMod.realDiagnoseModelIdentity as any).diagnose = originalDiagnose
		}
	})

	// ─── Test 5: private healthProbe — appId not owned → app_not_owned ─────────
	await test('Test 5: private healthProbe — appId not owned → app_not_owned', async () => {
		const originalProbe = (appHealthMod.realProbeAppHealth as any).probe
		;(appHealthMod.realProbeAppHealth as any).probe = async (_opts: any) => ({
			reachable: false,
			statusCode: null,
			ms: null,
			lastError: 'app_not_owned',
			probedAt: '2026-05-01T00:00:00Z',
		})
		try {
			const result = await appsCaller(makeMemberCtx()).healthProbe({appId: 'bolt'})
			assert.equal(result.reachable, false)
			assert.equal(result.lastError, 'app_not_owned')
		} finally {
			;(appHealthMod.realProbeAppHealth as any).probe = originalProbe
		}
	})

	// ─── Test 6: healthProbe without currentUser → UNAUTHORIZED ────────────────
	await test('Test 6: healthProbe without currentUser → UNAUTHORIZED', async () => {
		await assert.rejects(
			appsCaller(makeUnauthenticatedCtx()).healthProbe({appId: 'bolt'}),
			(err: any) => {
				return err?.code === 'UNAUTHORIZED' || /unauthorized/i.test(err?.message ?? '')
			},
		)
	})

	// ─── Test 7: env redaction — _KEY values masked (T-47-05-02) ───────────────
	await test('Test 7: env redaction — _KEY values masked (defense-in-depth)', async () => {
		const originalDiagnose = (modelMod.realDiagnoseModelIdentity as any).diagnose
		;(modelMod.realDiagnoseModelIdentity as any).diagnose = async () => ({
			verdict: 'clean' as const,
			steps: {
				step1_brokerProbe: {url: '...', responseModel: 'x', expected: 'x', match: true},
				step2_responseModelInterpretation: 'x',
				step3_environSnapshot: {
					pids: [123],
					envs: [
						{
							HOME: '/home/bruce',
							ANTHROPIC_API_KEY: 'sk-secret-abc',
							PATH: '/bin',
							CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
						},
					],
				},
				step4_pnpmStoreCount: {dirs: [], count: 0, driftRisk: false},
				step5_resolvedDist: {path: '', ls: ''},
				step6_identityMarker: {
					resolvedDistPath: '',
					markerCount: 0,
					mtime: 0,
					markerPresent: false,
				},
			},
			capturedAt: '2026-05-01T00:00:00Z',
		})
		try {
			const result = await capCaller(makeAdminCtx()).modelIdentityDiagnose()
			const snap = result.steps.step3_environSnapshot
			if (snap === 'NONE') throw new Error('expected captured envs, got NONE')
			const envs = snap.envs
			assert.equal(envs[0].ANTHROPIC_API_KEY, '<redacted>', 'API_KEY must be redacted')
			assert.equal(envs[0].CLAUDE_CODE_OAUTH_TOKEN, '<redacted>', 'OAUTH_TOKEN must be redacted')
			assert.equal(envs[0].HOME, '/home/bruce', 'HOME must NOT be redacted')
			assert.equal(envs[0].PATH, '/bin', 'PATH must NOT be redacted')
		} finally {
			;(modelMod.realDiagnoseModelIdentity as any).diagnose = originalDiagnose
		}
	})

	console.log(`\n${passed} passed, ${failed} failed`)

	// Restore prototypes
	pg.Pool.prototype.connect = originalConnect
	pg.Pool.prototype.query = originalQuery
	pg.Pool.prototype.end = originalEnd

	if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
