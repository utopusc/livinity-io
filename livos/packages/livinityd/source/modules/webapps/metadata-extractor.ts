// Phase 92-08 — orchestrator that composes the URL validator (92-03), the
// HTTP fetch wrapper (92-06), the HTML parser (92-04), the favicon
// resolver (92-05), and the Redis cache (92-07) into a single async
// pipeline. The tRPC procedure (92-09) calls into here via the public
// `extractMetadata({url, isAdmin})` entrypoint.
//
// Pipeline:
//   1. validate(url) → if invalid, throw ValidationError (mapped to
//      tRPC BAD_REQUEST in the router layer).
//   2. cache.get(normalizedUrl) → if hit, return immediately.
//   3. fetchHtml(normalizedUrl) → on FetchError, map to ExtractionError.
//   4. parseMetadata(html, finalUrl) → never throws; returns shape with
//      undefined fields for missing metadata.
//   5. resolveFavicon(candidates, finalUrl) → never throws; always
//      returns an absolute URL (the /favicon.ico fallback covers the
//      empty-candidate case).
//   6. cache.set(normalizedUrl, result) → fire-and-forget; failures here
//      do NOT fail the request (next call eats the cache miss instead).
//   7. Log when total elapsed > 3000ms (CONTEXT gray-area; ops visibility).
//
// Errors raised here are typed `ExtractionError` with a code matching the
// CONTEXT.md error-shape table; the tRPC layer maps them to TRPCError.

import {fetchHtml, FetchError} from './fetch-html.js'
import {parseMetadata} from './html-parser.js'
import {resolveFavicon} from './favicon-resolver.js'
import {createMetadataCache, type MetadataCache} from './metadata-cache.js'
import {validateUrl, type ValidateErrCode} from './url-validator.js'

export type MetadataResult = {
	title: string | null
	faviconUrl: string | null
	description: string | null
	ogImage: string | null
}

export type ExtractionErrorCode =
	| 'BAD_REQUEST' // validator rejected
	| 'TIMEOUT' // fetch wall-clock budget exceeded
	| 'TOO_MANY_REDIRECTS'
	| 'RESPONSE_TOO_LARGE'
	| 'NOT_HTML'
	| 'NETWORK_ERROR'
	| 'BAD_STATUS'

export class ExtractionError extends Error {
	code: ExtractionErrorCode
	cause?: {validateCode?: ValidateErrCode; reason?: string}
	constructor(code: ExtractionErrorCode, message: string, cause?: ExtractionError['cause']) {
		super(message)
		this.name = 'ExtractionError'
		this.code = code
		if (cause) this.cause = cause
	}
}

// Logger surface kept narrow so unit tests can pass a console-like fake.
export type Logger = {
	log: (msg: string, ...args: unknown[]) => void
	error: (msg: string, ...args: unknown[]) => void
}

// Dependency-injection surface for testability. Defaults wire the real
// Redis-backed cache + the fetch wrapper. Tests pass stubs.
export type ExtractorDeps = {
	cache?: MetadataCache
	fetcher?: typeof fetchHtml
	logger?: Logger
	// Total elapsed (ms) above this threshold logs an info line for ops.
	slowThresholdMs?: number
}

const DEFAULT_SLOW_MS = 3_000

function fetchErrorToExtractionError(e: FetchError): ExtractionError {
	switch (e.code) {
		case 'TIMEOUT':
			return new ExtractionError('TIMEOUT', e.message)
		case 'TOO_MANY_REDIRECTS':
			return new ExtractionError('TOO_MANY_REDIRECTS', e.message)
		case 'RESPONSE_TOO_LARGE':
			return new ExtractionError('RESPONSE_TOO_LARGE', e.message)
		case 'NOT_HTML':
			return new ExtractionError('NOT_HTML', e.message)
		case 'BAD_STATUS':
			return new ExtractionError('BAD_STATUS', e.message)
		case 'NETWORK_ERROR':
		default:
			return new ExtractionError('NETWORK_ERROR', e.message)
	}
}

export async function extractMetadata(
	args: {url: string; isAdmin: boolean},
	deps: ExtractorDeps = {},
): Promise<MetadataResult> {
	const cache = deps.cache ?? createMetadataCache()
	const fetcher = deps.fetcher ?? fetchHtml
	const logger = deps.logger
	const slowThresholdMs = deps.slowThresholdMs ?? DEFAULT_SLOW_MS

	const startedAt = Date.now()

	// ── 1. Validate ────────────────────────────────────────────────────────
	const validation = validateUrl(args.url, {isAdmin: args.isAdmin})
	if (!validation.ok) {
		throw new ExtractionError('BAD_REQUEST', validation.reason, {
			validateCode: validation.code,
			reason: validation.reason,
		})
	}
	const normalizedUrl = validation.normalized
	const normalizedKey = normalizedUrl.toString()

	// ── 2. Cache lookup ────────────────────────────────────────────────────
	const hit = await cache.get(normalizedKey).catch(() => null)
	if (hit) {
		// Cache hit: do NOT log slow even on hit (the slow-extraction signal
		// is a fetch-path tax indicator).
		return hit
	}

	// ── 3. Fetch ───────────────────────────────────────────────────────────
	let fetched: Awaited<ReturnType<typeof fetchHtml>>
	try {
		fetched = await fetcher(normalizedUrl)
	} catch (e: any) {
		if (e instanceof FetchError) throw fetchErrorToExtractionError(e)
		throw new ExtractionError('NETWORK_ERROR', e?.message ?? 'unknown fetch failure')
	}

	// ── 4. Parse ───────────────────────────────────────────────────────────
	const parsed = parseMetadata(fetched.html, fetched.finalUrl)

	// ── 5. Resolve favicon ─────────────────────────────────────────────────
	// resolveFavicon never throws and always returns an absolute URL (it
	// falls back to <baseUrl.origin>/favicon.ico when no candidates exist).
	const faviconUrl = resolveFavicon(parsed.faviconCandidates, fetched.finalUrl)

	const result: MetadataResult = {
		title: parsed.title ?? null,
		faviconUrl,
		description: parsed.description ?? null,
		ogImage: parsed.ogImage ?? null,
	}

	// ── 6. Cache store (fire-and-forget) ───────────────────────────────────
	cache.set(normalizedKey, result).catch((err) => {
		logger?.error('webapps: cache.set failed (non-fatal)', err)
	})

	// ── 7. Slow-extraction telemetry ───────────────────────────────────────
	const elapsed = Date.now() - startedAt
	if (elapsed > slowThresholdMs) {
		logger?.log(
			`webapps: slow extraction ${elapsed}ms for ${normalizedKey} (cache miss; budget ${slowThresholdMs}ms)`,
		)
	}

	return result
}
