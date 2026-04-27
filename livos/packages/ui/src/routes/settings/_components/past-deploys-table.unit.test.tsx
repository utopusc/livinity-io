// @vitest-environment jsdom
//
// Phase 33 Plan 33-03 — PastDeploysTable component RED tests (Wave 2).
//
// `@testing-library/react` is NOT installed in this UI package — only
// `vitest` + `jsdom` are available (verified via package.json devDeps,
// 2026-04-27). Per Plan 30-02 D-04 precedent: when RTL is absent, ship
// SMOKE tests that import the module + assert export shape, plus an
// inline deferred-RTL test plan that future plans can lift verbatim.
//
// The smoke test below imports the component and asserts it is defined.
// Until Task 3 of Plan 33-03 creates `past-deploys-table.tsx`, this file
// fails the import resolution → genuine RED in the TDD sense.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (require `@testing-library/react` in UI devDeps):
// ─────────────────────────────────────────────────────────────────────
//
//   PT1 (renders 50 rows): mock trpcReact.system.listUpdateHistory.useQuery
//     to return {data: <50 row records>, isLoading: false, isError: false};
//     render <PastDeploysTable />; expect screen.getAllByRole('row').length
//     to equal 51 (50 data + 1 header).
//
//   PT2 (rows sorted newest-first): backend already sorts; UI must preserve
//     order. Mock returns 3 rows with descending timestamps; assert the
//     rendered SHA cells appear in the same order as the data array.
//
//   PT3 (empty state): mock useQuery → {data: [], isLoading: false,
//     isError: false}; render; assert text 'No deploys yet.' is in document.
//
//   PT4 (error state): mock useQuery → {isError: true, error:
//     {message: 'boom'}, isLoading: false}; render; assert text containing
//     'Error' and 'boom' visible.
//
//   PT5 (loading state): mock useQuery → {isLoading: true}; render; assert
//     text 'Loading…' visible.
//
//   PT6 (status badge variants): mock returns 4 rows, one each with status
//     'success', 'failed', 'rolled-back', 'precheck-failed'; assert the
//     rendered Badge for each row has the correct variant (success→primary,
//     failed/rolled-back→destructive, precheck-failed→outline).
//
//   PT7 (row click opens log dialog with derived basename): mock useQuery
//     to return one row with log_path = '/opt/livos/data/update-history/
//     update-2026-04-26T18-24-30Z-abc1234.log'; render; fireEvent.click on
//     the data row; assert UpdateLogViewerDialog is rendered with
//     filename='update-2026-04-26T18-24-30Z-abc1234.log' (R-10 mitigation:
//     basename only, NOT the absolute server path).
//
// References:
//   - Plan 33-03 <action> Step 2 — fallback when RTL absent.
//   - Plan 30-02 D-04 — established the smoke + deferred-comment pattern.
//   - 33-RESEARCH.md R-10 — the "basename only" UI invariant under test.

import {describe, expect, test} from 'vitest'

describe('PastDeploysTable smoke (Phase 33 OBS-02)', () => {
	test('module imports without throwing', async () => {
		const mod = await import('./past-deploys-table')
		expect(typeof mod.PastDeploysTable).toBe('function')
	})
})
