// @vitest-environment jsdom
//
// Phase 167-04 — chat-mobile route unit tests + D-V35-K single-import
// invariant lock.
// Phase 181-01 — Route branch tests (tablet/phone/desktop).
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount.

import {readFileSync, readdirSync, statSync} from 'node:fs'
import {resolve, join} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mock the legacy AI chat panel ─────────────────────────────────────────
vi.mock('@/routes/ai-chat/legacy-ai-chat-panel', () => ({
	default: () => <div data-testid='legacy-ai-chat-panel'>LegacyAiChatPanel sentinel</div>,
}))

// ── Mock CcTerminal ───────────────────────────────────────────────────────
vi.mock('@/features/cc-terminal/CcTerminal', () => ({
	CcTerminal: ({sessionId}: {sessionId: string}) => (
		<div data-testid='cc-terminal' data-session={sessionId}>
			CcTerminal sentinel
		</div>
	),
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
const mockDeviceClass = {value: 'desktop' as 'phone' | 'tablet' | 'desktop'}
vi.mock('@/hooks/useDeviceClass', () => ({
	useDeviceClass: () => mockDeviceClass.value,
	DeviceClass: {},
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	mockDeviceClass.value = 'desktop'
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

// ── Phase 167-04 baseline tests ───────────────────────────────────────────

describe('ChatMobileRoute (Phase 167-04 baseline)', () => {
	it('renders without throwing', () => {
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		// desktop branch renders legacy panel
		expect(container.textContent).toMatch(/LegacyAiChatPanel sentinel/)
	})

	it('renders the legacy panel sentinel exactly once (desktop fallback)', () => {
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		const sentinels = container.querySelectorAll('[data-testid="legacy-ai-chat-panel"]')
		expect(sentinels).toHaveLength(1)
	})
})

// ── Phase 181-01 route branch tests ──────────────────────────────────────

describe('ChatMobileRoute — device class branching (Phase 181-01)', () => {
	it('Test 7 — tablet: renders CcTerminal section', () => {
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

	it('Test 8 — phone: renders mobile-bubble-chat (not placeholder div)', () => {
		mockDeviceClass.value = 'phone'
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		// After Plan 181-04 wires MobileBubbleChat, look for the component
		// Before 181-04: accepts placeholder div with data-testid
		const bubble = container.querySelector('[data-testid="mobile-bubble-chat-placeholder"], [data-testid="mobile-bubble-chat"]')
		expect(bubble).not.toBeNull()
		// Does NOT render legacy panel
		const legacy = container.querySelector('[data-testid="legacy-ai-chat-panel"]')
		expect(legacy).toBeNull()
	})

	it('Test 9 — desktop: renders LegacyAiChatPanel', () => {
		mockDeviceClass.value = 'desktop'
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		const legacy = container.querySelector('[data-testid="legacy-ai-chat-panel"]')
		expect(legacy).not.toBeNull()
	})
})

// ── D-V35-K — Single-import invariant ──────────────────────────────────────
//
// After Phase 181-04 deletes the legacy panel, this test is replaced by the
// "0 imports" check. Until then, exactly 1 production import must exist.

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

describe('D-V35-K — legacy panel single-import invariant', () => {
	// Resolve to livos/packages/ui/src/ (4 levels up from this test file).
	const SRC_ROOT = resolve(__dirname, '..', '..')

	it('legacy-ai-chat-panel is imported in EXACTLY one production source file', () => {
		const files = walk(SRC_ROOT)
		const importers = files.filter((f) => {
			const src = readFileSync(f, 'utf8')
			// Only count actual import statements, not comments.
			return src
				.split(/\r?\n/)
				.some((line) => /^\s*import\s.*legacy-ai-chat-panel/.test(line))
		})
		expect(importers).toHaveLength(1)
		const winner = importers[0].replace(/\\/g, '/')
		expect(winner).toMatch(/routes\/chat-mobile\/index\.tsx$/)
	})
})
