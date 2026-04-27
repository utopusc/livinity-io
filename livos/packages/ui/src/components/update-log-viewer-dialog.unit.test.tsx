// @vitest-environment jsdom
//
// Phase 33 Plan 33-03 — UpdateLogViewerDialog component RED tests (Wave 2).
//
// `@testing-library/react` is NOT installed in this UI package — only
// `vitest` + `jsdom` are available (verified via package.json devDeps,
// 2026-04-27). Per Plan 30-02 D-04 precedent: when RTL is absent, ship
// SMOKE tests that import the module + assert export shape, plus an
// inline deferred-RTL test plan that future plans can lift verbatim.
//
// The smoke test below imports the component and asserts it is defined.
// Until Task 2 of Plan 33-03 creates `update-log-viewer-dialog.tsx`,
// this file fails the import resolution → genuine RED in the TDD sense.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (require `@testing-library/react` in UI devDeps):
// ─────────────────────────────────────────────────────────────────────
//
//   UD1 (DialogTitle shows filename): mock trpcReact.system.readUpdateLog
//     .useQuery → {data: {filename: 'foo.log', content: 'hi'}, isLoading:
//     false}; render <UpdateLogViewerDialog filename='foo.log' open={true}
//     onOpenChange={vi.fn()} />; assert role='heading' contains 'foo.log'.
//
//   UD2 (queries with full:false on open): assert mock was called with
//     {filename: 'foo.log', full: false} AND that the React-Query hook's
//     `enabled` option resolved to true because open===true.
//
//   UD3 (renders <pre> with content): mock returns
//     {content: 'line1\nline2', truncated: false}; assert a <pre> element
//     contains both 'line1' and 'line2'.
//
//   UD4 (truncated banner): mock returns
//     {content: '...', truncated: true, totalLines: 1234}; assert text
//     'Showing last 500 of 1234 lines.' visible.
//
//   UD5 (Download click invokes vanilla client): vi.spyOn(trpcClient.system
//     .readUpdateLog, 'query').mockResolvedValue({content: 'full content',
//     filename: 'foo.log', truncated: false}); fireEvent.click on the
//     Download button; assert the spy was called with
//     {filename: 'foo.log', full: true}.
//
//   UD6 (Download creates Blob + anchor): wrap document.createElement to
//     spy on the dynamically-created <a>; assert that after the Download
//     click an anchor with download='foo.log' was clicked, and that
//     URL.createObjectURL was called with a Blob having type='text/plain'.
//
// References:
//   - Plan 33-03 <action> Step 3 — fallback when RTL absent.
//   - Plan 30-02 D-04 — established the smoke + deferred-comment pattern.
//   - 33-RESEARCH.md "Frontend — update-log-viewer-dialog.tsx" (lines
//     406-459) — verbatim component skeleton being tested.

import {describe, expect, test} from 'vitest'

describe('UpdateLogViewerDialog smoke (Phase 33 OBS-03)', () => {
	test('module imports without throwing', async () => {
		const mod = await import('./update-log-viewer-dialog')
		expect(typeof mod.UpdateLogViewerDialog).toBe('function')
	})
})
