/**
 * Phase 61 Plan 01 Wave 0 — typecheck smoke test for providers/ directory.
 *
 * Asserts that `tsc --noEmit` over ONLY the providers/ directory succeeds.
 * This indirectly proves:
 *   - providers/interface.ts type definitions compile (FR-BROKER-D2-01).
 *   - providers/anthropic.ts implements BrokerProvider with no `implements`
 *     constraint violations.
 *   - providers/registry.ts wires the AnthropicProvider into a typed Map
 *     without contract drift.
 *
 * Scope-narrowing rationale:
 *   We CANNOT shell to `npx tsc --noEmit` over the entire livinityd package
 *   because the package has unrelated pre-existing typecheck errors (e.g.,
 *   `agent-runner-factory.ts` referencing not-yet-exported nexus types,
 *   `user/routes.ts` ctx.user undefined narrowing, etc.). Those are out of
 *   scope for Plan 61-01 (Rule 3 scope boundary — only fix issues directly
 *   caused by this task).
 *
 *   Instead, we compile the three providers/ files explicitly via tsc with
 *   single-file mode. tsc walks imports starting from those files; the
 *   import surface is bounded to `@anthropic-ai/sdk` types + the broker's
 *   own `interface.ts`. If anything in providers/ has a type error, this
 *   test catches it without inheriting unrelated package-level noise.
 *
 *   Plan 02 (Wave 2) will append openai/gemini/mistral stub files to this
 *   test's compile list.
 *
 * RED until Plan 01 Task 2 (interface + anthropic + registry land).
 */
import {execFileSync} from 'node:child_process'
import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'
import {existsSync} from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// __dirname = .../livinityd/source/modules/livinity-broker/providers/__tests__
// Climb: __tests__/.. = providers, /.. = livinity-broker, /.. = modules,
// /.. = source, /.. = livinityd. 5 segments up.
const livinitydRoot = resolve(__dirname, '..', '..', '..', '..', '..')
const providersDir = resolve(__dirname, '..')

/**
 * Resolve the local `tsc` binary from livinityd's node_modules. Using the
 * resolved binary path bypasses npx's "is this command installed?" probe
 * which heuristically failed inside vitest's child shell environment
 * (npx printed "This is not the tsc command you are looking for" and
 * exited 1 even though tsc exists at node_modules/typescript/bin/tsc).
 *
 * On Windows the CLI shim is `tsc.cmd`; on POSIX it's `tsc` (a symlink to
 * the JS shim). Both are executable directly via execFileSync.
 */
function resolveTscBinary(): string {
	const isWindows = process.platform === 'win32'
	const binDir = resolve(livinitydRoot, 'node_modules', '.bin')
	// pnpm/npm on Windows ships both lowercase `tsc.cmd` and uppercase
	// `tsc.CMD` depending on installer version + filesystem case-sensitivity.
	// Probe both. POSIX has only `tsc`.
	const candidates = isWindows
		? [resolve(binDir, 'tsc.CMD'), resolve(binDir, 'tsc.cmd')]
		: [resolve(binDir, 'tsc')]
	for (const c of candidates) {
		if (existsSync(c)) return c
	}
	throw new Error(
		`tsc binary not found at any of: ${candidates.join(', ')} (livinitydRoot=${livinitydRoot})`,
	)
}

describe('Phase 61 Plan 01 Wave 0 — providers/ interface compile gate (FR-BROKER-D2-01)', () => {
	it(
		'tsc --noEmit on providers/ files succeeds (interface + anthropic + registry typecheck cleanly)',
		() => {
			// Single-file mode: when files are passed as positional args, tsc
			// uses default compiler options. We pass --target ES2022 + --module
			// nodenext + --moduleResolution nodenext + --strict (the same
			// options @tsconfig/node22 uses) so the typecheck matches the
			// package's actual compile environment.
			const files = [
				resolve(providersDir, 'interface.ts'),
				resolve(providersDir, 'anthropic.ts'),
				resolve(providersDir, 'registry.ts'),
				// Plan 02 (Wave 2) — stub providers MUST also typecheck cleanly.
				resolve(providersDir, 'openai-stub.ts'),
				resolve(providersDir, 'gemini-stub.ts'),
				resolve(providersDir, 'mistral-stub.ts'),
			]
			const tsc = resolveTscBinary()
			try {
				execFileSync(
					tsc,
					[
						'--noEmit',
						'--target',
						'ES2022',
						'--module',
						'nodenext',
						'--moduleResolution',
						'nodenext',
						'--strict',
						'--esModuleInterop',
						'--skipLibCheck',
						...files,
					],
					{
						cwd: livinitydRoot,
						stdio: 'pipe',
						shell: process.platform === 'win32', // .cmd shim needs shell on Windows
					},
				)
			} catch (e) {
				const err = e as {stdout?: Buffer; stderr?: Buffer; status?: number}
				const out = err.stdout?.toString() ?? ''
				const errOut = err.stderr?.toString() ?? ''
				throw new Error(
					`tsc exited ${err.status ?? '?'}.\n--- STDOUT ---\n${out}\n--- STDERR ---\n${errOut}`,
				)
			}
		},
		120_000,
	)
})
