// @vitest-environment jsdom
//
// Phase 167-04 — chat-mobile route unit tests + D-V35-K single-import
// invariant lock.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount.

import {readFileSync, readdirSync, statSync} from 'node:fs'
import {resolve, join} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Mock the legacy AI chat panel ─────────────────────────────────────────
//
// The real component is 750 lines and pulls in tRPC, react-router-dom,
// `useAgentSocket`, etc. — none of which matter for this route-composition
// test. Substitute a sentinel <div>.

vi.mock('@/routes/ai-chat/legacy-ai-chat-panel', () => ({
	default: () => <div data-testid='legacy-ai-chat-panel'>LegacyAiChatPanel sentinel</div>,
}))

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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

describe('ChatMobileRoute', () => {
	it('renders without throwing', () => {
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		expect(container.textContent).toMatch(/LegacyAiChatPanel sentinel/)
	})

	it('renders the legacy panel sentinel exactly once', () => {
		act(() => {
			root.render(<ChatMobileRoute />)
		})
		const sentinels = container.querySelectorAll('[data-testid="legacy-ai-chat-panel"]')
		expect(sentinels).toHaveLength(1)
	})
})

// ── D-V35-K — Single-import invariant ──────────────────────────────────────
//
// The legacy panel (relocated to routes/ai-chat/legacy-ai-chat-panel.tsx in
// Plan 167-04) must be imported in EXACTLY ONE production-source file:
// routes/chat-mobile/index.tsx.

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
