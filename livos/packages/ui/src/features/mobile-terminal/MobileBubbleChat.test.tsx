// @vitest-environment jsdom
//
// Phase 181-04 — MobileBubbleChat unit tests (5 assertions).
//
// Pattern: RTL-absent — direct react-dom/client mount.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mock CcPtyWsClient ────────────────────────────────────────────────────
const wsInstances: Array<{
	url: string
	sessionId: string
	onStdout: (data: string) => void
	onAttached: (env: any) => void
	onError: (msg: string) => void
	sendStdin: ReturnType<typeof vi.fn>
	detach: ReturnType<typeof vi.fn>
}> = []

vi.mock('@/features/cc-terminal/terminal-ws-client', () => ({
	CcPtyWsClient: vi.fn().mockImplementation((opts: any) => {
		const inst = {
			url: opts.url,
			sessionId: opts.sessionId,
			onStdout: opts.onStdout,
			onAttached: opts.onAttached,
			onError: opts.onError,
			sendStdin: vi.fn(),
			detach: vi.fn(),
		}
		wsInstances.push(inst)
		return inst
	}),
}))

// ── Mock JWT_LOCAL_STORAGE_KEY ────────────────────────────────────────────
vi.mock('@/modules/auth/shared', () => ({
	JWT_LOCAL_STORAGE_KEY: 'livos-jwt',
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	wsInstances.length = 0
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* already unmounted */
	}
	container.remove()
})

import {MobileBubbleChat} from './MobileBubbleChat'

describe('MobileBubbleChat', () => {
	it('Test 10 — renders empty state: textarea present, send button present, no bubbles', () => {
		act(() => {
			root.render(<MobileBubbleChat sessionId='sess-1' />)
		})
		const textarea = container.querySelector('textarea')
		expect(textarea).not.toBeNull()

		const sendBtn = container.querySelector('button')
		expect(sendBtn).not.toBeNull()

		// No assistant bubbles yet
		const bubbles = container.querySelectorAll('[data-role]')
		expect(bubbles.length).toBe(0)
	})

	it('Test 11 — stdout bubbles: onStdout called → assistant bubble renders', async () => {
		act(() => {
			root.render(<MobileBubbleChat sessionId='sess-1' />)
		})
		expect(wsInstances).toHaveLength(1)

		await act(async () => {
			wsInstances[0].onStdout('Hello from CC\r\n')
		})

		const bubble = container.querySelector('[data-role="assistant"]')
		expect(bubble).not.toBeNull()
		expect(bubble?.textContent).toContain('Hello from CC')
	})

	it('Test 12 — user input: type text and send → ws.sendStdin called with text+\\r', async () => {
		act(() => {
			root.render(<MobileBubbleChat sessionId='sess-1' />)
		})
		expect(wsInstances).toHaveLength(1)

		const textarea = container.querySelector('textarea')!
		const sendBtn = container.querySelector('button')!

		// React synthetic onChange requires nativeInputValueSetter to properly simulate
		// Use Object.getOwnPropertyDescriptor to get the native setter
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			window.HTMLTextAreaElement.prototype,
			'value',
		)?.set
		if (nativeInputValueSetter) {
			nativeInputValueSetter.call(textarea, 'ls -la')
		} else {
			// Fallback: use Object.defineProperty
			Object.defineProperty(textarea, 'value', {configurable: true, writable: true, value: 'ls -la'})
		}

		// Fire React's synthetic change event
		await act(async () => {
			textarea.dispatchEvent(new Event('input', {bubbles: true}))
			textarea.dispatchEvent(new Event('change', {bubbles: true}))
		})

		// Click send
		await act(async () => {
			sendBtn.click()
		})

		expect(wsInstances[0].sendStdin).toHaveBeenCalledWith('ls -la\r')
	})

	it('Test 13 — multiple bubbles accumulate: 2 onStdout calls → 2 assistant bubbles', async () => {
		act(() => {
			root.render(<MobileBubbleChat sessionId='sess-1' />)
		})
		expect(wsInstances).toHaveLength(1)

		await act(async () => {
			wsInstances[0].onStdout('line one\r\n')
		})
		await act(async () => {
			wsInstances[0].onStdout('line two\r\n')
		})

		const bubbles = container.querySelectorAll('[data-role="assistant"]')
		expect(bubbles.length).toBe(2)
	})

	it('Test 14 — legacy-ai-chat-panel deleted: no production source imports it', () => {
		const {readFileSync, readdirSync, statSync} = require('node:fs')
		const {join} = require('node:path')
		const {resolve} = require('node:path')

		function walk(dir: string): string[] {
			const results: string[] = []
			try {
				for (const entry of readdirSync(dir)) {
					const full = join(dir, entry)
					const stat = statSync(full)
					if (stat.isDirectory()) {
						if (entry === 'node_modules' || entry === 'dist') continue
						results.push(...walk(full))
					} else if (
						(entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
						!entry.endsWith('.test.tsx') &&
						!entry.endsWith('.test.ts')
					) {
						results.push(full)
					}
				}
			} catch {
				/* ignore */
			}
			return results
		}

		const SRC_ROOT = resolve(__dirname, '..', '..')
		const files = walk(SRC_ROOT)
		const importers = files.filter((f: string) => {
			try {
				const src = readFileSync(f, 'utf8')
				return src
					.split(/\r?\n/)
					.some((line: string) => /^\s*import\s.*legacy-ai-chat-panel/.test(line))
			} catch {
				return false
			}
		})
		// After 181-04 deletes the file, count should be 0
		expect(importers).toHaveLength(0)
	})
})
