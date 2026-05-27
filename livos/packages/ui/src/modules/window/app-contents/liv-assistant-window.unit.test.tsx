// @vitest-environment jsdom
//
// Phase 227-01 — LivAssistantWindow unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, same precedent as Phase 224-03 v42-migration-banner test).
// This file uses direct react-dom/client renders against jsdom.
//
// Coverage:
//   1. Component renders exactly one iframe with src ending in '/liv/'
//      (relative default) and title 'Liv Assistant'.
//   2. iframe sandbox attribute is the exact locked token list.
//   3. iframe allow attribute carries clipboard-read + clipboard-write.
//   4. iframe className fills its parent (h-full + w-full).
//
// References:
//   - .planning/phases/227-livos-shell-livassistant-window/227-01-PLAN.md
//   - livos/packages/ui/src/components/banners/v42-migration-banner.test.tsx (RTL-absent precedent)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import LivAssistantWindow, {LIV_ASSISTANT_DEFAULT_URL, LIV_ASSISTANT_SANDBOX} from './liv-assistant-window'

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

describe('LivAssistantWindow', () => {
	it('renders exactly one iframe with the default /liv/ src and Liv Assistant title', () => {
		act(() => {
			root!.render(<LivAssistantWindow />)
		})
		const iframes = container!.querySelectorAll('iframe')
		expect(iframes.length).toBe(1)
		const frame = iframes[0] as HTMLIFrameElement
		// src resolves to an absolute URL in jsdom; assert tail.
		expect(frame.getAttribute('src') || frame.src).toMatch(/\/liv\/$/)
		expect(frame.getAttribute('title')).toBe('Liv Assistant')
		expect(LIV_ASSISTANT_DEFAULT_URL).toBe('/liv/')
	})

	it('applies the locked sandbox token list (exact order)', () => {
		act(() => {
			root!.render(<LivAssistantWindow />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		expect(frame.getAttribute('sandbox')).toBe(LIV_ASSISTANT_SANDBOX)
		// Spell the literal out once in the test so a refactor that changes
		// the constant can't silently change the wire value.
		expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-scripts allow-forms allow-popups allow-downloads')
	})

	it('permits clipboard-read and clipboard-write via the allow attribute', () => {
		act(() => {
			root!.render(<LivAssistantWindow />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		const allow = frame.getAttribute('allow') || ''
		expect(allow).toContain('clipboard-read')
		expect(allow).toContain('clipboard-write')
	})

	it('fills the parent window (h-full + w-full)', () => {
		act(() => {
			root!.render(<LivAssistantWindow />)
		})
		const frame = container!.querySelector('iframe') as HTMLIFrameElement
		const cls = frame.getAttribute('class') || ''
		expect(cls).toContain('h-full')
		expect(cls).toContain('w-full')
	})
})
