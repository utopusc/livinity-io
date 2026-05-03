/**
 * Phase 61 Plan 04 (FR-BROKER-C3-01..03): Rate-limit header forwarding +
 * translation across broker routes.
 *
 * Anthropic route (`/v1/messages`): forward verbatim ALL `anthropic-*` headers
 *   plus `retry-after` via a prefix loop. Uses prefix matching (NOT
 *   enumeration) so future `anthropic-*` headers (e.g. `anthropic-fast-tier-*`)
 *   propagate without code change. RESEARCH.md catalog lists 21 known headers
 *   today; the loop is future-proof.
 *
 * OpenAI route (`/v1/chat/completions`): translate the 6 canonical Anthropic
 *   ratelimit headers to the `x-ratelimit-*` namespace; drop input/output split
 *   + priority variants (no OpenAI equivalent); preserve `retry-after`
 *   verbatim. Reset values are duration strings per OpenAI official spec
 *   (`Ns` for sub-minute, `MmSs` for ≥ 60s). NOT Unix seconds — CONTEXT.md
 *   was wrong about that; RESEARCH.md A1 confirms duration string per the
 *   official OpenAI docs.
 *
 * CRITICAL ORDERING (RESEARCH.md Pitfall 1 / R9): callers MUST invoke these
 *   helpers BEFORE `res.flushHeaders()` (streaming) or `res.json()` (sync).
 *   After flushHeaders, `res.setHeader` silently no-ops in Node's http module
 *   and the rate-limit headers will quietly disappear. Wave 0 integration test
 *   asserts the ordering invariant on both routes.
 *
 * HOP-BY-HOP / BODY-FRAMING HEADERS (RESEARCH.md Pitfall 3): `content-length`,
 *   `content-encoding`, `transfer-encoding`, `connection`, `date` are NEVER
 *   forwarded. The filter is implicit because `forwardAnthropicHeaders` only
 *   matches `anthropic-*` + `retry-after`; `translateAnthropicToOpenAIHeaders`
 *   only emits the explicitly-mapped names. No explicit drop list needed.
 *
 * D-30-06 anchor: edge (Caddy) handles abuse rate-limiting; broker forwards
 *   upstream rate-limit state transparently. This module is the
 *   "transparency" half of that decision.
 */

import type {Response} from 'express'

/**
 * Forward all `anthropic-*` headers + `retry-after` from upstream to client
 * response. Uses prefix-loop iteration over the upstream Web Fetch `Headers`
 * iterable so future `anthropic-*` headers propagate without code change.
 *
 * NEVER forwards `content-length` / `content-encoding` / `transfer-encoding` /
 * `connection` / `date` — those are hop-by-hop or body-framing values; re-
 * emitting them on the broker response corrupts framing or chunked-encoding.
 * The implicit filter (only matches the prefix + retry-after) provides this
 * mitigation; no explicit drop list needed.
 *
 * Caller MUST invoke this BEFORE `res.flushHeaders()` (streaming) or
 * `res.json()` (sync). After flushHeaders, setHeader silently no-ops.
 */
export function forwardAnthropicHeaders(upstream: Headers, res: Response): void {
	for (const [name, value] of upstream) {
		const lower = name.toLowerCase()
		if (lower.startsWith('anthropic-') || lower === 'retry-after') {
			res.setHeader(name, value)
		}
	}
}

/**
 * Translate the 6 canonical Anthropic ratelimit headers to the OpenAI
 * `x-ratelimit-*` namespace. Drops input/output split + priority variants
 * (no OpenAI equivalent). Preserves `retry-after` verbatim. Reset values
 * are converted from RFC 3339 ISO timestamp to duration string format per
 * OpenAI official docs.
 *
 * Mapping table (FR-BROKER-C3-02; RESEARCH.md catalog):
 *   anthropic-ratelimit-requests-limit       → x-ratelimit-limit-requests
 *   anthropic-ratelimit-requests-remaining   → x-ratelimit-remaining-requests
 *   anthropic-ratelimit-requests-reset       → x-ratelimit-reset-requests   (duration string)
 *   anthropic-ratelimit-tokens-limit         → x-ratelimit-limit-tokens
 *   anthropic-ratelimit-tokens-remaining     → x-ratelimit-remaining-tokens
 *   anthropic-ratelimit-tokens-reset         → x-ratelimit-reset-tokens     (duration string)
 *
 * Single-namespace per route (T-61-16 mitigation): emits ONLY `x-ratelimit-*`
 * + `retry-after`. Does NOT emit `anthropic-*` on this route — caller MUST
 * NOT also invoke `forwardAnthropicHeaders` on the same response.
 *
 * Caller MUST invoke this BEFORE `res.flushHeaders()` (streaming) or
 * `res.json()` (sync). After flushHeaders, setHeader silently no-ops.
 */
export function translateAnthropicToOpenAIHeaders(upstream: Headers, res: Response): void {
	const directMap: Record<string, string> = {
		'anthropic-ratelimit-requests-limit': 'x-ratelimit-limit-requests',
		'anthropic-ratelimit-requests-remaining': 'x-ratelimit-remaining-requests',
		'anthropic-ratelimit-tokens-limit': 'x-ratelimit-limit-tokens',
		'anthropic-ratelimit-tokens-remaining': 'x-ratelimit-remaining-tokens',
	}
	for (const [from, to] of Object.entries(directMap)) {
		const v = upstream.get(from)
		if (v !== null) res.setHeader(to, v)
	}
	const resetReq = upstream.get('anthropic-ratelimit-requests-reset')
	if (resetReq !== null) {
		res.setHeader('x-ratelimit-reset-requests', rfc3339ToOpenAIDuration(resetReq))
	}
	const resetTok = upstream.get('anthropic-ratelimit-tokens-reset')
	if (resetTok !== null) {
		res.setHeader('x-ratelimit-reset-tokens', rfc3339ToOpenAIDuration(resetTok))
	}
	const ra = upstream.get('retry-after')
	if (ra !== null) res.setHeader('retry-after', ra)
	// input/output/priority variants intentionally not forwarded (no OpenAI
	// equivalent). Phase 63 live verification confirms whether external clients
	// (Open WebUI / Continue.dev / Bolt.diy) would benefit from the split data;
	// if so, a future plan can add a synthesized aggregate.
}

/**
 * Convert an RFC 3339 ISO timestamp to OpenAI duration string format.
 *
 * OpenAI official spec emits:
 *   - `Ns` for sub-minute durations (e.g. `1s`, `45s`)
 *   - `MmSs` for ≥ 60s (e.g. `6m0s`, `12m30s`)
 *
 * Negative durations (reset already passed) and invalid input (Date.parse
 * → NaN) clamp to `'0s'` — broker never emits a malformed duration string
 * that downstream clients might fail to parse. T-61-13 mitigation.
 *
 * Recommendation per RESEARCH.md A1: ship duration string per official docs;
 * if Phase 63 live verification against Open WebUI / Continue.dev / Bolt.diy
 * surfaces parse failures, hot-patch to decimal seconds (Option B in research).
 */
export function rfc3339ToOpenAIDuration(rfc3339: string): string {
	const parsed = Date.parse(rfc3339)
	if (Number.isNaN(parsed)) return '0s'
	const seconds = Math.max(0, Math.floor((parsed - Date.now()) / 1000))
	if (seconds < 60) return `${seconds}s`
	const m = Math.floor(seconds / 60)
	const s = seconds % 60
	return `${m}m${s}s`
}
