// Phase 38 Plan 04 — selectPostResetRoute unit tests (D-RT-01).
//
// Locks the routing decision: success+preserveApiKey splits /login vs
// /onboarding; everything else stays put.

import {describe, expect, it} from 'vitest'

import {selectPostResetRoute} from './post-reset-redirect'
import type {FactoryResetEvent} from './types'

const base: FactoryResetEvent = {
	type: 'factory-reset',
	status: 'success',
	started_at: '2026-04-29T12:00:00Z',
	ended_at: '2026-04-29T12:08:00Z',
	preserveApiKey: true,
	wipe_duration_ms: 12_000,
	reinstall_duration_ms: 410_000,
	install_sh_exit_code: 0,
	install_sh_source: 'live',
	snapshot_path: '/tmp/livos-pre-reset.tar.gz',
	error: null,
}

describe('selectPostResetRoute (D-RT-01)', () => {
	it('null event → "stay"', () => {
		expect(selectPostResetRoute(null)).toBe('stay')
	})

	it('success + preserveApiKey:true → "/login"', () => {
		expect(selectPostResetRoute({...base, preserveApiKey: true})).toBe('/login')
	})

	it('success + preserveApiKey:false → "/onboarding"', () => {
		expect(selectPostResetRoute({...base, preserveApiKey: false})).toBe('/onboarding')
	})

	it('in-progress → "stay" (no redirect mid-reset)', () => {
		expect(
			selectPostResetRoute({...base, status: 'in-progress', ended_at: null}),
		).toBe('stay')
	})

	it('failed → "stay" (error page handles it; overlay must not auto-redirect)', () => {
		expect(
			selectPostResetRoute({
				...base,
				status: 'failed',
				error: 'install-sh-failed',
				install_sh_exit_code: 42,
			}),
		).toBe('stay')
	})

	it('rolled-back → "stay" (recovery page handles it; user must read)', () => {
		expect(
			selectPostResetRoute({
				...base,
				status: 'rolled-back',
				error: 'install-sh-failed',
				install_sh_exit_code: 42,
			}),
		).toBe('stay')
	})

	it('failed + preserveApiKey:true still stays (status takes precedence over preserve flag)', () => {
		expect(
			selectPostResetRoute({
				...base,
				status: 'failed',
				preserveApiKey: true,
				error: 'api-key-401',
			}),
		).toBe('stay')
	})
})
