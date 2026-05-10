/**
 * Phase 100-08-05 — webappId scope filter for /api/agent/stream.
 *
 * Tests the pure helper `filterAdditionalMcpServers` exported from api.ts.
 * Standalone tsx-runnable script (matches mcp-client-manager.webapp-cap.test.ts
 * + agent-session.test.ts pattern — node:assert/strict, no vitest).
 *
 * Coverage:
 *   T1 — webappId='abc' WITH matching `bytebot:webapp:abc` → scope='webapp',
 *        only that server returned.
 *   T2 — webappId='abc' WITHOUT matching server (liv-core reconcile lag —
 *        see 100-08-04-SUMMARY.md "Risk model — Redis reconciliation lag")
 *        → scope='lag-fallback', host bytebot + user MCPs returned, WARN
 *        logged with `webappScope=<id>` `fallback=lag`.
 *   T3 — webappId absent → scope='host', host bytebot + user MCPs returned,
 *        per-WebApp instances filtered out.
 *   T4 — webappId='abc' but `bytebot:webapp:xyz` registered (other webapp) →
 *        scope='lag-fallback' (target not found), other webapp's instance
 *        filtered out (no cross-scope leak).
 *
 * Run: cd liv && npx tsx packages/core/src/api.scope-filter.test.ts
 */
import assert from 'node:assert/strict';
import {filterAdditionalMcpServers} from './api.js';

type Server = {name: string; transport: string};

const stubServers: Server[] = [
  {name: 'bytebot', transport: 'stdio'},
  {name: 'bytebot:webapp:abc', transport: 'stdio'},
  {name: 'bytebot:webapp:xyz', transport: 'stdio'},
  {name: 'my-mcp', transport: 'streamableHttp'},
];

class FakeLogger {
  warns: Array<{msg: string; meta?: unknown}> = [];
  warn(msg: string, meta?: unknown) {
    this.warns.push({msg, meta});
  }
}

async function testT1_webappScopeHit() {
  const logger = new FakeLogger();
  const {scope, servers} = filterAdditionalMcpServers(stubServers, 'abc', logger);
  assert.equal(scope, 'webapp');
  assert.equal(servers.length, 1);
  assert.equal(servers[0]!.name, 'bytebot:webapp:abc');
  assert.equal(logger.warns.length, 0);
  console.log('  PASS T1: scope=webapp, only bytebot:webapp:abc returned');
}

async function testT2_lagFallback() {
  const logger = new FakeLogger();
  // Stub WITHOUT bytebot:webapp:abc — simulates liv-core reconcile lag.
  const lagging = stubServers.filter(s => s.name !== 'bytebot:webapp:abc');
  const {scope, servers} = filterAdditionalMcpServers(lagging, 'abc', logger);
  assert.equal(scope, 'lag-fallback');
  const names = servers.map(s => s.name).sort();
  assert.deepEqual(names, ['bytebot', 'my-mcp']);
  assert.equal(logger.warns.length, 1, 'lag-fallback should log a WARN');
  assert.match(logger.warns[0]!.msg, /lag fallback|scope-filter/i);
  const meta = logger.warns[0]!.meta as {webappScope?: string; fallback?: string};
  assert.equal(meta?.webappScope, 'abc');
  assert.equal(meta?.fallback, 'lag');
  console.log('  PASS T2: scope=lag-fallback, host bytebot + my-mcp returned, WARN logged');
}

async function testT3_hostScope() {
  const logger = new FakeLogger();
  const {scope, servers} = filterAdditionalMcpServers(stubServers, null, logger);
  assert.equal(scope, 'host');
  const names = servers.map(s => s.name).sort();
  assert.deepEqual(names, ['bytebot', 'my-mcp']);
  assert.equal(logger.warns.length, 0);
  console.log('  PASS T3: scope=host, per-WebApp instances filtered out');
}

async function testT4_otherWebappRegistered() {
  const logger = new FakeLogger();
  // Only bytebot:webapp:xyz registered, but request asks for 'abc'.
  const onlyXyz = stubServers.filter(s => s.name !== 'bytebot:webapp:abc');
  const {scope, servers} = filterAdditionalMcpServers(onlyXyz, 'abc', logger);
  assert.equal(scope, 'lag-fallback');
  const names = servers.map(s => s.name).sort();
  // bytebot:webapp:xyz EXCLUDED — no cross-scope leak.
  assert.deepEqual(names, ['bytebot', 'my-mcp']);
  console.log('  PASS T4: target=abc registered=xyz → lag-fallback, xyz NOT leaked');
}

(async () => {
  console.log('api.scope-filter (Phase 100-08-05) tests');
  try {
    await testT1_webappScopeHit();
    await testT2_lagFallback();
    await testT3_hostScope();
    await testT4_otherWebappRegistered();
    console.log('\nAll tests PASS.');
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
})();
