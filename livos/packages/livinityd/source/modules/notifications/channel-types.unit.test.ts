// Phase 310 review-fix (MED-04) — severity-aware external description tests.
//
// disk-critical fires at two tiers (jobs.ts diskSeverityFor): warning (<1GB) and
// critical (<100MB). The external message must reflect the tier that fired — a
// warning must NOT read "critically low".

import {describe, expect, test} from 'vitest'

import {describeNotification} from './channel-types.js'

describe('notifications/channel-types describeNotification (MED-04 severity copy)', () => {
	test('disk-critical at warning severity reads "running low" (NOT "critically low")', () => {
		expect(describeNotification('disk-critical', 'warning')).toBe('Disk space is running low')
	})

	test('disk-critical at critical severity reads "critically low"', () => {
		expect(describeNotification('disk-critical', 'critical')).toBe('Disk space is critically low')
	})

	test('disk-critical with no severity keeps the more urgent wording (fail-loud default)', () => {
		expect(describeNotification('disk-critical')).toBe('Disk space is critically low')
	})

	test('non-disk ids are unaffected and ignore severity', () => {
		expect(describeNotification('update-failed', 'warning')).toBe('A system update failed')
		expect(describeNotification('backups-failing:repo1', 'critical')).toBe(
			'Backups have not run in over 24 hours',
		)
	})

	test('an unknown id falls back to the raw id', () => {
		expect(describeNotification('totally-unknown-id')).toBe('totally-unknown-id')
	})
})
