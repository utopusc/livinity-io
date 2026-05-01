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
import {httpOnlyPaths} from './common.js'

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

	console.log('\nAll common.test.ts tests passed (4/4)')
}

runTests()
