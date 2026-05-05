// @vitest-environment jsdom
//
// Phase 76 Plan 76-04 — AgentCard component tests (TDD RED → GREEN).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04 + 68-03 precedent).
// Per that precedent, this file ships **direct react-dom/client renders**
// against the jsdom DOM — covering the same behaviours that
// @testing-library/react would (mount, query by tag/text content,
// dispatch click events) without requiring a new dependency.
//
// Coverage (must_haves: 5 cases per 76-04-PLAN.md):
//   1. renders mascot emoji + name + description
//   2. renders one Badge per tag (3 tags → 3 badge nodes)
//   3. clicking the clone button calls onClone(template.slug)
//   4. button is disabled when isCloning=true
//   5. description paragraph carries `line-clamp-2` className
//
// References:
//   - .planning/phases/76-agent-marketplace-onboarding-tour/76-04-PLAN.md
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx
//     — canonical RTL-absent harness (mount + click via react-dom/client + act())

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {AgentCard, type AgentTemplate} from './agent-card'

// ─────────────────────────────────────────────────────────────────────
// Test harness — minimal react-dom/client mount that mimics
// @testing-library/react's render/cleanup lifecycle.
// ─────────────────────────────────────────────────────────────────────

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

const mkTemplate = (overrides: Partial<AgentTemplate> = {}): AgentTemplate => ({
	slug: 'researcher',
	name: 'Researcher',
	description: 'Searches the web, summarizes sources, cites findings.',
	systemPrompt: 'You are a researcher.',
	toolsEnabled: ['web-search', 'web-crawl'],
	tags: ['research'],
	mascotEmoji: '🔬',
	cloneCount: 12,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	...overrides,
})

const renderCard = (props: Parameters<typeof AgentCard>[0]) => {
	act(() => {
		root!.render(<AgentCard {...props} />)
	})
	return container!
}

// ─────────────────────────────────────────────────────────────────────
// Test 1 — renders mascot emoji + name + description
// ─────────────────────────────────────────────────────────────────────

describe('AgentCard rendering', () => {
	it('renders mascot emoji, name, and description', () => {
		const c = renderCard({
			template: mkTemplate({
				name: 'Researcher',
				description: 'Searches the web, summarizes sources, cites findings.',
				mascotEmoji: '🔬',
			}),
			onClone: () => {},
			isCloning: false,
		})
		expect(c.textContent).toContain('🔬')
		expect(c.textContent).toContain('Researcher')
		expect(c.textContent).toContain('Searches the web, summarizes sources, cites findings.')
	})

	// ─────────────────────────────────────────────────────────────────
	// Test 2 — renders one Badge per tag (3 tags → 3 badge nodes)
	// ─────────────────────────────────────────────────────────────────

	it('renders one badge per tag', () => {
		const c = renderCard({
			template: mkTemplate({tags: ['research', 'computer-use', 'data']}),
			onClone: () => {},
			isCloning: false,
		})
		const badges = c.querySelectorAll('[data-testid="agent-card-tag"]')
		expect(badges.length).toBe(3)
		const badgeText = Array.from(badges).map((b) => b.textContent)
		expect(badgeText).toContain('research')
		expect(badgeText).toContain('computer-use')
		expect(badgeText).toContain('data')
	})

	// ─────────────────────────────────────────────────────────────────
	// Test 5 — description paragraph carries `line-clamp-2`
	// (rendered before interaction tests so RED on missing className lands early)
	// ─────────────────────────────────────────────────────────────────

	it('applies line-clamp-2 to the description paragraph', () => {
		const c = renderCard({
			template: mkTemplate({
				description:
					'A very long description that would otherwise wrap onto more than two visible lines and should therefore be clipped with an ellipsis via Tailwind line-clamp-2 utility.',
			}),
			onClone: () => {},
			isCloning: false,
		})
		const desc = c.querySelector('[data-testid="agent-card-description"]') as HTMLElement
		expect(desc).not.toBeNull()
		expect(desc.className).toContain('line-clamp-2')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Test 3 — clicking the clone button calls onClone(template.slug)
// Test 4 — button is disabled when isCloning=true
// ─────────────────────────────────────────────────────────────────────

describe('AgentCard interactions', () => {
	it('calls onClone with template.slug when the button is clicked', () => {
		const onClone = vi.fn()
		const c = renderCard({
			template: mkTemplate({slug: 'data-analyst'}),
			onClone,
			isCloning: false,
		})
		const btn = c.querySelector('[data-testid="agent-card-clone-button"]') as HTMLButtonElement
		expect(btn).not.toBeNull()
		expect(btn.disabled).toBe(false)
		act(() => {
			btn.click()
		})
		expect(onClone).toHaveBeenCalledTimes(1)
		expect(onClone).toHaveBeenCalledWith('data-analyst')
	})

	it('disables the button when isCloning=true and shows the Cloning… label', () => {
		const onClone = vi.fn()
		const c = renderCard({
			template: mkTemplate(),
			onClone,
			isCloning: true,
		})
		const btn = c.querySelector('[data-testid="agent-card-clone-button"]') as HTMLButtonElement
		expect(btn).not.toBeNull()
		expect(btn.disabled).toBe(true)
		expect(btn.textContent).toMatch(/Cloning/i)
		// Defensive: clicking a disabled button should not invoke onClone
		act(() => {
			btn.click()
		})
		expect(onClone).not.toHaveBeenCalled()
	})
})
