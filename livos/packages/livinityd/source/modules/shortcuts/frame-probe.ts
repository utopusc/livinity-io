// Phase 290 — frame-probe (Wave 1, T1.1).
//
// H3 FIX: the BACKEND probe is authoritative for a web shortcut's open_mode.
// A client-side iframe watchdog is unreliable (cross-origin contentWindow is
// unreadable, and an XFO-blocked iframe still fires `load`), so
// `shortcut.create(web)` stores open_mode='iframe' | 'browser-stream' computed
// from THIS probe at create time — frame-deny sites (e.g. OpenClaw, Notion) get
// a browser-stream tile from creation, never a blank iframe.
//
// What it reads:
//   - X-Frame-Options: DENY / SAMEORIGIN → not frameable on our desktop origin.
//   - Content-Security-Policy: frame-ancestors — if present and it does NOT
//     allow our origin (and is not 'none'/self-only that excludes us), not
//     frameable. A permissive `frame-ancestors *` (or absent CSP) → frameable.
//
// INV-1 — when the probe CANNOT read a header (fetch error / timeout / invalid
// URL) it no longer fails OPEN to an iframe (which could turn out blank). It
// resolves to browser-stream (a stream always renders) AND does not cache the
// non-definitive result, so a transient failure never poisons the key for 1h.
//
// Reuses the SSRF guard (url-validator.validateUrl) before any network call so
// a non-admin can never probe a private/loopback host. Redis-cached on the
// sha256 of the normalized URL (1h TTL) so repeated adds are cheap — but ONLY a
// DEFINITIVE header read is cached.
//
// H4 — `local` shortcuts are EXEMPT from this probe (the SSRF guard blocks
// loopback). The caller never probes local; local goes iframe-first via the
// /app/:appId/* proxy (deferred wave).

import {createHash} from 'node:crypto'

import {Redis} from 'ioredis'

import {validateUrl} from '../webapps/url-validator.js'

export type FrameProbeResult = {
	frameable: boolean
	// 'no-headers' (frameable), 'xfo-deny', 'xfo-sameorigin', 'xfo-other',
	// 'csp-frame-ancestors', 'csp-frame-ancestors-allows' — all DEFINITIVE header
	// reads (definitive:true). 'fetch-error' / 'timeout' / 'invalid-url' are
	// NON-definitive (definitive:false): the probe could not read a header, so we
	// can't prove the site is frameable. INV-1 — a non-definitive result resolves
	// to browser-stream (frameable:false) because a stream ALWAYS renders, whereas
	// a wrongly-iframed frame-deny site shows a blank/blocked tile.
	reason: string
	// True only when a real response header (XFO / CSP) was read. Non-definitive
	// results are NOT cached (INV-1 ii) so a transient failure never poisons the
	// 1h Redis key.
	definitive: boolean
}

const KEY_PREFIX = 'liv:shortcut:frameable:'
const TTL_SECONDS = 60 * 60 // 1h
// INV-1 (i) — raised 6s→10s so a slow-but-reachable site still yields a
// DEFINITIVE header read (and thus the correct open_mode) instead of timing out
// into the fail-soft browser-stream branch below.
const DEFAULT_TIMEOUT_MS = 10_000
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
		if (xfo.includes('deny')) return {frameable: false, reason: 'xfo-deny', definitive: true}
		if (xfo.includes('sameorigin')) return {frameable: false, reason: 'xfo-sameorigin', definitive: true}
		// Any other XFO value is non-standard → be conservative.
		return {frameable: false, reason: 'xfo-other', definitive: true}
	}

	const csp = headers.csp ?? ''
	const m = csp.match(/frame-ancestors([^;]*)/i)
	if (m) {
		const directive = m[1].trim().toLowerCase()
		// INV-1 (iii) — a wildcard token (`*`, or a scheme-only `https:` source
		// that matches ANY https origin) means anyone may frame. Previously this
		// branch ALSO matched `directive.includes('https:')`, which wrongly treated
		// `frame-ancestors https://notion.so` (a specific third-party host that
		// EXCLUDES our origin) as frameable merely because the substring `https:`
		// appears. We now only accept a bare scheme-only `https:` source (the whole
		// token is `https:`, no host attached) as the wildcard form.
		const tokens = directive.split(/\s+/).filter(Boolean)
		const hasWildcard = tokens.some((t) => t === '*' || t === 'https:' || t === 'http:')
		if (hasWildcard) {
			return {frameable: true, reason: 'csp-frame-ancestors-allows', definitive: true}
		}
		// `'none'` / `'self'` / explicit allow-list — does it name our origin?
		// When our origin is ABSENT from the list, fall through to NOT frameable
		// (→ browser-stream) so a frame-deny site never renders as a blank tile.
		const origin = (headers.operatorOrigin ?? '').trim().toLowerCase()
		const originHost = origin.replace(/^https?:\/\//, '')
		if (originHost && tokens.some((t) => t.replace(/^https?:\/\//, '') === originHost)) {
			return {frameable: true, reason: 'csp-frame-ancestors-allows', definitive: true}
		}
		return {frameable: false, reason: 'csp-frame-ancestors', definitive: true}
	}

	// No XFO, no frame-ancestors → frameable (default iframe).
	return {frameable: true, reason: 'no-headers', definitive: true}
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
 * decide → cache. INV-1 — fails toward browser-stream (frameable:false,
 * definitive:false) on any network error / timeout / invalid URL: a stream
 * always renders, so a probe that could not read a header must NOT default to an
 * iframe that may turn out blank. The non-definitive result is NOT cached, so a
 * transient failure does not poison the key for an hour (re-adding re-probes).
 */
export async function probeFrameable(
	args: {url: string; isAdmin: boolean},
	deps: ProbeDeps = {},
): Promise<FrameProbeResult> {
	const validation = validateUrl(args.url, {isAdmin: args.isAdmin})
	if (!validation.ok) {
		// Caller validates before this normally; an invalid URL is non-definitive
		// → browser-stream (the create path re-validates and rejects properly).
		return {frameable: false, reason: 'invalid-url', definitive: false}
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
		// INV-1 — fail toward the stream (it always renders), and mark
		// non-definitive so this transient failure/timeout is NOT cached below.
		result = {frameable: false, reason: 'fetch-error', definitive: false}
	} finally {
		clearTimeout(timer)
	}

	// INV-1 (ii) — only cache a DEFINITIVE determination. A non-definitive
	// fetch-error/timeout result must not poison the 1h key so re-adding re-probes.
	if (result.definitive) {
		void cache.set(key, JSON.stringify(result), 'EX', TTL_SECONDS).catch(() => {})
	}
	return result
}

/** Map a frame-probe result → the open_mode to persist for a web shortcut. */
export function openModeForWeb(probe: FrameProbeResult): 'iframe' | 'browser-stream' {
	// INV-1 — frameable:false (including every non-definitive failure) → the
	// browser-stream X11 surface, which is immune to XFO/CSP and never blank.
	return probe.frameable ? 'iframe' : 'browser-stream'
}
