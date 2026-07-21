// @vitest-environment jsdom
//
// Phase 352-02 (VMAPP-02) — VM list/lifecycle guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone
// precedent, verified 2026-07-21) — no render/screen. These are source-text
// invariants over the raw component text (readFileSync) pinning the honesty +
// destruction-safety guarantees the threat model (T-352-05/06/07) depends on,
// which tsc/pnpm build cannot catch (they are string/structure invariants, not
// type errors).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const DELETE_DIALOG = 'src/features/vm/components/delete-vm-dialog.tsx'
const LIST_ITEM = 'src/features/vm/components/vm-list-item.tsx'

describe('delete is confirm-gated (T-352-06 — no data loss without explicit ack)', () => {
	it('delete-vm-dialog.tsx fires vm.delete only with confirm: true', () => {
		const src = read(DELETE_DIALOG)
		expect(src).toMatch(/trpcReact\.vm\.delete/)
		// The literal confirm:true is the acknowledgement the backend z.literal(true) double-gates.
		expect(src).toMatch(/confirm:\s*true/)
	})
})

describe('errored VM surfaces its reason and never renders as healthy (T-352-05)', () => {
	it('vm-list-item.tsx renders vm.lastError', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/lastError/)
	})
	it('vm-list-item.tsx has an explicit error-state branch (state cannot fall through to running)', () => {
		const src = read(LIST_ITEM)
		// The badge switches on state; an 'error' arm exists distinct from 'running'.
		expect(src).toMatch(/case 'error'/)
		expect(src).toMatch(/case 'running'/)
		// The error reason is gated on the error state, not shown for a healthy VM.
		expect(src).toMatch(/vm\.state === 'error'/)
	})
})

describe('open-screen is honestly disabled-with-reason (T-352-07 — no false affordance)', () => {
	it('vm-list-item.tsx references the 353 handoff key and never navigates', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/vm\.open-screen\.coming-353/)
		// No router navigation from the row (no live screen yet).
		expect(src).not.toMatch(/navigate\(|useNavigate|<Link/)
	})
})

describe('lifecycle mutations are wired (VMAPP-02)', () => {
	it('vm-list-item.tsx wires start / stop / restart / rename with verbatim error surfacing', () => {
		const src = read(LIST_ITEM)
		expect(src).toMatch(/trpcReact\.vm\.start/)
		expect(src).toMatch(/trpcReact\.vm\.stop/)
		expect(src).toMatch(/trpcReact\.vm\.restart/)
		expect(src).toMatch(/trpcReact\.vm\.rename/)
		// The server message surfaces verbatim (CONFLICT "...already in progress").
		expect(src).toMatch(/toast\.error\(error\.message\)/)
	})
})
