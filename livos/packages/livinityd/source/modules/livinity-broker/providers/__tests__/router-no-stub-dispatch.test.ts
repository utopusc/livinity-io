/**
 * Phase 61 Plan 02 Wave 0 — Grep-guard: no router/handler source dispatches
 * to stub providers.
 *
 * Threat T-61-05 (Tampering): a future commit accidentally wires
 * `getProvider('openai' | 'gemini' | 'mistral')` into router.ts /
 * openai-router.ts / passthrough-handler.ts. v30 has NO concrete OpenAI/
 * Gemini/Mistral provider — invoking them surfaces a 500 to the client.
 * This test scans the three router/handler source files at CI time and
 * fails the build if any match the dispatch pattern.
 *
 * Sanity floor: also asserts passthrough-handler.ts DOES contain
 * `getProvider('anthropic')` — if the file got rewritten to drop the
 * provider abstraction entirely, this test catches that regression too.
 *
 * Implementation notes:
 *   - File reads use sync `readFileSync` (test runs once per file; no I/O
 *     async needed).
 *   - The dispatch pattern regex tolerates whitespace inside the call —
 *     `getProvider(  'openai'  )` and `getProvider("openai")` both match.
 *   - Files NOT matched: `interface.ts` (which mentions the names in a
 *     comment about future routing), `registry.ts` (which constructs
 *     stubs but does NOT call getProvider with their names — that would
 *     be self-recursive), and any test file (which legitimately import
 *     stubs to assert they throw).
 */
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// __tests__/.. = providers, /.. = livinity-broker
const brokerDir = resolve(__dirname, '..', '..')

const FILES = ['router.ts', 'openai-router.ts', 'passthrough-handler.ts'] as const

const STUB_DISPATCH_REGEX = /getProvider\(\s*['"](openai|gemini|mistral)['"]/

describe('Phase 61 Plan 02 — router-no-stub-dispatch grep-guard (T-61-05 mitigation)', () => {
	for (const f of FILES) {
		it(`${f} does NOT dispatch to any stub provider via getProvider('openai|gemini|mistral')`, () => {
			const src = readFileSync(resolve(brokerDir, f), 'utf8')
			expect(src).not.toMatch(STUB_DISPATCH_REGEX)
		})
	}

	it('passthrough-handler.ts DOES dispatch to anthropic (sanity floor — provider abstraction still wired)', () => {
		const src = readFileSync(resolve(brokerDir, 'passthrough-handler.ts'), 'utf8')
		expect(src).toMatch(/getProvider\(\s*['"]anthropic['"]/)
	})
})
