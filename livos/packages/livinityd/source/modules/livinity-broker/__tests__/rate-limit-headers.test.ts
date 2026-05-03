/**
 * Phase 61 Plan 04 Wave 0 — RED unit tests for rate-limit-headers.ts
 * (implementation lands in Task 2 — turns these GREEN).
 *
 * Pure-function unit tests covering:
 *   - forwardAnthropicHeaders — prefix-loop forward of all anthropic-* + retry-after,
 *     drop hop-by-hop / body-framing headers (RESEARCH.md Pitfall 3).
 *   - translateAnthropicToOpenAIHeaders — map 6 canonical Anthropic headers to
 *     x-ratelimit-* OpenAI namespace; drop input/output/priority variants;
 *     preserve retry-after verbatim (FR-BROKER-C3-02).
 *   - rfc3339ToOpenAIDuration — RFC 3339 ISO timestamp → 'Ns' or 'MmSs' duration
 *     string per OpenAI official spec (NOT Unix seconds — RESEARCH.md A1).
 *
 * Initially RED: rate-limit-headers.ts does not yet exist.
 */

import {describe, it, expect} from 'vitest'
import {
	forwardAnthropicHeaders,
	translateAnthropicToOpenAIHeaders,
	rfc3339ToOpenAIDuration,
} from '../rate-limit-headers.js'

class FakeRes {
	private headers = new Map<string, string | number | string[]>()
	setHeader(k: string, v: any) {
		this.headers.set(k.toLowerCase(), v)
	}
	getHeader(k: string) {
		return this.headers.get(k.toLowerCase())
	}
	hasHeader(k: string) {
		return this.headers.has(k.toLowerCase())
	}
	get headerKeys() {
		return [...this.headers.keys()]
	}
}

describe('forwardAnthropicHeaders (FR-BROKER-C3-01)', () => {
	it('forwards all anthropic-* + retry-after; drops content-length and date', () => {
		const upstream = new Headers([
			['anthropic-ratelimit-requests-remaining', '59'],
			['anthropic-ratelimit-tokens-remaining', '149984'],
			['anthropic-priority-input-tokens-limit', '1000'],
			['retry-after', '30'],
			['content-length', '250'],
			['date', 'Mon, 02 May 2026 20:00:00 GMT'],
		])
		const res = new FakeRes() as any
		forwardAnthropicHeaders(upstream, res)
		expect(res.getHeader('anthropic-ratelimit-requests-remaining')).toBe('59')
		expect(res.getHeader('anthropic-ratelimit-tokens-remaining')).toBe('149984')
		expect(res.getHeader('anthropic-priority-input-tokens-limit')).toBe('1000')
		expect(res.getHeader('retry-after')).toBe('30')
		expect(res.hasHeader('content-length')).toBe(false)
		expect(res.hasHeader('date')).toBe(false)
	})

	it('forwards future anthropic-* headers via prefix loop (no enumeration)', () => {
		// Future-proofing: if Anthropic adds anthropic-fast-tier-remaining, broker
		// forwards it without code change. Critical for FR-BROKER-C3-01 truth claim.
		const upstream = new Headers([
			['anthropic-fast-tier-remaining', '999'],
			['anthropic-experimental-feature-flag', 'beta'],
		])
		const res = new FakeRes() as any
		forwardAnthropicHeaders(upstream, res)
		expect(res.getHeader('anthropic-fast-tier-remaining')).toBe('999')
		expect(res.getHeader('anthropic-experimental-feature-flag')).toBe('beta')
	})

	it('does not forward non-anthropic headers (e.g. x-amzn-trace-id)', () => {
		const upstream = new Headers([
			['x-amzn-trace-id', 'Root=1-2345'],
			['server', 'cloudflare'],
		])
		const res = new FakeRes() as any
		forwardAnthropicHeaders(upstream, res)
		expect(res.hasHeader('x-amzn-trace-id')).toBe(false)
		expect(res.hasHeader('server')).toBe(false)
	})
})

describe('translateAnthropicToOpenAIHeaders (FR-BROKER-C3-02)', () => {
	it('translates all 6 canonical headers; reset values are duration strings', () => {
		const future = new Date(Date.now() + 360_000).toISOString() // 6 minutes from now
		const upstream = new Headers([
			['anthropic-ratelimit-requests-limit', '60'],
			['anthropic-ratelimit-requests-remaining', '59'],
			['anthropic-ratelimit-requests-reset', future],
			['anthropic-ratelimit-tokens-limit', '150000'],
			['anthropic-ratelimit-tokens-remaining', '149984'],
			['anthropic-ratelimit-tokens-reset', future],
		])
		const res = new FakeRes() as any
		translateAnthropicToOpenAIHeaders(upstream, res)
		expect(res.getHeader('x-ratelimit-limit-requests')).toBe('60')
		expect(res.getHeader('x-ratelimit-remaining-requests')).toBe('59')
		expect(res.getHeader('x-ratelimit-limit-tokens')).toBe('150000')
		expect(res.getHeader('x-ratelimit-remaining-tokens')).toBe('149984')
		const resetReq = String(res.getHeader('x-ratelimit-reset-requests'))
		const resetTok = String(res.getHeader('x-ratelimit-reset-tokens'))
		expect(resetReq).toMatch(/^([0-9]+s|[0-9]+m[0-9]+s)$/)
		expect(resetTok).toMatch(/^([0-9]+s|[0-9]+m[0-9]+s)$/)
	})

	it('drops input/output split + priority headers (no OpenAI equivalent)', () => {
		const upstream = new Headers([
			['anthropic-ratelimit-input-tokens-remaining', '5000'],
			['anthropic-ratelimit-output-tokens-remaining', '5000'],
			['anthropic-priority-input-tokens-limit', '1000'],
		])
		const res = new FakeRes() as any
		translateAnthropicToOpenAIHeaders(upstream, res)
		expect(res.headerKeys.find((k) => k.startsWith('x-ratelimit-input-'))).toBeUndefined()
		expect(res.headerKeys.find((k) => k.startsWith('x-ratelimit-output-'))).toBeUndefined()
		expect(res.headerKeys.find((k) => k.startsWith('x-ratelimit-priority-'))).toBeUndefined()
	})

	it('preserves retry-after verbatim (FR-BROKER-C3-03)', () => {
		const upstream = new Headers([['retry-after', '30']])
		const res = new FakeRes() as any
		translateAnthropicToOpenAIHeaders(upstream, res)
		expect(res.getHeader('retry-after')).toBe('30')
	})

	it('does NOT emit anthropic-* headers (single-namespace per route)', () => {
		// T-61-16 spoofing mitigation: OpenAI route should emit ONLY x-ratelimit-*,
		// never both anthropic-* AND x-ratelimit-* (client confused by two signals).
		const upstream = new Headers([
			['anthropic-ratelimit-requests-limit', '60'],
			['anthropic-ratelimit-requests-remaining', '59'],
		])
		const res = new FakeRes() as any
		translateAnthropicToOpenAIHeaders(upstream, res)
		expect(res.headerKeys.find((k) => k.startsWith('anthropic-'))).toBeUndefined()
	})
})

describe('rfc3339ToOpenAIDuration', () => {
	it('emits "Ns" when < 60s', () => {
		const t = new Date(Date.now() + 45_000).toISOString()
		// Allow 1s drift due to test execution time.
		expect(rfc3339ToOpenAIDuration(t)).toMatch(/^4[345]s$/)
	})

	it('emits "MmSs" when ≥ 60s', () => {
		const t = new Date(Date.now() + 360_000).toISOString()
		// 360s = 6m0s; allow drift to 5m58s/5m59s/6m0s.
		expect(rfc3339ToOpenAIDuration(t)).toMatch(/^(5m5[89]s|6m0s)$/)
	})

	it('clamps negative durations to "0s"', () => {
		const t = new Date(Date.now() - 10_000).toISOString()
		expect(rfc3339ToOpenAIDuration(t)).toBe('0s')
	})

	it('returns "0s" for invalid input (T-61-13 mitigation)', () => {
		expect(rfc3339ToOpenAIDuration('not-a-date')).toBe('0s')
	})

	it('returns "0s" for empty string', () => {
		expect(rfc3339ToOpenAIDuration('')).toBe('0s')
	})
})
