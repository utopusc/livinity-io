// @vitest-environment jsdom
//
// Phase 199-05 Task 2 — assistant.tsx tests (TDD RED).
//
// Locks the rebuilt <Assistant /> shell contract (D-199-17 / D-199-18 /
// D-199-19 / D-199-25 / D-199-26 / D-199-28 / D-199-29; RESEARCH B1 +
// Pattern 2 + Pitfall 5 + Pitfall 7):
//
//   1. With thread.isEmpty === true → outermost shell contains
//      [data-testid='liv-ai-empty-state'] AND <h2>'Liv AI'</h2> AND a
//      logo img with src='/figma-exports/liv-ai.svg' at h-16/w-16 AND
//      exactly ONE Composer (ComposerPrimitive.Root) mounted.
//   2. With thread.isEmpty === false → DOM does NOT contain
//      [data-testid='liv-ai-empty-state'] but does contain a Composer
//      mounted inside the chat (non-empty) branch (single mount).
//   3. EmptyStateMount overlay is GONE — no element with class names
//      `absolute inset-0` covering the message area in the empty branch
//      (Pitfall 5 regression-lock; D-199-28).
//   4. The exported Composer is imported from './composer' (single
//      shared component instance across both AuiIf branches — D-199-18 /
//      Pitfall 7 surrogate when state-flip mocking is brittle).
//   5. SuggestedPrompts content UNCHANGED from P198 — 4 chips render
//      with the locked default prompt texts (D-199-26).
//
// Per LivOS UI testing precedent (Plan 30-02 → 198-07 → 199-04), the UI
// package has D-NO-NEW-DEPS — `@testing-library/react` is NOT installed.
// Tests use direct react-dom/client mounts against jsdom + the inline
// `vi.mock(@assistant-ui/react)` factory.
//
// Mocking strategy: AssistantRuntimeProvider passes children through;
// AuiIf evaluates its `condition` callback against a hand-rolled state
// stub controlled by `mockState`. useAuiState reads from the same stub.
// useChatRuntime + AssistantChatTransport are stubbed so the runtime
// tree never tries to boot a real transport. useThread / useThread-
// Runtime / useComposerRuntime stay minimal — only the surface
// assistant.tsx touches.

import {act, type ReactNode} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

// Phase 199-07 — radix DropdownMenu (via LivAiModelPicker inside the new
// header bar) needs PointerEvent + Pointer-capture / scrollIntoView shims under
// jsdom. Mirrors the model-picker.test.tsx + header-bar.test.tsx pattern.
if (typeof (globalThis as {PointerEvent?: unknown}).PointerEvent === 'undefined') {
	class PointerEventShim extends MouseEvent {
		pointerType: string
		constructor(type: string, props: PointerEventInit = {}) {
			super(type, props)
			this.pointerType = props.pointerType ?? 'mouse'
		}
	}
	;(globalThis as {PointerEvent?: unknown}).PointerEvent = PointerEventShim
}
if (!HTMLElement.prototype.hasPointerCapture) {
	HTMLElement.prototype.hasPointerCapture = () => false
}
if (!HTMLElement.prototype.releasePointerCapture) {
	HTMLElement.prototype.releasePointerCapture = () => {}
}
if (!HTMLElement.prototype.setPointerCapture) {
	HTMLElement.prototype.setPointerCapture = () => {}
}
if (!HTMLElement.prototype.scrollIntoView) {
	HTMLElement.prototype.scrollIntoView = () => {}
}

// ─── Mutable mock state ─────────────────────────────────────────────────
// Updated per-test to drive AuiIf branching.
let mockState = {
	thread: {isEmpty: true, isRunning: false},
	composer: {isEmpty: true},
}

// ─── Mock @assistant-ui/react ───────────────────────────────────────────

vi.mock('@assistant-ui/react', () => {
	const AssistantRuntimeProvider = ({children}: {children: ReactNode}) => (
		<>{children}</>
	)
	const AuiIf = ({
		condition,
		children,
	}: {
		condition: (s: typeof mockState) => boolean
		children: ReactNode
	}) => (condition(mockState) ? <>{children}</> : null)
	const useAuiState = <T,>(selector: (s: typeof mockState) => T) =>
		selector(mockState)
	const useThread = <T,>(selector: (t: {messages: never[]}) => T) =>
		selector({messages: []})
	const useThreadRuntime = () => ({
		append: vi.fn(),
	})
	const useComposerRuntime = () => ({
		send: vi.fn(),
		reset: vi.fn(),
		setText: vi.fn(),
		getState: () => ({text: ''}),
	})
	// ComposerPrimitive.Root / Input / Send minimal pass-through stubs so
	// the Composer component renders into the DOM with the right testid.
	const ComposerPrimitive = {
		Root: ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) => (
			<form data-testid='composer-primitive-root' {...rest}>
				{children}
			</form>
		),
		Input: (props: Record<string, unknown>) => (
			<textarea data-testid='composer-primitive-input' {...props} />
		),
		Send: ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) => (
			<button
				type='submit'
				data-testid='composer-primitive-send'
				{...rest}
			>
				{children}
			</button>
		),
	}
	// ThreadPrimitive — Root/Viewport/Messages/ViewportFooter pass-through.
	const ThreadPrimitive = {
		Root: ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) => (
			<div data-testid='thread-primitive-root' {...rest}>
				{children}
			</div>
		),
		Viewport: ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) => (
			<div data-testid='thread-primitive-viewport' {...rest}>
				{children}
			</div>
		),
		Messages: () => <div data-testid='thread-primitive-messages' />,
		ViewportFooter: ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) => (
			<div data-testid='thread-primitive-viewport-footer' {...rest}>
				{children}
			</div>
		),
	}
	const MessagePrimitive = {
		Root: ({children}: {children?: ReactNode}) => <div>{children}</div>,
		Content: () => null,
	}
	// attachment-adapter.ts imports these classes; stub minimally so the
	// import resolves under the mocked module.
	class SimpleImageAttachmentAdapter {}
	class CompositeAttachmentAdapter {
		constructor(public adapters: unknown[]) {}
	}
	return {
		AssistantRuntimeProvider,
		AuiIf,
		useAuiState,
		useThread,
		useThreadRuntime,
		useComposerRuntime,
		ComposerPrimitive,
		ThreadPrimitive,
		MessagePrimitive,
		SimpleImageAttachmentAdapter,
		CompositeAttachmentAdapter,
	}
})

// ─── Mock @assistant-ui/react-ai-sdk ────────────────────────────────────
//
// Phase 199-07 — expose the AssistantChatTransport `body` callback so Test 6
// can invoke it and assert the {threadId, config:{modelName}} envelope.
// `lastTransportOpts` is reassigned per useChatRuntime() call so each render
// captures the current body function and selectedModel closure.

let lastTransportOpts: {body?: () => unknown} | null = null
vi.mock('@assistant-ui/react-ai-sdk', () => ({
	AssistantChatTransport: class AssistantChatTransport {
		constructor(public opts: {body?: () => unknown}) {
			lastTransportOpts = opts
		}
	},
	useChatRuntime: () => ({}),
}))

// ─── Mock @/trpc/trpc (matches thread-list-adapter.test.tsx pattern) ───

const mockMutateAsync = vi.fn(async () => ({ok: true}))
// Phase 199-07 — getActiveModel returns whatever mockActiveModelData is at
// render time; setActiveModel records every mutate() call so Test 8 can assert
// the call shape. Both default to a "loading / no-op" baseline that Test 7
// flips per-case.
let mockActiveModelData: {modelName: string} | undefined
const mockActiveModelRefetch = vi.fn()
const mockSetActiveModelMutate = vi.fn()
vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		mastra: {
			agent: {
				threads: {
					list: {
						useQuery: () => ({
							data: undefined,
							isLoading: false,
							refetch: vi.fn(),
						}),
					},
					delete: {
						useMutation: () => ({
							mutateAsync: mockMutateAsync,
							isPending: false,
						}),
					},
				},
				// Phase 199-07 wiring.
				getActiveModel: {
					useQuery: () => ({
						data: mockActiveModelData,
						isLoading: false,
						refetch: mockActiveModelRefetch,
					}),
				},
				setActiveModel: {
					useMutation: (_opts?: {onSuccess?: () => void}) => ({
						mutate: mockSetActiveModelMutate,
						isPending: false,
					}),
				},
			},
		},
	},
}))

// ─── Mock tool-renderers (heavy barrel — irrelevant to layout tests) ──

vi.mock('./tool-renderers', () => ({
	ToolRenderers: () => null,
}))

// ─── Mock devtools-mount (DEV-only, irrelevant in test) ───────────────

vi.mock('./devtools-mount', () => ({
	DevToolsMount: () => null,
}))

// ─── Mock @/components/assistant-ui/thread (legacy Thread; unused
// post-199-05 rebuild but kept importable for safety) ─────────────────

vi.mock('@/components/assistant-ui/thread', () => ({
	Thread: () => <div data-testid='legacy-thread' />,
}))

// Import AFTER all vi.mock factories run.
import {Assistant} from './assistant'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	mockState = {
		thread: {isEmpty: true, isRunning: false},
		composer: {isEmpty: true},
	}
	mockMutateAsync.mockClear()
	mockActiveModelData = undefined
	mockActiveModelRefetch.mockClear()
	mockSetActiveModelMutate.mockClear()
	lastTransportOpts = null
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

describe('Assistant — Phase 199-05 AuiIf-branched layout', () => {
	it('Test 1: thread.isEmpty === true → centered hero + Composer mounted ONCE', () => {
		mockState.thread.isEmpty = true
		act(() => {
			root.render(<Assistant />)
		})

		const empty = document.querySelector('[data-testid="liv-ai-empty-state"]')
		expect(empty).not.toBeNull()

		const h2 = empty!.querySelector('h2')
		expect(h2).not.toBeNull()
		expect(h2!.textContent?.trim()).toBe('Liv AI')

		const img = empty!.querySelector('img') as HTMLImageElement | null
		expect(img).not.toBeNull()
		expect(img!.getAttribute('src')).toBe('/figma-exports/liv-ai.svg')
		const cls = img!.getAttribute('class') ?? ''
		expect(cls).toMatch(/\bh-16\b/)
		expect(cls).toMatch(/\bw-16\b/)

		// Exactly ONE Composer (ComposerPrimitive.Root via the extracted
		// './composer' module — mock renders <form data-testid="composer-
		// primitive-root">) in the empty branch.
		const composers = document.querySelectorAll(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composers.length).toBe(1)
	})

	it('Test 2: thread.isEmpty === false → empty hero is gone; Composer mounted in chat branch', () => {
		mockState.thread.isEmpty = false
		act(() => {
			root.render(<Assistant />)
		})

		const empty = document.querySelector('[data-testid="liv-ai-empty-state"]')
		expect(empty).toBeNull()

		// Viewport from the non-empty branch is present.
		const viewport = document.querySelector(
			'[data-testid="thread-primitive-viewport"]',
		)
		expect(viewport).not.toBeNull()

		// Exactly ONE Composer in chat layout (inside ViewportFooter).
		const composers = document.querySelectorAll(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composers.length).toBe(1)

		// Composer is nested inside the ViewportFooter container.
		const footer = document.querySelector(
			'[data-testid="thread-primitive-viewport-footer"]',
		)
		expect(footer).not.toBeNull()
		expect(
			footer!.querySelector('[data-testid="composer-primitive-root"]'),
		).not.toBeNull()
	})

	it('Test 3: empty branch DOM has NO `absolute inset-0` overlay (Pitfall 5 regression-lock)', () => {
		mockState.thread.isEmpty = true
		act(() => {
			root.render(<Assistant />)
		})

		// The deleted EmptyStateMount used `absolute inset-0 z-10` on its
		// outer wrapper. Any element whose className contains BOTH
		// `absolute` AND `inset-0` is the old overlay pattern.
		const all = document.querySelectorAll('*')
		for (const el of Array.from(all)) {
			const cls = (el as HTMLElement).className
			if (typeof cls !== 'string') continue
			if (cls.includes('absolute') && cls.includes('inset-0')) {
				throw new Error(
					`Regression: found legacy EmptyStateMount-shaped overlay element with class="${cls}"`,
				)
			}
		}
	})

	it('Test 4: Composer module surrogate — assistant.tsx imports Composer from ./composer (D-199-18)', async () => {
		// Surrogate for the Pitfall 7 text-preservation test: rather than
		// flip AuiIf state mid-render (hard to do without a real runtime),
		// assert that the SAME Composer module is the one mounted by both
		// AuiIf branches. We do that by reading the file source for the
		// import literal — strong signal that one component is shared.
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const assistantPath = path.resolve(
			__dirname,
			'./assistant.tsx',
		)
		const src = await fs.readFile(assistantPath, 'utf-8')
		expect(src).toMatch(/from ['"]\.\/composer['"]/)
		expect(src).toMatch(/<Composer\s*\/?>/)
	})

	it('Test 5: SuggestedPrompts content unchanged from P198 — 4 locked chips render in empty state (D-199-26)', () => {
		mockState.thread.isEmpty = true
		act(() => {
			root.render(<Assistant />)
		})

		const chips = document.querySelectorAll(
			'[data-testid="liv-ai-suggested-prompts"] button',
		)
		expect(chips.length).toBe(4)
		const texts = Array.from(chips).map((b) => b.textContent?.trim())
		expect(texts).toEqual([
			'What is the weather in Istanbul?',
			'Take a screenshot of my screen',
			'List my open windows',
			'What can you do?',
		])
	})
})

// ─── Phase 199-07 — header bar + Redis-backed selectedModel wiring ───────

describe('Assistant — Phase 199-07 header bar + selectedModel wiring', () => {
	it('Test 6: header bar mounted ABOVE the 2-column layout (DOM order: header → flex-1)', () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.20-0309-fast'}
		act(() => {
			root.render(<Assistant />)
		})

		const header = document.querySelector(
			'[data-testid="liv-ai-header-bar"]',
		) as HTMLElement | null
		expect(header).not.toBeNull()
		// Header must be a sibling preceding the 2-column flex (role="application").
		const appShell = document.querySelector(
			'[role="application"][aria-label="Liv AI chat"]',
		) as HTMLElement | null
		expect(appShell).not.toBeNull()
		// DOM order check: header comes before appShell in document order.
		const order = header!.compareDocumentPosition(appShell!)
		// Node.DOCUMENT_POSITION_FOLLOWING === 4
		expect(order & 4).toBe(4)
	})

	it('Test 7: getActiveModel hydration — picker trigger reflects Redis value after effect', async () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.3'}
		await act(async () => {
			root.render(<Assistant />)
		})
		const trigger = document.querySelector(
			'[data-testid="liv-ai-model-picker-trigger"]',
		)
		expect(trigger).not.toBeNull()
		expect(trigger!.textContent).toContain('Grok 4.3')
	})

	it('Test 8: default model — picker shows Grok 4.20 Fast when getActiveModel returns undefined', () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = undefined
		act(() => {
			root.render(<Assistant />)
		})
		const trigger = document.querySelector(
			'[data-testid="liv-ai-model-picker-trigger"]',
		)
		expect(trigger).not.toBeNull()
		expect(trigger!.textContent).toContain('Grok 4.20 Fast')
	})

	it('Test 9: transport body callback envelope — body() returns {threadId, config:{modelName}}', async () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.3'}
		await act(async () => {
			root.render(<Assistant />)
		})
		expect(lastTransportOpts).not.toBeNull()
		expect(typeof lastTransportOpts!.body).toBe('function')
		const body = lastTransportOpts!.body!()
		expect(body).toMatchObject({
			config: {modelName: 'grok-4.3'},
		})
		// threadId is uuid-shaped from useThreadListAdapter (non-empty string).
		expect(typeof (body as {threadId?: unknown}).threadId).toBe('string')
		expect((body as {threadId: string}).threadId.length).toBeGreaterThan(0)
	})

	it('Test 10: clicking "+ New conversation" in header fires onSwitchToNewThread (mutates threadId in body envelope)', async () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.20-0309-fast'}
		await act(async () => {
			root.render(<Assistant />)
		})
		// Capture body envelope threadId BEFORE clicking new-thread.
		const before = lastTransportOpts!.body!() as {threadId: string}
		const beforeId = before.threadId
		expect(typeof beforeId).toBe('string')

		const newBtn = document.querySelector(
			'[data-testid="liv-ai-header-new-thread"]',
		) as HTMLButtonElement | null
		expect(newBtn).not.toBeNull()
		await act(async () => {
			newBtn!.click()
		})
		// After click, the same body callback (still pointing at the live closure)
		// returns a NEW threadId — proves onSwitchToNewThread fired and the
		// useThreadListAdapter state rotated.
		const after = lastTransportOpts!.body!() as {threadId: string}
		expect(after.threadId).not.toBe(beforeId)
	})

	it('Test 11: source-import surrogate — assistant.tsx imports LivAiHeaderBar from ./header-bar AND mounts it', async () => {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const assistantPath = path.resolve(__dirname, './assistant.tsx')
		const src = await fs.readFile(assistantPath, 'utf-8')
		// Import literal proves the new file is referenced.
		expect(src).toMatch(/from ['"]\.\/header-bar['"]/)
		// JSX literal proves the component is actually mounted in the tree.
		expect(src).toMatch(/<LivAiHeaderBar\b/)
		// body envelope literal proves Plan 199-07 extended the callback shape
		// per D-199-09 (config.modelName threaded through).
		expect(src).toMatch(/config:\s*\{modelName:\s*selectedModel\}/)
		// tRPC wire-up literals — proves Plan 199-07 Tasks 1 + 3 are integrated.
		// Match `.useQuery` / `.useMutation` after the procedure name, allowing
		// optional-chaining `?.` between (the codebase trpcAny pattern uses ?.).
		expect(src).toMatch(/getActiveModel\??\.useQuery/)
		expect(src).toMatch(/setActiveModel\??\.useMutation/)
	})
})
