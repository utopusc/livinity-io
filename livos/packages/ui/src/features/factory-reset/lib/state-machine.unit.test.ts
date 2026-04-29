// Phase 38 Plan 01 — D-OV-03 state-machine derivation tests.
//
// Locked-down behaviour: deriveFactoryResetState(event) must return the
// correct sub-state for every valid combination of (status, wipe_duration_ms,
// reinstall_duration_ms) the Phase 37 bash can write to the JSON event row.

import {describe, expect, it} from 'vitest'

import {deriveFactoryResetState, stateLabel} from './state-machine'
import type {FactoryResetEvent} from './types'

const baseEvent: FactoryResetEvent = {
	type: 'factory-reset',
	status: 'in-progress',
	started_at: '2026-04-29T12:00:30Z',
	ended_at: null,
	preserveApiKey: true,
	wipe_duration_ms: 0,
	reinstall_duration_ms: 0,
	install_sh_exit_code: null,
	install_sh_source: null,
	snapshot_path: '/tmp/livos-pre-reset.tar.gz',
	error: null,
}

describe('deriveFactoryResetState (D-OV-03)', () => {
	it('null event → "unknown"', () => {
		expect(deriveFactoryResetState(null)).toBe('unknown')
	})

	it('in-progress + wipe=0 → stopping-services', () => {
		expect(
			deriveFactoryResetState({...baseEvent, status: 'in-progress', wipe_duration_ms: 0}),
		).toBe('stopping-services')
	})

	it('in-progress + wipe>0 + reinstall=0 → fetching-install-sh', () => {
		expect(
			deriveFactoryResetState({
				...baseEvent,
				status: 'in-progress',
				wipe_duration_ms: 5_000,
				reinstall_duration_ms: 0,
			}),
		).toBe('fetching-install-sh')
	})

	it('in-progress + wipe>0 + reinstall>0 → reinstalling', () => {
		expect(
			deriveFactoryResetState({
				...baseEvent,
				status: 'in-progress',
				wipe_duration_ms: 5_000,
				reinstall_duration_ms: 1_000,
			}),
		).toBe('reinstalling')
	})

	it('status=success → success', () => {
		expect(
			deriveFactoryResetState({
				...baseEvent,
				status: 'success',
				wipe_duration_ms: 5_000,
				reinstall_duration_ms: 120_000,
				ended_at: '2026-04-29T12:02:35Z',
			}),
		).toBe('success')
	})

	it('status=failed → failed', () => {
		expect(
			deriveFactoryResetState({
				...baseEvent,
				status: 'failed',
				error: 'install-sh-failed',
				install_sh_exit_code: 42,
			}),
		).toBe('failed')
	})

	it('status=rolled-back → rolled-back', () => {
		expect(
			deriveFactoryResetState({
				...baseEvent,
				status: 'rolled-back',
				error: 'install-sh-failed',
				install_sh_exit_code: 42,
			}),
		).toBe('rolled-back')
	})
})

describe('stateLabel', () => {
	it('reinstalling label includes the install_sh_source', () => {
		expect(stateLabel('reinstalling', 'live')).toContain('live')
		expect(stateLabel('reinstalling', 'cache')).toContain('cache')
	})

	it('reinstalling label defaults to "live" when source is null', () => {
		expect(stateLabel('reinstalling', null)).toContain('live')
	})

	it('stopping-services label mentions stashing API key', () => {
		expect(stateLabel('stopping-services', null)).toContain('stashing API key')
	})

	it('fetching-install-sh label mentions Wipe complete + install.sh', () => {
		const label = stateLabel('fetching-install-sh', null)
		expect(label).toContain('Wipe complete')
		expect(label).toContain('install.sh')
	})

	it('success label mentions Reinstall complete', () => {
		expect(stateLabel('success', null)).toContain('Reinstall complete')
	})

	it('failed label mentions Reinstall failed', () => {
		expect(stateLabel('failed', null)).toContain('Reinstall failed')
	})

	it('rolled-back label mentions pre-reset snapshot', () => {
		expect(stateLabel('rolled-back', null)).toContain('pre-reset snapshot')
	})

	it('unknown → Connecting to LivOS…', () => {
		expect(stateLabel('unknown', null)).toContain('Connecting')
	})

	it('every label is a non-empty string', () => {
		const states = [
			'stopping-services',
			'fetching-install-sh',
			'reinstalling',
			'success',
			'failed',
			'rolled-back',
			'unknown',
		] as const
		for (const s of states) {
			expect(stateLabel(s, null).length).toBeGreaterThan(0)
		}
	})
})
