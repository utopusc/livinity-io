// Phase 290 — frame-probe (Wave 1, T1.1).
//
// H3 FIX: the BACKEND probe is authoritative for a web shortcut's open_mode.
// A client-side iframe watchdog is unreliable (cross-origin contentWindow is
// unreadable), so `shortcut.create(web)` stores open_mode='iframe' |
// 'browser-stream' computed from THIS probe at create time — frame-deny sites
// (e.g. OpenClaw) get a browser-stream tile from creation, never a blank iframe.
//
// What it reads:
//   - X-Frame-Options: DENY / SAMEORIGIN → not frameable on our desktop origin.
//   - Content-Security-Policy: frame-ancestors — if present and it does NOT
//     allow our origin (and is not 'none'/self-only that excludes us), not
//     frameable. A permissive `frame-ancestors *` (or absent CSP) → frameable.
//
// Reuses the SSRF guard (url-validator.validateUrl) before any network call so
// a non-admin can never probe a private/loopback host. Redis-cached on the
// sha256 of the normalized URL (1h TTL) so repeated adds are cheap.
//
// H4 — `local` shortcuts are EXEMPT from this probe (the SSRF guard blocks
// loopback). The caller never probes local; local goes iframe-first via the
// /app/:appId/* proxy (deferred wave).

import {createHash} from 'node:crypto'

import {Redis} from 'ioredis'

import {validateUrl} from '../webapps/url-validator.js'

export type FrameProbeResult = {
	frameable: boolean
	// 'no-headers' (frameable), 'xfo-deny', 'xfo-sameorigin', 'csp-frame-ancestors',
	// 'csp-frame-ancestors-allows', 'fetch-error' (fail-open → frameable).
	reason: string
}

const KEY_PREFIX = 'liv:shortcut:frameable:'
const TTL_SECONDS = 60 * 60 // 1h
const DEFAULT_TIMEOUT_MS = 6_000
const USER_AGENT =
	'Mozilla/5.0 (compatible; LivOS-Shortcut-FrameProbe/1.0; +https://livinity.io/bot)'

export type RedisLike = {
	get(key: string): Promise<string | null>
	set(key: string, value: string, ex: 'EX', seconds: number): Promise<unknown>
}

let _redis: Redis | null = null
function getRealRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

function cacheKey(normalizedUrl: string): string {
	return `${KEY_PREFIX}${createHash('sha256').update(normalizedUrl).digest('hex')}`
}

// ── Header → frameable decision (pure; exported for unit tests) ───────────

/**
 * Decide frameability from the two relevant response headers. The desktop is
 * served from `operatorOrigin` (e.g. https://everything.livinity.io); a header
 * that pins framing to the site's OWN origin (or DENY) means we cannot iframe it.
 *
 * Conservative: when in doubt about a CSP frame-ancestors value we treat it as
 * NOT frameable (→ browser-stream) — a stream always renders, so erring toward
 * the stream never yields a blank tile.
 */
export function decideFrameable(headers: {
	xFrameOptions?: string | null
	csp?: string | null
	operatorOrigin?: string | null
}): FrameProbeResult {
	const xfo = (headers.xFrameOptions ?? '').trim().toLowerCase()
	if (xfo) {
		// XFO has no syntax to allow a third-party origin (ALLOW-FROM is dead).
		// DENY or SAMEORIGIN both mean "not our origin".
		if (xfo.includes('deny')) return {frameable: false, reason: 'xfo-deny'}
		if (xfo.includes('sameorigin')) return {frameable: false, reason: 'xfo-sameorigin'}
		// Any other XFO value is non-standard → be conservative.
		return {frameable: false, reason: 'xfo-other'}
	}

	const csp = headers.csp ?? ''
	const m = csp.match(/frame-ancestors([^;]*)/i)
	if (m) {
		const directive = m[1].trim().toLowerCase()
		// `frame-ancestors *` (or a wildcard token) → anyone can frame.
		if (/(^|\s)\*(\s|$)/.test(directive) || directive.includes('https:')) {
			return {frameable: true, reason: 'csp-frame-ancestors-allows'}
		}
		// `'none'` / `'self'` / explicit allow-list — does it name our origin?
		const origin = (headers.operatorOrigin ?? '').trim().toLowerCase()
		if (origin && directive.includes(origin.replace(/^https?:\/\//, ''))) {
			return {frameable: true, reason: 'csp-frame-ancestors-allows'}
		}
		return {frameable: false, reason: 'csp-frame-ancestors'}
	}

	// No XFO, no frame-ancestors → frameable (default iframe).
	return {frameable: true, reason: 'no-headers'}
}

// ── Network probe (reuses url-validator SSRF guard) ───────────────────────

export type ProbeDeps = {
	cache?: RedisLike
	fetcher?: typeof fetch
	timeoutMs?: number
	operatorOrigin?: string | null
}

/**
 * Probe `url` for frameability. Validates (SSRF guard) → cache → GET headers →
 * decide → cache. Fails OPEN (frameable:true) on any network error: a stuck
 * probe must never block adding a shortcut, and a runtime client watchdog +
 * the manual "open as stream" affordance catch a wrong guess.
 */
export async function probeFrameable(
	args: {url: string; isAdmin: boolean},
	deps: ProbeDeps = {},
): Promise<FrameProbeResult> {
	const validation = validateUrl(args.url, {isAdmin: args.isAdmin})
	if (!validation.ok) {
		// Caller validates before this normally; treat invalid as frameable so we
		// never crash the create path on a probe (the create path re-validates).
		return {frameable: true, reason: 'invalid-url'}
	}
	const normalized = validation.normalized.toString()
	const key = cacheKey(normalized)
	const cache = deps.cache ?? (getRealRedis() as unknown as RedisLike)
	const fetcher = deps.fetcher ?? fetch
	const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const operatorOrigin = deps.operatorOrigin ?? process.env.LIVOS_OPERATOR_DOMAIN ?? null

	const cached = await cache.get(key).catch(() => null)
	if (cached) {
		try {
			return JSON.parse(cached) as FrameProbeResult
		} catch {
			/* fall through to re-probe */
		}
	}

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	let result: FrameProbeResult
	try {
		const res = await fetcher(validation.normalized, {
			method: 'GET',
			redirect: 'follow',
			signal: controller.signal,
			headers: {'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml'},
		})
		// Drain the body so the socket frees; we only need the headers.
		try {
			await res.body?.cancel()
		} catch {
			/* ignore */
		}
		result = decideFrameable({
			xFrameOptions: res.headers.get('x-frame-options'),
			csp: res.headers.get('content-security-policy'),
			operatorOrigin,
		})
	} catch {
		// Fail open — never block the create path on a probe failure.
		result = {frameable: true, reason: 'fetch-error'}
	} finally {
		clearTimeout(timer)
	}

	// Fire-and-forget cache store.
	void cache.set(key, JSON.stringify(result), 'EX', TTL_SECONDS).catch(() => {})
	return result
}

/** Map a frame-probe result → the open_mode to persist for a web shortcut. */
export function openModeForWeb(probe: FrameProbeResult): 'iframe' | 'browser-stream' {
	return probe.frameable ? 'iframe' : 'browser-stream'
}
