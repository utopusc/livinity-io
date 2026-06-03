// Phase 257-02 (WS-C, LIVOS-015) — admin daemon must bind loopback by default.
//
// The livinityd admin daemon (:8080) historically called
// `this.server.listen(targetPort, cb)` with NO host argument → INADDR_ANY,
// exposing the full management console to every device on the LAN. The intended
// topology is Cloudflare(DNS) → Server5 relay → Mini PC tunnel, and Caddy
// reverse-proxies to 127.0.0.1:<port> as the public front door — so a loopback
// bind keeps the public path working while removing the unintended LAN surface.
//
// `resolveBindHost()` is factored out so the chosen host is unit-testable
// without opening a socket. Default 127.0.0.1; LIVOS_BIND_HOST overrides it for
// operators who need a legitimate overlay (ZeroTier/Tailscale) reach.

import {describe, test, expect, afterEach} from 'vitest'

import {resolveBindHost} from './bind-host.js'

describe('resolveBindHost (LIVOS-015)', () => {
	const original = process.env.LIVOS_BIND_HOST

	afterEach(() => {
		if (original === undefined) delete process.env.LIVOS_BIND_HOST
		else process.env.LIVOS_BIND_HOST = original
	})

	test('binds loopback (127.0.0.1) by default — NOT the wildcard', () => {
		delete process.env.LIVOS_BIND_HOST
		const host = resolveBindHost()
		expect(host).toBe('127.0.0.1')
		expect(host).not.toBe('0.0.0.0')
		expect(host).not.toBe('::')
	})

	test('honors LIVOS_BIND_HOST override (overlay opt-in)', () => {
		process.env.LIVOS_BIND_HOST = '10.147.20.5'
		expect(resolveBindHost()).toBe('10.147.20.5')
	})

	test('falls back to loopback when LIVOS_BIND_HOST is empty', () => {
		process.env.LIVOS_BIND_HOST = ''
		expect(resolveBindHost()).toBe('127.0.0.1')
	})
})
