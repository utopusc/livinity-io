// @vitest-environment jsdom
//
// Phase 198-03 Task 3 — tool-renderers.tsx tests (TDD RED → GREEN).
//
// Per LivOS UI testing precedent (Plan 30-02 onward — see
// inline-tool-pill.unit.test.tsx, redact-args.test.ts), this UI package
// has D-NO-NEW-DEPS — `@testing-library/react` is NOT installed. Tests
// use direct react-dom/client mounts against jsdom + querySelector.
//
// Each tool renderer is built via `makeAssistantToolUI({toolName, render})`.
// The renderer function is exposed at `ToolUI.unstable_tool.render`
// (verified via @assistant-ui/core source — makeAssistantToolUI.ts:33).
// We invoke it directly with mocked ToolCallMessagePartProps, mount the
// returned JSX into jsdom, and assert content/className/data-* matches.
//
// Coverage:
//   1-10: One test per tool renderer asserting:
//         - status='complete' + result fixture → expected primitive renders
//         - status='running' → Skeleton placeholder renders (text "…" or
//           pulse div)
//   11:   Tool-name registration sanity — assert each renderer's
//         `unstable_tool.toolName` matches its expected wire name.
//   12:   <ToolRenderers /> barrel mounts without throwing (renders null
//         children, since each ToolUI is just useEffect side-effect).
//   13:   redactArgsForDisplay is invoked by DataQueryToolUI when rows
//         contain a `token`-like field — defense for T-198-03.
//
// References:
//   - @assistant-ui/core/src/react/model-context/makeAssistantToolUI.ts
//   - @assistant-ui/core/src/types/message.ts (ToolCallMessagePartStatus)
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx (RTL-absent precedent)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// jsdom polyfill — recharts ResponsiveContainer needs ResizeObserver to
// measure its parent. Real browsers always have this; jsdom doesn't.
class MockResizeObserver {
	observe() {/* noop */}
	unobserve() {/* noop */}
	disconnect() {/* noop */}
}
if (!('ResizeObserver' in globalThis)) {
	;(globalThis as {ResizeObserver?: unknown}).ResizeObserver = MockResizeObserver
}

// Mock @assistant-ui/react makeAssistantToolUI so its returned components
// don't try to register with the AuiProvider runtime context (none exists
// in test). We preserve the unstable_tool metadata used by registration
// assertions + the public render function used by per-renderer tests.
vi.mock('@assistant-ui/react', () => ({
	makeAssistantToolUI: <TArgs, TResult>(tool: {
		toolName: string
		render: (props: any) => React.ReactNode
	}) => {
		const ToolUI: any = () => null
		ToolUI.unstable_tool = tool
		return ToolUI
	},
}))

// Mock react-leaflet — it requires browser-only leaflet which is hard to
// boot under jsdom. We replace the GeoMap import path's transitive deps
// so the renderer can still mount in tests. Note: GeoMap component
// itself is also test-tolerant — we mock at the leaflet boundary.
vi.mock('react-leaflet', () => ({
	MapContainer: ({children}: {children?: React.ReactNode}) => (
		<div data-testid='map-container'>{children}</div>
	),
	TileLayer: () => <div data-testid='tile-layer' />,
	Marker: ({children}: {children?: React.ReactNode}) => (
		<div data-testid='marker'>{children}</div>
	),
	Popup: ({children}: {children?: React.ReactNode}) => (
		<div data-testid='popup'>{children}</div>
	),
}))

vi.mock('leaflet', () => ({
	DivIcon: class {
		constructor(_opts: unknown) {
			/* noop in tests */
		}
	},
}))

// Mock trpc client — the Plan 198-04 ApprovalCard renderers route
// Approve/Reject through useApproveMutation → trpcReact.mastra.agent
// .approve.useMutation. Tests don't bring up the tRPC provider so we
// stub the chain inline. Capture the .mutate call shape for the
// integration assertion below.
const mockMutate = vi.fn()
vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		mastra: {
			agent: {
				approve: {
					useMutation: () => ({
						mutate: mockMutate,
						isPending: false,
					}),
				},
			},
		},
	},
}))

// recharts uses ResponsiveContainer + SVG — under jsdom the container
// reports width/height of 0 so charts render empty SVGs. That's fine for
// our shape assertions (we only check the chart wrapper div is present).

import {
	ChartToolUI,
	DataQueryToolUI,
	ImageSearchToolUI,
	LinkPreviewToolUI,
	LuseListWindowsToolUI,
	LuseScreenshotToolUI,
	MapToolUI,
	PlacesSearchToolUI,
	ToolRenderers,
	WeatherToolUI,
	WebSearchToolUI,
} from './tool-renderers'

// ─── Test harness ────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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

function renderJsx(jsx: React.ReactNode) {
	act(() => {
		root.render(jsx)
	})
}

// Build a minimal ToolCallMessagePartProps fixture. The render function
// receives the full ToolCallMessagePart with status — we satisfy the
// type via `as any` to keep test fixtures terse.
function makeProps<TArgs, TResult>(opts: {
	toolName: string
	args?: TArgs
	result?: TResult
	status: 'running' | 'complete' | 'incomplete' | 'requires-action'
}): any {
	const baseStatus =
		opts.status === 'incomplete'
			? {type: 'incomplete', reason: 'error'}
			: opts.status === 'requires-action'
				? {type: 'requires-action', reason: 'interrupt'}
				: {type: opts.status}
	return {
		type: 'tool-call',
		toolCallId: 'tc-test-1',
		toolName: opts.toolName,
		args: opts.args ?? {},
		result: opts.result,
		argsText: '{}',
		status: baseStatus,
		addResult: vi.fn(),
		resume: vi.fn(),
	}
}

// ─── Per-renderer tests ──────────────────────────────────────────────

describe('WebSearchToolUI', () => {
	it('registers toolName=web_search', () => {
		expect(WebSearchToolUI.unstable_tool.toolName).toBe('web_search')
	})

	it('renders Skeleton when status=running', () => {
		const Render = WebSearchToolUI.unstable_tool.render
		renderJsx(<Render {...makeProps({toolName: 'web_search', status: 'running'})} />)
		// Skeleton-class element exists OR placeholder fallback (the
		// running branch returns a Skeleton-like div with h-32 class).
		expect(container.innerHTML).toMatch(/h-32|skeleton/i)
	})

	it('renders Sources component when status=complete', () => {
		const Render = WebSearchToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'web_search',
					status: 'complete',
					result: {
						sources: [
							{title: 'Llama Docs', url: 'https://docs.example.com/llama', snippet: 'About llamas'},
							{title: 'Wiki Llama', url: 'https://en.wikipedia.org/wiki/Llama'},
						],
					},
				})}
			/>,
		)
		expect(container.textContent).toContain('Llama Docs')
		expect(container.textContent).toContain('Wiki Llama')
	})
})

describe('PlacesSearchToolUI', () => {
	it('registers toolName=search_places', () => {
		expect(PlacesSearchToolUI.unstable_tool.toolName).toBe('search_places')
	})

	it('renders ImageGallery on complete', () => {
		const Render = PlacesSearchToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'search_places',
					status: 'complete',
					result: {
						places: [
							{name: 'Topkapi Palace', imageUrl: 'https://x.test/tp.jpg', description: 'Royal residence'},
						],
					},
				})}
			/>,
		)
		expect(container.textContent).toContain('Topkapi Palace')
		expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x.test/tp.jpg')
	})

	it('renders skeleton grid on running', () => {
		const Render = PlacesSearchToolUI.unstable_tool.render
		renderJsx(<Render {...makeProps({toolName: 'search_places', status: 'running'})} />)
		// 4 placeholders rendered
		expect(container.querySelectorAll('.h-40').length).toBe(4)
	})
})

describe('ImageSearchToolUI', () => {
	it('registers toolName=image_search', () => {
		expect(ImageSearchToolUI.unstable_tool.toolName).toBe('image_search')
	})

	it('renders ImageGallery mapped from images[]', () => {
		const Render = ImageSearchToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'image_search',
					status: 'complete',
					result: {images: [{url: 'https://x.test/a.png', alt: 'A cat'}]},
				})}
			/>,
		)
		expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x.test/a.png')
		expect(container.textContent).toContain('A cat')
	})
})

describe('WeatherToolUI', () => {
	it('registers toolName=weather', () => {
		expect(WeatherToolUI.unstable_tool.toolName).toBe('weather')
	})

	it('renders WeatherWidget with location + temperature', () => {
		const Render = WeatherToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'weather',
					args: {location: 'Istanbul'},
					status: 'complete',
					result: {temperature: 22, conditions: 'Partly cloudy', humidity: 60},
				})}
			/>,
		)
		expect(container.textContent).toContain('Istanbul')
		expect(container.textContent).toContain('22°')
		expect(container.textContent).toContain('Partly cloudy')
		expect(container.textContent).toContain('60')
	})
})

describe('MapToolUI', () => {
	it('registers toolName=map', () => {
		expect(MapToolUI.unstable_tool.toolName).toBe('map')
	})

	it('renders GeoMap with markers on complete', () => {
		const Render = MapToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'map',
					status: 'complete',
					result: {
						markers: [{lat: 41.0082, lng: 28.9784, label: 'Istanbul', description: 'TR'}],
					},
				})}
			/>,
		)
		expect(container.querySelector('[data-testid="map-container"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="marker"]')).not.toBeNull()
		expect(container.textContent).toContain('Istanbul')
	})
})

describe('DataQueryToolUI', () => {
	it('registers toolName=data_query', () => {
		expect(DataQueryToolUI.unstable_tool.toolName).toBe('data_query')
	})

	it('renders DataTable with rows + columns', () => {
		const Render = DataQueryToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'data_query',
					status: 'complete',
					result: {
						rows: [
							{id: 'r1', name: 'Alice', age: 30},
							{id: 'r2', name: 'Bob', age: 25},
						],
						columns: ['id', 'name', 'age'],
					},
				})}
			/>,
		)
		expect(container.querySelector('table')).not.toBeNull()
		expect(container.textContent).toContain('Alice')
		expect(container.textContent).toContain('Bob')
	})

	it('redacts sensitive fields via redactArgsForDisplay (T-198-03)', () => {
		const Render = DataQueryToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'data_query',
					status: 'complete',
					result: {
						rows: [{username: 'bruce', api_token: 'shhh-secret-xyz', password: 'p4ssw0rd'}],
					},
				})}
			/>,
		)
		// Sensitive values masked
		expect(container.textContent).not.toContain('shhh-secret-xyz')
		expect(container.textContent).not.toContain('p4ssw0rd')
		expect(container.textContent).toContain('***')
		// Non-sensitive passes through
		expect(container.textContent).toContain('bruce')
	})
})

describe('ChartToolUI', () => {
	it('registers toolName=chart', () => {
		expect(ChartToolUI.unstable_tool.toolName).toBe('chart')
	})

	it('renders a chart container on complete', () => {
		const Render = ChartToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'chart',
					args: {kind: 'bar'},
					status: 'complete',
					result: {
						data: [
							{month: 'Jan', sales: 100},
							{month: 'Feb', sales: 200},
						],
						xKey: 'month',
						yKey: 'sales',
					},
				})}
			/>,
		)
		// recharts ResponsiveContainer renders a wrapper div
		expect(container.querySelector('div')).not.toBeNull()
	})
})

describe('LinkPreviewToolUI', () => {
	it('registers toolName=link_preview', () => {
		expect(LinkPreviewToolUI.unstable_tool.toolName).toBe('link_preview')
	})

	it('renders LinkPreview anchor with host + title', () => {
		const Render = LinkPreviewToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'link_preview',
					status: 'complete',
					result: {
						url: 'https://example.com/article',
						title: 'A Great Article',
						description: 'About greatness',
					},
				})}
			/>,
		)
		const a = container.querySelector('a')
		expect(a).not.toBeNull()
		expect(a?.getAttribute('href')).toBe('https://example.com/article')
		expect(container.textContent).toContain('A Great Article')
		expect(container.textContent).toContain('example.com')
	})
})

describe('LuseScreenshotToolUI', () => {
	it('registers toolName=luse_computer_screenshot', () => {
		expect(LuseScreenshotToolUI.unstable_tool.toolName).toBe('luse_computer_screenshot')
	})

	it('renders <img> with dataUrl when provided', () => {
		const Render = LuseScreenshotToolUI.unstable_tool.render
		const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_screenshot',
					status: 'complete',
					result: {dataUrl},
				})}
			/>,
		)
		const img = container.querySelector('img')
		expect(img).not.toBeNull()
		expect(img?.getAttribute('src')).toBe(dataUrl)
	})

	it('synthesizes dataUrl from base64+mimeType', () => {
		const Render = LuseScreenshotToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_screenshot',
					status: 'complete',
					result: {base64: 'AAA', mimeType: 'image/jpeg'},
				})}
			/>,
		)
		expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAA')
	})

	it('shows error message when no data', () => {
		const Render = LuseScreenshotToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_screenshot',
					status: 'complete',
					result: {},
				})}
			/>,
		)
		expect(container.textContent).toMatch(/no screenshot data/i)
	})
})

describe('LuseListWindowsToolUI', () => {
	it('registers toolName=luse_list_windows', () => {
		expect(LuseListWindowsToolUI.unstable_tool.toolName).toBe('luse_list_windows')
	})

	it('renders DataTable of windows', () => {
		const Render = LuseListWindowsToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_list_windows',
					status: 'complete',
					result: {
						windows: [
							{id: 'w1', title: 'Terminal', app: 'xterm', pid: 1234},
							{id: 'w2', title: 'Browser', app: 'chrome', pid: 5678},
						],
					},
				})}
			/>,
		)
		expect(container.querySelector('table')).not.toBeNull()
		expect(container.textContent).toContain('Terminal')
		expect(container.textContent).toContain('chrome')
	})
})

describe('ToolRenderers barrel', () => {
	it('mounts without throwing (registers all 10 ToolUIs as null-render children)', () => {
		expect(() => {
			renderJsx(<ToolRenderers />)
		}).not.toThrow()
	})
})

describe('Tool name registration sanity', () => {
	it('all 10 wire names match the Plan 198-03 contract', () => {
		const expected = new Set([
			'web_search',
			'search_places',
			'image_search',
			'weather',
			'map',
			'data_query',
			'chart',
			'link_preview',
			'luse_computer_screenshot',
			'luse_list_windows',
		])
		const actual = new Set([
			WebSearchToolUI.unstable_tool.toolName,
			PlacesSearchToolUI.unstable_tool.toolName,
			ImageSearchToolUI.unstable_tool.toolName,
			WeatherToolUI.unstable_tool.toolName,
			MapToolUI.unstable_tool.toolName,
			DataQueryToolUI.unstable_tool.toolName,
			ChartToolUI.unstable_tool.toolName,
			LinkPreviewToolUI.unstable_tool.toolName,
			LuseScreenshotToolUI.unstable_tool.toolName,
			LuseListWindowsToolUI.unstable_tool.toolName,
		])
		expect(actual).toEqual(expected)
	})
})

// ─── Plan 198-04 — ApprovalCard component tests ─────────────────────
//
// Tests A-F from 198-04-PLAN.md Task 2 behavior block:
//   A — autoFocus on Reject button (T-198-04-01)
//   B — Enter key intercepted (T-198-04-01)
//   C — Sensitive fields redacted via redactArgsForDisplay (T-198-04-02)
//   D — Click Approve fires onApprove(toolCallId) once
//   E — Click Reject fires onReject(toolCallId) once
//   F — No dangerouslySetInnerHTML (grep-locked at acceptance criterion;
//       runtime parity test asserts the rendered HTML never includes a
//       raw <script>/<iframe>/etc. byte sequence injected from args)

import {ApprovalCard} from '@/components/tool-ui/approval-card'

describe('ApprovalCard — Plan 198-04', () => {
	it('A — Reject button autoFocus on mount (T-198-04-01)', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_click_mouse'
				args={{x: 100, y: 200}}
				toolCallId='tc-A'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		const rejectBtn = container.querySelector(
			'[data-testid="liv-ai-reject-tc-A"]',
		) as HTMLButtonElement | null
		expect(rejectBtn).not.toBeNull()
		// document.activeElement must be the reject button after mount
		expect(document.activeElement).toBe(rejectBtn)
	})

	it('B — Enter key intercepted, does NOT trigger onApprove (T-198-04-01)', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_type_text'
				args={{text: 'hello'}}
				toolCallId='tc-B'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		const region = container.querySelector(
			'[data-testid="liv-ai-approval-card-tc-B"]',
		) as HTMLDivElement | null
		expect(region).not.toBeNull()
		// Dispatch an Enter keydown on the card region
		act(() => {
			const evt = new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			})
			region!.dispatchEvent(evt)
		})
		// Neither callback should have fired from a bare Enter press
		expect(onApprove).not.toHaveBeenCalled()
	})

	it('C — Sensitive fields redacted (T-198-04-02)', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_application'
				args={{username: 'bruce', token: 'secret123', password: 'p4ss'}}
				toolCallId='tc-C'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		// Sensitive values masked
		expect(container.textContent).not.toContain('secret123')
		expect(container.textContent).not.toContain('p4ss')
		expect(container.textContent).toContain('***')
		// Non-sensitive passes through
		expect(container.textContent).toContain('bruce')
	})

	it('D — Click Approve fires onApprove(toolCallId) once', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_drag_mouse'
				args={{from: [0, 0], to: [10, 10]}}
				toolCallId='tc-D'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		const approveBtn = container.querySelector(
			'[data-testid="liv-ai-approve-tc-D"]',
		) as HTMLButtonElement | null
		expect(approveBtn).not.toBeNull()
		act(() => {
			approveBtn!.click()
		})
		expect(onApprove).toHaveBeenCalledTimes(1)
		expect(onApprove).toHaveBeenCalledWith('tc-D')
		expect(onReject).not.toHaveBeenCalled()
	})

	it('E — Click Reject fires onReject(toolCallId) once', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_press_keys'
				args={{keys: 'ctrl+a'}}
				toolCallId='tc-E'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		const rejectBtn = container.querySelector(
			'[data-testid="liv-ai-reject-tc-E"]',
		) as HTMLButtonElement | null
		expect(rejectBtn).not.toBeNull()
		act(() => {
			rejectBtn!.click()
		})
		expect(onReject).toHaveBeenCalledTimes(1)
		expect(onReject).toHaveBeenCalledWith('tc-E')
		expect(onApprove).not.toHaveBeenCalled()
	})

	it('F — ApprovalCard markup contains zero dangerouslySetInnerHTML', () => {
		const onApprove = vi.fn()
		const onReject = vi.fn()
		// Render with args that include attempted HTML injection — the
		// rendered DOM must NEVER materialize this as actual markup.
		renderJsx(
			<ApprovalCard
				toolName='luse_computer_paste_text'
				args={{text: '<script>alert(1)</script><img src=x onerror=1>'}}
				toolCallId='tc-F'
				onApprove={onApprove}
				onReject={onReject}
			/>,
		)
		// No <script> element should have been parsed
		expect(container.querySelector('script')).toBeNull()
		// No injected <img onerror=...> either
		const imgs = container.querySelectorAll('img')
		imgs.forEach((img) => {
			expect(img.getAttribute('onerror')).toBeNull()
		})
		// The literal angle-brackets show up as escaped text content
		expect(container.textContent).toContain('<script>')
	})
})

// ─── Plan 198-04 — Tool-renderers approval registration tests ───────
//
// Integration tests asserting the 6 ApprovalCardToolUI registrations
// from Task 3 wire correctly through useApproveMutation → trpc.mastra
// .agent.approve. Each destructive tool name renders an ApprovalCard
// inline when its tool-call chunk surfaces with the running /
// requires-action status.

import {
	LuseApplicationToolUI,
	LuseClickMouseToolUI,
	LuseDragMouseToolUI,
	LusePasteTextToolUI,
	LusePressKeysToolUI,
	LuseTypeTextToolUI,
} from './tool-renderers'

describe('ApprovalCardToolUI registrations (Plan 198-04)', () => {
	it('registers a renderer for each of the 6 destructive tool names', () => {
		const expected = new Set([
			'luse_computer_click_mouse',
			'luse_computer_type_text',
			'luse_computer_press_keys',
			'luse_computer_application',
			'luse_computer_drag_mouse',
			'luse_computer_paste_text',
		])
		const actual = new Set([
			LuseClickMouseToolUI.unstable_tool.toolName,
			LuseTypeTextToolUI.unstable_tool.toolName,
			LusePressKeysToolUI.unstable_tool.toolName,
			LuseApplicationToolUI.unstable_tool.toolName,
			LuseDragMouseToolUI.unstable_tool.toolName,
			LusePasteTextToolUI.unstable_tool.toolName,
		])
		expect(actual).toEqual(expected)
	})

	it('renders an ApprovalCard inline on status=requires-action', () => {
		const Render = LuseClickMouseToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_click_mouse',
					args: {x: 100, y: 200},
					status: 'requires-action',
				})}
			/>,
		)
		// The card region renders with data-testid scheme
		// 'liv-ai-approval-card-<toolCallId>'
		const region = container.querySelector(
			'[data-testid^="liv-ai-approval-card-"]',
		)
		expect(region).not.toBeNull()
		// Tool name is surfaced
		expect(container.textContent).toContain('luse_computer_click_mouse')
		// Both buttons present
		expect(container.querySelector('[data-testid^="liv-ai-approve-"]')).not.toBeNull()
		expect(container.querySelector('[data-testid^="liv-ai-reject-"]')).not.toBeNull()
	})

	it('renders the approval surface on status=running too', () => {
		const Render = LuseTypeTextToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_type_text',
					args: {text: 'hi'},
					status: 'running',
				})}
			/>,
		)
		// Still emits the approval card while the wrapped tool is
		// suspended (status flips running → requires-action depending on
		// runtime/AI-SDK chunk emission timing — the renderer must
		// surface the card in BOTH cases).
		expect(container.querySelector('[data-testid^="liv-ai-approval-card-"]')).not.toBeNull()
	})

	it('redacts args (T-198-04-02 integration) when the args carry a token', () => {
		const Render = LusePasteTextToolUI.unstable_tool.render
		renderJsx(
			<Render
				{...makeProps({
					toolName: 'luse_computer_paste_text',
					args: {api_token: 'shhh-xyz', username: 'bruce'},
					status: 'requires-action',
				})}
			/>,
		)
		expect(container.textContent).not.toContain('shhh-xyz')
		expect(container.textContent).toContain('***')
		expect(container.textContent).toContain('bruce')
	})

	it('Approve click fires trpc.mastra.agent.approve.mutate({approved:true})', () => {
		mockMutate.mockClear()
		const Render = LuseDragMouseToolUI.unstable_tool.render
		const props = makeProps({
			toolName: 'luse_computer_drag_mouse',
			args: {from: [0, 0], to: [10, 10]},
			status: 'requires-action',
		})
		// Pin the toolCallId so we can assert it
		props.toolCallId = 'tc-integration-approve'
		renderJsx(<Render {...props} />)
		const approveBtn = container.querySelector(
			'[data-testid="liv-ai-approve-tc-integration-approve"]',
		) as HTMLButtonElement | null
		expect(approveBtn).not.toBeNull()
		act(() => {
			approveBtn!.click()
		})
		expect(mockMutate).toHaveBeenCalledTimes(1)
		expect(mockMutate).toHaveBeenCalledWith({
			toolCallId: 'tc-integration-approve',
			approved: true,
		})
	})

	it('Reject click fires trpc.mastra.agent.approve.mutate({approved:false})', () => {
		mockMutate.mockClear()
		const Render = LuseApplicationToolUI.unstable_tool.render
		const props = makeProps({
			toolName: 'luse_computer_application',
			args: {action: 'launch', name: 'chrome'},
			status: 'requires-action',
		})
		props.toolCallId = 'tc-integration-reject'
		renderJsx(<Render {...props} />)
		const rejectBtn = container.querySelector(
			'[data-testid="liv-ai-reject-tc-integration-reject"]',
		) as HTMLButtonElement | null
		expect(rejectBtn).not.toBeNull()
		act(() => {
			rejectBtn!.click()
		})
		expect(mockMutate).toHaveBeenCalledTimes(1)
		expect(mockMutate).toHaveBeenCalledWith({
			toolCallId: 'tc-integration-reject',
			approved: false,
		})
	})
})
