// Phase 92-06 — fetch-html.ts integration tests.
//
// Spins up a real http server on an ephemeral port and exercises the
// guard rails: happy path, redirect chain (under cap + over cap), 8s
// timeout, 2 MB body cap, content-type rejection, BAD_STATUS surface.
//
// We use a plain `http.createServer` (no test framework specifics) so the
// fixture is portable and the test isolates the wrapper from network reach.

import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {AddressInfo} from 'node:net'

import {afterAll, beforeAll, describe, expect, test} from 'vitest'

import {FetchError, fetchHtml} from './fetch-html.js'

let server: Server
let baseHost: string

// Ad-hoc routes the test server exposes. Each test sets `routes.get(path)`
// before calling fetchHtml. Reset between tests (declared inside describe).
const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()

beforeAll(async () => {
	server = createServer((req, res) => {
		const handler = routes.get(req.url ?? '/')
		if (!handler) {
			res.statusCode = 404
			res.end('not found')
			return
		}
		handler(req, res)
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
	const addr = server.address() as AddressInfo
	baseHost = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()))
})

function setRoute(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
	routes.set(path, handler)
}

function resetRoutes() {
	routes.clear()
}

describe('fetchHtml — happy path', () => {
	test('returns finalUrl + html + contentType for a 200', async () => {
		resetRoutes()
		setRoute('/', (_req, res) => {
			res.setHeader('content-type', 'text/html; charset=utf-8')
			res.end('<html><head><title>OK</title></head><body></body></html>')
		})
		const url = new URL(`${baseHost}/`)
		const result = await fetchHtml(url)
		expect(result.finalUrl.toString()).toBe(`${baseHost}/`)
		expect(result.html).toContain('<title>OK</title>')
		expect(result.contentType).toMatch(/text\/html/)
	})
})

describe('fetchHtml — redirects', () => {
	test('follows up to maxRedirects and returns post-redirect finalUrl', async () => {
		resetRoutes()
		setRoute('/start', (_req, res) => {
			res.statusCode = 302
			res.setHeader('location', '/middle')
			res.end()
		})
		setRoute('/middle', (_req, res) => {
			res.statusCode = 301
			res.setHeader('location', '/final')
			res.end()
		})
		setRoute('/final', (_req, res) => {
			res.setHeader('content-type', 'text/html')
			res.end('<title>arrived</title>')
		})
		const result = await fetchHtml(new URL(`${baseHost}/start`))
		expect(result.finalUrl.pathname).toBe('/final')
		expect(result.html).toContain('arrived')
	})

	test('rejects when redirect chain exceeds maxRedirects', async () => {
		resetRoutes()
		// 6 redirects: /r0 → /r1 → ... → /r5 → /done
		for (let i = 0; i < 6; i++) {
			setRoute(`/r${i}`, (_req, res) => {
				res.statusCode = 302
				res.setHeader('location', `/r${i + 1}`)
				res.end()
			})
		}
		setRoute('/r6', (_req, res) => {
			res.setHeader('content-type', 'text/html')
			res.end('<title>too far</title>')
		})

		await expect(fetchHtml(new URL(`${baseHost}/r0`), {maxRedirects: 5})).rejects.toMatchObject({
			name: 'FetchError',
			code: 'TOO_MANY_REDIRECTS',
		})
	})
})

describe('fetchHtml — timeout', () => {
	test('aborts when server hangs past timeoutMs', async () => {
		resetRoutes()
		// Hang forever on this route (the test will timeout the AbortController).
		setRoute('/slow', (_req, _res) => {
			/* never respond */
		})
		await expect(fetchHtml(new URL(`${baseHost}/slow`), {timeoutMs: 250})).rejects.toMatchObject({
			name: 'FetchError',
			code: 'TIMEOUT',
		})
	}, 5_000)
})

describe('fetchHtml — body size cap', () => {
	test('aborts when body exceeds maxBytes', async () => {
		resetRoutes()
		setRoute('/big', (_req, res) => {
			res.setHeader('content-type', 'text/html')
			// Stream 100 KB chunks until we cumulatively send ~3 MB.
			const chunk = Buffer.alloc(100_000, 'x')
			let written = 0
			const tick = () => {
				if (written >= 3_000_000) {
					res.end()
					return
				}
				const ok = res.write(chunk)
				written += chunk.length
				if (ok) setImmediate(tick)
				else res.once('drain', tick)
			}
			tick()
		})
		await expect(fetchHtml(new URL(`${baseHost}/big`), {maxBytes: 500_000})).rejects.toMatchObject({
			name: 'FetchError',
			code: 'RESPONSE_TOO_LARGE',
		})
	})
})

describe('fetchHtml — content-type', () => {
	test('rejects non-HTML response', async () => {
		resetRoutes()
		setRoute('/json', (_req, res) => {
			res.setHeader('content-type', 'application/json')
			res.end('{"k":1}')
		})
		await expect(fetchHtml(new URL(`${baseHost}/json`))).rejects.toMatchObject({
			name: 'FetchError',
			code: 'NOT_HTML',
		})
	})

	test('accepts application/xhtml+xml', async () => {
		resetRoutes()
		setRoute('/xhtml', (_req, res) => {
			res.setHeader('content-type', 'application/xhtml+xml')
			res.end('<html><head><title>xhtml</title></head><body/></html>')
		})
		const result = await fetchHtml(new URL(`${baseHost}/xhtml`))
		expect(result.html).toContain('xhtml')
	})
})

describe('fetchHtml — bad status', () => {
	test('surfaces 5xx as BAD_STATUS', async () => {
		resetRoutes()
		setRoute('/err', (_req, res) => {
			res.statusCode = 500
			res.end('boom')
		})
		await expect(fetchHtml(new URL(`${baseHost}/err`))).rejects.toMatchObject({
			name: 'FetchError',
			code: 'BAD_STATUS',
		})
	})

	test('surfaces 404 as BAD_STATUS', async () => {
		resetRoutes()
		// no route → server's default 404 handler at top of file
		await expect(fetchHtml(new URL(`${baseHost}/missing`))).rejects.toMatchObject({
			name: 'FetchError',
			code: 'BAD_STATUS',
		})
	})
})

describe('fetchHtml — error class shape', () => {
	test('FetchError is throwable + carries code', async () => {
		const err = new FetchError('TIMEOUT', 'x')
		expect(err.code).toBe('TIMEOUT')
		expect(err.name).toBe('FetchError')
		expect(err instanceof Error).toBe(true)
	})
})
