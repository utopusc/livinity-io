// @vitest-environment jsdom
//
// Phase 200-05 Task 2 — LivAiComposer tests.
//
// Locks the Plan 200-05 composer contract:
//
//   1. <ComposerPrimitive.Unstable_TriggerPopoverRoot> wraps both
//      <ComposerTriggerPopover char="@"> and char="/" (RESEARCH §J8
//      Pitfall — popovers don't render outside this root).
//   2. The model picker is mounted INSIDE the composer footer-strip
//      (Grok pattern; D-200-13). Exactly one element with
//      data-testid="liv-ai-model-picker-trigger" exists in the
//      rendered DOM (Pitfall 6 regression-lock — there used to be a
//      second instance in <LivAiHeaderBar>; that file is deleted by
//      this plan).
//   3. The Send button renders when thread.isRunning === false.
//   4. The Stop button renders when thread.isRunning === true (and
//      Send is gone).
//   5. data-empty / data-running attributes are forwarded onto the
//      ComposerPrimitive.Root surrogate (drives the
//      group-data-[empty=...]/composer:* collapse CSS).
//
// Per LivOS UI testing precedent (Plan 30-02 → 199-04 → 199-07), the
// UI package has D-NO-NEW-DEPS — `@testing-library/react` is NOT
// installed. Tests use direct react-dom/client mounts against jsdom
// plus inline vi.mock factories for the assistant-ui surface.

import {act, type ReactNode} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

// Radix DropdownMenu uses Pointer Events; jsdom doesn't ship them.
// Mirrors the model-picker.test.tsx + assistant.test.tsx shims.
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
// Drives both AuiIf branches and the data-empty/data-running attrs.
let mockState = {
	composer: {isEmpty: true},
	thread: {isRunning: false},
}

// ─── Mock @assistant-ui/react ───────────────────────────────────────────
vi.mock('@assistant-ui/react', () => {
	const AuiIf = ({
		condition,
		children,
	}: {
		condition: (s: typeof mockState) => boolean
		children: ReactNode
	}) => (condition(mockState) ? <>{children}</> : null)

	const useAuiState = <T,>(selector: (s: typeof mockState) => T) =>
		selector(mockState)

	const useAssistantRuntime = () =>
		({
			threads: {switchToNewThread: vi.fn()},
			thread: {composer: {setText: vi.fn(), send: vi.fn()}},
		}) as unknown

	const ComposerPrimitive = {
		Unstable_TriggerPopoverRoot: ({
			children,
		}: {
			children?: ReactNode
		}) => (
			<div data-testid='composer-trigger-popover-root'>{children}</div>
		),
		Root: ({
			children,
			...rest
		}: {children?: ReactNode} & Record<string, unknown>) => (
			<form data-testid='composer-primitive-root' {...rest}>
				{children}
			</form>
		),
		Input: (props: Record<string, unknown>) => (
			<textarea data-testid='composer-primitive-input' {...props} />
		),
		Send: ({
			children,
			asChild: _asChild,
			...rest
		}: {children?: ReactNode; asChild?: boolean} & Record<string, unknown>) => (
			<div data-testid='composer-primitive-send' {...rest}>
				{children}
			</div>
		),
		Cancel: ({
			children,
			asChild: _asChild,
			...rest
		}: {children?: ReactNode; asChild?: boolean} & Record<string, unknown>) => (
			<div data-testid='composer-primitive-cancel' {...rest}>
				{children}
			</div>
		),
	}

	// Hooks the mention/slash adapters use — return harmless empty bundles.
	const unstable_useMentionAdapter = (_opts: unknown) => ({
		adapter: {} as unknown,
		directive: {formatter: () => 'x'} as unknown,
	})
	const unstable_useSlashCommandAdapter = (_opts: unknown) => ({
		adapter: {} as unknown,
		action: {
			formatter: () => 'x',
			onExecute: () => {},
			removeOnExecute: true,
		} as unknown,
	})

	return {
		AuiIf,
		useAuiState,
		useAssistantRuntime,
		ComposerPrimitive,
		unstable_useMentionAdapter,
		unstable_useSlashCommandAdapter,
		unstable_defaultDirectiveFormatter: () => 'x',
	}
})

// ─── Mock canonical assistant-ui shadcn primitives that compose into the
//     composer (Plan 200-02 ported these from the upstream registry) ────
vi.mock('@/components/assistant-ui/composer-trigger-popover', () => ({
	ComposerTriggerPopover: ({char}: {char: string}) => (
		<div data-testid={`composer-trigger-popover-${char}`} />
	),
}))

vi.mock('@/components/assistant-ui/attachment', () => ({
	ComposerAddAttachment: () => (
		<button type='button' data-testid='composer-add-attachment' aria-label='Add Attachment'>
			+
		</button>
	),
}))

vi.mock('@/components/assistant-ui/tooltip-icon-button', () => ({
	TooltipIconButton: ({
		children,
		tooltip: _tooltip,
		side: _side,
		...rest
	}: {
		children?: ReactNode
		tooltip?: string
		side?: string
	} & Record<string, unknown>) => (
		<button type='button' {...rest}>
			{children}
		</button>
	),
}))

// Import AFTER vi.mock factories run.
import {LivAiComposer} from './composer'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	mockState = {
		composer: {isEmpty: true},
		thread: {isRunning: false},
	}
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

describe('LivAiComposer — Phase 200-05', () => {
	it('Test 1: mounts both @ and / ComposerTriggerPopover under Unstable_TriggerPopoverRoot', () => {
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		const rootEl = document.querySelector(
			'[data-testid="composer-trigger-popover-root"]',
		)
		expect(rootEl).not.toBeNull()
		const atPopover = rootEl!.querySelector(
			'[data-testid="composer-trigger-popover-@"]',
		)
		const slashPopover = rootEl!.querySelector(
			'[data-testid="composer-trigger-popover-/"]',
		)
		expect(atPopover).not.toBeNull()
		expect(slashPopover).not.toBeNull()
	})

	it('Test 2: the model picker is mounted INSIDE the composer (Grok pattern; D-200-13)', () => {
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.3'
					onModelChange={() => {}}
				/>,
			)
		})
		const composer = document.querySelector(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composer).not.toBeNull()
		const picker = composer!.querySelector(
			'[data-testid="liv-ai-model-picker-trigger"]',
		)
		expect(picker).not.toBeNull()
		// Trigger reflects the passed selectedModel.
		expect(picker!.textContent).toContain('Grok 4.3')
	})

	it('Test 3: Pitfall 6 — exactly ONE model picker trigger in the DOM', () => {
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		expect(
			document.querySelectorAll('[data-testid="liv-ai-model-picker-trigger"]'),
		).toHaveLength(1)
	})

	it('Test 4: Send button renders when thread.isRunning === false', () => {
		mockState.thread.isRunning = false
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		const send = document.querySelector(
			'[data-testid="composer-primitive-send"]',
		)
		const cancel = document.querySelector(
			'[data-testid="composer-primitive-cancel"]',
		)
		expect(send).not.toBeNull()
		expect(cancel).toBeNull()
	})

	it('Test 5: Stop button renders when thread.isRunning === true', () => {
		mockState.thread.isRunning = true
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		const send = document.querySelector(
			'[data-testid="composer-primitive-send"]',
		)
		const cancel = document.querySelector(
			'[data-testid="composer-primitive-cancel"]',
		)
		expect(send).toBeNull()
		expect(cancel).not.toBeNull()
	})

	it('Test 6: data-empty / data-running attributes are forwarded onto Root', () => {
		mockState = {
			composer: {isEmpty: false},
			thread: {isRunning: true},
		}
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		const composer = document.querySelector(
			'[data-testid="composer-primitive-root"]',
		)
		expect(composer).not.toBeNull()
		expect(composer!.getAttribute('data-empty')).toBe('false')
		expect(composer!.getAttribute('data-running')).toBe('true')
	})

	it('Test 7: placeholder copy is ENGLISH (INV-200-05; no Turkish strings)', () => {
		act(() => {
			root.render(
				<LivAiComposer
					selectedModel='grok-4.20-0309-non-reasoning'
					onModelChange={() => {}}
				/>,
			)
		})
		const input = document.querySelector(
			'[data-testid="composer-primitive-input"]',
		) as HTMLTextAreaElement | null
		expect(input).not.toBeNull()
		const placeholder = input!.getAttribute('placeholder') ?? ''
		// Grok-style English placeholder; explicit allow-list to defend against
		// drift into Turkish (Liv'e sor / Liv'e bir şey sor / …).
		expect(placeholder).toMatch(/(ask|message)/i)
		// Defense-in-depth — no common Turkish-only diacritics in the
		// placeholder string.
		expect(placeholder).not.toMatch(/[şçğıöü]/i)
	})
})
