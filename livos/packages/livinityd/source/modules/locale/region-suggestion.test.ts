/**
 * Phase 196-04 Task 1 — region-suggestion.test.ts.
 *
 * Pure-function coverage for countryToRegion + timezoneToRegion + the
 * frozen REGIONS allow-list. Locks the contracts both the tRPC setup
 * router (server-side) and the RegionStep React component (client-side)
 * depend on.
 *
 * Per Plan 196-04 acceptance criteria: >= 24 PASS, 0 FAIL.
 *
 * Coverage groups:
 *   - REGIONS allow-list (frozen, length 6)
 *   - countryToRegion: representative sample across all 6 regions +
 *     case-insensitivity + invalid-input rejection (>= 12 country cases)
 *   - timezoneToRegion: leading-segment dispatch + South America override
 *     for America/* zones + null for Antarctica/Etc/Indian/Atlantic +
 *     null for malformed input (>= 8 timezone cases, >= 4 invalid cases)
 */

import {describe, expect, test} from 'vitest'

import {
	countryToRegion,
	REGIONS,
	timezoneToRegion,
	type Region,
} from './region-suggestion.js'

describe('REGIONS allow-list', () => {
	test('is exactly 6 elements long and includes all 6 canonical regions', () => {
		expect(REGIONS.length).toBe(6)
		expect(REGIONS).toContain('europe' as Region)
		expect(REGIONS).toContain('north-america' as Region)
		expect(REGIONS).toContain('south-america' as Region)
		expect(REGIONS).toContain('asia' as Region)
		expect(REGIONS).toContain('africa' as Region)
		expect(REGIONS).toContain('oceania' as Region)
	})

	test('is frozen — attempting to mutate throws in strict mode', () => {
		expect(Object.isFrozen(REGIONS)).toBe(true)
	})
})

// ─── countryToRegion ─────────────────────────────────────────────────────

describe('countryToRegion — ISO-3166-1 alpha-2 mapping', () => {
	// Europe
	test('TR → europe', () => {
		expect(countryToRegion('TR')).toBe('europe')
	})

	test('DE → europe', () => {
		expect(countryToRegion('DE')).toBe('europe')
	})

	test('FR → europe', () => {
		expect(countryToRegion('FR')).toBe('europe')
	})

	test('GB → europe', () => {
		expect(countryToRegion('GB')).toBe('europe')
	})

	// North America
	test('US → north-america', () => {
		expect(countryToRegion('US')).toBe('north-america')
	})

	test('CA → north-america', () => {
		expect(countryToRegion('CA')).toBe('north-america')
	})

	// South America
	test('BR → south-america', () => {
		expect(countryToRegion('BR')).toBe('south-america')
	})

	// Asia
	test('CN → asia', () => {
		expect(countryToRegion('CN')).toBe('asia')
	})

	test('JP → asia', () => {
		expect(countryToRegion('JP')).toBe('asia')
	})

	test('IN → asia', () => {
		expect(countryToRegion('IN')).toBe('asia')
	})

	// Africa
	test('ZA → africa', () => {
		expect(countryToRegion('ZA')).toBe('africa')
	})

	test('EG → africa', () => {
		expect(countryToRegion('EG')).toBe('africa')
	})

	// Oceania
	test('AU → oceania', () => {
		expect(countryToRegion('AU')).toBe('oceania')
	})

	test('NZ → oceania', () => {
		expect(countryToRegion('NZ')).toBe('oceania')
	})

	// Case-insensitivity
	test('lowercase "tr" → europe (case-insensitive)', () => {
		expect(countryToRegion('tr')).toBe('europe')
	})

	test('mixed-case "uS" → north-america', () => {
		expect(countryToRegion('uS')).toBe('north-america')
	})

	// Invalid-input cases
	test('empty string → null', () => {
		expect(countryToRegion('')).toBeNull()
	})

	test('unknown code "XX" → null', () => {
		expect(countryToRegion('XX')).toBeNull()
	})

	test('3-letter "TUR" → null (length-2 guard)', () => {
		expect(countryToRegion('TUR')).toBeNull()
	})

	test('1-letter "T" → null', () => {
		expect(countryToRegion('T')).toBeNull()
	})

	test('null input → null', () => {
		expect(countryToRegion(null)).toBeNull()
	})

	test('undefined input → null', () => {
		expect(countryToRegion(undefined)).toBeNull()
	})

	test('Antarctica "AQ" intentionally omitted → null', () => {
		// AQ is excluded from the table because the 6-element Region allow-list
		// has no Antarctica bucket. Confirm it's null (regression-lock).
		expect(countryToRegion('AQ')).toBeNull()
	})
})

// ─── timezoneToRegion ────────────────────────────────────────────────────

describe('timezoneToRegion — IANA Olson zone mapping', () => {
	// Leading-segment dispatch (the common path)
	test('Europe/Istanbul → europe', () => {
		expect(timezoneToRegion('Europe/Istanbul')).toBe('europe')
	})

	test('Europe/London → europe', () => {
		expect(timezoneToRegion('Europe/London')).toBe('europe')
	})

	test('America/New_York → north-america', () => {
		expect(timezoneToRegion('America/New_York')).toBe('north-america')
	})

	test('America/Los_Angeles → north-america', () => {
		expect(timezoneToRegion('America/Los_Angeles')).toBe('north-america')
	})

	test('Asia/Tokyo → asia', () => {
		expect(timezoneToRegion('Asia/Tokyo')).toBe('asia')
	})

	test('Africa/Lagos → africa', () => {
		expect(timezoneToRegion('Africa/Lagos')).toBe('africa')
	})

	test('Australia/Sydney → oceania', () => {
		expect(timezoneToRegion('Australia/Sydney')).toBe('oceania')
	})

	test('Pacific/Auckland → oceania', () => {
		expect(timezoneToRegion('Pacific/Auckland')).toBe('oceania')
	})

	// South America override (America/* zones that are actually SA)
	test('America/Sao_Paulo → south-america (SA override)', () => {
		expect(timezoneToRegion('America/Sao_Paulo')).toBe('south-america')
	})

	test('America/Argentina/Buenos_Aires → south-america (sub-zone override)', () => {
		expect(timezoneToRegion('America/Argentina/Buenos_Aires')).toBe('south-america')
	})

	test('America/Manaus → south-america (Brazil westerly)', () => {
		expect(timezoneToRegion('America/Manaus')).toBe('south-america')
	})

	test('America/Santiago → south-america (Chile)', () => {
		expect(timezoneToRegion('America/Santiago')).toBe('south-america')
	})

	// Explicit null returns
	test('Antarctica/McMurdo → null (no region applies)', () => {
		expect(timezoneToRegion('Antarctica/McMurdo')).toBeNull()
	})

	test('Etc/UTC → null (abstract offset)', () => {
		expect(timezoneToRegion('Etc/UTC')).toBeNull()
	})

	test('Etc/GMT+5 → null (abstract offset)', () => {
		expect(timezoneToRegion('Etc/GMT+5')).toBeNull()
	})

	test('Indian/Mauritius → null (refuse to guess across continents)', () => {
		expect(timezoneToRegion('Indian/Mauritius')).toBeNull()
	})

	test('Atlantic/Azores → null (refuse to guess — spans EU/AF/SA)', () => {
		expect(timezoneToRegion('Atlantic/Azores')).toBeNull()
	})

	// Invalid-input cases
	test('unknown leading segment "Mars/Olympus" → null', () => {
		expect(timezoneToRegion('Mars/Olympus')).toBeNull()
	})

	test('zone with no slash "UTC" → null', () => {
		expect(timezoneToRegion('UTC')).toBeNull()
	})

	test('empty string → null', () => {
		expect(timezoneToRegion('')).toBeNull()
	})

	test('null input → null', () => {
		expect(timezoneToRegion(null)).toBeNull()
	})

	test('undefined input → null', () => {
		expect(timezoneToRegion(undefined)).toBeNull()
	})
})
