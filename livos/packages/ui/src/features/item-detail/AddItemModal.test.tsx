// @vitest-environment jsdom
//
// Phase 175-01 / 175-02 — AddItemModal tests.
//
// 175-01: 6 scaffold assertions (B-01-1..B-01-6) — type picker + parent dropdown.
// 175-02: 10 form/mutation assertions (B-02-1..B-02-10) — per-type forms,
//         vault.items.create payload shape, sonner toast on success/error.
//
// Pattern mirrors 174-04 SidebarTree.drag.test.tsx verbatim:
//   - vi.hoisted() namespace for shared spies/captures (avoids TDZ on
//     vitest's mock-hoisted factories)
//   - createRoot + act() mount/unmount (no @testing-library — D-NO-NEW-DEPS)
//   - mocks @/trpc/trpc + sonner

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

const H = vi.hoisted(() => ({
	listData: {items: [] as any[]} as {items: any[]} | undefined,
	createMutationOptions: {} as {
		onSuccess?: (data: {item: {id: string; name: string; type: string}}) => void
		onError?: (err: {message?: string}) => void
	},
	createMutate: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}))

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		vault: {
			items: {
				list: {
					useQuery: (_input: unknown, _opts: any) => ({
						data: H.listData,
						refetch: vi.fn(),
					}),
				},
				create: {
					useMutation: (opts: any) => {
						H.createMutationOptions = opts ?? {}
						return {mutate: H.createMutate, isPending: false}
					},
				},
			},
		},
	},
}))

vi.mock('sonner', () => ({
	toast: {success: H.toastSuccess, error: H.toastError, warning: vi.fn()},
}))

function fakeItem(p: {id: string; type: 'project' | 'agent' | 'chat'; name: string}) {
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

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	H.listData = {
		items: [
			fakeItem({id: 'pppppppppppppppppppp1', type: 'project', name: 'Demo Project'}),
			fakeItem({id: 'aaaaaaaaaaaaaaaaaaaa1', type: 'agent', name: 'Demo Agent'}),
			fakeItem({id: 'cccccccccccccccccccc1', type: 'chat', name: 'Demo Chat'}),
		],
	}
	H.createMutate.mockReset()
	H.createMutationOptions = {}
	H.toastSuccess.mockReset()
	H.toastError.mockReset()
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
	// Radix portals — purge any leftover portal nodes between tests.
	document.body.querySelectorAll('[data-radix-portal]').forEach((n) => n.remove())
})

import {AddItemModal} from './AddItemModal'

// ── Helper: jsdom needs both 'input' + 'change' events for React onChange ──
function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, val: string) {
	const proto =
		input instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype
	const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
	nativeSetter.call(input, val)
	input.dispatchEvent(new Event('input', {bubbles: true}))
	input.dispatchEvent(new Event('change', {bubbles: true}))
}

describe('AddItemModal — Phase 175-01 scaffold', () => {
	it('B-01-1: open=false renders nothing', () => {
		act(() => {
			root.render(<AddItemModal open={false} onClose={vi.fn()} />)
		})
		expect(document.body.querySelector('[data-testid="add-item-modal"]')).toBeNull()
	})

	it('B-01-2: open=true renders the modal content', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		expect(document.body.querySelector('[data-testid="add-item-modal"]')).not.toBeNull()
	})

	it('B-01-3: three type-picker cards are rendered', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		const cards = document.body.querySelectorAll('[data-testid^="type-card-"]')
		expect(cards.length).toBe(3)
		expect(document.body.querySelector('[data-testid="type-card-project"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-agent"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-chat"]')).not.toBeNull()
	})

	it('B-01-4: clicking project type card invokes onTypeSelected("project")', () => {
		const onTypeSelected = vi.fn()
		act(() => {
			root.render(
				<AddItemModal
					open={true}
					onClose={vi.fn()}
					onTypeSelected={onTypeSelected}
				/>,
			)
		})
		const card = document.body.querySelector(
			'[data-testid="type-card-project"]',
		) as HTMLElement | null
		expect(card).not.toBeNull()
		act(() => {
			card!.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(onTypeSelected).toHaveBeenCalledTimes(1)
		expect(onTypeSelected).toHaveBeenCalledWith('project')
	})

	it('B-01-5: parent dropdown has Main Liv as topmost option + lists live items', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		const select = document.body.querySelector(
			'[data-testid="parent-select"]',
		) as HTMLSelectElement | null
		expect(select).not.toBeNull()
		const options = Array.from(select!.querySelectorAll('option'))
		expect(options.length).toBeGreaterThanOrEqual(4)
		// First option MUST be Main Liv.
		expect(options[0].value).toBe('main-liv')
		expect(options[0].textContent).toMatch(/Main Liv/)
	})

	it('B-01-6: source-text invariants — Radix Dialog + tRPC list + MAIN_LIV_ID + onTypeSelected prop', () => {
		const src = readFileSync(resolve(__dirname, 'AddItemModal.tsx'), 'utf8')
		expect(src).toMatch(/from '@radix-ui\/react-dialog'/)
		expect(src).toMatch(/trpcReact\.vault\.items\.list\.useQuery/)
		expect(src).toMatch(/MAIN_LIV_ID/)
		expect(src).toMatch(/onTypeSelected/)
	})
})

describe('AddItemModal — Phase 175-02 form + mutation flow', () => {
	it('B-02-1: after clicking project type-card, the project form is rendered and picker is gone', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		const card = document.body.querySelector(
			'[data-testid="type-card-project"]',
		) as HTMLElement
		act(() => {
			card.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(document.body.querySelector('[data-testid="form-step-project"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-project"]')).toBeNull()
	})

	it('B-02-2: Back button returns to type-picker', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-project"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		const back = document.body.querySelector('[data-testid="form-back"]') as HTMLElement
		expect(back).not.toBeNull()
		act(() => {
			back.dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(document.body.querySelector('[data-testid="form-step-project"]')).toBeNull()
		expect(document.body.querySelector('[data-testid="type-card-project"]')).not.toBeNull()
	})

	it('B-02-3: project form has name + cwd + template inputs with proper options', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-project"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		expect(document.body.querySelector('[data-testid="project-name-input"]')).not.toBeNull()
		expect(document.body.querySelector('[data-testid="project-cwd-input"]')).not.toBeNull()
		const tmplSelect = document.body.querySelector(
			'[data-testid="project-template-select"]',
		) as HTMLSelectElement
		expect(tmplSelect).not.toBeNull()
		const optionValues = Array.from(tmplSelect.querySelectorAll('option'))
			.map((o) => o.value)
			.join('|')
		expect(optionValues).toMatch(/blank/)
		expect(optionValues).toMatch(/git-clone/)
		expect(optionValues).toMatch(/\.planning/)
	})

	it('B-02-4: submitting project form with empty name does NOT call mutate; form-error rendered', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-project"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		const form = document.body.querySelector(
			'[data-testid="form-step-project"]',
		) as HTMLFormElement
		act(() => {
			form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
		})
		expect(H.createMutate).not.toHaveBeenCalled()
		expect(document.body.querySelector('[data-testid="form-error"]')).not.toBeNull()
	})

	it('B-02-5: submitting valid project form calls mutate with correct payload (no schedule/ccSessionId)', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-project"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		const nameInput = document.body.querySelector(
			'[data-testid="project-name-input"]',
		) as HTMLInputElement
		const cwdInput = document.body.querySelector(
			'[data-testid="project-cwd-input"]',
		) as HTMLInputElement
		act(() => {
			setInputValue(nameInput, 'My Proj')
			setInputValue(cwdInput, '/home/u/proj')
		})
		const form = document.body.querySelector(
			'[data-testid="form-step-project"]',
		) as HTMLFormElement
		act(() => {
			form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
		})
		expect(H.createMutate).toHaveBeenCalledTimes(1)
		const payload = H.createMutate.mock.calls[0][0]
		expect(payload).toEqual({
			type: 'project',
			name: 'My Proj',
			parentId: null,
			cwd: '/home/u/proj',
		})
		expect(payload.schedule).toBeUndefined()
		expect(payload.ccSessionId).toBeUndefined()
	})

	it('B-02-6: onSuccess triggers toast.success + onItemCreated + onClose', () => {
		const onClose = vi.fn()
		const onItemCreated = vi.fn()
		act(() => {
			root.render(
				<AddItemModal
					open={true}
					onClose={onClose}
					onItemCreated={onItemCreated}
				/>,
			)
		})
		// Drive into form state so the mutation is wired (state-irrelevant — onSuccess fires via captured opts).
		expect(H.createMutationOptions.onSuccess).toBeDefined()
		act(() => {
			H.createMutationOptions.onSuccess!({
				item: {id: 'pppppppppppppppppppp9', name: 'Created Proj', type: 'project'},
			})
		})
		expect(H.toastSuccess).toHaveBeenCalledTimes(1)
		expect(onItemCreated).toHaveBeenCalledTimes(1)
		expect(onItemCreated).toHaveBeenCalledWith({
			id: 'pppppppppppppppppppp9',
			name: 'Created Proj',
			type: 'project',
		})
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('B-02-7: onError triggers toast.error and does NOT close the modal', () => {
		const onClose = vi.fn()
		act(() => {
			root.render(<AddItemModal open={true} onClose={onClose} />)
		})
		expect(H.createMutationOptions.onError).toBeDefined()
		act(() => {
			H.createMutationOptions.onError!({message: 'boom'})
		})
		expect(H.toastError).toHaveBeenCalledTimes(1)
		expect(H.toastError.mock.calls[0][0]).toBe('boom')
		expect(onClose).not.toHaveBeenCalled()
	})

	it('B-02-8: chat form auto-gen name when input is blank', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-chat"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		const form = document.body.querySelector(
			'[data-testid="form-step-chat"]',
		) as HTMLFormElement
		act(() => {
			form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
		})
		expect(H.createMutate).toHaveBeenCalledTimes(1)
		const payload = H.createMutate.mock.calls[0][0]
		expect(payload.type).toBe('chat')
		expect(payload.name).toMatch(/^Chat \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
		expect(payload.cwd).toBeUndefined()
		expect(payload.schedule).toBeUndefined()
	})

	it('B-02-9: agent form sends type+name+schedule (no cwd/ccSessionId)', () => {
		act(() => {
			root.render(<AddItemModal open={true} onClose={vi.fn()} />)
		})
		act(() => {
			;(
				document.body.querySelector('[data-testid="type-card-agent"]') as HTMLElement
			).dispatchEvent(new MouseEvent('click', {bubbles: true}))
		})
		const nameInput = document.body.querySelector(
			'[data-testid="agent-name-input"]',
		) as HTMLInputElement
		const schedInput = document.body.querySelector(
			'[data-testid="agent-schedule-input"]',
		) as HTMLInputElement
		act(() => {
			setInputValue(nameInput, 'My Agent')
			setInputValue(schedInput, '0 9 * * *')
		})
		const form = document.body.querySelector(
			'[data-testid="form-step-agent"]',
		) as HTMLFormElement
		act(() => {
			form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
		})
		expect(H.createMutate).toHaveBeenCalledTimes(1)
		const payload = H.createMutate.mock.calls[0][0]
		expect(payload).toEqual({
			type: 'agent',
			name: 'My Agent',
			parentId: null,
			schedule: '0 9 * * *',
		})
		expect(payload.cwd).toBeUndefined()
		expect(payload.ccSessionId).toBeUndefined()
	})

	it('B-02-10: source-text invariants — create mutation + sonner + toasts + onItemCreated', () => {
		const src = readFileSync(resolve(__dirname, 'AddItemModal.tsx'), 'utf8')
		expect(src).toMatch(/vault\.items\.create\.useMutation/)
		expect(src).toMatch(/from 'sonner'/)
		expect(src).toMatch(/toast\.success/)
		expect(src).toMatch(/toast\.error/)
		expect(src).toMatch(/onItemCreated/)
	})
})
