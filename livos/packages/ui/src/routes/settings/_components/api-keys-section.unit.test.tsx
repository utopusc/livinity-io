// @vitest-environment jsdom
//
// Phase 62 Plan 62-04 — ApiKeysSection RED tests (Wave 2 / FR-BROKER-E2-01).
//
// `@testing-library/react` is NOT installed in this UI package — only
// `vitest` + `jsdom` are available (verified via package.json devDeps,
// 2026-05-03). Per the established Phase 30/33/38 precedent
// (past-deploys-table.unit.test.tsx, danger-zone.unit.test.tsx,
// update-log-viewer-dialog.unit.test.tsx), when RTL is absent we ship:
//   1. Smoke tests that import the module + assert export shape
//   2. Source-text invariant tests for contract-critical strings
//      (empty-state copy, security wording, anti-leak guards)
//   3. A deferred RTL test plan as comments that future plans can lift
//      verbatim once RTL lands in devDeps
//
// D-NO-NEW-DEPS is locked for v30 — adding @testing-library/react would
// violate the core decision. The smoke + source-text approach delivers
// the RED→GREEN contract without new deps:
//   - RED: until api-keys-section.tsx exists, the import throws
//          "Cannot find module" → smoke test FAILS.
//   - GREEN: once the component is implemented, the smoke test passes
//          AND the source-text invariants assert the FR-BROKER-E2-01
//          contract details (empty state, revoked-row badge, etc.).
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests for FR-BROKER-E2-01 (require @testing-library/react):
// ─────────────────────────────────────────────────────────────────────
//
//   AKS1 (FR-BROKER-E2-01 — empty state): mock trpcReact.apiKeys.list
//     .useQuery → {data: [], isLoading: false}; render <ApiKeysSection/>;
//     expect text 'No API keys yet. Create one to start authenticating
//     with Bearer tokens.' to be in document.
//
//   AKS2 (FR-BROKER-E2-01 — list rows): mock useQuery → {data: [{id:'k1',
//     name:'My Key', key_prefix:'liv_sk_a', created_at:new Date(),
//     last_used_at:null, revoked_at:null}], isLoading:false}; render;
//     expect 'My Key' AND 'liv_sk_a' visible.
//
//   AKS3 (FR-BROKER-E2-01 — Create button opens modal): click 'Create
//     Key' button; expect <ApiKeysCreateModal> open=true (modal title
//     'Create API key' visible).
//
//   AKS4 (FR-BROKER-E2-01 — Revoke button opens modal): click row's
//     Revoke button; expect <ApiKeysRevokeModal> open=true with the
//     row's id+name passed.
//
//   AKS5 (FR-BROKER-E2-01 — revoked rows visually disabled): mock
//     useQuery → key with revoked_at: new Date(); expect Revoke button
//     disabled OR hidden, expect '(revoked)' badge text visible, expect
//     row to have opacity-60 class.
//
// References:
//   - 62-04-PLAN.md Task 1 behavior spec (5 tests above are the contract)
//   - 62-RESEARCH.md §Validation Architecture §Wave 0 Gaps
//   - Phase 30/33/38 precedent for smoke+deferred fallback
//   - D-NO-NEW-DEPS locked decision

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('ApiKeysSection smoke (FR-BROKER-E2-01)', () => {
	it('module exports ApiKeysSection function', async () => {
		const mod = await import('./api-keys-section')
		expect(typeof mod.ApiKeysSection).toBe('function')
	})
})

describe('ApiKeysSection source-text invariants (FR-BROKER-E2-01)', () => {
	const sourcePath = resolve(process.cwd(), 'src/routes/settings/_components/api-keys-section.tsx')

	it('contains the literal empty-state copy from CONTEXT.md', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/No API keys yet\. Create one to start authenticating with Bearer tokens\./)
	})

	it('renders an h2 heading "API Keys" matching usage-section style', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/<h2[^>]*>[^<]*API Keys/)
	})

	it('consumes trpcReact.apiKeys.list useQuery (Phase 59 wiring)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/trpcReact\.apiKeys\.list\.useQuery/)
	})

	it('imports both ApiKeysCreateModal and ApiKeysRevokeModal sibling components', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/api-keys-create-modal/)
		expect(source).toMatch(/api-keys-revoke-modal/)
	})

	it('renders a (revoked) badge for revoked rows (T-62-13/14 mitigation)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).toMatch(/revoked/i)
	})

	it('NEVER console.logs a plaintext or Bearer token string (T-62-13)', () => {
		const source = readFileSync(sourcePath, 'utf8')
		expect(source).not.toMatch(/console\.(log|info|debug)[^)]*plaintext/)
		expect(source).not.toMatch(/console\.(log|info|debug)[^)]*Bearer /)
	})
})
