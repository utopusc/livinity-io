/**
 * Phase 97-06 — LivAgentRunner Auto-mode extension tests.
 *
 * Coverage:
 *   T1 — start() with autoMode.skillPromptBlock prepends the block to the
 *        task passed to sdkRunner.run().
 *   T2 — start() without autoMode passes task unchanged (regression guard).
 *   T3 — Three consecutive `validation:fail` lines emit a `needs_help`
 *        chunk and stop further turn dispatch.
 *   T4 — `validation:pass` resets the strike counter.
 *   T5 — Counter scoped per-Auto-run: a fresh start() resets state even if
 *        the previous run reached the strike limit.
 *
 * Standalone tsx script style (matches the pattern of liv-agent-runner.test.ts
 * — the existing tests in this package are NOT vitest-suite; they run as
 * `tsx <file>` and exit 0 on pass / 1 on fail).
 */
import {EventEmitter} from 'node:events';

import {LivAgentRunner, type LivAgentRunnerOptions, type LivAutoModeOptions} from './liv-agent-runner.js';

// ── Minimal RunStore stub ───────────────────────────────────────────────
class FakeRunStore {
	chunks: Array<{runId: string; chunk: unknown}> = [];
	control: 'stop' | 'pause' | null = null;
	completed: Array<{runId: string; result: unknown}> = [];
	errored: Array<{runId: string; error: unknown}> = [];

	async appendChunk(runId: string, chunk: unknown) {
		this.chunks.push({runId, chunk});
	}
	async getControl(_runId: string) {
		return this.control;
	}
	async setControl(_runId: string, sig: 'stop' | 'pause' | null) {
		this.control = sig;
	}
	async markComplete(runId: string, result: unknown) {
		this.completed.push({runId, result});
	}
	async markError(runId: string, error: unknown) {
		this.errored.push({runId, error});
	}
	// no-op surface that LivAgentRunner imports may touch
	async appendChunkBatch() {}
}

// ── Stub SDK runner ─────────────────────────────────────────────────────
class StubSdkRunner extends EventEmitter {
	receivedTask: string | null = null;
	script: Array<{delayMs: number; emit: () => void}> = [];

	async run(task: string): Promise<void> {
		this.receivedTask = task;
		for (const step of this.script) {
			if (step.delayMs > 0) await new Promise((r) => setTimeout(r, step.delayMs));
			step.emit();
		}
	}
}

const PASS: string[] = [];
const FAIL: string[] = [];
function test(name: string, fn: () => Promise<void> | void) {
	return async () => {
		try {
			await fn();
			PASS.push(name);
			console.log(`  PASS  ${name}`);
		} catch (err) {
			FAIL.push(name);
			console.log(`  FAIL  ${name}: ${(err as Error).message}\n${(err as Error).stack ?? ''}`);
		}
	};
}

function makeRunner(): {
	runner: LivAgentRunner;
	store: FakeRunStore;
	sdk: StubSdkRunner;
} {
	const store = new FakeRunStore();
	const sdk = new StubSdkRunner();
	const runner = new LivAgentRunner({
		runStore: store as unknown as LivAgentRunnerOptions['runStore'],
		sdkRunner: sdk as unknown as LivAgentRunnerOptions['sdkRunner'],
		toolRegistry: {} as LivAgentRunnerOptions['toolRegistry'],
		redisClient: {} as LivAgentRunnerOptions['redisClient'],
	});
	return {runner, store, sdk};
}

(async () => {
	console.log('LivAgentRunner Auto-mode tests');

	await test('T1: skillPromptBlock prepended to task before sdkRunner.run', async () => {
		const {runner, sdk} = makeRunner();
		const skillBlock = '<previously-learned-skill name="t">test</previously-learned-skill>';
		await runner.start('run-1', 'do thing X', {skillPromptBlock: skillBlock});
		if (sdk.receivedTask === null) throw new Error('sdkRunner.run never called');
		if (!sdk.receivedTask.startsWith(skillBlock)) {
			throw new Error(`task missing skill block prefix: got=${sdk.receivedTask.slice(0, 80)}`);
		}
		if (!sdk.receivedTask.endsWith('do thing X')) {
			throw new Error(`task missing user task suffix: got=${sdk.receivedTask.slice(-30)}`);
		}
	})();

	await test('T2: no autoMode → task unchanged (regression)', async () => {
		const {runner, sdk} = makeRunner();
		await runner.start('run-2', 'plain task');
		if (sdk.receivedTask !== 'plain task') {
			throw new Error(`expected 'plain task', got ${JSON.stringify(sdk.receivedTask)}`);
		}
	})();

	await test('T3: 3 consecutive validation:fail emits needs_help and stops', async () => {
		const {runner, store, sdk} = makeRunner();
		// Script: emit three assistant text messages, each carrying a
		// `validation:fail ...` line. After the 3rd, runner should set
		// stopRequested and emit a `needs_help` chunk.
		const failMsg = (n: number) => ({
			content: [{type: 'text', text: `step ${n} done\nvalidation:fail because ui changed`}],
		});
		sdk.script = [
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg(1))},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg(2))},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg(3))},
		];
		await runner.start('run-3', 'task', {skillPromptBlock: '<x/>'});
		// Drain in-flight handlers — start() awaits them before resolving
		// in the natural-completion path. To be safe, allow the next tick.
		await new Promise((r) => setTimeout(r, 5));

		const needsHelp = store.chunks.find((c) => (c.chunk as {type: string}).type === 'needs_help');
		if (!needsHelp) {
			throw new Error(
				`expected a needs_help chunk; got chunks: ${store.chunks.map((c) => (c.chunk as {type: string}).type).join(', ')}`,
			);
		}
		const payload = (needsHelp.chunk as {payload: {strikeCount: number; lastValidationReason: string}}).payload;
		if (payload.strikeCount !== 3) {
			throw new Error(`strikeCount expected 3, got ${payload.strikeCount}`);
		}
		if (!/ui changed/.test(payload.lastValidationReason)) {
			throw new Error(`lastValidationReason missing reason text: ${payload.lastValidationReason}`);
		}
	})();

	await test('T4: validation:pass resets the counter', async () => {
		const {runner, store, sdk} = makeRunner();
		const failMsg = {content: [{type: 'text', text: 'validation:fail something'}]};
		const passMsg = {content: [{type: 'text', text: 'validation:pass'}]};
		sdk.script = [
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', passMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
		];
		await runner.start('run-4', 'task', {skillPromptBlock: '<x/>'});
		await new Promise((r) => setTimeout(r, 5));
		const needsHelp = store.chunks.find((c) => (c.chunk as {type: string}).type === 'needs_help');
		if (needsHelp) {
			throw new Error('needs_help fired despite reset by validation:pass');
		}
	})();

	await test('T5: per-run scope — fresh start() resets the counter', async () => {
		const {runner, store, sdk} = makeRunner();
		const failMsg = {content: [{type: 'text', text: 'validation:fail'}]};
		// Run 1 — 3 fails → needs_help.
		sdk.script = [
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
		];
		await runner.start('run-5a', 'task', {skillPromptBlock: '<x/>'});
		await new Promise((r) => setTimeout(r, 5));
		const beforeReset = store.chunks.filter((c) => (c.chunk as {type: string}).type === 'needs_help').length;
		if (beforeReset !== 1) throw new Error(`expected 1 needs_help in run-5a, got ${beforeReset}`);

		// Run 2 — 2 fails (below limit). Because counter is per-run, no
		// needs_help should fire.
		sdk.script = [
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
			{delayMs: 0, emit: () => sdk.emit('liv:assistant_message', failMsg)},
		];
		await runner.start('run-5b', 'task', {skillPromptBlock: '<x/>'});
		await new Promise((r) => setTimeout(r, 5));
		const afterReset = store.chunks.filter((c) => (c.chunk as {type: string}).type === 'needs_help').length;
		if (afterReset !== 1) {
			throw new Error(`expected counter reset; needs_help count after run-5b: ${afterReset}`);
		}
	})();

	const total = PASS.length + FAIL.length;
	console.log(`\n${PASS.length} pass, ${FAIL.length} fail (of ${total})`);
	process.exit(FAIL.length === 0 ? 0 : 1);
})();

// Mark unused but-typed imports as referenced so tsc doesn't complain in
// strict mode when this file is included in the package's tsconfig.
const _typeOnly: LivAutoModeOptions = {};
void _typeOnly;
