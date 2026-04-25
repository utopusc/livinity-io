// Phase 24-01 — Docker theme module pure-function tests.
//
// The hook (useDockerTheme) is verified by visual inspection in Plan 24-02's
// checkpoint. Here we lock down the pure resolver that drives it.

import {describe, expect, test} from 'vitest'

import {resolveTheme} from './theme'

describe('resolveTheme', () => {
	test("light + prefersDark=true → 'light'", () => {
		expect(resolveTheme('light', true)).toBe('light')
	})

	test("dark + prefersDark=false → 'dark'", () => {
		expect(resolveTheme('dark', false)).toBe('dark')
	})

	test("system + prefersDark=true → 'dark'", () => {
		expect(resolveTheme('system', true)).toBe('dark')
	})

	test("system + prefersDark=false → 'light'", () => {
		expect(resolveTheme('system', false)).toBe('light')
	})
})
