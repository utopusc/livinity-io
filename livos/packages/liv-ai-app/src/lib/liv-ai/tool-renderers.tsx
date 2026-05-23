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

import {ApprovalCard} from '@/lib/tool-ui/approval-card'
import {Chart} from '@/lib/tool-ui/chart'
import {DataTable} from '@/lib/tool-ui/data-table'
import {GeoMap} from '@/lib/tool-ui/geo-map'
import {ImageGallery} from '@/lib/tool-ui/image-gallery'
import {LinkPreview} from '@/lib/tool-ui/link-preview'
import {RunningHeader} from '@/lib/tool-ui/running-header'
import {Sources} from '@/lib/tool-ui/sources'
import {WeatherWidget, type WeatherData} from '@/lib/tool-ui/weather-widget'

import {redactArgsForDisplay} from './redact-args'
import {useApproveMutation} from './use-approve-mutation'

// ─── Skeleton helper (D-NO-NEW-DEPS — no shadcn Skeleton primitive) ─

function Skeleton({className = ''}: {className?: string}) {
	return (
		<div
			className={`animate-pulse rounded-md bg-muted/60 ${className}`}
			aria-hidden='true'
		/>
	)
}

// ─── Phase 199-06 — incomplete-status chip helper ───────────────────
//
// Per D-199-23 + RESEARCH B5: every generative renderer branches on
// `status.type === 'incomplete'` with two sub-cases:
//
//   reason === 'cancelled' → muted "Cancelled" chip (operator aborted)
//   anything else          → red error chip with per-renderer text
//
// The helper centralises the chip JSX so each renderer body stays
// terse and so all 10 renderers ship byte-identical chrome.

function IncompleteChip({
	reason,
	errorText,
}: {
	reason: string | undefined
	errorText: string
}) {
	if (reason === 'cancelled') {
		return (
			<div className='rounded-lg border bg-card p-3 text-sm text-muted-foreground'>
				Cancelled
			</div>
		)
	}
	return (
		<div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'>
			{errorText}
		</div>
	)
}

// ─── Web search (web_search tool) ───────────────────────────────────

export const WebSearchToolUI = makeAssistantToolUI<
	{query: string},
	{sources: Array<{title: string; url: string; snippet?: string; favicon?: string}>}
>({
	toolName: 'web_search',
	render: ({args, result, status}) => {
		if (status.type === 'running') {
			return <RunningHeader label={`Searching: "${args?.query ?? '…'}"`} />
		}
		if (status.type === 'incomplete') {
			return <IncompleteChip reason={status.reason} errorText='Search failed' />
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
	render: ({args, result, status}) => {
		if (status.type === 'running') {
			return <RunningHeader label={`Finding places in ${args?.city ?? '…'}`} />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Places lookup failed' />
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
	render: ({args, result, status}) => {
		if (status.type === 'running') {
			return (
				<RunningHeader label={`Searching images: "${args?.query ?? '…'}"`} />
			)
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Image search failed' />
			)
		}
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
		if (status.type === 'running') {
			return (
				<RunningHeader
					label={`Checking weather in ${args?.location ?? '…'}…`}
				/>
			)
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Weather lookup failed' />
			)
		}
		if (status.type !== 'complete' || !result) {
			return <RunningHeader label='Loading…' />
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
	render: ({args, result, status}) => {
		if (status.type === 'running') {
			return <RunningHeader label={`Loading map of ${args?.query ?? '…'}…`} />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Map load failed' />
			)
		}
		if (status.type !== 'complete' || !result?.markers?.length) {
			return <RunningHeader label='Loading map…' />
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
		if (status.type === 'running') {
			return <RunningHeader label='Querying data…' />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Data query failed' />
			)
		}
		if (status.type !== 'complete') return <RunningHeader label='Querying data…' />
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
		if (status.type === 'running') {
			return <RunningHeader label='Compiling chart…' />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Chart build failed' />
			)
		}
		if (status.type !== 'complete' || !result) {
			return <RunningHeader label='Compiling chart…' />
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
	render: ({args, result, status}) => {
		if (status.type === 'running') {
			return <RunningHeader label={`Loading preview: ${args?.url ?? '…'}`} />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Link preview failed' />
			)
		}
		if (status.type !== 'complete' || !result) {
			return <RunningHeader label='Loading preview…' />
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
		if (status.type === 'running') {
			return <RunningHeader label='Taking screenshot…' />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Screenshot failed' />
			)
		}
		if (status.type !== 'complete') return <RunningHeader label='Taking screenshot…' />
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
		if (status.type === 'running') {
			return <RunningHeader label='Listing windows…' />
		}
		if (status.type === 'incomplete') {
			return (
				<IncompleteChip reason={status.reason} errorText='Window list failed' />
			)
		}
		if (status.type !== 'complete') return <RunningHeader label='Listing windows…' />
		return (
			<DataTable
				rows={result?.windows ?? []}
				columns={['id', 'title', 'app', 'pid']}
			/>
		)
	},
})

// ─── Plan 198-04 — HITL ApprovalCard renderers ──────────────────────
//
// Factory that builds an ApprovalCardToolUI for a given destructive tool
// name. assistant-ui surfaces a suspended (P197-04 wrapToolWithApproval)
// tool call as a tool-call message-part whose status.type cycles through
// 'running' (while the wrapped tool waits on the ApprovalManager Promise)
// → 'requires-action' (when the AI SDK chunk pipeline classifies the
// suspended call as awaiting human input). Both statuses render the
// ApprovalCard so the operator always sees the card while approval is
// pending. On `complete` (Promise resolved with REJECTED_TOOL_RESULT or
// the wrapped tool's actual result) we render null and let assistant-ui's
// own tool-fallback / matching result renderer take over.
//
// Wire-up: useApproveMutation wraps the existing P197-05
// trpc.mastra.agent.approve adminProcedure mutation. Approve/Reject
// callbacks pass the toolCallId through unchanged; the backend resolves
// the suspended ApprovalManager entry by that ID (W-02 lock).

function makeApprovalToolUI(toolName: string) {
	return makeAssistantToolUI<Record<string, unknown>, unknown>({
		toolName,
		render: ({args, status, toolCallId}) => {
			// useApproveMutation must be called unconditionally per
			// the Rules-of-Hooks; the early-return below decides what
			// to render, not whether to call the hook.
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const {approve, reject, isPending} = useApproveMutation()
			if (status.type === 'running' || status.type === 'requires-action') {
				return (
					<ApprovalCard
						toolName={toolName}
						args={args}
						toolCallId={toolCallId ?? 'unknown'}
						onApprove={approve}
						onReject={reject}
						disabled={isPending}
					/>
				)
			}
			// Post-resolution (Approve→tool executed; Reject→sentinel)
			// — assistant-ui's matching tool-result renderer takes
			// over. We render null to avoid double-rendering.
			return null
		},
	})
}

// 6 ApprovalCardToolUI registrations — one per destructive tool name
// from the P197-02 mcp-bridge.ts N-01 lock:
//   destructiveToolNames = new Set([
//     'luse_computer_click_mouse',
//     'luse_computer_type_text',
//     'luse_computer_press_keys',
//     'luse_computer_application',
//     'luse_computer_drag_mouse',
//     'luse_computer_paste_text',
//   ])
// The list is locked at planning time; future destructive tools require
// an explicit add here AND to the backend N-01 Set (single source of
// truth on the backend; UI mirrors verbatim).
export const LuseClickMouseToolUI = makeApprovalToolUI('luse_computer_click_mouse')
export const LuseTypeTextToolUI = makeApprovalToolUI('luse_computer_type_text')
export const LusePressKeysToolUI = makeApprovalToolUI('luse_computer_press_keys')
export const LuseApplicationToolUI = makeApprovalToolUI('luse_computer_application')
export const LuseDragMouseToolUI = makeApprovalToolUI('luse_computer_drag_mouse')
export const LusePasteTextToolUI = makeApprovalToolUI('luse_computer_paste_text')

// ─── Barrel <ToolRenderers /> — mounts every ToolUI registration ────
//
// Each `makeAssistantToolUI(...)` returns a component whose only job is
// to call `useAssistantToolUI(tool)` on mount (which registers the
// renderer in the runtime's tool registry) and return `null`. Mount this
// barrel inside <AssistantRuntimeProvider> so all 16 renderers (10 from
// Plan 198-03 + 6 from Plan 198-04 HITL) register before the first
// message renders.

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
			{/* Phase 198-04 — HITL approval renderers (6 destructive tools) */}
			<LuseClickMouseToolUI />
			<LuseTypeTextToolUI />
			<LusePressKeysToolUI />
			<LuseApplicationToolUI />
			<LuseDragMouseToolUI />
			<LusePasteTextToolUI />
		</>
	)
}

export default ToolRenderers
