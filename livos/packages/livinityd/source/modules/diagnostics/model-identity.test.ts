/**
 * Phase 47 Plan 03 Task 2 — model-identity.test.ts
 *
 * Verdict computation against 4 fixture sets (one per bucket) + 2
 * graceful-degrade tests + 1 D-NO-SERVER4 hard-wall test (G-10).
 *
 * Pattern mirrors fail2ban-admin/active-sessions.test.ts: bare `tsx` runner
 * (no Vitest), DI fakes for execFile + fetch, `node:assert/strict`. Each test
 * builds a fresh fixture set so passing tests are order-independent.
 */

import assert from 'node:assert/strict'

import {
	makeDiagnoseModelIdentity,
	type ExecFileFn,
	type FetchFn,
} from './model-identity.js'

// ── Test helpers ────────────────────────────────────────────────────────────

interface ExecFixture {
	stdout: string
	stderr?: string
}

/**
 * Build a fake ExecFileFn that matches `${binary} ${args.join(' ')}` against
 * the provided fixture map (substring match — first hit wins). Anything not
 * matched throws ENOENT (so tests can omit fixtures for steps they want to
 * exercise the graceful-degrade path on).
 */
function makeFakeExec(
	fixtures: Record<string, ExecFixture | Error>,
): ExecFileFn {
	return async (binary, args) => {
		const key = `${binary} ${args.join(' ')}`
		for (const k of Object.keys(fixtures)) {
			if (key.includes(k)) {
				const v = fixtures[k]!
				if (v instanceof Error) throw v
				return {stdout: v.stdout, stderr: v.stderr ?? ''}
			}
		}
		const enoent = Object.assign(new Error(`ENOENT: no fixture for "${key}"`), {
			code: 'ENOENT',
		})
		throw enoent
	}
}

interface FetchFixture {
	ok?: boolean
	status?: number
	json?: () => Promise<unknown>
	throw?: Error
}

function makeFakeFetch(response: FetchFixture): FetchFn {
	return async () => {
		if (response.throw) throw response.throw
		return {
			ok: response.ok ?? true,
			status: response.status ?? 200,
			json: response.json ?? (async () => ({})),
		} as unknown as Response
	}
}

// ── Test runner ─────────────────────────────────────────────────────────────

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

	// ── Test 1: fixture A (clean) ──────────────────────────────────────────
	await test('Test 1: fixture A (clean) → verdict=clean', async () => {
		const exec = makeFakeExec({
			'pgrep -af claude': {stdout: ''},
			'ls -la /opt/livos/node_modules/.pnpm/': {
				stdout:
					'drwxr-xr-x 2 root root @nexus+core@1.0.0_xyz\n',
			},
			'readlink -f /opt/livos/node_modules/@nexus/core': {
				stdout:
					'/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_xyz/node_modules/@nexus/core\n',
			},
			'ls -la /opt/livos/node_modules/@nexus/core': {
				stdout:
					'lrwxrwxrwx 1 root root 155 Apr 24 22:37 -> .pnpm/@nexus+core@1.0.0_xyz/...\n',
			},
			'grep -c You are powered by the model named': {stdout: '5\n'},
			'stat -c %Y': {
				stdout: String(Math.floor(Date.now() / 1000)) + '\n',
			},
		})
		const fetch = makeFakeFetch({
			json: async () => ({model: 'claude-opus-4-7'}),
		})
		const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
		const r = await d.diagnose()
		assert.equal(r.verdict, 'clean', 'expected clean, got ' + r.verdict)
		assert.equal(r.steps.step1_brokerProbe.match, true)
		assert.equal(r.steps.step4_pnpmStoreCount.driftRisk, false)
		assert.equal(r.steps.step6_identityMarker.markerPresent, true)
	})

	// ── Test 2: fixture B (both) ───────────────────────────────────────────
	await test('Test 2: fixture B (both) → verdict=both', async () => {
		const exec = makeFakeExec({
			'pgrep -af claude': {stdout: ''},
			'ls -la /opt/livos/node_modules/.pnpm/': {
				stdout:
					'drwxr-xr-x 2 root root @nexus+core@1.0.0_a\ndrwxr-xr-x 2 root root @nexus+core@1.0.0_b\n',
			},
			'readlink -f /opt/livos/node_modules/@nexus/core': {
				stdout:
					'/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_a/node_modules/@nexus/core\n',
			},
			'ls -la /opt/livos/node_modules/@nexus/core': {stdout: '...\n'},
			'grep -c You are powered by the model named': {stdout: '0\n'},
			'stat -c %Y': {stdout: '1700000000\n'},
		})
		const fetch = makeFakeFetch({
			json: async () => ({model: 'claude-3-5-sonnet'}),
		})
		const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
		const r = await d.diagnose()
		assert.equal(r.verdict, 'both', 'expected both, got ' + r.verdict)
	})

	// ── Test 3: fixture C (dist-drift) ─────────────────────────────────────
	await test('Test 3: fixture C (dist-drift) → verdict=dist-drift', async () => {
		const exec = makeFakeExec({
			'pgrep -af claude': {stdout: ''},
			'ls -la /opt/livos/node_modules/.pnpm/': {
				stdout:
					'drwxr-xr-x 2 root root @nexus+core@1.0.0_a\ndrwxr-xr-x 2 root root @nexus+core@1.0.0_b\n',
			},
			'readlink -f /opt/livos/node_modules/@nexus/core': {
				stdout:
					'/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_a/node_modules/@nexus/core\n',
			},
			'ls -la /opt/livos/node_modules/@nexus/core': {stdout: '...\n'},
			'grep -c You are powered by the model named': {stdout: '0\n'},
			'stat -c %Y': {stdout: '1700000000\n'},
		})
		const fetch = makeFakeFetch({
			json: async () => ({model: 'claude-opus-4-7'}),
		})
		const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
		const r = await d.diagnose()
		assert.equal(
			r.verdict,
			'dist-drift',
			'expected dist-drift, got ' + r.verdict,
		)
	})

	// ── Test 4: fixture D (source-confabulation) ───────────────────────────
	await test(
		'Test 4: fixture D (source-confabulation) → verdict=source-confabulation',
		async () => {
			const exec = makeFakeExec({
				'pgrep -af claude': {stdout: ''},
				'ls -la /opt/livos/node_modules/.pnpm/': {
					stdout:
						'drwxr-xr-x 2 root root @nexus+core@1.0.0_xyz\n',
				},
				'readlink -f /opt/livos/node_modules/@nexus/core': {
					stdout:
						'/opt/livos/node_modules/.pnpm/@nexus+core@1.0.0_xyz/node_modules/@nexus/core\n',
				},
				'ls -la /opt/livos/node_modules/@nexus/core': {stdout: '...\n'},
				'grep -c You are powered by the model named': {stdout: '5\n'},
				'stat -c %Y': {
					stdout: String(Math.floor(Date.now() / 1000)) + '\n',
				},
			})
			const fetch = makeFakeFetch({
				json: async () => ({model: 'claude-3-5-sonnet'}),
			})
			const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
			const r = await d.diagnose()
			assert.equal(
				r.verdict,
				'source-confabulation',
				'expected source-confabulation, got ' + r.verdict,
			)
		},
	)

	// ── Test 5: graceful degrade — pgrep ENOENT ────────────────────────────
	await test(
		'Test 5: graceful degrade — pgrep ENOENT → step3=NONE, diagnostic continues',
		async () => {
			const exec = makeFakeExec({
				// no pgrep fixture → ENOENT-thrown by makeFakeExec
				'ls -la /opt/livos/node_modules/.pnpm/': {
					stdout:
						'drwxr-xr-x 2 root root @nexus+core@1.0.0_xyz\n',
				},
				'readlink -f /opt/livos/node_modules/@nexus/core': {
					stdout: '/path/x\n',
				},
				'ls -la /opt/livos/node_modules/@nexus/core': {stdout: '...\n'},
				'grep -c You are powered by the model named': {stdout: '5\n'},
				'stat -c %Y': {
					stdout: String(Math.floor(Date.now() / 1000)) + '\n',
				},
			})
			const fetch = makeFakeFetch({
				json: async () => ({model: 'claude-opus-4-7'}),
			})
			const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
			const r = await d.diagnose()
			assert.equal(r.steps.step3_environSnapshot, 'NONE')
			// step3 missing should not poison the verdict — clean fixture except
			// for the missing pgrep (single dir, marker present, broker match).
			assert.notEqual(r.verdict, 'inconclusive')
			assert.equal(r.verdict, 'clean')
		},
	)

	// ── Test 6: graceful degrade — broker fetch errors ─────────────────────
	await test(
		'Test 6: graceful degrade — broker fetch errors → verdict=inconclusive',
		async () => {
			const exec = makeFakeExec({})
			const fetch = makeFakeFetch({throw: new Error('ECONNREFUSED')})
			const d = makeDiagnoseModelIdentity({execFile: exec, fetch})
			const r = await d.diagnose()
			assert.equal(r.verdict, 'inconclusive')
			assert.ok(
				r.steps.step1_brokerProbe.error,
				'step1.error should be populated when fetch throws',
			)
		},
	)

	// ── Test 7: D-NO-SERVER4 hard-wall ─────────────────────────────────────
	await test(
		'Test 7: D-NO-SERVER4 hard-wall — refuse if brokerBaseUrl points at Server4',
		async () => {
			const exec = makeFakeExec({})
			const fetch = makeFakeFetch({})
			const d = makeDiagnoseModelIdentity({
				execFile: exec,
				fetch,
				brokerBaseUrl: 'http://45.137.194.103:8080',
			})
			await assert.rejects(d.diagnose(), /D-NO-SERVER4/)
		},
	)

	console.log(`\n${passed} passed, ${failed} failed`)
	if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
	console.error(err)
	process.exit(1)
})
