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
import {test} from 'vitest'
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

	// v30.0 Phase 59 Plan 04 — apiKeys mutations + queries (FR-BROKER-B1-04).
	// Same WS-reconnect-survival reason as Phase 45/46/47 clusters. apiKeys.create
	// returns plaintext ONCE — HTTP delivery prevents WS-reconnect-replay
	// confusion. apiKeys.revoke must succeed mid-restart (admin under duress).
	// Test 11: all four apiKeys.* entries present in httpOnlyPaths
	{
		assert.ok(
			httpOnlyPaths.includes('apiKeys.create' as any),
			"httpOnlyPaths must include 'apiKeys.create' (Phase 59 FR-BROKER-B1-04 — plaintext returned ONCE; WS-reconnect-replay would lose the cleartext token)",
		)
		assert.ok(
			httpOnlyPaths.includes('apiKeys.list' as any),
			"httpOnlyPaths must include 'apiKeys.list' (Phase 59 FR-BROKER-B1-04 — mirror create's transport for client-side consistency)",
		)
		assert.ok(
			httpOnlyPaths.includes('apiKeys.revoke' as any),
			"httpOnlyPaths must include 'apiKeys.revoke' (Phase 59 FR-BROKER-B1-04 — admin revoking a leaked key under duress can't afford WS queue/drop window)",
		)
		assert.ok(
			httpOnlyPaths.includes('apiKeys.listAll' as any),
			"httpOnlyPaths must include 'apiKeys.listAll' (Phase 59 FR-BROKER-B1-04 — admin cross-user view; mirrors usage.getAll precedent)",
		)
		ok('Test 11: all 4 apiKeys.* entries present in httpOnlyPaths')
	}

	// Test 12: bare-name footgun guard for Phase 59 entries. Same shape as
	// Tests 4 (Phase 45), 7 (Phase 46), 9 (Phase 47). Catches the regression
	// where someone adds 'create' instead of 'apiKeys.create' — every existing
	// entry follows the <router>.<route> namespace convention.
	{
		assert.ok(
			!httpOnlyPaths.includes('create' as any),
			"httpOnlyPaths must NOT include bare 'create' (must be namespaced as 'apiKeys.create')",
		)
		assert.ok(
			!httpOnlyPaths.includes('list' as any),
			"httpOnlyPaths must NOT include bare 'list' (must be namespaced as 'apiKeys.list')",
		)
		assert.ok(
			!httpOnlyPaths.includes('revoke' as any),
			"httpOnlyPaths must NOT include bare 'revoke' (must be namespaced as 'apiKeys.revoke')",
		)
		assert.ok(
			!httpOnlyPaths.includes('listAll' as any),
			"httpOnlyPaths must NOT include bare 'listAll' (must be namespaced as 'apiKeys.listAll')",
		)
		ok('Test 12: bare apiKeys names absent (namespaced convention preserved)')
	}

	// v33 Phase 92 — webapp metadata extractor (V33-WEBAPP-01).
	// Same WS-reconnect-survival reason as Phase 45/46/47/59 clusters. The
	// procedure is a query but the latency profile is mutation-shaped (up to
	// 8s on a clean cache miss including outbound fetch + parse), so HTTP
	// transport prevents the silent-drop failure mode after `systemctl
	// restart livos` (memory pitfall B-12 / X-04).
	// Test 13: 'webapp.extractMetadata' present in httpOnlyPaths
	{
		assert.ok(
			httpOnlyPaths.includes('webapp.extractMetadata' as any),
			"httpOnlyPaths must include 'webapp.extractMetadata' (Phase 92 V33-WEBAPP-01 — outbound fetch can take up to 8s; query must survive WS reconnect after deploy/restart)",
		)
		ok("Test 13: 'webapp.extractMetadata' present in httpOnlyPaths")
	}

	// Test 14: bare-name footgun guard for Phase 92 entry. Mirrors Tests 4 /
	// 7 / 9 / 12 — every existing entry follows <router>.<route> namespace
	// convention.
	{
		assert.ok(
			!httpOnlyPaths.includes('extractMetadata' as any),
			"httpOnlyPaths must NOT include bare 'extractMetadata' (must be namespaced as 'webapp.extractMetadata')",
		)
		ok('Test 14: bare extractMetadata absent (namespaced convention preserved)')
	}

	// Phase 199-02 — mastra.agent.listAvailableModels added to httpOnlyPaths.
	// Same WS-reconnect-survival rationale as the rest of the mastra.agent.*
	// cluster (Phase 197-05 entries at lines 599-603). The Liv AI UI hydrates
	// the model picker on first paint via this query — WS-handshake-delay
	// flicker on cold load is undesirable; HTTP avoids it. T-199-02-03 mit.
	// Test 15: 'mastra.agent.listAvailableModels' present in httpOnlyPaths
	{
		assert.ok(
			httpOnlyPaths.includes('mastra.agent.listAvailableModels' as any),
			"httpOnlyPaths must include 'mastra.agent.listAvailableModels' (Phase 199-02 D-199-12 — UI hydrates the model picker on first paint; HTTP avoids WS-handshake-delay flicker AND survives `systemctl restart livos` mid-mount)",
		)
		ok("Test 15: 'mastra.agent.listAvailableModels' present in httpOnlyPaths")
	}

	// Test 16: bare-name footgun guard for Phase 199-02 entry. Mirrors Tests
	// 4 / 7 / 9 / 12 / 14 — every existing entry follows <router>.<route>
	// namespace convention.
	{
		assert.ok(
			!httpOnlyPaths.includes('listAvailableModels' as any),
			"httpOnlyPaths must NOT include bare 'listAvailableModels' (must be namespaced as 'mastra.agent.listAvailableModels')",
		)
		assert.ok(
			!httpOnlyPaths.includes('agent.listAvailableModels' as any),
			"httpOnlyPaths must NOT include 'agent.listAvailableModels' (missing 'mastra.' prefix — full path is 'mastra.agent.listAvailableModels')",
		)
		ok('Test 16: bare/half-namespaced listAvailableModels absent (mastra.agent.* convention preserved)')
	}

	// Phase 199-07 — mastra.agent.getActiveModel + setActiveModel added to
	// httpOnlyPaths. Same WS-reconnect-survival rationale as the rest of the
	// mastra.agent.* cluster (Phase 197-05 + 199-02 entries directly above).
	// setActiveModel is an admin mutation — silent WS drop during `systemctl
	// restart livos` would leave the operator thinking they saved a model
	// choice when they didn't (memory pitfall B-12 / X-04). getActiveModel
	// hydrates the header-bar picker on first paint — HTTP avoids the
	// WS-handshake-delay flicker (precedent: mastra.agent.listAvailableModels
	// at common.ts line 611).
	// Test 17: 'mastra.agent.getActiveModel' + 'mastra.agent.setActiveModel' present
	{
		assert.ok(
			httpOnlyPaths.includes('mastra.agent.getActiveModel' as any),
			"httpOnlyPaths must include 'mastra.agent.getActiveModel' (Phase 199-07 D-199-12 — UI hydrates the header-bar picker on first paint; HTTP avoids WS-handshake-delay flicker AND survives `systemctl restart livos` mid-mount)",
		)
		assert.ok(
			httpOnlyPaths.includes('mastra.agent.setActiveModel' as any),
			"httpOnlyPaths must include 'mastra.agent.setActiveModel' (Phase 199-07 D-199-12 — admin mutation writes Redis liv:config:active_model; silent WS drop during `systemctl restart livos` would lose the operator's model choice)",
		)
		ok("Test 17: 'mastra.agent.getActiveModel' + 'mastra.agent.setActiveModel' present in httpOnlyPaths")
	}

	// Test 18: bare-name footgun guard for Phase 199-07 entries. Mirrors
	// Tests 4 / 7 / 9 / 12 / 14 / 16 — every existing entry follows
	// <router>.<route> namespace convention.
	{
		assert.ok(
			!httpOnlyPaths.includes('getActiveModel' as any),
			"httpOnlyPaths must NOT include bare 'getActiveModel' (must be namespaced as 'mastra.agent.getActiveModel')",
		)
		assert.ok(
			!httpOnlyPaths.includes('setActiveModel' as any),
			"httpOnlyPaths must NOT include bare 'setActiveModel' (must be namespaced as 'mastra.agent.setActiveModel')",
		)
		assert.ok(
			!httpOnlyPaths.includes('agent.getActiveModel' as any),
			"httpOnlyPaths must NOT include 'agent.getActiveModel' (missing 'mastra.' prefix — full path is 'mastra.agent.getActiveModel')",
		)
		assert.ok(
			!httpOnlyPaths.includes('agent.setActiveModel' as any),
			"httpOnlyPaths must NOT include 'agent.setActiveModel' (missing 'mastra.' prefix — full path is 'mastra.agent.setActiveModel')",
		)
		ok('Test 18: bare/half-namespaced getActiveModel/setActiveModel absent (mastra.agent.* convention preserved)')
	}

	// Phase 268-03 — cliInstaller.sendAuthInput (paste-back stdin write) +
	// cliInstaller.uninstall (npm uninstall / fs.rm) added to httpOnlyPaths.
	// Same WS-reconnect-survival rationale as the 267-01 cliInstaller.* cluster
	// (common.ts lines 730-745): both are long-ish admin mutations; a half-broken
	// WS after `systemctl restart livos` would silently hang them (memory pitfall
	// B-12 / X-04).
	// Test 19: 'cliInstaller.sendAuthInput' + 'cliInstaller.uninstall' present
	{
		assert.ok(
			httpOnlyPaths.includes('cliInstaller.sendAuthInput' as any),
			"httpOnlyPaths must include 'cliInstaller.sendAuthInput' (Phase 268-03 — the operator-pasted login code is written to the live child's stdin; a half-broken WS after `systemctl restart livos` would silently hang the paste-back)",
		)
		assert.ok(
			httpOnlyPaths.includes('cliInstaller.uninstall' as any),
			"httpOnlyPaths must include 'cliInstaller.uninstall' (Phase 268-03 — npm uninstall / fs.rm is a long-ish admin mutation; same WS-survival rationale as cliInstaller.install/auth)",
		)
		ok("Test 19: 'cliInstaller.sendAuthInput' + 'cliInstaller.uninstall' present in httpOnlyPaths")
	}

	// Test 20: bare-name footgun guard for Phase 268-03 entries. Mirrors Tests
	// 4 / 7 / 9 / 12 / 14 / 16 / 18 — every existing entry follows the
	// <router>.<route> namespace convention.
	{
		assert.ok(
			!httpOnlyPaths.includes('sendAuthInput' as any),
			"httpOnlyPaths must NOT include bare 'sendAuthInput' (must be namespaced as 'cliInstaller.sendAuthInput')",
		)
		assert.ok(
			!httpOnlyPaths.includes('uninstall' as any),
			"httpOnlyPaths must NOT include bare 'uninstall' (must be namespaced as 'cliInstaller.uninstall')",
		)
		ok('Test 20: bare sendAuthInput/uninstall absent (cliInstaller.* convention preserved)')
	}

	// Phase 344-03 (XFER-01) — appMigration cross-box migration httpOnlyPaths.
	// importBundle is stepUpAdminProcedure (the LIVINITY_STEPUP grant cookie only
	// travels on HTTP — a WS call fails closed, same as system.luksFormat).
	// exportApp is a long-running mutation + migrationStatus is polled for progress
	// across the WS reconnect window (same rationale as system.update/updateStatus).
	// Test 21: the three appMigration.* entries present in httpOnlyPaths
	{
		assert.ok(
			httpOnlyPaths.includes('appMigration.importBundle' as any),
			"httpOnlyPaths must include 'appMigration.importBundle' (Phase 344-03 — stepUpAdminProcedure; the LIVINITY_STEPUP grant cookie rides HTTP only, a WS call fails closed like system.luksFormat)",
		)
		assert.ok(
			httpOnlyPaths.includes('appMigration.exportApp' as any),
			"httpOnlyPaths must include 'appMigration.exportApp' (Phase 344-03 — long-running stop→tar→start mutation must survive the WS reconnect window like system.update)",
		)
		assert.ok(
			httpOnlyPaths.includes('appMigration.migrationStatus' as any),
			"httpOnlyPaths must include 'appMigration.migrationStatus' (Phase 344-03 — polled progress across the WS reconnect window like system.updateStatus)",
		)
		ok('Test 21: all 3 appMigration.* entries present in httpOnlyPaths')
	}

	// Test 22: bare-name / half-namespaced footgun guard for Phase 344-03 entries.
	// Mirrors Tests 4 / 7 / 9 / 12 / 14 / 16 / 18 / 20 — every entry follows the
	// <router>.<route> convention. deleteBundle + listBundles stay on WS (cheap
	// admin ops), so they MUST NOT appear here.
	{
		assert.ok(
			!httpOnlyPaths.includes('importBundle' as any),
			"httpOnlyPaths must NOT include bare 'importBundle' (must be namespaced as 'appMigration.importBundle')",
		)
		assert.ok(
			!httpOnlyPaths.includes('exportApp' as any),
			"httpOnlyPaths must NOT include bare 'exportApp' (must be namespaced as 'appMigration.exportApp')",
		)
		assert.ok(
			!httpOnlyPaths.includes('migrationStatus' as any),
			"httpOnlyPaths must NOT include bare 'migrationStatus' (must be namespaced as 'appMigration.migrationStatus')",
		)
		assert.ok(
			!httpOnlyPaths.includes('appMigration.deleteBundle' as any),
			"httpOnlyPaths must NOT include 'appMigration.deleteBundle' (a cheap idempotent admin op — stays on WS, not httpOnly)",
		)
		assert.ok(
			!httpOnlyPaths.includes('appMigration.listBundles' as any),
			"httpOnlyPaths must NOT include 'appMigration.listBundles' (a cheap admin query — stays on WS, not httpOnly)",
		)
		ok('Test 22: bare/half-namespaced + non-httpOnly appMigration names correct')
	}

	console.log('\nAll common.test.ts tests passed (22/22)')
}

// Phase 344-03 — this file historically ran as a standalone tsx script. It is now
// wrapped in a vitest `test()` so the plan's `vitest run` gate sees a real test
// (a bare-assertion file reports "No test suite found" and fails the suite). All
// assertions still throw via node:assert, so a regression fails the vitest test.
test('httpOnlyPaths allowlist (Phase 344-03 + regression)', () => {
	runTests()
})
