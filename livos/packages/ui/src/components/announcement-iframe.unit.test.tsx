// @vitest-environment jsdom
//
// Phase 292 — [BLOCKING] regression lock for the sandboxed raw-HTML renderer.
//
// `@testing-library/react` is NOT installed in this UI package (D-NO-NEW-DEPS,
// same precedent as Phase 227 liv-assistant-window test). Direct react-dom/client.
//
// These assertions are the permanent XSS wall: if a refactor ever adds
// `allow-scripts`, drops the DOMPurify call, or introduces dangerouslySetInnerHTML
// on the desktop document, this test fails.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import AnnouncementIframe, {
	ANNOUNCEMENT_SANDBOX,
	sanitizeAnnouncementHtml,
} from './announcement-iframe'

// vitest cwd is the ui package root.
const SOURCE = readFileSync(
	resolve(process.cwd(), 'src/components/announcement-iframe.tsx'),
	'utf8',
)

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
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
})

describe('AnnouncementIframe', () => {
	it('locks the sandbox literal — NO allow-scripts, NO allow-same-origin (the wall)', () => {
		act(() => {
			root!.render(<AnnouncementIframe html='<p>hi</p>' theme='dark' />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox')
		expect(ANNOUNCEMENT_SANDBOX).toBe('allow-popups allow-popups-to-escape-sandbox')
		expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
		expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
	})

	it('embeds a CSP with script-src none + default-src none in the srcdoc', () => {
		act(() => {
			root!.render(<AnnouncementIframe html='<p>hi</p>' theme='light' />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		const srcdoc = frame.getAttribute('srcdoc') || ''
		expect(srcdoc).toContain("script-src 'none'")
		expect(srcdoc).toContain("default-src 'none'")
	})

	it('strips active content (drops <script> and javascript: URIs)', () => {
		const out = sanitizeAnnouncementHtml(
			'<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">',
		)
		expect(out).not.toContain('<script')
		expect(out.toLowerCase()).not.toContain('javascript:')
		expect(out).not.toContain('onerror')
		expect(out).toContain('ok')
	})

	it('source never uses dangerouslySetInnerHTML and DOES call DOMPurify.sanitize', () => {
		expect(SOURCE).toContain('DOMPurify.sanitize')
		expect(SOURCE).not.toContain('dangerouslySetInnerHTML')
	})

	it('injects theme-aware styling into the iframe document', () => {
		act(() => {
			root!.render(<AnnouncementIframe html='<p>themed</p>' theme='dark' />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		const srcdoc = frame.getAttribute('srcdoc') || ''
		expect(srcdoc).toContain('<style>')
		expect(srcdoc).toContain('color-scheme')
	})
})
