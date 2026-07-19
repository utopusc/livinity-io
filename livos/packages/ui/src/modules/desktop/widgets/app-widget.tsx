// Phase 345-02 (WIDG-01, D-345-3) — the native renderer for manifest-declared
// app widgets (System A backend → System B desktop grid). It polls
// trpcReact.widget.data for the composite `${appId}:${widgetId}` id stored on
// the WidgetMeta and draws ONLY the four typed templates the 345-01
// WidgetDataSchema emits (text-with-progress | three-stats | key-value | list).
//
// W-DataContract (defense-in-depth): even though 345-01 safeParse-validates the
// container payload server-side and DEGRADES a malformed shape to
// `{type:'unknown'}`, we re-guard here before the switch and render every field
// defensively (String(...) coercion, optional-chaining, fallbacks) so a
// misbehaving `progress`/number field can NEVER throw in render — an unknown or
// malformed payload falls through to the honest "Unknown widget" placeholder,
// mirroring widget-renderer.tsx's default case.
//
// NEVER render arbitrary HTML/components from the payload (that is System C's
// injection model, explicitly rejected in D-345-1) — only the typed fields.

import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {WidgetContainer} from './widget-container'
import {WidgetMeta} from './widget-types'

// The four renderable runtime templates (mirror of 345-01 WidgetDataSchema).
// Kept intentionally loose (optional fields) so a partially-populated but
// well-typed payload still renders instead of blanking.
type AppWidgetData =
	| {
			type: 'text-with-progress'
			link?: string
			refresh?: number
			title?: string
			text?: string
			subtext?: string
			progressLabel?: string
			progress?: string | number
	  }
	| {
			type: 'three-stats'
			link?: string
			refresh?: number
			items?: {icon?: string; subtext?: string; text?: string}[]
	  }
	| {
			type: 'key-value'
			link?: string
			refresh?: number
			title?: string
			items?: {label: string; value: string | number}[]
	  }
	| {
			type: 'list'
			link?: string
			refresh?: number
			title?: string
			items?: {text?: string; subtext?: string; icon?: string}[]
			noItemsText?: string
	  }

const KNOWN_TYPES = ['text-with-progress', 'three-stats', 'key-value', 'list'] as const

// Client-side contract guard (defense-in-depth). Returns the payload narrowed to
// a known template, or null for a missing / degraded (`type:'unknown'`) / any
// unexpected shape → caller renders the honest placeholder.
function guardAppWidgetData(raw: unknown): AppWidgetData | null {
	if (!raw || typeof raw !== 'object') return null
	const type = (raw as {type?: unknown}).type
	if (typeof type !== 'string' || !(KNOWN_TYPES as readonly string[]).includes(type)) return null
	return raw as AppWidgetData
}

// Clamp any app-supplied progress (string like "42.0" or a number) into 0–100.
function clampProgress(value: string | number | undefined): number {
	const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(100, n))
}

function WidgetHeader({title}: {title?: string}) {
	if (!title) return null
	return <div className='truncate px-3 pt-2.5 text-[11px] font-semibold text-gray-700'>{title}</div>
}

function Placeholder({label}: {label: string}) {
	return (
		<div className='flex h-full w-full items-center justify-center px-3 text-center text-xs text-gray-400'>{label}</div>
	)
}

function TextWithProgress({data, fallbackTitle}: {data: Extract<AppWidgetData, {type: 'text-with-progress'}>; fallbackTitle?: string}) {
	const pct = clampProgress(data.progress)
	return (
		<div className='flex h-full w-full flex-col gap-1.5 p-3'>
			<div className='truncate text-[11px] font-semibold text-gray-700'>{data.title ?? fallbackTitle ?? ''}</div>
			{data.text ? <div className='truncate text-lg font-semibold tabular-nums text-gray-800'>{String(data.text)}</div> : null}
			{data.subtext ? <div className='truncate text-[10px] text-gray-400'>{String(data.subtext)}</div> : null}
			<div className='mt-auto flex flex-col gap-1'>
				{data.progressLabel ? <span className='text-[9px] font-medium text-gray-400'>{String(data.progressLabel)}</span> : null}
				<div className='h-1.5 w-full rounded-full bg-black/[0.06]'>
					<div className='h-full rounded-full bg-blue-500' style={{width: `${pct}%`}} />
				</div>
			</div>
		</div>
	)
}

function ThreeStats({data, fallbackTitle}: {data: Extract<AppWidgetData, {type: 'three-stats'}>; fallbackTitle?: string}) {
	const items = (data.items ?? []).slice(0, 3)
	return (
		<div className='flex h-full w-full flex-col'>
			<WidgetHeader title={fallbackTitle} />
			<div className='flex flex-1 items-center justify-around gap-1 px-2 py-2'>
				{items.map((it, i) => (
					<div key={i} className='flex min-w-0 flex-col items-center gap-0.5 text-center'>
						{it.icon ? <span className='text-base leading-none'>{String(it.icon)}</span> : null}
						<span className='truncate text-sm font-semibold text-gray-800'>{String(it.text ?? '')}</span>
						<span className='truncate text-[9px] text-gray-400'>{String(it.subtext ?? '')}</span>
					</div>
				))}
			</div>
		</div>
	)
}

function KeyValue({data, fallbackTitle}: {data: Extract<AppWidgetData, {type: 'key-value'}>; fallbackTitle?: string}) {
	const items = data.items ?? []
	return (
		<div className='flex h-full w-full flex-col'>
			<WidgetHeader title={data.title ?? fallbackTitle} />
			<div className='flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2'>
				{items.map((it, i) => (
					<div key={i} className='flex items-center justify-between gap-2 text-[11px]'>
						<span className='truncate text-gray-500'>{String(it.label)}</span>
						<span className='shrink-0 font-medium tabular-nums text-gray-800'>{String(it.value)}</span>
					</div>
				))}
			</div>
		</div>
	)
}

function ListWidget({data, fallbackTitle}: {data: Extract<AppWidgetData, {type: 'list'}>; fallbackTitle?: string}) {
	const items = data.items ?? []
	return (
		<div className='flex h-full w-full flex-col'>
			<WidgetHeader title={data.title ?? fallbackTitle} />
			<div className='flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2'>
				{items.length === 0 ? (
					<span className='text-[10px] text-gray-400'>{data.noItemsText ?? t('desktop.widgets.app-widget.no-items')}</span>
				) : (
					items.map((it, i) => (
						<div key={i} className='flex items-center gap-1.5 text-[11px]'>
							{it.icon ? <span className='shrink-0 leading-none'>{String(it.icon)}</span> : null}
							<span className='truncate text-gray-700'>{String(it.text ?? '')}</span>
							{it.subtext ? <span className='ml-auto shrink-0 truncate text-[9px] text-gray-400'>{String(it.subtext)}</span> : null}
						</div>
					))
				)}
			</div>
		</div>
	)
}

export function AppWidget({widget}: {widget: WidgetMeta}) {
	const appWidgetId = widget.appWidgetId
	const query = trpcReact.widget.data.useQuery(
		{widgetId: appWidgetId ?? ''},
		{
			enabled: !!appWidgetId,
			// The server converts the app-declared cadence to ms (widget.data →
			// ms(refresh)); reuse it as the poll interval, floor 5s so a tiny
			// value can't hammer the box. Default 15s until the first payload.
			refetchInterval: (q) => {
				const r = (q.state.data as {refresh?: number} | undefined)?.refresh
				return typeof r === 'number' && Number.isFinite(r) ? Math.max(5000, r) : 15000
			},
			refetchOnWindowFocus: false,
		},
	)

	if (!appWidgetId) {
		return (
			<WidgetContainer>
				<Placeholder label={t('desktop.widgets.app-widget.error')} />
			</WidgetContainer>
		)
	}

	if (query.isPending) {
		return (
			<WidgetContainer>
				<Placeholder label={t('desktop.widgets.app-widget.loading')} />
			</WidgetContainer>
		)
	}

	if (query.isError) {
		return (
			<WidgetContainer>
				<Placeholder label={t('desktop.widgets.app-widget.error')} />
			</WidgetContainer>
		)
	}

	const data = guardAppWidgetData(query.data)
	if (!data) {
		// Missing / degraded (`type:'unknown'`) / unexpected shape — mirror the
		// renderer's honest "Unknown widget" fallback. NEVER throw.
		return (
			<WidgetContainer>
				<Placeholder label={t('desktop.widgets.app-widget.unknown')} />
			</WidgetContainer>
		)
	}

	return (
		<WidgetContainer>
			{data.type === 'text-with-progress' ? (
				<TextWithProgress data={data} fallbackTitle={widget.title} />
			) : data.type === 'three-stats' ? (
				<ThreeStats data={data} fallbackTitle={widget.title} />
			) : data.type === 'key-value' ? (
				<KeyValue data={data} fallbackTitle={widget.title} />
			) : data.type === 'list' ? (
				<ListWidget data={data} fallbackTitle={widget.title} />
			) : (
				<Placeholder label={t('desktop.widgets.app-widget.unknown')} />
			)}
		</WidgetContainer>
	)
}
