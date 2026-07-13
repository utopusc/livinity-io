// Phase 311 UPDSAFE-01 — offline unit proof of the beta-channel semver-max
// selector. PURE function (no Redis/Docker/network), so this runs offline
// unlike the env-blocked integration suites. Follows the module's *.unit.test.ts
// convention.
import {describe, it, expect} from 'vitest'

import {pickMaxReleaseTag} from './update.js'

describe('pickMaxReleaseTag (311-01 UPDSAFE-01)', () => {
	it('picks the semver-max tag including a prerelease', () => {
		expect(pickMaxReleaseTag(['v44.1', 'v44.2-beta.1', 'v44.0'])).toBe('v44.2-beta.1')
	})

	it('returns the original tag string, not the coerced form', () => {
		const result = pickMaxReleaseTag(['v44.1', 'v44.2-beta.1', 'v44.0'])
		// retains the leading 'v' and the -beta suffix (not the coerced '44.2.0')
		expect(result).toBe('v44.2-beta.1')
		expect(result?.startsWith('v')).toBe(true)
		expect(result).toContain('-beta')
	})

	it('drops uncoercible tags and never throws', () => {
		expect(pickMaxReleaseTag(['v44.1', 'not-a-version', 'v44.3'])).toBe('v44.3')
	})

	it('returns null for an empty list', () => {
		expect(pickMaxReleaseTag([])).toBeNull()
	})

	it('returns the single tag when only one is present', () => {
		expect(pickMaxReleaseTag(['v44.1'])).toBe('v44.1')
	})
})
