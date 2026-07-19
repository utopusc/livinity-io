import {toast} from 'sonner'

import {Dialog, DialogPortal, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {WIDGET_CATALOG, WIDGET_SIZES, WidgetType, createWidgetId, createAppWidgetMeta} from './widget-types'
import {addDesktopWidget, useDesktopWidgets} from '../desktop-content'

// Phase 345-02 (WIDG-01, D-345-3): the client-side UX cap on total desktop
// widgets, mirroring System A's server-authoritative MAX_ALLOWED_WIDGETS (=3,
// livinityd modules/widgets/routes.ts). This picker cap is UX-only — the backend
// re-enforces it on widget.enable; the number here just avoids offering an add
// the server will reject.
const MAX_WIDGETS = 3

function WidgetPreviewMini({type}: {type: string}) {
	switch (type) {
		case 'clock':
			return <span className='text-xl font-semibold tabular-nums text-gray-700'>14:35</span>
		case 'system-info-compact':
			return (
				<div className='flex w-full flex-col gap-1 px-3'>
					{[{l: 'CPU', w: '45%', c: '#3b82f6'}, {l: 'RAM', w: '62%', c: '#10b981'}, {l: 'Disk', w: '28%', c: '#8b5cf6'}].map((b) => (
						<div key={b.l} className='flex items-center gap-1'>
							<span className='w-5 text-[7px] font-semibold text-gray-400'>{b.l}</span>
							<div className='h-1.5 flex-1 rounded-full bg-black/[0.06]'>
								<div className='h-full rounded-full' style={{width: b.w, backgroundColor: b.c}} />
							</div>
						</div>
					))}
				</div>
			)
		case 'system-info-detailed':
			return (
				<div className='flex gap-2'>
					{[{c: '#3b82f6', v: 0.45}, {c: '#10b981', v: 0.6}, {c: '#8b5cf6', v: 0.3}].map((g, i) => (
						<svg key={i} width='22' height='22' viewBox='0 0 24 24'>
							<circle cx='12' cy='12' r='9' fill='none' stroke='rgba(0,0,0,0.06)' strokeWidth='2' />
							<circle cx='12' cy='12' r='9' fill='none' stroke={g.c} strokeWidth='2'
								strokeDasharray={`${56.5 * g.v} 56.5`} transform='rotate(-90 12 12)' />
						</svg>
					))}
				</div>
			)
		case 'quick-notes':
			return (
				<div className='flex w-full flex-col gap-1 px-3'>
					<div className='h-1 w-3/4 rounded bg-gray-300' />
					<div className='h-1 w-full rounded bg-gray-200' />
					<div className='h-1 w-1/2 rounded bg-gray-200' />
				</div>
			)
		case 'app-status':
			return (
				<div className='flex flex-col gap-1 px-2'>
					{['Running', 'Stopped', 'Running'].map((s, i) => (
						<div key={i} className='flex items-center gap-1.5'>
							<span className={`h-1.5 w-1.5 rounded-full ${s === 'Running' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
							<div className='h-1 w-10 rounded bg-gray-300' />
						</div>
					))}
				</div>
			)
		case 'top-apps':
			return (
				<div className='flex flex-col gap-1 px-2'>
					{[1, 2, 3].map((n) => (
						<div key={n} className='flex items-center gap-1'>
							<span className='text-[7px] font-bold text-gray-300'>{n}</span>
							<div className='h-1 flex-1 rounded bg-gray-300' />
							<span className='text-[7px] text-blue-400'>%</span>
						</div>
					))}
				</div>
			)
		default:
			return <span className='text-xs text-gray-300'>?</span>
	}
}

// Phase 345-02: the "App widgets" section — manifest-declared widgets sourced
// from apps.list. Self-hides when zero apps declare a widget (no empty header).
// The section respects System A's cap: once the total (built-in local widgets +
// server-enabled app widgets) reaches MAX_WIDGETS the add buttons disable and a
// max-reached hint shows. The built-in grid above is intentionally NOT capped —
// it stays byte-identical to its pre-345 behaviour.
function AppWidgetsSection({onOpenChange}: {onOpenChange: (v: boolean) => void}) {
	const appsQ = trpcReact.apps.list.useQuery()
	// System A store of enabled app-widget ids — authoritative count for app
	// widgets (avoids double-counting the local app-widget mirror; see addendum).
	const enabledQ = trpcReact.widget.enabled.useQuery()
	const {widgets: localWidgets} = useDesktopWidgets()
	const utils = trpcReact.useUtils()
	const enableMut = trpcReact.widget.enable.useMutation({
		onSuccess: () => utils.widget.enabled.invalidate(),
	})

	// Flat-map installed apps' manifest widgets into pickable rows. Native apps
	// carry `widgets: undefined`; only real manifest widget arrays contribute.
	const appWidgets = (appsQ.data ?? []).flatMap((app: any) =>
		Array.isArray(app.widgets)
			? app.widgets
					.filter((w: any) => w && typeof w.id === 'string')
					.map((w: any) => ({
						appWidgetId: `${app.id}:${w.id}`,
						appName: app.name as string,
						icon: app.icon as string | undefined,
						title: (w.title ?? w.label ?? w.id) as string,
					}))
			: [],
	)

	// Self-hide the whole section when there is nothing to offer.
	if (appWidgets.length === 0) return null

	// Cap formula (UX-only; server re-enforces): built-in local widgets are System
	// B and were never in the System A store, so count them from localWidgets;
	// app widgets are counted from the server `enabled` store to avoid
	// double-counting the local app-widget mirror (W-cap addendum).
	const builtinCount = localWidgets.filter((w) => w.type !== 'app-widget').length
	const appWidgetCount = (enabledQ.data ?? []).length
	const total = builtinCount + appWidgetCount
	const capReached = total >= MAX_WIDGETS

	return (
		<div className='mt-1 flex flex-col gap-2 border-t border-white/10 pt-3'>
			<div className='flex items-center justify-between px-0.5'>
				<span className='text-xs font-medium text-white/80'>{t('desktop.widgets.picker.app-widgets')}</span>
				{capReached ? <span className='text-[9px] text-amber-300/80'>{t('desktop.widgets.picker.max-reached')}</span> : null}
			</div>
			<div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
				{appWidgets.map((aw) => (
					<button
						key={aw.appWidgetId}
						disabled={capReached || enableMut.isPending}
						onClick={async () => {
							try {
								// Backend cap + ownership gate re-enforce here (source of truth).
								await enableMut.mutateAsync({widgetId: aw.appWidgetId})
								addDesktopWidget(createAppWidgetMeta(aw.appWidgetId, aw.title))
								onOpenChange(false)
							} catch (err: any) {
								// Never silently swallow — surface the tRPC message (cap/ownership).
								toast.error(err?.message ?? t('desktop.widgets.app-widget.error'))
							}
						}}
						className='group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 transition-all hover:border-white/25 hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/5'
					>
						<div className='flex h-16 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/40 backdrop-blur-sm'>
							{aw.icon ? (
								<img src={aw.icon} alt='' className='h-8 w-8 rounded-lg object-cover' />
							) : (
								<span className='text-xl'>🧩</span>
							)}
						</div>
						<div className='flex flex-col items-center gap-0.5'>
							<span className='max-w-full truncate text-xs font-medium text-white/90'>{aw.title}</span>
							<span className='max-w-full truncate text-[9px] text-white/40'>{aw.appName}</span>
						</div>
					</button>
				))}
			</div>
		</div>
	)
}

export function WidgetPickerDialog({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent className='max-w-md border-white/30 bg-gray-900/90 backdrop-blur-xl sm:max-w-lg'>
					<DialogHeader>
						<DialogTitle className='text-white'>Add Widget</DialogTitle>
					</DialogHeader>
					<div className='grid grid-cols-2 gap-3 py-2 sm:grid-cols-3'>
						{WIDGET_CATALOG.map((entry) => {
							const size = WIDGET_SIZES[entry.size]
							return (
								<button
									key={entry.type}
									onClick={() => {
										const widget = {id: createWidgetId(entry.type), type: entry.type as WidgetType}
										addDesktopWidget(widget)
										onOpenChange(false)
									}}
									className='group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 transition-all hover:border-white/25 hover:bg-white/10 active:scale-95'
								>
									{/* Preview */}
									<div className='flex h-16 w-full items-center justify-center rounded-xl border border-white/10 bg-white/40 backdrop-blur-sm'>
										<WidgetPreviewMini type={entry.type} />
									</div>
									{/* Icon + Name */}
									<div className='flex flex-col items-center gap-0.5'>
										<span className='text-lg leading-none'>{entry.icon}</span>
										<span className='text-xs font-medium text-white/90'>{entry.name}</span>
										<span className='text-[9px] text-white/40'>{size.label}</span>
									</div>
								</button>
							)
						})}
					</div>
					{/* Phase 345-02: manifest-declared app widgets (self-hides when none). */}
					<AppWidgetsSection onOpenChange={onOpenChange} />
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
