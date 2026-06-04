// livos/packages/livinityd/source/modules/server/sso-handshake.test.ts
//
// Phase 259 — the open-redirect / cross-tenant gate lives entirely in these pure
// helpers, so they get the heaviest coverage.

import {describe, expect, test} from 'vitest'

import {isOwnAppHost, parseSsoReturnTarget, sanitizeSsoPath} from './sso-handshake.js'

const MAIN = 'bruce.livinity.io'

describe('isOwnAppHost', () => {
	test('accepts the hyphen-canonical app host', () => {
		expect(isOwnAppHost('n8n-bruce.livinity.io', MAIN)).toBe(true)
		expect(isOwnAppHost('adguard-home-bruce.livinity.io', MAIN)).toBe(true)
	})
	test('accepts the legacy dot app host', () => {
		expect(isOwnAppHost('n8n.bruce.livinity.io', MAIN)).toBe(true)
	})
	test('rejects the apex itself', () => {
		expect(isOwnAppHost('bruce.livinity.io', MAIN)).toBe(false)
	})
	test('rejects another tenant (the core cross-tenant guard)', () => {
		expect(isOwnAppHost('n8n-alice.livinity.io', MAIN)).toBe(false)
		expect(isOwnAppHost('alice.livinity.io', MAIN)).toBe(false)
		expect(isOwnAppHost('n8n.alice.livinity.io', MAIN)).toBe(false)
	})
	test('rejects the shared platform + unrelated domains', () => {
		expect(isOwnAppHost('livinity.io', MAIN)).toBe(false)
		expect(isOwnAppHost('apps.livinity.io', MAIN)).toBe(false)
		expect(isOwnAppHost('evil.com', MAIN)).toBe(false)
		expect(isOwnAppHost('n8n-bruce.livinity.io.evil.com', MAIN)).toBe(false)
	})
	test('rejects the bare `-<user>` host (no app label)', () => {
		expect(isOwnAppHost('-bruce.livinity.io', MAIN)).toBe(false)
	})
})

describe('parseSsoReturnTarget', () => {
	test('returns host + path for a valid https app URL', () => {
		expect(parseSsoReturnTarget('https://n8n-bruce.livinity.io/workflows?x=1', MAIN)).toEqual({
			host: 'n8n-bruce.livinity.io',
			path: '/workflows?x=1',
		})
	})
	test('defaults an empty path to /', () => {
		expect(parseSsoReturnTarget('https://n8n-bruce.livinity.io', MAIN)).toEqual({
			host: 'n8n-bruce.livinity.io',
			path: '/',
		})
	})
	test('accepts http (tunnel-mode internal scheme — relay terminates TLS)', () => {
		// Behind the CF-tunnel relay Caddy serves http:// internally, so the gated
		// 401 redirect reflects {scheme}=http. Host is the real gate; output forces https.
		expect(parseSsoReturnTarget('http://n8n-bruce.livinity.io/', MAIN)).toEqual({
			host: 'n8n-bruce.livinity.io',
			path: '/',
		})
	})
	test('rejects non-http(s) schemes (ftp/file/javascript)', () => {
		expect(parseSsoReturnTarget('ftp://n8n-bruce.livinity.io/', MAIN)).toBeNull()
		expect(parseSsoReturnTarget('file:///etc/passwd', MAIN)).toBeNull()
	})
	test('rejects embedded credentials (userinfo spoof)', () => {
		expect(parseSsoReturnTarget('https://n8n-bruce.livinity.io@evil.com/', MAIN)).toBeNull()
	})
	test('rejects a foreign tenant + unrelated host', () => {
		expect(parseSsoReturnTarget('https://n8n-alice.livinity.io/', MAIN)).toBeNull()
		expect(parseSsoReturnTarget('https://evil.com/', MAIN)).toBeNull()
	})
	test('rejects garbage / non-URL input', () => {
		expect(parseSsoReturnTarget('', MAIN)).toBeNull()
		expect(parseSsoReturnTarget('not a url', MAIN)).toBeNull()
	})
})

describe('sanitizeSsoPath', () => {
	test('keeps a normal absolute path', () => {
		expect(sanitizeSsoPath('/workflows?x=1')).toBe('/workflows?x=1')
	})
	test('collapses protocol-relative + backslash open-redirect tricks to /', () => {
		expect(sanitizeSsoPath('//evil.com')).toBe('/')
		expect(sanitizeSsoPath('/\\evil.com')).toBe('/')
	})
	test('rejects non-absolute + empty', () => {
		expect(sanitizeSsoPath('evil.com')).toBe('/')
		expect(sanitizeSsoPath('')).toBe('/')
		expect(sanitizeSsoPath(undefined)).toBe('/')
	})
})
