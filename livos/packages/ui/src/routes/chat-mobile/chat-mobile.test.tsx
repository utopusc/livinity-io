// @vitest-environment jsdom
//
// Phase 167-04 — chat-mobile route unit tests.
// Phase 181-01 — Route branch tests (tablet/phone/desktop).
// Phase 181-04 — Legacy panel DELETED; D-V35-K invariant updated to 0 imports.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount.

import {readFileSync, readdirSync, statSync} from 'node:fs'
import {resolve, join} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mock CcTerminal ───────────────────────────────────────────────────────
import React from 'react'
vi.mock('@/features/cc-terminal/CcTerminal', () => ({
	CcTerminal: React.forwardRef(({sessionId}: {sessionId: string}, _ref: any) => (
		<div data-testid='cc-terminal' data-session={sessionId}>
			CcTerminal sentinel
		</div>
	)),
	CcTerminalHandle: {},
}))

// ── Mock MobileTerminalKeyBar ─────────────────────────────────────────────
vi.mock('@/features/mobile-terminal/MobileTerminalKeyBar', () => ({
	MobileTerminalKeyBar: () => <div data-testid='mobile-key-bar'>KeyBar sentinel</div>,
}))

// ── Mock MobileBubbleChat ─────────────────────────────────────────────────
vi.mock('@/features/mobile-terminal/MobileBubbleChat', () => ({
	MobileBubbleChat: ({sessionId}: {sessionId: string}) => (
		<div data-testid='mobile-bubble-chat' data-session={sessionId}>
			MobileBubbleChat sentinel
		</div>
	),
}))

// ── useDeviceClass mock — controlled per test ─────────────────────────────
const mockDeviceClass = {value: 'tablet' as 'phone' | 'tablet' | 'desktop'}
vi.mock('@/hooks/useDeviceClass', () => ({
	useDeviceClass: () => mockDeviceClass.value,
	DeviceClass: {},
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	mockDeviceClass.value = 'tablet'
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

import ChatMobileRoute from './index'

// ── Route rendering tests ─────────────────────────────────────────────────

describe('ChatMobileRoute — device class branching (Phase 181-01/04)', () => {
	it('renders without throwing (tablet default)', () => {
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		expect(container.querySelector('div')).not.toBeNull()
	})

	it('Test 7 — tablet: renders CcTerminal + key bar', () => {
		mockDeviceClass.value = 'tablet'
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		const terminal = container.querySelector('[data-testid="cc-terminal"]')
		expect(terminal).not.toBeNull()
		// Does NOT render legacy panel
		const legacy = container.querySelector('[data-testid="legacy-ai-chat-panel"]')
		expect(legacy).toBeNull()
	})

	it('Test 8 — phone: renders MobileBubbleChat', () => {
		mockDeviceClass.value = 'phone'
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		const bubble = container.querySelector('[data-testid="mobile-bubble-chat"]')
		expect(bubble).not.toBeNull()
		// Does NOT render legacy panel
		const legacy = container.querySelector('[data-testid="legacy-ai-chat-panel"]')
		expect(legacy).toBeNull()
	})

	it('Test 9 — desktop: renders CcTerminal (desktop falls through to tablet branch)', () => {
		mockDeviceClass.value = 'desktop'
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		// Desktop uses the tablet/default branch (CcTerminal)
		const terminal = container.querySelector('[data-testid="cc-terminal"]')
		expect(terminal).not.toBeNull()
	})
})

// ── D-V35-K — legacy panel deleted invariant (Phase 181-04) ──────────────
//
// After Phase 181-04 deletes legacy-ai-chat-panel.tsx, the production-source
// import count drops to 0.

function walk(dir: string): string[] {
	const results: string[] = []
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		const stat = statSync(full)
		if (stat.isDirectory()) {
			if (entry === 'node_modules' || entry === 'dist') continue
			results.push(...walk(full))
		} else if (
			(entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
			!entry.endsWith('.test.tsx') &&
			!entry.endsWith('.test.ts') &&
			!entry.endsWith('.unit.test.tsx') &&
			!entry.endsWith('.unit.test.ts')
		) {
			results.push(full)
		}
	}
	return results
}

describe('D-V35-K — legacy panel deleted (Phase 181-04)', () => {
	const SRC_ROOT = resolve(__dirname, '..', '..')

	it('legacy-ai-chat-panel has 0 production-source imports (file deleted)', () => {
		const files = walk(SRC_ROOT)
		const importers = files.filter((f) => {
			const src = readFileSync(f, 'utf8')
			return src
				.split(/\r?\n/)
				.some((line) => /^\s*import\s.*legacy-ai-chat-panel/.test(line))
		})
		expect(importers).toHaveLength(0)
	})
})
