// Phase 92-05 — Favicon resolver (pure function).
//
// Picks the best favicon URL from an array of <link rel="..."> candidates,
// resolved against the page's final (post-redirect) base URL.
//
// Precedence chain (CONTEXT.md In-scope #4 + gray-area #5):
//   1. <link rel="icon">         (highest precedence)
//   2. <link rel="apple-touch-icon">
//   3. <link rel="shortcut icon">
//   4. fallback `<baseUrl.origin>/favicon.ico`  (always reachable; never returns null)
//
// Within a tier, prefer the largest declared `sizes` (e.g. 192x192 > 32x32).
// Candidates without `sizes` lose to candidates with any explicit size in
// the same tier, but win over no-candidate-at-all.

import type {FaviconCandidate} from './html-parser.js'

const TIER_ORDER: ReadonlyArray<FaviconCandidate['rel']> = ['icon', 'apple-touch-icon', 'shortcut icon']

// "192x192" → 192. "any" → Infinity (SVG with rel=icon often uses sizes="any"
// to mean "scales to any resolution"). Unparseable → -1 (loses to a numeric).
function parseSizesValue(sizes: string | undefined): number {
	if (!sizes) return 0
	const lower = sizes.trim().toLowerCase()
	if (lower === 'any') return Number.POSITIVE_INFINITY
	// Sizes attr can be space-separated list ("16x16 32x32"). Take the max.
	let best = -1
	for (const part of lower.split(/\s+/)) {
		const m = part.match(/^(\d+)x(\d+)$/)
		if (m) {
			const px = Math.min(Number(m[1]), Number(m[2]))
			if (px > best) best = px
		}
	}
	return best
}

function pickBestInTier(candidates: FaviconCandidate[], rel: FaviconCandidate['rel']): FaviconCandidate | null {
	let best: FaviconCandidate | null = null
	let bestScore = -2 // beats parseSizesValue's -1 unparseable
	for (const c of candidates) {
		if (c.rel !== rel) continue
		const score = parseSizesValue(c.sizes)
		if (score > bestScore) {
			best = c
			bestScore = score
		}
	}
	return best
}

export function resolveFavicon(candidates: FaviconCandidate[], baseUrl: URL): string {
	for (const tier of TIER_ORDER) {
		const winner = pickBestInTier(candidates, tier)
		if (winner) {
			// new URL() handles both absolute (`https://x/y`) and relative
			// (`/foo.png`, `foo.png`) hrefs against the post-redirect base.
			try {
				return new URL(winner.href, baseUrl).toString()
			} catch {
				// Malformed href in a candidate — fall through to the next tier.
				continue
			}
		}
	}
	// Fallback: every web origin reserves /favicon.ico by convention.
	return new URL('/favicon.ico', baseUrl).toString()
}
