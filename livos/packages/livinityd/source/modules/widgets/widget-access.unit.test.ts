// livos/packages/livinityd/source/modules/widgets/widget-access.unit.test.ts
// Phase 345-01 (WIDG-01, D-345-2) — OFFLINE unit test for the pure widget
// multi-user safety core. Proves the composite-ID rsplit fix and the
// fail-closed ownership ALLOW-LIST (PLAN-CHECK W1: DENY on 'none').
import {describe, it, expect} from 'vitest'
import {splitWidgetId, baseAppId, decideWidgetAccess} from './widget-access.js'

describe('splitWidgetId (rsplit on the LAST colon)', () => {
	it("splitWidgetId('livinity:storage') → appId=livinity, widgetName=storage", () => {
		expect(splitWidgetId('livinity:storage')).toEqual({appId: 'livinity', widgetName: 'storage'})
	})

	it("splitWidgetId('transmission:status') → appId=transmission, widgetName=status", () => {
		expect(splitWidgetId('transmission:status')).toEqual({appId: 'transmission', widgetName: 'status'})
	})

	it("splitWidgetId('nextcloud:user:u-123:status') → appId=nextcloud:user:u-123, widgetName=status (THE fix)", () => {
		expect(splitWidgetId('nextcloud:user:u-123:status')).toEqual({
			appId: 'nextcloud:user:u-123',
			widgetName: 'status',
		})
	})

	it('degenerate id with no colon → whole id is appId, empty widgetName', () => {
		expect(splitWidgetId('lonely')).toEqual({appId: 'lonely', widgetName: ''})
	})
})

describe('baseAppId (strip :user:<uid> composite)', () => {
	it("baseAppId('nextcloud:user:u-123') → nextcloud", () => {
		expect(baseAppId('nextcloud:user:u-123')).toBe('nextcloud')
	})

	it("baseAppId('transmission') → transmission (unchanged)", () => {
		expect(baseAppId('transmission')).toBe('transmission')
	})
})

describe('decideWidgetAccess — ADMITS', () => {
	it('admits an admin for any owner', () => {
		expect(decideWidgetAccess({owner: 'u-999', currentUserId: 'u-1', isAdmin: true})).toBe(true)
	})

	it('admits owner===null (ownerless built-in / global app — box-global, unchanged)', () => {
		expect(decideWidgetAccess({owner: null, currentUserId: 'u-1', isAdmin: false})).toBe(true)
	})

	it('admits owner===null even for an unidentified caller (global-app path unchanged)', () => {
		expect(decideWidgetAccess({owner: null, currentUserId: undefined, isAdmin: false})).toBe(true)
	})

	it('admits the owner themselves', () => {
		expect(decideWidgetAccess({owner: 'u-1', currentUserId: 'u-1', isAdmin: false})).toBe(true)
	})
})

describe('decideWidgetAccess — DENIES (fail-closed, owner/admin-only per-user)', () => {
	// CR-345-1: a non-owner is denied a per-user composite instance EVEN WHEN they
	// hold a `full` BASE-app grant. decideWidgetAccess no longer consults any base
	// grant — a base grant on `X` does NOT prove access to `X:user:<otherUid>`,
	// whose specific owner's container the data fetch reads (cross-user leak).
	it('DENIES a non-owner WITH a base full grant for another user\'s instance (X:user:<otherUid>)', () => {
		// Alice (u-2) holds base `full` on X; the composite instance owner is u-1.
		expect(decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false})).toBe(false)
	})

	it('DENIES any non-owner, non-admin caller for an owned instance', () => {
		expect(decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false})).toBe(false)
	})

	it('DENIES when owner set and currentUserId is undefined (unidentified caller)', () => {
		expect(decideWidgetAccess({owner: 'u-1', currentUserId: undefined, isAdmin: false})).toBe(false)
	})
})
