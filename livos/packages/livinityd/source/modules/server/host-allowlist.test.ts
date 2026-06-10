/**
 * Phase 263-02 (L-073 Critical, architectural root) — Host-allowlist middleware
 * RED tests. The apex session gate at index.ts is fail-OPEN for non-apex Hosts
 * (`host !== domain -> next()`), so a forged/loopback Host (e.g. `127.0.0.1`,
 * `evil.example.com`) fell through ungated and could reach daemon routes
 * directly on :8080 (live-confirmed: `curl -H 'Host: evil.example.com'
 * /api/chrome/status -> 200, an info leak). This middleware closes that: any
 * Host NOT in {apex ∪ enabled subdomains ∪ native-app subdomains ∪ approved
 * custom domains} gets 403 (or 302 -> /login for text/html GET), NEVER next().
 *
 * Strategy: the middleware is extracted into a testable FACTORY
 * (`makeHostAllowlistMiddleware`) — same convention as liv-login-handler.ts /
 * chrome-launch.ts — so the fail-closed branches can be unit-asserted in
 * isolation (string-level Caddy tests cannot catch a fail-open, per the
 * LIVOS-041 lesson). Live verification of the full :8080 chain lives in 263-06.
 *
 * Coverage (per Plan 263-02 Task 1 behavior spec):
 *   1. Host = apex (domainConfig.domain) -> next()
 *   2. Host = <enabled-sub>.<domain> (subdomains, enabled:true) -> next()
 *   3. Host = 127.0.0.1 (not apex/sub/native/custom) -> 403, NEVER next()
 *   4. Host = evil.example.com -> 403, NEVER next()
 *   5. Host = disabled subdomain (enabled:false) -> 403
 *   6. text/html GET to unknown Host -> 302 -> https://<domain>/login
 *   7. no domainConfig in Redis (dev box) -> next() (no-op)
 *   + Host via the subdomain `host` field (Phase-140 hyphen pattern) -> next()
 *   + Native-app subdomain -> next()
 *   + Approved custom domain -> next()
 *   + Custom-domain status 'dns_changed' -> NOT approved -> 403
 *   + domainConfig present but active:false -> next() (no-op)
 *   + internal error (redis throws) -> fail-CLOSED 403
 */

import {describe, it, expect, vi} from 'vitest'
import type {Request, Response} from 'express'

import {makeHostAllowlistMiddleware, type HostAllowlistDeps} from './host-allowlist.js'

interface MockOut {
	statusCode?: number
	jsonBody?: unknown
	redirectArg?: [number, string]
	headersSent: boolean
}

function makeRes(): {res: Response; out: MockOut} {
	const out: MockOut = {headersSent: false}
	const res = {
		get headersSent() {
			return out.headersSent
		},
		status: vi.fn((code: number) => {
			out.statusCode = code
			return res
		}),
		json: vi.fn((body: unknown) => {
			out.jsonBody = body
			out.headersSent = true
			return res
		}),
		redirect: vi.fn((status: number, location: string) => {
			out.redirectArg = [status, location]
			out.statusCode = status
			out.headersSent = true
		}),
	} as unknown as Response
	return {res, out}
}

function makeReq(opts: {hostname?: string; method?: string; accept?: string}): Request {
	return {
		hostname: opts.hostname,
		method: opts.method ?? 'GET',
		headers: {accept: opts.accept ?? 'application/json'},
	} as unknown as Request
}

// Redis fake: a Map of key -> JSON string. `throwOnGet` simulates an internal
// error to assert the fail-closed catch.
function makeRedis(
	entries: Record<string, string>,
	throwOnGet = false,
): HostAllowlistDeps['redis'] {
	return {
		get: vi.fn(async (key: string) => {
			if (throwOnGet) throw new Error('redis exploded')
			return entries[key] ?? null
		}),
	}
}

const APEX = 'bruce.livinity.io'

function activeDomainConfig(): Record<string, string> {
	return {
		'livos:domain:config': JSON.stringify({active: true, domain: APEX}),
	}
}

function makeDeps(over: Partial<HostAllowlistDeps> = {}): HostAllowlistDeps {
	return {
		redis: makeRedis(activeDomainConfig()),
		getNativeSubdomains: () => [],
		isApprovedCustomDomain: async () => false,
		logError: () => {},
		...over,
	}
}

describe('host-allowlist middleware (L-073 fail-closed)', () => {
	it('Test 1: apex Host -> next()', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: APEX}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Test 2: enabled subdomain via reconstruction -> next()', async () => {
		const redis = makeRedis({
			...activeDomainConfig(),
			'livos:domain:subdomains': JSON.stringify([
				{subdomain: 'n8n', enabled: true},
			]),
		})
		const mw = makeHostAllowlistMiddleware(makeDeps({redis}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: `n8n.${APEX}`}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Test 2b: enabled subdomain via host field (Phase-140 hyphen pattern) -> next()', async () => {
		const redis = makeRedis({
			...activeDomainConfig(),
			'livos:domain:subdomains': JSON.stringify([
				{subdomain: 'n8n', enabled: true, host: 'n8n-socinity.livinity.io'},
			]),
		})
		const mw = makeHostAllowlistMiddleware(makeDeps({redis}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'n8n-socinity.livinity.io'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Test 3: Host = 127.0.0.1 (loopback) -> 403, NEVER next()', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: '127.0.0.1'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('Test 4: Host = evil.example.com -> 403, NEVER next()', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'evil.example.com'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('Test 5: disabled subdomain (enabled:false) -> 403', async () => {
		const redis = makeRedis({
			...activeDomainConfig(),
			'livos:domain:subdomains': JSON.stringify([
				{subdomain: 'n8n', enabled: false},
			]),
		})
		const mw = makeHostAllowlistMiddleware(makeDeps({redis}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: `n8n.${APEX}`}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('Test 6: text/html GET to unknown Host -> 302 -> https://<domain>/login', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(
			makeReq({hostname: 'evil.example.com', method: 'GET', accept: 'text/html,application/xhtml+xml'}),
			res,
			next,
		)
		expect(next).not.toHaveBeenCalled()
		expect(out.redirectArg).toEqual([302, `https://${APEX}/login`])
	})

	it('Test 7: no domainConfig in Redis (dev box) -> next() no-op', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps({redis: makeRedis({})}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: '127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Test 7b: domainConfig present but active:false -> next() no-op', async () => {
		const redis = makeRedis({
			'livos:domain:config': JSON.stringify({active: false, domain: APEX}),
		})
		const mw = makeHostAllowlistMiddleware(makeDeps({redis}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'evil.example.com'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Native-app subdomain -> next()', async () => {
		const mw = makeHostAllowlistMiddleware(
			makeDeps({getNativeSubdomains: () => ['pc']}),
		)
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: `pc.${APEX}`}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Approved custom domain -> next()', async () => {
		const mw = makeHostAllowlistMiddleware(
			makeDeps({isApprovedCustomDomain: async (h) => h === 'myblog.com'}),
		)
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'myblog.com'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('Custom-domain resolver rejects (e.g. dns_changed) -> 403', async () => {
		const mw = makeHostAllowlistMiddleware(
			makeDeps({isApprovedCustomDomain: async () => false}),
		)
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'myblog.com'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
	})

	it('missing Host header on a domain-configured box -> 403 (never next)', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: undefined}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('internal error (redis throws) -> fail-CLOSED 403', async () => {
		const redis = makeRedis(activeDomainConfig(), true)
		const logError = vi.fn()
		const mw = makeHostAllowlistMiddleware(makeDeps({redis, logError}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: APEX}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
		expect(logError).toHaveBeenCalledOnce()
	})

	it('custom-domain resolver throwing is caught -> 403 (never next)', async () => {
		const mw = makeHostAllowlistMiddleware(
			makeDeps({
				isApprovedCustomDomain: async () => {
					throw new Error('store down')
				},
			}),
		)
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'myblog.com'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
	})
})
