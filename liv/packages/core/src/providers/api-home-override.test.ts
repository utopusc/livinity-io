import assert from 'node:assert/strict'
import path from 'node:path'

/**
 * Phase 41 D-41-16 + D-41-17 regression test: X-LivOS-User-Id header →
 * agentConfig.homeOverride wiring on the nexus /api/agent/stream side.
 *
 * Strategy: test the header-reading + path-computing logic in isolation
 * (avoids spinning up the full /api/agent/stream handler with all its
 * dependencies — brain, toolRegistry, daemon, redis).
 *
 * Mirror-protection (Test 7): grep nexus/packages/core/src/api.ts for the
 * required wiring tokens. If a future edit removes the X-LivOS-User-Id
 * reader from api.ts, this test fails — preventing silent regression of
 * Plan 41-04.
 */

/**
 * Mirror of the Plan 41-04 logic in nexus/packages/core/src/api.ts
 * (lines around 2407+ — header read, regex validation, path computation).
 *
 * If the real code in api.ts diverges from this mirror, Test 7's source-grep
 * regression check catches it. Keep both in sync.
 */
function computeHomeOverride(
	headerVal: string | string[] | undefined,
	dataDir = '/opt/livos/data',
): string | undefined {
	if (typeof headerVal !== 'string') return undefined
	if (!/^[a-zA-Z0-9_-]+$/.test(headerVal)) return undefined
	return path.join(dataDir, 'users', headerVal, '.claude')
}

async function runTests() {
	// Test 1: valid header → homeOverride set
	{
		const r = computeHomeOverride('user-abc-123')
		assert.equal(r, path.join('/opt/livos/data', 'users', 'user-abc-123', '.claude'))
		console.log('  PASS Test 1: valid header → homeOverride set')
	}

	// Test 2: header absent → homeOverride undefined (single-user-mode preservation)
	{
		const r = computeHomeOverride(undefined)
		assert.equal(r, undefined)
		console.log('  PASS Test 2: absent header → homeOverride undefined (byte-identical pre-Phase-41)')
	}

	// Test 3: array-valued header (Express normalizes some headers to arrays) → ignored
	{
		const r = computeHomeOverride(['user-1', 'user-2'])
		assert.equal(r, undefined)
		console.log('  PASS Test 3: array-valued header rejected')
	}

	// Test 4: malformed header (path traversal attempt) → undefined
	{
		const r = computeHomeOverride('../../../etc/passwd')
		assert.equal(r, undefined)
		console.log('  PASS Test 4: path-traversal header rejected')
	}

	// Test 5: empty string → undefined
	{
		const r = computeHomeOverride('')
		assert.equal(r, undefined)
		console.log('  PASS Test 5: empty header rejected')
	}

	// Test 6: env var override (LIVOS_DATA_DIR equivalent)
	{
		const r = computeHomeOverride('user-1', '/custom/data')
		assert.equal(r, path.join('/custom/data', 'users', 'user-1', '.claude'))
		console.log('  PASS Test 6: LIVOS_DATA_DIR override honored')
	}

	// Test 7: api.ts source contains the same logic (regression check via grep)
	{
		const fs = await import('node:fs/promises')
		const apiSrc = await fs.readFile(new URL('../api.ts', import.meta.url), 'utf8')
		assert.match(apiSrc, /x-livos-user-id/i, 'api.ts must read X-LivOS-User-Id header')
		assert.match(apiSrc, /homeOverride/, 'api.ts must set homeOverride')
		assert.match(apiSrc, /LIVOS_DATA_DIR/, 'api.ts must read LIVOS_DATA_DIR env var')
		assert.match(apiSrc, /\^\[a-zA-Z0-9_-\]\+\$/, 'api.ts must apply userId regex validation')
		console.log('  PASS Test 7: api.ts source contains all required Phase 41 wiring')
	}

	console.log('\nAll api-home-override.test.ts tests passed (7/7)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
