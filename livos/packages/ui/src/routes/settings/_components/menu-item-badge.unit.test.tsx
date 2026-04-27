// @vitest-environment jsdom
//
// Phase 33 Plan 33-03 — MenuItemBadge component RED tests (Wave 2).
//
// `@testing-library/react` is NOT installed in this UI package — only
// `vitest` + `jsdom` are available (verified via package.json devDeps,
// 2026-04-27). Per Plan 30-02 D-04 precedent: when RTL is absent, ship
// SMOKE tests that import the module + assert export shape, plus an
// inline deferred-RTL test plan that future plans can lift verbatim.
//
// The smoke test below imports the extracted MenuItemBadge component.
// Until Task 4 of Plan 33-03 creates `menu-item-badge.tsx`, this file
// fails the import resolution → genuine RED in the TDD sense.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (require `@testing-library/react` in UI devDeps):
// ─────────────────────────────────────────────────────────────────────
//
//   MB1 (wrong itemId → null): mock useSoftwareUpdate → state:
//     'update-available'; render <MenuItemBadge itemId='account'
//     activeSection='home' />; assert container.firstChild === null.
//
//   MB2 (state !== update-available → null): mock useSoftwareUpdate →
//     state: 'at-latest'; render <MenuItemBadge itemId='software-update'
//     activeSection='home' />; assert container.firstChild === null.
//
//   MB3 (activeSection === 'software-update' → null per O-05 LOCK):
//     mock useSoftwareUpdate → state: 'update-available'; render
//     <MenuItemBadge itemId='software-update'
//     activeSection='software-update' />; assert container.firstChild
//     === null. (User is on the page; badge served its purpose.)
//
//   MB4 (all 3 conditions met → renders badge): mock useSoftwareUpdate →
//     state: 'update-available'; render <MenuItemBadge
//     itemId='software-update' activeSection='home' />; assert a <span>
//     with aria-label='Update available' is in document AND its
//     className contains 'bg-brand'.
//
// References:
//   - Plan 33-03 <action> Step 4 — fallback when RTL absent.
//   - Plan 30-02 D-04 — established the smoke + deferred-comment pattern.
//   - 33-RESEARCH.md R-08 — the O-05 LOCK ("hide on page open").
//   - 33-RESEARCH.md R-09 — `bg-brand` Tailwind token verified to flip
//     in light/dark themes via existing software-update-list-row usage.

import {describe, expect, test} from 'vitest'

describe('MenuItemBadge smoke (Phase 33 UX-04)', () => {
	test('module imports without throwing', async () => {
		const mod = await import('./menu-item-badge')
		expect(typeof mod.MenuItemBadge).toBe('function')
	})
})
