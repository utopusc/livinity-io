// Phase 75-05 — MermaidBlock pure-helper + source-text invariant tests.
//
// Coverage scope (per plan 75-05 must-haves: 3+ tests using source-text
// invariants):
//   1. generateMermaidId — returns a string with the 'liv-mermaid-' prefix.
//   2. generateMermaidId — returns unique values across calls.
//   3. MERMAID_CDN constant — matches the URL used in canvas-iframe.tsx.
//   4. Source-text invariant — file references the CDN URL.
//   5. Source-text invariant — file guards against duplicate window.mermaid loads.
//   6. Source-text invariant — file uses a singleton promise for the script load.
//
// RTL is NOT installed in the UI package (see liv-streaming-text.unit.test.tsx
// for the canonical "RTL absent" posture); component DOM render is exercised
// in the 75-07 wire-up plan.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

import {MERMAID_CDN, generateMermaidId} from './mermaid-block'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

describe('generateMermaidId', () => {
	it("returns a string with the 'liv-mermaid-' prefix", () => {
		const id = generateMermaidId()
		expect(typeof id).toBe('string')
		expect(id.startsWith('liv-mermaid-')).toBe(true)
	})

	it('returns unique values across calls', () => {
		const ids = new Set<string>()
		for (let i = 0; i < 50; i++) ids.add(generateMermaidId())
		// 50 calls of a 36^N suffix should never collide in practice.
		expect(ids.size).toBe(50)
	})

	it('produces a non-trivial random suffix (length > prefix)', () => {
		const id = generateMermaidId()
		expect(id.length).toBeGreaterThan('liv-mermaid-'.length)
	})
})

describe('MERMAID_CDN constant', () => {
	it('matches the mermaid@10 CDN URL used in canvas-iframe.tsx', () => {
		// Plan 75-05 hard rule: do NOT add mermaid as an npm dep — reuse the
		// existing CDN URL from canvas-iframe.tsx so both load paths converge.
		expect(MERMAID_CDN).toBe(
			'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
		)
	})

	it('uses jsdelivr (matches existing canvas-iframe.tsx convention)', () => {
		expect(MERMAID_CDN).toContain('cdn.jsdelivr.net')
		expect(MERMAID_CDN).toContain('mermaid@10')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Source-text invariants
// ─────────────────────────────────────────────────────────────────────

describe('mermaid-block.tsx source-text invariants', () => {
	const src = readFileSync(
		resolve(__dirname, 'mermaid-block.tsx'),
		'utf8',
	)

	it('references the jsdelivr CDN URL for mermaid@10', () => {
		expect(src).toContain('cdn.jsdelivr.net')
		expect(src).toContain('mermaid@10')
	})

	it('guards against duplicate window.mermaid loads', () => {
		// Idempotency requirement: must check window.mermaid before injecting.
		expect(src).toMatch(/window\s+as\s+any[\s\S]*?\.mermaid/)
	})

	it('uses a singleton promise for the script load (mermaidScriptPromise)', () => {
		expect(src).toContain('mermaidScriptPromise')
	})

	it('initializes mermaid with startOnLoad: false so we drive render manually', () => {
		expect(src).toContain('startOnLoad: false')
	})

	it('renders an error fallback <pre> when render() throws', () => {
		// Plan 75-05 must-have: render errors fall back to plain <pre> with red
		// border + tooltip.
		expect(src).toContain('Mermaid render failed')
		expect(src).toContain('rose-500')
	})
})
