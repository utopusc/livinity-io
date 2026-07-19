/**
 * Phase 346-01 (MCP-01, D-346-2) — BROKER-ZERO-IMPORT guard (SACRED).
 *
 * This test is the CI-provable enforcement of the never-break rule:
 *   "broker: zero imports, zero reach, zero reference"
 * (feedback_subscription_only, sacred). It statically scans EVERY `.ts` file
 * under source/modules/mcp-control/ and asserts that NONE of them IMPORTS (ES
 * import / export-from / dynamic import / require) any module whose specifier
 * references one of the four broker subsystems or the broker api-keys table:
 *
 *   - apps/inject-ai-provider.ts   (injectAiProviderConfig, BROKER_HOST)
 *   - apps/cred-egress-proxy.ts    (CREDPROXY_HOST, OAuth-token MITM)
 *   - apps/metered-key.ts          (chooseCredentialPath, lvb_* virtual keys)
 *   - plugins/livinity-broker/*    (the broker proxy, liv_sk_ bearer gate)
 *   - api-keys/*                   (the liv_sk_ broker table — mcp-control has
 *                                   its OWN mcp_control_keys table)
 *
 * Mirrors the usage-tracking/* "ZERO imports from livinity-broker/*" discipline
 * (capture-middleware.ts:2-4). It MUST stay green for ALL remaining 346 plans:
 * the MCP control-plane never reaches, extends, or references the subscription
 * broker path — the physical separation is the whole point of D-346-2/4.
 *
 * WHY import-specifiers, not raw substring: the boundary is DOCUMENTED in this
 * tree (keys-database.ts's doc comment names the forbidden subsystems, and this
 * test lists them as data). A raw source-text substring scan would false-positive
 * on that legitimate documentation. The real, load-bearing invariant is the
 * absence of a code DEPENDENCY — i.e. an actual import/require — so the guard
 * inspects module specifiers only. A deliberate `import '../apps/metered-key.js'`
 * anywhere in the tree fails this test immediately.
 */

import {readdirSync, readFileSync} from 'node:fs'
import nodePath from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

const SELF = nodePath.resolve(fileURLToPath(import.meta.url))
const HERE = nodePath.dirname(SELF)
const MCP_CONTROL_ROOT = nodePath.resolve(HERE, '..') // source/modules/mcp-control

// Forbidden tokens: if any import/require specifier CONTAINS one of these, the
// mcp-control tree has reached into the broker/subscription path. 'api-keys'
// covers both '../api-keys' and 'api-keys/...' specifier shapes.
const FORBIDDEN_IN_SPECIFIER = [
	'inject-ai-provider',
	'cred-egress-proxy',
	'metered-key',
	'livinity-broker',
	'api-keys',
] as const

// Every way a module specifier can enter a .ts file. Capture group 1 = specifier.
const SPECIFIER_PATTERNS = [
	/\bfrom\s+['"]([^'"]+)['"]/g, // import ... from '...' / export ... from '...'
	/\bimport\s+['"]([^'"]+)['"]/g, // bare import '...'
	/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('...')
	/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('...')
]

function walkTsFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, {withFileTypes: true})) {
		const full = nodePath.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...walkTsFiles(full))
		else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
	}
	return out
}

function importSpecifiersOf(source: string): string[] {
	const specs: string[] = []
	for (const re of SPECIFIER_PATTERNS) {
		re.lastIndex = 0
		let m: RegExpExecArray | null
		while ((m = re.exec(source)) !== null) specs.push(m[1])
	}
	return specs
}

describe('mcp-control broker-zero-import guard (346-01 D-346-2, SACRED)', () => {
	// Scan every .ts EXCEPT this guard file itself — it necessarily documents the
	// forbidden subsystem names (and an illustrative import string) as its own
	// data, which is not a real code dependency. Production/other files remain
	// fully scanned.
	const tsFiles = walkTsFiles(MCP_CONTROL_ROOT).filter((f) => nodePath.resolve(f) !== SELF)

	test('the mcp-control tree contains .ts files to scan (guard is not vacuous)', () => {
		// Defends against a rename/move that would make the scan silently empty.
		expect(tsFiles.length).toBeGreaterThan(0)
	})

	test('NO .ts file under mcp-control/ imports any broker subsystem or api-keys', () => {
		const violations: string[] = []
		for (const file of tsFiles) {
			const src = readFileSync(file, 'utf8')
			for (const spec of importSpecifiersOf(src)) {
				for (const token of FORBIDDEN_IN_SPECIFIER) {
					if (spec.includes(token)) {
						violations.push(
							`${nodePath.relative(MCP_CONTROL_ROOT, file)} imports "${spec}" (matched forbidden token "${token}")`,
						)
					}
				}
			}
		}
		// Clear, file+token-naming failure message per D-346-2.
		expect(violations, `broker/api-keys import(s) found in mcp-control:\n${violations.join('\n')}`).toEqual([])
	})
})
