// @vitest-environment jsdom
//
// Phase 258 Plan 258-04 (WS-D) — PublicAccessSection logic tests.
//
// `@testing-library/react` is NOT installed in this UI package (repo convention,
// see update-notification.unit.test.ts). So we unit-test the pure, load-bearing
// presentation logic (forbidden-reason copy + the whole-app confirm text that
// surfaces the no-LivOS-login risk) and smoke-import the component. The full
// visual/interaction contract is the operator UAT checkpoint (258-05 walk).

import {describe, expect, it} from 'vitest'

import {PublicAccessSection, forbiddenReasonCopy, wholeAppConfirmText} from './public-access-section'

describe('forbiddenReasonCopy', () => {
	it('maps each server reason to friendly, self-explaining copy', () => {
		expect(forbiddenReasonCopy('never-public')).toMatch(/never-public admin app/i)
		expect(forbiddenReasonCopy('daemon-bearer')).toMatch(/daemon token/i)
		expect(forbiddenReasonCopy('docker-sock')).toMatch(/Docker socket/i)
		expect(forbiddenReasonCopy('privileged')).toMatch(/privileged/i)
		expect(forbiddenReasonCopy('host-network')).toMatch(/host network/i)
		expect(forbiddenReasonCopy('local-ai-clis')).toMatch(/AI CLIs/i)
	})

	it("never returns an empty string and always explains it can't be public", () => {
		const all = ['never-public', 'daemon-bearer', 'docker-sock', 'privileged', 'host-network', 'local-ai-clis', undefined, 'something-new'] as const
		for (const r of all) {
			const copy = forbiddenReasonCopy(r as string | undefined)
			expect(copy.length).toBeGreaterThan(0)
			expect(copy).toMatch(/can't be made public/i)
		}
	})
})

describe('wholeAppConfirmText', () => {
	it('states the no-LivOS-login risk and the own-login situation (SC2)', () => {
		const withAuth = wholeAppConfirmText('Cal.com', true)
		expect(withAuth).toContain('without logging into LivOS')
		expect(withAuth).toContain('Cal.com has its own login')
		expect(withAuth).toMatch(/Continue\?$/)

		const noAuth = wholeAppConfirmText('Some Dashboard', false)
		expect(noAuth).toContain('Some Dashboard has no detected login')
		expect(noAuth).toContain('without logging into LivOS')
	})
})

describe('PublicAccessSection', () => {
	it('is exported and renderable', () => {
		expect(PublicAccessSection).toBeDefined()
		expect(typeof PublicAccessSection).toBe('function')
	})
})
