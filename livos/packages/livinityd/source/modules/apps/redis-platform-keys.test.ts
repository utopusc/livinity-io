/**
 * Phase 210 Bug C regression test — REDIS_PLATFORM_URL declaration.
 *
 * Before this fix, `reportInstallEvent` referenced `REDIS_PLATFORM_URL` as a
 * top-level constant that was never declared. tsx hides the bug as a runtime
 * `ReferenceError` swallowed by the surrounding try/catch, silently dropping
 * every install/uninstall platform event.
 *
 * This test loads the apps module and asserts BOTH Redis key constants are
 * declared and have the expected string values. It does not exercise
 * reportInstallEvent itself (that needs the full livinityd harness), but it
 * makes the constant-declaration regression visible.
 */

import assert from 'node:assert/strict'
import {describe, test} from 'vitest'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

describe('Phase 210 — apps.ts static-grep regressions', () => {

test('Phase 210 Bug C: REDIS_PLATFORM_URL and REDIS_PLATFORM_API_KEY are both declared in apps.ts', async () => {
	const appsSource = await readFile(join(here, 'apps.ts'), 'utf8')
	assert.match(
		appsSource,
		/const\s+REDIS_PLATFORM_API_KEY\s*=\s*['"]livos:platform:api_key['"]/,
		'REDIS_PLATFORM_API_KEY constant must be declared as livos:platform:api_key',
	)
	assert.match(
		appsSource,
		/const\s+REDIS_PLATFORM_URL\s*=\s*['"]livos:platform:url['"]/,
		'REDIS_PLATFORM_URL constant must be declared as livos:platform:url (Phase 210 Bug C fix)',
	)
})

test('Phase 210 Bug B: install() logs an error when provisionAppSubdomain returns null', async () => {
	const appsSource = await readFile(join(here, 'apps.ts'), 'utf8')
	// The fix introduces an `if (!provisioned)` block that calls this.logger.error
	// with a Phase 210 marker. Asserts the explicit warning surface is wired
	// (previously the null return path was completely silent, so the dot-format
	// Caddy fallback shipped without a single log line indicating something went wrong).
	// The window between `if (!provisioned)` and the Phase 210 marker spans
	// a multi-line comment block — be generous with the lookahead. Also accept
	// either `logger.error` or `logger.warn` for futureproofing.
	const ifBlock = appsSource.match(/if\s*\(\s*!provisioned\s*\)\s*\{[\s\S]{0,2000}?\}/)
	assert.ok(
		ifBlock,
		'install() must contain `if (!provisioned) { ... }` block (Phase 210 Bug B fix)',
	)
	assert.match(
		ifBlock[0],
		/logger\.(error|warn)/,
		'the !provisioned block must call this.logger.error or .warn',
	)
	assert.match(
		ifBlock[0],
		/Phase 210/,
		'the !provisioned log message must include the Phase 210 marker for grep-ability',
	)
})

})
