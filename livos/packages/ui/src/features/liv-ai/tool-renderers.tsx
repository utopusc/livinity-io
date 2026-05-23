/**
 * Phase 198-03 Task 3 — Generative UI tool renderers.
 *
 * Each renderer registers a React component to render when the agent
 * calls the named tool. Components render inline in the message stream.
 * Streaming partial-arg renders show a skeleton while args complete;
 * once `status.type === 'complete'` the full primitive renders with the
 * tool's result JSON.
 *
 * Tool-name wire contract (locked at planning time — Plan 198-03):
 *   web_search                 → Sources
 *   search_places              → ImageGallery
 *   image_search               → ImageGallery
 *   weather                    → WeatherWidget
 *   map                        → GeoMap
 *   data_query                 → DataTable (T-198-03 redacted)
 *   chart                      → Chart
 *   link_preview               → LinkPreview
 *   luse_computer_screenshot   → fullscreen <img>
 *   luse_list_windows          → DataTable
 *
 * Approval Card for destructive MCP tools is deferred to Plan 198-04
 * (HITL pattern). CodeBlock / CodeDiff primitives ship in Task 2 but
 * are registered later by Plan 198-06 slash commands (`/code`, `/diff`).
 *
 * T-198-03 mitigation: DataQueryToolUI passes every result row through
 * redactArgsForDisplay() — fields matching /token|key|secret|password|
 * authorization/i become '***' before render.
 * T-198-04 mitigation: every renderer uses React text interpolation
 * only — zero raw-HTML escape hatches.
 *
 * makeAssistantToolUI signature (verified against @assistant-ui/core
 * src/react/model-context/makeAssistantToolUI.ts):
 *   const ToolUI = makeAssistantToolUI<TArgs, TResult>({
 *     toolName: string,
 *     render: (ToolCallMessagePartProps<TArgs, TResult>) => JSX
 *   })
 *
 * Status shape (ToolCallMessagePartStatus):
 *   {type: 'running'} | {type: 'complete'} | {type: 'incomplete', reason: ...}
 *   | {type: 'requires-action', reason: 'interrupt'}
 */

import {makeAssistantToolUI} from '@assistant-ui/react'

import {Chart} from '@/components/tool-ui/chart'
import {DataTable} from '@/components/tool-ui/data-table'
import {GeoMap} from '@/components/tool-ui/geo-map'
import {ImageGallery} from '@/components/tool-ui/image-gallery'
import {LinkPreview} from '@/components/tool-ui/link-preview'
import {Sources} from '@/components/tool-ui/sources'
import {WeatherWidget, type WeatherData} from '@/components/tool-ui/weather-widget'

import {redactArgsForDisplay} from './redact-args'

// ─── Skeleton helper (D-NO-NEW-DEPS — no shadcn Skeleton primitive) ─

function Skeleton({className = ''}: {className?: string}) {
	return (
		<div
			className={`animate-pulse rounded-md bg-muted/60 ${className}`}
			aria-hidden='true'
		/>
	)
}

// ─── Web search (web_search tool) ───────────────────────────────────

export const WebSearchToolUI = makeAssistantToolUI<
	{query: string},
	{sources: Array<{title: string; url: string; snippet?: string; favicon?: string}>}
>({
	toolName: 'web_search',
	render: ({result, status}) => {
		if (status.type === 'running') {
			return <Skeleton className='h-32 w-full' />
		}
		if (status.type === 'incomplete') {
			return <div className='text-red-500 text-sm'>Search failed.</div>
		}
		return <Sources sources={result?.sources ?? []} />
	},
})

// ─── Places search → Image Gallery ──────────────────────────────────

export const PlacesSearchToolUI = makeAssistantToolUI<
	{city: string; limit?: number},
	{
		places: Array<{
			name: string
			imageUrl: string
			description?: string
			lat?: number
			lng?: number
		}>
	}
>({
	toolName: 'search_places',
	render: ({result, status}) => {
		if (status.type === 'running') {
			return (
				<div className='grid grid-cols-2 gap-3'>
					{Array.from({length: 4}).map((_, i) => (
						<Skeleton key={i} className='h-40 rounded-xl' />
					))}
				</div>
			)
		}
		return <ImageGallery items={result?.places ?? []} />
	},
})

// ─── Image search ──────────────────────────────────────────────────

export const ImageSearchToolUI = makeAssistantToolUI<
	{query: string},
	{images: Array<{url: string; alt?: string}>}
>({
	toolName: 'image_search',
	render: ({result, status}) => {
		if (status.type !== 'complete') return <Skeleton className='h-40 w-full' />
		return (
			<ImageGallery
				items={(result?.images ?? []).map((i) => ({
					name: i.alt ?? '',
					imageUrl: i.url,
				}))}
			/>
		)
	},
})

// ─── Weather ────────────────────────────────────────────────────────

export const WeatherToolUI = makeAssistantToolUI<
	{location: string},
	WeatherData
>({
	toolName: 'weather',
	render: ({args, result, status}) => {
		if (status.type !== 'complete' || !result) {
			return <Skeleton className='h-24 w-full' />
		}
		return <WeatherWidget location={args?.location ?? ''} data={result} />
	},
})

// ─── Map / Places with location ─────────────────────────────────────

export const MapToolUI = makeAssistantToolUI<
	{center?: {lat: number; lng: number}; query?: string},
	{
		markers: Array<{lat: number; lng: number; label: string; description?: string}>
	}
>({
	toolName: 'map',
	render: ({result, status}) => {
		if (status.type !== 'complete' || !result?.markers?.length) {
			return <Skeleton className='h-80 w-full rounded-lg' />
		}
		return <GeoMap markers={result.markers} />
	},
})

// ─── Data query / list_* → DataTable (T-198-03 redacted) ────────────

export const DataQueryToolUI = makeAssistantToolUI<
	{query?: string},
	{rows: Array<Record<string, unknown>>; columns?: string[]}
>({
	toolName: 'data_query',
	render: ({result, status}) => {
		if (status.type !== 'complete') return <Skeleton className='h-48 w-full' />
		// T-198-03: scrub secret-bearing fields before render.
		const rows = (result?.rows ?? []).map(
			(r) => redactArgsForDisplay(r) as Record<string, unknown>,
		)
		return <DataTable rows={rows} columns={result?.columns} />
	},
})

// ─── Chart ──────────────────────────────────────────────────────────

export const ChartToolUI = makeAssistantToolUI<
	{kind?: 'line' | 'bar' | 'pie'},
	{data: Array<Record<string, number | string>>; xKey: string; yKey: string}
>({
	toolName: 'chart',
	render: ({args, result, status}) => {
		if (status.type !== 'complete' || !result) {
			return <Skeleton className='h-64 w-full' />
		}
		return (
			<Chart
				kind={args?.kind ?? 'line'}
				data={result.data}
				xKey={result.xKey}
				yKey={result.yKey}
			/>
		)
	},
})

// ─── Link preview ───────────────────────────────────────────────────

export const LinkPreviewToolUI = makeAssistantToolUI<
	{url: string},
	{
		title: string
		description?: string
		image?: string
		favicon?: string
		url: string
	}
>({
	toolName: 'link_preview',
	render: ({result, status}) => {
		if (status.type !== 'complete' || !result) {
			return <Skeleton className='h-24 w-full' />
		}
		return <LinkPreview {...result} />
	},
})

// ─── Luse computer_screenshot (fullscreen image preview) ────────────

export const LuseScreenshotToolUI = makeAssistantToolUI<
	Record<string, never>,
	{dataUrl?: string; base64?: string; mimeType?: string}
>({
	toolName: 'luse_computer_screenshot',
	render: ({result, status}) => {
		if (status.type !== 'complete') return <Skeleton className='h-64 w-full' />
		const src =
			result?.dataUrl ??
			(result?.base64
				? `data:${result.mimeType ?? 'image/png'};base64,${result.base64}`
				: null)
		if (!src) {
			return <div className='text-red-500 text-sm'>No screenshot data</div>
		}
		return (
			<a href={src} target='_blank' rel='noopener noreferrer'>
				<img
					src={src}
					alt='Screenshot'
					className='max-w-full rounded-lg border'
				/>
			</a>
		)
	},
})

// ─── Luse list_windows → DataTable ──────────────────────────────────

export const LuseListWindowsToolUI = makeAssistantToolUI<
	Record<string, never>,
	{windows: Array<{id: string; title: string; pid?: number; app?: string}>}
>({
	toolName: 'luse_list_windows',
	render: ({result, status}) => {
		if (status.type !== 'complete') return <Skeleton className='h-48 w-full' />
		return (
			<DataTable
				rows={result?.windows ?? []}
				columns={['id', 'title', 'app', 'pid']}
			/>
		)
	},
})

// ─── Barrel <ToolRenderers /> — mounts every ToolUI registration ────
//
// Each `makeAssistantToolUI(...)` returns a component whose only job is
// to call `useAssistantToolUI(tool)` on mount (which registers the
// renderer in the runtime's tool registry) and return `null`. Mount this
// barrel inside <AssistantRuntimeProvider> so all 10 renderers register
// before the first message renders.

export function ToolRenderers() {
	return (
		<>
			<WebSearchToolUI />
			<PlacesSearchToolUI />
			<ImageSearchToolUI />
			<WeatherToolUI />
			<MapToolUI />
			<DataQueryToolUI />
			<ChartToolUI />
			<LinkPreviewToolUI />
			<LuseScreenshotToolUI />
			<LuseListWindowsToolUI />
		</>
	)
}

export default ToolRenderers
