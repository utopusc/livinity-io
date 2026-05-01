/**
 * Static-array test for httpOnlyPaths additions (v29.4 Phase 45 Plan 03 — FR-CF-03).
 *
 * Asserts the three tRPC routes added in this plan are present in the
 * httpOnlyPaths allowlist. Without these entries, the routes route through
 * WebSocket by default, and during the ~5s WS reconnect window after
 * `systemctl restart livos` mutations/queries silently queue and may drop
 * (pitfall B-12 / X-04).
 *
 * Test scope: ONLY the three new entries added by this plan. Does NOT
 * assert against pre-existing entries (would be a fragile snapshot test
 * that fails every time someone adds a new tRPC mutation).
 *
 * Full restart-livinityd-mid-session integration test deferred to UAT on
 * Mini PC per pitfall W-20 (no mocking external systemctl + livinityd
 * lifecycle in unit tests).
 *
 * Run with: npx tsx livos/packages/livinityd/source/modules/server/trpc/common.test.ts
 */

import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {httpOnlyPaths} from './common.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function ok(label: string) {
	console.log(`  PASS ${label}`)
}

function runTests() {
	// Test 1: ai.claudePerUserStartLogin — Phase 40 per-user Claude OAuth login subscription
	{
		assert.ok(
			httpOnlyPaths.includes('ai.claudePerUserStartLogin' as any),
			"httpOnlyPaths must include 'ai.claudePerUserStartLogin' (Phase 40 per-user Claude OAuth login subscription must survive WS reconnect after deploy/restart)",
		)
		ok("Test 1: 'ai.claudePerUserStartLogin' present in httpOnlyPaths")
	}

	// Test 2: usage.getMine — Phase 44 per-user usage dashboard query
	{
		assert.ok(
			httpOnlyPaths.includes('usage.getMine' as any),
			"httpOnlyPaths must include 'usage.getMine' (Phase 44 per-user usage dashboard query — polled across livinityd restart cycles)",
		)
		ok("Test 2: 'usage.getMine' present in httpOnlyPaths")
	}

	// Test 3: usage.getAll — Phase 44 admin-only usage dashboard query
	{
		assert.ok(
			httpOnlyPaths.includes('usage.getAll' as any),
			"httpOnlyPaths must include 'usage.getAll' (Phase 44 admin-only usage dashboard query — same WS-reconnect-survival reason as usage.getMine)",
		)
		ok("Test 3: 'usage.getAll' present in httpOnlyPaths")
	}

	// Test 4: namespacing convention — entries must be 'router.route' shape
	// (catches the bare-name footgun where someone adds 'claudePerUserStartLogin'
	// instead of 'ai.claudePerUserStartLogin' — pattern map note).
	{
		assert.ok(
			!httpOnlyPaths.includes('claudePerUserStartLogin' as any),
			"httpOnlyPaths must NOT include bare 'claudePerUserStartLogin' (must be namespaced as 'ai.claudePerUserStartLogin' — every existing entry follows <router>.<route> convention)",
		)
		assert.ok(
			!httpOnlyPaths.includes('getMine' as any),
			"httpOnlyPaths must NOT include bare 'getMine' (must be namespaced as 'usage.getMine')",
		)
		assert.ok(
			!httpOnlyPaths.includes('getAll' as any),
			"httpOnlyPaths must NOT include bare 'getAll' (must be namespaced as 'usage.getAll')",
		)
		ok('Test 4: bare-name entries absent (namespaced convention preserved)')
	}

	// v29.4 Phase 46 Plan 03 — fail2ban admin mutations.
	// Same WS-reconnect-survival reason as Phase 45's FR-CF-03 cluster.
	// Test 5: 'fail2ban.unbanIp' — admin unban (action-targeted, B-01)
	{
		assert.ok(
			httpOnlyPaths.includes('fail2ban.unbanIp' as any),
			"httpOnlyPaths must include 'fail2ban.unbanIp' (FR-F2B-03 + ROADMAP §46.8 — admin mid-recovery from SSH lockout is on a half-broken WS; HTTP guarantees delivery)",
		)
		ok("Test 5: 'fail2ban.unbanIp' present in httpOnlyPaths")
	}

	// Test 6: 'fail2ban.banIp' — admin manual ban (with self-ban gate B-02)
	{
		assert.ok(
			httpOnlyPaths.includes('fail2ban.banIp' as any),
			"httpOnlyPaths must include 'fail2ban.banIp' (FR-F2B-03 + ROADMAP §46.8 — same WS-reconnect-survival reason as fail2ban.unbanIp)",
		)
		ok("Test 6: 'fail2ban.banIp' present in httpOnlyPaths")
	}

	// Test 7: bare-name footgun guard for fail2ban entries
	{
		assert.ok(
			!httpOnlyPaths.includes('unbanIp' as any),
			"httpOnlyPaths must NOT include bare 'unbanIp' (must be namespaced as 'fail2ban.unbanIp')",
		)
		assert.ok(
			!httpOnlyPaths.includes('banIp' as any),
			"httpOnlyPaths must NOT include bare 'banIp' (must be namespaced as 'fail2ban.banIp')",
		)
		ok('Test 7: bare fail2ban names absent (namespaced convention preserved)')
	}

	// v29.4 Phase 47 Plan 05 — AI Diagnostics mutations.
	// Same WS-reconnect-survival reason as Phase 45's FR-CF-03 cluster +
	// Phase 46's fail2ban cluster. Atomic-swap registry rebuild = 5-10s mutation;
	// app-health probe = timing-sensitive mutation. Both must use HTTP.
	// Test 8: 'capabilities.flushAndResync' + 'apps.healthProbe' present
	{
		assert.ok(
			httpOnlyPaths.includes('capabilities.flushAndResync' as any),
			"httpOnlyPaths must include 'capabilities.flushAndResync' (FR-TOOL-02 / B-12 — atomic-swap rebuild can take 5-10s; mutation must survive WS reconnect)",
		)
		assert.ok(
			httpOnlyPaths.includes('apps.healthProbe' as any),
			"httpOnlyPaths must include 'apps.healthProbe' (FR-PROBE-01 / B-12 — timing-sensitive mutation must survive WS reconnect)",
		)
		ok('Test 8: Phase 47 entries present in httpOnlyPaths')
	}

	// Test 9: namespace footgun guard. Phase 47 chose Option B (separate
	// namespaces 'capabilities.*' + 'apps.*' merged via t.mergeRouters), NOT
	// Option A (single 'diagnostics.*' namespace). Catches the bare-name
	// footgun where someone adds 'flushAndResync' instead of
	// 'capabilities.flushAndResync', AND the wrong-Option footgun where
	// someone adds 'diagnostics.capabilitiesFlushAndResync'.
	{
		assert.ok(
			!httpOnlyPaths.includes('flushAndResync' as any),
			"httpOnlyPaths must NOT include bare 'flushAndResync' (must be namespaced as 'capabilities.flushAndResync')",
		)
		assert.ok(
			!httpOnlyPaths.includes('healthProbe' as any),
			"httpOnlyPaths must NOT include bare 'healthProbe' (must be namespaced as 'apps.healthProbe')",
		)
		assert.ok(
			!httpOnlyPaths.includes('diagnostics.capabilitiesFlushAndResync' as any),
			"Phase 47 chose Option B (separate namespaces) — 'diagnostics.*' prefix MUST NOT be used",
		)
		assert.ok(
			!httpOnlyPaths.includes('diagnostics.appsHealthProbe' as any),
			"Phase 47 chose Option B (separate namespaces) — 'diagnostics.*' prefix MUST NOT be used",
		)
		ok('Test 9: Phase 47 namespace prefix correct (Option B; bare/Option-A names absent)')
	}

	// Test 10: privateProcedure invariant for apps.healthProbe. httpOnlyPaths
	// is transport routing, not authorization — but the Phase 47 G-04 BLOCKER
	// requires healthProbe be `privateProcedure` (per-user scope), NOT
	// adminProcedure. Read the routes.ts source to verify.
	{
		const routesPath = path.resolve(
			__dirname,
			'../../diagnostics/routes.ts',
		)
		const routesSrc = fs.readFileSync(routesPath, 'utf8')
		assert.ok(
			/healthProbe:\s*privateProcedure/.test(routesSrc),
			"healthProbe must be wired as `privateProcedure` (FR-PROBE-01 / G-04 BLOCKER — anti-port-scanner)",
		)
		// Defense-in-depth: the routes file MUST source userId from ctx,
		// never from input. Catches the regression where someone changes
		// `userId: ctx.currentUser.id` to `userId: input.userId`.
		assert.ok(
			!/userId:\s*input\.userId/.test(routesSrc),
			'healthProbe MUST NOT accept userId from input (G-04 BLOCKER — userId from ctx ONLY)',
		)
		ok('Test 10: apps.healthProbe wired as privateProcedure with ctx-only userId')
	}

	console.log('\nAll common.test.ts tests passed (10/10)')
}

runTests()
