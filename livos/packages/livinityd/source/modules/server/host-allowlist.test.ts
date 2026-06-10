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
 *
 * Loopback carve-out (CR-01 / T-263-073-NEW) — separate describe block:
 *   loopback Host + loopback peer + no XFF -> next() (localhost/127.0.0.1/::1,
 *   incl. ::ffff:127.0.0.1 peer); loopback Host + container peer (172.17.0.5)
 *   -> 403; loopback Host + loopback peer + x-forwarded-for -> 403; forged
 *   non-loopback Host + loopback peer -> 403; apex/subdomain from loopback
 *   peer -> unchanged.
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

function makeReq(opts: {
	hostname?: string
	method?: string
	accept?: string
	/** TCP peer (request.socket.remoteAddress). Default: a non-loopback LAN IP
	 * so existing fail-closed assertions (e.g. Host: 127.0.0.1 → 403) hold —
	 * the loopback carve-out requires a loopback PEER, not just a loopback Host. */
	remoteAddress?: string
	/** When set, becomes the `x-forwarded-for` header (i.e. proxied). */
	xff?: string
}): Request {
	const headers: Record<string, string> = {accept: opts.accept ?? 'application/json'}
	if (opts.xff != null) headers['x-forwarded-for'] = opts.xff
	return {
		hostname: opts.hostname,
		method: opts.method ?? 'GET',
		headers,
		socket: {remoteAddress: opts.remoteAddress ?? '192.168.1.50'},
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

	it('Test 3: Host = 127.0.0.1 from a NON-loopback peer -> 403, NEVER next()', async () => {
		// The loopback carve-out (CR-01) requires a loopback PEER. makeReq's
		// default peer is a LAN IP (192.168.1.50), so a forged loopback Host
		// from off-box stays fail-closed — the original L-073 intent.
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

// ───────────────────────────────────────────────────────────────────────────
// CR-01 / T-263-073-NEW — loopback carve-out.
//
// A genuine on-box loopback caller (the Nexus device-tool callback to
// Host: localhost, the luse /trpc resolver to Host: 127.0.0.1) is admitted
// ONLY when ALL THREE hold: loopback Host + loopback TCP peer + no
// x-forwarded-for. A forged loopback Host from a non-loopback peer (a
// container, or a proxied external request) stays fail-closed (403). This
// proves the carve-out is strictly narrower than the old fail-open and does
// NOT re-open L-073.
// ───────────────────────────────────────────────────────────────────────────
describe('host-allowlist loopback carve-out (CR-01)', () => {
	it('loopback Host localhost + loopback peer 127.0.0.1 + no XFF -> next()', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'localhost', remoteAddress: '127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('loopback Host 127.0.0.1 + loopback peer 127.0.0.1 + no XFF -> next() (luse /trpc class)', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: '127.0.0.1', remoteAddress: '127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('loopback Host localhost + IPv4-mapped IPv6 peer ::ffff:127.0.0.1 + no XFF -> next()', async () => {
		// Node commonly reports loopback as the IPv4-mapped IPv6 form.
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'localhost', remoteAddress: '::ffff:127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('loopback Host ::1 + loopback peer ::1 + no XFF -> next()', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: '::1', remoteAddress: '::1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('loopback Host 127.0.0.1 + CONTAINER peer 172.17.0.5 + no XFF -> 403 (forged Host, non-loopback peer)', async () => {
		// The load-bearing condition: a container reaches :8080 from a
		// docker-bridge IP. A loopback Host header must NOT admit it.
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: '127.0.0.1', remoteAddress: '172.17.0.5'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('loopback Host 127.0.0.1 + loopback peer + x-forwarded-for: 1.2.3.4 -> 403 (proxied, not direct)', async () => {
		// Caddy always adds XFF when proxying; a local reverse proxy must not be
		// able to launder an external request into the carve-out.
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(
			makeReq({hostname: '127.0.0.1', remoteAddress: '127.0.0.1', xff: '1.2.3.4'}),
			res,
			next,
		)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('forged non-loopback Host evil.example.com + loopback peer -> 403 (Host not loopback-literal)', async () => {
		// The carve-out is gated on a loopback HOST literal too — a loopback
		// peer alone does not admit an arbitrary forged Host (unchanged L-073).
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: 'evil.example.com', remoteAddress: '127.0.0.1'}), res, next)
		expect(next).not.toHaveBeenCalled()
		expect(out.statusCode).toBe(403)
		expect(out.jsonBody).toEqual({error: 'forbidden host'})
	})

	it('apex Host from loopback peer -> still next() via apex path (carve-out unchanged for apex)', async () => {
		const mw = makeHostAllowlistMiddleware(makeDeps())
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: APEX, remoteAddress: '127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})

	it('subdomain Host from loopback peer -> unchanged (resolves via subdomain path, not carve-out)', async () => {
		const redis = makeRedis({
			...activeDomainConfig(),
			'livos:domain:subdomains': JSON.stringify([{subdomain: 'n8n', enabled: true}]),
		})
		const mw = makeHostAllowlistMiddleware(makeDeps({redis}))
		const {res, out} = makeRes()
		const next = vi.fn()
		await mw(makeReq({hostname: `n8n.${APEX}`, remoteAddress: '127.0.0.1'}), res, next)
		expect(next).toHaveBeenCalledOnce()
		expect(out.statusCode).toBeUndefined()
	})
})
