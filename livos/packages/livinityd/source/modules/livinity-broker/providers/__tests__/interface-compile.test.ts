/**
 * Phase 61 Plan 01 Wave 0 — typecheck smoke test for providers/ directory.
 *
 * Asserts that `npx tsc --noEmit` over the livinityd package succeeds. This
 * indirectly proves:
 *   - providers/interface.ts type definitions compile (FR-BROKER-D2-01).
 *   - providers/anthropic.ts implements BrokerProvider with no `implements`
 *     constraint violations.
 *   - providers/registry.ts wires the AnthropicProvider into a typed Map
 *     without contract drift.
 *
 * RED until Plan 01 Task 2 (interface + anthropic + registry land).
 *
 * Test seam: shells out to `npx tsc --noEmit` from the livinityd package
 * root. We compile the entire package — strictly stricter than just
 * providers/ — because tsc's `--project` resolution does not accept a
 * subdirectory; either it walks the whole package via the package's
 * tsconfig.json (which extends @tsconfig/node22) or compiles a single file.
 * Whole-package check is the right gate: it catches any cross-file type
 * regression a provider edit might cause.
 */
import {execFileSync} from 'node:child_process'
import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// __dirname = .../livinityd/source/modules/livinity-broker/providers/__tests__
// livinityd root is 6 levels up.
const livinitydRoot = resolve(__dirname, '..', '..', '..', '..', '..', '..')

describe('Phase 61 Plan 01 Wave 0 — providers/ interface compile gate (FR-BROKER-D2-01)', () => {
	it(
		'tsc --noEmit on livinityd succeeds (providers/{interface,anthropic,registry}.ts typecheck cleanly)',
		() => {
			// execFileSync throws on non-zero exit; vitest reports stdout/stderr in the failure.
			execFileSync('npx', ['tsc', '--noEmit'], {
				cwd: livinitydRoot,
				stdio: 'pipe',
				shell: process.platform === 'win32', // npx is a .cmd on Windows
			})
		},
		180_000, // typecheck of the full livinityd package can take 30-60s; cushion for CI.
	)
})
