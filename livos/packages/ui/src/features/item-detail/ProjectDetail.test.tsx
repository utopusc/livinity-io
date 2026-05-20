// @vitest-environment jsdom
//
// Phase 175-03 — ProjectDetail behaviour tests (5 assertions B-03-P-1..B-03-P-5).
//
// Pattern mirrors AddItemModal.test.tsx (175-01/02) — createRoot + act mount,
// no @testing-library (D-NO-NEW-DEPS). Streamdown is mocked because the real
// renderer pulls in remark/rehype plumbing overkill for behaviour assertions.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('streamdown', () => ({
	Streamdown: (props: {children?: string; content?: string}) => (
		<div data-testid='streamdown-stub'>{props.children ?? props.content ?? ''}</div>
	),
	default: (props: {children?: string; content?: string}) => (
		<div data-testid='streamdown-stub'>{props.children ?? props.content ?? ''}</div>
	),
}))

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
		/* noop */
	}
	container.remove()
})

import {ProjectDetail} from './ProjectDetail'

function fakeChild(p: {id: string; type: 'project' | 'agent' | 'chat'; name: string}) {
	return {
		...p,
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1,
		userId: 'admin',
	}
}

describe('ProjectDetail — Phase 175-03', () => {
	it('B-03-P-1: readme null → empty state; readme set → content rendered', () => {
		act(() => {
			root.render(<ProjectDetail item={{name: 'p'}} readme={null} />)
		})
		expect(container.querySelector('[data-testid="readme-empty"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="readme-content"]')).toBeNull()
		act(() => {
			root.render(<ProjectDetail item={{name: 'p'}} readme='# Hello' />)
		})
		expect(container.querySelector('[data-testid="readme-empty"]')).toBeNull()
		expect(container.querySelector('[data-testid="readme-content"]')).not.toBeNull()
	})

	it('B-03-P-2: CLAUDE.md section is collapsed by default', () => {
		act(() => {
			root.render(<ProjectDetail item={{name: 'p'}} claudeMd='# Rules' />)
		})
		const details = container.querySelector(
			'[data-testid="claude-md-details"]',
		) as HTMLDetailsElement | null
		expect(details).not.toBeNull()
		expect(details!.open).toBe(false)
	})

	it('B-03-P-3: Tasks render as checkboxes; click invokes onTaskToggle', () => {
		const onTaskToggle = vi.fn()
		act(() => {
			root.render(
				<ProjectDetail
					item={{name: 'p'}}
					tasks={[
						{id: 't1', title: 'task one', done: false},
						{id: 't2', title: 'task two', done: true},
					]}
					onTaskToggle={onTaskToggle}
				/>,
			)
		})
		const rows = container.querySelectorAll('[data-testid^="task-row-"]')
		expect(rows.length).toBe(2)
		const cb1 = container.querySelector(
			'[data-testid="task-row-t1"] input[type="checkbox"]',
		) as HTMLInputElement
		const cb2 = container.querySelector(
			'[data-testid="task-row-t2"] input[type="checkbox"]',
		) as HTMLInputElement
		expect(cb1.checked).toBe(false)
		expect(cb2.checked).toBe(true)
		act(() => {
			cb1.click()
		})
		expect(onTaskToggle).toHaveBeenCalledTimes(1)
		expect(onTaskToggle).toHaveBeenCalledWith('t1', true)
	})

	it('B-03-P-4: Children list renders per-type lucide icons', () => {
		act(() => {
			root.render(
				<ProjectDetail
					item={{name: 'p'}}
					childItems={[
						fakeChild({id: 'c1', type: 'project', name: 'sub-proj'}),
						fakeChild({id: 'c2', type: 'agent', name: 'sub-agent'}),
						fakeChild({id: 'c3', type: 'chat', name: 'sub-chat'}),
					]}
				/>,
			)
		})
		const list = container.querySelector('[data-testid="children-list"]')
		expect(list).not.toBeNull()
		expect(list!.querySelector('.lucide-folder-kanban')).not.toBeNull()
		expect(list!.querySelector('.lucide-bot')).not.toBeNull()
		expect(list!.querySelector('.lucide-message-square')).not.toBeNull()
	})

	it('B-03-P-5: source-text invariants — streamdown + lucide classes + onTaskToggle', () => {
		const src = readFileSync(resolve(__dirname, 'ProjectDetail.tsx'), 'utf8')
		expect(src).toMatch(/from 'streamdown'/)
		expect(src).toMatch(/lucide-folder-kanban/)
		expect(src).toMatch(/lucide-bot/)
		expect(src).toMatch(/lucide-message-square/)
		expect(src).toMatch(/onTaskToggle/)
	})
})
