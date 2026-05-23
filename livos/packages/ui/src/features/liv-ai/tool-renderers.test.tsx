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
