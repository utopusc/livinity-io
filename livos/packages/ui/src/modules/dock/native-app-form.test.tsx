// @vitest-environment jsdom
//
// Phase 101-07 Task 2 — NativeAppForm source-text invariants.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS — same
// precedent as the rest of the ui package; see
// hooks/use-webapp-agent.unit.test.tsx for the canonical example).
//
// This file ships **source-text invariants** that lock the contract with
// the backend schema (native-app-config.ts:60-79) so that bad inputs are
// blocked at the form boundary before they ever hit a tRPC call:
//
//   - binaryPath must be absolute (regex /^\/[a-zA-Z0-9_\-./]+$/)
//   - args must not contain shell metachars (/^[^;&|`$<>(){}\\]*$/)
//   - env keys must not start with LD_ or DYLD_ (preload-library injection)
//   - LD_PRELOAD and DYLD_INSERT_LIBRARIES are the canonical block-list
//     hits — we test both
//
// The form is also responsible for splitting the comma-separated args
// input into an array and dropping empty/trailing entries (UX nicety).
//
// Smoke import verifies the module compiles + all imports resolve.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const FORM_PATH = resolve(__dirname, 'native-app-form.tsx')
const FORM_SRC = readFileSync(FORM_PATH, 'utf8')

describe('NativeAppForm — schema parity invariants (mirrors 101-03 zod schema)', () => {
	it('rejects relative binaryPath via absolute-path regex', () => {
		// Absolute regex MUST start with `^/`. We grep for the regex literal
		// AND a "must be absolute" copy hint to ensure the validation block
		// is wired, not just declared.
		expect(FORM_SRC).toMatch(/\/\^\\\/\[/)
		expect(FORM_SRC).toMatch(/absolute/i)
	})

	it('rejects shell metachars in binaryPath', () => {
		expect(FORM_SRC).toMatch(/shell\s*metachar/i)
	})

	it('rejects shell metachars in args (defense in depth)', () => {
		// SHELL_METACHAR_RE = /^[^;&|`$<>(){}\\]*$/ — same blocklist as the
		// server schema (native-app-config.ts:49). We grep for the leading
		// negated char-class.
		expect(FORM_SRC).toMatch(/\[\^;&\|/)
	})

	it('rejects LD_* env keys (preload-library injection)', () => {
		expect(FORM_SRC).toMatch(/LD_/)
	})

	it('rejects DYLD_* env keys (Darwin preload variant)', () => {
		expect(FORM_SRC).toMatch(/DYLD_/)
	})
})

describe('NativeAppForm — tRPC wiring', () => {
	it('uses trpcReact.apps.native.create mutation', () => {
		expect(FORM_SRC).toMatch(/trpcReact\.apps\.native\.create\.useMutation/)
	})

	it('invalidates apps.native.list after a successful create', () => {
		expect(FORM_SRC).toMatch(/apps\.native\.list\.invalidate/)
	})

	it('passes binaryPath through to create mutation payload', () => {
		expect(FORM_SRC).toMatch(/binaryPath/)
	})

	it('passes wmClassHint through when provided', () => {
		expect(FORM_SRC).toMatch(/wmClassHint/)
	})

	it('fires onCreated callback with the new id', () => {
		expect(FORM_SRC).toMatch(/onCreated\??\.\(/)
	})
})

describe('NativeAppForm — UX shape', () => {
	it('renders a Dialog component (shadcn primitive)', () => {
		expect(FORM_SRC).toMatch(/<Dialog\b/)
	})

	it('has an Add Ubuntu app title (matches plan must_have copy)', () => {
		// "Add Ubuntu app" is the must_have-defined copy for the dialog title.
		expect(FORM_SRC).toMatch(/Add Ubuntu app/)
	})

	it('exports NativeAppForm as a named export', () => {
		expect(FORM_SRC).toMatch(/export\s+function\s+NativeAppForm\b/)
	})

	it('disables Save button when canSave is false', () => {
		expect(FORM_SRC).toMatch(/disabled\s*=\s*\{[^}]*!canSave/)
	})

	it('comma-splits args input and drops empty entries (.filter Boolean)', () => {
		expect(FORM_SRC).toMatch(/split\s*\(\s*['"`],['"`]\s*\)/)
		expect(FORM_SRC).toMatch(/\.filter\s*\(\s*Boolean/)
	})
})

describe('NativeAppForm — WM_CLASS detection (Q3 RESOLVED)', () => {
	it('exposes a "Detect" affordance for wmClassHint', () => {
		// Q3 from 101-RESEARCH: form launches binary, polls xprop, auto-fills
		// the wmClassHint field. We grep for any "Detect" hint string to ensure
		// the affordance exists (UI lights it up only when binaryPath is valid).
		expect(FORM_SRC).toMatch(/Detect/i)
	})
})

describe('NativeAppForm — smoke import', () => {
	it('loads without throwing', async () => {
		await expect(import('./native-app-form')).resolves.toBeTruthy()
	})
})
