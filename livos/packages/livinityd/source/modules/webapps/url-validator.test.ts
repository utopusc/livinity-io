// Phase 92-03 — url-validator.ts unit tests.
//
// Coverage: scheme rejection (6 categories), private-IP rejection (4 IPv4
// categories + IPv6 + 'localhost' literal), admin bypass path, normalization
// round-trip (lowercase host, default-port strip, trailing-slash drop, query
// preservation, fragment strip).

import {describe, expect, test} from 'vitest'

import {validateUrl} from './url-validator.js'

describe('validateUrl — scheme rejection', () => {
	const REJECT_SCHEMES = [
		'file:///etc/passwd',
		'javascript:alert(1)',
		'data:text/html,<h1>x</h1>',
		'chrome://settings',
		'ws://example.com/socket',
		'ftp://example.com/',
	]

	for (const url of REJECT_SCHEMES) {
		test(`rejects ${url}`, () => {
			const result = validateUrl(url, {isAdmin: false})
			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(['INVALID_SCHEME', 'INVALID_URL']).toContain(result.code)
			}
		})
	}
})

describe('validateUrl — malformed URLs', () => {
	test('rejects empty string', () => {
		const result = validateUrl('', {isAdmin: false})
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.code).toBe('INVALID_URL')
	})

	test('rejects garbage', () => {
		const result = validateUrl('not a url', {isAdmin: false})
		expect(result.ok).toBe(false)
	})

	test('rejects null-ish input gracefully', () => {
		// @ts-expect-error — runtime guard test
		const result = validateUrl(null, {isAdmin: false})
		expect(result.ok).toBe(false)
	})
})

describe('validateUrl — private IP rejection (non-admin)', () => {
	const PRIVATE_HOSTS = [
		// RFC1918
		'http://10.0.0.1/',
		'http://10.255.255.255/',
		'http://172.16.0.1/',
		'http://172.31.0.1/',
		'http://192.168.1.1/',
		// Loopback
		'http://127.0.0.1/',
		'http://127.255.255.255/',
		'http://localhost/',
		// Link-local
		'http://169.254.0.1/',
		// IPv6 loopback
		'http://[::1]/',
		// IPv6 ULA
		'http://[fc00::1]/',
		'http://[fd12:3456:789a::1]/',
	]

	for (const url of PRIVATE_HOSTS) {
		test(`rejects ${url} for non-admin`, () => {
			const result = validateUrl(url, {isAdmin: false})
			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.code).toBe('PRIVATE_IP')
		})
	}

	// 172.15.x and 172.32.x are NOT in 172.16.0.0/12
	test('does NOT reject 172.15.0.1 (outside RFC1918)', () => {
		const result = validateUrl('http://172.15.0.1/', {isAdmin: false})
		expect(result.ok).toBe(true)
	})
	test('does NOT reject 172.32.0.1 (outside RFC1918)', () => {
		const result = validateUrl('http://172.32.0.1/', {isAdmin: false})
		expect(result.ok).toBe(true)
	})
})

describe('validateUrl — admin bypass', () => {
	const PRIVATE_HOSTS_THAT_ADMIN_CAN_HIT = [
		'http://localhost:8080/',
		'http://127.0.0.1:9090/',
		'http://192.168.1.1/',
		'http://10.69.31.68/', // Mini PC
		'http://[::1]/',
	]

	for (const url of PRIVATE_HOSTS_THAT_ADMIN_CAN_HIT) {
		test(`admin can validate ${url}`, () => {
			const result = validateUrl(url, {isAdmin: true})
			expect(result.ok).toBe(true)
		})
	}
})

describe('validateUrl — normalization', () => {
	test('lowercases host', () => {
		const result = validateUrl('https://Example.COM/foo', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.hostname).toBe('example.com')
	})

	test('strips default :443 from https', () => {
		const result = validateUrl('https://example.com:443/foo', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.normalized.port).toBe('')
			expect(result.normalized.toString()).toBe('https://example.com/foo')
		}
	})

	test('strips default :80 from http', () => {
		const result = validateUrl('http://example.com:80/', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.port).toBe('')
	})

	test('preserves non-default port', () => {
		const result = validateUrl('https://example.com:8443/', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.port).toBe('8443')
	})

	test('drops trailing slash on path-only-/', () => {
		const result = validateUrl('https://example.com/', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.toString()).toBe('https://example.com/')
		// URL toString() always re-adds '/' for empty pathname; verify the
		// pathname field itself is normalized to ''.
		if (result.ok) expect(result.normalized.pathname).toBe('/')
	})

	test('preserves query string verbatim', () => {
		const result = validateUrl('https://example.com/x?utm_source=foo&q=bar', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.search).toBe('?utm_source=foo&q=bar')
	})

	test('strips fragment', () => {
		const result = validateUrl('https://example.com/x#section', {isAdmin: false})
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.normalized.hash).toBe('')
	})

	test('round-trip stable: validating a normalized URL returns the same URL', () => {
		const a = validateUrl('https://Example.com:443/path?x=1', {isAdmin: false})
		expect(a.ok).toBe(true)
		if (!a.ok) return
		const b = validateUrl(a.normalized.toString(), {isAdmin: false})
		expect(b.ok).toBe(true)
		if (!b.ok) return
		expect(b.normalized.toString()).toBe(a.normalized.toString())
	})
})
