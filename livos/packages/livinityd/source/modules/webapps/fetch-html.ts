// Phase 92-06 — HTTP fetch wrapper.
//
// Single entrypoint `fetchHtml(url)` over Node 20's global `fetch`. No
// external HTTP client (no `node-fetch`, no `axios`). Enforces the four
// hardening guarantees from CONTEXT.md gray areas + In-scope #4:
//
//   - 8s total wall-clock timeout (gray-area #2 default)
//   - Max 5 redirect hops (gray-area #4 default)
//   - 2 MB response body cap (gray-area #1 default)
//   - Content-type allowlist: must start with text/html
//
// Manual redirect follow (instead of fetch's redirect:'follow') because we
// want to count hops AND surface the final URL for favicon resolution.
//
// Errors:
//   class FetchError extends Error { code: 'TIMEOUT' | 'TOO_MANY_REDIRECTS'
//     | 'RESPONSE_TOO_LARGE' | 'NOT_HTML' | 'NETWORK_ERROR' | 'BAD_STATUS' }
//
// User-Agent (CONTEXT gray-area #3 default):
//   "Mozilla/5.0 (compatible; LivOS-Metadata/1.0; +https://livinity.io/bot)"

const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (compatible; LivOS-Metadata/1.0; +https://livinity.io/bot)'
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export type FetchHtmlOpts = {
	timeoutMs?: number
	maxRedirects?: number
	maxBytes?: number
	userAgent?: string
}

export type FetchHtmlResult = {
	finalUrl: URL
	html: string
	contentType: string
}

export type FetchErrorCode =
	| 'TIMEOUT'
	| 'TOO_MANY_REDIRECTS'
	| 'RESPONSE_TOO_LARGE'
	| 'NOT_HTML'
	| 'NETWORK_ERROR'
	| 'BAD_STATUS'

export class FetchError extends Error {
	code: FetchErrorCode
	constructor(code: FetchErrorCode, message: string) {
		super(message)
		this.name = 'FetchError'
		this.code = code
	}
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

export async function fetchHtml(url: URL, opts: FetchHtmlOpts = {}): Promise<FetchHtmlResult> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
	const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)

	try {
		let current = new URL(url.toString())
		let redirects = 0
		let response: Response

		// Manual redirect loop. We pass `redirect: 'manual'` so fetch returns
		// the 3xx response without following — we count + decide ourselves.
		// eslint-disable-next-line no-constant-condition
		while (true) {
			try {
				response = await fetch(current, {
					method: 'GET',
					redirect: 'manual',
					signal: controller.signal,
					headers: {
						'User-Agent': userAgent,
						Accept: 'text/html,application/xhtml+xml',
					},
				})
			} catch (err: any) {
				if (err?.name === 'AbortError') {
					throw new FetchError('TIMEOUT', `Fetch aborted after ${timeoutMs}ms`)
				}
				throw new FetchError('NETWORK_ERROR', err?.message ?? 'fetch failed')
			}

			if (isRedirectStatus(response.status)) {
				const loc = response.headers.get('location')
				if (!loc) {
					throw new FetchError('NETWORK_ERROR', `${response.status} redirect missing Location header`)
				}
				redirects++
				if (redirects > maxRedirects) {
					throw new FetchError('TOO_MANY_REDIRECTS', `Exceeded ${maxRedirects} redirect hops`)
				}
				try {
					current = new URL(loc, current)
				} catch {
					throw new FetchError('NETWORK_ERROR', `Invalid redirect target: ${loc}`)
				}
				// Drain/cancel the redirect body so the connection can be reused
				// or closed; ignore any error (the response is short-lived).
				try {
					await response.body?.cancel()
				} catch {
					/* ignore */
				}
				continue
			}

			break
		}

		if (response.status < 200 || response.status >= 300) {
			throw new FetchError('BAD_STATUS', `HTTP ${response.status} on ${current.toString()}`)
		}

		const contentType = response.headers.get('content-type') ?? ''
		const ctLower = contentType.toLowerCase()
		// Accept text/html and application/xhtml+xml. Anything else (PDF,
		// image, octet-stream, JSON) is rejected — we have nothing to parse.
		if (!ctLower.startsWith('text/html') && !ctLower.startsWith('application/xhtml+xml')) {
			throw new FetchError('NOT_HTML', `Unsupported content-type: ${contentType || '(missing)'}`)
		}

		// Stream the body and abort once we exceed the cap. Reading via the
		// Web Streams API surfaces backpressure cleanly + lets us bail early
		// before allocating a giant string.
		const reader = response.body?.getReader()
		if (!reader) {
			throw new FetchError('NETWORK_ERROR', 'Response body is empty / unreadable')
		}

		const chunks: Uint8Array[] = []
		let total = 0
		while (true) {
			const {done, value} = await reader.read()
			if (done) break
			if (value) {
				total += value.byteLength
				if (total > maxBytes) {
					try {
						await reader.cancel()
					} catch {
						/* ignore */
					}
					throw new FetchError(
						'RESPONSE_TOO_LARGE',
						`Body exceeded ${maxBytes} bytes (saw ${total})`,
					)
				}
				chunks.push(value)
			}
		}

		// Decode as UTF-8. Mismatched encodings are rare for typical metadata
		// targets (most modern sites are UTF-8). The TextDecoder default is
		// 'replacement' for invalid bytes — fine for downstream parsing.
		const html = new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))))

		return {finalUrl: current, html, contentType}
	} finally {
		clearTimeout(timer)
	}
}
