// @vitest-environment jsdom
//
// Phase 174-03 — ItemTreeRow unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount via
// act(). No mocks needed; the component is pure (icon + label + token
// classes), and lucide-react renders real SVGs which we detect by class.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {ItemTreeRow} from './ItemTreeRow'

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

// Fixture: a minimal Item-shape object. The real shape (tree-shape.ts)
// has more fields, but ItemTreeRow only reads .type + .name.
function fakeItem(type: 'project' | 'agent' | 'chat', name = 'X') {
	return {
		type,
		name,
		id: 'x',
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		userId: 'admin',
	}
}

// ── Behaviour tests ───────────────────────────────────────────────────────

describe('ItemTreeRow — per-type styling', () => {
	it('B1: type="project" applies font-semibold + text-accent-amber to the row', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('project', 'My Project')} />)
		})
		expect(container.innerHTML).toContain('font-semibold')
		expect(container.innerHTML).toContain('text-accent-amber')
		expect(container.textContent).toContain('My Project')
	})

	it('B2: type="agent" applies font-medium + text-accent-blue to the row', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('agent', 'My Agent')} />)
		})
		expect(container.innerHTML).toContain('font-medium')
		expect(container.innerHTML).toContain('text-accent-blue')
		expect(container.textContent).toContain('My Agent')
	})

	it('B3: type="chat" applies text-text-secondary at the root', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('chat', 'My Chat')} />)
		})
		expect(container.innerHTML).toContain('text-text-secondary')
		expect(container.textContent).toContain('My Chat')
	})

	it('B4: type="project" renders the FolderKanban lucide icon', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('project')} />)
		})
		// lucide-react @ 0.288.0 overwrites its default `lucide lucide-<icon>`
		// class when `className` is supplied; ItemTreeRow.tsx re-adds
		// `lucide-folder-kanban` explicitly so this query stays meaningful.
		expect(container.querySelector('.lucide-folder-kanban')).not.toBeNull()
	})

	it('B5: type="agent" renders the Bot lucide icon', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('agent')} />)
		})
		expect(container.querySelector('.lucide-bot')).not.toBeNull()
	})

	it('B6: type="chat" renders the MessageSquare lucide icon', () => {
		act(() => {
			root.render(<ItemTreeRow item={fakeItem('chat')} />)
		})
		expect(container.querySelector('.lucide-message-square')).not.toBeNull()
	})

	it('B7: null/undefined item renders nothing (no crash)', () => {
		act(() => {
			root.render(<ItemTreeRow item={null} />)
		})
		expect(container.children.length).toBe(0)
		act(() => {
			root.render(<ItemTreeRow item={undefined} />)
		})
		expect(container.children.length).toBe(0)
	})
})

// ── Source-text invariants (dark/light parity via token usage) ────────────

describe('ItemTreeRow — source-text invariants (dark/light token parity)', () => {
	const SRC = readFileSync(resolve(__dirname, 'ItemTreeRow.tsx'), 'utf8')

	it('B8: no hardcoded hex colors AND all 3 token branches present AND lucide-react import', () => {
		// No hex colors — tokens only, so dark mode flips automatically via
		// body.dark overrides in tokens.css.
		expect(SRC).not.toMatch(/#[0-9a-fA-F]{6}/)

		// All three D-V38-O palette branches present.
		expect(SRC).toMatch(/accent-amber/)
		expect(SRC).toMatch(/accent-blue/)
		expect(SRC).toMatch(/text-secondary/)

		// Icons come from lucide-react (not @tabler/icons-react or similar).
		expect(SRC).toMatch(/from 'lucide-react'/)
	})
})
