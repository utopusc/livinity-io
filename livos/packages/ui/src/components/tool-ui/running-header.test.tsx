// @vitest-environment jsdom
//
// Phase 199-06 Task 1 — `<RunningHeader />` vitest coverage.
//
// D-NO-NEW-DEPS: this UI package has no `@testing-library/react`. Tests
// follow the canonical react-dom/client + jsdom + querySelector pattern
// established by `tool-renderers.test.tsx` and `inline-tool-pill.unit.test.tsx`.
//
// Cases:
//   1. Default render mounts a Loader2 svg + a <span> with the label text.
//   2. Custom `icon` prop is rendered in place of Loader2.
//   3. Label containing HTML-like characters (`<script>alert(1)</script>`)
//      renders as ESCAPED TEXT — no <script> element materialises in the
//      DOM. This locks the T-199-06 XSS mitigation.
//   4. Loader2 carries `animate-spin` AND `size-4` Tailwind utility classes.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {RunningHeader} from './running-header'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

function renderJsx(jsx: React.ReactNode) {
	act(() => {
		root.render(jsx)
	})
}

describe('RunningHeader (Phase 199-06)', () => {
	it('renders the label text inside a <span>', () => {
		renderJsx(<RunningHeader label='Checking weather in Istanbul…' />)
		const span = container.querySelector('span')
		expect(span).not.toBeNull()
		expect(span?.textContent).toBe('Checking weather in Istanbul…')
	})

	it('renders the default Loader2 spinner svg when no icon prop given', () => {
		renderJsx(<RunningHeader label='Loading…' />)
		// lucide-react Loader2 mounts as an <svg> element.
		const svg = container.querySelector('svg')
		expect(svg).not.toBeNull()
	})

	it('honours a custom icon prop in place of Loader2', () => {
		renderJsx(
			<RunningHeader
				icon={<i data-testid='custom-icon' className='size-4' />}
				label='Custom-iconed run'
			/>,
		)
		expect(container.querySelector('[data-testid="custom-icon"]')).not.toBeNull()
		// And the default svg is NOT rendered when a custom icon is supplied
		expect(container.querySelector('svg')).toBeNull()
	})

	it('T-199-06 — XSS-like label renders as escaped text, never as HTML', () => {
		const malicious = '<script>alert(1)</script>'
		renderJsx(<RunningHeader label={malicious} />)
		// No actual <script> element ever materialises
		expect(container.querySelector('script')).toBeNull()
		// The literal angle-bracketed string shows up in text content
		const span = container.querySelector('span')
		expect(span?.textContent).toBe(malicious)
	})

	it('default Loader2 has both animate-spin AND size-4 utility classes', () => {
		renderJsx(<RunningHeader label='Loading…' />)
		const svg = container.querySelector('svg')
		expect(svg).not.toBeNull()
		const cls = svg!.getAttribute('class') ?? ''
		expect(cls).toContain('animate-spin')
		expect(cls).toContain('size-4')
	})
})
