// livos/packages/livinityd/source/modules/domain/caddy.test.ts
// Phase 104 plan 104-03 — generateLocalCaddyfile + cloud-mode regression.
import {describe, it, expect} from 'vitest'
import {
	generateLocalCaddyfile,
	generateFullCaddyfile,
	validateLocalTld,
} from './caddy.js'

describe('validateLocalTld (Phase 104 V5 input validation)', () => {
	it('accepts valid TLDs', () => {
		expect(validateLocalTld('livinity.local')).toBe(true)
		expect(validateLocalTld('home.bruceoz.com')).toBe(true)
		expect(validateLocalTld('a.b')).toBe(true)
	})
	it('rejects path traversal', () => {
		expect(validateLocalTld('../etc')).toBe(false)
		expect(validateLocalTld('a/b')).toBe(false)
		expect(validateLocalTld('foo..bar')).toBe(false)
	})
	it('rejects IPv4-shaped strings', () => {
		expect(validateLocalTld('192.168.1.1')).toBe(false)
		expect(validateLocalTld('10.0.0.1')).toBe(false)
	})
	it('rejects whitespace and special chars', () => {
		expect(validateLocalTld('foo bar')).toBe(false)
		expect(validateLocalTld('foo;bar')).toBe(false)
		expect(validateLocalTld('foo$bar')).toBe(false)
	})
	it('rejects empty / too long', () => {
		expect(validateLocalTld('')).toBe(false)
		expect(validateLocalTld('a'.repeat(254))).toBe(false)
	})
})

describe('generateLocalCaddyfile (Phase 104)', () => {
	it('emits import /etc/caddy/pki-global.conf as the first non-blank line (AC-104-8)', () => {
		const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
		const firstNonBlank = out.split('\n').find((l) => l.trim().length > 0)
		expect(firstNonBlank).toMatch(/^import \/etc\/caddy\/pki-global\.conf$/)
	})

	it('contains the wildcard *.bruce.livinity.local block with ca liv-local', () => {
		const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
		expect(out).toContain('*.bruce.livinity.local {')
		expect(out).toMatch(/issuer internal\s*\{\s*ca liv-local/)
	})

	it('contains the bare-domain block', () => {
		const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
		// Bare domain followed by " {" must appear
		expect(out).toMatch(/(^|\n)bruce\.livinity\.local \{/)
	})

	it('contains HTTP-only CA cert download block by name AND IP', () => {
		const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
		expect(out).toContain('http://bruce.livinity.local, http://192.168.1.100')
		expect(out).toContain('handle /api/local/ca.crt')
		expect(out).toContain('/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local')
	})

	it('appends multi-user subdomains with the named CA', () => {
		const out = generateLocalCaddyfile(
			'bruce.livinity.local',
			'192.168.1.100',
			[{name: 'app1', port: 8081}],
			true,
		)
		expect(out).toContain('app1.bruce.livinity.local {')
		expect(out).toContain('reverse_proxy 127.0.0.1:8081')
	})
})

describe('generateFullCaddyfile — cloud-mode regression (D-104-NO-PROD-IMPACT)', () => {
	it('does NOT emit any pki or import directive in cloud mode (AC-104-3 unit-level)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).not.toContain('import /etc/caddy/pki-global.conf')
		expect(out).not.toContain('pki {')
		expect(out).not.toContain('ca liv-local')
		expect(out).not.toContain('issuer internal')
	})

	it('cloud-mode multiUser also has no pki directives', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			true,
			false,
			[],
		)
		expect(out).not.toContain('import /etc/caddy/pki-global.conf')
		expect(out).not.toContain('ca liv-local')
	})
})
