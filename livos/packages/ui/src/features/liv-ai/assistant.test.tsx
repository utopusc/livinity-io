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
	}
})

// ─── Mock @assistant-ui/react-ai-sdk ────────────────────────────────────

vi.mock('@assistant-ui/react-ai-sdk', () => ({
	AssistantChatTransport: class AssistantChatTransport {
		constructor(public opts: unknown) {}
	},
	useChatRuntime: () => ({}),
}))

// ─── Mock @/trpc/trpc (matches thread-list-adapter.test.tsx pattern) ───

const mockMutateAsync = vi.fn(async () => ({ok: true}))
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
