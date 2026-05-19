/**
 * Phase 102-06 Task 3 — mcp/server.ts env-read precedence unit tests.
 *
 * Covers the exported `resolveDisplay()` helper (extracted in 102-06 from
 * the inline env-read block in `main()` so the precedence can be unit-tested
 * without booting a stdio MCP server).
 *
 * Precedence under test:
 *   1. LUSE_TARGET_DISPLAY (canonical Phase 102 env — must satisfy
 *      /^:[1-9][0-9]?$/ or it's dropped with a stderr warning).
 *   2. LUSE_DISPLAY (legacy alias from Phase 100-10-03).
 *   3. DISPLAY (system default).
 *   4. undefined when none set.
 *
 * Threat T-102-06 (display env injection): the regex validation step is
 * the pure-function gatekeeper — malformed `LUSE_TARGET_DISPLAY` values
 * (shell-meta, path-traversal, over-99) MUST fall through to the legacy
 * fallback chain rather than be propagated as `defaultDisplay`.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, it, expect, vi} from 'vitest'
import {resolveDisplay} from './server.js'

// Phase 161-03 — source-text invariants for resolver-wiring + baseEnv extension.
// Read the on-disk source once per test-run; assertions match grep-like patterns
// against the captured strings.
const __filename_161 = fileURLToPath(import.meta.url)
const __dirname_161 = dirname(__filename_161)
const SERVER_SRC = readFileSync(join(__dirname_161, 'server.ts'), 'utf8')
const CONFIG_SRC = readFileSync(
	join(__dirname_161, '..', 'luse-mcp-config.ts'),
	'utf8',
)

describe('resolveDisplay — Phase 102-06 env precedence', () => {
	it('Test 1: LUSE_TARGET_DISPLAY=:10 set → effective display is :10', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: ':10'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':10')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 2: only LUSE_DISPLAY=:11 set → effective display is :11', () => {
		const env: NodeJS.ProcessEnv = {LUSE_DISPLAY: ':11'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':11')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 3: only DISPLAY=:12 set → effective display is :12', () => {
		const env: NodeJS.ProcessEnv = {DISPLAY: ':12'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':12')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 4: LUSE_TARGET_DISPLAY=invalid → ignored, falls through to LUSE_DISPLAY (T-102-06 fail-open)', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: 'invalid; rm -rf /',
			LUSE_DISPLAY: ':5',
		}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':5')
		expect(writeWarn).toHaveBeenCalledOnce()
		expect(writeWarn.mock.calls[0][0]).toMatch(/LUSE_TARGET_DISPLAY/)
		expect(writeWarn.mock.calls[0][0]).toMatch(/does not match/)
	})

	it('Test 4b: LUSE_TARGET_DISPLAY=:100 (over 99) → ignored, falls through (T-102-06 bounds)', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: ':100',
			DISPLAY: ':0',
		}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':0')
		expect(writeWarn).toHaveBeenCalledOnce()
	})

	it('Test 4c: LUSE_TARGET_DISPLAY=10 (no colon prefix) → ignored, falls through (T-102-06 shape)', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: '10'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBeUndefined()
		expect(writeWarn).toHaveBeenCalledOnce()
	})

	it('Test 5: LUSE_TARGET_DISPLAY precedence wins over LUSE_DISPLAY and DISPLAY', () => {
		const env: NodeJS.ProcessEnv = {
			LUSE_TARGET_DISPLAY: ':10',
			LUSE_DISPLAY: ':99',
			DISPLAY: ':0',
		}
		const result = resolveDisplay({env})
		expect(result).toBe(':10')
	})

	it('Test 6: LUSE_DISPLAY precedence wins over DISPLAY when LUSE_TARGET_DISPLAY is unset', () => {
		const env: NodeJS.ProcessEnv = {LUSE_DISPLAY: ':11', DISPLAY: ':0'}
		const result = resolveDisplay({env})
		expect(result).toBe(':11')
	})

	it('Test 7: no env vars set → returns undefined', () => {
		const env: NodeJS.ProcessEnv = {}
		const result = resolveDisplay({env})
		expect(result).toBeUndefined()
	})

	it('Test 8: empty-string LUSE_TARGET_DISPLAY ignored (no warning, falls through silently)', () => {
		const env: NodeJS.ProcessEnv = {LUSE_TARGET_DISPLAY: '', LUSE_DISPLAY: ':5'}
		const writeWarn = vi.fn()
		const result = resolveDisplay({env, writeWarn})
		expect(result).toBe(':5')
		expect(writeWarn).not.toHaveBeenCalled()
	})

	it('Test 9: valid :1 (low edge) and :99 (high edge) both accepted', () => {
		expect(resolveDisplay({env: {LUSE_TARGET_DISPLAY: ':1'}})).toBe(':1')
		expect(resolveDisplay({env: {LUSE_TARGET_DISPLAY: ':99'}})).toBe(':99')
	})
})

describe('Phase 161-03 — livosAppResolver env-threaded construction', () => {
	it('imports defaultLivosAppResolver from ../native/window.js', () => {
		expect(SERVER_SRC).toMatch(
			/import\s*\{[^}]*defaultLivosAppResolver[^}]*\}\s+from\s+['"]\.\.\/native\/window\.js['"]/,
		)
	})

	it('reads LIVINITYD_API_URL env var (NEW name — NOT LIV_API_URL per Landmine #5)', () => {
		expect(SERVER_SRC).toMatch(/process\.env\.LIVINITYD_API_URL/)
	})

	it('reads LIV_API_KEY env var', () => {
		expect(SERVER_SRC).toMatch(/process\.env\.LIV_API_KEY/)
	})

	it('reads LUSE_USER_SLUG env var', () => {
		expect(SERVER_SRC).toMatch(/process\.env\.LUSE_USER_SLUG/)
	})

	it('reads LUSE_DOMAIN_ROOT env var', () => {
		expect(SERVER_SRC).toMatch(/process\.env\.LUSE_DOMAIN_ROOT/)
	})

	it('uses AbortSignal.timeout(5000) per ws-agent.ts:163 idiom', () => {
		expect(SERVER_SRC).toMatch(/AbortSignal\.timeout\(5000\)/)
	})

	it('constructs URL via /trpc/${proc}?input= shape (tRPC v11 empty-input GET)', () => {
		expect(SERVER_SRC).toMatch(/\/trpc\/\$\{proc\}\?input=/)
	})

	it('uses distinct stderr prefix [luse-mcp] resolver: (no collision with open_livos_app IPC)', () => {
		expect(SERVER_SRC).toMatch(/\[luse-mcp\]\s+resolver:/)
		// Defensive — ensure the NEW resolver block does NOT emit the IPC prefix
		// that parent livinityd consumes for windowManager.openWindow dispatch
		// (Landmine #3 / D-161-D stderr-IPC discipline).
		const phase161Block =
			SERVER_SRC.match(/Phase 161-03[\s\S]*?registerLuseTools/)?.[0] ?? ''
		expect(phase161Block).not.toMatch(/^\s*\[luse-mcp\]\s+open_livos_app/m)
		// Also assert the literal write pattern: no `stderr.write('[luse-mcp] open_livos_app` calls in the new block
		expect(phase161Block).not.toMatch(
			/stderr\.write\(['`"]\[luse-mcp\]\s+open_livos_app/,
		)
	})

	it('passes livosAppResolver into registerLuseTools options', () => {
		// The registerLuseTools(... { ..., livosAppResolver }) call must include the new field
		expect(SERVER_SRC).toMatch(/registerLuseTools\([\s\S]*livosAppResolver[\s\S]*\)/)
	})

	it('Phase 161-03 marker comment preserved', () => {
		expect(SERVER_SRC).toMatch(/Phase 161-03/)
	})
})

describe('Phase 161-03 — luse-mcp-config baseEnv extension', () => {
	it('descriptor branch threads LIVINITYD_API_URL', () => {
		expect(CONFIG_SRC).toMatch(
			/LIVINITYD_API_URL:\s*env\.LIVINITYD_API_URL\s*\?\?\s*['"]http:\/\/localhost:8080['"]/,
		)
	})

	it('descriptor branch threads LIV_API_KEY', () => {
		expect(CONFIG_SRC).toMatch(/LIV_API_KEY:\s*env\.LIV_API_KEY\s*\?\?\s*['"]['"]?/)
	})

	it('descriptor branch threads LUSE_USER_SLUG with admin default', () => {
		expect(CONFIG_SRC).toMatch(
			/LUSE_USER_SLUG:\s*descriptor\.userSlug\s*\?\?\s*['"]admin['"]/,
		)
	})

	it('descriptor branch threads LUSE_DOMAIN_ROOT with livinity.io default', () => {
		expect(CONFIG_SRC).toMatch(
			/LUSE_DOMAIN_ROOT:\s*descriptor\.domainRoot\s*\?\?\s*['"]livinity\.io['"]/,
		)
	})

	it('host-display branch uses spread-conditional for LIVINITYD_API_URL', () => {
		expect(CONFIG_SRC).toMatch(
			/\.\.\.\(env\.LIVINITYD_API_URL\s*\?\s*\{LIVINITYD_API_URL:\s*env\.LIVINITYD_API_URL\}\s*:\s*\{\}\)/,
		)
	})

	it('preserves pre-existing LIVOS_USER_SLUG line (Phase 160-02 overlay env)', () => {
		expect(CONFIG_SRC).toMatch(
			/LIVOS_USER_SLUG:\s*descriptor\.userSlug\s*\?\?\s*['"]admin['"]/,
		)
	})

	it('contains Phase 161-03 marker comment', () => {
		expect(CONFIG_SRC).toMatch(/Phase 161-03/)
	})
})
