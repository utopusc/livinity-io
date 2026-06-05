/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 260-01 (SC1) — apps.state transient-state Docker reconciliation.
//
// The admin/single-user `apps.state` query (routes.ts) used to return the raw
// in-memory `app.state` field. When that field wedged on a transient value
// ('restarting'/'uninstalling') — e.g. a throw inside restart()/uninstall() or
// a livinityd restart mid-flight — the grid rendered a perpetual sliding-loader
// and the tile became un-clickable.
//
// The fix reconciles transient states against the real Docker container status.
// These tests exercise the pure reconcile helper (the logic the query calls),
// mocking the `docker inspect` runner so no real Docker is required.
import {describe, it, expect, vi} from 'vitest'
import {
	TRANSIENT_APP_STATES,
	isTransientAppState,
	reconcileTransientAppState,
} from './app-state-reconcile.js'

describe('apps.state transient-state reconciliation (Phase 260-01 SC1)', () => {
	describe('isTransientAppState / TRANSIENT_APP_STATES', () => {
		it('treats restarting and uninstalling as transient', () => {
			expect(TRANSIENT_APP_STATES).toContain('restarting')
			expect(TRANSIENT_APP_STATES).toContain('uninstalling')
			expect(isTransientAppState('restarting')).toBe(true)
			expect(isTransientAppState('uninstalling')).toBe(true)
		})

		it('treats stable states as non-transient', () => {
			for (const stable of ['ready', 'running', 'stopped', 'unknown', 'not-installed']) {
				expect(isTransientAppState(stable)).toBe(false)
			}
		})
	})

	describe('reconcileTransientAppState', () => {
		it('Given app.state is "restarting" and the container is running → returns "running"', async () => {
			const inspect = vi.fn().mockResolvedValue('running')
			const result = await reconcileTransientAppState('restarting', ['hermes_web_1'], inspect)
			expect(result).toEqual({state: 'running', progress: 0})
			expect(inspect).toHaveBeenCalled()
		})

		it('Given app.state is "uninstalling" and docker inspect throws (container gone) → returns a stable non-transient state, NOT "uninstalling"', async () => {
			const inspect = vi.fn().mockRejectedValue(new Error('No such container'))
			const result = await reconcileTransientAppState('uninstalling', ['gone_web_1'], inspect)
			expect(result.state).not.toBe('uninstalling')
			expect(isTransientAppState(result.state)).toBe(false)
			// Container gone during an uninstall → app is effectively not-installed.
			expect(result.state).toBe('not-installed')
		})

		it('Given app.state is "restarting" and docker inspect throws → returns a stable clickable state ("ready"), NOT "restarting"', async () => {
			const inspect = vi.fn().mockRejectedValue(new Error('No such container'))
			const result = await reconcileTransientAppState('restarting', ['x_web_1'], inspect)
			expect(result.state).not.toBe('restarting')
			expect(isTransientAppState(result.state)).toBe(false)
			expect(result.state).toBe('ready')
		})

		it('Given a stable app.state → returns it unchanged WITHOUT calling docker inspect (no perf regression on the 2s poll)', async () => {
			const inspect = vi.fn().mockResolvedValue('running')
			const result = await reconcileTransientAppState('ready', ['x_web_1'], inspect)
			expect(result).toEqual({state: 'ready', progress: 0})
			expect(inspect).not.toHaveBeenCalled()
		})

		it('maps exited→stopped and created→ready container statuses', async () => {
			const exited = await reconcileTransientAppState(
				'restarting',
				['x_web_1'],
				vi.fn().mockResolvedValue('exited'),
			)
			expect(exited.state).toBe('stopped')

			const created = await reconcileTransientAppState(
				'restarting',
				['x_web_1'],
				vi.fn().mockResolvedValue('created'),
			)
			expect(created.state).toBe('ready')
		})

		it('treats ANY running container in a multi-service app as running', async () => {
			// First container is down, second is up → app is up.
			const inspect = vi
				.fn()
				.mockResolvedValueOnce('exited')
				.mockResolvedValueOnce('running')
			const result = await reconcileTransientAppState('restarting', ['a_1', 'b_1'], inspect)
			expect(result.state).toBe('running')
		})
	})
})
