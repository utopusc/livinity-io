/**
 * Phase 263-01 (LIVOS-064, Critical) — chrome route security helpers.
 *
 * Closes an unauthenticated command-injection RCE on the daemon's
 * `/api/chrome/{launch,kill,status}` routes:
 *   1. Routes were unauthenticated on :8080 (any caller past Caddy/loopback
 *      could hit them).
 *   2. `request.body.url` flowed RAW into `$({shell:true})` — execa shell mode
 *      does NOT escape interpolations, so a url of `$(id>/tmp/pwn)` executed a
 *      shell command on the tenant's PC.
 *
 * The inline express handlers are not independently importable, so the two
 * security-critical decisions are extracted here as PURE functions that can be
 * RED→GREEN unit-tested in isolation:
 *   - chromeSessionGate(cookies, verify) — the 401 gate (Task 1)
 *   - buildCdpNewTabUrl(url)             — URL-encoded CDP open, no shell (Task 2)
 *   - buildChromeLaunchArgv(user, url)   — argv array for spawn, no shell (Task 2)
 *
 * LIVE end-to-end auth-gate + RCE-closure verification (unauth curl → 401,
 * `$(id>/tmp/pwn)` → no /tmp/pwn) is MANDATORY and lives in plan 263-06 against
 * the running Mini PC daemon — string-level tests cannot catch a fail-open gate
 * (the LIVOS-041 lesson). These unit tests lock the helper contracts.
 */

import {describe, it, expect} from 'vitest'

import {
	chromeSessionGate,
	buildCdpNewTabUrl,
	buildChromeLaunchArgv,
} from './chrome-launch.js'

describe('chromeSessionGate (LIVOS-064 Task 1)', () => {
	const verifyOk = async () => ({loggedIn: true})
	const verifyReject = async () => null
	const verifyThrow = async () => {
		throw new Error('verifier exploded')
	}

	it('Test 1: NO LIVINITY_SESSION cookie -> 401 {error:unauthorized}', async () => {
		const gate = await chromeSessionGate(undefined, verifyOk)
		expect(gate.ok).toBe(false)
		if (gate.ok) throw new Error('expected gate to fail')
		expect(gate.status).toBe(401)
		expect(gate.body).toEqual({error: 'unauthorized'})
	})

	it('Test 1b: empty cookies object (no LIVINITY_SESSION) -> 401', async () => {
		const gate = await chromeSessionGate({}, verifyOk)
		expect(gate.ok).toBe(false)
		if (gate.ok) throw new Error('expected gate to fail')
		expect(gate.status).toBe(401)
	})

	it('Test 2: cookie present but verifier rejects (null) -> 401', async () => {
		const gate = await chromeSessionGate({LIVINITY_SESSION: 'tok'}, verifyReject)
		expect(gate.ok).toBe(false)
		if (gate.ok) throw new Error('expected gate to fail')
		expect(gate.status).toBe(401)
		expect(gate.body).toEqual({error: 'unauthorized'})
	})

	it('Test 3: verifier THROWS -> 401 fail-closed (never proceeds)', async () => {
		const gate = await chromeSessionGate({LIVINITY_SESSION: 'tok'}, verifyThrow)
		expect(gate.ok).toBe(false)
		if (gate.ok) throw new Error('expected gate to fail')
		expect(gate.status).toBe(401)
	})

	it('Test 4: valid session cookie -> proceeds (ok:true, session carried)', async () => {
		const gate = await chromeSessionGate({LIVINITY_SESSION: 'tok'}, verifyOk)
		expect(gate.ok).toBe(true)
		if (gate.ok) {
			expect(gate.session).toEqual({loggedIn: true})
		}
	})
})

describe('buildCdpNewTabUrl (LIVOS-064 Task 2, SINK 1)', () => {
	it('a malicious url is URL-encoded — no raw shell metacharacters survive', () => {
		const out = buildCdpNewTabUrl('$(id>/tmp/pwn)')
		// The dollar/paren/redirect/space all become %-escapes; the literal
		// `$(id>/tmp/pwn)` substring can never appear unencoded.
		expect(out).toBe('http://127.0.0.1:9222/json/new?' + encodeURIComponent('$(id>/tmp/pwn)'))
		expect(out).not.toContain('$(')
		expect(out).not.toContain('>')
		expect(out).not.toContain(' ')
	})

	it('a normal url is preserved (as an encoded query) and still targets CDP', () => {
		const out = buildCdpNewTabUrl('https://example.com/')
		expect(out.startsWith('http://127.0.0.1:9222/json/new?')).toBe(true)
		// Round-trips back to the original url.
		const q = out.split('?')[1]
		expect(decodeURIComponent(q)).toBe('https://example.com/')
	})
})

describe('buildChromeLaunchArgv (LIVOS-064 Task 2, SINK 2)', () => {
	it('a malicious url is ONE argv element — never split into shell tokens', () => {
		const argv = buildChromeLaunchArgv('bruce', '$(id>/tmp/pwn)')
		// argv is exactly: -u bruce nohup <launcher> "$(id>/tmp/pwn)"
		expect(argv).toEqual([
			'-u',
			'bruce',
			'nohup',
			'/usr/local/bin/livos-launch-chrome',
			'$(id>/tmp/pwn)',
		])
		// The url occupies a single slot; no element is the shell operator.
		expect(argv.filter((a) => a === '$(id>/tmp/pwn)').length).toBe(1)
	})

	it('a normal url is passed through as a single trailing argv element', () => {
		const argv = buildChromeLaunchArgv('bruce', 'https://example.com')
		expect(argv).toEqual([
			'-u',
			'bruce',
			'nohup',
			'/usr/local/bin/livos-launch-chrome',
			'https://example.com',
		])
	})

	it('an empty url omits the trailing arg entirely (launcher gets no url token)', () => {
		const argv = buildChromeLaunchArgv('bruce', '')
		expect(argv).toEqual([
			'-u',
			'bruce',
			'nohup',
			'/usr/local/bin/livos-launch-chrome',
		])
	})
})
