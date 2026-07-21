// @vitest-environment jsdom
//
// Phase 352-03 (VMAPP-02/03) — Create-VM modal honesty guard tests.
//
// `@testing-library/react` is NOT installed in this UI package (danger-zone /
// 352-02 precedent) — no render/screen. These are source-text invariants over
// the raw component text (readFileSync) pinning the honesty guarantees the
// 352-03 threat model depends on, which tsc/pnpm build cannot catch (they are
// string/structure invariants, not type errors).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// process.cwd() at vitest run-time is the UI package root (livos/packages/ui).
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const DIALOG = 'src/features/vm/components/create-vm-dialog.tsx'

describe('GPU is never a false affordance (T-352-03-01 — gpu.status is hardcoded unsupported)', () => {
	it('create-vm-dialog.tsx renders NO toggle/Switch control', () => {
		const src = read(DIALOG)
		expect(src).not.toMatch(/<Switch/)
	})
})

describe('BYO-license notice is single-sourced from the query (T-352-03-02)', () => {
	it('create-vm-dialog.tsx renders the notice FROM createOptions, never re-hardcoded', () => {
		const src = read(DIALOG)
		// Rendered from the query result…
		expect(src).toMatch(/byoLicenseNotice/)

		// …and the backend's distinctive notice text appears NOWHERE in the dialog
		// source. Derive the substring from the single backend source of truth so
		// the guard tracks any future copy change without drift.
		const templateSrc = read('../livinityd/source/modules/vm/vm-template.ts')
		const m = templateSrc.match(/WINDOWS_BYO_LICENSE_NOTICE\s*=\s*'([^']+)'/)
		expect(m).not.toBeNull()
		const notice = (m as RegExpMatchArray)[1]
		// A distinctive fragment of the notice — must be absent from the UI source.
		const distinctive = 'does not provide Windows or an activation key'
		expect(notice).toContain(distinctive)
		expect(src).not.toContain(distinctive)
		expect(src).not.toContain(notice)
	})
})

describe('EULA-excluded OS is absent from the picker (T-352-03-03)', () => {
	it('create-vm-dialog.tsx contains no macOS / Apple entry', () => {
		const src = read(DIALOG)
		expect(src).not.toMatch(/macos/i)
		expect(src).not.toMatch(/SiApple/)
	})
})

describe('create flow is wired to the honest API surface (VMAPP-02)', () => {
	it('create-vm-dialog.tsx consumes vm.createOptions and dispatches vm.create', () => {
		const src = read(DIALOG)
		expect(src).toMatch(/trpcReact\.vm\.createOptions/)
		expect(src).toMatch(/trpcReact\.vm\.create\b/)
	})
})
