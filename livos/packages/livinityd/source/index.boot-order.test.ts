/**
 * Phase 166-05 — boot-order regression test.
 *
 * Asserts the canonical 7-step start() sequence via SOURCE-TEXT grep of
 * livinityd/source/index.ts. The test does NOT instantiate livinityd —
 * it uses fs.readFileSync + string indexOf comparisons to lock the
 * ordering invariant.
 *
 * Canonical order:
 *   1. scaffoldVault(
 *   2. smokeAuthCheck(
 *   3. new AutonomousScheduler( + .start
 *   4. new IdleSessionReaper(   + .start
 *   5. new CcPtyManager(         (166-05 wire-up)
 *   6. new CcPtyIdleReaper(      (166-05 wire-up)
 *   7. drainInstallPendingRedisKeys(
 *
 * Plus 2 shutdown assertions on stop().
 */

import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const here = fileURLToPath(import.meta.url)
const INDEX_PATH = path.resolve(path.dirname(here), 'index.ts')
const src = readFileSync(INDEX_PATH, 'utf-8')

function firstIdx(needle: string): number {
	const i = src.indexOf(needle)
	if (i < 0) throw new Error(`boot-order test: needle not found in source: ${needle}`)
	return i
}

describe('livinityd/source/index.ts boot-order invariant', () => {
	it('Assertion 1: scaffoldVault( appears BEFORE smokeAuthCheck(', () => {
		expect(firstIdx('scaffoldVault(')).toBeLessThan(firstIdx('smokeAuthCheck('))
	})

	it('Assertion 2: smokeAuthCheck( appears BEFORE new AutonomousScheduler(', () => {
		expect(firstIdx('smokeAuthCheck(')).toBeLessThan(firstIdx('new AutonomousScheduler('))
	})

	it('Assertion 3: new AutonomousScheduler( appears BEFORE new IdleSessionReaper(', () => {
		expect(firstIdx('new AutonomousScheduler(')).toBeLessThan(
			firstIdx('new IdleSessionReaper('),
		)
	})

	it('Assertion 4: new IdleSessionReaper( appears BEFORE new CcPtyManager(', () => {
		expect(firstIdx('new IdleSessionReaper(')).toBeLessThan(firstIdx('new CcPtyManager('))
	})

	it('Assertion 5: new CcPtyManager( appears BEFORE new CcPtyIdleReaper(', () => {
		expect(firstIdx('new CcPtyManager(')).toBeLessThan(firstIdx('new CcPtyIdleReaper('))
	})

	it('Assertion 6: new CcPtyIdleReaper( appears BEFORE drainInstallPendingRedisKeys(', () => {
		expect(firstIdx('new CcPtyIdleReaper(')).toBeLessThan(
			firstIdx('drainInstallPendingRedisKeys('),
		)
	})

	it('Assertion 7: shutdown hook contains ccPtyIdleReaper?.stop() AND await ccPtyManager?.stop()', () => {
		// Both lines must exist
		expect(src).toMatch(/this\.ccPtyIdleReaper\?\.stop\(\)/)
		expect(src).toMatch(/await this\.ccPtyManager\?\.stop\(\)/)
		// And shutdown must happen INSIDE the async stop() method (which is
		// the only async stop method in this file).
		const stopIdx = src.indexOf('async stop()')
		expect(stopIdx).toBeGreaterThan(0)
		// ccPtyIdleReaper stop must be after `async stop()`.
		const ccPtyStopIdx = src.indexOf('this.ccPtyIdleReaper?.stop()')
		expect(ccPtyStopIdx).toBeGreaterThan(stopIdx)
	})

	it('Assertion 8: 166-01 placeholder block REMOVED (no _CcPtyTypeProbe leftover)', () => {
		expect(src).not.toMatch(/_CcPtyTypeProbe/)
		// Real value-import is present
		expect(src).toMatch(
			/import\s+\{[^}]*CcPtyManager[^}]*SessionStore[^}]*CcPtyIdleReaper[^}]*\}\s+from\s+['"][^'"]*\/cc-pty[^'"]*['"]/,
		)
	})
})
