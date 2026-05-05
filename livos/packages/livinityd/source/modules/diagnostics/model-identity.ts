/**
 * Phase 47 Plan 03 — Model Identity Diagnostic (FR-MODEL-01 / FR-MODEL-02).
 *
 * On-Mini-PC 6-step diagnostic that surfaces a verdict from
 * {clean, dist-drift, source-confabulation, both, inconclusive} so the operator
 * (and Plan 47-04's UI route) can detect whether the LivOS broker passthrough
 * stack is reporting the *actually-running* model coherently. Replaces the
 * one-off SSH transcript captured by Plan 47-01 with a runtime-callable
 * function executed locally by livinityd.
 *
 * Steps (per .planning/research/v29.4-PITFALLS.md B-05 recipe):
 *   1. Broker probe — POST a short message to /u/<adminId>/v1/messages and
 *      read the response.model field literal.
 *   2. Interpret the response.model literal vs expected.
 *   3. /proc/<claude-pid>/environ snapshot — capture ANTHROPIC_/CLAUDE_/HOME/
 *      PATH only. Plan 47-04's route layer redacts *_KEY/*_TOKEN/*_SECRET.
 *   4. pnpm-store @nexus+core* dir count — >1 ⇒ pnpm-store quirk active
 *      (memory: update.sh pnpm-store quirk). dist-drift risk gauge.
 *   5. readlink -f the resolved @liv/core symlink — locates the dir
 *      livinityd actually imports from at runtime (M-09 fallback applies).
 *   6. Identity-line marker grep + dist mtime — confirms the v29.4 43.10
 *      identity-line patch is present in the resolved dist.
 *
 * Verdict computation (Pattern Map):
 *   - clean                 — Step 1 match, Step 4 single dir, Step 6 marker present.
 *   - dist-drift            — Step 4 multi-dir AND Step 6 marker missing AND Step 1 match.
 *   - source-confabulation  — Step 6 marker present BUT Step 1 mismatch.
 *   - both                  — Step 4 multi-dir AND Step 6 marker missing AND Step 1 mismatch.
 *   - inconclusive          — Step 1 errored OR no other case matched.
 *
 * Hard-wall (D-NO-SERVER4 / G-10): if `brokerBaseUrl` resolves to either
 * Server4 (45.137.194.103) or Server5 (45.137.194.102), the diagnostic refuses
 * to run. Mini PC localhost only.
 *
 * Sacred file untouched (D-40-01) — this module is the *diagnostic surface
 * only*. Branch B (source-confabulation remediation) lives in a separate
 * task and is gated by the verdict captured in 47-01-DIAGNOSTIC.md. For
 * verdict=neither (Branch N), this is the only file that ships.
 *
 * DI pattern mirrors `fail2ban-admin/active-sessions.ts` (factory taking a
 * mock-friendly `ExecFileFn` + `FetchFn` so tests inject fixture stdout/JSON
 * without touching the real Mini PC).
 */

import {execFile as execFileCb} from 'node:child_process'
import {promisify} from 'node:util'

// ── Public types ────────────────────────────────────────────────────────────

export type ModelIdentityVerdict =
	| 'clean'
	| 'dist-drift'
	| 'source-confabulation'
	| 'both'
	| 'inconclusive'

export interface DiagnoseModelIdentityResult {
	verdict: ModelIdentityVerdict
	steps: {
		step1_brokerProbe: {
			url: string
			responseModel: string | null
			expected: string
			match: boolean
			error?: string
		}
		step2_responseModelInterpretation: string
		step3_environSnapshot:
			| {pids: number[]; envs: Record<string, string>[]}
			| 'NONE'
		step4_pnpmStoreCount: {
			dirs: string[]
			count: number
			driftRisk: boolean
		}
		step5_resolvedDist: {
			path: string
			ls: string
		}
		step6_identityMarker: {
			resolvedDistPath: string
			markerCount: number
			mtime: number
			markerPresent: boolean
		}
	}
	capturedAt: string
}

export type ExecFileFn = (
	binary: string,
	args: string[],
	opts: {timeout: number},
) => Promise<{stdout: string; stderr: string}>

export type FetchFn = typeof fetch

export interface ModelIdentityDeps {
	execFile: ExecFileFn
	fetch: FetchFn
	brokerBaseUrl?: string
	adminUserIdResolver?: () => Promise<string | null>
	expectedModelId?: string
}

// ── Hard-wall constants (G-10 D-NO-SERVER4) ─────────────────────────────────

/**
 * Forbidden hosts. Mini PC ONLY — Server4 (off-limits per HARD RULE 2026-04-27)
 * and Server5 (livinity.io relay) MUST NOT be probed by this diagnostic. The
 * check is defensive: livinityd already runs locally on the Mini PC, but if
 * a config bug ever pointed `brokerBaseUrl` at a remote host, the diagnostic
 * refuses rather than leak an environ snapshot off-box.
 */
const FORBIDDEN_HOSTS = ['45.137.194.103', '45.137.194.102']

const DEFAULT_BROKER_BASE_URL = 'http://localhost:8080'
const DEFAULT_EXPECTED_MODEL_ID = 'claude-opus-4-7'
const PROBE_TIMEOUT_MS = 10_000
const EXEC_TIMEOUT_SHORT_MS = 2_000
const EXEC_TIMEOUT_MS = 5_000

const ENVIRON_KEY_FILTER = /^(ANTHROPIC|CLAUDE|HOME|PATH)=/
const IDENTITY_MARKER = 'You are powered by the model named'

// ── Factory ─────────────────────────────────────────────────────────────────

export function makeDiagnoseModelIdentity(deps: ModelIdentityDeps) {
	const baseUrl = deps.brokerBaseUrl ?? DEFAULT_BROKER_BASE_URL
	const expected = deps.expectedModelId ?? DEFAULT_EXPECTED_MODEL_ID

	return {
		async diagnose(): Promise<DiagnoseModelIdentityResult> {
			// G-10 hard-wall — refuse if brokerBaseUrl points off-Mini-PC.
			for (const h of FORBIDDEN_HOSTS) {
				if (baseUrl.includes(h)) {
					throw new Error(
						`D-NO-SERVER4: refusing to diagnose against forbidden host ${h}`,
					)
				}
			}

			// ── Step 1: broker probe ──────────────────────────────────────────
			let step1: DiagnoseModelIdentityResult['steps']['step1_brokerProbe']
			let probeUrl = baseUrl
			try {
				const userId = (await deps.adminUserIdResolver?.()) ?? 'admin'
				probeUrl = `${baseUrl}/u/${userId}/v1/messages`
				const ctl = new AbortController()
				const timeoutHandle = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS)
				try {
					const r = await deps.fetch(probeUrl, {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							'anthropic-version': '2023-06-01',
						},
						body: JSON.stringify({
							model: expected,
							max_tokens: 50,
							messages: [
								{
									role: 'user',
									content:
										'What model are you? Respond with only the exact model ID.',
								},
							],
						}),
						signal: ctl.signal,
					})
					const json = (await r.json()) as {model?: string}
					const responseModel = json?.model ?? null
					step1 = {
						url: probeUrl,
						responseModel,
						expected,
						match: responseModel === expected,
					}
				} finally {
					clearTimeout(timeoutHandle)
				}
			} catch (err) {
				const message = (err as Error)?.message ?? 'fetch_failed'
				step1 = {
					url: probeUrl,
					responseModel: null,
					expected,
					match: false,
					error: message,
				}
			}

			// ── Step 2: human-readable interpretation ────────────────────────
			const step2 = step1.match
				? `response.model literal "${step1.responseModel}" matches expected — broker layer clean`
				: `response.model literal "${step1.responseModel}" disagrees with expected "${expected}" — possible source-confabulation`

			// ── Step 3: /proc/<claude-pid>/environ snapshot ─────────────────
			let step3: DiagnoseModelIdentityResult['steps']['step3_environSnapshot']
			try {
				const pgrepR = await deps.execFile('pgrep', ['-af', 'claude'], {
					timeout: EXEC_TIMEOUT_MS,
				})
				const pids = pgrepR.stdout
					.split('\n')
					.map((l) => parseInt(l.trim().split(' ')[0]!, 10))
					.filter((n) => !Number.isNaN(n))
				if (pids.length === 0) {
					step3 = 'NONE'
				} else {
					const envs: Record<string, string>[] = []
					for (const pid of pids) {
						try {
							const er = await deps.execFile(
								'cat',
								[`/proc/${pid}/environ`],
								{timeout: EXEC_TIMEOUT_SHORT_MS},
							)
							const env: Record<string, string> = {}
							for (const kv of er.stdout.split('\0')) {
								if (ENVIRON_KEY_FILTER.test(kv)) {
									const eq = kv.indexOf('=')
									env[kv.slice(0, eq)] = kv.slice(eq + 1)
								}
							}
							envs.push(env)
						} catch {
							// Swallow ENOENT / perm errors — best-effort snapshot.
						}
					}
					step3 = {pids, envs}
				}
			} catch {
				step3 = 'NONE'
			}

			// ── Step 4: pnpm-store @nexus+core* dir count ───────────────────
			let step4: DiagnoseModelIdentityResult['steps']['step4_pnpmStoreCount']
			try {
				const lsR = await deps.execFile(
					'ls',
					['-la', '/opt/livos/node_modules/.pnpm/'],
					{timeout: EXEC_TIMEOUT_MS},
				)
				const dirs = lsR.stdout.split('\n').filter((l) => /@nexus\+core/.test(l))
				step4 = {dirs, count: dirs.length, driftRisk: dirs.length > 1}
			} catch {
				step4 = {dirs: [], count: 0, driftRisk: false}
			}

			// ── Step 5: readlink -f resolved path ───────────────────────────
			let step5: DiagnoseModelIdentityResult['steps']['step5_resolvedDist']
			try {
				const rlR = await deps.execFile(
					'readlink',
					['-f', '/opt/livos/node_modules/@liv/core'],
					{timeout: EXEC_TIMEOUT_MS},
				)
				const lsR = await deps.execFile(
					'ls',
					['-la', '/opt/livos/node_modules/@liv/core'],
					{timeout: EXEC_TIMEOUT_MS},
				)
				step5 = {path: rlR.stdout.trim(), ls: lsR.stdout}
			} catch {
				step5 = {path: '', ls: ''}
			}

			// ── Step 6: identity-line marker grep + dist mtime ──────────────
			let step6: DiagnoseModelIdentityResult['steps']['step6_identityMarker']
			try {
				const distPath = step5.path
					? `${step5.path}/dist/index.js`
					: '/opt/livos/node_modules/@liv/core/dist/index.js'
				const grepR = await deps.execFile(
					'grep',
					['-c', IDENTITY_MARKER, distPath],
					{timeout: EXEC_TIMEOUT_MS},
				)
				const markerCount = parseInt(grepR.stdout.trim(), 10) || 0
				const statR = await deps.execFile('stat', ['-c', '%Y', distPath], {
					timeout: EXEC_TIMEOUT_MS,
				})
				const mtime = parseInt(statR.stdout.trim(), 10) || 0
				step6 = {
					resolvedDistPath: distPath,
					markerCount,
					mtime,
					markerPresent: markerCount > 0,
				}
			} catch {
				step6 = {
					resolvedDistPath: '',
					markerCount: 0,
					mtime: 0,
					markerPresent: false,
				}
			}

			// ── Verdict computation ─────────────────────────────────────────
			let verdict: ModelIdentityVerdict
			if (step1.error) {
				verdict = 'inconclusive'
			} else if (step4.driftRisk && !step6.markerPresent) {
				verdict = step1.match ? 'dist-drift' : 'both'
			} else if (step6.markerPresent && !step1.match) {
				verdict = 'source-confabulation'
			} else if (step1.match && step6.markerPresent && !step4.driftRisk) {
				verdict = 'clean'
			} else {
				verdict = 'inconclusive'
			}

			return {
				verdict,
				steps: {
					step1_brokerProbe: step1,
					step2_responseModelInterpretation: step2,
					step3_environSnapshot: step3,
					step4_pnpmStoreCount: step4,
					step5_resolvedDist: step5,
					step6_identityMarker: step6,
				},
				capturedAt: new Date().toISOString(),
			}
		},
	}
}

// ── Production-wired singleton ─────────────────────────────────────────────

const execFileP = promisify(execFileCb)

const realExec: ExecFileFn = async (binary, args, opts) => {
	const r = await execFileP(binary, args, {timeout: opts.timeout, encoding: 'utf8'})
	return {stdout: r.stdout as string, stderr: r.stderr as string}
}

export const realDiagnoseModelIdentity = makeDiagnoseModelIdentity({
	execFile: realExec,
	fetch: globalThis.fetch,
})
