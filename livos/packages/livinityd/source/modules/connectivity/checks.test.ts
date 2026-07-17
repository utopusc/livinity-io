// Phase 333 (DIAG-01/02) — connectivity/checks.ts pure-engine unit tests.

import {describe, expect, it} from 'vitest'

import {
	detectRecoveries,
	detectRegressions,
	foldPersisted,
	regressionSeverity,
	scoreChecks,
	worseStatus,
	type CheckResult,
	type PersistedCheck,
} from './checks.js'

function r(id: string, category: CheckResult['category'], status: CheckResult['status'], at = 1000): CheckResult {
	return {id, category, status, detail: `${id} ${status}`, at}
}

describe('worseStatus', () => {
	it('picks the more severe status', () => {
		expect(worseStatus('pass', 'warn')).toBe('warn')
		expect(worseStatus('warn', 'fail')).toBe('fail')
		expect(worseStatus('fail', 'pass')).toBe('fail')
		expect(worseStatus('pass', 'pass')).toBe('pass')
	})
})

describe('scoreChecks', () => {
	it('empty run scores pass', () => {
		expect(scoreChecks([])).toEqual({overall: 'pass', byCategory: {}, counts: {pass: 0, warn: 0, fail: 0}})
	})
	it('overall = worst; per-category worst; counts', () => {
		const s = scoreChecks([r('dns:main', 'dns', 'pass'), r('cert:main', 'cert', 'warn'), r('ports:443', 'ports', 'fail'), r('dns:sub', 'dns', 'fail')])
		expect(s.overall).toBe('fail')
		expect(s.byCategory).toEqual({dns: 'fail', cert: 'warn', ports: 'fail'})
		expect(s.counts).toEqual({pass: 1, warn: 1, fail: 2})
	})
})

describe('detectRegressions — pass/warn/absent → fail', () => {
	const prev: Record<string, PersistedCheck> = {
		'dns:main': {status: 'pass', at: 1},
		'cert:main': {status: 'warn', at: 1},
		'ports:443': {status: 'fail', at: 1},
	}
	it('flags a check that newly failed (pass→fail and warn→fail)', () => {
		const reg = detectRegressions(prev, [r('dns:main', 'dns', 'fail'), r('cert:main', 'cert', 'fail')])
		expect(reg.map((x) => x.id).sort()).toEqual(['cert:main', 'dns:main'])
	})
	it('does NOT flag a check that was already failing (still fail = not fresh)', () => {
		const reg = detectRegressions(prev, [r('ports:443', 'ports', 'fail')])
		expect(reg).toEqual([])
	})
	it('flags a brand-new (absent-before) failing check', () => {
		const reg = detectRegressions(prev, [r('tunnel:cf', 'tunnel', 'fail')])
		expect(reg.map((x) => x.id)).toEqual(['tunnel:cf'])
	})
	it('ignored ids never regress-alert even when they fail', () => {
		const reg = detectRegressions(prev, [r('dns:main', 'dns', 'fail')], ['dns:main'])
		expect(reg).toEqual([])
	})
	it('warn is not a regression (only fail is)', () => {
		const reg = detectRegressions(prev, [r('dns:main', 'dns', 'warn')])
		expect(reg).toEqual([])
	})
})

describe('detectRecoveries — prior fail → pass/warn', () => {
	const prev: Record<string, PersistedCheck> = {'ports:443': {status: 'fail', at: 1}, 'dns:main': {status: 'pass', at: 1}}
	it('flags a previously-failing check that is now pass or warn', () => {
		expect(detectRecoveries(prev, [r('ports:443', 'ports', 'pass')]).map((x) => x.id)).toEqual(['ports:443'])
		expect(detectRecoveries(prev, [r('ports:443', 'ports', 'warn')]).map((x) => x.id)).toEqual(['ports:443'])
	})
	it('a still-failing or never-failed check does not recover', () => {
		expect(detectRecoveries(prev, [r('ports:443', 'ports', 'fail')])).toEqual([])
		expect(detectRecoveries(prev, [r('dns:main', 'dns', 'pass')])).toEqual([])
	})
	it('ignored ids excluded', () => {
		expect(detectRecoveries(prev, [r('ports:443', 'ports', 'pass')], ['ports:443'])).toEqual([])
	})
})

describe('regressionSeverity', () => {
	it('dns/cert/tunnel fail → critical', () => {
		expect(regressionSeverity([r('dns:main', 'dns', 'fail')])).toBe('critical')
		expect(regressionSeverity([r('cert:main', 'cert', 'fail')])).toBe('critical')
		expect(regressionSeverity([r('tunnel:cf', 'tunnel', 'fail')])).toBe('critical')
	})
	it('only ports/mail fail → warning', () => {
		expect(regressionSeverity([r('ports:443', 'ports', 'fail'), r('mail:mx', 'mail', 'fail')])).toBe('warning')
	})
})

describe('foldPersisted', () => {
	it('maps results to persisted-check shape', () => {
		expect(foldPersisted([r('dns:main', 'dns', 'pass', 42)])).toEqual({'dns:main': {status: 'pass', at: 42, detail: 'dns:main pass'}})
	})
})
