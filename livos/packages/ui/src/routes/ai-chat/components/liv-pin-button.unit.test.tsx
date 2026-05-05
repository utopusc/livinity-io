// @vitest-environment jsdom
//
// Phase 75-07 — LivPinButton unit tests.
//
// Source-text invariants pattern (matches P67-04 / 75-02 / 75-06
// D-NO-NEW-DEPS lock). `@testing-library/react` is NOT installed; behaviour
// is validated through pure source-text greps for the contractual literals
// (`/api/pinned-messages`, `Authorization`, `IconPin`, etc.) plus a minimal
// react-dom/client smoke render to confirm the component mounts in idle
// state without throwing.

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {LivPinButton} from './liv-pin-button'

const src = readFileSync(
	join(
		dirname(fileURLToPath(import.meta.url)),
		'liv-pin-button.tsx',
	),
	'utf8',
)

// ── Source-text invariants ────────────────────────────────────────────────

describe('LivPinButton source-text invariants (CONTEXT D-17)', () => {
	it('contains the pin endpoint path /api/pinned-messages', () => {
		expect(src).toContain('/api/pinned-messages')
	})

	it('uses POST method on pin', () => {
		expect(src).toMatch(/method:\s*['"]POST['"]/)
	})

	it('sends Authorization Bearer header', () => {
		expect(src).toContain('Authorization')
		expect(src).toMatch(/Bearer\s*\$\{jwt\}/)
	})

	it('imports IconPin (Tabler) for the unpinned state', () => {
		expect(src).toContain('IconPin')
		expect(src).toMatch(/from\s+['"]@tabler\/icons-react['"]/)
	})

	it('reads JWT from JWT_LOCAL_STORAGE_KEY (P67-04 STATE convention)', () => {
		expect(src).toContain('JWT_LOCAL_STORAGE_KEY')
		expect(src).toMatch(/from\s+['"]@\/modules\/auth\/shared['"]/)
	})

	it('NEVER uses dangerouslySetInnerHTML', () => {
		expect(src).not.toContain('dangerouslySetInnerHTML')
	})

	it('exports the LivPinButton component (named + default)', () => {
		expect(src).toMatch(/export\s+function\s+LivPinButton/)
		expect(src).toMatch(/export\s+default\s+LivPinButton/)
	})

	it('exports the LivPinButtonProps interface', () => {
		expect(src).toMatch(/export\s+interface\s+LivPinButtonProps/)
	})
})

// ── Smoke render (idle state, no fetch issued) ───────────────────────────

describe('<LivPinButton> smoke render', () => {
	let container: HTMLDivElement | null = null
	let root: Root | null = null
	let originalFetch: typeof globalThis.fetch

	beforeEach(() => {
		container = document.createElement('div')
		document.body.appendChild(container)
		root = createRoot(container)
		// Stub fetch — initial mount must NOT issue a network call.
		originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn() as any
	})

	afterEach(() => {
		if (root) {
			act(() => {
				root!.unmount()
			})
			root = null
		}
		if (container && container.parentNode) {
			container.parentNode.removeChild(container)
		}
		container = null
		globalThis.fetch = originalFetch
	})

	it('renders a button in unpinned state on initial mount (no fetch)', () => {
		act(() => {
			root!.render(
				<LivPinButton
					messageId="m1"
					conversationId="c1"
					content="hello world"
				/>,
			)
		})
		const btn = container!.querySelector(
			'button[data-pinned="false"]',
		) as HTMLButtonElement | null
		expect(btn).not.toBeNull()
		expect(btn!.disabled).toBe(false)
		// No fetch on initial mount — pin only happens on click.
		expect((globalThis.fetch as any).mock?.calls?.length ?? 0).toBe(0)
	})
})
