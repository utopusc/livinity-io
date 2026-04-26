// TODO: Re-enable strict TS once update.ts rewrite (Task 2) lands.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {EventEmitter} from 'node:events'
import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'

import * as execa from 'execa'

import Livinityd from '../../index.js'
import system from './routes.js'

// vi.mock('execa') so performUpdate's $ call is hijackable. We don't mock fs
// here because the CONFLICT test never reaches getLatestRelease.
vi.mock('execa')

function makeNeverResolvingProc() {
	const stdout = new EventEmitter() as EventEmitter & {on: any}
	const stderr = new EventEmitter() as EventEmitter & {on: any}
	const p: any = new Promise(() => {})
	p.stdout = stdout
	p.stderr = stderr
	return p
}

describe('system.update — CONFLICT guard (Phase 30 UPD-02)', () => {
	let router: any

	beforeEach(() => {
		const livinityd = new Livinityd({dataDirectory: '/tmp'})
		router = system.createCaller({
			livinityd,
			logger: {error() {}},
			dangerouslyBypassAuthentication: true,
		} as any)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('throws CONFLICT when a prior update is still in flight', async () => {
		// First call's performUpdate awaits this proc forever, holding
		// systemStatus === 'updating'. Second call must early-throw.
		const taggedInvoker: any = vi.fn(() => makeNeverResolvingProc())
		vi.mocked(execa.$ as any).mockImplementation(((_opts: any) => taggedInvoker) as any)

		// Kick off first update — never resolves by design.
		const first = router.update().catch(() => {
			/* swallow */
		})
		// Yield twice so systemStatus = 'updating' settles.
		await Promise.resolve()
		await Promise.resolve()

		// Second invocation must reject with TRPCError code 'CONFLICT'.
		await expect(router.update()).rejects.toMatchObject({code: 'CONFLICT'})

		// Don't await `first` — by design it never resolves.
		void first
	})
})
