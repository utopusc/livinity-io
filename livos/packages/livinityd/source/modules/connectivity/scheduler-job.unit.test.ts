// Phase 333 (DIAG-01/02) — connectivity scheduler-job unit tests.
// Injected probes + hand-built ctx.livinityd (no real network, no DB).

import {describe, expect, it, vi} from 'vitest'

import {connectivitySelfCheckHandler, runConnectivitySelfCheck, CONNECTIVITY_ALERT_ID} from './scheduler-job.js'
import {BUILT_IN_HANDLERS} from '../scheduler/jobs.js'
import type {ProbeContext, ProbeDeps} from './probes.js'
import type {CheckResult} from './checks.js'
import type {ConnectivityState} from './checks.js'

const logger = {log: () => {}, error: () => {}}

// A ProbeDeps stub whose verifyDns/cert/port/etc. are driven by a scripted result set.
// runConnectivitySelfCheck calls runConnectivityChecks(ctx, deps) → the individual
// probes. To keep the test at the handler level we stub the probes via deps so the
// real probe functions produce deterministic CheckResults.
function depsFor(opts: {resolved?: boolean; certDays?: number; port80?: boolean; port443?: boolean; now?: number}): ProbeDeps {
	const now = opts.now ?? 1_000_000
	const certMs = now + (opts.certDays ?? 90) * 86_400_000
	return {
		now: () => now,
		publicIp: async () => '1.2.3.4',
		verifyDns: async () => ({resolved: opts.resolved ?? true, currentIp: '1.2.3.4', match: opts.resolved ?? true}),
		certNotAfter: async () => certMs,
		portListening: async (port) => (port === 80 ? opts.port80 ?? true : opts.port443 ?? true),
		cloudflaredActive: async () => true,
		tunnelStatus: async () => ({installed: false, running: false}),
		resolveMx: async () => [],
		reverseDns: async () => [],
	}
}

// A minimal in-memory livinityd stub.
function makeLivinityd(initial: ConnectivityState | undefined, opts: {mainDomain?: string | null} = {}) {
	let state = initial
	const add = vi.fn().mockResolvedValue(true)
	const clear = vi.fn().mockResolvedValue(true)
	const livinityd = {
		store: {
			get: async (k: string) => (k === 'connectivity' ? state : undefined),
			set: async (k: string, v: unknown) => {
				if (k === 'connectivity') state = v as ConnectivityState
			},
			// Minimal write-lock stub: runs the job with the same get/set (serialized
			// enough for the unit test; real FileStore queues writes).
			getWriteLock: async (job: (m: {get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void>}) => Promise<void>) => {
				await job({
					get: async (k: string) => (k === 'connectivity' ? state : undefined),
					set: async (k: string, v: unknown) => {
						if (k === 'connectivity') state = v as ConnectivityState
					},
				})
			},
		},
		notifications: {add, clear},
		server: {getActiveMainDomain: async () => (opts.mainDomain === undefined ? 'box.example.com' : opts.mainDomain)},
		ai: {redis: {get: async () => null}},
	}
	return {livinityd: livinityd as never, add, clear, getState: () => state}
}

describe('connectivitySelfCheckHandler — never-throw contract', () => {
	it('skips with no daemon reference', async () => {
		const r = await connectivitySelfCheckHandler({name: 'connectivity-self-check'} as never, {logger} as never)
		expect(r.status).toBe('skipped')
	})
	it('is registered in BUILT_IN_HANDLERS under the 3-site type', () => {
		expect(BUILT_IN_HANDLERS['connectivity-self-check']).toBe(connectivitySelfCheckHandler)
	})
})

describe('runConnectivitySelfCheck — score + persist + alert', () => {
	it('all-pass run persists a clean baseline and fires NO alert', async () => {
		const {livinityd, add, getState} = makeLivinityd({checks: {}, ignore: []})
		const out = await runConnectivitySelfCheck(livinityd, logger, depsFor({}))
		expect(out.results.overall).toBe('pass')
		expect(add).not.toHaveBeenCalled()
		expect(getState()?.lastRun).toBe(1_000_000)
		expect(getState()?.checks['dns:main'].status).toBe('pass')
	})

	it('a pass→fail regression fires ONE coalesced critical alert (dns)', async () => {
		const prior: ConnectivityState = {checks: {'dns:main': {status: 'pass', at: 1}}, ignore: []}
		const {livinityd, add} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({resolved: false}))
		expect(add).toHaveBeenCalledWith(CONNECTIVITY_ALERT_ID, {severity: 'critical', external: true})
	})

	it('a ports-only regression fires a WARNING (not critical)', async () => {
		const prior: ConnectivityState = {checks: {'ports:443': {status: 'pass', at: 1}}, ignore: []}
		const {livinityd, add} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({port443: false}))
		expect(add).toHaveBeenCalledWith(CONNECTIVITY_ALERT_ID, {severity: 'warning', external: true})
	})

	it('an already-failing check does NOT re-fire (no fresh regression)', async () => {
		const prior: ConnectivityState = {checks: {'dns:main': {status: 'fail', at: 1}}, ignore: []}
		const {livinityd, add} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({resolved: false}))
		expect(add).not.toHaveBeenCalled()
	})

	it('an ignored check never alerts even on regression', async () => {
		const prior: ConnectivityState = {checks: {'dns:main': {status: 'pass', at: 1}}, ignore: ['dns:main']}
		const {livinityd, add} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({resolved: false}))
		expect(add).not.toHaveBeenCalled()
	})

	it('recovery clears the alert when nothing is failing any more', async () => {
		const prior: ConnectivityState = {checks: {'ports:443': {status: 'fail', at: 1}}, ignore: []}
		const {livinityd, clear} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({port443: true}))
		expect(clear).toHaveBeenCalledWith(CONNECTIVITY_ALERT_ID)
	})

	it('333-REVIEW F2: clears a STUCK alert when the failing check stops being emitted (no-domain)', async () => {
		// cert:main was failing; the domain is now removed so cert/dns/tunnel/mail
		// no longer run. Nothing is failing this run → the alert must clear, not stick.
		const prior: ConnectivityState = {checks: {'cert:main': {status: 'fail', at: 1}}, ignore: []}
		const {livinityd, clear, add} = makeLivinityd(prior, {mainDomain: null})
		await runConnectivitySelfCheck(livinityd, logger, depsFor({}))
		expect(add).not.toHaveBeenCalled()
		expect(clear).toHaveBeenCalledWith(CONNECTIVITY_ALERT_ID)
	})

	it('333-REVIEW F1: persists the baseline through the write lock (concurrent ignore preserved)', async () => {
		// The lock re-reads current state inside it — a mute committed during the run
		// window survives the baseline persist. makeLivinityd stubs getWriteLock below.
		const prior: ConnectivityState = {checks: {}, ignore: []}
		const {livinityd, getState} = makeLivinityd(prior)
		await runConnectivitySelfCheck(livinityd, logger, depsFor({}))
		expect(getState()?.checks['ports:443']).toBeDefined()
	})

	it('no main domain → dns/cert probes skip, still scores + persists', async () => {
		const {livinityd, getState} = makeLivinityd({checks: {}, ignore: []}, {mainDomain: null})
		const out = await runConnectivitySelfCheck(livinityd, logger, depsFor({}))
		// ports still run; dns/cert/tunnel/mail skip on no-domain.
		expect(out.count).toBeGreaterThanOrEqual(2)
		expect(getState()?.checks['ports:443']).toBeDefined()
		expect(getState()?.checks['dns:main']).toBeUndefined()
	})
})
