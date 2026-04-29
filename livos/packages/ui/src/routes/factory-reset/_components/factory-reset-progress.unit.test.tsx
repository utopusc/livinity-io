// @vitest-environment jsdom
// Phase 38 Plan 04 — FactoryResetProgress smoke + source-text invariants.
//
// We don't full-render the component (it would require a tRPC mock + a router
// + a query-client provider). Instead we assert:
//   1. The module exports `FactoryResetProgress` as a function (smoke).
//   2. Source-text invariants prove the structural wiring matches the plan
//      (refetchInterval=2_000, all 3 lib helpers imported, no auto-redirect on
//      failed/rolled-back, hard navigation via location.href, no Server4/5).

import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC = path.join(__dirname, 'factory-reset-progress.tsx')

describe('FactoryResetProgress smoke', () => {
	it('module exports FactoryResetProgress as a function', async () => {
		const mod = await import('./factory-reset-progress')
		expect(typeof mod.FactoryResetProgress).toBe('function')
	})
})

describe('FactoryResetProgress source-text invariants (D-OV-04 / D-RT-01..03)', () => {
	const src = readFileSync(SRC, 'utf8')

	it('imports listUpdateHistory tRPC query', () => {
		expect(src).toMatch(/system\.listUpdateHistory/)
	})

	it('refetchInterval is POLL_INTERVAL_MS = 2_000 (D-OV-04 / D-BE-03)', () => {
		expect(src).toMatch(/refetchInterval:\s*POLL_INTERVAL_MS/)
		expect(src).toMatch(/POLL_INTERVAL_MS\s*=\s*2_?000/)
	})

	it('uses selectLatestFactoryResetEvent to filter rows', () => {
		expect(src).toMatch(/selectLatestFactoryResetEvent\(/)
	})

	it('uses computePollingDisplayState for the reconnect + 90s logic', () => {
		expect(src).toMatch(/computePollingDisplayState\(/)
	})

	it('uses selectPostResetRoute for the redirect decision', () => {
		expect(src).toMatch(/selectPostResetRoute\(/)
	})

	it('does NOT auto-redirect on status=failed (D-RT-02 — user must read)', () => {
		// The failed branch must render FactoryResetErrorPage (not navigate).
		expect(src).toMatch(/lastKnownEvent\?\.status === 'failed'/)
		expect(src).toMatch(/<FactoryResetErrorPage/)
	})

	it('does NOT auto-redirect on status=rolled-back (D-RT-03 — user must read)', () => {
		expect(src).toMatch(/lastKnownEvent\?\.status === 'rolled-back'/)
		expect(src).toMatch(/<FactoryResetRecoveryPage/)
	})

	it('redirect uses window.location.href (hard navigation to clear state)', () => {
		expect(src).toMatch(/window\.location\.href\s*=\s*route/)
	})

	it('uses BarePage + ProgressLayout for the in-progress overlay', () => {
		expect(src).toMatch(/<BarePage>/)
		expect(src).toMatch(/<ProgressLayout/)
	})

	it('NO references to Server4 or Server5', () => {
		expect(src).not.toContain('Server4')
		expect(src).not.toContain('Server5')
	})
})
