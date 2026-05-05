// @vitest-environment jsdom
//
// Phase 75-06 — LivConversationSearch unit tests.
//
// Source-text invariants pattern (matches P67-04 / 75-02 D-NO-NEW-DEPS lock).
// `@testing-library/react` is NOT installed; behaviour is validated through
// pure source-text greps for the contractual literals (`/api/conversations/
// search`, `300`, `AbortController`, etc.) plus a minimal react-dom/client
// smoke render to confirm the component mounts in idle state without
// throwing. Behaviour assertions on debounce + abort are deferred to the
// 75-07 integration plan — this file just locks down the surface.

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {LivConversationSearch} from './liv-conversation-search'

const src = readFileSync(
	join(
		dirname(fileURLToPath(import.meta.url)),
		'liv-conversation-search.tsx',
	),
	'utf8',
)

// ── Source-text invariants ────────────────────────────────────────────────

describe('LivConversationSearch source-text invariants (CONTEXT D-26..D-28)', () => {
	it('contains the FTS endpoint path /api/conversations/search', () => {
		expect(src).toContain('/api/conversations/search')
	})

	it('debounces with setTimeout + 300ms (MEM-06)', () => {
		expect(src).toContain('setTimeout')
		expect(src).toContain('300')
	})

	it('cancels in-flight fetches via AbortController (T-75-06-04)', () => {
		expect(src).toContain('AbortController')
	})

	it('renders snippets via <HighlightedText> (CONTEXT D-27)', () => {
		expect(src).toContain('<HighlightedText')
		expect(src).toMatch(/from\s+['"]@\/components\/highlighted-text['"]/)
	})

	it('reads JWT from JWT_LOCAL_STORAGE_KEY (P67-04 STATE convention)', () => {
		expect(src).toContain('JWT_LOCAL_STORAGE_KEY')
		expect(src).toMatch(/from\s+['"]@\/modules\/auth\/shared['"]/)
	})

	it('NEVER uses dangerouslySetInnerHTML (T-75-06-03)', () => {
		expect(src).not.toContain('dangerouslySetInnerHTML')
	})

	it('exports the LivConversationSearch component', () => {
		expect(src).toMatch(/export\s+function\s+LivConversationSearch/)
	})
})

// ── Smoke render (idle state, no fetch issued) ───────────────────────────

describe('<LivConversationSearch> smoke render', () => {
	let container: HTMLDivElement | null = null
	let root: Root | null = null
	let originalFetch: typeof globalThis.fetch

	beforeEach(() => {
		container = document.createElement('div')
		document.body.appendChild(container)
		root = createRoot(container)
		// Stub fetch — short-trim queries should NOT call it, but having a
		// stub in place avoids a noisy ReferenceError if a future change
		// regresses and starts fetching on mount.
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

	it('renders an idle search input on mount (no fetch issued)', () => {
		act(() => {
			root!.render(<LivConversationSearch />)
		})
		const input = container!.querySelector('input[type="search"]') as HTMLInputElement | null
		expect(input).not.toBeNull()
		expect(input!.value).toBe('')
		// No fetch on initial mount because q is empty.
		expect((globalThis.fetch as any).mock?.calls?.length ?? 0).toBe(0)
	})
})
