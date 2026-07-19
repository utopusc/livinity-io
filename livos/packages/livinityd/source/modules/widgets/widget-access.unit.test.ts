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
		expect(
			decideWidgetAccess({owner: 'u-999', currentUserId: 'u-1', isAdmin: true, effectiveAccessLevel: 'none'}),
		).toBe(true)
	})

	it('admits owner===null (ownerless built-in / global app — box-global, unchanged)', () => {
		expect(
			decideWidgetAccess({owner: null, currentUserId: 'u-1', isAdmin: false, effectiveAccessLevel: undefined}),
		).toBe(true)
	})

	it('admits the owner themselves', () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: 'u-1', isAdmin: false, effectiveAccessLevel: 'none'}),
		).toBe(true)
	})

	it("admits a non-owner with an explicit 'full' share grant", () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false, effectiveAccessLevel: 'full'}),
		).toBe(true)
	})

	it("admits a non-owner with an explicit 'readonly' share grant", () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false, effectiveAccessLevel: 'readonly'}),
		).toBe(true)
	})
})

describe('decideWidgetAccess — DENIES (fail-closed ALLOW-LIST)', () => {
	it("DENIES when owner set, currentUserId !== owner, effectiveAccessLevel === 'none' (W1: never fail-OPEN on none)", () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false, effectiveAccessLevel: 'none'}),
		).toBe(false)
	})

	it('DENIES when owner set, currentUserId !== owner, effectiveAccessLevel === undefined', () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: 'u-2', isAdmin: false, effectiveAccessLevel: undefined}),
		).toBe(false)
	})

	it('DENIES when owner set and currentUserId is undefined (unidentified caller)', () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: undefined, isAdmin: false, effectiveAccessLevel: 'full'}),
		).toBe(false)
	})

	it('DENIES empty/unknown inputs (owner set, no user, no grant)', () => {
		expect(
			decideWidgetAccess({owner: 'u-1', currentUserId: undefined, isAdmin: false, effectiveAccessLevel: undefined}),
		).toBe(false)
	})
})
