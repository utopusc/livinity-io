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

// ─── Mock @/components/assistant-ui/thread (canonical Thread surface;
// Plan 200-06 mounts <Thread composerSlot={<LivAiComposer.../>} />.
// The mock renders the composerSlot inside a ThreadWelcome-shaped
// container so layout assertions still resolve and the LivAiComposer
// (which carries the LivAiModelPicker) lands in the DOM for Tests 7-9).
// ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/assistant-ui/thread', () => ({
	Thread: ({composerSlot}: {composerSlot?: ReactNode}) => (
		<div data-testid='aui-thread-root'>
			{/* ThreadWelcome surrogate — canonical heading + D-200-18 subtitle */}
			<div data-testid='aui-thread-welcome'>
				<h1>Hello there!</h1>
				<p>How can I help you today?</p>
				<p>Liv AI — your operating system&apos;s assistant.</p>
			</div>
			<div data-testid='aui-thread-viewport'>
				<div data-testid='aui-thread-viewport-footer'>
					{composerSlot}
				</div>
			</div>
		</div>
	),
}))

// Mock the LivAiComposer module — the canonical composer pulls in
// useAssistantRuntime, ComposerTriggerPopover, slash/mention adapters,
// etc. which would require a much larger surrogate surface. The
// LivAiModelPicker is still imported from the real ./model-picker file
// to keep the Phase 199-07 hydration + transport-body wiring testable
// (Tests 7-10) — but everything else collapses to a tiny stub that just
// renders the composer-primitive-root marker for layout assertions.
vi.mock('./composer', async () => {
	const {LivAiModelPicker} = await import('./model-picker')
	return {
		LivAiComposer: ({
			selectedModel,
			onModelChange,
		}: {
			selectedModel: string
			onModelChange: (next: string) => void
		}) => (
			<form data-testid='composer-primitive-root'>
				<textarea data-testid='composer-primitive-input' placeholder='Ask Liv anything…' />
				<LivAiModelPicker
					value={selectedModel as never}
					onChange={onModelChange as never}
				/>
			</form>
		),
	}
})

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

describe('Assistant — Phase 200-06 canonical Thread mount', () => {
	it('Test 1: <Thread composerSlot> mounted with LivAiComposer inside; D-200-18 subtitle visible', () => {
		mockState.thread.isEmpty = true
		act(() => {
			root.render(<Assistant />)
		})

		// Plan 200-06 — canonical assistant-ui Thread is the new outer
		// surface (D-200-16). The mock surrogate renders `aui-thread-root`
		// with a ThreadWelcome heading + the D-200-18 English Liv AI
		// subtitle. The LivAiComposer mock lands inside the composerSlot
		// (composer-primitive-root testid).
		const threadRoot = document.querySelector(
			'[data-testid="aui-thread-root"]',
		)
		expect(threadRoot).not.toBeNull()

		// D-200-18 English subtitle present in ThreadWelcome.
		const welcome = document.querySelector(
			'[data-testid="aui-thread-welcome"]',
		)
		expect(welcome).not.toBeNull()
		const welcomeText = welcome!.textContent ?? ''
		expect(welcomeText).toContain('Hello there!')
		expect(welcomeText).toContain('How can I help you today?')
		expect(welcomeText).toContain("your operating system's assistant")

		// Exactly ONE LivAiComposer surrogate mounted via composerSlot.
		const composers = document.querySelectorAll(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composers.length).toBe(1)
	})

	it('Test 2: LivAiComposer lands inside Thread ViewportFooter (composerSlot prop wiring)', () => {
		mockState.thread.isEmpty = false
		act(() => {
			root.render(<Assistant />)
		})

		// Phase 200-06 — Phase 199-05 EmptyStateBranch is DELETED; the
		// canonical Thread owns both empty/chat layout. The LivAiComposer
		// lands in the Thread's ViewportFooter via `composerSlot` (D-200-16).
		const empty = document.querySelector('[data-testid="liv-ai-empty-state"]')
		expect(empty).toBeNull()

		const viewport = document.querySelector(
			'[data-testid="aui-thread-viewport"]',
		)
		expect(viewport).not.toBeNull()

		// Composer nested inside the canonical Thread's ViewportFooter.
		const footer = document.querySelector(
			'[data-testid="aui-thread-viewport-footer"]',
		)
		expect(footer).not.toBeNull()
		expect(
			footer!.querySelector('[data-testid="composer-primitive-root"]'),
		).not.toBeNull()

		// Exactly ONE Composer rendered (single composerSlot mount).
		const composers = document.querySelectorAll(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composers.length).toBe(1)
	})

	it('Test 3: empty branch DOM has NO `absolute inset-0` overlay (Phase 199-05 Pitfall 5 regression-lock; carries forward into Plan 200-06)', () => {
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

	it('Test 4: LivAiComposer source-import surrogate — assistant.tsx imports LivAiComposer from ./composer + Thread from canonical components/assistant-ui/thread (D-199-18 / D-200-13 / D-200-16)', async () => {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const assistantPath = path.resolve(
			__dirname,
			'./assistant.tsx',
		)
		const src = await fs.readFile(assistantPath, 'utf-8')
		expect(src).toMatch(/from ['"]\.\/composer['"]/)
		expect(src).toMatch(/<LivAiComposer\b/)
		// Plan 200-06 — canonical Thread mount via composerSlot (D-200-16).
		expect(src).toMatch(/from ['"]@\/components\/assistant-ui\/thread['"]/)
		expect(src).toMatch(/composerSlot=\{/)
	})

	it('Test 5: canonical ThreadWelcome subtitle = "Liv AI — your operating system\'s assistant." (D-200-18; ENGLISH-only INV-200-05)', () => {
		// Phase 198-06 SuggestedPrompts chips are NO LONGER mounted by
		// assistant.tsx — the canonical assistant-ui Thread owns its own
		// ThreadSuggestions surface (registry-canonical), which renders
		// nothing today since the runtime ships zero
		// `ThreadPrimitive.Suggestions` entries. Plan 200-06 replaces the
		// Phase 199-05 SuggestedPrompts assertion with a positive lock on
		// the D-200-18 English Liv AI subtitle inside ThreadWelcome.
		mockState.thread.isEmpty = true
		act(() => {
			root.render(<Assistant />)
		})

		const welcome = document.querySelector(
			'[data-testid="aui-thread-welcome"]',
		)
		expect(welcome).not.toBeNull()
		const text = welcome!.textContent ?? ''
		expect(text).toContain("Liv AI — your operating system's assistant.")
		// Sentinel: INV-200-05 — no Turkish diacritics in the empty-state
		// surface rendered through the canonical Thread.
		expect(text).not.toMatch(/[ğüşıöçĞÜŞİÖÇ]/)
	})
})

// ─── Phase 199-07 — header bar + Redis-backed selectedModel wiring ───────

describe('Assistant — Phase 199-07 header bar + selectedModel wiring', () => {
	it('Test 6: LivAiHeaderBar is DELETED — no [data-testid="liv-ai-header-bar"] in DOM (Plan 200-05 / D-200-15)', () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.20-0309-non-reasoning'}
		act(() => {
			root.render(<Assistant />)
		})

		// Plan 200-05 deleted header-bar.tsx — the application landmark
		// must still exist (sidebar + main still render) but there is
		// NO header element above the 2-column flex.
		const header = document.querySelector(
			'[data-testid="liv-ai-header-bar"]',
		)
		expect(header).toBeNull()
		const appShell = document.querySelector(
			'[role="application"][aria-label="Liv AI chat"]',
		)
		expect(appShell).not.toBeNull()
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

	it('Test 8: default model — picker shows Grok 4.20 when getActiveModel returns undefined', () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = undefined
		act(() => {
			root.render(<Assistant />)
		})
		const trigger = document.querySelector(
			'[data-testid="liv-ai-model-picker-trigger"]',
		)
		expect(trigger).not.toBeNull()
		expect(trigger!.textContent).toContain('Grok 4.20')
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

	it('Test 10: clicking the sidebar "+ New conversation" button fires onSwitchToNewThread (mutates threadId in body envelope)', async () => {
		mockState.thread.isEmpty = true
		mockActiveModelData = {modelName: 'grok-4.20-0309-non-reasoning'}
		await act(async () => {
			root.render(<Assistant />)
		})
		// Capture body envelope threadId BEFORE clicking new-thread.
		const before = lastTransportOpts!.body!() as {threadId: string}
		const beforeId = before.threadId
		expect(typeof beforeId).toBe('string')

		// Plan 200-05 deleted the header-bar "+ New conversation" button.
		// The sidebar button (data-testid="liv-ai-new-thread") is the
		// remaining canonical entry-point (single source of truth —
		// D-200-15).
		const newBtn = document.querySelector(
			'[data-testid="liv-ai-new-thread"]',
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

	it('Test 11: source-import surrogate — assistant.tsx no longer references LivAiHeaderBar; imports LivAiComposer (Plan 200-05 / D-200-15)', async () => {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const assistantPath = path.resolve(__dirname, './assistant.tsx')
		const src = await fs.readFile(assistantPath, 'utf-8')
		// Plan 200-05 deleted header-bar.tsx + header-bar.test.tsx — there
		// must be NO active `from './header-bar'` import and NO
		// <LivAiHeaderBar JSX element in assistant.tsx (D-200-15). The
		// historical comment referring to it as an artefact is OK (we
		// only ban active code references), so strip JSDoc block + `//`
		// line comments from the source before scanning.
		const stripped = src
			.replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */ blocks
			.replace(/^[ \t]*\/\/.*$/gm, '') // single-line comments
		expect(stripped).not.toMatch(/^\s*import\s[^\n]*from\s+['"]\.\/header-bar['"]/m)
		expect(stripped).not.toMatch(/<LivAiHeaderBar[\s/>]/)
		// LivAiComposer is the new canonical composer mount.
		expect(src).toMatch(/from ['"]\.\/composer['"]/)
		expect(src).toMatch(/<LivAiComposer\b/)
		// body envelope literal proves Plan 199-07 extended the callback
		// shape per D-199-09 (config.modelName threaded through).
		expect(src).toMatch(/config:\s*\{modelName:\s*selectedModel\}/)
		// tRPC wire-up literals — proves Plan 199-07 Tasks 1 + 3 are
		// integrated.
		expect(src).toMatch(/getActiveModel\??\.useQuery/)
		expect(src).toMatch(/setActiveModel\??\.useMutation/)
	})
})
