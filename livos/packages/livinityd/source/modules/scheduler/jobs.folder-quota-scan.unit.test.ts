// Phase 339 STORD-01 — folder-quota-scan registration unit tests.
//
// Mirrors jobs.user-quota-scan.unit.test.ts: asserts the new job type is reachable
// through the BUILT_IN_HANDLERS registry (so the scheduler can actually dispatch it)
// and is seeded in DEFAULT_JOB_DEFINITIONS with the 30-min cadence + enabled:true.

import {describe, expect, test} from 'vitest'

import {BUILT_IN_HANDLERS, DEFAULT_JOB_DEFINITIONS} from './jobs.js'
import {folderQuotaScanHandler} from '../files/folder-quota-scan.js'

describe('folder-quota-scan registration', () => {
	test('BUILT_IN_HANDLERS[folder-quota-scan] is the folderQuotaScanHandler', () => {
		expect(BUILT_IN_HANDLERS['folder-quota-scan']).toBe(folderQuotaScanHandler)
	})

	test('DEFAULT_JOB_DEFINITIONS seeds folder-quota-scan every 30 min, enabled', () => {
		const def = DEFAULT_JOB_DEFINITIONS.find((d) => d.name === 'folder-quota-scan')
		expect(def).toBeDefined()
		expect(def?.type).toBe('folder-quota-scan')
		expect(def?.schedule).toBe('*/30 * * * *')
		expect(def?.enabled).toBe(true)
	})
})
