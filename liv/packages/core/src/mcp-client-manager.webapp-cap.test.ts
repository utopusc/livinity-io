/**
 * Phase 97-06 — McpClientManager per-WebApp registration + cap tests.
 *
 * Coverage:
 *   T1 — registerWebAppInstance with prefix-correct name installs via
 *        configManager.
 *   T2 — Wrong prefix throws.
 *   T3 — 4th distinct registration throws McpInstanceCapError.
 *   T4 — Re-registering an existing instanceKey is an idempotent upsert
 *        (does NOT count toward the cap a second time).
 *   T5 — listWebAppInstanceNames filters to enabled luse:webapp:* entries.
 *   T6 — deregisterWebAppInstance calls configManager.removeServer.
 *   T7 — deregisterWebAppInstance for a non-prefix name is a no-op.
 *
 * Standalone tsx-runnable script (matches liv-agent-runner.test.ts pattern).
 */
import {EventEmitter} from 'node:events';
import {McpClientManager, McpInstanceCapError} from './mcp-client-manager.js';
import type {McpServerConfig} from './mcp-types.js';

class FakeConfigManager {
	mcpServers: Record<string, McpServerConfig> = {};
	calls: Array<{op: string; arg: unknown}> = [];

	async getConfig() {
		return {mcpServers: this.mcpServers};
	}
	async installServer(server: McpServerConfig) {
		this.calls.push({op: 'installServer', arg: server});
		this.mcpServers[server.name] = server;
	}
	async removeServer(name: string) {
		this.calls.push({op: 'removeServer', arg: name});
		const had = Boolean(this.mcpServers[name]);
		delete this.mcpServers[name];
		return had;
	}
}

const PASS: string[] = [];
const FAIL: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
	try {
		await fn();
		PASS.push(name);
		console.log(`  PASS  ${name}`);
	} catch (err) {
		FAIL.push(name);
		console.log(`  FAIL  ${name}: ${(err as Error).message}\n${(err as Error).stack ?? ''}`);
	}
}

function makeManager(): {mgr: McpClientManager; cm: FakeConfigManager} {
	const cm = new FakeConfigManager();
	const fakeRedis = new EventEmitter() as never;
	const fakeRegistry = {} as never;
	const mgr = new McpClientManager(fakeRedis, fakeRegistry, cm as never);
	return {mgr, cm};
}

function buildConfig(name: string, windowId: number): McpServerConfig {
	return {
		name,
		transport: 'stdio',
		command: 'tsx',
		args: ['/opt/livos/server.ts'],
		env: {DISPLAY: ':0', LUSE_TARGET_WINDOW_ID: String(windowId)},
		enabled: true,
		installedAt: Date.now(),
	} as McpServerConfig;
}

(async () => {
	console.log('McpClientManager per-WebApp registration tests');

	await test('T1: prefix-correct name installs via configManager', async () => {
		const {mgr, cm} = makeManager();
		await mgr.registerWebAppInstance('luse:webapp:abc', buildConfig('luse:webapp:abc', 1));
		const installed = cm.calls.filter((c) => c.op === 'installServer');
		if (installed.length !== 1) throw new Error(`expected 1 install call, got ${installed.length}`);
		if (!cm.mcpServers['luse:webapp:abc']) throw new Error('config entry not persisted');
	});

	await test('T2: wrong prefix throws', async () => {
		const {mgr} = makeManager();
		try {
			await mgr.registerWebAppInstance('not-prefixed', buildConfig('not-prefixed', 1));
			throw new Error('expected throw');
		} catch (err) {
			if (!(err instanceof Error)) throw err;
			if (!/must start with/.test(err.message)) throw new Error(`unexpected error: ${err.message}`);
		}
	});

	await test('T3: 4th registration throws McpInstanceCapError', async () => {
		const {mgr} = makeManager();
		await mgr.registerWebAppInstance('luse:webapp:a', buildConfig('luse:webapp:a', 1));
		await mgr.registerWebAppInstance('luse:webapp:b', buildConfig('luse:webapp:b', 2));
		await mgr.registerWebAppInstance('luse:webapp:c', buildConfig('luse:webapp:c', 3));
		try {
			await mgr.registerWebAppInstance('luse:webapp:d', buildConfig('luse:webapp:d', 4));
			throw new Error('expected cap error');
		} catch (err) {
			if (!(err instanceof McpInstanceCapError)) {
				throw new Error(`expected McpInstanceCapError, got ${(err as Error).constructor.name}`);
			}
			if (err.code !== 'MCP_INSTANCE_CAP_EXCEEDED') {
				throw new Error(`expected code MCP_INSTANCE_CAP_EXCEEDED, got ${err.code}`);
			}
		}
	});

	await test('T4: idempotent upsert — re-register same instanceKey is allowed', async () => {
		const {mgr, cm} = makeManager();
		await mgr.registerWebAppInstance('luse:webapp:a', buildConfig('luse:webapp:a', 1));
		await mgr.registerWebAppInstance('luse:webapp:b', buildConfig('luse:webapp:b', 2));
		await mgr.registerWebAppInstance('luse:webapp:c', buildConfig('luse:webapp:c', 3));
		// Now re-register 'a' with a different windowId — must NOT throw,
		// must NOT count against the cap.
		await mgr.registerWebAppInstance('luse:webapp:a', buildConfig('luse:webapp:a', 99));
		// The latest install should overwrite the env.
		const updated = cm.mcpServers['luse:webapp:a'];
		if (updated?.env?.LUSE_TARGET_WINDOW_ID !== '99') {
			throw new Error(`upsert failed; env: ${JSON.stringify(updated?.env)}`);
		}
	});

	await test('T5: listWebAppInstanceNames filters to enabled luse:webapp:*', async () => {
		const {mgr, cm} = makeManager();
		await mgr.registerWebAppInstance('luse:webapp:a', buildConfig('luse:webapp:a', 1));
		// Add a non-prefix entry directly.
		cm.mcpServers['ordinary'] = buildConfig('ordinary', 0) as McpServerConfig;
		// Add a disabled prefix entry.
		const disabled = buildConfig('luse:webapp:disabled', 5);
		(disabled as {enabled: boolean}).enabled = false;
		cm.mcpServers['luse:webapp:disabled'] = disabled;
		const names = await mgr.listWebAppInstanceNames();
		if (names.length !== 1 || names[0] !== 'luse:webapp:a') {
			throw new Error(`expected ['luse:webapp:a'], got ${JSON.stringify(names)}`);
		}
	});

	await test('T6: deregisterWebAppInstance calls configManager.removeServer', async () => {
		const {mgr, cm} = makeManager();
		await mgr.registerWebAppInstance('luse:webapp:a', buildConfig('luse:webapp:a', 1));
		await mgr.deregisterWebAppInstance('luse:webapp:a');
		const removed = cm.calls.filter((c) => c.op === 'removeServer');
		if (removed.length !== 1) throw new Error(`expected 1 remove call, got ${removed.length}`);
		if (cm.mcpServers['luse:webapp:a']) throw new Error('entry not removed');
	});

	await test('T7: deregister non-prefix name is no-op', async () => {
		const {mgr, cm} = makeManager();
		cm.mcpServers['ordinary'] = buildConfig('ordinary', 0) as McpServerConfig;
		await mgr.deregisterWebAppInstance('ordinary');
		// removeServer should NOT have been called.
		const removed = cm.calls.filter((c) => c.op === 'removeServer');
		if (removed.length !== 0) throw new Error(`expected 0 remove calls, got ${removed.length}`);
	});

	const total = PASS.length + FAIL.length;
	console.log(`\n${PASS.length} pass, ${FAIL.length} fail (of ${total})`);
	process.exit(FAIL.length === 0 ? 0 : 1);
})();
