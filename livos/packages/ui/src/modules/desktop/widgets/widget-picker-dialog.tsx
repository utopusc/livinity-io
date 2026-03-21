import {Dialog, DialogPortal, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'

import {WIDGET_CATALOG, WIDGET_SIZES, WidgetType, createWidgetId} from './widget-types'
import {addDesktopWidget} from '../desktop-content'

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
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
