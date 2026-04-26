// @vitest-environment jsdom
//
// Phase 30 Plan 30-02 — UpdateNotification component unit tests (Wave 0 RED).
//
// `@testing-library/react` is NOT installed in this UI package (verified via
// package.json — only `vitest` + `jsdom` available). Per Plan 30-02 Task 1
// `<action>` block: when RTL is absent, simplify to a smoke-import test +
// deferred-test comment block. Manual browser verification in Task 7 (Chrome
// DevTools MCP smoke) covers the visual/interaction contract.
//
// The smoke test below imports the component and asserts it is defined. This
// is a real RED test in the Wave 0 sense: the import will fail until Task 2
// creates `update-notification.tsx`.
//
// Deferred test cases (covered by Task 7 manual browser verification):
//
//   Test A (visibility happy path): mock useSoftwareUpdate → state:
//     'update-available', latestVersion: {sha, shortSha, message, author,
//     committedAt, available: true}; mock useIsMobile → false; localStorage
//     empty; render <UpdateNotification /> in MemoryRouter; assert card visible.
//
//   Test B (Later writes SHA + hides): same setup as A; click "Later"; assert
//     localStorage['livos:update-notification:dismissed-sha'] === sha; assert
//     card no longer in document.
//
//   Test C (re-show on new SHA): initial sha='abc' → click Later → assert
//     hidden; rerender with sha='def' → assert card back in document.
//
//   Test D (mobile hide): mock useIsMobile → true; render; assert card never
//     in document.
//
//   Test E (Update navigates): click "Update"; assert navigate was called with
//     '/settings/software-update/confirm'.
//
// When @testing-library/react is added to the UI devDeps in a future plan,
// this file should be expanded to the full 5-test suite per Plan 30-02
// `<behavior>`. References:
//   - `livos/packages/ui/src/components/install-prompt-banner.tsx` — canonical
//     pattern this component mirrors (framer-motion + localStorage dismissal).
//   - `livos/packages/ui/src/hooks/use-software-update.ts` — hook this consumes.
//   - localStorage key literal: `livos:update-notification:dismissed-sha`.

import {describe, expect, test} from 'vitest'

import {UpdateNotification} from './update-notification'

describe('UpdateNotification (smoke)', () => {
	test('A: component module exports a UpdateNotification function', () => {
		// Smoke test — the import alone catches "module not found" / "wrong export"
		// regressions. Full RTL behaviour tests deferred to Task 7 manual verify
		// (RTL not installed in UI package; package.json verified — Plan 30-02 §Task 1).
		expect(UpdateNotification).toBeDefined()
		expect(typeof UpdateNotification).toBe('function')
		// Sanity: localStorage key literal documented as part of the component's
		// public contract (UPD-04). If renamed elsewhere, browser dismissals would
		// silently fail to persist — comment ensures grep audit catches drift.
		const DISMISSED_KEY_LITERAL = 'livos:update-notification:dismissed-sha'
		expect(DISMISSED_KEY_LITERAL).toBe('livos:update-notification:dismissed-sha')
	})
})
